import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeSymbol, quoteSymbolFor, TROY_OUNCE_GRAMS } from '../src/lib/assets';
import {
  computeHoldings,
  computePosition,
  computeSummary,
  heldQuantity,
  requiredQuoteSymbols,
  resolveAssetQuote,
} from '../src/lib/portfolio';
import type { RawQuote, Transaction } from '../src/lib/types';

let seq = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, 'kind' | 'symbol'>): Transaction {
  seq += 1;
  return { id: String(seq), side: 'buy', quantity: 1, price: 1, date: '2026-01-01', createdAt: seq, ...p };
}

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('ortalama maliyet ve gerçekleşen kâr', () => {
  const pos = computePosition([
    tx({ kind: 'bist', symbol: 'THYAO', quantity: 100, price: 250, date: '2026-01-01' }),
    tx({ kind: 'bist', symbol: 'THYAO', quantity: 100, price: 350, date: '2026-02-01' }),
    tx({ kind: 'bist', symbol: 'THYAO', side: 'sell', quantity: 50, price: 400, date: '2026-03-01' }),
  ]);
  close(pos.quantity, 150);
  close(pos.avgCost, 300);
  close(pos.costBasis, 45000);
  close(pos.realizedPnl, 50 * (400 - 300));
});

test('işlemler tarihe göre sıralanır (satış önce girilmiş olsa bile)', () => {
  const pos = computePosition([
    tx({ kind: 'us', symbol: 'AAPL', side: 'sell', quantity: 5, price: 200, date: '2026-05-01' }),
    tx({ kind: 'us', symbol: 'AAPL', quantity: 10, price: 100, date: '2026-01-01' }),
  ]);
  close(pos.quantity, 5);
  close(pos.realizedPnl, 500);
});

test('eldekinden fazla satış sınırlanır, tamamen satınca maliyet sıfırlanır', () => {
  const pos = computePosition([
    tx({ kind: 'crypto', symbol: 'BTC', quantity: 0.1, price: 50000 }),
    tx({ kind: 'crypto', symbol: 'BTC', side: 'sell', quantity: 0.5, price: 60000, date: '2026-02-01' }),
  ]);
  close(pos.quantity, 0);
  close(pos.costBasis, 0);
  close(pos.realizedPnl, 0.1 * 10000);
});

test('sembol temizleme ve fiyat kaynağı sembolleri', () => {
  assert.equal(normalizeSymbol('bist', ' thyao.is '), 'THYAO');
  assert.equal(normalizeSymbol('bist', 'sise'), 'SISE');
  assert.equal(normalizeSymbol('crypto', 'btc-usd'), 'BTC');
  assert.equal(normalizeSymbol('crypto', 'ethusdt'), 'ETH');
  assert.equal(normalizeSymbol('crypto', 'usdt'), 'USDT');
  assert.equal(normalizeSymbol('other', '  ak  portföy  '), 'AK PORTFÖY');
  assert.equal(quoteSymbolFor('bist', 'THYAO'), 'THYAO.IS');
  assert.equal(quoteSymbolFor('crypto', 'BTC'), 'BTC-USD');
  assert.equal(quoteSymbolFor('fx', 'EUR'), 'EURTRY=X');
  assert.equal(quoteSymbolFor('metal', 'GRAM_ALTIN'), 'GC=F');
  assert.equal(quoteSymbolFor('other', 'AFT'), null);
});

test('gerekli semboller her zaman USD/TRY içerir, manuel varlıkları içermez', () => {
  const syms = requiredQuoteSymbols([
    tx({ kind: 'bist', symbol: 'THYAO' }),
    tx({ kind: 'bist', symbol: 'THYAO' }),
    tx({ kind: 'metal', symbol: 'GRAM_ALTIN' }),
    tx({ kind: 'other', symbol: 'AFT' }),
  ]);
  assert.deepEqual(syms.sort(), ['GC=F', 'THYAO.IS', 'USDTRY=X']);
});

