import { commodityInfo } from './assets';
import type { AssetKind, Holding } from './types';

/**
 * Grafik sitesi (temettü dahil getiri grafikleri) ile portföy karşılaştırması. Site linkte bir ana
 * enstrüman ve en fazla 3 karşılaştırma kabul eder: #s=THYAO.IS&c=ASELS.IS,VOO&r=1Y
 * Site yalnız kendi listesindeki (~2.700) enstrümanların verisini gösterdiği için liste sitenin
 * kataloğundan okunur.
 */
export const GRAFIK_URL = 'https://2n86njp68z-sketch.github.io/Grafik/';
export const GRAFIK_CATALOG_URL = `${GRAFIK_URL}data/catalog.json`;
export const GRAFIK_MAX_COMPARE = 3;

const COMMODITY_SYMBOLS: Record<string, string> = {
  ONS_ALTIN: 'GC=F',
  GRAM_ALTIN: 'GRAMALTIN',
  ONS_GUMUS: 'SI=F',
  GRAM_GUMUS: 'GRAMGUMUS',
};
const FX_SYMBOLS: Record<string, string> = { USD: 'TRY=X', EUR: 'EURTRY=X', GBP: 'GBPTRY=X' };

/** Varlığın Grafik'teki sembolü; Grafik'te karşılığı olmayan türlerde (fon, BES…) null. */
export function grafikSymbol(kind: AssetKind, symbol: string): string | null {
  switch (kind) {
    case 'bist':
      return `${symbol}.IS`;
    case 'us':
    case 'etf':
      return symbol.replace(/\./g, '-');
    case 'crypto':
      return `${symbol}-USD`;
    case 'fx':
      return FX_SYMBOLS[symbol] ?? null;
    case 'metal': {
      if (COMMODITY_SYMBOLS[symbol]) return COMMODITY_SYMBOLS[symbol];
      // Platin, paladyum ve Brent'in Grafik'te yalnız dolar (ons/varil) karşılığı var.
      const look = commodityInfo(symbol)?.look;
      return look === 'platinum' ? 'PL=F' : look === 'palladium' ? 'PA=F' : look === 'oil' ? 'BZ=F' : null;
    }
    default:
      return null;
  }
}

/** Katalogdaki sembol kümesi. */
export function parseGrafikCatalog(json: unknown): Set<string> {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return new Set();
  return new Set((items as { s?: unknown }[]).flatMap((i) => (typeof i?.s === 'string' && i.s ? [i.s] : [])));
}

/** En eski alışı kapsayan en kısa Grafik dönemi. */
export function grafikRange(earliest: string, today: string): string {
  const days = (Date.parse(today) - Date.parse(earliest)) / 86_400_000;
  if (days <= 31) return '1M';
  if (days <= 92) return '3M';
  if (days <= 183) return '6M';
  if (days <= 366) return '1Y';
  if (days <= 5 * 366) return '5Y';
  if (days <= 10 * 366) return '10Y';
  return 'MAX';
}

export interface GrafikCompare {
  url: string;
  /** Linkteki varlıklar (ana enstrüman önce), portföydeki değerine göre büyükten küçüğe. */
  holdings: Holding[];
}

/**
 * Portföyün en büyük (TL değeri) 4 varlığını Grafik'te aynı grafikte karşılaştıran link.
 * catalog verilirse yalnız Grafik'te bulunan semboller alınır. Uygun varlık yoksa null.
 */
export function portfolioCompareLink(
  holdings: Holding[],
  catalog: Set<string> | null,
  today: string = new Date().toISOString().slice(0, 10),
): GrafikCompare | null {
  const seen = new Set<string>();
  const picked: { holding: Holding; symbol: string }[] = [];
  const sorted = [...holdings]
    .filter((h) => h.quantity > 0)
    .sort((a, b) => (b.views.TRY?.value ?? 0) - (a.views.TRY?.value ?? 0));
  for (const h of sorted) {
    const symbol = grafikSymbol(h.kind, h.symbol);
    if (!symbol || seen.has(symbol) || (catalog && !catalog.has(symbol))) continue;
    seen.add(symbol);
    picked.push({ holding: h, symbol });
    if (picked.length === GRAFIK_MAX_COMPARE + 1) break;
  }
  if (picked.length === 0) return null;
  const earliest = picked
    .flatMap((p) => p.holding.transactions.map((t) => t.date))
    .reduce((m, d) => (d < m ? d : m), today);
  const params = [`s=${encodeURIComponent(picked[0].symbol)}`];
  if (picked.length > 1)
    params.push(
      `c=${picked
        .slice(1)
        .map((p) => encodeURIComponent(p.symbol))
        .join(',')}`,
    );
  params.push(`r=${grafikRange(earliest, today)}`);
  return { url: `${GRAFIK_URL}#${params.join('&')}`, holdings: picked.map((p) => p.holding) };
}

let catalogCache: Promise<Set<string>> | null = null;

/** Grafik kataloğu; uygulama açıkken bir kez indirilir (başarısızsa bir dahaki sefere yeniden denenir). */
export function fetchGrafikCatalog(fetchFn: typeof fetch = fetch): Promise<Set<string>> {
  if (!catalogCache) {
    catalogCache = fetchFn(GRAFIK_CATALOG_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const set = parseGrafikCatalog(await res.json());
        if (set.size === 0) throw new Error('Grafik kataloğu boş');
        return set;
      })
      .catch((e) => {
        catalogCache = null;
        throw e;
      });
  }
  return catalogCache;
}
