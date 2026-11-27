/**
 * Web sürümünün (GitHub Pages) veri dosyalarını üretir. GitHub Actions saatte bir çalıştırır
 * (.github/workflows/pages.yml); tarayıcı Yahoo, Borsa İstanbul ve TCMB'ye doğrudan erişemediği için
 * web sürümü fiyatları bu dosyalardan okur.
 *
 *   data/quotes.json        Tüm listelerin (BIST, ABD, ETF, emtia, endeks, kur) son fiyatları
 *   data/history/*.json     Kur ve endeks geçmişleri (USD/TRY, EUR/TRY, BIST 100, S&P 500 TR)
 *   data/bench.json         BIST 100 getiri endeksi ve TÜFE endeksi
 *   data/meta.json          Üretim zamanı ve özet
 *
 * Kullanım: npx tsx scripts/build-web-data.ts <çıktı klasörü> [önceki quotes.json adresi]
 * Önceki adres verilirse bu turda alınamayan sembollerin son bilinen fiyatı korunur.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { EURTRY_SYMBOL, USDTRY_SYMBOL } from '../src/lib/assets';
import { BENCH_SYMBOLS } from '../src/lib/benchmarks';
import { MARKETS, type MarketKey } from '../src/lib/markets';
import { OVERVIEW } from '../src/lib/overview';
import {
  BIST100_TR_CODE,
  fetchBistIndex,
  fetchHistory,
  fetchQuotesBatched,
  fetchTurkeyCpi,
  webDataFileName,
  type WebBenchFile,
  type WebQuotesFile,
} from '../src/lib/prices';
import type { FxSeries, RawQuote } from '../src/lib/types';

const outDir = process.argv[2] ?? 'dist/data';
const previousUrl = process.argv[3];

const PRICED_MARKETS: MarketKey[] = ['bist', 'us', 'etf', 'metal'];
const HISTORY_SYMBOLS = [USDTRY_SYMBOL, EURTRY_SYMBOL, ...Object.values(BENCH_SYMBOLS)];
/** Aynı anda Yahoo'ya giden toplu istek sayısı. */
const PARALLEL = 4;

function allSymbols(): string[] {
  const set = new Set<string>();
  for (const key of PRICED_MARKETS) {
    for (const s of MARKETS[key].stocks) for (const k of MARKETS[key].quoteKeys(s.code)) set.add(k);
  }
  for (const group of Object.values(OVERVIEW)) for (const i of group.items) set.add(i.quoteKey);
  for (const s of HISTORY_SYMBOLS) set.add(s);
  return [...set];
}

async function fetchAll(symbols: string[]): Promise<Record<string, RawQuote>> {
  const size = Math.ceil(symbols.length / PARALLEL);
  const parts = Array.from({ length: PARALLEL }, (_, i) => symbols.slice(i * size, (i + 1) * size));
  const results = await Promise.all(parts.map((p) => fetchQuotesBatched(p, undefined, 0)));
  return Object.assign({}, ...results);
}

async function previousQuotes(): Promise<Record<string, RawQuote>> {
  if (!previousUrl) return {};
  try {
    const res = await fetch(previousUrl);
    if (!res.ok) return {};
    return ((await res.json()) as WebQuotesFile).quotes ?? {};
  } catch {
    return {};
  }
}

function write(name: string, data: unknown) {
  const path = join(outDir, name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
}

async function main() {
  const started = Date.now();
  const symbols = allSymbols();
  const [fresh, previous] = await Promise.all([fetchAll(symbols), previousQuotes()]);
  // Bu turda gelmeyenler: önceki sürümdeki son bilinen fiyat (kendi zaman damgasıyla)
  const quotes: Record<string, RawQuote> = {};
  let kept = 0;
  for (const s of symbols) {
    // Adlar uygulamanın kendi listelerinde var; dosya küçük kalsın diye yalnız fiyatlar yazılır.
    if (fresh[s]) quotes[s] = { price: fresh[s].price, previousClose: fresh[s].previousClose, fetchedAt: started };
    else if (previous[s]) {
      quotes[s] = previous[s];
      kept++;
    }
  }
  const freshCount = Object.keys(fresh).length;
  console.log(`Fiyat: ${freshCount}/${symbols.length} yeni, ${kept} önceki sürümden`);
  // Yahoo'ya hiç ulaşılamadıysa eski siteyi bozmamak için dur.
  if (freshCount < symbols.length * 0.5 && kept === 0) throw new Error('Fiyatların yarısından azı alınabildi');
  write('quotes.json', { generatedAt: started, quotes } satisfies WebQuotesFile);
  for (const s of symbols) delete quotes[s];

  let historyCount = 0;
  for (const sym of HISTORY_SYMBOLS) {
    try {
      const series = await fetchHistory(sym, '10y');
      write(`history/${webDataFileName(sym)}.json`, { ...series, range: '10y' });
      historyCount++;
    } catch (e) {
      console.warn(`Geçmiş alınamadı: ${sym}`, e);
    }
  }

  const series: Record<string, FxSeries> = {};
  const tenYearsAgo = new Date(started - 10 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  try {
    series[BIST100_TR_CODE] = await fetchBistIndex(BIST100_TR_CODE, tenYearsAgo);
  } catch (e) {
    console.warn('BIST 100 getiri endeksi alınamadı', e);
  }
  try {
    series.CPI = await fetchTurkeyCpi(Number(tenYearsAgo.slice(0, 4)));
  } catch (e) {
    console.warn('TÜFE alınamadı', e);
  }
  write('bench.json', { generatedAt: started, series } satisfies WebBenchFile);

  write('meta.json', {
    generatedAt: started,
    symbols: symbols.length,
    fresh: freshCount,
    keptFromPrevious: kept,
    history: historyCount,
    bench: Object.keys(series),
  });
  console.log(
    `Geçmiş: ${historyCount}/${HISTORY_SYMBOLS.length}, ölçüt: ${Object.keys(series).join(', ') || 'yok'}, ${Math.round((Date.now() - started) / 1000)} sn`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
