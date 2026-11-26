import { BIST_STOCKS, type BistStock } from '../data/bist';
import { foldForSearch, logoCandidates, searchStocks, stockInfo } from './markets';

export { BIST_STOCKS, foldForSearch, logoCandidates };
export type { BistStock };

export function bistInfo(code: string): BistStock | undefined {
  return stockInfo('bist', code) as BistStock | undefined;
}

export function searchBist(query: string): BistStock[] {
  return searchStocks(query, BIST_STOCKS) as BistStock[];
}
