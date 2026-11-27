import type { Transaction } from './types';

/**
 * Birden fazla portföy: her işlem bir portföye aittir (portfolioId yoksa "Ana portföy"). Ana sayfada
 * tek bir portföy ya da "Tümü" (hepsi birlikte) görüntülenir; hesaplar seçili görünümdeki işlemlerle yapılır.
 */
export interface Portfolio {
  id: string;
  name: string;
  createdAt: number;
}

export const MAIN_PORTFOLIO = 'main';
export const ALL_PORTFOLIOS = 'all';
export const MAIN_NAME = 'Ana portföy';

export const DEFAULT_PORTFOLIOS: Portfolio[] = [{ id: MAIN_PORTFOLIO, name: MAIN_NAME, createdAt: 0 }];

export const portfolioOf = (t: Pick<Transaction, 'portfolioId'>): string => t.portfolioId ?? MAIN_PORTFOLIO;

/** Seçili görünümdeki işlemler ("Tümü"nde hepsi). */
export function filterByPortfolio(transactions: Transaction[], active: string): Transaction[] {
  if (active === ALL_PORTFOLIOS) return transactions;
  return transactions.filter((t) => portfolioOf(t) === active);
}

/** Yeni işlemin gideceği portföy: "Tümü" görünümünde Ana portföy. */
export const targetPortfolio = (active: string): string => (active === ALL_PORTFOLIOS ? MAIN_PORTFOLIO : active);

/** Kayıtlı listeyi düzeltir: Ana portföy hep ilk sırada, kimlikler tekil, adlar boş değil. */
export function normalizePortfolios(list: unknown): Portfolio[] {
  const out: Portfolio[] = [];
  const seen = new Set<string>();
  if (Array.isArray(list)) {
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      const x = p as Partial<Portfolio>;
      if (typeof x.id !== 'string' || !x.id || x.id === ALL_PORTFOLIOS || seen.has(x.id)) continue;
      const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 40) : 'Portföy';
      seen.add(x.id);
      out.push({ id: x.id, name, createdAt: typeof x.createdAt === 'number' ? x.createdAt : 0 });
    }
  }
  const main = out.find((p) => p.id === MAIN_PORTFOLIO) ?? DEFAULT_PORTFOLIOS[0];
  return [main, ...out.filter((p) => p.id !== MAIN_PORTFOLIO)];
}

/** Seçili görünüm geçerli değilse (silinmiş portföy) Ana portföy. */
export function validActive(active: unknown, portfolios: Portfolio[]): string {
  if (active === ALL_PORTFOLIOS && portfolios.length > 1) return ALL_PORTFOLIOS;
  return typeof active === 'string' && portfolios.some((p) => p.id === active) ? active : MAIN_PORTFOLIO;
}

/** Hedef oranlar portföy başına; eski sürümün tek listesi Ana portföyün olur. */
export type TargetsByPortfolio = Record<string, Record<string, number>>;

export function migrateTargets(v2: unknown, v1: unknown): TargetsByPortfolio {
  if (v2 && typeof v2 === 'object' && !Array.isArray(v2)) return v2 as TargetsByPortfolio;
  if (v1 && typeof v1 === 'object' && !Array.isArray(v1) && Object.keys(v1).length) {
    return { [MAIN_PORTFOLIO]: v1 as Record<string, number> };
  }
  return {};
}

/** Ad çakışırsa sonuna sayı ekler: "BES", "BES 2". */
export function uniqueName(name: string, portfolios: Portfolio[], exceptId?: string): string {
  const base = name.trim().slice(0, 40) || 'Portföy';
  const taken = new Set(portfolios.filter((p) => p.id !== exceptId).map((p) => p.name.toLocaleLowerCase('tr')));
  if (!taken.has(base.toLocaleLowerCase('tr'))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLocaleLowerCase('tr'))) return candidate;
  }
}
