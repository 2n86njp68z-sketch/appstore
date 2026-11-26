import type { AssetKind, Currency } from './types';

export const TROY_OUNCE_GRAMS = 31.1034768;
export const USDTRY_SYMBOL = 'USDTRY=X';
export const EURTRY_SYMBOL = 'EURTRY=X';

/** Para biriminin TL kuru sembolü. */
export const FX_RATE_SYMBOL = { USD: USDTRY_SYMBOL, EUR: EURTRY_SYMBOL } as const;

export interface AssetKindInfo {
  kind: AssetKind;
  label: string;
  shortLabel: string;
  currency: Currency;
  quantityLabel: string;
  placeholder?: string;
  color: string;
}

export const ASSET_KINDS: AssetKindInfo[] = [
  {
    kind: 'bist',
    label: 'Türk Market',
    shortLabel: 'Türk Market',
    currency: 'TRY',
    quantityLabel: 'Adet',
    placeholder: 'THYAO',
    color: '#2F6BFF',
  },
  {
    kind: 'us',
    label: 'ABD Market',
    shortLabel: 'ABD Market',
    currency: 'USD',
    quantityLabel: 'Adet',
    placeholder: 'AAPL',
    color: '#7C5CFF',
  },
  {
    kind: 'crypto',
    label: 'Kripto',
    shortLabel: 'Kripto',
    currency: 'USD',
    quantityLabel: 'Miktar',
    placeholder: 'BTC',
    color: '#FF8A3D',
  },
  { kind: 'fx', label: 'Döviz', shortLabel: 'Döviz', currency: 'TRY', quantityLabel: 'Miktar', color: '#14B8A6' },
  {
    kind: 'metal',
    label: 'Emtia',
    shortLabel: 'Emtia',
    currency: 'TRY',
    quantityLabel: 'Gram',
    color: '#F2B705',
  },
  {
    kind: 'other',
    label: 'Diğer (fon vb.)',
    shortLabel: 'Diğer',
    currency: 'TRY',
    quantityLabel: 'Adet',
    placeholder: 'Fon kodu, örn. AFT',
    color: '#94A3B8',
  },
];

/** Bir dilim açıldığında içindeki varlıklara verilen renkler (sırayla). */
export const SLICE_PALETTE = [
  '#2F6BFF',
  '#22B8CF',
  '#20C997',
  '#FF6B8B',
  '#FFB547',
  '#7C5CFF',
  '#F06595',
  '#94D82D',
  '#5C7CFA',
  '#FF8A3D',
  '#14B8A6',
  '#CC5DE8',
  '#74C0FC',
  '#FFD43B',
  '#FA5252',
  '#63E6BE',
];

/** Simgesiyle uyumlu olsun diye sabit renk verilen varlıklar. */
export const FIXED_ASSET_COLORS: Record<string, string> = {
  'metal:GRAM_ALTIN': '#F2B705',
  'metal:GRAM_GUMUS': '#A7B1C2',
};

const KIND_MAP = Object.fromEntries(ASSET_KINDS.map((k) => [k.kind, k])) as Record<AssetKind, AssetKindInfo>;

export function kindInfo(kind: AssetKind): AssetKindInfo {
  return KIND_MAP[kind];
}

export interface FixedOption {
  symbol: string;
  name: string;
}

export const FX_OPTIONS: FixedOption[] = [
  { symbol: 'USD', name: 'Amerikan Doları' },
  { symbol: 'EUR', name: 'Euro' },
  { symbol: 'GBP', name: 'İngiliz Sterlini' },
  { symbol: 'CHF', name: 'İsviçre Frangı' },
];

export const METAL_OPTIONS: FixedOption[] = [
  { symbol: 'GRAM_ALTIN', name: 'Gram Altın' },
  { symbol: 'GRAM_GUMUS', name: 'Gram Gümüş' },
];

/** Gram fiyatı hesaplanırken kullanılan ons vadeli sembolleri (USD/ons). */
export const METAL_SOURCE: Record<string, string> = {
  GRAM_ALTIN: 'GC=F',
  GRAM_GUMUS: 'SI=F',
};

export function assetKey(kind: AssetKind, symbol: string): string {
  return `${kind}:${symbol}`;
}

export function parseAssetKey(key: string): { kind: AssetKind; symbol: string } | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const kind = key.slice(0, i) as AssetKind;
  if (!KIND_MAP[kind]) return null;
  return { kind, symbol: key.slice(i + 1) };
}

/** Kullanıcının yazdığı sembolü temizler: boşluklar, BIST için ".IS", kripto için "-USD" eki atılır. */
export function normalizeSymbol(kind: AssetKind, input: string): string {
  // toUpperCase (yerel ayarsız) "i" ve "ı" harflerini "I" yapar; semboller ASCII olmalı.
  if (kind === 'other') return input.trim().toUpperCase().replace(/\s+/g, ' ');
  let s = input.trim().toUpperCase().replace(/\s+/g, '');
  if (kind === 'bist') s = s.replace(/\.IS$/, '');
  if (kind === 'crypto') s = s.replace(/-?USDT?$/, '') || s;
  return s;
}

/** Fiyat kaynağı (Yahoo Finance) için sembol. Hesaplanan/manuel varlıklar için null. */
export function quoteSymbolFor(kind: AssetKind, symbol: string): string | null {
  switch (kind) {
    case 'bist':
      return `${symbol}.IS`;
    case 'us':
      return symbol;
    case 'crypto':
      return `${symbol}-USD`;
    case 'fx':
      return `${symbol}TRY=X`;
    case 'metal':
      return METAL_SOURCE[symbol] ?? null;
    case 'other':
      return null;
  }
}

export function fixedName(kind: AssetKind, symbol: string): string | undefined {
  const list = kind === 'fx' ? FX_OPTIONS : kind === 'metal' ? METAL_OPTIONS : [];
  return list.find((o) => o.symbol === symbol)?.name;
}

export function displaySymbol(kind: AssetKind, symbol: string): string {
  if (kind === 'metal') return fixedName(kind, symbol) ?? symbol;
  return symbol;
}

/** Miktarın yanında gösterilecek birim: "BTC", "USD", "gram", "adet". */
export function quantityUnit(kind: AssetKind, symbol: string): string {
  if (kind === 'crypto' || kind === 'fx') return symbol;
  return kindInfo(kind).quantityLabel.toLocaleLowerCase('tr-TR');
}
