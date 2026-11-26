import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  arcPath,
  buildChartData,
  hitTest,
  labelCenter,
  layoutLabels,
  layoutSlices,
  paletteFor,
  roundedArcPath,
} from '../src/lib/donut';
import { computeHoldings, computeSummary } from '../src/lib/portfolio';
import type { RawQuote, Transaction } from '../src/lib/types';

const TAU = Math.PI * 2;
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

let seq = 0;
function buy(kind: Transaction['kind'], symbol: string, quantity: number, price: number): Transaction {
  seq += 1;
  return { id: String(seq), kind, symbol, side: 'buy', quantity, price, date: '2026-01-01', createdAt: seq };
}

const raw: Record<string, RawQuote> = {
  'USDTRY=X': { price: 40, fetchedAt: 1 },
  'EURTRY=X': { price: 50, fetchedAt: 1 },
  'THYAO.IS': { price: 100, fetchedAt: 1 },
  'ASELS.IS': { price: 50, fetchedAt: 1 },
  'SISE.IS': { price: 10, fetchedAt: 1 },
  AAPL: { price: 25, fetchedAt: 1 },
  'GC=F': { price: 31.1034768, fetchedAt: 1 }, // gram altın = 40 TL
};

// BIST: THYAO 3000, ASELS 1500, SISE 500 → 5000 (%50)
// ABD: AAPL 3 × 25$ × 40 = 3000 (%30)
// Emtia: 50 gram × 40 = 2000 (%20)
const txs = [
  buy('bist', 'ASELS', 30, 40),
  buy('bist', 'THYAO', 30, 80),
  buy('bist', 'SISE', 50, 12),
  buy('us', 'AAPL', 3, 20),
  buy('metal', 'GRAM_ALTIN', 50, 30),
];
const holdings = computeHoldings(txs, raw, {});
const summary = computeSummary(holdings);
const cats = buildChartData(holdings, summary);

test('türler portföy payına, varlıklar değere göre sıralanır', () => {
  assert.deepEqual(
    cats.map((c) => [c.kind, Math.round(c.pct)]),
    [
      ['bist', 50],
      ['us', 30],
      ['metal', 20],
    ],
  );
  const bist = cats[0];
  assert.deepEqual(
    bist.assets.map((a) => a.label),
    ['THYAO', 'ASELS', 'SISE'],
  );
  close(bist.assets[0].pct, 30); // portföyün %30'u
  close(bist.assets[0].pctOfKind, 60); // BIST'in %60'ı
  assert.equal(cats[2].assets[0].label, 'Gram Altın');
});

test('tür kâr/zararı', () => {
  // BIST maliyet: 1200 + 2400 + 600 = 4200, değer 5000
  close(cats[0].totals.TRY!.pnl, 800);
  close(cats[0].totals.TRY!.pnlPct, (800 / 4200) * 100);
  close(cats[0].totals.USD!.value, 5000 / 40);
});

test('her varlık farklı renk alır, ilk renk türün rengi', () => {
  const colors = cats[0].assets.map((a) => a.color);
  assert.equal(new Set(colors).size, colors.length);
  assert.equal(colors[0], paletteFor('bist')[0]);
  assert.equal(colors[0], cats[0].color);
});

test('kapalıyken türler tam turu paylaşır', () => {
  const slices = layoutSlices(cats);
  assert.equal(slices.length, 3);
  close(slices[0].start, 0);
  close(slices[0].end, TAU * 0.5);
  close(slices[2].end, TAU);
  assert.ok(slices.every((s) => !s.expanded));
});

test('açılan tür yerinde varlıklara bölünür, diğerleri yerinde kalır', () => {
  const slices = layoutSlices(cats, 'bist');
  assert.deepEqual(
    slices.map((s) => s.id),
    ['bist:THYAO', 'bist:ASELS', 'bist:SISE', 'us', 'metal'],
  );
  // THYAO portföyün %30'u → 0.3 tur
  close(slices[0].end - slices[0].start, TAU * 0.3);
  close(slices[2].end, TAU * 0.5);
  close(slices[3].start, TAU * 0.5);
  assert.ok(slices.slice(0, 3).every((s) => s.expanded));
  assert.ok(!slices[3].expanded);
});

