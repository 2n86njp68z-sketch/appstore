import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeSymbol, quoteSymbolFor, TROY_OUNCE_GRAMS } from '../src/lib/assets';
import {
  computeHoldings,
  computePosition,
  computeSummary,
  heldQuantity,
  rateOn,
  requiredQuoteSymbols,
  resolveAssetQuote,
} from '../src/lib/portfolio';
import type { FxHistory, FxSeries, RawQuote, Transaction } from '../src/lib/types';

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
  // Listedeki coinler CoinGecko kimliğiyle, listede olmayanlar Yahoo'dan
  assert.equal(quoteSymbolFor('crypto', 'BTC'), 'CG:bitcoin');
  assert.equal(quoteSymbolFor('crypto', 'YOKBOYLECOIN'), 'YOKBOYLECOIN-USD');
  assert.equal(quoteSymbolFor('fx', 'EUR'), 'EURTRY=X');
  assert.equal(quoteSymbolFor('metal', 'GRAM_ALTIN'), 'GC=F');
  assert.equal(quoteSymbolFor('other', 'AFT'), null);
});

test('gerekli semboller her zaman USD/TRY ve EUR/TRY içerir, manuel varlıkları içermez', () => {
  const syms = requiredQuoteSymbols([
    tx({ kind: 'bist', symbol: 'THYAO' }),
    tx({ kind: 'bist', symbol: 'THYAO' }),
    tx({ kind: 'metal', symbol: 'GRAM_ALTIN' }),
    tx({ kind: 'other', symbol: 'AFT' }),
  ]);
  assert.deepEqual(syms.sort(), ['EURTRY=X', 'GC=F', 'THYAO.IS', 'USDTRY=X']);
});

