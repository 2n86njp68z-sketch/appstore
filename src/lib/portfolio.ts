import {
  allowsManualPrice,
  assetCurrency,
  assetKey,
  commodityInfo,
  EURTRY_SYMBOL,
  FX_RATE_SYMBOL,
  fixedName,
  isManualPriced,
  priceFactor,
  quoteSymbolFor,
  TROY_OUNCE_GRAMS,
  USDTRY_SYMBOL,
} from './assets';
import { applySplits, corporateEvents } from './corporate';
import { stockInfo } from './markets';
import type {
  AllocationSlice,
  AssetKind,
  AssetQuote,
  CorporateAction,
  Currency,
  DisplayCurrency,
  FxHistory,
  FxSeries,
  Holding,
  MoneyTotals,
  MoneyView,
  PortfolioSummary,
  RawQuote,
  Transaction,
} from './types';

const EPSILON = 1e-9;
export const DISPLAY_CURRENCIES: DisplayCurrency[] = ['TRY', 'USD', 'EUR'];

export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}

export interface Position {
  quantity: number;
  avgCost: number;
  costBasis: number;
  realizedPnl: number;
}

/**
 * Ortalama maliyet yöntemiyle pozisyonu hesaplar. Eldekinden fazla satış eldeki miktarla sınırlanır.
 * Eurobondlarda fiyat 100 nominal başına olduğu için hesap "fiyat birimi" cinsinden (nominal × 0,01)
 * yapılır; dönen miktar yine nominaldir, ortalama maliyet fiyatla aynı birimdedir.
 */
export function computePosition(transactions: Transaction[]): Position {
  const f = transactions.length ? priceFactor(transactions[0].kind) : 1;
  let quantity = 0;
  let costBasis = 0;
  let realizedPnl = 0;
  for (const t of sortTransactions(transactions)) {
    const tq = t.quantity * f;
    if (t.side === 'buy') {
      quantity += tq;
      costBasis += tq * t.price;
    } else {
      const sellQty = Math.min(tq, quantity);
      if (sellQty <= 0) continue;
      const avg = costBasis / quantity;
      realizedPnl += sellQty * (t.price - avg);
      costBasis -= sellQty * avg;
      quantity -= sellQty;
      if (quantity < EPSILON) {
        quantity = 0;
        costBasis = 0;
      }
    }
  }
  return { quantity: quantity / f, avgCost: quantity > 0 ? costBasis / quantity : 0, costBasis, realizedPnl };
}

/** Gereken ham sembollerin listesi (USD/TRY ve EUR/TRY kurları her zaman eklenir). */
export function requiredQuoteSymbols(transactions: Transaction[]): string[] {
  const set = new Set<string>([USDTRY_SYMBOL, EURTRY_SYMBOL]);
  for (const t of transactions) {
    const s = quoteSymbolFor(t.kind, t.symbol);
    if (s) set.add(s);
  }
  return [...set];
}

