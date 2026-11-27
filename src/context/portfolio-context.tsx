import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { assetKey, isManualPriced, quoteSymbolFor } from '@/lib/assets';
import { makeBackup, mergeTransactions, type BackupData } from '@/lib/backup';
import { BENCH_SYMBOLS, computeBenchmarks, type BenchmarkResult, type BenchSeries } from '@/lib/benchmarks';
import { computeHoldings, computeSummary, DISPLAY_CURRENCIES, FxRates, requiredQuoteSymbols } from '@/lib/portfolio';
import {
  BIST100_TR_CODE,
  fetchAnyQuotes,
  fetchBistActions,
  fetchBistIndex,
  fetchHistory,
  fetchTurkeyCpi,
  fetchYahooActions,
  historyRange,
  WEB_DATA_BASE,
} from '@/lib/prices';
import {
  loadAll,
  saveBenchSeries,
  saveCorporateActions,
  saveDisplayCurrency,
  saveFxHistory,
  saveManualPrices,
  saveQuotes,
  saveTargets,
  saveTransactions,
  type StoredActions,
} from '@/lib/storage';
import type {
  AssetKind,
  CorporateAction,
  DisplayCurrency,
  FxHistory,
  Holding,
  PortfolioSummary,
  RawQuote,
  Transaction,
} from '@/lib/types';

/** Uygulama öne geldiğinde fiyatlar bu süreden eskiyse yenilenir. */
const STALE_MS = 2 * 60 * 1000;
/** Kur geçmişi bu süreden eskiyse yeniden çekilir. */
const HISTORY_TTL_MS = 12 * 60 * 60 * 1000;
const RANGE_ORDER = ['1y', '2y', '5y', '10y', 'max'];

/** Gerekirse USD/TRY ve EUR/TRY geçmişini çeker; değişiklik yoksa null döner. */
async function refreshFxHistory(transactions: Transaction[], current: FxHistory): Promise<FxHistory | null> {
  if (transactions.length === 0) return null;
  const earliest = transactions.reduce((m, t) => (t.date < m ? t.date : m), transactions[0].date);
  const range = historyRange(earliest);
  const needed = (['USD', 'EUR'] as const).filter((cur) => {
    const s = current[cur];
    if (!s || s.dates.length === 0) return true;
    if (Date.now() - s.fetchedAt > HISTORY_TTL_MS) return true;
    return RANGE_ORDER.indexOf(range) > RANGE_ORDER.indexOf(s.range ?? '1y');
  });
  if (needed.length === 0) return null;
  const results = await Promise.allSettled(needed.map((cur) => fetchHistory(`${cur}TRY=X`, range)));
  const next: FxHistory = { ...current };
  let changed = false;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      next[needed[i]] = { ...r.value, range };
      changed = true;
    }
  });
  return changed ? next : null;
}

const ACTIONS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Elde tutulan BIST ve ABD hisse/ETF'lerinin bedelsiz/bölünme ve temettü kayıtlarını günde bir yeniler
 * (BIST: İş Yatırım, ABD: Yahoo). Değişiklik yoksa null. Tarayıcı bu kaynaklara erişemediği için web
 * sürümünde çalışmaz.
 */
