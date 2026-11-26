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