/** Ham fiyatlardan bir varlığın fiyatını çözer. Gram altın/gümüş, ons fiyatı ve kurdan hesaplanır. */
export function resolveAssetQuote(
  kind: AssetKind,
  symbol: string,
  raw: Record<string, RawQuote>,
  manualPrices: Record<string, number>,
): AssetQuote | undefined {
  if (isManualPriced(kind)) {
    const p = manualPrices[assetKey(kind, symbol)];
    return p != null && Number.isFinite(p) ? { price: p, manual: true } : undefined;
  }
  if (kind === 'metal') {
    const c = commodityInfo(symbol);
    const src = c ? raw[c.source] : undefined;
    if (!c || !src) return undefined;
    // Dolar bazında: kontrat fiyatı doğrudan (USD/ons, USD/varil).
    if (c.currency === 'USD') return { price: src.price, previousClose: src.previousClose, fetchedAt: src.fetchedAt };
    // TL bazında: kurla çevrilir; metallerde ons → gram.
    const usd = raw[USDTRY_SYMBOL];
    if (!usd) return undefined;
    const perUnit = c.unit === 'gram' ? 1 / TROY_OUNCE_GRAMS : 1;
    const price = src.price * usd.price * perUnit;
    const previousClose =
      src.previousClose != null && usd.previousClose != null
        ? src.previousClose * usd.previousClose * perUnit
        : undefined;
    return { price, previousClose, fetchedAt: Math.min(src.fetchedAt, usd.fetchedAt) };
  }
  const s = quoteSymbolFor(kind, symbol);
  const q = s ? raw[s] : undefined;
  if (!q) {
    // TEFAS'ta fiyatı olmayan fon: elle girilmiş fiyat varsa o
    if (allowsManualPrice(kind)) {
      const p = manualPrices[assetKey(kind, symbol)];
      if (p != null && Number.isFinite(p)) return { price: p, manual: true };
    }
    return undefined;
  }
  return { price: q.price, previousClose: q.previousClose, name: q.name, fetchedAt: q.fetchedAt, yieldPct: q.yieldPct };
}

// ---------------------------------------------------------------------------
// Kurlar

/** Verilen tarihteki (yoksa ondan önceki son) kur. Seri o tarihten sonra başlıyorsa ilk kur. */
export function rateOn(series: FxSeries | undefined, date: string): number | undefined {
  if (!series || series.dates.length === 0) return undefined;
  const { dates, rates } = series;
  if (date <= dates[0]) return rates[0];
  let lo = 0;
  let hi = dates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (dates[mid] <= date) lo = mid;
    else hi = mid - 1;
  }
  return rates[lo];
}

/** Kur bilgisi: güncel, önceki kapanış ve geçmiş. Değerler 1 birim dövizin TL karşılığıdır. */
export class FxRates {
  constructor(
    private raw: Record<string, RawQuote>,
    private history: FxHistory = {},
  ) {}

  /** Güncel kur. TRY için 1. */
  now(cur: DisplayCurrency | Currency): number | undefined {
    if (cur === 'TRY') return 1;
    return this.raw[FX_RATE_SYMBOL[cur]]?.price;
  }

  /** Önceki kapanış kuru; yoksa güncel kur. */
  previous(cur: DisplayCurrency | Currency): number | undefined {
    if (cur === 'TRY') return 1;
    return this.raw[FX_RATE_SYMBOL[cur]]?.previousClose ?? this.now(cur);
  }

  /** Bir tarihteki kur. Geçmiş yoksa ya da tarih geçmişin son gününden yeniyse güncel kur. */
  on(cur: DisplayCurrency | Currency, date: string): number | undefined {
    if (cur === 'TRY') return 1;
    const series = this.history[cur];
    if (!series || series.dates.length === 0 || date > series.dates[series.dates.length - 1]) {
      return this.now(cur) ?? rateOn(series, date);
    }
    return rateOn(series, date);
  }
}

/** Bir tutarı `from` para biriminden `to` para birimine, verilen kurlarla çevirir. */
function convert(amount: number, fromRate: number | undefined, toRate: number | undefined): number | undefined {
  if (fromRate == null || toRate == null || toRate <= 0) return undefined;
  return (amount * fromRate) / toRate;
}

// ---------------------------------------------------------------------------
// Varlıklar

interface CurrencyLedger {
  cost: number;
  realized: number;
  ok: boolean;
}

/** Ortalama maliyetle, her para biriminde ayrı maliyet ve gerçekleşen K/Z (işlem tarihindeki kurla). */
function ledgerIn(sorted: Transaction[], native: Currency, target: DisplayCurrency, fx: FxRates): CurrencyLedger {
  const f = sorted.length ? priceFactor(sorted[0].kind) : 1;
  let quantity = 0;
  let cost = 0;
  let realized = 0;
  let ok = true;
  for (const t of sorted) {
    const tq = t.quantity * f;
    const unit = native === target ? t.price : convert(t.price, fx.on(native, t.date), fx.on(target, t.date));
    if (unit == null) {
      ok = false;
      continue;
    }
    if (t.side === 'buy') {
      quantity += tq;
      cost += tq * unit;
    } else {
      const sellQty = Math.min(tq, quantity);
      if (sellQty <= 0) continue;
      const removed = cost * (sellQty / quantity);
      realized += sellQty * unit - removed;
      cost -= removed;
      quantity -= sellQty;
      if (quantity < EPSILON) {
        quantity = 0;
        cost = 0;
      }
    }
  }
  return { cost, realized, ok };
}

