import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assetCurrency,
  COMMODITIES,
  isManualPriced,
  quantityLabelFor,
  quantityUnit,
  quoteSymbolFor,
  TROY_OUNCE_GRAMS,
} from '../src/lib/assets';
import { MARKETS, searchStocks, stockInfo } from '../src/lib/markets';
import { computeHoldings, requiredQuoteSymbols, resolveAssetQuote } from '../src/lib/portfolio';
import { fetchAnyQuotes, fetchCoinGecko, parseCoinGecko } from '../src/lib/prices';
import type { RawQuote, Transaction } from '../src/lib/types';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

const raw: Record<string, RawQuote> = {
  'USDTRY=X': { price: 50, previousClose: 49, fetchedAt: 1 },
  'GC=F': { price: 3000, previousClose: 2950, fetchedAt: 1 },
  'SI=F': { price: 40, fetchedAt: 1 },
  'PL=F': { price: 1500, fetchedAt: 1 },
  'PA=F': { price: 1200, fetchedAt: 1 },
  'BZ=F': { price: 80, previousClose: 78, fetchedAt: 1 },
};

test('emtia listesi: 5 emtia, her biri dolar ve TL bazında', () => {
  assert.equal(COMMODITIES.length, 10);
  for (const name of ['Altın', 'Gümüş', 'Platin', 'Paladyum']) {
    assert.ok(COMMODITIES.some((c) => c.name === `Ons ${name}` && c.currency === 'USD' && c.unit === 'ons'));
    assert.ok(COMMODITIES.some((c) => c.name === `Gram ${name}` && c.currency === 'TRY' && c.unit === 'gram'));
  }
  assert.ok(COMMODITIES.some((c) => c.symbol === 'BRENT' && c.currency === 'USD' && c.unit === 'varil'));
  assert.ok(COMMODITIES.some((c) => c.symbol === 'BRENT_TL' && c.currency === 'TRY' && c.unit === 'varil'));
});

test('emtia fiyatları: ons dolar, gram TL, Brent dolar ve TL', () => {
  const q = (s: string) => resolveAssetQuote('metal', s, raw, {})!;
  close(q('ONS_ALTIN').price, 3000);
  close(q('ONS_ALTIN').previousClose!, 2950);
  close(q('GRAM_ALTIN').price, (3000 * 50) / TROY_OUNCE_GRAMS);
  close(q('GRAM_ALTIN').previousClose!, (2950 * 49) / TROY_OUNCE_GRAMS);
  close(q('ONS_GUMUS').price, 40);
  close(q('GRAM_PLATIN').price, (1500 * 50) / TROY_OUNCE_GRAMS);
  close(q('ONS_PALADYUM').price, 1200);
  close(q('BRENT').price, 80);
  close(q('BRENT_TL').price, 80 * 50);
  close(q('BRENT_TL').previousClose!, 78 * 49);
  assert.equal(resolveAssetQuote('metal', 'GRAM_ALTIN', { 'GC=F': raw['GC=F'] }, {}), undefined, 'kur yoksa TL yok');
});

test('emtia para birimi, birimi ve fiyat anahtarları', () => {
  assert.equal(assetCurrency('metal', 'ONS_ALTIN'), 'USD');
  assert.equal(assetCurrency('metal', 'GRAM_ALTIN'), 'TRY');
  assert.equal(quantityUnit('metal', 'BRENT'), 'varil');
  assert.equal(quantityLabelFor('metal', 'ONS_PLATIN'), 'Ons');
  assert.equal(quoteSymbolFor('metal', 'GRAM_PALADYUM'), 'PA=F');
  assert.deepEqual(MARKETS.metal.quoteKeys('GRAM_ALTIN'), ['GC=F', 'USDTRY=X']);
  assert.deepEqual(MARKETS.metal.quoteKeys('ONS_ALTIN'), ['GC=F']);
});

test('portföyde ons altın dolar bazında, TL karşılığı kurla', () => {
  const tx: Transaction = {
    id: '1',
    kind: 'metal',
    symbol: 'ONS_ALTIN',
    side: 'buy',
    quantity: 2,
    price: 2800,
    date: '2026-01-01',
    createdAt: 1,
  };
  const [h] = computeHoldings([tx], raw, {});
  assert.equal(h.currency, 'USD');
  assert.equal(h.name, 'Ons Altın');
  close(h.marketValue, 6000);
  close(h.views.TRY!.value, 6000 * 50);
  close(h.views.USD!.pnl, 400);
});

