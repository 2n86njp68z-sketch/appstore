import { displaySymbol, kindInfo, SLICE_PALETTE } from './assets';
import type { AssetKind, Holding, PortfolioSummary } from './types';

const TAU = Math.PI * 2;

export interface ChartAsset {
  key: string;
  kind: AssetKind;
  label: string;
  valueTry: number;
  /** Tüm portföy içindeki pay (%). */
  pct: number;
  /** Kendi türü içindeki pay (%). */
  pctOfKind: number;
  color: string;
  holding: Holding;
}

export interface ChartCategory {
  kind: AssetKind;
  label: string;
  valueTry: number;
  pct: number;
  pnlTry: number;
  pnlPct: number;
  color: string;
  assets: ChartAsset[];
}

/** Bir türün içindeki varlıklara renk dizisi: önce türün kendi rengi, sonra paletteki diğerleri. */
export function paletteFor(kind: AssetKind): string[] {
  const base = kindInfo(kind).color;
  return [base, ...SLICE_PALETTE.filter((c) => c !== base)];
}

/** Grafik verisi: türler (portföydeki paya göre) ve her türün içindeki varlıklar (değere göre). */
export function buildChartData(holdings: Holding[], summary: PortfolioSummary): ChartCategory[] {
  return summary.allocation.map((slice) => {
    const palette = paletteFor(slice.kind);
    const assets = holdings
      .filter((h) => h.kind === slice.kind && h.quantity > 0 && h.valueTry != null && h.valueTry > 0)
      .sort((a, b) => b.valueTry! - a.valueTry!)
      .map((h, i) => ({
        key: h.key,
        kind: h.kind,
        label: displaySymbol(h.kind, h.symbol),
        valueTry: h.valueTry!,
        pct: summary.valueTry > 0 ? (h.valueTry! / summary.valueTry) * 100 : 0,
        pctOfKind: slice.valueTry > 0 ? (h.valueTry! / slice.valueTry) * 100 : 0,
        color: palette[i % palette.length],
        holding: h,
      }));
    return {
      kind: slice.kind,
      label: kindInfo(slice.kind).shortLabel,
      valueTry: slice.valueTry,
      pct: slice.pct,
      pnlTry: slice.pnlTry,
      pnlPct: slice.pnlPct,
      color: kindInfo(slice.kind).color,
      assets,
    };
  });
}

export interface DonutSlice {
  /** Tür dilimi için tür adı, varlık dilimi için varlık anahtarı. */
  id: string;
  kind: AssetKind;
  assetKey?: string;
  color: string;
  /** Radyan; 0 = saat 12 yönü, saat yönünde artar. */
  start: number;
  end: number;
  /** Açılmış türün parçası mı? */
  expanded: boolean;
}

/**
 * Dilimleri yerleştirir. `openKind` verilirse o türün dilimi, yerinde içindeki varlıklara bölünür;
 * diğer türler olduğu gibi kalır.
 */
export function layoutSlices(categories: ChartCategory[], openKind?: AssetKind): DonutSlice[] {
  const total = categories.reduce((a, c) => a + c.valueTry, 0);
  if (total <= 0) return [];
  const slices: DonutSlice[] = [];
  let angle = 0;
  for (const c of categories) {
    const span = (c.valueTry / total) * TAU;
    if (c.kind === openKind && c.assets.length > 0) {
      const sum = c.assets.reduce((a, x) => a + x.valueTry, 0);
      let a = angle;
      for (const asset of c.assets) {
        const s = (asset.valueTry / sum) * span;
        slices.push({
          id: asset.key,
          kind: c.kind,
          assetKey: asset.key,
          color: asset.color,
          start: a,
          end: a + s,
          expanded: true,
        });
        a += s;
      }
    } else {
      slices.push({ id: c.kind, kind: c.kind, color: c.color, start: angle, end: angle + span, expanded: false });
    }
    angle += span;
  }
  return slices;
}

function point(cx: number, cy: number, r: number, a: number): string {
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  return `${x.toFixed(3)},${y.toFixed(3)}`;
}

/** Halka dilimi için SVG yolu. Tam tur ise ortası boş bir halka çizer. */
export function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const span = a1 - a0;
  if (span <= 0) return '';
  if (span >= TAU - 1e-6) {
    return (
      `M${point(cx, cy, r1, 0)} A${r1},${r1} 0 1 1 ${point(cx, cy, r1, Math.PI)} A${r1},${r1} 0 1 1 ${point(cx, cy, r1, 0)} Z ` +
      `M${point(cx, cy, r0, 0)} A${r0},${r0} 0 1 0 ${point(cx, cy, r0, Math.PI)} A${r0},${r0} 0 1 0 ${point(cx, cy, r0, 0)} Z`
    );
  }
  const large = span > Math.PI ? 1 : 0;
  return (
    `M${point(cx, cy, r1, a0)} A${r1},${r1} 0 ${large} 1 ${point(cx, cy, r1, a1)} ` +
    `L${point(cx, cy, r0, a1)} A${r0},${r0} 0 ${large} 0 ${point(cx, cy, r0, a0)} Z`
  );
}

export type DonutHit = { type: 'slice'; slice: DonutSlice } | { type: 'center' } | { type: 'outside' };

/** Dokunulan noktanın hangi dilime denk geldiğini bulur. */
export function hitTest(
  slices: DonutSlice[],
  x: number,
  y: number,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
): DonutHit {
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.hypot(dx, dy);
  if (r < r0 * 0.92) return { type: 'center' };
  if (r > r1 + 24) return { type: 'outside' };
  let a = Math.atan2(dx, -dy);
  if (a < 0) a += TAU;
  const slice = slices.find((s) => a >= s.start && a < s.end);
  return slice ? { type: 'slice', slice } : { type: 'outside' };
}