test('ortadaki tür açılınca da açılar kayar değil, yerinde kalır', () => {
  const closedLayout = layoutSlices(cats);
  const openLayout = layoutSlices(cats, 'us');
  const usClosed = closedLayout.find((s) => s.id === 'us')!;
  const usParts = openLayout.filter((s) => s.kind === 'us');
  close(usParts[0].start, usClosed.start);
  close(usParts[usParts.length - 1].end, usClosed.end);
});

test('dokunma noktası doğru dilimi bulur', () => {
  const slices = layoutSlices(cats);
  const cx = 150;
  const cy = 150;
  const r0 = 80;
  const r1 = 120;
  // Saat 3 yönü (90°) → ilk yarı → BIST
  let hit = hitTest(slices, cx + 100, cy, cx, cy, r0, r1);
  assert.equal(hit.type === 'slice' && hit.slice.id, 'bist');
  // Saat 9 yönü (270°) → %50-%80 arası ABD (180°-288°)
  hit = hitTest(slices, cx - 100, cy, cx, cy, r0, r1);
  assert.equal(hit.type === 'slice' && hit.slice.id, 'us');
  // Saat 11 yönü (~330°) → emtia (288°-360°)
  hit = hitTest(slices, cx - 50, cy - 87, cx, cy, r0, r1);
  assert.equal(hit.type === 'slice' && hit.slice.id, 'metal');
  assert.equal(hitTest(slices, cx + 5, cy + 5, cx, cy, r0, r1).type, 'center');
  assert.equal(hitTest(slices, cx + 149, cy, cx, cy, r0, r1).type, 'outside');
});

test('açıkken varlık dilimine dokunulabilir', () => {
  const slices = layoutSlices(cats, 'bist');
  // THYAO 0-108°, ASELS 108-162°, SISE 162-180°
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const hit = hitTest(slices, 150 + 100 * Math.sin(a), 150 - 100 * Math.cos(a), 150, 150, 80, 120);
    return hit.type === 'slice' ? hit.slice.id : hit.type;
  };
  assert.equal(at(50), 'bist:THYAO');
  assert.equal(at(130), 'bist:ASELS');
  assert.equal(at(170), 'bist:SISE');
  assert.equal(at(200), 'us');
});

test('SVG yolu: normal dilim ve tam halka', () => {
  const d = arcPath(100, 100, 50, 80, 0, Math.PI / 2);
  assert.match(
    d,
    /^M100\.000,20\.000 A80,80 0 0 1 180\.000,100\.000 L150\.000,100\.000 A50,50 0 0 0 100\.000,50\.000 Z$/,
  );
  const full = arcPath(100, 100, 50, 80, 0, TAU);
  assert.equal((full.match(/M/g) ?? []).length, 2);
  assert.equal(arcPath(100, 100, 50, 80, 1, 1), '');
});

test('tek türlü portföy tam halka olur', () => {
  const only = computeHoldings([buy('bist', 'THYAO', 1, 100)], raw, {});
  const c = buildChartData(only, computeSummary(only));
  const slices = layoutSlices(c);
  assert.equal(slices.length, 1);
  close(slices[0].end - slices[0].start, TAU);
});

test('altın ve gümüş sabit renk alır, diğer renklerle çakışmaz', () => {
  const metals = computeHoldings(
    [buy('metal', 'GRAM_GUMUS', 100, 30), buy('metal', 'GRAM_ALTIN', 1, 30)],
    { ...raw, 'SI=F': { price: 31.1034768, fetchedAt: 1 } },
    {},
  );
  const c = buildChartData(metals, computeSummary(metals));
  const byLabel = Object.fromEntries(c[0].assets.map((a) => [a.label, a.color]));
  assert.equal(byLabel['Gram Altın'], '#F7C948');
  assert.equal(byLabel['Gram Gümüş'], '#B8C2D0');
});

