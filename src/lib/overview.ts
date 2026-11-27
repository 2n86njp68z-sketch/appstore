import { foldForSearch } from './markets';
import type { AssetKind, Currency } from './types';

/**
 * Sol menüdeki "Nakit" bölümü: Türk lirası, dolar ve euro. Dokununca portföye nakit olarak eklenir
 * (Türk lirasının fiyatı her zaman 1 ₺; döviz kurları Yahoo'dan).
 */
export type OverviewKey = 'cash';

export interface OverviewItem {
  /** Satırda kalın yazan ad. */
  code: string;
  /** Altındaki açıklama. */
  name: string;
  /** Yahoo Finance sembolü; sabit fiyatlılarda (Türk lirası) kaynak yok. */
  quoteKey: string;
  /** Kaynaktan çekilmeyen sabit fiyat (Türk lirası: 1). */
  fixedPrice?: number;
  /** Fiyatın para birimi. */
  currency: Currency | null;
  icon: { flag: 'TR' | 'USD' } | { pair: [string, string] };
  /** Dokununca portföye eklenecek varlık. */
  asset?: { kind: AssetKind; symbol: string };
}

export const OVERVIEW: Record<OverviewKey, { title: string; items: readonly OverviewItem[] }> = {
  cash: {
    title: 'Nakit',
    items: [
      {
        code: 'Türk Lirası',
        name: 'TL nakit',
        quoteKey: 'TRY',
        fixedPrice: 1,
        currency: 'TRY',
        icon: { flag: 'TR' },
        asset: { kind: 'fx', symbol: 'TRY' },
      },
      {
        code: 'Dolar',
        name: 'USD/TRY',
        quoteKey: 'USDTRY=X',
        currency: 'TRY',
        icon: { pair: ['USD', 'TR'] },
        asset: { kind: 'fx', symbol: 'USD' },
      },
      {
        code: 'Euro',
        name: 'EUR/TRY',
        quoteKey: 'EURTRY=X',
        currency: 'TRY',
        icon: { pair: ['EUR', 'TR'] },
        asset: { kind: 'fx', symbol: 'EUR' },
      },
    ],
  },
};

export const OVERVIEW_KEYS = Object.keys(OVERVIEW) as OverviewKey[];

/** Ad ya da açıklamada geçen kalemler ("lira", "dolar", "usd"). */
export function searchOverview(query: string, items: readonly OverviewItem[]): OverviewItem[] {
  const q = foldForSearch(query);
  if (!q) return [...items];
  return items.filter((i) => foldForSearch(`${i.code} ${i.name}`).includes(q));
}

/** "Karşılaştır" bölümündeki bağlantılar: uygulama içi tarayıcıda açılır. */
export interface LinkItem {
  code: string;
  name: string;
  url: string;
  /** Sitenin simgesi. */
  logo: string;
}

export const COMPARE_LINKS: { title: string; items: readonly LinkItem[] } = {
  title: 'Karşılaştır',
  items: [
    {
      code: 'Grafik',
      name: 'Temettü dahil getiri grafikleri, TL/USD, karşılaştırma',
      url: 'https://2n86njp68z-sketch.github.io/Grafik/',
      logo: 'https://2n86njp68z-sketch.github.io/Grafik/icons/apple-touch-icon.png',
    },
  ],
};

export function searchLinks(query: string, items: readonly LinkItem[]): LinkItem[] {
  const q = foldForSearch(query);
  if (!q) return [...items];
  return items.filter((i) => foldForSearch(`${i.code} ${i.name}`).includes(q));
}
