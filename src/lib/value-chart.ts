import { assetCurrency, assetKey, commodityInfo, isTryCash, priceFactor, TROY_OUNCE_GRAMS } from './assets';
import { BENCH_SYMBOLS, type BenchKey, type BenchSeries, txAmountTry } from './benchmarks';
import { applySplits } from './corporate';
import { historySymbolFor, type PriceHistory } from './history';
import { FxRates, rateOn, resolveAssetQuote, sortTransactions } from './portfolio';
import type { CorporateAction, DisplayCurrency, FxHistory, FxSeries, RawQuote, Transaction } from './types';

/**
 * Portföy değeri grafiği: her gün elde olan miktar × o günün kapanışı (kendi kuruyla seçili para birimine
 * çevrilmiş). Yanında "yatırılan para" (alışlar − satışlar, işlem günündeki kurla) ve aynı paralar aynı
 * günlerde ölçütlere yatırılsaydı oluşacak değer çizgileri.
 *
 * Geçmiş fiyatı olmayan günlerde (eurobond, elle fiyatlananlar, CoinGecko'nun 365 günü öncesi…) son
 * işlem fiyatı kullanılır; son nokta her zaman güncel fiyattır (ana sayfadaki toplamla aynı).
 * Alınan nakit temettüler değer çizgisine dahil değildir.
 */

export interface ValueChart {
  dates: string[];
  value: number[];
  invested: number[];
  bench: Partial<Record<BenchKey, number[]>>;
  /** Geçmiş fiyatı bulunamayıp işlem fiyatlarıyla çizilen varlıklar. */
  approximated: string[];
}

const DAY = 86_400_000;
const MAX_POINTS = 420;
const STALE_DAYS = 10;

const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;
const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** En eski işlemden bugüne tarih noktaları: uzun dönemlerde seyreltilir; işlem günleri ve bugün hep var. */
export function chartDates(transactions: Transaction[], today: string, maxPoints = MAX_POINTS): string[] {
  if (transactions.length === 0) return [];
  const first = toDay(transactions.reduce((m, t) => (t.date < m ? t.date : m), transactions[0].date));
  const last = toDay(today);
  const step = Math.max(1, Math.ceil((last - first) / maxPoints));
  const set = new Set<number>();
  for (let d = first; d <= last; d += step) set.add(d);
  for (const t of transactions) set.add(toDay(t.date));
  set.add(last);
  return [...set]
    .filter((d) => d <= last)
    .sort((a, b) => a - b)
    .map(fromDay);
}

interface BenchFn {
  key: BenchKey;
  /** O günün endeks değeri (TL). */
  on: (date: string) => number | undefined;
  now: number;
}

function lastPoint(s: FxSeries | undefined) {
  return s && s.dates.length ? { date: s.dates[s.dates.length - 1], value: s.rates[s.rates.length - 1] } : undefined;
}

function benchFns(
  earliest: string,
  today: string,
  raw: Record<string, RawQuote>,
  fx: FxRates,
  bench: BenchSeries,
): BenchFn[] {
  const out: BenchFn[] = [];
  const tr = bench.XU100TR;
  const trLast = lastPoint(tr);
  const staleBefore = fromDay(toDay(today) - STALE_DAYS);
  if (tr && trLast && tr.dates[0] <= earliest && trLast.date >= staleBefore) {
    out.push({ key: 'bist100', on: (d) => rateOn(tr, d), now: trLast.value });
  } else {
    const xu = bench['XU100.IS'];
    const now = raw[BENCH_SYMBOLS.bist100]?.price ?? lastPoint(xu)?.value;
    if (xu && now) out.push({ key: 'bist100', on: (d) => rateOn(xu, d), now });
  }
  const sp = bench['^SP500TR'];
  const spNow = raw[BENCH_SYMBOLS.sp500tr]?.price ?? lastPoint(sp)?.value;
  const usdNow = fx.now('USD');
  if (sp && spNow && usdNow) {
    out.push({
      key: 'sp500tr',
      on: (d) => {
        const p = rateOn(sp, d);
        const r = fx.on('USD', d);
        return p != null && r != null ? p * r : undefined;
      },
      now: spNow * usdNow,
    });
  }
  const cpi = bench.CPI;
  const cpiLast = lastPoint(cpi);
  if (cpi && cpiLast) {
    // Son açıklanan aydan sonrası için enflasyon bilinmiyor: son değerde kalır
    out.push({ key: 'cpi', on: (d) => rateOn(cpi, `${d.slice(0, 7)}-01`), now: cpiLast.value });
  }
  return out;
}

