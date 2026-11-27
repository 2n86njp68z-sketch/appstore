import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMPARE_LINKS, OVERVIEW, OVERVIEW_KEYS, searchLinks, searchOverview } from '../src/lib/overview';

test('menüdeki Nakit bölümü: Türk lirası, dolar, euro (Endeks bölümü yok)', () => {
  assert.deepEqual(OVERVIEW_KEYS, ['cash']);
  assert.equal(OVERVIEW.cash.title, 'Nakit');
  assert.deepEqual(
    OVERVIEW.cash.items.map((i) => [i.code, i.quoteKey, i.asset?.kind, i.asset?.symbol, i.fixedPrice]),
    [
      ['Türk Lirası', 'TRY', 'fx', 'TRY', 1],
      ['Dolar', 'USDTRY=X', 'fx', 'USD', undefined],
      ['Euro', 'EURTRY=X', 'fx', 'EUR', undefined],
    ],
  );
});

test('nakit araması', () => {
  const codes = (q: string) => searchOverview(q, OVERVIEW.cash.items).map((i) => i.code);
  assert.deepEqual(codes('lira'), ['Türk Lirası']);
  assert.deepEqual(codes('tl'), ['Türk Lirası']);
  assert.deepEqual(codes('dolar'), ['Dolar']);
  assert.deepEqual(codes('usd'), ['Dolar']);
  assert.deepEqual(codes('try'), ['Dolar', 'Euro']);
  assert.equal(searchOverview('', OVERVIEW.cash.items).length, 3);
  assert.deepEqual(codes('nasdaq'), []);
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
