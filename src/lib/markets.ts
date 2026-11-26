import { BIST_STOCKS } from '../data/bist';
import { US_STOCKS } from '../data/us';
import type { AssetKind, Currency } from './types';

/** Piyasa listelerindeki bir hisse. */
export interface MarketStock {
  code: string;
  name: string;
  website?: string;
  sector?: string;
  exchange?: string;
}

export type MarketKey = 'bist' | 'us';

export interface MarketDef {
  key: MarketKey;
  kind: AssetKind;
  title: string;
  currency: Currency;
  stocks: readonly MarketStock[];
  /** Fiyat kaynağındaki (Yahoo) sembol. */
  quoteSymbol: (code: string) => string;
}

export const MARKETS: Record<MarketKey, MarketDef> = {
  bist: {
    key: 'bist',
    kind: 'bist',
    title: 'Türk Market',
    currency: 'TRY',
    stocks: BIST_STOCKS,
    quoteSymbol: (code) => `${code}.IS`,
  },
  us: {
    key: 'us',
    kind: 'us',
    title: 'ABD Market',
    currency: 'USD',
    stocks: US_STOCKS,
    // Hisse sınıfları listede "BRK.B", Yahoo'da "BRK-B".
    quoteSymbol: (code) => code.replace(/\./g, '-'),
  },
};

const byCode = new Map<MarketKey, Map<string, MarketStock>>();

function index(key: MarketKey): Map<string, MarketStock> {
  let m = byCode.get(key);
  if (!m) {
    m = new Map(MARKETS[key].stocks.map((s) => [s.code, s]));
    byCode.set(key, m);
  }
  return m;
}

/** Varlık türüne göre piyasa listesindeki hisse (Türk/ABD Market dışı türler için undefined). */
export function stockInfo(kind: AssetKind, code: string): MarketStock | undefined {
  if (kind !== 'bist' && kind !== 'us') return undefined;
  return index(kind).get(code);
}

/** Aramada Türkçe harf farkını yok sayar: "türk" = "TURK", "İŞ" = "IS". */
export function foldForSearch(text: string): string {
  return text
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Folded {
  stock: MarketStock;
  code: string;
  name: string;
  words: string[];
}

const foldedCache = new WeakMap<readonly MarketStock[], Folded[]>();

function folded(list: readonly MarketStock[]): Folded[] {
  let f = foldedCache.get(list);
  if (!f) {
    f = list.map((s) => {
      const name = foldForSearch(s.name);
      return { stock: s, code: foldForSearch(s.code), name, words: name.split(/[\s,.()&/-]+/) };
    });
    foldedCache.set(list, f);
  }
  return f;
}

/**
 * Kod veya şirket adına göre arar. Sıralama: kodu tam eşleşen, kodu böyle başlayan, adındaki bir
 * kelime böyle başlayan, adında geçen.
 */
export function searchStocks(query: string, list: readonly MarketStock[]): MarketStock[] {
  const q = foldForSearch(query);
  if (!q) return [...list];
  const scored: { stock: MarketStock; score: number }[] = [];
  for (const f of folded(list)) {
    let score = -1;
    if (f.code === q) score = 0;
    else if (f.code.startsWith(q)) score = 1;
    else if (f.name.startsWith(q) || f.words.some((w) => w.startsWith(q))) score = 2;
    else if (f.code.includes(q) || f.name.includes(q)) score = 3;
    if (score >= 0) scored.push({ stock: f.stock, score });
  }
  scored.sort((a, b) => a.score - b.score || a.stock.code.localeCompare(b.stock.code));
  return scored.map((s) => s.stock);
}

/** Simge adayları: sitenin büyük simgesi, sitenin simgesinin Google'daki büyük kopyası, favicon. */
export function logoCandidates(website: string): string[] {
  const host = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return [
    `https://${host}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
    `https://${host}/favicon.ico`,
  ];
}
