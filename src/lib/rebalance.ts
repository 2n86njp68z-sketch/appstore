import { commodityInfo } from './assets';
import type { AssetKind } from './types';

/**
 * Portföy dengeleme ("Ne alayım?"): hedef oranlara göre alım/satım önerileri. Hesap TL bazında, bütün
 * portföy üzerinden yapılır; her varlık kendi alım biriminin katlarıyla (hisse 1 lot, kripto 0,0001…).
 *
 * - Nakit ekle: satış yapmadan, eklenen nakitle hedefin en gerisinde kalanlar alınır.
 * - Dengele: hedefin üstündekiler satılır, gelirle altındakiler alınır.
 * - Nakit çek: istenen tutar, kalan portföy hedefe en yakın kalacak şekilde fazlası olanlardan satılır.
 *
 * Önce kesirli (su doldurma) çözüm bulunur, alım birimine aşağı yuvarlanır; artan tutar birim birim en
 * çok eksik olana dağıtılır. Böylece fon gibi fiyatı küçük varlıklarda da hızlı çalışır.
 */

export interface RebalanceItem {
  key: string;
  label: string;
  /** 1 birimin (adet, gram, nominal…) TL fiyatı. */
  unitPrice: number;
  /** Eldeki miktar. */
  quantity: number;
  /** En küçük alım/satım birimi. */
  step: number;
}

export interface RebalanceRow {
  key: string;
  label: string;
  /** + alım, − satım (birim cinsinden). */
  delta: number;
  /** İşlem tutarı (TL, mutlak). */
  amount: number;
  before: number;
  after: number;
  target: number;
}

export interface RebalanceResult {
  rows: RebalanceRow[];
  /** İşlem öncesi portföy değeri (TL). */
  value: number;
  bought: number;
  sold: number;
  /** Kullanılmayan nakit. */
  left: number;
  /** Satış yapmadan tam hedefe ulaşmak için gereken toplam nakit (yalnız "nakit ekle"de). */
  needForPerfect?: number;
  /** Nakit çekte toplanamayan tutar. */
  short?: number;
}

/** Varlık türüne göre alım birimi. */
export function stepFor(kind: AssetKind, symbol: string): number {
  switch (kind) {
    case 'crypto':
      return 0.0001;
    case 'metal': {
      const unit = commodityInfo(symbol)?.unit;
      return unit === 'gram' ? 0.1 : unit === 'ons' ? 0.01 : 1;
    }
    case 'eurobond':
      return 1000;
    default:
      return 1;
  }
}

const EPS = 1e-9;
// "+ 0": −0 yerine 0
const roundStep = (n: number, step: number) => Math.round(n / step) * step + 0;

/** Hedefleri ağırlığa çevirir (toplam 1); eksi ve tanımsızlar 0. */
export function normalizeTargets(items: RebalanceItem[], targets: Record<string, number>): Record<string, number> {
  const sum = items.reduce((s, i) => s + Math.max(0, targets[i.key] ?? 0), 0);
  return Object.fromEntries(items.map((i) => [i.key, sum > 0 ? Math.max(0, targets[i.key] ?? 0) / sum : 0]));
}

function finish(
  items: RebalanceItem[],
  w: Record<string, number>,
  delta: Record<string, number>,
  extra: Partial<RebalanceResult>,
): RebalanceResult {
  const value = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  let bought = 0;
  let sold = 0;
  for (const i of items) {
    const amt = delta[i.key] * i.unitPrice;
    if (amt > 0) bought += amt;
    else sold -= amt;
  }
  const after = value + bought - sold;
  const rows = items.map((i) => ({
    key: i.key,
    label: i.label,
    delta: delta[i.key],
    amount: Math.abs(delta[i.key] * i.unitPrice),
    before: value > 0 ? (i.quantity * i.unitPrice) / value : 0,
    after: after > 0 ? ((i.quantity + delta[i.key]) * i.unitPrice) / after : 0,
    target: w[i.key],
  }));
  return { rows, value, bought, sold, left: 0, ...extra };
}

/** Su doldurma: hedefin altındakileri aynı oranda doldurmak için harcanacak tutarlar (toplam = budget). */
function fill(values: number[], weights: number[], budget: number): number[] {
  const spend = (k: number) => values.reduce((s, v, i) => s + Math.max(0, weights[i] * k - v), 0);
  let lo = 0;
  let hi = values.reduce((a, b) => a + b, 0) + budget + 1;
  for (let n = 0; n < 100; n++) {
    const mid = (lo + hi) / 2;
    if (spend(mid) > budget) hi = mid;
    else lo = mid;
  }
  return values.map((v, i) => Math.max(0, weights[i] * lo - v));
}

/** Eldeki nakdi, kesirli çözümün birime yuvarlanmışıyla başlayıp artanı birim birim dağıtarak harcar. */
function spendCash(
  items: RebalanceItem[],
  w: Record<string, number>,
  vals: Record<string, number>,
  delta: Record<string, number>,
  cash: number,
  total: number,
  can: (i: RebalanceItem) => boolean,
  /** Dengelemede yalnız açık yarım birimden büyükse alınır (aksi halde alım hedeften uzaklaştırır). */
  halfStep: boolean,
): number {
  const eligible = items.filter((i) => can(i) && w[i.key] > 0);
  const amounts = fill(
    eligible.map((i) => vals[i.key]),
    eligible.map((i) => w[i.key]),
    cash,
  );
  let left = cash;
  eligible.forEach((i, n) => {
    const units = Math.floor(amounts[n] / (i.unitPrice * i.step) + EPS) * i.step;
    if (units > 0) {
      delta[i.key] += units;
      vals[i.key] += units * i.unitPrice;
      left -= units * i.unitPrice;
    }
  });
  // Artan nakit: birimi sığan ve hedefin en çok gerisinde kalana birer birim
  for (let guard = 0; guard < 10_000; guard++) {
    let best: RebalanceItem | null = null;
    let bestDef = 0;
    for (const i of eligible) {
      const cost = i.unitPrice * i.step;
      if (cost > left + EPS) continue;
      const def = w[i.key] * total - vals[i.key];
      if (def > (halfStep ? cost / 2 : 0) && def > bestDef) {
        bestDef = def;
        best = i;
      }
    }
    if (!best) break;
    const cost = best.unitPrice * best.step;
    delta[best.key] += best.step;
    vals[best.key] += cost;
    left -= cost;
  }
  return left;
}

