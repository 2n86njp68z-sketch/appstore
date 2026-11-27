import assert from 'node:assert/strict';
import { test } from 'node:test';

import { backupFileName, makeBackup, mergeTransactions, parseBackup } from '../src/lib/backup';
import type { Transaction } from '../src/lib/types';

const tx = (id: string, extra: Partial<Transaction> = {}): Transaction => ({
  id,
  kind: 'bist',
  symbol: 'THYAO',
  side: 'buy',
  quantity: 10,
  price: 300,
  date: '2026-03-02',
  createdAt: 1,
  ...extra,
});

test('yedek: dışa aktarılan dosya aynen geri okunur', () => {
  const text = makeBackup(
    {
      transactions: [tx('a'), tx('b', { kind: 'fund', symbol: 'AFT' })],
      manualPrices: { 'other:EV': 5 },
      displayCurrency: 'USD',
    },
    new Date('2026-11-27T10:00:00Z'),
  );
  const p = parseBackup(text);
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.data.transactions.length, 2);
  assert.equal(p.data.displayCurrency, 'USD');
  assert.deepEqual(p.data.manualPrices, { 'other:EV': 5 });
  assert.equal(p.data.exportedAt, '2026-11-27T10:00:00.000Z');
  assert.equal(p.skipped, 0);
  assert.equal(backupFileName(new Date('2026-11-27T10:00:00Z')), 'GENIUS-yedek-2026-11-27.json');
});

test('yedek: bozuk dosya ve bozuk işlemler', () => {
  assert.equal(parseBackup('{bozuk').ok, false);
  assert.equal(parseBackup(JSON.stringify({ transactions: [] })).ok, false, 'GENIUS yedeği değil');
  assert.equal(parseBackup(JSON.stringify({ app: 'GENIUS', version: 99, transactions: [] })).ok, false, 'yeni sürüm');
  const p = parseBackup(
    JSON.stringify({
      app: 'GENIUS',
      version: 1,
      transactions: [
        tx('a'),
        { ...tx('b'), kind: 'yok' },
        { ...tx('c'), quantity: -1 },
        { ...tx('d'), date: '27.11.2026' },
      ],
      manualPrices: { x: 'bozuk', y: 2 },
      displayCurrency: 'JPY',
    }),
  );
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.deepEqual(
    p.data.transactions.map((t) => t.id),
    ['a'],
  );
  assert.equal(p.skipped, 3);
  assert.deepEqual(p.data.manualPrices, { y: 2 });
  assert.equal(p.data.displayCurrency, 'TRY');
});

test('birleştirme: aynı kimlikli işlem bir kez', () => {
  const merged = mergeTransactions([tx('a'), tx('b')], [tx('b', { quantity: 99 }), tx('c')]);
  assert.deepEqual(
    merged.map((t) => [t.id, t.quantity]),
    [
      ['a', 10],
      ['b', 10],
      ['c', 10],
    ],
  );
});
