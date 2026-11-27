import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applySplits, corporateEvents, quantityBefore } from '../src/lib/corporate';
import { computeHoldings, computeSummary, heldQuantity } from '../src/lib/portfolio';
import { parseIsyatirimActions, parseYahooActions } from '../src/lib/prices';
import type { CorporateAction, RawQuote, Transaction } from '../src/lib/types';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

let id = 0;
const tx = (t: Partial<Transaction>): Transaction => ({
  id: String(++id),
  kind: 'bist',
  symbol: 'ASELS',
  side: 'buy',
  quantity: 100,
  price: 60,
  date: '2023-01-10',
  createdAt: id,
  ...t,
});

// ASELS benzeri: %100 bedelsiz (25.08.2023), ardından net temettü (22.11.2023)
const actions: CorporateAction[] = [
  { date: '2023-08-25', split: 2 },
  { date: '2023-11-22', dividend: 0.0789472 },
];

test('bedelsiz: hak kullanım gününden önceki alışlar çoğalır, maliyet aynı kalır', () => {
  const txs = [tx({}), tx({ date: '2023-08-25', quantity: 10, price: 31 })];
  const adj = applySplits(txs, actions);
  assert.equal(adj[0].quantity, 200);
  close(adj[0].price, 30);
  assert.equal(adj[1].quantity, 10, 'hak kullanım günü alınan değişmez');
  assert.equal(txs[0].quantity, 100, 'asıl işlem değişmez');
  assert.equal(quantityBefore(txs, actions, '2023-08-25'), 100);
  assert.equal(quantityBefore(txs, actions, '2023-11-22'), 210);
  assert.equal(heldQuantity(txs, 'bist', 'ASELS', actions), 210);
  assert.equal(heldQuantity(txs, 'bist', 'ASELS'), 110, 'kayıtsız eski davranış');
});

test('temettü: hak kullanım öncesi eldeki pay × net temettü; alıştan önceki olaylar sayılmaz', () => {
  const txs = [tx({}), tx({ side: 'sell', quantity: 50, price: 70, date: '2023-10-01' })];
  const ev = corporateEvents(txs, [{ date: '2022-11-16', dividend: 0.17 }, ...actions]);
  assert.equal(ev.dividends.length, 1, 'alıştan önceki temettü yok');
  assert.equal(ev.dividends[0].quantity, 150, '100 → 200 (bedelsiz), 50 satış');
  close(ev.dividends[0].amount, 150 * 0.0789472);
  assert.deepEqual(ev.splits, [{ date: '2023-08-25', split: 2, before: 100, after: 200 }]);
  // Tamamen satıldıktan sonraki temettü sayılmaz
  const sold = corporateEvents([tx({}), tx({ side: 'sell', quantity: 100, date: '2023-05-01' })], actions);
  assert.equal(sold.dividends.length, 0);
  assert.equal(sold.splits.length, 0);
});

test('portföyde: adet ve ortalama maliyet bedelsize göre, temettü kâra eklenir', () => {
  const raw: Record<string, RawQuote> = {
    'ASELS.IS': { price: 100, fetchedAt: 1 },
    'USDTRY=X': { price: 40, fetchedAt: 1 },
    'EURTRY=X': { price: 45, fetchedAt: 1 },
  };
  const [h] = computeHoldings([tx({})], raw, {}, {}, { 'bist:ASELS': actions });
  assert.equal(h.quantity, 200);
  close(h.avgCost, 30);
  close(h.marketValue, 20000);
  close(h.dividends, 200 * 0.0789472);
  close(h.views.TRY!.pnl, 20000 - 6000 + 200 * 0.0789472);
  close(h.views.TRY!.dividends, 200 * 0.0789472);
  assert.equal(h.transactions[0].quantity, 100, 'işlem listesinde girilen adet görünür');
  const s = computeSummary([h]);
  close(s.totals.TRY.dividends, 200 * 0.0789472);
  close(s.totals.TRY.pnl, 14000 + 200 * 0.0789472);
});

test('İş Yatırım kayıtları: bedelsiz oranları toplanır, net temettü, bedelli yok sayılır', () => {
  const rec = (date: string, o: Record<string, number>) => ({ SHHE_TARIH: Date.parse(`${date}T00:00:00Z`), ...o });
  const json = {
    d: JSON.stringify([
      rec('2023-08-25', { SHHE_BDSZ_TM_ORAN: 100, SHHE_NAKIT_TM_ORAN: 0 }),
      rec('2024-11-25', { SHHE_NAKIT_TM_ORAN: 11.18421, SHHE_NAKIT_TM_ORAN_NET: 10.06578 }),
      rec('2013-05-30', { SHHE_NAKIT_TM_ORAN: 14.44 }),
      rec('2013-06-26', { SHHE_BDSZ_IK_ORAN: 15 }),
      rec('2020-01-01', { SHHE_BDLI_ORAN: 50 }),
      rec('2021-05-05', { SHHE_BDSZ_IK_ORAN: 20, SHHE_BDSZ_TM_ORAN: 30, SHHE_NAKIT_TM_ORAN_NET: 5 }),
    ]),
  };
  const a = parseIsyatirimActions(json);
  assert.deepEqual(
    a.map((x) => x.date),
    ['2013-05-30', '2013-06-26', '2021-05-05', '2023-08-25', '2024-11-25'],
  );
  close(a[0].dividend!, 0.1444 * 0.85);
  close(a[1].split!, 1.15);
  close(a[2].split!, 1.5);
  close(a[2].dividend!, 0.05);
  close(a[3].split!, 2);
  close(a[4].dividend!, 0.1006578);
  assert.deepEqual(parseIsyatirimActions({ d: 'bozuk' }), []);
});

test('Yahoo olayları: bölünme oranı; eski temettü o günün pay sayısına çevrilir, %20 vergi düşülür', () => {
  const ts = (d: string) => Date.parse(`${d}T13:30:00Z`) / 1000;
  const json = {
    chart: {
      result: [
        {
          events: {
            splits: { a: { date: ts('2020-08-31'), numerator: 4, denominator: 1 } },
            dividends: {
              b: { date: ts('2020-02-07'), amount: 0.1925 },
              c: { date: ts('2020-11-06'), amount: 0.205 },
            },
          },
        },
      ],
    },
  };
  const a = parseYahooActions(json);
  assert.deepEqual(
    a.map((x) => x.date),
    ['2020-02-07', '2020-08-31', '2020-11-06'],
  );
  close(a[0].dividend!, 0.77 * 0.8);
  assert.equal(a[1].split, 4);
  close(a[2].dividend!, 0.205 * 0.8);
  assert.deepEqual(parseYahooActions({}), []);
});