async function refreshCorporateActions(
  transactions: Transaction[],
  current: StoredActions,
): Promise<StoredActions | null> {
  if (Platform.OS === 'web') return null;
  const assets = new Map<string, { kind: AssetKind; symbol: string; from: string }>();
  for (const t of transactions) {
    if (t.kind !== 'bist' && t.kind !== 'us' && t.kind !== 'etf') continue;
    const key = assetKey(t.kind, t.symbol);
    const a = assets.get(key);
    if (!a) assets.set(key, { kind: t.kind, symbol: t.symbol, from: t.date });
    else if (t.date < a.from) a.from = t.date;
  }
  const stale = [...assets.entries()].filter(([key]) => {
    const c = current[key];
    return !c || Date.now() - c.fetchedAt > ACTIONS_TTL_MS;
  });
  if (stale.length === 0) return null;
  const next: StoredActions = { ...current };
  let changed = false;
  for (let i = 0; i < stale.length; i += 4) {
    const part = stale.slice(i, i + 4);
    const settled = await Promise.allSettled(
      part.map(([, a]) =>
        a.kind === 'bist'
          ? fetchBistActions(a.symbol)
          : fetchYahooActions(quoteSymbolFor(a.kind, a.symbol) ?? a.symbol, a.from),
      ),
    );
    settled.forEach((r, k) => {
      if (r.status === 'fulfilled') {
        next[part[k][0]] = { fetchedAt: Date.now(), actions: r.value };
        changed = true;
      }
    });
  }
  return changed ? next : null;
}

/**
 * Karşılaştırma ölçütlerinin geçmişini gerekirse günceller. BIST 100 getiri endeksi: saatte bir (büyük geçmiş
 * dosyası yalnız yeni kapanış çıkınca iner); BIST 100 fiyat endeksi ve S&P 500 TR: 12 saat; TÜFE: 1 gün.
 */
async function refreshBenchSeries(transactions: Transaction[], current: BenchSeries): Promise<BenchSeries | null> {
  if (transactions.length === 0) return null;
  const earliest = transactions.reduce((m, t) => (t.date < m ? t.date : m), transactions[0].date);
  const range = historyRange(earliest);
  const stale = (s: BenchSeries[keyof BenchSeries], ttl: number, needFrom?: string) =>
    !s ||
    s.dates.length === 0 ||
    Date.now() - s.fetchedAt > ttl ||
    (needFrom != null && s.dates[0] > needFrom) ||
    (needFrom == null && RANGE_ORDER.indexOf(range) > RANGE_ORDER.indexOf(s.range ?? '1y'));
  const jobs: Promise<[keyof BenchSeries, BenchSeries[keyof BenchSeries]]>[] = [];
  for (const sym of Object.values(BENCH_SYMBOLS)) {
    if (stale(current[sym], HISTORY_TTL_MS)) {
      jobs.push(fetchHistory(sym, range).then((s) => [sym, { ...s, range }]));
    }
  }
  // Borsa İstanbul tarayıcıdan erişime (CORS) izin vermiyor: web sürümünde, GitHub'ın hazırladığı veri
  // dosyası yoksa fiyat endeksi kullanılır.
  if ((Platform.OS !== 'web' || WEB_DATA_BASE) && stale(current.XU100TR, 60 * 60 * 1000, earliest)) {
    jobs.push(fetchBistIndex(BIST100_TR_CODE, earliest, current.XU100TR).then((s) => ['XU100TR', s]));
  }
  const cpiFrom = `${earliest.slice(0, 7)}-01`;
  if (stale(current.CPI, 24 * 60 * 60 * 1000, cpiFrom)) {
    // Bir yıl öncesinden istenir: en eski alış son açıklanan aydan sonra olsa bile son ay bilinsin.
    jobs.push(
      fetchTurkeyCpi(Number(earliest.slice(0, 4)) - 1, undefined, {
        tcmb: Platform.OS !== 'web' || WEB_DATA_BASE != null,
      }).then((s) => ['CPI', s]),
    );
  }
  if (jobs.length === 0) return null;
  const results = await Promise.allSettled(jobs);
  const next: BenchSeries = { ...current };
  let changed = false;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      next[r.value[0]] = r.value[1];
      changed = true;
    }
  }
  return changed ? next : null;
}

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>;

