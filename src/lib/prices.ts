import type { FxSeries, RawQuote } from './types';

/**
 * Fiyatlar Yahoo Finance'in herkese açık grafik uç noktasından alınır (anahtar gerektirmez).
 * Not: Bu resmi bir API değildir; uygulama yayına çıkmadan önce lisanslı bir veri sağlayıcıya
 * geçmek düşünülmeli. Sağlayıcı değişirse yalnızca bu dosya değişir.
 */
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const TIMEOUT_MS = 10_000;

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string>; method?: string; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}>;

/** Yahoo "chart" yanıtından fiyatı çıkarır; beklenmeyen biçimde null döner. */
export function parseYahooChart(json: unknown, now: number = Date.now()): RawQuote | null {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    { meta?: Record<string, unknown> } | undefined;
  const meta = result?.meta;
  if (!meta) return null;
  const price = meta.regularMarketPrice;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
  const prev = [meta.chartPreviousClose, meta.previousClose].find(
    (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
  );
  const name = [meta.longName, meta.shortName].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return { price, previousClose: prev, name: name?.trim(), fetchedAt: now };
}

// ---------------------------------------------------------------------------
// Web sürümü (GitHub Pages): Yahoo, Borsa İstanbul ve TCMB tarayıcıdan erişime (CORS) izin vermediği için
// GitHub saatte bir bu verileri çekip sitenin yanına koyar (scripts/build-web-data.ts). Derlemede
// EXPO_PUBLIC_WEB_DATA verilirse (ör. "/appstore/data") fiyatlar bu dosyalardan okunur; telefondaki
// uygulamada bu değer yoktur ve veriler doğrudan kaynaklarından gelir. Kripto (CoinGecko) her zaman canlı.

export const WEB_DATA_BASE: string | null = process.env.EXPO_PUBLIC_WEB_DATA || null;

/** Geçmiş dosyasının adı: "USDTRY=X" → "USDTRY_X", "^SP500TR" → "_SP500TR". */
export function webDataFileName(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9.-]/g, '_');
}

export interface WebQuotesFile {
  generatedAt: number;
  quotes: Record<string, RawQuote>;
}

export interface WebBenchFile {
  generatedAt: number;
  /** "XU100_CFNNTLTL" (BIST 100 getiri endeksi) ve "CPI" (TÜFE endeksi). */
  series: Record<string, FxSeries>;
}

const WEB_TTL_MS = 10 * 60 * 1000;
const webCache = new Map<string, { at: number; data: Promise<unknown> }>();

/** Web veri dosyası; 10 dakika bellekte tutulur. */
function webJson<T>(name: string, fetchFn: FetchLike): Promise<T> {
  const hit = webCache.get(name);
  if (hit && Date.now() - hit.at < WEB_TTL_MS) return hit.data as Promise<T>;
  const data = fetchWithTimeout(fetchFn, `${WEB_DATA_BASE}/${name}`, 20_000).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  webCache.set(name, { at: Date.now(), data });
  data.catch(() => webCache.delete(name));
  return data as Promise<T>;
}

async function webQuotes(symbols: string[], fetchFn: FetchLike): Promise<Record<string, RawQuote>> {
  const { quotes } = await webJson<WebQuotesFile>('quotes.json', fetchFn);
  return Object.fromEntries(symbols.filter((s) => quotes[s]).map((s) => [s, quotes[s]]));
}

async function webBench(key: string, fetchFn: FetchLike): Promise<FxSeries> {
  const { series } = await webJson<WebBenchFile>('bench.json', fetchFn);
  if (!series?.[key]) throw new Error(`${key} verisi yok`);
  return series[key];
}