/** Nakit ekle: satış yok; eklenen nakit hedefin en gerisindekilere. */
export function planBuy(items: RebalanceItem[], targets: Record<string, number>, cash: number): RebalanceResult {
  const w = normalizeTargets(items, targets);
  const vals = Object.fromEntries(items.map((i) => [i.key, i.quantity * i.unitPrice]));
  const value = items.reduce((s, i) => s + vals[i.key], 0);
  const delta = Object.fromEntries(items.map((i) => [i.key, 0]));
  const left = spendCash(items, w, vals, delta, Math.max(0, cash), value + Math.max(0, cash), () => true, false);
  // Satış yapmadan tam hedefe ulaşmak için gereken toplam nakit
  let maxRatio = 0;
  for (const i of items) if (w[i.key] > 0) maxRatio = Math.max(maxRatio, (i.quantity * i.unitPrice) / w[i.key]);
  for (const i of items) delta[i.key] = roundStep(delta[i.key], i.step);
  return finish(items, w, delta, { left: Math.max(0, left), needForPerfect: Math.max(0, maxRatio - value) });
}

/** Dengele: nakit eklemeden; fazlası olanlar satılır, gelirle eksikler alınır. */
export function planRebalance(items: RebalanceItem[], targets: Record<string, number>): RebalanceResult {
  const w = normalizeTargets(items, targets);
  const vals = Object.fromEntries(items.map((i) => [i.key, i.quantity * i.unitPrice]));
  const value = items.reduce((s, i) => s + vals[i.key], 0);
  const delta = Object.fromEntries(items.map((i) => [i.key, 0]));
  let cash = 0;
  // 1) Fazlayı en yakın birime yuvarlayarak sat (eldekinden fazla değil)
  for (const i of items) {
    const excess = (vals[i.key] - w[i.key] * value) / (i.unitPrice * i.step);
    const n = Math.min(Math.floor(i.quantity / i.step + EPS), Math.round(excess));
    if (n > 0) {
      delta[i.key] = -n * i.step;
      vals[i.key] -= n * i.step * i.unitPrice;
      cash += n * i.step * i.unitPrice;
    }
  }
  // 2) Gelirle hedefin altındakileri al (satılanlar alınmaz)
  const left = spendCash(items, w, vals, delta, cash, value, (i) => delta[i.key] >= 0, true);
  for (const i of items) delta[i.key] = roundStep(delta[i.key], i.step);
  return finish(items, w, delta, { left: Math.max(0, left) });
}

/** Nakit çek: istenen tutar, kalan portföy hedefe en yakın kalacak şekilde fazlası olanlardan satılır. */
export function planWithdraw(items: RebalanceItem[], targets: Record<string, number>, cash: number): RebalanceResult {
  const w = normalizeTargets(items, targets);
  const vals = Object.fromEntries(items.map((i) => [i.key, i.quantity * i.unitPrice]));
  const value = items.reduce((s, i) => s + vals[i.key], 0);
  const total = Math.max(0, value - cash);
  const delta = Object.fromEntries(items.map((i) => [i.key, 0]));
  const maxUnits = Object.fromEntries(items.map((i) => [i.key, Math.floor(i.quantity / i.step + EPS)]));
  const sold = Object.fromEntries(items.map((i) => [i.key, 0]));
  let got = 0;
  for (let guard = 0; guard < 200_000 && got < cash - EPS; guard++) {
    const need = cash - got;
    const cands = items
      .filter((i) => sold[i.key] < maxUnits[i.key])
      .map((i) => ({ i, ex: vals[i.key] - w[i.key] * total, cost: i.unitPrice * i.step }));
    if (cands.length === 0) break;
    cands.sort((a, b) => b.ex - a.ex);
    let best = cands[0];
    // Son adım: kalan ihtiyacı tek birimle kapatabilen, fazlası olanların en ucuzu (fazla satışı küçültür)
    if (best.cost > need) {
      const fit = cands.filter((c) => c.ex > 0 && c.cost >= need).sort((a, b) => a.cost - b.cost);
      if (fit.length) best = fit[0];
    }
    // Büyük farklarda tek seferde birden çok birim (hız için): fazlanın ve ihtiyacın yarısına kadar
    const bulk = Math.max(
      1,
      Math.min(maxUnits[best.i.key] - sold[best.i.key], Math.floor(Math.min(best.ex, need) / best.cost / 2)),
    );
    sold[best.i.key] += bulk;
    vals[best.i.key] -= bulk * best.cost;
    got += bulk * best.cost;
  }
  for (const i of items) delta[i.key] = roundStep(-sold[i.key] * i.step, i.step);
  return finish(items, w, delta, { left: Math.max(0, got - cash), short: Math.max(0, cash - got) });
}
