import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RawQuote, Transaction } from './types';

const KEYS = {
  transactions: 'portfoy/transactions/v1',
  manualPrices: 'portfoy/manualPrices/v1',
  quotes: 'portfoy/quotes/v1',
} as const;

export interface StoredData {
  transactions: Transaction[];
  manualPrices: Record<string, number>;
  quotes: Record<string, RawQuote>;
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
  const [transactions, manualPrices, quotes] = await Promise.all([
    readJson<Transaction[]>(KEYS.transactions, []),
    readJson<Record<string, number>>(KEYS.manualPrices, {}),
    readJson<Record<string, RawQuote>>(KEYS.quotes, {}),
  ]);
  return { transactions: Array.isArray(transactions) ? transactions : [], manualPrices, quotes };
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
