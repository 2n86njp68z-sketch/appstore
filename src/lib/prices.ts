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
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
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

async function fetchWithTimeout(fetchFn: FetchLike, url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchQuote(
  symbol: string,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<RawQuote> {
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
  const yahoo = keys.filter((k) => !k.startsWith('CG:'));
  const [a, b] = await Promise.all([
    cg.length ? fetchCoinGecko(cg, fetchFn) : Promise.resolve({}),
    yahoo.length ? fetchQuotesBatched(yahoo, fetchFn, fallbackLimit) : Promise.resolve({}),
  ]);
  return { ...a, ...b };
}

// ---------------------------------------------------------------------------
// Enflasyon: TÜİK TÜFE (aylık endeks, 2015=100), OECD istatistik servisi üzerinden

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

export async function fetchTurkeyCpi(
  startYear: number,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<FxSeries> {
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
