import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { assetKey, isManualPriced, quoteSymbolFor } from '@/lib/assets';
import { makeBackup, mergeTransactions, type BackupData } from '@/lib/backup';
import { BENCH_SYMBOLS, computeBenchmarks, type BenchmarkResult, type BenchSeries } from '@/lib/benchmarks';
import { sendAlertNotifications, syncAlertTask } from '@/lib/alert-task';
import { alertQuoteSymbols, checkAlerts, markFired, validAlerts, type PriceAlert } from '@/lib/alerts';
import { todayIso } from '@/lib/format';
import {
  ALL_PORTFOLIOS,
  DEFAULT_PORTFOLIOS,
  filterByPortfolio,
  MAIN_PORTFOLIO,
  migrateTargets,
  normalizePortfolios,
  portfolioOf,
  targetPortfolio,
  uniqueName,
  validActive,
  type Portfolio,
  type TargetsByPortfolio,
} from '@/lib/portfolios';
import { refreshPriceHistory, type PriceHistory } from '@/lib/history';
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
  saveAlerts,
  saveBenchSeries,
  saveCorporateActions,
  saveDisplayCurrency,
  saveFxHistory,
  saveManualPrices,
  savePriceHistory,
  saveQuotes,
  saveActivePortfolio,
  savePortfolios,
  saveTargetsByPortfolio,
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
import { buildValueChart, type ValueChart } from '@/lib/value-chart';
import { syncWidget } from '@/lib/widget-sync';
import { buildWidgetProps } from '@/widgets/portfolio-widget-props';

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
  /** Portföy değeri grafiği (seçili para biriminde); işlem yoksa null. */
  valueChart: ValueChart | null;
  /** Fiyat alarmları. */
  alerts: PriceAlert[];
  addAlert: (a: Pick<PriceAlert, 'kind' | 'symbol' | 'op' | 'price'>) => void;
  removeAlert: (id: string) => void;
  setAlertActive: (id: string, active: boolean) => void;
  /** Bütün portföylerin işlemleri (transactions yalnız seçili görünümünkiler). */
  allTransactions: Transaction[];
  portfolios: Portfolio[];
  /** Seçili portföy kimliği ya da "all" (Tümü). */
  activePortfolio: string;
  setActivePortfolio: (id: string) => void;
  addPortfolio: (name: string) => string;
  renamePortfolio: (id: string, name: string) => void;
  /** Portföyü ve işlemlerini siler (Ana portföy silinemez). */
  deletePortfolio: (id: string) => void;
  /** Portföy başına değer (seçili para biriminde). */
  portfolioValues: Record<string, number>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [allTransactions, setTransactions] = useState<Transaction[]>([]);
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({});
  const [quotes, setQuotes] = useState<Record<string, RawQuote>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>();
  const [error, setError] = useState<string>();
  const [fxHistory, setFxHistory] = useState<FxHistory>({});
  const [benchSeries, setBenchSeries] = useState<BenchSeries>({});
  const [corporateActions, setCorporateActions] = useState<StoredActions>({});
  const [targetsByPortfolio, setTargetsByPortfolio] = useState<TargetsByPortfolio>({});
  const [portfolios, setPortfolios] = useState<Portfolio[]>(DEFAULT_PORTFOLIOS);
  const [activePortfolio, setActiveState] = useState<string>(MAIN_PORTFOLIO);
  const activeRef = useRef(activePortfolio);
  const portfoliosRef = useRef(portfolios);
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({});
  const [alerts, setAlertsState] = useState<PriceAlert[]>([]);
  const alertsRef = useRef(alerts);
  const manualPricesRef = useRef<Record<string, number>>({});
  const priceHistoryRef = useRef(priceHistory);
  const actionsRef = useRef(corporateActions);
  useEffect(() => {
    actionsRef.current = corporateActions;
  }, [corporateActions]);
  const benchSeriesRef = useRef(benchSeries);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('TRY');
  // Geri çağırmaların her zaman son değeri görmesi için; değişiklik yapan işleyiciler de bunları hemen günceller.
  const fxHistoryRef = useRef(fxHistory);
  const transactionsRef = useRef(allTransactions);
  const lastUpdatedRef = useRef(lastUpdated);
  const inFlight = useRef<Promise<void> | null>(null);
  useEffect(() => {
    fxHistoryRef.current = fxHistory;
  }, [fxHistory]);
  useEffect(() => {
    benchSeriesRef.current = benchSeries;
  }, [benchSeries]);
  useEffect(() => {
    manualPricesRef.current = manualPrices;
  }, [manualPrices]);
  useEffect(() => {
    transactionsRef.current = allTransactions;
  }, [allTransactions]);
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
        const symbols = [
          ...new Set([
            ...own,
            ...(transactionsRef.current.length ? Object.values(BENCH_SYMBOLS) : []),
            ...(alertsRef.current.some((a) => a.active) ? alertQuoteSymbols(alertsRef.current) : []),
          ]),
        ];
        const fresh = await fetchAnyQuotes(symbols);
        // Fiyat alarmları: yalnız yeni gelen fiyatlarla (eski fiyat alarm çaldırmasın)
        const fired = checkAlerts(alertsRef.current, fresh, manualPricesRef.current);
        if (fired.length) {
          const next = markFired(alertsRef.current, fired);
          alertsRef.current = next;
          setAlertsState(next);
          saveAlerts(next).catch(() => {});
          syncAlertTask(next).catch(() => {});
          sendAlertNotifications(fired).catch(() => {});
        }
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
        // Portföy grafiği için varlıkların geçmiş fiyatları (yarım günde bir)
        const ph = await refreshPriceHistory(
          transactionsRef.current,
          priceHistoryRef.current,
          undefined,
          undefined,
          Platform.OS === 'web' || !!WEB_DATA_BASE,
        ).catch(() => null);
        if (ph) {
          priceHistoryRef.current = ph;
          setPriceHistory(ph);
          savePriceHistory(ph).catch(() => {});
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
      setTargetsByPortfolio(data.targetsByPortfolio);
      setPortfolios(data.portfolios);
      portfoliosRef.current = data.portfolios;
      setActiveState(data.activePortfolio);
      activeRef.current = data.activePortfolio;
      setAlertsState(data.alerts);
      alertsRef.current = data.alerts;
      manualPricesRef.current = data.manualPrices;
      syncAlertTask(data.alerts).catch(() => {});
      setPriceHistory(data.priceHistory);
      priceHistoryRef.current = data.priceHistory;
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
      const tx: Transaction = {
        ...t,
        portfolioId: t.portfolioId ?? targetPortfolio(activeRef.current),
        id: newId(),
        createdAt: Date.now(),
      };
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
    setTargetsByPortfolio((prev) => {
      const all = { ...prev, [activeRef.current]: next };
      saveTargetsByPortfolio(all).catch(() => {});
      return all;
    });
  }, []);

  const updatePortfolios = useCallback((next: Portfolio[]) => {
    portfoliosRef.current = next;
    setPortfolios(next);
    savePortfolios(next).catch(() => {});
  }, []);

  const setActivePortfolio = useCallback((id: string) => {
    const next = validActive(id, portfoliosRef.current);
    activeRef.current = next;
    setActiveState(next);
    saveActivePortfolio(next).catch(() => {});
  }, []);

  const addPortfolio = useCallback(
    (name: string) => {
      const p: Portfolio = { id: newId(), name: uniqueName(name, portfoliosRef.current), createdAt: Date.now() };
      updatePortfolios([...portfoliosRef.current, p]);
      return p.id;
    },
    [updatePortfolios],
  );

  const renamePortfolio = useCallback(
    (id: string, name: string) =>
      updatePortfolios(
        portfoliosRef.current.map((p) =>
          p.id === id ? { ...p, name: uniqueName(name, portfoliosRef.current, id) } : p,
        ),
      ),
    [updatePortfolios],
  );

  const deletePortfolio = useCallback(
    (id: string) => {
      if (id === MAIN_PORTFOLIO) return;
      const next = transactionsRef.current.filter((t) => portfolioOf(t) !== id);
      transactionsRef.current = next;
      setTransactions(next);
      saveTransactions(next).catch(() => {});
      const list = portfoliosRef.current.filter((p) => p.id !== id);
      updatePortfolios(list);
      setTargetsByPortfolio((prev) => {
        const rest = { ...prev };
        delete rest[id];
        saveTargetsByPortfolio(rest).catch(() => {});
        return rest;
      });
      if (activeRef.current === id || (activeRef.current === ALL_PORTFOLIOS && list.length < 2)) {
        activeRef.current = MAIN_PORTFOLIO;
        setActiveState(MAIN_PORTFOLIO);
        saveActivePortfolio(MAIN_PORTFOLIO).catch(() => {});
      }
    },
    [updatePortfolios],
  );

  const updateAlerts = useCallback((next: PriceAlert[]) => {
    alertsRef.current = next;
    setAlertsState(next);
    saveAlerts(next).catch(() => {});
    syncAlertTask(next).catch(() => {});
  }, []);

  const addAlert = useCallback(
    (a: Pick<PriceAlert, 'kind' | 'symbol' | 'op' | 'price'>) =>
      updateAlerts([...alertsRef.current, { ...a, id: newId(), createdAt: Date.now(), active: true }]),
    [updateAlerts],
  );
  const removeAlert = useCallback(
    (id: string) => updateAlerts(alertsRef.current.filter((a) => a.id !== id)),
    [updateAlerts],
  );
  const setAlertActive = useCallback(
    (id: string, active: boolean) =>
      updateAlerts(
        alertsRef.current.map((a) =>
          a.id === id ? { ...a, active, ...(active ? { triggeredAt: undefined, triggeredPrice: undefined } : {}) } : a,
        ),
      ),
    [updateAlerts],
  );

  /** Yedek dosyasının içeriği (JSON). */
  const exportBackup = useCallback(
    () =>
      makeBackup({
        transactions: transactionsRef.current,
        manualPrices,
        displayCurrency,
        extra: {
          targets: targetsByPortfolio[MAIN_PORTFOLIO] ?? {},
          targetsByPortfolio,
          alerts: alertsRef.current,
          portfolios: portfoliosRef.current,
          activePortfolio: activeRef.current,
        },
      }),
    [manualPrices, displayCurrency, targetsByPortfolio],
  );

  /** Yedekten geri yükler: "replace" mevcut işlemlerin yerine koyar, "merge" eksik olanları ekler. */
  const importTransactions = useCallback(
    (incoming: Transaction[], mode: 'replace' | 'merge', newTargets?: Record<string, number>) => {
      // Seçili portföye ("Tümü"nde Ana portföye); "replace" yalnız o portföyün işlemlerinin yerine geçer
      const target = targetPortfolio(activeRef.current);
      const tagged = incoming.map((t) => ({ ...t, portfolioId: target }));
      const next =
        mode === 'replace'
          ? [...transactionsRef.current.filter((t) => portfolioOf(t) !== target), ...tagged]
          : mergeTransactions(transactionsRef.current, tagged);
      transactionsRef.current = next;
      setTransactions(next);
      saveTransactions(next).catch(() => {});
      if (newTargets && Object.keys(newTargets).length) {
        setTargetsByPortfolio((prev) => {
          const all = { ...prev, [target]: newTargets };
          saveTargetsByPortfolio(all).catch(() => {});
          return all;
        });
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
      const savedAlerts = validAlerts(data.extra?.alerts);
      if (savedAlerts.length) {
        const ids = new Set(alertsRef.current.map((a) => a.id));
        updateAlerts(
          mode === 'replace' ? savedAlerts : [...alertsRef.current, ...savedAlerts.filter((a) => !ids.has(a.id))],
        );
      }
      // Portföyler: yedektekiler (eski yedeklerde yalnız Ana portföy)
      const savedPortfolios = normalizePortfolios(data.extra?.portfolios);
      if (mode === 'replace') {
        updatePortfolios(savedPortfolios);
        const act = validActive(data.extra?.activePortfolio, savedPortfolios);
        activeRef.current = act;
        setActiveState(act);
        saveActivePortfolio(act).catch(() => {});
      } else {
        const ids = new Set(portfoliosRef.current.map((p) => p.id));
        const added = savedPortfolios.filter((p) => !ids.has(p.id));
        if (added.length) updatePortfolios([...portfoliosRef.current, ...added]);
      }
      const savedTargets = migrateTargets(data.extra?.targetsByPortfolio, data.extra?.targets);
      if (Object.keys(savedTargets).length || mode === 'replace') {
        setTargetsByPortfolio((prev) => {
          const next = mode === 'replace' ? savedTargets : { ...savedTargets, ...prev };
          saveTargetsByPortfolio(next).catch(() => {});
          return next;
        });
      }
      refresh();
    },
    [refresh, updateAlerts, updatePortfolios],
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
  // Seçili görünümdeki işlemler ve hedefler
  const transactions = useMemo(
    () => filterByPortfolio(allTransactions, activePortfolio),
    [allTransactions, activePortfolio],
  );
  const targets = useMemo(() => targetsByPortfolio[activePortfolio] ?? {}, [targetsByPortfolio, activePortfolio]);
  const portfolioValues = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of portfolios) {
      const h = computeHoldings(
        filterByPortfolio(allTransactions, p.id),
        quotes,
        manualPrices,
        fxHistory,
        actionsByKey,
      );
      out[p.id] = computeSummary(h).totals[displayCurrency].value;
    }
    return out;
  }, [portfolios, allTransactions, quotes, manualPrices, fxHistory, actionsByKey, displayCurrency]);

  const valueChart = useMemo(
    () =>
      buildValueChart({
        transactions,
        raw: quotes,
        manualPrices,
        fxHistory,
        priceHistory,
        actionsByKey,
        bench: benchSeries,
        currency: displayCurrency,
        today: todayIso(),
      }),
    [transactions, quotes, manualPrices, fxHistory, priceHistory, actionsByKey, benchSeries, displayCurrency],
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

  // Ana ekran widget'ı (yalnız iPhone derlemesinde) son değerlerle güncellenir
  useEffect(() => {
    if (!ready) return;
    syncWidget(buildWidgetProps(summary, holdings, displayCurrency, lastUpdated)).catch(() => {});
  }, [ready, summary, holdings, displayCurrency, lastUpdated]);

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
      valueChart,
      alerts,
      addAlert,
      removeAlert,
      setAlertActive,
      allTransactions,
      portfolios,
      activePortfolio,
      setActivePortfolio,
      addPortfolio,
      renamePortfolio,
      deletePortfolio,
      portfolioValues,
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
      valueChart,
      alerts,
      addAlert,
      removeAlert,
      setAlertActive,
      allTransactions,
      portfolios,
      activePortfolio,
      setActivePortfolio,
      addPortfolio,
      renamePortfolio,
      deletePortfolio,
      portfolioValues,
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
