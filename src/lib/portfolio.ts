import { assetKey, fixedName, kindInfo, METAL_SOURCE, quoteSymbolFor, TROY_OUNCE_GRAMS, USDTRY_SYMBOL } from './assets';
import type { AllocationSlice, AssetKind, AssetQuote, Holding, PortfolioSummary, RawQuote, Transaction } from './types';

const EPSILON = 1e-9;

export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}

export interface Position {
  quantity: number;
  avgCost: number;
  costBasis: number;
  realizedPnl: number;
}

/** Ortalama maliyet yöntemiyle pozisyonu hesaplar. Eldekinden fazla satış eldeki miktarla sınırlanır. */
export function computePosition(transactions: Transaction[]): Position {
  let quantity = 0;
  let costBasis = 0;
  let realizedPnl = 0;
  for (const t of sortTransactions(transactions)) {
    if (t.side === 'buy') {
      quantity += t.quantity;
      costBasis += t.quantity * t.price;
    } else {
      const sellQty = Math.min(t.quantity, quantity);
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
  return { quantity, avgCost: quantity > 0 ? costBasis / quantity : 0, costBasis, realizedPnl };
}

/** Bir varlık için gereken ham sembollerin listesi (USD/TRY kuru her zaman eklenir). */
export function requiredQuoteSymbols(transactions: Transaction[]): string[] {
  const set = new Set<string>([USDTRY_SYMBOL]);
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
  if (kind === 'other') {
    const p = manualPrices[assetKey(kind, symbol)];
    return p != null && Number.isFinite(p) ? { price: p, manual: true } : undefined;
  }
  if (kind === 'metal') {
    const ounce = raw[METAL_SOURCE[symbol]];
    const usd = raw[USDTRY_SYMBOL];
    if (!ounce || !usd) return undefined;
    const price = (ounce.price * usd.price) / TROY_OUNCE_GRAMS;
    const previousClose =
      ounce.previousClose != null && usd.previousClose != null
        ? (ounce.previousClose * usd.previousClose) / TROY_OUNCE_GRAMS
        : undefined;
    return { price, previousClose, fetchedAt: Math.min(ounce.fetchedAt, usd.fetchedAt) };
  }
  const s = quoteSymbolFor(kind, symbol);
  const q = s ? raw[s] : undefined;
  if (!q) return undefined;
  return { price: q.price, previousClose: q.previousClose, name: q.name, fetchedAt: q.fetchedAt };
}

export function computeHoldings(
  transactions: Transaction[],
  raw: Record<string, RawQuote>,
  manualPrices: Record<string, number>,
): Holding[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = assetKey(t.kind, t.symbol);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const usdTry = raw[USDTRY_SYMBOL];
  const holdings: Holding[] = [];

  for (const [key, list] of groups) {
    const { kind, symbol } = list[0];
    const info = kindInfo(kind);
    const pos = computePosition(list);
    const quote = resolveAssetQuote(kind, symbol, raw, manualPrices);
    const priceMissing = !quote;
    const price = quote?.price ?? pos.avgCost;
    const marketValue = pos.quantity * price;
    const unrealizedPnl = marketValue - pos.costBasis;
    const unrealizedPct = pos.costBasis > 0 ? (unrealizedPnl / pos.costBasis) * 100 : 0;

    let dayChange: number | undefined;
    let dayChangePct: number | undefined;
    if (quote?.previousClose != null && quote.previousClose > 0) {
      dayChange = pos.quantity * (quote.price - quote.previousClose);
      dayChangePct = ((quote.price - quote.previousClose) / quote.previousClose) * 100;
    }

    const rate = info.currency === 'TRY' ? 1 : usdTry?.price;
    const toTry = (v: number | undefined) => (v == null || rate == null ? undefined : v * rate);

    holdings.push({
      key,
      kind,
      symbol,
      name: fixedName(kind, symbol) ?? quote?.name ?? symbol,
      currency: info.currency,
      transactions: sortTransactions(list),
      quantity: pos.quantity,
      avgCost: pos.avgCost,
      costBasis: pos.costBasis,
      realizedPnl: pos.realizedPnl,
      priceMissing,
      price,
      previousClose: quote?.previousClose,
      marketValue,
      unrealizedPnl,
      unrealizedPct,
      dayChange,
      dayChangePct,
      valueTry: toTry(marketValue),
      costTry: toTry(pos.costBasis),
      pnlTry: toTry(unrealizedPnl),
      dayChangeTry: toTry(dayChange),
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

export function computeSummary(holdings: Holding[]): PortfolioSummary {
  let valueTry = 0;
  let costTry = 0;
  let dayChangeTry = 0;
  let incomplete = false;
  const byKind = new Map<AssetKind, number>();

  for (const h of holdings) {
    if (h.quantity <= 0) continue;
    if (h.valueTry == null || h.costTry == null) {
      incomplete = true;
      continue;
    }
    valueTry += h.valueTry;
    costTry += h.costTry;
    dayChangeTry += h.dayChangeTry ?? 0;
    byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + h.valueTry);
  }

  const allocation: AllocationSlice[] = [...byKind.entries()]
    .map(([kind, v]) => ({ kind, valueTry: v, pct: valueTry > 0 ? (v / valueTry) * 100 : 0 }))
    .sort((a, b) => b.valueTry - a.valueTry);

  const pnlTry = valueTry - costTry;
  const prevValue = valueTry - dayChangeTry;
  return {
    valueTry,
    costTry,
    pnlTry,
    pnlPct: costTry > 0 ? (pnlTry / costTry) * 100 : 0,
    dayChangeTry,
    dayChangePct: prevValue > 0 ? (dayChangeTry / prevValue) * 100 : 0,
    incomplete,
    allocation,
  };
}

/** Bir varlıkta şu an eldeki miktar (satış doğrulaması için). */
export function heldQuantity(transactions: Transaction[], kind: AssetKind, symbol: string): number {
  return computePosition(transactions.filter((t) => t.kind === kind && t.symbol === symbol)).quantity;
}