export function buildValueChart(input: {
  transactions: Transaction[];
  raw: Record<string, RawQuote>;
  manualPrices: Record<string, number>;
  fxHistory: FxHistory;
  priceHistory: PriceHistory;
  actionsByKey: Record<string, CorporateAction[]>;
  bench: BenchSeries;
  currency: DisplayCurrency;
  today: string;
}): ValueChart | null {
  const { transactions, raw, manualPrices, fxHistory, priceHistory, actionsByKey, bench, currency, today } = input;
  if (transactions.length === 0) return null;
  const fx = new FxRates(raw, fxHistory);
  const dates = chartDates(transactions, today);
  const n = dates.length;
  const value = new Array<number>(n).fill(0);
  const invested = new Array<number>(n).fill(0);
  const approximated: string[] = [];
  const toCur = (amount: number, native: Parameters<FxRates['on']>[0], date: string) => {
    if (native === currency) return amount;
    const a = date >= today ? fx.now(native) : fx.on(native, date);
    const b = date >= today ? fx.now(currency) : fx.on(currency, date);
    return a != null && b != null && b > 0 ? (amount * a) / b : undefined;
  };

  // Varlık başına
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const k = assetKey(t.kind, t.symbol);
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  for (const [key, list] of groups) {
    const { kind, symbol } = list[0];
    const native = assetCurrency(kind, symbol);
    const factor = priceFactor(kind);
    const txs = applySplits(sortTransactions(list), actionsByKey[key] ?? []);
    const hs = historySymbolFor(kind, symbol);
    const series = hs ? priceHistory[hs] : undefined;
    const metal = kind === 'metal' ? commodityInfo(symbol) : undefined;
    const current = resolveAssetQuote(kind, symbol, raw, manualPrices)?.price;
    if (!series && kind !== 'other' && !isTryCash(kind, symbol)) approximated.push(symbol);
    let qty = 0;
    let lastTxPrice = txs[0].price;
    let p = 0;
    for (let i = 0; i < n; i++) {
      const d = dates[i];
      while (p < txs.length && txs[p].date <= d) {
        const t = txs[p];
        qty = t.side === 'buy' ? qty + t.quantity : Math.max(0, qty - t.quantity);
        lastTxPrice = t.price;
        p++;
      }
      if (qty <= 0) continue;
      let price: number | undefined;
      if (d >= today && current != null) price = current;
      else if (series && d >= series.dates[0]) {
        const c = rateOn(series, d);
        if (c != null && metal) {
          if (metal.currency === 'USD') price = c;
          else {
            const usd = fx.on('USD', d);
            price = usd != null ? c * usd * (metal.unit === 'gram' ? 1 / TROY_OUNCE_GRAMS : 1) : undefined;
          }
        } else price = c;
      }
      price ??= lastTxPrice;
      const v = toCur(qty * factor * price, native, d);
      if (v != null) value[i] += v;
    }
  }

  // Yatırılan para ve ölçütler: işlem günlerindeki tutarlarla
  const sorted = sortTransactions(transactions);
  const fns = benchFns(sorted[0].date, today, raw, fx, bench);
  const units: Record<string, number> = {};
  const bench_: Partial<Record<BenchKey, number[]>> = {};
  for (const f of fns) {
    units[f.key] = 0;
    bench_[f.key] = new Array<number>(n).fill(0);
  }
  const broken = new Set<BenchKey>();
  let cum = 0;
  let p = 0;
  for (let i = 0; i < n; i++) {
    const d = dates[i];
    while (p < sorted.length && sorted[p].date <= d) {
      const t = sorted[p];
      const native = assetCurrency(t.kind, t.symbol);
      const amt = toCur(t.quantity * t.price * priceFactor(t.kind), native, t.date);
      if (amt != null) cum += t.side === 'buy' ? amt : -amt;
      const tl = txAmountTry(t, fx);
      for (const f of fns) {
        const idx = f.on(t.date);
        if (tl == null || idx == null || idx <= 0) {
          broken.add(f.key);
          continue;
        }
        units[f.key] = t.side === 'buy' ? units[f.key] + tl / idx : Math.max(0, units[f.key] - tl / idx);
      }
      p++;
    }
    invested[i] = cum;
    for (const f of fns) {
      const idx = d >= today ? f.now : f.on(d);
      const tlValue = idx != null ? units[f.key] * idx : undefined;
      const v = tlValue != null ? toCur(tlValue, 'TRY', d) : undefined;
      bench_[f.key]![i] = v ?? (i > 0 ? bench_[f.key]![i - 1] : 0);
    }
  }
  for (const k of broken) delete bench_[k];

  return { dates, value, invested, bench: bench_, approximated };
}

/** Grafikte görünen dönem: son N gün (ya da hepsi). */
export function sliceFrom(chart: ValueChart, days: number | null): number {
  if (days == null) return 0;
  const start = fromDay(toDay(chart.dates[chart.dates.length - 1]) - days);
  const i = chart.dates.findIndex((d) => d >= start);
  return Math.max(0, i);
}
