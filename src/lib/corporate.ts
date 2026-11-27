import type { CorporateAction, Transaction } from './types';

/**
 * Bedelsiz sermaye artırımı / bölünme ve nakit temettü.
 *
 * - Bölünme ve bedelsiz: hak kullanım (ex) gününden önce alınmış paylar çarpanla çoğalır, pay başı fiyat
 *   aynı oranda küçülür; toplam maliyet değişmez. Hak kullanım günü ya da sonrasında alınanlara
 *   dokunulmaz (o fiyat zaten yeni paylar içindir).
 * - Temettü: hak kullanım gününden önce elde olan pay sayısı × pay başına net temettü. Tutarlar o günün
 *   pay sayısına göredir (sonraki bölünmelerle küçültülmemiş).
 */

/** Bölünme/bedelsizlere göre düzeltilmiş işlemler (yeni nesneler; asıllar değişmez). */
export function applySplits(transactions: Transaction[], actions: CorporateAction[]): Transaction[] {
  const splits = actions.filter((a) => a.split != null && a.split > 0 && a.split !== 1);
  if (splits.length === 0) return transactions;
  return transactions.map((t) => {
    const factor = splits.filter((s) => s.date > t.date).reduce((f, s) => f * s.split!, 1);
    return factor === 1 ? t : { ...t, quantity: t.quantity * factor, price: t.price / factor };
  });
}

export interface DividendEvent {
  date: string;
  /** Pay başına net temettü. */
  perShare: number;
  /** Hak kullanım gününden önce eldeki pay sayısı. */
  quantity: number;
  amount: number;
}

export interface SplitEvent {
  date: string;
  split: number;
  /** Bölünmeden önce ve sonra eldeki pay sayısı. */
  before: number;
  after: number;
}

/** Verilen günden önce (o gün hariç) eldeki pay sayısı; o güne kadarki bölünmeler uygulanmış. */
export function quantityBefore(transactions: Transaction[], actions: CorporateAction[], date: string): number {
  const earlier = actions.filter((a) => a.date < date);
  let qty = 0;
  for (const t of applySplits(
    transactions.filter((x) => x.date < date),
    earlier,
  ).sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))) {
    if (t.side === 'buy') qty += t.quantity;
    else qty = Math.max(0, qty - t.quantity);
  }
  return qty;
}

/** Varlığın elde tutulduğu sürede aldığı temettüler ve geçirdiği bölünmeler. */
export function corporateEvents(
  transactions: Transaction[],
  actions: CorporateAction[],
): { dividends: DividendEvent[]; splits: SplitEvent[] } {
  const dividends: DividendEvent[] = [];
  const splits: SplitEvent[] = [];
  if (transactions.length === 0) return { dividends, splits };
  const first = transactions.reduce((m, t) => (t.date < m ? t.date : m), transactions[0].date);
  for (const a of [...actions].sort((x, y) => (x.date < y.date ? -1 : 1))) {
    if (a.date <= first) continue;
    const qty = quantityBefore(transactions, actions, a.date);
    if (qty <= 0) continue;
    if (a.dividend != null && a.dividend > 0) {
      dividends.push({ date: a.date, perShare: a.dividend, quantity: qty, amount: qty * a.dividend });
    }
    if (a.split != null && a.split > 0 && a.split !== 1) {
      splits.push({ date: a.date, split: a.split, before: qty, after: qty * a.split });
    }
  }
  return { dividends, splits };
}