test('TEFAS ve BES fonları: listeler, elle fiyat, şirket adıyla arama', () => {
  assert.ok(MARKETS.fund.stocks.length > 1500, `${MARKETS.fund.stocks.length} TEFAS fonu`);
  assert.ok(MARKETS.bes.stocks.length > 200, `${MARKETS.bes.stocks.length} BES fonu`);
  assert.ok(MARKETS.fund.stocks.every((f) => /^[A-Z0-9]{3}$/.test(f.code)));
  assert.equal(stockInfo('fund', 'AFT')?.website, 'www.akportfoy.com.tr');
  assert.match(stockInfo('fund', 'AFT')!.name, /^Ak Portföy Yeni Teknolojiler/);
  assert.equal(stockInfo('bes', 'AE1')?.name, 'Birinci Para Piyasası Emeklilik Yatırım Fonu');
  assert.ok(
    searchStocks('agesa', MARKETS.bes.stocks).some((f) => f.code === 'AE1'),
    'şirket adıyla bulunur',
  );
  assert.equal(searchStocks('aft', MARKETS.fund.stocks)[0].code, 'AFT');

  assert.ok(isManualPriced('fund') && isManualPriced('bes'));
  assert.equal(quoteSymbolFor('fund', 'AFT'), null);
  assert.deepEqual(MARKETS.fund.quoteKeys('AFT'), []);
  assert.equal(resolveAssetQuote('fund', 'AFT', {}, {}), undefined);
  assert.equal(resolveAssetQuote('fund', 'AFT', {}, { 'fund:AFT': 1.25 })?.price, 1.25);
  const txs: Transaction[] = [
    { id: '1', kind: 'fund', symbol: 'AFT', side: 'buy', quantity: 1000, price: 1, date: '2026-01-01', createdAt: 1 },
  ];
  assert.deepEqual(requiredQuoteSymbols(txs).sort(), ['EURTRY=X', 'USDTRY=X']);
  const [h] = computeHoldings(txs, raw, { 'fund:AFT': 1.2 });
  close(h.marketValue, 1200);
  assert.match(h.name, /^Ak Portföy/);
});

test('kripto: liste CoinGecko kimliğiyle, logolu', () => {
  assert.ok(MARKETS.crypto.stocks.length > 300);
  assert.equal(MARKETS.crypto.stocks[0].code, 'BTC');
  assert.match(stockInfo('crypto', 'ETH')!.logo!, /^https:\/\/coin-images\.coingecko\.com\//);
  assert.deepEqual(MARKETS.crypto.quoteKeys('BTC'), ['CG:bitcoin']);
  // Aynı kısaltmalı coinlerde piyasa değeri büyük olan
  assert.equal(searchStocks('uni', MARKETS.crypto.stocks)[0].code, 'UNI');
});

test('CoinGecko yanıtı: fiyat ve 24 saatlik değişimden önceki fiyat', () => {
  const q = parseCoinGecko({ bitcoin: { usd: 60000, usd_24h_change: 20 }, bozuk: { usd: 0 } }, 9);
  assert.deepEqual(Object.keys(q), ['CG:bitcoin']);
  close(q['CG:bitcoin'].price, 60000);
  close(q['CG:bitcoin'].previousClose!, 50000);
  assert.equal(q['CG:bitcoin'].fetchedAt, 9);
});

test('fetchAnyQuotes: CG anahtarları CoinGecko, diğerleri Yahoo', async () => {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    if (url.includes('coingecko')) {
      return { ok: true, status: 200, json: async () => ({ bitcoin: { usd: 1, usd_24h_change: 0 } }) };
    }
    const syms = decodeURIComponent(url.match(/symbols=([^&]+)/)![1]).split(',');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        spark: { result: syms.map((s) => ({ symbol: s, response: [{ meta: { regularMarketPrice: 2 } }] })) },
      }),
    };
  };
  const q = await fetchAnyQuotes(['CG:bitcoin', 'GC=F', 'USDTRY=X'], fn);
  assert.deepEqual(Object.keys(q).sort(), ['CG:bitcoin', 'GC=F', 'USDTRY=X']);
  assert.ok(calls.some((u) => u.includes('ids=bitcoin') && u.includes('include_24hr_change=true')));
  assert.equal(calls.filter((u) => u.includes('/spark?')).length, 1);
  // 100'den fazla coin gruplara bölünür
  const many = Array.from({ length: 150 }, (_, i) => `c${i}`);
  calls.length = 0;
  await fetchCoinGecko(many, fn);
  assert.equal(calls.length, 2);
});