const NOW = 1_700_000_000_000;
const raw: Record<string, RawQuote> = {
  'USDTRY=X': { price: 40, previousClose: 39.5, fetchedAt: NOW },
  'EURTRY=X': { price: 50, previousClose: 49, fetchedAt: NOW },
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

test('portföy toplamları TL cinsinden hesaplanır (geçmiş kur yokken güncel kurla)', () => {
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
  // Dünkü değer: 1050$ × 39,5 = 41475₺ → bugün 40000₺
  close(aapl.views.TRY!.dayChange!, 40000 - 41475);
  close(aapl.views.USD!.dayChange!, -50);

  const s = computeSummary(holdings);
  const t = s.totals.TRY;
  close(t.value, 3000 + 40000 + 8000);
  close(t.cost, 2500 + 36000 + 7000);
  close(t.pnl, 5500);
  close(t.pnlPct, (5500 / 45500) * 100);
  assert.equal(t.incomplete, false);
  close(s.totals.USD.value, 51000 / 40);
  close(s.totals.EUR.value, 51000 / 50);
  close(
    s.allocation.reduce((a, x) => a + x.pct, 0),
    100,
  );
  assert.equal(s.allocation[0].kind, 'us');
  close(s.allocation[0].totals.TRY!.pnl, 4000);
  close(s.allocation[0].totals.USD!.pnl, 100);
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
  assert.equal(xyz.views.USD, undefined);
  const s = computeSummary(holdings);
  assert.equal(s.totals.TRY.incomplete, true);
  close(s.totals.TRY.value, 50);
  assert.equal(s.totals.USD.incomplete, true);
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
  close(holdings[1].views.TRY!.realized, 300);
  const s = computeSummary(holdings);
  close(s.totals.TRY.value, 200 * 40);
  assert.equal(heldQuantity(txs, 'bist', 'THYAO'), 0);
  assert.equal(heldQuantity(txs, 'us', 'AAPL'), 1);
});

// --- Döviz bazında kâr/zarar -------------------------------------------------

function series(points: [string, number][]): FxSeries {
  return { dates: points.map((p) => p[0]), rates: points.map((p) => p[1]), fetchedAt: NOW };
}

test('rateOn: tam gün, hafta sonu (önceki gün), seri öncesi ve sonrası', () => {
  const s = series([
    ['2025-01-02', 30],
    ['2025-01-03', 31],
    ['2025-01-06', 32],
  ]);
  assert.equal(rateOn(s, '2025-01-03'), 31);
  assert.equal(rateOn(s, '2025-01-05'), 31); // pazar → cuma
  assert.equal(rateOn(s, '2024-12-01'), 30); // seri öncesi → ilk kur
  assert.equal(rateOn(s, '2025-03-01'), 32);
  assert.equal(rateOn(undefined, '2025-01-03'), undefined);
});

const history: FxHistory = {
  USD: series([
    ['2025-01-02', 30],
    ['2025-06-02', 35],
  ]),
  EUR: series([
    ['2025-01-02', 32],
    ['2025-06-02', 38],
  ]),
};

test('TL kârda olan hisse dolar bazında zararda görünebilir', () => {
  // 100 adet × 300₺ = 30000₺, o gün dolar 30 → 1000$ maliyet.
  // Bugün 100 × 360₺ = 36000₺ (TL'de +%20), dolar 40 → 900$ (dolar bazında -%10).
  const txs = [tx({ kind: 'bist', symbol: 'THYAO', quantity: 100, price: 300, date: '2025-01-02' })];
  const h = computeHoldings(txs, { ...raw, 'THYAO.IS': { price: 360, fetchedAt: NOW } }, {}, history)[0];
  close(h.views.TRY!.pnlPct, 20);
  close(h.views.USD!.cost, 1000);
  close(h.views.USD!.value, 900);
  close(h.views.USD!.pnlPct, -10);
  close(h.views.EUR!.cost, 30000 / 32);
  close(h.views.EUR!.value, 36000 / 50);
});

test('ABD hissesinin TL maliyeti alış günündeki kurla', () => {
  // 5 × 180$ alış, o gün dolar 30 → 27000₺ maliyet; bugün 5 × 200$ × 40 = 40000₺.
  const txs = [tx({ kind: 'us', symbol: 'AAPL', quantity: 5, price: 180, date: '2025-01-02' })];
  const h = computeHoldings(txs, raw, {}, history)[0];
  close(h.views.USD!.cost, 900);
  close(h.views.USD!.pnl, 100);
  close(h.views.TRY!.cost, 27000);
  close(h.views.TRY!.pnl, 13000);
});

test('satışta her para biriminde ayrı gerçekleşen kâr', () => {
  const txs = [
    tx({ kind: 'bist', symbol: 'THYAO', quantity: 100, price: 300, date: '2025-01-02' }), // 1000$
    tx({ kind: 'bist', symbol: 'THYAO', side: 'sell', quantity: 50, price: 350, date: '2025-06-02' }), // 17500₺ = 500$
  ];
  const h = computeHoldings(txs, raw, {}, history)[0];
  close(h.views.TRY!.realized, 50 * 50); // 2500₺
  close(h.views.USD!.realized, 500 - 500); // 0$
  close(h.views.USD!.cost, 500);
  close(h.views.TRY!.cost, 15000);
});

test('geçmiş kurun son gününden yeni işlemler güncel kurla çevrilir', () => {
  const txs = [tx({ kind: 'bist', symbol: 'THYAO', quantity: 10, price: 300, date: '2026-01-01' })];
  const h = computeHoldings(txs, raw, {}, history)[0];
  close(h.views.USD!.cost, 3000 / 40);
});

test('Türk lirası nakit: fiyat 1 ₺, kaynaktan istenmez, değişim yok', async () => {
  const { computeHoldings: ch, requiredQuoteSymbols: rq, resolveAssetQuote: rs } = await import('../src/lib/portfolio');
  const { displaySymbol, quantityLabelFor, quoteSymbolFor } = await import('../src/lib/assets');
  const t = {
    id: 'try1',
    kind: 'fx' as const,
    symbol: 'TRY',
    side: 'buy' as const,
    quantity: 25000,
    price: 1,
    date: '2026-01-02',
    createdAt: 1,
  };
  assert.equal(quoteSymbolFor('fx', 'TRY'), null);
  assert.deepEqual(rq([t]).sort(), ['EURTRY=X', 'USDTRY=X']);
  assert.deepEqual(rs('fx', 'TRY', {}, {}), { price: 1, previousClose: 1 });
  assert.equal(displaySymbol('fx', 'TRY'), 'TL');
  assert.equal(quantityLabelFor('fx', 'TRY'), 'Tutar (₺)');
  const [h] = ch([t], { 'USDTRY=X': { price: 40, fetchedAt: 1 }, 'EURTRY=X': { price: 45, fetchedAt: 1 } }, {});
  assert.equal(h.name, 'Türk Lirası');
  assert.equal(h.views.TRY!.value, 25000);
  assert.equal(h.views.TRY!.pnl, 0);
  assert.equal(h.dayChange, 0);
  assert.equal(h.views.USD!.value, 25000 / 40);
});
