import { foldForSearch } from './markets';
import type { AssetKind, Currency } from './types';

/**
 * Sol menüdeki piyasa özeti bölümleri: endeksler ve kurlar. Bunlar portföy kalemi değil, yalnız
 * fiyatları izlenir (dövizlere dokununca portföye döviz olarak eklenebilir).
 */
export type OverviewKey = 'index' | 'rates';

export interface OverviewItem {
  /** Satırda kalın yazan ad. */
  code: string;
  /** Altındaki açıklama. */
  name: string;
  /** Yahoo Finance sembolü. */
  quoteKey: string;
  /** Fiyatın para birimi; endekslerde puan (null). */
  currency: Currency | null;
  icon: { flag: 'TR' | 'USD' } | { pair: [string, string] };
  /** Dokununca portföye eklenecek varlık. */
  asset?: { kind: AssetKind; symbol: string };
}

export const OVERVIEW: Record<OverviewKey, { title: string; items: readonly OverviewItem[] }> = {
  index: {
    title: 'Endeks',
    items: [
      {
        code: 'S&P 500',
        name: "ABD'nin 500 büyük şirketi",
        quoteKey: '^GSPC',
        currency: null,
        icon: { flag: 'USD' },
      },
      {
        code: 'Nasdaq 100',
        name: "Nasdaq'ın 100 büyük şirketi",
        quoteKey: '^NDX',
        currency: null,
        icon: { flag: 'USD' },
      },
      {
        code: 'BIST 100',
        name: "Borsa İstanbul'un 100 büyük şirketi",
        quoteKey: 'XU100.IS',
        currency: null,
        icon: { flag: 'TR' },
      },
    ],
  },
  rates: {
    title: 'Kurlar',
    items: [
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

/** Ad ya da açıklamada geçen kalemler ("nasdaq", "dolar", "usd"). */
export function searchOverview(query: string, items: readonly OverviewItem[]): OverviewItem[] {
  const q = foldForSearch(query);
  if (!q) return [...items];
  return items.filter((i) => foldForSearch(`${i.code} ${i.name}`).includes(q));
}
