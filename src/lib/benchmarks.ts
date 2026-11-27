import { assetCurrency } from './assets';
import { FxRates, rateOn, sortTransactions } from './portfolio';
import type { FxHistory, FxSeries, RawQuote, Transaction } from './types';

/**
 * Karşılaştırma ölçütleri:
 * - BIST 100 getiri endeksi (XU100_CFNNTLTL, temettüler dahil; Borsa İstanbul'dan). Alınamazsa
 *   Yahoo'daki fiyat endeksine (XU100.IS, temettüler hariç) düşülür.
 * - S&P 500 Total Return (^SP500TR, temettüler dahil; TL'ye günlük kurla çevrilir)
 * - TÜİK TÜFE (aylık endeks; paranın satın alma gücü)
 */
export type BenchKey = 'bist100' | 'sp500tr' | 'cpi';

export const BENCH_SYMBOLS = { bist100: 'XU100.IS', sp500tr: '^SP500TR' } as const;
export const BENCH_KEYS: BenchKey[] = ['bist100', 'sp500tr', 'cpi'];

/**
 * Endeks geçmişleri: "XU100TR" (BIST 100 getiri endeksi, son nokta anlık değer), "XU100.IS", "^SP500TR"
 * (günlük) ve "CPI" (aylık, tarih = ayın 1'i).
 */
export type BenchSeries = Partial<Record<'XU100TR' | 'XU100.IS' | '^SP500TR' | 'CPI', FxSeries>>;

/** Getiri endeksi serisi bu kadar gündür güncellenmediyse fiyat endeksine düşülür (uzun bayram tatili payı). */
const STALE_DAYS = 10;

export interface BenchmarkResult {
  key: BenchKey;
  /** Aynı günlerde aynı TL tutarlarla bu ölçüt alınsaydı bugünkü değeri (TL). */
  value: number;
  /** Portföyün bugünkü değeri (TL). */
  portfolioValue: number;
  /** Portföy bu ölçüte göre yüzde kaç önde/geride: (portföy / ölçüt − 1) × 100. */
  diffPct: number;
  /** Verinin son tarihi (TÜFE'de son ay "YYYY-AA"). */
  asOf?: string;
  /** Bazı işlemler verinin son ayından sonra: o işlemler için enflasyon henüz hesaba katılamadı. */
  partial?: boolean;
  /** Hiçbir işlem için veri yok (tüm alışlar son açıklanan aydan sonra); value ve diffPct anlamsız. */
  missing?: boolean;
  /** BIST 100'de kullanılan endeks: getiri (temettüler dahil) ya da fiyat (temettüler hariç). */
  variant?: 'total' | 'price';
}

/** İşlemin o günkü TL tutarı (dolarlı varlıklar işlem günündeki kurla). */
export function txAmountTry(t: Transaction, fx: FxRates): number | undefined {
  const rate = fx.on(assetCurrency(t.kind, t.symbol), t.date);
  return rate == null ? undefined : t.quantity * t.price * rate;
}

/**
 * Nakit akışlarını ölçüte uygular: her alışta o TL tutarıyla ölçütten pay alınır, her satışta o tutar
 * kadar pay satılır. Bugünkü değer döner. Bir işlem gününün fiyatı bilinmiyorsa undefined.
 */
export function simulate(
  transactions: Transaction[],
  fx: FxRates,
  priceOn: (date: string) => number | undefined,
  priceNow: number,
): number | undefined {
  let units = 0;
  for (const t of sortTransactions(transactions)) {
    const amount = txAmountTry(t, fx);
    const p = priceOn(t.date);
    if (amount == null || p == null || p <= 0) return undefined;
    if (t.side === 'buy') units += amount / p;
    else units = Math.max(0, units - amount / p);
  }
  return units * priceNow;
}

function last(series: FxSeries | undefined): { date: string; value: number } | undefined {
  if (!series || series.dates.length === 0) return undefined;
  const i = series.dates.length - 1;
  return { date: series.dates[i], value: series.rates[i] };
}

/** Portföyü üç ölçütle karşılaştırır. Verisi eksik ölçütler listede yer almaz. */
export function computeBenchmarks(
  transactions: Transaction[],
  portfolioValueTry: number,
  raw: Record<string, RawQuote>,
  fxHistory: FxHistory,
  bench: BenchSeries,
  today: string = new Date().toISOString().slice(0, 10),
): BenchmarkResult[] {
  if (transactions.length === 0 || !(portfolioValueTry > 0)) return [];
  const fx = new FxRates(raw, fxHistory);
  const out: BenchmarkResult[] = [];
  const push = (key: BenchKey, value: number | undefined, extra: Partial<BenchmarkResult> = {}) => {
    if (value == null || !(value > 0)) return;
    out.push({
      key,
      value,
      portfolioValue: portfolioValueTry,
      diffPct: (portfolioValueTry / value - 1) * 100,
      ...extra,
    });
  };

  // BIST 100 (TL): getiri endeksi işlemlerin ilk gününü kapsıyor ve güncelse o, yoksa fiyat endeksi
  const earliest = transactions.reduce((m, t) => (t.date < m ? t.date : m), transactions[0].date);
  const tr = bench.XU100TR;
  const trLast = last(tr);
  const staleBefore = new Date(Date.parse(today) - STALE_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (tr && trLast && tr.dates[0] <= earliest && trLast.date >= staleBefore) {
    push(
      'bist100',
      simulate(transactions, fx, (d) => rateOn(tr, d), trLast.value),
      { variant: 'total' },
    );
  } else {
    const xu = bench['XU100.IS'];
    const xuNow = raw[BENCH_SYMBOLS.bist100]?.price ?? last(xu)?.value;
    if (xu && xuNow) {
      push(
        'bist100',
        simulate(transactions, fx, (d) => rateOn(xu, d), xuNow),
        { variant: 'price' },
      );
    }
  }

  // S&P 500 Total Return (USD → TL, günlük kurla)
  const sp = bench['^SP500TR'];
  const spNow = raw[BENCH_SYMBOLS.sp500tr]?.price ?? last(sp)?.value;
  const usdNow = fx.now('USD');
  if (sp && spNow && usdNow) {
    push(
      'sp500tr',
      simulate(
        transactions,
        fx,
        (d) => {
          const p = rateOn(sp, d);
          const r = fx.on('USD', d);
          return p != null && r != null ? p * r : undefined;
        },
        spNow * usdNow,
      ),
    );
  }

  // TÜİK TÜFE: aylık endeks; işlem ayının endeksiyle son açıklanan ayın endeksi karşılaştırılır.
  // Son açıklanan aydan sonraki işlemlerde enflasyon henüz bilinmediği için tutar olduğu gibi kalır.
  const cpi = bench.CPI;
  const cpiNow = last(cpi);
  if (cpi && cpiNow) {
    const asOf = cpiNow.date.slice(0, 7);
    const after = transactions.filter((t) => t.date.slice(0, 7) > asOf).length;
    if (after === transactions.length) {
      out.push({ key: 'cpi', value: 0, portfolioValue: portfolioValueTry, diffPct: 0, asOf, missing: true });
    } else {
      push(
        'cpi',
        simulate(transactions, fx, (d) => rateOn(cpi, `${d.slice(0, 7)}-01`), cpiNow.value),
        {
          asOf,
          partial: after > 0,
        },
      );
    }
  }
  return out;
}