interface PortfolioContextValue {
  ready: boolean;
  transactions: Transaction[];
  quotes: Record<string, RawQuote>;
  holdings: Holding[];
  summary: PortfolioSummary;
  /** BIST 100, S&P 500 (TR) ve TÜFE ile karşılaştırma. */
  benchmarks: BenchmarkResult[];
  refreshing: boolean;
  lastUpdated?: number;
  error?: string;
  /** Ana sayfada tutarların gösterildiği para birimi. */
  displayCurrency: DisplayCurrency;
  cycleDisplayCurrency: () => void;
  refresh: () => Promise<void>;
  addTransaction: (t: NewTransaction) => void;
  deleteTransaction: (id: string) => void;
  setManualPrice: (kind: AssetKind, symbol: string, price: number) => void;
  /** Elle girilen güncel fiyatlar (anahtar: "tür:sembol"). */
  manualPrices: Record<string, number>;
  /** Varlık anahtarına göre bedelsiz/bölünme ve temettü kayıtları. */
  actionsByKey: Record<string, CorporateAction[]>;
  exportBackup: () => string;
  importBackup: (data: BackupData, mode: 'replace' | 'merge') => void;
  /** Dengeleme hedef oranları (varlık anahtarı → %). */
  targets: Record<string, number>;
  setTargets: (targets: Record<string, number>) => void;
  /** İşlemleri topluca ekler ("merge": aynı kimlikliler atlanır) ya da yerine koyar; hedefler verilirse onlar da. */
  importTransactions: (
    transactions: Transaction[],
    mode: 'replace' | 'merge',
    targets?: Record<string, number>,
  ) => void;
  /** Bir gündeki dolar kuru (TL). */
  usdTryOn: (date: string) => number | undefined;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({});
  const [quotes, setQuotes] = useState<Record<string, RawQuote>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>();
  const [error, setError] = useState<string>();
  const [fxHistory, setFxHistory] = useState<FxHistory>({});
  const [benchSeries, setBenchSeries] = useState<BenchSeries>({});
  const [corporateActions, setCorporateActions] = useState<StoredActions>({});
  const [targets, setTargetsState] = useState<Record<string, number>>({});
  const actionsRef = useRef(corporateActions);
  useEffect(() => {
    actionsRef.current = corporateActions;
  }, [corporateActions]);
  const benchSeriesRef = useRef(benchSeries);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('TRY');
  // Geri çağırmaların her zaman son değeri görmesi için; değişiklik yapan işleyiciler de bunları hemen günceller.
  const fxHistoryRef = useRef(fxHistory);
  const transactionsRef = useRef(transactions);
  const lastUpdatedRef = useRef(lastUpdated);
  const inFlight = useRef<Promise<void> | null>(null);
  useEffect(() => {
    fxHistoryRef.current = fxHistory;
  }, [fxHistory]);
  useEffect(() => {
    benchSeriesRef.current = benchSeries;
  }, [benchSeries]);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);
  useEffect(() => {
    lastUpdatedRef.current = lastUpdated;
  }, [lastUpdated]);

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setRefreshing(true);
      try {
        const own = requiredQuoteSymbols(transactionsRef.current);
        // Karşılaştırma ölçütlerinin güncel değerleri de aynı toplu istekte.
        const symbols = transactionsRef.current.length ? [...own, ...Object.values(BENCH_SYMBOLS)] : own;
        const fresh = await fetchAnyQuotes(symbols);
        const failed = own.filter((sym) => !fresh[sym]).map((sym) => sym.replace(/^CG:/, ''));
        const gotAny = Object.keys(fresh).length > 0;
        setQuotes((prev) => {
          const merged = { ...prev, ...fresh };
          saveQuotes(merged).catch(() => {});
          return merged;
        });
        if (gotAny) setLastUpdated(Date.now());
        if (!gotAny) setError('Fiyatlar alınamadı. İnternet bağlantını kontrol et.');
        else if (failed.length > 0) setError(`Bazı fiyatlar alınamadı: ${failed.join(', ')}`);
        else setError(undefined);
        // Döviz bazında kâr/zarar için alış günlerindeki kurlar.
        const history = await refreshFxHistory(transactionsRef.current, fxHistoryRef.current).catch(() => null);
        if (history) {
          fxHistoryRef.current = history;
          setFxHistory(history);
          saveFxHistory(history).catch(() => {});
        }
        const acts = await refreshCorporateActions(transactionsRef.current, actionsRef.current).catch(() => null);
        if (acts) {
          actionsRef.current = acts;
          setCorporateActions(acts);
          saveCorporateActions(acts).catch(() => {});
        }
        const bench = await refreshBenchSeries(transactionsRef.current, benchSeriesRef.current).catch(() => null);
        if (bench) {
          benchSeriesRef.current = bench;
          setBenchSeries(bench);
          saveBenchSeries(bench).catch(() => {});
        }
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  // Kayıtlı verileri yükle, sonra fiyatları yenile.
  useEffect(() => {
    let cancelled = false;
    loadAll().then((data) => {
      if (cancelled) return;
      setTransactions(data.transactions);
      transactionsRef.current = data.transactions;
      setManualPrices(data.manualPrices);
      setQuotes(data.quotes);
      setFxHistory(data.fxHistory);
      fxHistoryRef.current = data.fxHistory;
      setBenchSeries(data.benchSeries);
      benchSeriesRef.current = data.benchSeries;
      setCorporateActions(data.corporateActions);
      actionsRef.current = data.corporateActions;
      setTargetsState(data.targets);
      setDisplayCurrency(data.displayCurrency);
      const times = Object.values(data.quotes).map((q) => q.fetchedAt);
      if (times.length) setLastUpdated(Math.max(...times));
      setReady(true);
      refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Uygulama öne geldiğinde eski fiyatları yenile.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && (!lastUpdatedRef.current || Date.now() - lastUpdatedRef.current > STALE_MS)) {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const addTransaction = useCallback(
    (t: NewTransaction) => {
      const tx: Transaction = { ...t, id: newId(), createdAt: Date.now() };
      const isNewAsset = !transactionsRef.current.some((x) => x.kind === t.kind && x.symbol === t.symbol);
      const isOldest = transactionsRef.current.every((x) => t.date < x.date);
      const next = [...transactionsRef.current, tx];
      transactionsRef.current = next;
      setTransactions(next);
      saveTransactions(next).catch(() => {});
      if (isManualPriced(t.kind)) {
        // Elle fiyatlanan varlıkta henüz fiyat yoksa ilk işlem fiyatını güncel fiyat kabul et.
        const key = assetKey(t.kind, t.symbol);
        setManualPrices((prev) => {
          if (prev[key] != null) return prev;
          const nextPrices = { ...prev, [key]: t.price };
          saveManualPrices(nextPrices).catch(() => {});
          return nextPrices;
        });
      }
      if ((isNewAsset && !isManualPriced(t.kind)) || isOldest) refresh();
    },
    [refresh],
  );

  const deleteTransaction = useCallback((id: string) => {
    const next = transactionsRef.current.filter((t) => t.id !== id);
    transactionsRef.current = next;
    setTransactions(next);
    saveTransactions(next).catch(() => {});
  }, []);

  const setManualPrice = useCallback((kind: AssetKind, symbol: string, price: number) => {
    setManualPrices((prev) => {
      const next = { ...prev, [assetKey(kind, symbol)]: price };
      saveManualPrices(next).catch(() => {});
      return next;
    });
  }, []);

  /** Dengeleme hedef oranlarını kaydeder (varlık anahtarı → %). */
  const setTargets = useCallback((next: Record<string, number>) => {
    setTargetsState(next);
    saveTargets(next).catch(() => {});
  }, []);

  /** Yedek dosyasının içeriği (JSON). */
  const exportBackup = useCallback(
    () =>
      makeBackup({
        transactions: transactionsRef.current,
        manualPrices,
        displayCurrency,
        extra: { targets },
      }),
    [manualPrices, displayCurrency, targets],
  );

  /** Yedekten geri yükler: "replace" mevcut işlemlerin yerine koyar, "merge" eksik olanları ekler. */
  const importTransactions = useCallback(
    (incoming: Transaction[], mode: 'replace' | 'merge', newTargets?: Record<string, number>) => {
      const next = mode === 'replace' ? incoming : mergeTransactions(transactionsRef.current, incoming);
      transactionsRef.current = next;
      setTransactions(next);
      saveTransactions(next).catch(() => {});
      if (newTargets && Object.keys(newTargets).length) {
        setTargetsState(newTargets);
        saveTargets(newTargets).catch(() => {});
      }
      refresh();
    },
    [refresh],
  );

  const usdTryOn = useCallback((date: string) => new FxRates(quotes, fxHistory).on('USD', date), [quotes, fxHistory]);

  const importBackup = useCallback(
    (data: BackupData, mode: 'replace' | 'merge') => {
      const next =
        mode === 'replace' ? data.transactions : mergeTransactions(transactionsRef.current, data.transactions);
      transactionsRef.current = next;
      setTransactions(next);
      saveTransactions(next).catch(() => {});
      setManualPrices((prev) => {
        const prices = mode === 'replace' ? data.manualPrices : { ...data.manualPrices, ...prev };
        saveManualPrices(prices).catch(() => {});
        return prices;
      });
      if (mode === 'replace') {
        setDisplayCurrency(data.displayCurrency);
        saveDisplayCurrency(data.displayCurrency).catch(() => {});
      }
      const savedTargets = data.extra?.targets;
      if (savedTargets && typeof savedTargets === 'object') {
        setTargetsState((prev) => {
          const next = mode === 'replace' ? (savedTargets as Record<string, number>) : { ...savedTargets, ...prev };
          saveTargets(next).catch(() => {});
          return next;
        });
      }
      refresh();
    },
    [refresh],
  );

  const cycleDisplayCurrency = useCallback(() => {
    setDisplayCurrency((prev) => {
      const next = DISPLAY_CURRENCIES[(DISPLAY_CURRENCIES.indexOf(prev) + 1) % DISPLAY_CURRENCIES.length];
      saveDisplayCurrency(next).catch(() => {});
      return next;
    });
  }, []);

  const actionsByKey = useMemo(
    () => Object.fromEntries(Object.entries(corporateActions).map(([k, v]) => [k, v.actions])),
    [corporateActions],
  );
  const holdings = useMemo(
    () => computeHoldings(transactions, quotes, manualPrices, fxHistory, actionsByKey),
    [transactions, quotes, manualPrices, fxHistory, actionsByKey],
  );
  const summary = useMemo(() => computeSummary(holdings), [holdings]);
  // Karşılaştırmada portföy değerine alınan temettüler de eklenir (ölçütler temettüler dahil).
  const benchmarks = useMemo(
    () =>
      computeBenchmarks(
        transactions,
        summary.totals.TRY.value + summary.totals.TRY.dividends,
        quotes,
        fxHistory,
        benchSeries,
      ),
    [transactions, summary, quotes, fxHistory, benchSeries],
  );

  const value = useMemo<PortfolioContextValue>(
    () => ({
      ready,
      transactions,
      quotes,
      holdings,
      summary,
      benchmarks,
      refreshing,
      lastUpdated,
      error,
      displayCurrency,
      cycleDisplayCurrency,
      refresh,
      addTransaction,
      deleteTransaction,
      setManualPrice,
      manualPrices,
      actionsByKey,
      exportBackup,
      importBackup,
      targets,
      setTargets,
      importTransactions,
      usdTryOn,
    }),
    [
      manualPrices,
      actionsByKey,
      exportBackup,
      importBackup,
      targets,
      setTargets,
      importTransactions,
      usdTryOn,
      displayCurrency,
      cycleDisplayCurrency,
      ready,
      transactions,
      quotes,
      holdings,
      summary,
      benchmarks,
      refreshing,
      lastUpdated,
      error,
      refresh,
      addTransaction,
      deleteTransaction,
      setManualPrice,
    ],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio, PortfolioProvider içinde kullanılmalı');
  return ctx;
}
