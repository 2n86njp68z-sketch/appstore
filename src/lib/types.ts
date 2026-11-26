/** Varlık türleri. */
export type AssetKind = 'bist' | 'us' | 'crypto' | 'fx' | 'metal' | 'other';

/** Fiyatların tutulduğu para birimi. */
export type Currency = 'TRY' | 'USD';

export type TransactionSide = 'buy' | 'sell';

/** Kullanıcının girdiği tek bir alış veya satış işlemi. */
export interface Transaction {
  id: string;
  kind: AssetKind;
  /** Büyük harfli sembol: THYAO, AAPL, BTC, USD, GRAM_ALTIN, AFT ... */
  symbol: string;
  side: TransactionSide;
  quantity: number;
  /** Varlığın kendi para biriminde birim fiyat. */
  price: number;
  /** YYYY-AA-GG */
  date: string;
  /** Oluşturulma zamanı (ms); aynı gündeki işlemleri sıralamak için. */
  createdAt: number;
}

/** Fiyat kaynağından gelen ham fiyat (sembol bazında). */
export interface RawQuote {
  price: number;
  previousClose?: number;
  name?: string;
  fetchedAt: number;
}

/** Bir varlığa ait çözülmüş fiyat. */
export interface AssetQuote {
  price: number;
  previousClose?: number;
  name?: string;
  fetchedAt?: number;
  manual?: boolean;
}

export interface Holding {
  key: string;
  kind: AssetKind;
  symbol: string;
  name: string;
  currency: Currency;
  transactions: Transaction[];

  quantity: number;
  /** Ortalama maliyet (varlığın para biriminde). */
  avgCost: number;
  /** Eldeki adetin toplam maliyeti (varlığın para biriminde). */
  costBasis: number;
  /** Satışlardan gerçekleşen kâr/zarar (varlığın para biriminde). */
  realizedPnl: number;

  /** Fiyat alınamadıysa true; değer maliyet üzerinden gösterilir. */
  priceMissing: boolean;
  price: number;
  previousClose?: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  dayChange?: number;
  dayChangePct?: number;

  /** TL karşılıkları; USD kuru bilinmiyorsa undefined. */
  valueTry?: number;
  costTry?: number;
  pnlTry?: number;
  dayChangeTry?: number;
}

export interface AllocationSlice {
  kind: AssetKind;
  valueTry: number;
  /** Portföy içindeki pay (%). */
  pct: number;
  pnlTry: number;
  pnlPct: number;
}

export interface PortfolioSummary {
  valueTry: number;
  costTry: number;
  pnlTry: number;
  pnlPct: number;
  dayChangeTry: number;
  dayChangePct: number;
  /** USD kuru eksik olduğu için toplama katılamayan varlık var mı? */
  incomplete: boolean;
  allocation: AllocationSlice[];
}
