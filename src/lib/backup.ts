import { ASSET_KINDS } from './assets';
import type { DisplayCurrency, Transaction } from './types';

/**
 * Yedek dosyası: işlemler, elle girilen fiyatlar ve ayarlar. Uygulama verileri yalnız cihazda durduğu
 * için kullanıcı bu dosyayı iCloud Drive'a, bilgisayarına ya da mesajla kendine gönderip saklar.
 */
export const BACKUP_APP = 'GENIUS';
export const BACKUP_VERSION = 1;

export interface BackupData {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  transactions: Transaction[];
  manualPrices: Record<string, number>;
  displayCurrency: DisplayCurrency;
  /** Sonraki sürümlerde eklenen veriler (hedef oranlar, alarmlar, portföyler…). */
  extra?: Record<string, unknown>;
}

export function makeBackup(data: Omit<BackupData, 'app' | 'version' | 'exportedAt'>, now = new Date()): string {
  const backup: BackupData = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...data };
  return JSON.stringify(backup, null, 2);
}

/** "GENIUS-yedek-2026-11-27.json" */
export function backupFileName(now = new Date()): string {
  return `GENIUS-yedek-${now.toISOString().slice(0, 10)}.json`;
}

const KINDS = new Set<string>(ASSET_KINDS.map((k) => k.kind));

function validTransaction(t: unknown): t is Transaction {
  if (!t || typeof t !== 'object') return false;
  const x = t as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    typeof x.kind === 'string' &&
    KINDS.has(x.kind) &&
    typeof x.symbol === 'string' &&
    x.symbol.length > 0 &&
    (x.side === 'buy' || x.side === 'sell') &&
    typeof x.quantity === 'number' &&
    x.quantity > 0 &&
    typeof x.price === 'number' &&
    x.price >= 0 &&
    typeof x.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
    typeof x.createdAt === 'number'
  );
}

export type ParsedBackup = { ok: true; data: BackupData; skipped: number } | { ok: false; error: string };

/** Yedek dosyasını okur ve doğrular; bozuk işlemler atlanır (sayısı döner). */
export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Dosya okunamadı: geçerli bir yedek dosyası değil.' };
  }
  const x = json as Partial<BackupData>;
  if (!x || x.app !== BACKUP_APP || !Array.isArray(x.transactions)) {
    return { ok: false, error: 'Bu dosya bir GENIUS yedeği değil.' };
  }
  if (typeof x.version === 'number' && x.version > BACKUP_VERSION) {
    return { ok: false, error: 'Yedek uygulamanın daha yeni bir sürümüyle alınmış; önce uygulamayı güncelle.' };
  }
  const transactions = x.transactions.filter(validTransaction);
  const manualPrices: Record<string, number> = {};
  for (const [k, v] of Object.entries(x.manualPrices ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) manualPrices[k] = v;
  }
  return {
    ok: true,
    skipped: x.transactions.length - transactions.length,
    data: {
      app: BACKUP_APP,
      version: x.version ?? BACKUP_VERSION,
      exportedAt: typeof x.exportedAt === 'string' ? x.exportedAt : '',
      transactions,
      manualPrices,
      displayCurrency: x.displayCurrency === 'USD' || x.displayCurrency === 'EUR' ? x.displayCurrency : 'TRY',
      extra: x.extra && typeof x.extra === 'object' ? x.extra : undefined,
    },
  };
}

/** Birleştirme: aynı kimlikli işlem bir kez tutulur (mevcut olan kalır). */
export function mergeTransactions(current: Transaction[], incoming: Transaction[]): Transaction[] {
  const ids = new Set(current.map((t) => t.id));
  return [...current, ...incoming.filter((t) => !ids.has(t.id))];
}
