import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeHoldings, computeSummary } from '../src/lib/portfolio';
import type { RawQuote, Transaction } from '../src/lib/types';
import { buildWidgetProps } from '../src/widgets/portfolio-widget-props';

const tx = (t: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36),
  kind: 'bist',
  symbol: 'THYAO',
  side: 'buy',
  quantity: 100,
  price: 280,
  date: '2025-03-03',
  createdAt: 1,
  ...t,
});
const raw: Record<string, RawQuote> = {
  'THYAO.IS': { price: 320, previousClose: 316.8, fetchedAt: 1 },
  'ASELS.IS': { price: 180, previousClose: 181.8, fetchedAt: 1 },
  'MGROS.IS': { price: 500, previousClose: 500, fetchedAt: 1 },
  AAPL: { price: 230, previousClose: 228, fetchedAt: 1 },
  'USDTRY=X': { price: 42, fetchedAt: 1 },
  'EURTRY=X': { price: 49, fetchedAt: 1 },
};

test('widget metinleri: değer, günlük/toplam, en büyük üç varlık', () => {
  const holdings = computeHoldings(
    [
      tx({}),
      tx({ symbol: 'ASELS', quantity: 50, price: 150 }),
      tx({ symbol: 'MGROS', quantity: 10, price: 400 }),
      tx({ kind: 'us', symbol: 'AAPL', quantity: 10, price: 200 }),
    ],
    raw,
    {},
    {},
    {},
    '2026-11-27',
  );
  const summary = computeSummary(holdings);
  const at = new Date(2026, 10, 27, 14, 35).getTime();
  const p = buildWidgetProps(summary, holdings, 'TRY', at);
  assert.equal(p.empty, false);
  assert.equal(p.value, '₺142.600');
  assert.equal(p.updated, 'Güncellendi 14:35');
  assert.deepEqual(
    p.top.map((r) => `${r.name} ${r.pct} ${r.up}`),
    ['AAPL +%0,9 true', 'THYAO +%1,0 true', 'ASELS -%1,0 false'],
  );
  assert.ok(p.totalUp && p.totalPct.startsWith('+%'));
  assert.ok(p.yearly?.startsWith('+%'));
  // Dolar bazında
  const usd = buildWidgetProps(summary, holdings, 'USD', at);
  assert.equal(usd.value, '$3.395');
});

test('boş portföy', () => {
  const p = buildWidgetProps(computeSummary([]), [], 'TRY', undefined);
  assert.equal(p.empty, true);
  assert.deepEqual(p.top, []);
});
