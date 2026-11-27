import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMPARE_LINKS, OVERVIEW, OVERVIEW_KEYS, searchLinks, searchOverview } from '../src/lib/overview';

test('menüdeki Endeks ve Kurlar bölümleri', () => {
  assert.deepEqual(OVERVIEW_KEYS, ['index', 'rates']);
  assert.deepEqual(
    OVERVIEW.index.items.map((i) => [i.code, i.quoteKey]),
    [
      ['S&P 500', '^GSPC'],
      ['Nasdaq 100', '^NDX'],
      ['BIST 100', 'XU100.IS'],
    ],
  );
  assert.ok(
    OVERVIEW.index.items.every((i) => i.currency === null && !i.asset),
    'endeksler puan, eklenemez',
  );
  assert.deepEqual(
    OVERVIEW.rates.items.map((i) => [i.code, i.quoteKey, i.asset?.symbol]),
    [
      ['Dolar', 'USDTRY=X', 'USD'],
      ['Euro', 'EURTRY=X', 'EUR'],
    ],
  );
});

test('endeks ve kur araması', () => {
  const codes = (q: string, k: 'index' | 'rates') => searchOverview(q, OVERVIEW[k].items).map((i) => i.code);
  assert.deepEqual(codes('nasdaq', 'index'), ['Nasdaq 100']);
  assert.deepEqual(codes('BİST', 'index'), ['BIST 100']);
  assert.deepEqual(codes('s&p', 'index'), ['S&P 500']);
  assert.deepEqual(codes('dolar', 'rates'), ['Dolar']);
  assert.deepEqual(codes('usd', 'rates'), ['Dolar']);
  assert.deepEqual(codes('try', 'rates'), ['Dolar', 'Euro']);
  assert.equal(searchOverview('', OVERVIEW.rates.items).length, 2);
  assert.deepEqual(codes('altın', 'index'), []);
});

test('Karşılaştır bölümü: Grafik sitesi', () => {
  assert.equal(COMPARE_LINKS.title, 'Karşılaştır');
  const [grafik] = COMPARE_LINKS.items;
  assert.equal(grafik.code, 'Grafik');
  assert.equal(grafik.url, 'https://2n86njp68z-sketch.github.io/Grafik/');
  assert.match(grafik.logo, /^https:\/\/2n86njp68z-sketch\.github\.io\/Grafik\//);
  assert.deepEqual(
    searchLinks('grafik', COMPARE_LINKS.items).map((l) => l.code),
    ['Grafik'],
  );
  assert.deepEqual(
    searchLinks('temettü', COMPARE_LINKS.items).map((l) => l.code),
    ['Grafik'],
  );
  assert.deepEqual(searchLinks('bitcoin', COMPARE_LINKS.items), []);
});