async function fetchWithTimeout(fetchFn: FetchLike, url: string, timeoutMs = TIMEOUT_MS, accept = 'application/json') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { signal: controller.signal, headers: { Accept: accept } });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchQuote(
  symbol: string,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<RawQuote> {
  if (WEB_DATA_BASE) {
    const q = (await webQuotes([symbol], fetchFn))[symbol];
    if (!q) throw new Error(`Sembol bulunamadı: ${symbol}`);
    return q;
  }
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  let lastError: unknown;
  for (const host of HOSTS) {
    try {
      const res = await fetchWithTimeout(fetchFn, host + path);
      if (res.status === 404) throw new Error(`Sembol bulunamadı: ${symbol}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const quote = parseYahooChart(await res.json());
      if (!quote) throw new Error(`Fiyat bulunamadı: ${symbol}`);
      return quote;
    } catch (e) {
      lastError = e;
      if (e instanceof Error && e.message.startsWith('Sembol bulunamadı')) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface FetchQuotesResult {
  quotes: Record<string, RawQuote>;
  failed: string[];
}

export async function fetchQuotes(
  symbols: string[],
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<FetchQuotesResult> {
  const results = await Promise.allSettled(symbols.map((s) => fetchQuote(s, fetchFn)));
  const quotes: Record<string, RawQuote> = {};
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') quotes[symbols[i]] = r.value;
    else failed.push(symbols[i]);
  });
  return { quotes, failed };
}

/**
 * Yahoo günlük grafik yanıtından kur geçmişini çıkarır. Tarihler borsanın yerel saatine göre
 * (gmtoffset) hesaplanır; boş günler atlanır.
 */
export function parseYahooHistory(json: unknown, now: number = Date.now()): FxSeries | null {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | {
        meta?: { gmtoffset?: number };
        timestamp?: unknown[];
        indicators?: { quote?: { close?: unknown[] }[] };
      }
    | undefined;
  const ts = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return null;
  const offset = typeof result?.meta?.gmtoffset === 'number' ? result.meta.gmtoffset : 0;
  const byDate = new Map<string, number>();
  ts.forEach((t, i) => {
    const c = closes[i];
    if (typeof t !== 'number' || typeof c !== 'number' || !Number.isFinite(c) || c <= 0) return;
    byDate.set(new Date((t + offset) * 1000).toISOString().slice(0, 10), c);
  });
  if (byDate.size === 0) return null;
  const dates = [...byDate.keys()].sort();
  return { dates, rates: dates.map((d) => byDate.get(d)!), fetchedAt: now };
}

/** En eski işlem tarihini kapsayan en kısa Yahoo aralığı. */
export function historyRange(earliestDate: string, now: Date = new Date()): string {
  const years = (now.getTime() - new Date(earliestDate).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years <= 0.95) return '1y';
  if (years <= 1.95) return '2y';
  if (years <= 4.95) return '5y';
  if (years <= 9.95) return '10y';
  return 'max';
}

export async function fetchHistory(
  symbol: string,
  range: string,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<FxSeries> {
  if (WEB_DATA_BASE) return webJson<FxSeries>(`history/${webDataFileName(symbol)}.json`, fetchFn);
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  let lastError: unknown;
  for (const host of HOSTS) {
    try {
      const res = await fetchWithTimeout(fetchFn, host + path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const series = parseYahooHistory(await res.json());
      if (!series) throw new Error(`Geçmiş bulunamadı: ${symbol}`);
      return series;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ---------------------------------------------------------------------------
// Toplu fiyat (piyasa listesi için)

const SPARK_CHUNK = 20;

function lastNumber(values: unknown): number | undefined {
  if (!Array.isArray(values)) return undefined;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
}

function positive(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * Yahoo "spark" yanıtını çözer. İki biçimi de destekler:
 * - v7: { spark: { result: [{ symbol, response: [{ meta: {...} }] }] } }
 * - v8: { "THYAO.IS": { close: [...], chartPreviousClose, previousClose } }
 */
export function parseYahooSpark(json: unknown, now: number = Date.now()): Record<string, RawQuote> {
  const out: Record<string, RawQuote> = {};
  const results = (json as { spark?: { result?: unknown[] } })?.spark?.result;
  if (Array.isArray(results)) {
    for (const r of results as { symbol?: string; response?: unknown[] }[]) {
      if (!r?.symbol) continue;
      const q = parseYahooChart({ chart: { result: r.response } }, now);
      if (q) out[r.symbol] = q;
    }
    return out;
  }
  if (json && typeof json === 'object') {
    for (const [symbol, v] of Object.entries(json as Record<string, unknown>)) {
      const item = v as { close?: unknown; chartPreviousClose?: unknown; previousClose?: unknown } | null;
      const price = lastNumber(item?.close);
      if (!price) continue;
      out[symbol] = {
        price,
        previousClose: positive(item?.chartPreviousClose) ?? positive(item?.previousClose),
        fetchedAt: now,
      };
    }
  }
  return out;
}

async function fetchSpark(symbols: string[], fetchFn: FetchLike): Promise<Record<string, RawQuote>> {
  const path = `/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(','))}&range=1d&interval=1d`;
  for (const host of HOSTS) {
    try {
      const res = await fetchWithTimeout(fetchFn, host + path);
      if (!res.ok) continue;
      return parseYahooSpark(await res.json());
    } catch {
      // bir sonraki sunucuyu dene
    }
  }
  return {};
}

/**
 * Çok sayıda sembolün fiyatını 20'li gruplar halinde çeker. Toplu istekte gelmeyenler için
 * (en fazla `fallbackLimit` tane) tek tek grafik isteğine düşer.
 */
export async function fetchQuotesBatched(
  symbols: string[],
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  fallbackLimit = 30,
): Promise<Record<string, RawQuote>> {
  const unique = [...new Set(symbols)];
  if (WEB_DATA_BASE) return webQuotes(unique, fetchFn);
  const out: Record<string, RawQuote> = {};
  for (let i = 0; i < unique.length; i += SPARK_CHUNK) {
    Object.assign(out, await fetchSpark(unique.slice(i, i + SPARK_CHUNK), fetchFn));
  }
  const missing = unique.filter((s) => !out[s]).slice(0, fallbackLimit);
  // Aynı anda en fazla 4 tekil istek.
  for (let i = 0; i < missing.length; i += 4) {
    const part = missing.slice(i, i + 4);
    const settled = await Promise.allSettled(part.map((s) => fetchQuote(s, fetchFn)));
    settled.forEach((r, k) => {
      if (r.status === 'fulfilled') out[part[k]] = r.value;
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Kripto: CoinGecko (coin kimliğiyle; aynı kısaltmalı coinler karışmaz)

const COINGECKO = 'https://api.coingecko.com/api/v3/simple/price';
const CG_CHUNK = 100;

/** CoinGecko simple/price yanıtını "CG:<kimlik>" anahtarlı fiyatlara çevirir. */
export function parseCoinGecko(json: unknown, now: number = Date.now()): Record<string, RawQuote> {
  const out: Record<string, RawQuote> = {};
  if (!json || typeof json !== 'object') return out;
  for (const [id, v] of Object.entries(json as Record<string, { usd?: unknown; usd_24h_change?: unknown }>)) {
    const price = positive(v?.usd);
    if (!price) continue;
    const change =
      typeof v.usd_24h_change === 'number' && Number.isFinite(v.usd_24h_change) ? v.usd_24h_change : undefined;
    // 24 saatlik değişimden "önceki fiyat" çıkarılır; günlük değişim gösterimi için yeterli.
    out[`CG:${id}`] = {
      price,
      previousClose: change != null && change > -100 ? price / (1 + change / 100) : undefined,
      fetchedAt: now,
    };
  }
  return out;
}

export async function fetchCoinGecko(
  ids: string[],
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<Record<string, RawQuote>> {
  const out: Record<string, RawQuote> = {};
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += CG_CHUNK) {
    const part = unique.slice(i, i + CG_CHUNK);
    try {
      const res = await fetchWithTimeout(
        fetchFn,
        `${COINGECKO}?ids=${encodeURIComponent(part.join(','))}&vs_currencies=usd&include_24hr_change=true`,
      );
      if (res.ok) Object.assign(out, parseCoinGecko(await res.json()));
    } catch {
      // ağ hatası: bu grup atlanır
    }
  }
  return out;
}

/** "CG:" anahtarlarını CoinGecko'dan, diğerlerini Yahoo'dan (20'li gruplar) çeker. */
export async function fetchAnyQuotes(
  keys: string[],
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  fallbackLimit = 30,
): Promise<Record<string, RawQuote>> {
  const cg = keys.filter((k) => k.startsWith('CG:')).map((k) => k.slice(3));
  const eb = keys.filter((k) => k.startsWith('EB:'));
  const tf = keys.filter((k) => k.startsWith('TEFAS:'));
  const yahoo = keys.filter((k) => !k.startsWith('CG:') && !k.startsWith('EB:') && !k.startsWith('TEFAS:'));
  const [a, b, e, t] = await Promise.all([
    cg.length ? fetchCoinGecko(cg, fetchFn) : Promise.resolve({}),
    yahoo.length ? fetchQuotesBatched(yahoo, fetchFn, fallbackLimit) : Promise.resolve({}),
    eb.length ? fetchEurobondQuotes(eb, fetchFn).catch(() => ({})) : Promise.resolve({}),
    tf.length ? fetchTefasQuotes(tf, fetchFn).catch(() => ({})) : Promise.resolve({}),
  ]);
  return { ...a, ...b, ...e, ...t };
}

// ---------------------------------------------------------------------------
// Eurobond: T.C. Hazine eurobondlarının günlük fiyatları, Ziraat Bankası'nın eurobond sayfasındaki
// tablodan (ISIN, vade, döviz, alış/satış fiyatı ve getirisi). Değer için bankanın alış fiyatı
// (elindekini satsan alacağın fiyat) kullanılır. Anahtar: "EB:<ISIN>".

const ZIRAAT_EUROBOND = 'https://www.ziraatbank.com.tr/tr/bireysel/yatirim/eurobond';

/** Ziraat eurobond tablosundan fiyatlar: alış fiyatı (100 nominal başına) ve alış getirisi. */
export function parseZiraatEurobonds(html: string, now: number = Date.now()): Record<string, RawQuote> {
  const out: Record<string, RawQuote> = {};
  const num = (v: string | undefined) => Number((v ?? '').replace(/\./g, '').replace(',', '.'));
  const cell = (c: string) =>
    c
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(cell);
    if (cells.length < 6 || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(cells[0])) continue;
    const price = num(cells[4]);
    const yieldPct = num(cells[5]);
    if (!(price > 0)) continue;
    out[`EB:${cells[0]}`] = { price, fetchedAt: now, ...(Number.isFinite(yieldPct) ? { yieldPct } : {}) };
  }
  return out;
}

let eurobondCache: { at: number; data: Promise<Record<string, RawQuote>> } | null = null;

/** Eurobond fiyatları ("EB:<ISIN>" anahtarlarıyla); sayfa 10 dakika bellekte tutulur. */
export async function fetchEurobondQuotes(
  keys: string[],
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<Record<string, RawQuote>> {
  if (WEB_DATA_BASE) return webQuotes(keys, fetchFn);
  if (!eurobondCache || Date.now() - eurobondCache.at > WEB_TTL_MS) {
    const data = fetchWithTimeout(fetchFn, ZIRAAT_EUROBOND, 20_000, 'text/html').then(async (res) => {
      if (!res.ok || !res.text) throw new Error(`HTTP ${res.status}`);
      const quotes = parseZiraatEurobonds(await res.text());
      if (Object.keys(quotes).length === 0) throw new Error('Eurobond tablosu okunamadı');
      return quotes;
    });
    eurobondCache = { at: Date.now(), data };
    data.catch(() => {
      eurobondCache = null;
    });
  }
  const all = await eurobondCache.data;
  return Object.fromEntries(keys.filter((k) => all[k]).map((k) => [k, all[k]]));
}

// ---------------------------------------------------------------------------
// Enflasyon: TÜİK TÜFE. Asıl kaynak TCMB'nin enflasyon sayfası (anahtarsız, güncel; 2005'ten bu yana aylık
// % değişimler). Aylık değişimler art arda çarpılarak endeks kurulur. Alınamazsa OECD'deki endekse düşülür.

const TCMB_CPI = 'https://www.tcmb.gov.tr/wps/wcm/connect/tr/tcmb+tr/main+menu/istatistikler/enflasyon+verileri';

/** TCMB enflasyon tablosundan ay → TÜFE aylık % değişim ("2026-10" → 2,58), eskiden yeniye. */
export function parseTcmbCpiHtml(html: string): { month: string; pct: number }[] {
  const out = new Map<string, number>();
  const cell = (c: string) =>
    c
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(cell);
    const m = cells[0]?.match(/^(\d{1,2})-(\d{4})$/);
    if (!m || cells.length < 3) continue;
    const month = Number(m[1]);
    const pct = Number(cells[2].replace('%', '').replace(',', '.'));
    if (month < 1 || month > 12 || !Number.isFinite(pct) || cells[2] === '') continue;
    out.set(`${m[2]}-${String(month).padStart(2, '0')}`, pct);
  }
  return [...out.keys()].sort().map((month) => ({ month, pct: out.get(month)! }));
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Aylık % değişimlerden endeks: ilk değişimden önceki ay 100, her ay bir öncekinin (1 + değişim) katı.
 * Aylar kesintisiz olmalı; araya boşluk girerse orada durulur.
 */
export function cpiFromMonthlyChanges(
  changes: { month: string; pct: number }[],
  now: number = Date.now(),
): FxSeries | null {
  if (changes.length === 0) return null;
  const dates = [`${prevMonth(changes[0].month)}-01`];
  const rates = [100];
  let expected = changes[0].month;
  for (const { month, pct } of changes) {
    if (month !== expected) break;
    dates.push(`${month}-01`);
    rates.push(rates[rates.length - 1] * (1 + pct / 100));
    expected = nextMonth(month);
  }
  return dates.length > 1 ? { dates, rates, fetchedAt: now } : null;
}

async function fetchTcmbCpi(fetchFn: FetchLike): Promise<FxSeries> {
  const res = await fetchWithTimeout(fetchFn, TCMB_CPI, 20_000, 'text/html');
  if (!res.ok || !res.text) throw new Error(`HTTP ${res.status}`);
  const series = cpiFromMonthlyChanges(parseTcmbCpiHtml(await res.text()));
  if (!series) throw new Error('TCMB enflasyon tablosu okunamadı');
  return series;
}

// Yedek: OECD istatistik servisindeki TÜFE endeksi (2015=100; şu an Aralık 2025'te bitiyor)

const OECD_CPI = 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,/TUR.M.N.CPI.IX._T.N._Z';

/** OECD CSV yanıtından aylık TÜFE serisi; tarihler ayın ilk günü ("2025-12-01"). */
export function parseOecdCpiCsv(text: string, now: number = Date.now()): FxSeries | null {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const head = lines[0].split(',');
  const ti = head.indexOf('TIME_PERIOD');
  const vi = head.indexOf('OBS_VALUE');
  if (ti < 0 || vi < 0) return null;
  const points = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const period = cells[ti];
    const value = Number(cells[vi]);
    if (/^\d{4}-\d{2}$/.test(period ?? '') && Number.isFinite(value) && value > 0) points.set(`${period}-01`, value);
  }
  if (points.size === 0) return null;
  const dates = [...points.keys()].sort();
  return { dates, rates: dates.map((d) => points.get(d)!), fetchedAt: now };
}

/**
 * TÜFE endeksi: önce TCMB (güncel), olmazsa OECD. startYear yalnız OECD isteğinde kullanılır.
 * TCMB sitesi tarayıcıdan erişime (CORS) izin vermediği için web sürümü tcmb: false ile çağırır.
 */
export async function fetchTurkeyCpi(
  startYear: number,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  { tcmb = true }: { tcmb?: boolean } = {},
): Promise<FxSeries> {
  if (WEB_DATA_BASE) return webBench('CPI', fetchFn);
  if (tcmb) {
    try {
      const series = await fetchTcmbCpi(fetchFn);
      if (series.dates[0] <= `${startYear}-01-01`) return series;
    } catch {
      // OECD'ye düşülür.
    }
  }
  return fetchOecdCpi(startYear, fetchFn);
}

async function fetchOecdCpi(startYear: number, fetchFn: FetchLike): Promise<FxSeries> {
  const url = `${OECD_CPI}?startPeriod=${startYear}-01&dimensionAtObservation=AllDimensions&format=csvfile`;
  let lastError: unknown;
  // Servis ara sıra 5xx dönüyor; bir kez daha denenir.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(fetchFn, url);
      if (!res.ok || !res.text) throw new Error(`HTTP ${res.status}`);
      const series = parseOecdCpiCsv(await res.text());
      if (!series) throw new Error('TÜFE verisi okunamadı');
      return series;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Borsa İstanbul endeksleri: sitenin kendi grafik verisi. BIST 100 getiri endeksi (XU100_CFNNTLTL,
// net temettüler endekse geri yatırılmış sayılır) Yahoo'da yok, buradan alınır.
//  • current-before: anlık değer ve bir önceki kapanış (küçük)
//  • endeks-graphic: 1997'den bugüne günlük kapanışlar (~500 KB) → yalnız yeni kapanış çıkınca çekilir

const BIST_GRAPHIC = 'https://borsaistanbul.com/graphic.php';
export const BIST100_TR_CODE = 'XU100_CFNNTLTL';

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

/** Günlük kapanışlar; fromDate'ten (dahil) sonrası, eskiden yeniye. */
export function parseBistIndexHistory(json: unknown, fromDate: string, now: number = Date.now()): FxSeries | null {
  const rows = (json as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return null;
  const byDate = new Map<string, number>();
  for (const r of rows as { hisTs?: unknown; clval?: unknown }[]) {
    const v = Number(r?.clval);
    if (!isDay(r?.hisTs) || !(v > 0)) continue;
    const d = r.hisTs.slice(0, 10);
    if (d >= fromDate) byDate.set(d, v);
  }
  if (byDate.size === 0) return null;
  const dates = [...byDate.keys()].sort();
  return { dates, rates: dates.map((d) => byDate.get(d)!), fetchedAt: now };
}

interface BistPoint {
  date: string;
  value: number;
}

/** Anlık değer ve önceki kapanış. */
export function parseBistIndexCurrent(json: unknown): { current?: BistPoint; before?: BistPoint } | null {
  const data = (json as { data?: Record<string, { value?: unknown; lastCalculatedDate?: unknown }> })?.data;
  if (!data || typeof data !== 'object') return null;
  const point = (p?: { value?: unknown; lastCalculatedDate?: unknown }): BistPoint | undefined => {
    const v = Number(p?.value);
    return isDay(p?.lastCalculatedDate) && v > 0 ? { date: p.lastCalculatedDate.slice(0, 10), value: v } : undefined;
  };
  const out = { current: point(data.current), before: point(data.before) };
  return out.current || out.before ? out : null;
}

function withPoint(series: FxSeries, p: BistPoint): FxSeries {
  const dates = [...series.dates];
  const rates = [...series.rates];
  const i = dates.indexOf(p.date);
  if (i >= 0) rates[i] = p.value;
  else if (dates.length === 0 || p.date > dates[dates.length - 1]) {
    dates.push(p.date);
    rates.push(p.value);
  }
  return { ...series, dates, rates };
}

/**
 * Borsa İstanbul endeksinin fromDate'i kapsayan (10 gün öncesinden başlayan) serisi; son nokta anlık değerdir.
 * Elde yeterli seri varsa büyük geçmiş dosyası yalnız yeni bir kapanış açıklandığında yeniden indirilir.
 */
export async function fetchBistIndex(
  code: string,
  fromDate: string,
  cached?: FxSeries,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<FxSeries> {
  if (WEB_DATA_BASE) return webBench(code, fetchFn);
  const url = (tur: string) => `${BIST_GRAPHIC}?veriTuru=${tur}&indexCode=${encodeURIComponent(code)}`;
  let live: ReturnType<typeof parseBistIndexCurrent> = null;
  try {
    const res = await fetchWithTimeout(fetchFn, url('current-before'));
    if (res.ok) live = parseBistIndexCurrent(await res.json());
  } catch {
    // Anlık değer gelmese de geçmişle devam edilir.
  }

  // fromDate tatile denk gelse de önceki kapanış bilinsin diye 10 gün öncesinden alınır.
  const start = new Date(Date.parse(fromDate) - 10 * 86_400_000).toISOString().slice(0, 10);
  const usable = cached && cached.dates.length > 0 && cached.dates[0] <= fromDate ? cached : undefined;
  const lastCached = usable?.dates[usable.dates.length - 1];
  let series: FxSeries | undefined = usable;
  if (!usable || (live?.before && lastCached! < live.before.date)) {
    try {
      const res = await fetchWithTimeout(fetchFn, url('endeks-graphic'), 30_000);
      if (res.ok) series = parseBistIndexHistory(await res.json(), start) ?? series;
    } catch {
      // Geçmiş inmezse eldeki seriyle devam edilir.
    }
  }
  if (!series) throw new Error(`${code} endeks verisi alınamadı`);
  if (live?.before) series = withPoint(series, live.before);
  if (live?.current) series = withPoint(series, live.current);
  return { ...series, fetchedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// TEFAS ve BES fon fiyatları: TEFAS'ın açık fon servisi (2026'da eski servisin yerine geldi; giriş
// gerektirmez). Tek istekte bir fon türündeki bütün fonların ya da tek fonun tarih aralığındaki günlük
// fiyatlarını verir. Anahtar: "TEFAS:YAT:<kod>" (yatırım fonu) ve "TEFAS:EMK:<kod>" (BES).

const TEFAS_API = 'https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir';
export type TefasType = 'YAT' | 'EMK';
/** Bu kadar ya da daha az fon için fon başına küçük istek, fazlası için toplu istek. */
const TEFAS_PER_FUND_LIMIT = 12;
const TEFAS_TTL_MS = 30 * 60 * 1000;

interface TefasRow {
  code: string;
  date: string;
  price: number;
}

/** TEFAS yanıtındaki satırlar (fon kodu, tarih "YYYY-AA-GG", fiyat). */
export function parseTefasRows(json: unknown): TefasRow[] {
  const list = (json as { resultList?: unknown })?.resultList;
  if (!Array.isArray(list)) return [];
  const out: TefasRow[] = [];
  for (const r of list as { fonKodu?: unknown; tarih?: unknown; fiyat?: unknown }[]) {
    const price = Number(r?.fiyat);
    if (typeof r?.fonKodu !== 'string' || typeof r.tarih !== 'string' || !(price > 0)) continue;
    out.push({ code: r.fonKodu, date: r.tarih.slice(0, 10), price });
  }
  return out;
}

/** Her fonun son iki günü: son fiyat ve bir önceki günün fiyatı (günlük değişim için). */
export function tefasQuotes(rows: TefasRow[], type: TefasType, now: number = Date.now()): Record<string, RawQuote> {
  const byCode = new Map<string, TefasRow[]>();
  for (const r of rows) {
    const list = byCode.get(r.code);
    if (list) list.push(r);
    else byCode.set(r.code, [r]);
  }
  const out: Record<string, RawQuote> = {};
  for (const [code, list] of byCode) {
    list.sort((a, b) => (a.date < b.date ? 1 : -1));
    out[`TEFAS:${type}:${code}`] = { price: list[0].price, previousClose: list[1]?.price, fetchedAt: now };
  }
  return out;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function tefasPost(
  fetchFn: FetchLike,
  type: TefasType,
  code: string | null,
  from: Date,
  to: Date,
): Promise<TefasRow[]> {
  const body = {
    fonTipi: type,
    fonKodu: code,
    aramaMetni: null,
    fonTurKod: null,
    fonGrubu: null,
    sfonTurKod: null,
    fonTurAciklama: null,
    kurucuKod: null,
    basTarih: ymd(from),
    bitTarih: ymd(to),
    basSira: 1,
    bitSira: 100000,
    dil: 'TR',
    sFonTurKod: '',
    fonKod: '',
    fonGrup: '',
    fonUnvanTip: '',
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetchFn(TEFAS_API, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseTefasRows(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

const tefasBulkCache = new Map<TefasType, { at: number; data: Promise<Record<string, RawQuote>> }>();
/** Son işlem günlerini bulmak için sorulan, uzun süredir işlem gören büyük fonlar. */
const TEFAS_PROBES: Record<TefasType, string[]> = { YAT: ['TTE', 'AFT', 'AAL'], EMK: ['AE1', 'ABE', 'AH1'] };

/**
 * Bir türdeki bütün fonların son iki işlem günü fiyatı. Önce bir fonun son günleri sorulup son iki işlem
 * günü bulunur, sonra yalnız o iki günün bütün fiyatları istenir (tatil ve hafta sonları atlanır).
 */
function tefasBulk(type: TefasType, probe: string, fetchFn: FetchLike, now: Date): Promise<Record<string, RawQuote>> {
  const hit = tefasBulkCache.get(type);
  if (hit && Date.now() - hit.at < TEFAS_TTL_MS) return hit.data;
  const data = (async () => {
    let dates: string[] = [];
    // İstenen fon TEFAS'ta işlem görmüyorsa bilinen büyük fonlarla denenir.
    for (const code of [probe, ...TEFAS_PROBES[type].filter((c) => c !== probe)]) {
      const days = await tefasPost(fetchFn, type, code, new Date(now.getTime() - 14 * 86_400_000), now).catch(() => []);
      dates = [...new Set(days.map((r) => r.date))].sort().reverse();
      if (dates.length) break;
    }
    if (dates.length === 0) throw new Error('TEFAS fiyatı yok');
    const last = new Date(`${dates[0]}T00:00:00Z`);
    const prev = new Date(`${dates[1] ?? dates[0]}T00:00:00Z`);
    return tefasQuotes(await tefasPost(fetchFn, type, null, prev, last), type);
  })();
  tefasBulkCache.set(type, { at: Date.now(), data });
  data.catch(() => tefasBulkCache.delete(type));
  return data;
}

/** TEFAS ve BES fon fiyatları ("TEFAS:YAT:<kod>", "TEFAS:EMK:<kod>" anahtarlarıyla). */
export async function fetchTefasQuotes(
  keys: string[],
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  now: Date = new Date(),
): Promise<Record<string, RawQuote>> {
  if (WEB_DATA_BASE) return webQuotes(keys, fetchFn);
  const groups = new Map<TefasType, string[]>();
  for (const k of keys) {
    const [, type, code] = k.split(':');
    if ((type !== 'YAT' && type !== 'EMK') || !code) continue;
    const list = groups.get(type);
    if (list) list.push(code);
    else groups.set(type, [code]);
  }
  const out: Record<string, RawQuote> = {};
  for (const [type, codes] of groups) {
    const unique = [...new Set(codes)];
    if (unique.length <= TEFAS_PER_FUND_LIMIT && !tefasBulkCache.has(type)) {
      // Portföydeki birkaç fon: fon başına son iki haftanın fiyatları (en fazla 4 istek aynı anda)
      const from = new Date(now.getTime() - 14 * 86_400_000);
      for (let i = 0; i < unique.length; i += 4) {
        const part = unique.slice(i, i + 4);
        const settled = await Promise.allSettled(part.map((c) => tefasPost(fetchFn, type, c, from, now)));
        settled.forEach((r) => {
          if (r.status === 'fulfilled') Object.assign(out, tefasQuotes(r.value, type));
        });
      }
    } else {
      const all = await tefasBulk(type, unique[0], fetchFn, now);
      for (const c of unique) {
        const k = `TEFAS:${type}:${c}`;
        if (all[k]) out[k] = all[k];
      }
    }
  }
  return out;
}

/** Bir türdeki bütün fonların fiyatı (web sürümünün saatlik verisi için). */
export async function fetchAllTefasQuotes(
  type: TefasType,
  probe: string,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<Record<string, RawQuote>> {
  return tefasBulk(type, probe, fetchFn, new Date());
}
