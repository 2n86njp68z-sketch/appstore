import type { RawQuote } from './types';

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
