import { displaySymbol, FIXED_ASSET_COLORS, kindInfo, SLICE_PALETTE } from './assets';
import type { AllocationSlice, AssetKind, Holding, PortfolioSummary } from './types';

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
  /** Para birimlerine göre değer ve kâr/zarar. */
  totals: AllocationSlice['totals'];
  color: string;
  assets: ChartAsset[];
}

/** Bir türün içindeki varlıklara renk dizisi: önce türün kendi rengi, sonra paletteki diğerleri. */
export function paletteFor(kind: AssetKind): string[] {
  const base = kindInfo(kind).color;
  return [base, ...SLICE_PALETTE.filter((c) => c !== base)];
}

/** Sabit renkli varlıklar (altın, gümüş) dışındakilere paletten sırayla renk verir; tekrar etmez. */
function assignColors(kind: AssetKind, keys: string[]): string[] {
  const fixed = keys.map((k) => FIXED_ASSET_COLORS[k]);
  const palette = paletteFor(kind).filter((c) => !fixed.includes(c));
  let i = 0;
  return fixed.map((f) => f ?? palette[i++ % palette.length]);
}

/** Grafik verisi: türler (portföydeki paya göre) ve her türün içindeki varlıklar (değere göre). */
export function buildChartData(holdings: Holding[], summary: PortfolioSummary): ChartCategory[] {
  const totalTry = summary.totals.TRY.value;
  return summary.allocation.map((slice) => {
    const list = holdings
      .filter((h) => h.kind === slice.kind && h.quantity > 0 && h.valueTry != null && h.valueTry > 0)
      .sort((a, b) => b.valueTry! - a.valueTry!);
    const colors = assignColors(
      slice.kind,
      list.map((h) => h.key),
    );
    const assets = list.map((h, i) => ({
      key: h.key,
      kind: h.kind,
      label: displaySymbol(h.kind, h.symbol),
      valueTry: h.valueTry!,
      pct: totalTry > 0 ? (h.valueTry! / totalTry) * 100 : 0,
      pctOfKind: slice.valueTry > 0 ? (h.valueTry! / slice.valueTry) * 100 : 0,
      color: colors[i],
      holding: h,
    }));
    return {
      kind: slice.kind,
      label: kindInfo(slice.kind).shortLabel,
      valueTry: slice.valueTry,
      pct: slice.pct,
      totals: slice.totals,
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

/**
 * Köşeleri yuvarlatılmış halka dilimi. Dilim dar ise köşe yarıçapı kendiliğinden küçülür.
 * Tam turda köşe olmadığından düz halka çizilir.
 */
export function roundedArcPath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  corner: number,
): string {
  const span = a1 - a0;
  if (span <= 0) return '';
  if (span >= TAU - 1e-6) return arcPath(cx, cy, r0, r1, a0, a1);
  // Köşe yarıçapı; dilimin iç kenar genişliğinin ve kalınlığının yarısını aşmasın.
  const rc = Math.max(0, Math.min(corner, (r1 - r0) / 2, (span * r0) / 2 - 0.01));
  if (rc < 0.5) return arcPath(cx, cy, r0, r1, a0, a1);
  const dOut = rc / r1;
  const dIn = rc / r0;
  const p = (r: number, a: number) => point(cx, cy, r, a);
  const outLarge = span - 2 * dOut > Math.PI ? 1 : 0;
  const inLarge = span - 2 * dIn > Math.PI ? 1 : 0;
  return [
    `M${p(r1, a0 + dOut)}`,
    `A${r1},${r1} 0 ${outLarge} 1 ${p(r1, a1 - dOut)}`,
    `Q${p(r1, a1)} ${p(r1 - rc, a1)}`,
    `L${p(r0 + rc, a1)}`,
    `Q${p(r0, a1)} ${p(r0, a1 - dIn)}`,
    `A${r0},${r0} 0 ${inLarge} 0 ${p(r0, a0 + dIn)}`,
    `Q${p(r0, a0)} ${p(r0 + rc, a0)}`,
    `L${p(r1 - rc, a0)}`,
    `Q${p(r1, a0)} ${p(r1, a0 + dOut)}`,
    'Z',
  ].join(' ');
}

export interface SliceLabel {
  id: string;
  text: string;
  /** Etiket kutusunun merkezi. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelOptions {
  cx: number;
  cy: number;
  /** Halkanın dış yarıçapı. */
  radius: number;
  /** Halka ile etiket arasındaki boşluk. */
  gap: number;
  height: number;
  /** Bir karakterin yaklaşık genişliği (px). */
  charWidth: number;
  /** Bu yüzdenin altındaki dilimlere etiket konmaz. */
  minPct: number;
  /** Dilimin ayrıca dışarı kaydığı miktar (açılan dilimler için). */
  push?: (slice: DonutSlice) => number;
}

/** Dilimin ortasının dışına, kutunun halkaya değmeyeceği uzaklıkta etiket konumu. */
export function labelCenter(slice: DonutSlice, width: number, o: LabelOptions): { x: number; y: number } {
  const mid = (slice.start + slice.end) / 2;
  const sin = Math.sin(mid);
  const cos = Math.cos(mid);
  // Kutunun bu yöndeki yarı genişliği (dikdörtgenin destek fonksiyonu).
  const half = (Math.abs(sin) * width) / 2 + (Math.abs(cos) * o.height) / 2;
  const r = o.radius + o.gap + half + (o.push?.(slice) ?? 0);
  return { x: o.cx + r * sin, y: o.cy - r * cos };
}

/**
 * Halkanın kenarına yüzde etiketlerini yerleştirir. Bir tür açıksa yalnız onun varlıkları etiketlenir.
 * Büyük dilimler önceliklidir; üst üste binecek etiketler atlanır.
 */
export function layoutLabels(
  slices: DonutSlice[],
  pctById: Record<string, number>,
  format: (pct: number) => string,
  o: LabelOptions,
): SliceLabel[] {
  const anyExpanded = slices.some((s) => s.expanded);
  const candidates = slices
    .filter((s) => (anyExpanded ? s.expanded : true) && (pctById[s.id] ?? 0) >= o.minPct)
    .sort((a, b) => (pctById[b.id] ?? 0) - (pctById[a.id] ?? 0));
  const placed: SliceLabel[] = [];
  for (const s of candidates) {
    const text = format(pctById[s.id]);
    const width = Math.ceil(text.length * o.charWidth + 8);
    const { x, y } = labelCenter(s, width, o);
    const box = { id: s.id, text, x, y, width, height: o.height };
    const overlaps = placed.some(
      (b) =>
        Math.abs(b.x - box.x) < (b.width + box.width) / 2 + 2 &&
        Math.abs(b.y - box.y) < (b.height + box.height) / 2 + 1,
    );
    if (!overlaps) placed.push(box);
  }
  return placed;
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
