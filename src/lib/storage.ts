import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PriceAlert } from './alerts';
import type { BenchSeries } from './benchmarks';
import type { PriceHistory } from './history';
import type { CorporateAction, DisplayCurrency, FxHistory, RawQuote, Transaction } from './types';

/** Varlık anahtarına göre bedelsiz/temettü kayıtları ve ne zaman çekildikleri. */
export type StoredActions = Record<string, { fetchedAt: number; actions: CorporateAction[] }>;

const KEYS = {
  transactions: 'portfoy/transactions/v1',
  manualPrices: 'portfoy/manualPrices/v1',
  quotes: 'portfoy/quotes/v1',
  fxHistory: 'portfoy/fxHistory/v1',
  benchSeries: 'portfoy/benchSeries/v1',
  priceHistory: 'portfoy/priceHistory/v1',
  alerts: 'portfoy/alerts/v1',
  corporateActions: 'portfoy/corporateActions/v1',
  targets: 'portfoy/targets/v1',
  displayCurrency: 'portfoy/displayCurrency/v1',
} as const;

export interface StoredData {
  transactions: Transaction[];
  manualPrices: Record<string, number>;
  quotes: Record<string, RawQuote>;
  fxHistory: FxHistory;
  benchSeries: BenchSeries;
  priceHistory: PriceHistory;
  alerts: PriceAlert[];
  corporateActions: StoredActions;
  /** Dengeleme hedef oranları (varlık anahtarı → %). */
  targets: Record<string, number>;
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
  const [
    transactions,
    manualPrices,
    quotes,
    fxHistory,
    displayCurrency,
    benchSeries,
    corporateActions,
    targets,
    priceHistory,
    alerts,
  ] = await Promise.all([
    readJson<Transaction[]>(KEYS.transactions, []),
    readJson<Record<string, number>>(KEYS.manualPrices, {}),
    readJson<Record<string, RawQuote>>(KEYS.quotes, {}),
    readJson<FxHistory>(KEYS.fxHistory, {}),
    readJson<DisplayCurrency>(KEYS.displayCurrency, 'TRY'),
    readJson<BenchSeries>(KEYS.benchSeries, {}),
    readJson<StoredActions>(KEYS.corporateActions, {}),
    readJson<Record<string, number>>(KEYS.targets, {}),
    readJson<PriceHistory>(KEYS.priceHistory, {}),
    readJson<PriceAlert[]>(KEYS.alerts, []),
  ]);
  return {
    transactions: Array.isArray(transactions) ? transactions : [],
    manualPrices,
    quotes,
    fxHistory,
    benchSeries,
    priceHistory,
    alerts: Array.isArray(alerts) ? alerts : [],
    corporateActions,
    targets,
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

export function saveBenchSeries(series: BenchSeries) {
  return AsyncStorage.setItem(KEYS.benchSeries, JSON.stringify(series));
}

export function saveCorporateActions(actions: StoredActions) {
  return AsyncStorage.setItem(KEYS.corporateActions, JSON.stringify(actions));
}

export function saveTargets(targets: Record<string, number>) {
  return AsyncStorage.setItem(KEYS.targets, JSON.stringify(targets));
}

export function savePriceHistory(history: PriceHistory) {
  return AsyncStorage.setItem(KEYS.priceHistory, JSON.stringify(history));
}

export function saveAlerts(alerts: PriceAlert[]) {
  return AsyncStorage.setItem(KEYS.alerts, JSON.stringify(alerts));
}

/** Arka plan görevi için: alarmlar ve elle girilen fiyatlar. */
export async function loadAlertData(): Promise<{ alerts: PriceAlert[]; manualPrices: Record<string, number> }> {
  const [alerts, manualPrices] = await Promise.all([
    readJson<PriceAlert[]>(KEYS.alerts, []),
    readJson<Record<string, number>>(KEYS.manualPrices, {}),
  ]);
  return { alerts: Array.isArray(alerts) ? alerts : [], manualPrices };
}
