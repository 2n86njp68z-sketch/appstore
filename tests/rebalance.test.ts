import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planBuy, planRebalance, planWithdraw, stepFor, type RebalanceItem } from '../src/lib/rebalance';

const item = (key: string, unitPrice: number, quantity: number, step = 1): RebalanceItem => ({
  key,
  label: key,
  unitPrice,
  quantity,
  step,
});
const by = (rows: { key: string; delta: number }[]) => Object.fromEntries(rows.map((r) => [r.key, r.delta]));

test('alım birimleri', () => {
  assert.equal(stepFor('bist', 'THYAO'), 1);
  assert.equal(stepFor('crypto', 'BTC'), 0.0001);
  assert.equal(stepFor('metal', 'GRAM_ALTIN'), 0.1);
  assert.equal(stepFor('metal', 'ONS_ALTIN'), 0.01);
  assert.equal(stepFor('eurobond', 'US900123DF45'), 1000);
});

test('nakit ekle: satış yok, nakit aşılmaz, en geride olana gider', () => {
  // ENKAI hedefin çok gerisinde; nakdin çoğu ona
  const items = [item('ANSGR', 100, 240), item('MGROS', 500, 46), item('ENKAI', 50, 100)];
  const targets = { ANSGR: 40, MGROS: 40, ENKAI: 20 };
  const r = planBuy(items, targets, 10_000);
  const d = by(r.rows);
  assert.ok(
    Object.values(d).every((x) => x >= 0),
    'satış yok',
  );
  assert.ok(r.bought <= 10_000 + 1e-6);
  assert.ok(r.left < 500, `artan ${r.left} en pahalı lottan az`);
  assert.ok(d.ENKAI * 50 > 5000, 'en çok eksik olana');
  // Her satır alım birimi katında
  for (const row of r.rows) assert.equal(row.delta, Math.round(row.delta));
  assert.ok(r.needForPerfect! > 0);
});

test('nakit ekle: kesirli birim ve küçük fiyatlı fon hızlı', () => {
  const items = [item('BTC', 3_900_000, 0.01, 0.0001), item('FON', 0.11, 100_000), item('THYAO', 300, 10)];
  const t0 = Date.now();
  const r = planBuy(items, { BTC: 30, FON: 50, THYAO: 20 }, 250_000);
  assert.ok(Date.now() - t0 < 500, 'hızlı');
  const d = by(r.rows);
  close4(d.BTC % 0.0001, 0);
  assert.ok(r.bought <= 250_000 + 1e-6 && r.left < 300);
  assert.ok(d.FON > 0 && Number.isInteger(Math.round(d.FON)));
});

function close4(a: number, b: number) {
  assert.ok(Math.abs(a - b) < 1e-6 || Math.abs(a - 0.0001) < 1e-6, `${a}`);
}

test('dengele: fazlası satılır, gelirle eksik alınır, alım ≤ satış', () => {
  const items = [item('A', 100, 80), item('B', 100, 10), item('C', 100, 10)];
  const r = planRebalance(items, { A: 34, B: 33, C: 33 });
  const d = by(r.rows);
  assert.ok(d.A < 0 && d.B > 0 && d.C > 0);
  assert.ok(r.bought <= r.sold + 1e-6);
  const after = r.rows.map((x) => Math.abs(x.after - x.target));
  assert.ok(Math.max(...after) < 0.02, 'hedefe yakın');
  // Zaten dengedeyse işlem yok
  const flat = planRebalance([item('A', 100, 50), item('B', 100, 50)], { A: 50, B: 50 });
  assert.ok(flat.rows.every((x) => x.delta === 0));
});

test('nakit çek: fazlası olandan satılır, tutar toplanır; yetmezse eksik bildirilir', () => {
  const items = [item('A', 100, 70), item('B', 100, 30)];
  const r = planWithdraw(items, { A: 50, B: 50 }, 2_000);
  const d = by(r.rows);
  assert.equal(d.A, -20);
  assert.equal(d.B, 0);
  assert.equal(r.short, 0);
  const big = planWithdraw(items, { A: 50, B: 50 }, 50_000);
  assert.equal(big.short, 40_000);
  assert.deepEqual(by(big.rows), { A: -70, B: -30 });
  // Hedefi olmayan (0) önce satılır
  const r2 = planWithdraw([item('A', 100, 50), item('B', 100, 50), item('X', 100, 10)], { A: 50, B: 50 }, 1_000);
  assert.equal(by(r2.rows).X, -10);
});
