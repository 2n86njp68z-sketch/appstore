import { CRYPTO_COINS } from '../data/crypto';
import { EUROBONDS, type EurobondInfo } from '../data/eurobonds';
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
    kind: 'etf',
    label: 'ABD ETF',
    shortLabel: 'ABD ETF',
    currency: 'USD',
    quantityLabel: 'Adet',
    placeholder: 'SPY',
    color: '#15AABF',
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
    quantityLabel: 'Miktar',
    color: '#F2B705',
  },
  {
    kind: 'fund',
    label: 'TEFAS',
    shortLabel: 'TEFAS',
    currency: 'TRY',
    quantityLabel: 'Adet',
    placeholder: 'Fon kodu, örn. AFT',
    color: '#E64980',
  },
  {
    kind: 'bes',
    label: 'BES',
    shortLabel: 'BES',
    currency: 'TRY',
    quantityLabel: 'Adet',
    placeholder: 'Fon kodu, örn. AEA',
    color: '#2B8A3E',
  },
  {
    kind: 'eurobond',
    label: 'Eurobond',
    shortLabel: 'Eurobond',
    currency: 'USD',
    quantityLabel: 'Nominal',
    placeholder: 'US900123DF45',
    color: '#1D4ED8',
  },
  {
    kind: 'other',
    label: 'Diğer',
    shortLabel: 'Diğer',
    currency: 'TRY',
    quantityLabel: 'Adet',
    placeholder: 'Varlık adı',
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
  'metal:ONS_ALTIN': '#E0A800',
  'metal:GRAM_ALTIN': '#F7C948',
  'metal:ONS_GUMUS': '#8C98AB',
  'metal:GRAM_GUMUS': '#B8C2D0',
  'metal:ONS_PLATIN': '#5B7DB1',
  'metal:GRAM_PLATIN': '#8AA6D0',
  'metal:ONS_PALADYUM': '#9775FA',
  'metal:GRAM_PALADYUM': '#C0A9FF',
  'metal:BRENT': '#795548',
  'metal:BRENT_TL': '#A1887F',
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

export type CommodityLook = 'gold' | 'silver' | 'platinum' | 'palladium' | 'oil';

/** Emtialar: dolar bazında ons/varil, TL bazında gram/varil. Fiyatlar vadeli kontratlardan (USD) gelir. */
export interface CommodityInfo extends FixedOption {
  /** Kaynak vadeli kontrat (USD/ons ya da USD/varil). */
  source: string;
  currency: Currency;
  unit: 'ons' | 'gram' | 'varil';
  look: CommodityLook;
}

export const COMMODITIES: CommodityInfo[] = [
  { symbol: 'ONS_ALTIN', name: 'Ons Altın', source: 'GC=F', currency: 'USD', unit: 'ons', look: 'gold' },
  { symbol: 'GRAM_ALTIN', name: 'Gram Altın', source: 'GC=F', currency: 'TRY', unit: 'gram', look: 'gold' },
  { symbol: 'ONS_GUMUS', name: 'Ons Gümüş', source: 'SI=F', currency: 'USD', unit: 'ons', look: 'silver' },
  { symbol: 'GRAM_GUMUS', name: 'Gram Gümüş', source: 'SI=F', currency: 'TRY', unit: 'gram', look: 'silver' },
  { symbol: 'ONS_PLATIN', name: 'Ons Platin', source: 'PL=F', currency: 'USD', unit: 'ons', look: 'platinum' },
  { symbol: 'GRAM_PLATIN', name: 'Gram Platin', source: 'PL=F', currency: 'TRY', unit: 'gram', look: 'platinum' },
  { symbol: 'ONS_PALADYUM', name: 'Ons Paladyum', source: 'PA=F', currency: 'USD', unit: 'ons', look: 'palladium' },
  { symbol: 'GRAM_PALADYUM', name: 'Gram Paladyum', source: 'PA=F', currency: 'TRY', unit: 'gram', look: 'palladium' },
  { symbol: 'BRENT', name: 'Brent Petrol', source: 'BZ=F', currency: 'USD', unit: 'varil', look: 'oil' },
  { symbol: 'BRENT_TL', name: 'Brent Petrol (TL)', source: 'BZ=F', currency: 'TRY', unit: 'varil', look: 'oil' },
];

const COMMODITY_MAP = new Map(COMMODITIES.map((c) => [c.symbol, c]));

export function commodityInfo(symbol: string): CommodityInfo | undefined {
  return COMMODITY_MAP.get(symbol);
}

export const METAL_OPTIONS: FixedOption[] = COMMODITIES.map(({ symbol, name }) => ({ symbol, name }));

/** Emtianın kaynak vadeli kontratı. */
export const METAL_SOURCE: Record<string, string> = Object.fromEntries(COMMODITIES.map((c) => [c.symbol, c.source]));

const CRYPTO_IDS = new Map(CRYPTO_COINS.map((c) => [c.code, c.id]));

/** Varlığın fiyatlandığı para birimi (ör. Ons Altın USD, Gram Altın TL). */
export function assetCurrency(kind: AssetKind, symbol: string): Currency {
  if (kind === 'metal') return commodityInfo(symbol)?.currency ?? 'TRY';
  if (kind === 'eurobond') return eurobondInfo(symbol)?.currency ?? 'USD';
  return kindInfo(kind).currency;
}

// ---------------------------------------------------------------------------
// Eurobond: T.C. Hazine eurobondları. Fiyat 100 nominal başına verilir (ör. 98,50); değer
// nominal × fiyat / 100.

const EUROBOND_MAP = new Map(EUROBONDS.map((e) => [e.code, e]));

export function eurobondInfo(isin: string): EurobondInfo | undefined {
  return EUROBOND_MAP.get(isin);
}

const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Eurobondun kısa adı: vade ayı, yılı ve döviz cinsi ("Oca 2028 USD"); listede yoksa ISIN. */
export function eurobondLabel(isin: string): string {
  const e = EUROBOND_MAP.get(isin);
  if (!e) return isin;
  const [y, m] = e.maturity.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y} ${e.currency}`;
}

/**
 * Fiyatın kaç birim için verildiği: eurobondlarda 100 nominal (çarpan 0,01), diğerlerinde 1 birim.
 * Değer = miktar × fiyat × çarpan.
 */
export function priceFactor(kind: AssetKind): number {
  return kind === 'eurobond' ? 0.01 : 1;
}

/** Fiyatı elle girilen türler (fon fiyatları otomatik alınamıyor). */
export function isManualPriced(kind: AssetKind): boolean {
  return kind === 'other' || kind === 'fund' || kind === 'bes';
}

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
  if (kind === 'us' || kind === 'etf') s = s.replace(/^([A-Z]{1,5})[-/]([A-Z])$/, '$1.$2');
  if (kind === 'crypto') s = s.replace(/-?USDT?$/, '') || s;
  return s;
}

/**
 * Fiyat kaynağındaki anahtar: Yahoo sembolü ya da listedeki kripto paralar için "CG:<CoinGecko kimliği>".
 * Elle fiyatlanan varlıklar için null.
 */
export function quoteSymbolFor(kind: AssetKind, symbol: string): string | null {
  switch (kind) {
    case 'eurobond':
      return `EB:${symbol}`;
    case 'bist':
      return `${symbol}.IS`;
    case 'us':
    case 'etf':
      // Hisse sınıfları: BRK.B → BRK-B (Yahoo biçimi)
      return symbol.replace(/\./g, '-');
    case 'crypto': {
      const id = CRYPTO_IDS.get(symbol);
      return id ? `CG:${id}` : `${symbol}-USD`;
    }
    case 'fx':
      return `${symbol}TRY=X`;
    case 'metal':
      return METAL_SOURCE[symbol] ?? null;
    case 'fund':
    case 'bes':
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
  if (kind === 'eurobond') return eurobondLabel(symbol);
  return symbol;
}

/** Miktarın yanında gösterilecek birim: "BTC", "USD", "gram", "ons", "varil", "adet". */
export function quantityUnit(kind: AssetKind, symbol: string): string {
  if (kind === 'crypto' || kind === 'fx') return symbol;
  if (kind === 'metal') return commodityInfo(symbol)?.unit ?? 'gram';
  return kindInfo(kind).quantityLabel.toLocaleLowerCase('tr-TR');
}

/** İşlem ekranındaki miktar alanının başlığı. */
export function quantityLabelFor(kind: AssetKind, symbol: string): string {
  if (kind === 'metal') {
    const unit = commodityInfo(symbol)?.unit ?? 'gram';
    return unit.charAt(0).toLocaleUpperCase('tr-TR') + unit.slice(1);
  }
  return kindInfo(kind).quantityLabel;
}
