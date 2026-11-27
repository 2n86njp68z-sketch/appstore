import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fetchGrafikCatalog,
  grafikRange,
  grafikSymbol,
  parseGrafikCatalog,
  portfolioCompareLink,
} from '../src/lib/grafik';
import { computeHoldings } from '../src/lib/portfolio';
import type { RawQuote, Transaction } from '../src/lib/types';

test('Grafik sembolleri', () => {
  assert.equal(grafikSymbol('bist', 'THYAO'), 'THYAO.IS');
  assert.equal(grafikSymbol('us', 'BRK.B'), 'BRK-B');
  assert.equal(grafikSymbol('etf', 'SPY'), 'SPY');
  assert.equal(grafikSymbol('crypto', 'BTC'), 'BTC-USD');
  assert.equal(grafikSymbol('fx', 'USD'), 'TRY=X');
  assert.equal(grafikSymbol('fx', 'EUR'), 'EURTRY=X');
  assert.equal(grafikSymbol('fx', 'CHF'), null);
  assert.equal(grafikSymbol('metal', 'GRAM_ALTIN'), 'GRAMALTIN');
  assert.equal(grafikSymbol('metal', 'ONS_ALTIN'), 'GC=F');
  assert.equal(grafikSymbol('metal', 'GRAM_GUMUS'), 'GRAMGUMUS');
  assert.equal(grafikSymbol('metal', 'GRAM_PLATIN'), 'PL=F');
  assert.equal(grafikSymbol('metal', 'ONS_PALADYUM'), 'PA=F');
  assert.equal(grafikSymbol('metal', 'BRENT_TL'), 'BZ=F');
  assert.equal(grafikSymbol('fund', 'AFT'), null);
  assert.equal(grafikSymbol('bes', 'AE1'), null);
  assert.equal(grafikSymbol('other', 'MEVDUAT'), null);
});

test('Grafik dönemi en eski alışı kapsar', () => {
  assert.equal(grafikRange('2026-11-01', '2026-11-27'), '1M');
  assert.equal(grafikRange('2026-06-01', '2026-11-27'), '6M');
  assert.equal(grafikRange('2026-01-05', '2026-11-27'), '1Y');
  assert.equal(grafikRange('2023-01-05', '2026-11-27'), '5Y');
  assert.equal(grafikRange('2010-01-05', '2026-11-27'), 'MAX');
});

test('Grafik kataloğu', () => {
  const set = parseGrafikCatalog({ items: [{ s: 'GC=F' }, { s: 'THYAO.IS' }, { n: 'adsız' }, { s: '' }] });
  assert.deepEqual([...set].sort(), ['GC=F', 'THYAO.IS']);
  assert.equal(parseGrafikCatalog({}).size, 0);
});

const raw: Record<string, RawQuote> = {
  'USDTRY=X': { price: 40, fetchedAt: 1 },
  'EURTRY=X': { price: 45, fetchedAt: 1 },
  'THYAO.IS': { price: 300, fetchedAt: 1 },
  'ASELS.IS': { price: 150, fetchedAt: 1 },
  AAPL: { price: 200, fetchedAt: 1 },
  'CG:bitcoin': { price: 60000, fetchedAt: 1 },
  'GC=F': { price: 3000, fetchedAt: 1 },
  'PL=F': { price: 1000, fetchedAt: 1 },
  TINY: { price: 1, fetchedAt: 1 },
};
let id = 0;
const tx = (kind: Transaction['kind'], symbol: string, quantity: number, date = '2026-03-02'): Transaction => ({
  id: String(++id),
  kind,
  symbol,
  side: 'buy',
  quantity,
  price: 1,
  date,
  createdAt: id,
});

test('portföy karşılaştırma linki: en büyük 4 varlık, katalogda olanlar, dönem en eski alışa göre', () => {
  const holdings = computeHoldings(
    [
      tx('bist', 'THYAO', 100), // 30.000 TL
      tx('bist', 'ASELS', 100, '2025-12-01'), // 15.000 TL
      tx('us', 'AAPL', 10), // 2.000 $ = 80.000 TL
      tx('crypto', 'BTC', 0.01), // 600 $ = 24.000 TL
      tx('metal', 'GRAM_ALTIN', 1), // ~3.858 TL
      tx('fund', 'AFT', 100000), // 100.000 TL (elle fiyat) → Grafik'te yok
      tx('us', 'TINY', 20000), // 800.000 TL ama katalogda yok
    ],
    raw,
    { 'fund:AFT': 1 },
  );
  const catalog = new Set(['THYAO.IS', 'ASELS.IS', 'AAPL', 'BTC-USD', 'GRAMALTIN']);
  const link = portfolioCompareLink(holdings, catalog, '2026-11-27')!;
  assert.equal(link.url, 'https://2n86njp68z-sketch.github.io/Grafik/#s=AAPL&c=THYAO.IS,BTC-USD,ASELS.IS&r=1Y');
  assert.deepEqual(
    link.holdings.map((h) => h.symbol),
    ['AAPL', 'THYAO', 'BTC', 'ASELS'],
  );

  // Katalog bilinmiyorsa eşleşen her sembol alınır
  const noCatalog = portfolioCompareLink(holdings, null, '2026-11-27')!;
  assert.match(noCatalog.url, /#s=TINY&c=AAPL,THYAO\.IS,BTC-USD&r=1Y$/);

  // Aynı sembole düşen iki varlık bir kez yazılır; tek varlıkta c yok
  const plat = computeHoldings([tx('metal', 'GRAM_PLATIN', 10), tx('metal', 'ONS_PLATIN', 1)], raw, {});
  assert.equal(portfolioCompareLink(plat, null, '2026-11-27')!.url.split('#')[1], 's=PL%3DF&r=1Y');

  // Uygun varlık yoksa null
  const funds = computeHoldings([tx('fund', 'AFT', 10)], raw, { 'fund:AFT': 1 });
  assert.equal(portfolioCompareLink(funds, catalog), null);
  assert.equal(portfolioCompareLink([], catalog), null);
});

test('Grafik kataloğu bir kez indirilir, hata olursa yeniden denenir', async () => {
  let calls = 0;
  let fail = true;
  const fn = (async () => {
    calls++;
    if (fail) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ items: [{ s: 'AAPL' }] }) };
  }) as unknown as typeof fetch;
  await assert.rejects(fetchGrafikCatalog(fn));
  fail = false;
  const set = await fetchGrafikCatalog(fn);
  assert.ok(set.has('AAPL'));
  await fetchGrafikCatalog(fn);
  assert.equal(calls, 2, 'başarılı indirmeden sonra önbellekten');
});
