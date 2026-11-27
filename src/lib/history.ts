import { quoteSymbolFor } from './assets';
import { fetchHistory, historyRange, parseTefasRows, WEB_DATA_BASE, type FetchLike } from './prices';
import type { FxSeries, Transaction } from './types';

/**
 * Portföy grafiği için varlıkların günlük kapanış geçmişi. Anahtar fiyat kaynağının sembolüdür
 * ("THYAO.IS", "CG:bitcoin", "TEFAS:EMK:ABE"). Emtiada kontrat (ör. "GC=F", dolar) geçmişi tutulur.
 *
 * - Yahoo (hisse, ETF, döviz, emtia): tek istekte, en eski işlemi kapsayan aralık.
 * - CoinGecko (kripto): son 365 gün (ücretsiz erişimin sınırı); öncesi işlem fiyatlarıyla doldurulur.
 * - TEFAS (fon, BES): sitenin sınırı bir istekte 1 ay olduğu için aylık parçalarla; sonra yalnız yeni
 *   günler eklenir.
 * - Eurobond ve elle fiyatlananlar: geçmiş yok, grafik işlem fiyatlarıyla doldurulur.
 *
 * Web sürümünde tarayıcı Yahoo ve TEFAS'a erişemediği için yalnız kripto geçmişi çekilir.
 */
export type PriceHistory = Record<string, FxSeries & { from?: string }>;

export const PRICE_HISTORY_TTL_MS = 12 * 60 * 60 * 1000;
const DAY = 86_400_000;
const CG_MAX_DAYS = 365;
/** Bu kadar fondan fazlasının geçmişi çekilmez (her biri aylık birçok istek). */
const TEFAS_MAX_FUNDS = 8;

/** Bir varlığın geçmişinin tutulduğu sembol; geçmişi olmayanlarda undefined. */
export function historySymbolFor(kind: Transaction['kind'], symbol: string): string | undefined {
  if (kind === 'eurobond' || kind === 'other') return undefined;
  return quoteSymbolFor(kind, symbol) ?? undefined;
}

/** Varlıklar, geçmiş sembolleri ve gereken en eski tarih. */
export function historyNeeds(transactions: Transaction[]): Map<string, string> {
  const need = new Map<string, string>();
  for (const t of transactions) {
    const sym = historySymbolFor(t.kind, t.symbol);
    if (!sym) continue;
    const from = need.get(sym);
    if (!from || t.date < from) need.set(sym, t.date);
  }
  return need;
}

/** CoinGecko market_chart yanıtı → günlük seri (UTC günü, günün son değeri). */
export function parseCoinGeckoChart(json: unknown, now: number = Date.now()): FxSeries | null {
  const prices = (json as { prices?: unknown })?.prices;
  if (!Array.isArray(prices)) return null;
  const byDate = new Map<string, number>();
  for (const p of prices) {
    if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !(p[1] > 0)) continue;
    byDate.set(new Date(p[0]).toISOString().slice(0, 10), p[1]);
  }
  if (byDate.size === 0) return null;
  const dates = [...byDate.keys()].sort();
  return { dates, rates: dates.map((d) => byDate.get(d)!), fetchedAt: now };
}

async function fetchCoinGeckoHistory(id: string, from: string, fetchFn: FetchLike): Promise<FxSeries> {
  const days = Math.min(CG_MAX_DAYS, Math.ceil((Date.now() - Date.parse(from)) / DAY) + 2);
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const series = parseCoinGeckoChart(await res.json());
  if (!series) throw new Error(`Geçmiş bulunamadı: ${id}`);
  return series;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/** TEFAS'ta tek fonun bir aralıktaki günlük fiyatları (aralık en çok 1 ay). */
async function tefasRange(fetchFn: FetchLike, type: string, code: string, from: Date, to: Date) {
  const res = await fetchFn('https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
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
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseTefasRows(await res.json()).filter((r) => r.code === code);
}

/** TEFAS fon geçmişi: [from, bugün] aylık (28 günlük) parçalarla; mevcut seri varsa yalnız sonrası. */
async function fetchTefasHistory(
  key: string,
  from: string,
  current: (FxSeries & { from?: string }) | undefined,
  fetchFn: FetchLike,
  now: Date,
): Promise<FxSeries> {
  const [, type, code] = key.split(':');
  const byDate = new Map<string, number>();
  let start = Date.parse(from);
  // Kayıtlı seri bu tarihten itibaren çekilmişse yalnız son günler istenir
  if (current && current.dates.length && current.from && current.from <= from) {
    current.dates.forEach((d, i) => byDate.set(d, current.rates[i]));
    start = Date.parse(current.dates[current.dates.length - 1]) - 3 * DAY;
  }
  for (let s = start; s <= now.getTime(); s += 28 * DAY) {
    const e = Math.min(s + 27 * DAY, now.getTime());
    for (const r of await tefasRange(fetchFn, type, code, new Date(s), new Date(e))) byDate.set(r.date, r.price);
  }
  if (byDate.size === 0) throw new Error(`Geçmiş bulunamadı: ${code}`);
  const dates = [...byDate.keys()].sort();
  return { dates, rates: dates.map((d) => byDate.get(d)!), fetchedAt: now.getTime() };
}

/**
 * Eksik ya da eskimiş geçmişleri çeker; değişiklik yoksa null. Hatalar sessizce atlanır (o varlık grafikte
 * işlem fiyatlarıyla doldurulur).
 */
export async function refreshPriceHistory(
  transactions: Transaction[],
  current: PriceHistory,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  now: Date = new Date(),
  /** Tarayıcıda çalışıyor mu (Yahoo ve TEFAS'a erişilemez). */
  web: boolean = !!WEB_DATA_BASE,
): Promise<PriceHistory | null> {
  if (transactions.length === 0) return null;
  const needs = historyNeeds(transactions);
  const next: PriceHistory = { ...current };
  let changed = false;
  let funds = 0;
  for (const [sym, from] of needs) {
    const isCg = sym.startsWith('CG:');
    const isTefas = sym.startsWith('TEFAS:');
    if (web && !isCg) continue;
    if (isTefas && ++funds > TEFAS_MAX_FUNDS) continue;
    const have = current[sym];
    const fresh = have && now.getTime() - have.fetchedAt < PRICE_HISTORY_TTL_MS && (have.from ?? '9999') <= from;
    if (fresh) continue;
    try {
      let series: FxSeries;
      if (isCg) series = await fetchCoinGeckoHistory(sym.slice(3), from, fetchFn);
      else if (isTefas) series = await fetchTefasHistory(sym, from, have, fetchFn, now);
      else series = await fetchHistory(sym, historyRange(from, now), fetchFn);
      next[sym] = { ...series, from };
      changed = true;
    } catch {
      // bu varlık işlem fiyatlarıyla çizilir
    }
  }
  // Artık portföyde olmayanları at
  for (const sym of Object.keys(next)) {
    if (!needs.has(sym)) {
      delete next[sym];
      changed = true;
    }
  }
  return changed ? next : null;
}
