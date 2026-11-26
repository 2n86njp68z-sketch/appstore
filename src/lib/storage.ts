import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DisplayCurrency, FxHistory, RawQuote, Transaction } from './types';

const KEYS = {
  transactions: 'portfoy/transactions/v1',
  manualPrices: 'portfoy/manualPrices/v1',
  quotes: 'portfoy/quotes/v1',
  fxHistory: 'portfoy/fxHistory/v1',
  displayCurrency: 'portfoy/displayCurrency/v1',
} as const;

export interface StoredData {
  transactions: Transaction[];
  manualPrices: Record<string, number>;
  quotes: Record<string, RawQuote>;
  fxHistory: FxHistory;
  displayCurrency: DisplayCurrency;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function loadAll(): Promise<StoredData> {
  const [transactions, manualPrices, quotes, fxHistory, displayCurrency] = await Promise.all([
    readJson<Transaction[]>(KEYS.transactions, []),
    readJson<Record<string, number>>(KEYS.manualPrices, {}),
    readJson<Record<string, RawQuote>>(KEYS.quotes, {}),
    readJson<FxHistory>(KEYS.fxHistory, {}),
    readJson<DisplayCurrency>(KEYS.displayCurrency, 'TRY'),
  ]);
  return {
    transactions: Array.isArray(transactions) ? transactions : [],
    manualPrices,
    quotes,
    fxHistory,
    displayCurrency: ['TRY', 'USD', 'EUR'].includes(displayCurrency) ? displayCurrency : 'TRY',
  };
}

export function saveTransactions(transactions: Transaction[]) {
  return AsyncStorage.setItem(KEYS.transactions, JSON.stringify(transactions));
}

export function saveManualPrices(prices: Record<string, number>) {
  return AsyncStorage.setItem(KEYS.manualPrices, JSON.stringify(prices));
}

export function saveQuotes(quotes: Record<string, RawQuote>) {
  return AsyncStorage.setItem(KEYS.quotes, JSON.stringify(quotes));
}

export function saveFxHistory(history: FxHistory) {
  return AsyncStorage.setItem(KEYS.fxHistory, JSON.stringify(history));
}

export function saveDisplayCurrency(currency: DisplayCurrency) {
  return AsyncStorage.setItem(KEYS.displayCurrency, JSON.stringify(currency));
}
