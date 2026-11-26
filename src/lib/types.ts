/** Varlık türleri. */
export type AssetKind = 'bist' | 'us' | 'crypto' | 'fx' | 'metal' | 'other';

/** Fiyatların tutulduğu para birimi. */
export type Currency = 'TRY' | 'USD';

/** Portföyün gösterilebildiği para birimleri. */
export type DisplayCurrency = 'TRY' | 'USD' | 'EUR';

/** Günlük kur geçmişi (1 birim dövizin TL karşılığı), tarihe göre sıralı. */
export interface FxSeries {
  /** YYYY-AA-GG */
  dates: string[];
  rates: number[];
  fetchedAt: number;
  /** Çekilirken kullanılan Yahoo aralığı (1y, 2y, 5y, 10y, max). */
  range?: string;
}

export type FxHistory = Partial<Record<'USD' | 'EUR', FxSeries>>;

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

  /**
   * TL, dolar ve euro karşılıkları. Maliyetler her işlemin kendi tarihindeki kurla hesaplanır.
   * Gerekli güncel kur bilinmiyorsa o para birimi eksiktir.
   */
  views: Partial<Record<DisplayCurrency, MoneyView>>;
  /** Kısayol: views.TRY?.value (ağırlık ve sıralama için). */
  valueTry?: number;
}

/** Bir varlığın tek bir para birimindeki değerleri. */
export interface MoneyView {
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number;
  realized: number;
  dayChange?: number;
}

export interface MoneyTotals {
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number;
  dayChange: number;
  dayChangePct: number;
  /** Kur eksik olduğu için toplama katılamayan varlık var mı? */
  incomplete: boolean;
}

export interface AllocationSlice {
  kind: AssetKind;
  valueTry: number;
  /** Portföy içindeki pay (%). */
  pct: number;
  totals: Partial<Record<DisplayCurrency, MoneyTotals>>;
}

export interface PortfolioSummary {
  totals: Record<DisplayCurrency, MoneyTotals>;
  allocation: AllocationSlice[];
}
