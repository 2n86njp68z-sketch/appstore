import { BIST_STOCKS } from '../data/bist';
import { CRYPTO_COINS } from '../data/crypto';
import { US_ETFS } from '../data/etf';
import { EUROBONDS } from '../data/eurobonds';
import { BES_FUNDS, TEFAS_FUNDS } from '../data/funds';
import { US_STOCKS } from '../data/us';
import { COMMODITIES, quoteSymbolFor, USDTRY_SYMBOL, assetCurrency, commodityInfo } from './assets';
import type { AssetKind, Currency } from './types';

/** Piyasa listelerindeki bir kalem (hisse, fon, emtia, coin). */
export interface MarketStock {
  code: string;
  name: string;
  /** Şirketin internet adresi (logo sitesinden alınır). */
  website?: string;
  /** Doğrudan logo resmi (kripto). */
  logo?: string;
  /** Fonlarda kurucu şirket (aramada da kullanılır). */
  company?: string;
  sector?: string;
  exchange?: string;
}

export type MarketKey = 'bist' | 'us' | 'etf' | 'metal' | 'fund' | 'bes' | 'crypto' | 'eurobond';

export interface MarketDef {
  key: MarketKey;
  kind: AssetKind;
  title: string;
  /** Listede fiyatın gösterildiği para birimi (emtiada kaleme göre değişir). */
  currencyOf: (code: string) => Currency;
  stocks: readonly MarketStock[];
  /** Fiyat elle mi giriliyor (fonlar)? */
  manual: boolean;
  /** Listedeki fiyatı göstermek için çekilmesi gereken fiyat anahtarları. */
  quoteKeys: (code: string) => string[];
}

const COMMODITY_STOCKS: readonly MarketStock[] = COMMODITIES.map((c) => ({ code: c.symbol, name: c.name }));

/**
 * Hazine eurobondları: ad vade ve kupondan ("Vade 15.01.2028 · kupon %9,875"); aramada yıl, döviz
 * cinsi ve "hazine" de bulunur.
 */
const EUROBOND_STOCKS: readonly MarketStock[] = EUROBONDS.map((e) => ({
  code: e.code,
  name:
    `Vade ${e.maturity.split('-').reverse().join('.')}` +
    (e.coupon != null ? ` · kupon %${String(e.coupon).replace('.', ',')}` : ` · ${e.currency}`),
  company: `Hazine eurobond ${e.currency}`,
}));

function quoteKeysFor(kind: AssetKind) {
  return (code: string): string[] => {
    const key = quoteSymbolFor(kind, code);
    if (!key) return [];
    // TL bazlı emtialar dolar kuruyla hesaplanır.
    if (kind === 'metal' && commodityInfo(code)?.currency === 'TRY') return [key, USDTRY_SYMBOL];
    return [key];
  };
}

function market(key: MarketKey, kind: AssetKind, title: string, stocks: readonly MarketStock[], manual = false) {
  return {
    key,
    kind,
    title,
    stocks,
    manual,
    currencyOf: (code: string) => assetCurrency(kind, code),
    quoteKeys: quoteKeysFor(kind),
  } satisfies MarketDef;
}

export const MARKETS: Record<MarketKey, MarketDef> = {
  bist: market('bist', 'bist', 'Türk Market', BIST_STOCKS),
  us: market('us', 'us', 'ABD Market', US_STOCKS),
  etf: market('etf', 'etf', 'ABD ETF', US_ETFS),
  metal: market('metal', 'metal', 'Emtia', COMMODITY_STOCKS),
  fund: market('fund', 'fund', 'TEFAS', TEFAS_FUNDS, true),
  bes: market('bes', 'bes', 'BES', BES_FUNDS, true),
  crypto: market('crypto', 'crypto', 'Kripto', CRYPTO_COINS),
  eurobond: market('eurobond', 'eurobond', 'Eurobond', EUROBOND_STOCKS),
};

const KIND_TO_MARKET: Partial<Record<AssetKind, MarketKey>> = {
  bist: 'bist',
  us: 'us',
  etf: 'etf',
  metal: 'metal',
  fund: 'fund',
  bes: 'bes',
  crypto: 'crypto',
  eurobond: 'eurobond',
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

/** Varlık türüne göre piyasa listesindeki kalem (döviz ve "Diğer" için undefined). */
export function stockInfo(kind: AssetKind, code: string): MarketStock | undefined {
  const key = KIND_TO_MARKET[kind];
  return key ? index(key).get(code) : undefined;
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
      const name = foldForSearch(s.company ? `${s.name} ${s.company}` : s.name);
      return { stock: s, code: foldForSearch(s.code), name, words: name.split(/[\s,.()&/-]+/) };
    });
    foldedCache.set(list, f);
  }
  return f;
}

/**
 * Kod veya ada (fonlarda şirket adına da) göre arar. Sıralama: kodu tam eşleşen, kodu böyle başlayan,
 * adındaki bir kelime böyle başlayan, adında geçen.
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
  // Aynı puanda listedeki sıra korunur (kriptoda piyasa değeri sırası).
  scored.sort((a, b) => a.score - b.score);
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
