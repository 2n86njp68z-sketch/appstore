/**
 * Yıllık getiri (XIRR): para giriş-çıkışlarının tarihlerini hesaba katan yıllık bileşik getiri.
 * Alışlar eksi, satışlar ve temettüler artı, bugünkü değer bugün tarihli artı akış olarak girer.
 * Çözülen oran r: Σ tutar / (1 + r)^(gün/365) = 0.
 */

export interface CashFlow {
  /** "YYYY-AA-GG" */
  date: string;
  /** Eksi: cepten çıkan (alış), artı: cebe giren (satış, temettü, bugünkü değer). */
  amount: number;
}

export interface XirrResult {
  /** Yıllık oran (0,25 = %25). */
  rate: number;
  /** İlk akıştan son akışa gün sayısı. */
  days: number;
}

const DAY = 86_400_000;
const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;

/** Bu kadar günden kısa dönemde yıllığa çevirmek yanıltıcı (3 günde %2 → yılda %1.000). */
export const XIRR_MIN_DAYS = 30;

/** XIRR; hesaplanamıyorsa (tek yönlü akış, çok kısa dönem, çözüm yok) undefined. */
export function xirr(flows: CashFlow[], minDays = XIRR_MIN_DAYS): XirrResult | undefined {
  const list = flows.filter((f) => Number.isFinite(f.amount) && Math.abs(f.amount) > 1e-9);
  if (!list.some((f) => f.amount < 0) || !list.some((f) => f.amount > 0)) return undefined;
  const d0 = Math.min(...list.map((f) => dayNumber(f.date)));
  const d1 = Math.max(...list.map((f) => dayNumber(f.date)));
  const days = d1 - d0;
  if (!(days >= minDays)) return undefined;
  const pts = list.map((f) => ({ t: (dayNumber(f.date) - d0) / 365, a: f.amount }));
  const npv = (r: number) => pts.reduce((s, p) => s + p.a / Math.pow(1 + r, p.t), 0);

  // Newton (hızlı); yakınsamazsa ikiye bölme
  let r = 0.1;
  for (let n = 0; n < 50; n++) {
    let f = 0;
    let df = 0;
    for (const p of pts) {
      const v = Math.pow(1 + r, p.t);
      f += p.a / v;
      df -= (p.t * p.a) / (v * (1 + r));
    }
    if (!Number.isFinite(f) || !Number.isFinite(df) || df === 0) break;
    const next = r - f / df;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - r) < 1e-10) return { rate: next, days };
    r = next;
  }

  // İkiye bölme: işaret değiştiren aralığı bul
  let lo = -0.999999;
  let hi = 1;
  let flo = npv(lo);
  let fhi = npv(hi);
  for (let n = 0; n < 60 && Math.sign(flo) === Math.sign(fhi); n++) {
    hi *= 2;
    fhi = npv(hi);
    if (!Number.isFinite(fhi)) return undefined;
  }
  if (Math.sign(flo) === Math.sign(fhi)) return undefined;
  for (let n = 0; n < 200; n++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return { rate: (lo + hi) / 2, days };
}

/** "2 yıl 3 ay", "5 ay", "40 gün" */
export function formatPeriod(days: number): string {
  if (days < 60) return `${Math.round(days)} gün`;
  const months = Math.round(days / 30.4375);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} ay`;
  return m === 0 ? `${y} yıl` : `${y} yıl ${m} ay`;
}
