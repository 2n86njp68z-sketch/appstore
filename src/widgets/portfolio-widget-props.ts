import { displaySymbol } from '../lib/assets';
import { formatMoney, formatPct } from '../lib/format';
import type { DisplayCurrency, Holding, PortfolioSummary } from '../lib/types';

/** Widget'a giden hazır metinler (widget kendisi biçimlendirme yapmaz). */
export interface PortfolioWidgetProps {
  empty: boolean;
  /** "₺411.200" */
  value: string;
  /** "+₺6.025" */
  day: string;
  /** "+%1,49" */
  dayPct: string;
  dayUp: boolean;
  /** "+%25,40" */
  totalPct: string;
  totalUp: boolean;
  /** "+%17,1" (yıllık getiri; dönem kısaysa yok) */
  yearly?: string;
  /** "Güncellendi 14:35" */
  updated: string;
  /** En büyük üç varlık ve günlük değişimleri. */
  top: { name: string; pct: string; up: boolean }[];
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function buildWidgetProps(
  summary: PortfolioSummary,
  holdings: Holding[],
  currency: DisplayCurrency,
  lastUpdated: number | undefined,
): PortfolioWidgetProps {
  const t = summary.totals[currency];
  const open = holdings.filter((h) => h.quantity > 0 && h.views[currency]);
  if (open.length === 0 || !(t.value > 0)) {
    return {
      empty: true,
      value: '',
      day: '',
      dayPct: '',
      dayUp: true,
      totalPct: '',
      totalUp: true,
      updated: '',
      top: [],
    };
  }
  const top = [...open]
    .sort((a, b) => (b.views[currency]?.value ?? 0) - (a.views[currency]?.value ?? 0))
    .slice(0, 3)
    .map((h) => ({
      name: displaySymbol(h.kind, h.symbol),
      pct: h.dayChangePct != null ? formatPct(h.dayChangePct, { signed: true, decimals: 1 }) : '—',
      up: (h.dayChangePct ?? 0) >= 0,
    }));
  return {
    empty: false,
    value: formatMoney(t.value, currency, { decimals: 0 }),
    day: formatMoney(t.dayChange, currency, { signed: true, decimals: 0 }),
    dayPct: formatPct(t.dayChangePct),
    dayUp: t.dayChange >= 0,
    totalPct: formatPct(t.pnlPct),
    totalUp: t.pnl >= 0,
    yearly: t.xirr ? formatPct(t.xirr.rate * 100, { signed: true, decimals: 1 }) : undefined,
    updated: lastUpdated ? `Güncellendi ${hhmm(lastUpdated)}` : '',
    top,
  };
}
