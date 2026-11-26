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
    label: 'BIST Hisse',
    shortLabel: 'BIST',
    currency: 'TRY',
    quantityLabel: 'Adet',
    placeholder: 'THYAO',
    color: '#3B82F6',
  },
  {
    kind: 'us',
    label: 'ABD Hisse',
    shortLabel: 'ABD',
    currency: 'USD',
    quantityLabel: 'Adet',
    placeholder: 'AAPL',
    color: '#8B5CF6',
  },
  {
    kind: 'crypto',
    label: 'Kripto',
    shortLabel: 'Kripto',
    currency: 'USD',
    quantityLabel: 'Miktar',
    placeholder: 'BTC',
    color: '#F97316',
  },
  { kind: 'fx', label: 'Döviz', shortLabel: 'Döviz', currency: 'TRY', quantityLabel: 'Miktar', color: '#14B8A6' },
  {
    kind: 'metal',
    label: 'Emtia',
    shortLabel: 'Emtia',
    currency: 'TRY',
    quantityLabel: 'Gram',
    color: '#EAB308',
  },
  {
    kind: 'other',
    label: 'Diğer (fon vb.)',
    shortLabel: 'Diğer',
    currency: 'TRY',
    quantityLabel: 'Adet',
    placeholder: 'Fon kodu, örn. AFT',
    color: '#64748B',
  },
];

/** Bir dilim açıldığında içindeki varlıklara verilen renkler (sırayla). */
export const SLICE_PALETTE = [
  '#3B82F6',
  '#06B6D4',
  '#10B981',
  '#F43F5E',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#84CC16',
  '#6366F1',
  '#EF4444',
  '#14B8A6',
  '#F97316',
  '#0EA5E9',
  '#A855F7',
  '#22C55E',
  '#EAB308',
];

/** Simgesiyle uyumlu olsun diye sabit renk verilen varlıklar. */
export const FIXED_ASSET_COLORS: Record<string, string> = {
  'metal:GRAM_ALTIN': '#EAB308',
  'metal:GRAM_GUMUS': '#94A3B8',
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