const NOW = 1_700_000_000_000;
const raw: Record<string, RawQuote> = {
  'USDTRY=X': { price: 40, previousClose: 39.5, fetchedAt: NOW },
  'THYAO.IS': { price: 300, previousClose: 290, name: 'Turk Hava Yollari', fetchedAt: NOW },
  AAPL: { price: 200, previousClose: 210, name: 'Apple Inc.', fetchedAt: NOW },
  'GC=F': { price: 3110.34768, previousClose: 3000, fetchedAt: NOW },
};

test('gram altın ons fiyatı ve kurdan hesaplanır', () => {
  const q = resolveAssetQuote('metal', 'GRAM_ALTIN', raw, {});
  assert.ok(q);
  close(q.price, (3110.34768 * 40) / TROY_OUNCE_GRAMS); // 4000
  close(q.previousClose!, (3000 * 39.5) / TROY_OUNCE_GRAMS);
});

test('manuel fiyatlı varlık', () => {
  assert.equal(resolveAssetQuote('other', 'AFT', raw, {}), undefined);
  assert.equal(resolveAssetQuote('other', 'AFT', raw, { 'other:AFT': 1.5 })?.price, 1.5);
});

test('portföy toplamları TL cinsinden hesaplanır', () => {
  const txs = [
    tx({ kind: 'bist', symbol: 'THYAO', quantity: 10, price: 250 }), // değer 3000, maliyet 2500
    tx({ kind: 'us', symbol: 'AAPL', quantity: 5, price: 180 }), // değer 1000$ = 40000₺, maliyet 900$ = 36000₺
    tx({ kind: 'metal', symbol: 'GRAM_ALTIN', quantity: 2, price: 3500 }), // değer 8000, maliyet 7000
  ];
  const holdings = computeHoldings(txs, raw, {});
  assert.deepEqual(
    holdings.map((h) => h.key),
    ['us:AAPL', 'metal:GRAM_ALTIN', 'bist:THYAO'],
  );
  const aapl = holdings[0];
  assert.equal(aapl.currency, 'USD');
  assert.equal(aapl.name, 'Apple Inc.');
  close(aapl.valueTry!, 40000);
  close(aapl.dayChange!, 5 * (200 - 210));
  close(aapl.dayChangeTry!, -50 * 40);

  const s = computeSummary(holdings);
  close(s.valueTry, 3000 + 40000 + 8000);
  close(s.costTry, 2500 + 36000 + 7000);
  close(s.pnlTry, 5500);
  close(s.pnlPct, (5500 / 45500) * 100);
  assert.equal(s.incomplete, false);
  close(
    s.allocation.reduce((a, x) => a + x.pct, 0),
    100,
  );
  assert.equal(s.allocation[0].kind, 'us');
});

test('fiyat yoksa maliyet kullanılır; kur yoksa USD varlık toplama girmez', () => {
  const txs = [
    tx({ kind: 'bist', symbol: 'XYZ', quantity: 10, price: 5 }),
    tx({ kind: 'us', symbol: 'MSFT', quantity: 1, price: 400 }),
  ];
  const holdings = computeHoldings(txs, {}, {});
  const xyz = holdings.find((h) => h.symbol === 'XYZ')!;
  assert.equal(xyz.priceMissing, true);
  close(xyz.marketValue, 50);
  close(xyz.unrealizedPnl, 0);
  const s = computeSummary(holdings);
  assert.equal(s.incomplete, true);
  close(s.valueTry, 50);
});

test('tamamen satılan varlıklar listenin sonunda ve toplama dahil değil', () => {
  const txs = [
    tx({ kind: 'bist', symbol: 'THYAO', quantity: 10, price: 250 }),
    tx({ kind: 'bist', symbol: 'THYAO', side: 'sell', quantity: 10, price: 280, date: '2026-02-01' }),
    tx({ kind: 'us', symbol: 'AAPL', quantity: 1, price: 150 }),
  ];
  const holdings = computeHoldings(txs, raw, {});
  assert.equal(holdings[1].key, 'bist:THYAO');
  close(holdings[1].realizedPnl, 300);
  const s = computeSummary(holdings);
  close(s.valueTry, 200 * 40);
  assert.equal(heldQuantity(txs, 'bist', 'THYAO'), 0);
  assert.equal(heldQuantity(txs, 'us', 'AAPL'), 1);
});
