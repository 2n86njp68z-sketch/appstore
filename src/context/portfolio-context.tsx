import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { assetKey } from '@/lib/assets';
import { computeHoldings, computeSummary, requiredQuoteSymbols } from '@/lib/portfolio';
import { fetchQuotes } from '@/lib/prices';
import { loadAll, saveManualPrices, saveQuotes, saveTransactions } from '@/lib/storage';
import type { AssetKind, Holding, PortfolioSummary, RawQuote, Transaction } from '@/lib/types';

/** Uygulama öne geldiğinde fiyatlar bu süreden eskiyse yenilenir. */
const STALE_MS = 2 * 60 * 1000;

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>;

interface PortfolioContextValue {
  ready: boolean;
  transactions: Transaction[];
  quotes: Record<string, RawQuote>;
  holdings: Holding[];
  summary: PortfolioSummary;
  refreshing: boolean;
  lastUpdated?: number;
  error?: string;
  refresh: () => Promise<void>;
  addTransaction: (t: NewTransaction) => void;
  deleteTransaction: (id: string) => void;
  setManualPrice: (kind: AssetKind, symbol: string, price: number) => void;
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

  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;
  const lastUpdatedRef = useRef(lastUpdated);
  lastUpdatedRef.current = lastUpdated;
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setRefreshing(true);
      try {
        const symbols = requiredQuoteSymbols(transactionsRef.current);
        const { quotes: fresh, failed } = await fetchQuotes(symbols);
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
      const next = [...transactionsRef.current, tx];
      transactionsRef.current = next;
      setTransactions(next);
      saveTransactions(next).catch(() => {});
      if (t.kind === 'other') {
        // Elle fiyatlanan varlıkta henüz fiyat yoksa ilk işlem fiyatını güncel fiyat kabul et.
        const key = assetKey(t.kind, t.symbol);
        setManualPrices((prev) => {
          if (prev[key] != null) return prev;
          const nextPrices = { ...prev, [key]: t.price };
          saveManualPrices(nextPrices).catch(() => {});
          return nextPrices;
        });
      } else if (isNewAsset) {
        refresh();
      }
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

  const holdings = useMemo(
    () => computeHoldings(transactions, quotes, manualPrices),
    [transactions, quotes, manualPrices],
  );
  const summary = useMemo(() => computeSummary(holdings), [holdings]);

  const value = useMemo<PortfolioContextValue>(
    () => ({
      ready,
      transactions,
      quotes,
      holdings,
      summary,
      refreshing,
      lastUpdated,
      error,
      refresh,
      addTransaction,
      deleteTransaction,
      setManualPrice,
    }),
    [
      ready,
      transactions,
      quotes,
      holdings,
      summary,
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