export function computeHoldings(
  transactions: Transaction[],
  raw: Record<string, RawQuote>,
  manualPrices: Record<string, number>,
  history: FxHistory = {},
  /** Varlık anahtarına göre bedelsiz/bölünme ve temettü kayıtları. */
  actionsByKey: Record<string, CorporateAction[]> = {},
): Holding[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = assetKey(t.kind, t.symbol);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const fx = new FxRates(raw, history);
  const holdings: Holding[] = [];

  for (const [key, list] of groups) {
    const { kind, symbol } = list[0];
    const native = assetCurrency(kind, symbol);
    const sorted = sortTransactions(list);
    // Bedelsiz/bölünmeler önceki işlemlerin adet ve fiyatını düzeltir; temettüler kâra eklenir.
    const actions = actionsByKey[key] ?? [];
    const adjusted = applySplits(sorted, actions);
    const events = corporateEvents(sorted, actions);
    const dividendsNative = events.dividends.reduce((sum, d) => sum + d.amount, 0);
    const pos = computePosition(adjusted);
    const quote = resolveAssetQuote(kind, symbol, raw, manualPrices);
    const priceMissing = !quote;
    const price = quote?.price ?? pos.avgCost;
    // Eurobondlarda fiyat 100 nominal başına: değer = nominal × fiyat × 0,01
    const units = pos.quantity * priceFactor(kind);
    const marketValue = units * price;
    const unrealizedPnl = marketValue - pos.costBasis;
    const unrealizedPct = pos.costBasis > 0 ? (unrealizedPnl / pos.costBasis) * 100 : 0;
    const prev = quote?.previousClose != null && quote.previousClose > 0 ? quote.previousClose : undefined;

    let dayChange: number | undefined;
    let dayChangePct: number | undefined;
    if (quote && prev != null) {
      dayChange = units * (quote.price - prev);
      dayChangePct = ((quote.price - prev) / prev) * 100;
    }

    const views: Holding['views'] = {};
    for (const cur of DISPLAY_CURRENCIES) {
      const ledger = ledgerIn(adjusted, native, cur, fx);
      const nowRate = fx.now(native);
      const curNow = fx.now(cur);
      if (!ledger.ok || nowRate == null || curNow == null) continue;
      // Fiyat yoksa değer = maliyet (K/Z sıfır görünür).
      const value = priceMissing ? ledger.cost : convert(marketValue, nowRate, curNow)!;
      let viewDayChange: number | undefined;
      if (!priceMissing && prev != null) {
        const prevValue = convert(units * prev, fx.previous(native), fx.previous(cur));
        if (prevValue != null) viewDayChange = value - prevValue;
      }
      // Temettüler alındıkları günün kuruyla
      let dividends = 0;
      for (const d of events.dividends) {
        const conv = native === cur ? d.amount : convert(d.amount, fx.on(native, d.date), fx.on(cur, d.date));
        if (conv != null) dividends += conv;
      }
      const pnl = value - ledger.cost + dividends;
      views[cur] = {
        value,
        cost: ledger.cost,
        pnl,
        pnlPct: ledger.cost > 0 ? (pnl / ledger.cost) * 100 : 0,
        realized: ledger.realized,
        dividends,
        dayChange: viewDayChange,
      } satisfies MoneyView;
    }

    holdings.push({
      key,
      kind,
      symbol,
      name: fixedName(kind, symbol) ?? stockInfo(kind, symbol)?.name ?? quote?.name ?? symbol,
      currency: native,
      transactions: sorted,
      quantity: pos.quantity,
      avgCost: pos.avgCost,
      costBasis: pos.costBasis,
      realizedPnl: pos.realizedPnl,
      priceMissing,
      priceManual: quote?.manual === true,
      dividends: dividendsNative,
      dividendEvents: events.dividends,
      splitEvents: events.splits,
      price,
      previousClose: prev,
      marketValue,
      unrealizedPnl,
      unrealizedPct,
      dayChange,
      dayChangePct,
      views,
      valueTry: views.TRY?.value,
    });
  }

  // Elde olanlar değere göre, tamamen satılanlar en sonda.
  return holdings.sort((a, b) => {
    const aOpen = a.quantity > 0 ? 1 : 0;
    const bOpen = b.quantity > 0 ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return (b.valueTry ?? 0) - (a.valueTry ?? 0);
  });
}