const fmt = (p: number) => `%${Math.round(p)}`;
const labelOpts = { cx: 150, cy: 150, radius: 100, gap: 6, height: 16, charWidth: 7, minPct: 2 };
const pctById = (c: typeof cats) => {
  const m: Record<string, number> = {};
  for (const cat of c) {
    m[cat.kind] = cat.pct;
    for (const a of cat.assets) m[a.key] = a.pct;
  }
  return m;
};

test('kapalıyken her türün kenarında yüzdesi yazar', () => {
  const labels = layoutLabels(layoutSlices(cats), pctById(cats), fmt, labelOpts);
  assert.deepEqual(labels.map((l) => [l.id, l.text]).sort(), [
    ['bist', '%50'],
    ['metal', '%20'],
    ['us', '%30'],
  ]);
  // BIST 0-180°: ortası saat 3 yönü → etiket halkanın sağında, dışında
  const bist = labels.find((l) => l.id === 'bist')!;
  assert.ok(bist.x - bist.width / 2 >= 150 + 100 + 6 - 0.01, 'halkaya değmez');
  close(bist.y, 150, 0.5);
});

test('açıkken yalnız o türün varlıkları etiketlenir (portföydeki payları)', () => {
  const labels = layoutLabels(layoutSlices(cats, 'bist'), pctById(cats), fmt, labelOpts);
  // THYAO %30, ASELS %15, SISE %5
  assert.deepEqual(labels.map((l) => l.text).sort(), ['%15', '%30', '%5']);
});

test('çakışan ve çok küçük dilimlerin etiketi atlanır', () => {
  const many = computeHoldings(
    [
      buy('bist', 'THYAO', 1000, 1),
      buy('bist', 'ASELS', 3, 1), // %0,3 → minPct altında
      buy('bist', 'SISE', 30, 1),
      buy('bist', 'KCHOL', 30, 1),
      buy('bist', 'AKBNK', 30, 1),
    ],
    { ...raw, 'AKBNK.IS': { price: 10, fetchedAt: 1 }, 'KCHOL.IS': { price: 10, fetchedAt: 1 } },
    {},
  );
  const c = buildChartData(many, computeSummary(many));
  const labels = layoutLabels(layoutSlices(c, 'bist'), pctById(c), fmt, labelOpts);
  assert.ok(!labels.some((l) => l.id === 'bist:ASELS'));
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      const overlap = Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
      assert.ok(!overlap, `${a.id} ile ${b.id} üst üste`);
    }
  }
});

test('açılan dilimin etiketi kayma kadar dışarı çıkar', () => {
  const s = layoutSlices(cats, 'bist')[0];
  const base = labelCenter(s, 30, labelOpts);
  const pushed = labelCenter(s, 30, { ...labelOpts, push: () => 16 });
  close(Math.hypot(pushed.x - 150, pushed.y - 150) - Math.hypot(base.x - 150, base.y - 150), 16);
});

test('yuvarlak köşeli dilim yolu', () => {
  const d = roundedArcPath(100, 100, 60, 90, 0, Math.PI / 2, 5);
  assert.equal((d.match(/Q/g) ?? []).length, 4);
  assert.match(d, /^M.* Z$/);
  // Çok dar dilimde köşe küçülür, yol yine geçerli kalır.
  const thin = roundedArcPath(100, 100, 60, 90, 0, 0.05, 5);
  assert.ok(thin.length > 0 && !thin.includes('NaN'));
  // Tam tur: köşesiz halka
  assert.equal(roundedArcPath(100, 100, 60, 90, 0, Math.PI * 2, 5), arcPath(100, 100, 60, 90, 0, Math.PI * 2));
});
