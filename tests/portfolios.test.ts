import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeBackup, parseBackup } from '../src/lib/backup';
import {
  ALL_PORTFOLIOS,
  filterByPortfolio,
  MAIN_PORTFOLIO,
  migrateTargets,
  normalizePortfolios,
  portfolioOf,
  targetPortfolio,
  uniqueName,
  validActive,
} from '../src/lib/portfolios';
import type { Transaction } from '../src/lib/types';

const tx = (t: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36),
  kind: 'bist',
  symbol: 'THYAO',
  side: 'buy',
  quantity: 1,
  price: 1,
  date: '2026-01-01',
  createdAt: 1,
  ...t,
});

test('portfolioId olmayan işlem Ana portföyde; Tümü hepsini gösterir', () => {
  const a = tx({});
  const b = tx({ portfolioId: 'bes' });
  assert.equal(portfolioOf(a), MAIN_PORTFOLIO);
  assert.deepEqual(filterByPortfolio([a, b], MAIN_PORTFOLIO), [a]);
  assert.deepEqual(filterByPortfolio([a, b], 'bes'), [b]);
  assert.deepEqual(filterByPortfolio([a, b], ALL_PORTFOLIOS), [a, b]);
  assert.equal(targetPortfolio(ALL_PORTFOLIOS), MAIN_PORTFOLIO);
  assert.equal(targetPortfolio('bes'), 'bes');
});

test('liste düzeltme: Ana portföy ilk sırada, tekrar ve bozuklar atlanır', () => {
  const list = normalizePortfolios([
    { id: 'bes', name: ' BES ', createdAt: 5 },
    { id: 'bes', name: 'Kopya' },
    { id: 'all', name: 'Yasak' },
    null,
    { id: 'x', name: '' },
  ]);
  assert.deepEqual(
    list.map((p) => `${p.id}:${p.name}`),
    ['main:Ana portföy', 'bes:BES', 'x:Portföy'],
  );
  assert.deepEqual(
    normalizePortfolios(undefined).map((p) => p.id),
    [MAIN_PORTFOLIO],
  );
  // Ana portföyün adı değiştirilmişse korunur
  assert.equal(normalizePortfolios([{ id: 'main', name: 'Benim' }])[0].name, 'Benim');
});

test('seçili görünüm: silinmiş portföy ya da tek portföyde Tümü → Ana portföy', () => {
  const two = normalizePortfolios([{ id: 'bes', name: 'BES' }]);
  assert.equal(validActive('bes', two), 'bes');
  assert.equal(validActive('yok', two), MAIN_PORTFOLIO);
  assert.equal(validActive(ALL_PORTFOLIOS, two), ALL_PORTFOLIOS);
  assert.equal(validActive(ALL_PORTFOLIOS, normalizePortfolios([])), MAIN_PORTFOLIO);
});

test('eski tek hedef listesi Ana portföyün olur', () => {
  assert.deepEqual(migrateTargets(null, { 'bist:THYAO': 30 }), { main: { 'bist:THYAO': 30 } });
  assert.deepEqual(migrateTargets({ bes: { 'bes:ABE': 100 } }, { 'bist:THYAO': 30 }), { bes: { 'bes:ABE': 100 } });
  assert.deepEqual(migrateTargets(null, {}), {});
});

test('aynı ad: sonuna sayı', () => {
  const list = normalizePortfolios([{ id: 'bes', name: 'BES' }]);
  assert.equal(uniqueName('bes', list), 'bes 2');
  assert.equal(uniqueName('BES', list, 'bes'), 'BES');
  assert.equal(uniqueName('  ', list), 'Portföy');
});

test('yedekte portföy bilgisi korunur', () => {
  const t = tx({ portfolioId: 'bes' });
  const json = makeBackup({
    transactions: [t],
    manualPrices: {},
    displayCurrency: 'TRY',
    extra: { portfolios: [{ id: 'bes', name: 'BES', createdAt: 1 }], activePortfolio: 'bes' },
  });
  const p = parseBackup(json);
  assert.ok(p.ok);
  assert.equal(p.data.transactions[0].portfolioId, 'bes');
  assert.deepEqual(
    normalizePortfolios(p.data.extra?.portfolios).map((x) => x.id),
    ['main', 'bes'],
  );
});
