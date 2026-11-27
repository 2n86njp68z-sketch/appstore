import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeHoldings, computeSummary } from '../src/lib/portfolio';
import type { RawQuote, Transaction } from '../src/lib/types';
import { formatPeriod, xirr } from '../src/lib/xirr';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('xirr: Excel belgesindeki örnek (%37,34)', () => {
  const r = xirr([
    { date: '2008-01-01', amount: -10000 },
    { date: '2008-03-01', amount: 2750 },
    { date: '2008-10-30', amount: 4250 },
    { date: '2009-02-15', amount: 3250 },
    { date: '2009-04-01', amount: 2750 },
  ]);
  assert.ok(r);
  close(r.rate, 0.373362535, 1e-6);
  assert.equal(r.days, 456);
});

test('xirr: tek alış, bir yıl sonra %10 fazla', () => {
  const r = xirr([
    { date: '2021-03-01', amount: -100 },
    { date: '2022-03-01', amount: 110 },
  ]);
  close(r!.rate, 0.1);
});

test('xirr: zarar, ara alış ve hiç dönüş olmayan durum', () => {
  const loss = xirr([
    { date: '2021-01-01', amount: -1000 },
    { date: '2023-01-01', amount: 640 },
  ]);
  close(loss!.rate, Math.pow(0.64, 365 / 730) - 1);
  // Para eklemek getiriyi şişirmez: 2 yılda 1000 → 1210 (%10/yıl), ortadaki ekleme de %10'la büyür
  const mid = xirr([
    { date: '2021-01-01', amount: -1000 },
    { date: '2022-01-01', amount: -500 },
    { date: '2023-01-01', amount: 1000 * Math.pow(1.1, 730 / 365) + 500 * 1.1 },
  ]);
  close(mid!.rate, 0.1, 1e-6);
  // Tamamen sıfıra düşen yatırım: oran −%100'e yakın
  const wiped = xirr([
    { date: '2021-01-01', amount: -1000 },
    { date: '2022-01-01', amount: 0.01 },
  ]);
  assert.ok(wiped && wiped.rate < -0.99 && wiped.rate > -1);
});

test('xirr: tek yönlü akış ya da çok kısa dönem hesaplanmaz', () => {
  assert.equal(xirr([{ date: '2021-01-01', amount: -100 }]), undefined);
  assert.equal(
    xirr([
      { date: '2021-01-01', amount: -100 },
      { date: '2021-01-10', amount: 102 },
    ]),
    undefined,
  );
  assert.ok(
    xirr(
      [
        { date: '2021-01-01', amount: -100 },
        { date: '2021-01-10', amount: 102 },
      ],
      0,
    ),
  );
});

test('formatPeriod', () => {
  assert.equal(formatPeriod(40), '40 gün');
  assert.equal(formatPeriod(152), '5 ay');
  assert.equal(formatPeriod(365), '1 yıl');
  assert.equal(formatPeriod(822), '2 yıl 3 ay');
});

let id = 0;
const tx = (t: Partial<Transaction>): Transaction => ({
  id: String(++id),
  kind: 'bist',
  symbol: 'ASELS',
  side: 'buy',
  quantity: 100,
  price: 10,
  date: '2024-03-01',
  createdAt: id,
  ...t,
});

const raw: Record<string, RawQuote> = {
  'ASELS.IS': { price: 12, fetchedAt: 1 },
  'THYAO.IS': { price: 300, fetchedAt: 1 },
  'USDTRY=X': { price: 40, fetchedAt: 1 },
  'EURTRY=X': { price: 45, fetchedAt: 1 },
};

test('varlık: alış + bugünkü değer + temettü akışları', () => {
  const [h] = computeHoldings([tx({})], raw, {}, {}, {}, '2025-03-01');
  const v = h.views.TRY!;
  assert.deepEqual(v.flows, [
    { date: '2024-03-01', amount: -1000 },
    { date: '2025-03-01', amount: 1200 },
  ]);
  close(v.xirr!.rate, 0.2);
  // 1 TL net temettü: 100 TL daha
  const [d] = computeHoldings(
    [tx({})],
    raw,
    {},
    {},
    { 'bist:ASELS': [{ date: '2024-09-02', dividend: 1 }] },
    '2025-03-01',
  );
  assert.ok(d.views.TRY!.xirr!.rate > 0.2);
  assert.ok(d.views.TRY!.flows.some((f) => f.date === '2024-09-02' && f.amount === 100));
});

test('dolar bazında akışlar işlem günündeki kurla', () => {
  const history = { USD: { dates: ['2024-03-01'], rates: [32], fetchedAt: 1 } };
  const [h] = computeHoldings([tx({})], raw, {}, history, {}, '2025-03-01');
  const usd = h.views.USD!;
  close(usd.flows[0].amount, -1000 / 32);
  close(usd.flows[1].amount, 1200 / 40);
  close(usd.xirr!.rate, 1200 / 40 / (1000 / 32) - 1);
});

test('portföy: kapanan varlıklar da yıllık getiriye girer', () => {
  const txs = [
    tx({}),
    tx({ symbol: 'THYAO', price: 200, quantity: 10, date: '2024-03-01' }),
    tx({ symbol: 'THYAO', side: 'sell', price: 300, quantity: 10, date: '2025-03-01' }),
  ];
  const holdings = computeHoldings(txs, raw, {}, {}, {}, '2025-03-01');
  const { totals } = computeSummary(holdings);
  // Açık: 1000 → 1200; kapanan: 2000 → 3000. Toplam 3000 → 4200 (%40)
  close(totals.TRY.xirr!.rate, 0.4);
  // Toplam K/Z yalnız açık pozisyonu gösterir (değişmedi)
  close(totals.TRY.pnl, 200);
});