function emptyTotals(): MoneyTotals {
  return { value: 0, cost: 0, pnl: 0, pnlPct: 0, dayChange: 0, dayChangePct: 0, dividends: 0, incomplete: false };
}

function addTo(t: MoneyTotals, v: MoneyView) {
  t.value += v.value;
  t.cost += v.cost;
  t.dayChange += v.dayChange ?? 0;
  t.dividends += v.dividends;
}

function finish(t: MoneyTotals): MoneyTotals {
  t.pnl = t.value - t.cost + t.dividends;
  t.pnlPct = t.cost > 0 ? (t.pnl / t.cost) * 100 : 0;
  const prevValue = t.value - t.dayChange;
  t.dayChangePct = prevValue > 0 ? (t.dayChange / prevValue) * 100 : 0;
  return t;
}

export function computeSummary(holdings: Holding[]): PortfolioSummary {
  const totals = Object.fromEntries(DISPLAY_CURRENCIES.map((c) => [c, emptyTotals()])) as Record<
    DisplayCurrency,
    MoneyTotals
  >;
  const byKind = new Map<AssetKind, Record<DisplayCurrency, MoneyTotals>>();

  for (const h of holdings) {
    if (h.quantity <= 0) continue;
    let kindTotals = byKind.get(h.kind);
    if (!kindTotals) {
      kindTotals = Object.fromEntries(DISPLAY_CURRENCIES.map((c) => [c, emptyTotals()])) as Record<
        DisplayCurrency,
        MoneyTotals
      >;
      byKind.set(h.kind, kindTotals);
    }
    for (const cur of DISPLAY_CURRENCIES) {
      const v = h.views[cur];
      if (!v) {
        totals[cur].incomplete = true;
        kindTotals[cur].incomplete = true;
        continue;
      }
      addTo(totals[cur], v);
      addTo(kindTotals[cur], v);
    }
  }

  for (const cur of DISPLAY_CURRENCIES) finish(totals[cur]);
  const totalTry = totals.TRY.value;

  const allocation: AllocationSlice[] = [...byKind.entries()]
    .map(([kind, t]) => {
      for (const cur of DISPLAY_CURRENCIES) finish(t[cur]);
      return { kind, valueTry: t.TRY.value, pct: totalTry > 0 ? (t.TRY.value / totalTry) * 100 : 0, totals: t };
    })
    .filter((s) => s.valueTry > 0)
    .sort((a, b) => b.valueTry - a.valueTry);

  return { totals, allocation };
}

/** Bir varlıkta şu an eldeki miktar (satış doğrulaması için). */
/** Eldeki miktar; bedelsiz/bölünmeler uygulanmış (satış kontrolü için). */
export function heldQuantity(
  transactions: Transaction[],
  kind: AssetKind,
  symbol: string,
  actions: CorporateAction[] = [],
): number {
  return computePosition(
    applySplits(
      transactions.filter((t) => t.kind === kind && t.symbol === symbol),
      actions,
    ),
  ).quantity;
}
