import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assetCurrency,
  displaySymbol,
  eurobondInfo,
  priceFactor,
  quantityLabelFor,
  quoteSymbolFor,
} from '../src/lib/assets';
import { txAmountTry } from '../src/lib/benchmarks';
import { formatAssetPrice } from '../src/lib/format';
import { MARKETS, searchStocks, stockInfo } from '../src/lib/markets';
import { computeHoldings, computePosition, FxRates, heldQuantity } from '../src/lib/portfolio';
import { fetchAnyQuotes, parseZiraatEurobonds } from '../src/lib/prices';
import type { RawQuote, Transaction } from '../src/lib/types';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('Hazine eurobond listesi: ISIN, vade, dolar ve euro cinsi', () => {
  const list = MARKETS.eurobond.stocks;
  assert.ok(list.length >= 30, `${list.length} eurobond`);
  assert.ok(list.every((s) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s.code)));
  const usd = eurobondInfo('US900123DF45')!;
  assert.equal(usd.currency, 'USD');
  assert.equal(usd.maturity, '2028-01-15');
  assert.ok(
    list.some((s) => eurobondInfo(s.code)?.currency === 'EUR'),
    'euro cinsi de var',
  );
  assert.equal(stockInfo('eurobond', 'US900123DF45')?.name, 'Vade 15.01.2028 · USD');
  assert.equal(displaySymbol('eurobond', 'US900123DF45'), 'Oca 2028 USD');
  assert.ok(searchStocks('2028', list).some((s) => s.code === 'US900123DF45'));
  assert.ok(searchStocks('hazine', list).length === list.length);
});

test('eurobond: para birimi, fiyat anahtarı, nominal ve 100 nominal fiyatı', () => {
  assert.equal(assetCurrency('eurobond', 'US900123DF45'), 'USD');
  const eur = MARKETS.eurobond.stocks.find((s) => eurobondInfo(s.code)?.currency === 'EUR')!;
  assert.equal(assetCurrency('eurobond', eur.code), 'EUR');
  assert.equal(quoteSymbolFor('eurobond', 'US900123DF45'), 'EB:US900123DF45');
  assert.equal(quantityLabelFor('eurobond', 'US900123DF45'), 'Nominal');
  assert.equal(priceFactor('eurobond'), 0.01);
  assert.equal(priceFactor('bist'), 1);
  assert.equal(formatAssetPrice('eurobond', 98.5, 'USD'), '98,50');
});

const ZIRAAT = `<table><tr><th>Kıymet Adı</th><th>Vade</th><th>Vadeye Kalan Gün</th><th>Döviz</th><th>Alış Fiyatı</th><th>Alış Oranı</th><th>Satış Fiyatı</th><th>Satış Oranı</th></tr>
<tr><td>US900123DF45</td><td>15.01.2028</td><td>414</td><td>USD</td><td>106,411833</td><td>7,25</td><td>108,112125</td><td>5,76</td></tr>
<tr><td>XS3293834662</td><td>10.03.2034</td><td>2660</td><td>EUR</td><td>95,109781</td><td>6,74</td><td>98,428219</td><td>6,14</td></tr>
<tr><td>{%= x %}</td><td></td><td></td><td></td><td></td><td></td></tr></table>`;

test('Ziraat eurobond tablosu: alış fiyatı ve getirisi', () => {
  const q = parseZiraatEurobonds(ZIRAAT, 5);
  assert.deepEqual(Object.keys(q), ['EB:US900123DF45', 'EB:XS3293834662']);
  close(q['EB:US900123DF45'].price, 106.411833);
  close(q['EB:US900123DF45'].yieldPct!, 7.25);
  assert.equal(q['EB:XS3293834662'].fetchedAt, 5);
});

test('fetchAnyQuotes: EB anahtarları eurobond sayfasından, diğerleri Yahoo', async () => {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    if (url.includes('ziraatbank')) {
      return { ok: true, status: 200, json: async () => ({}), text: async () => ZIRAAT };
    }
    const syms = decodeURIComponent(url.match(/symbols=([^&]+)/)![1]).split(',');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        spark: { result: syms.map((s) => ({ symbol: s, response: [{ meta: { regularMarketPrice: 40 } }] })) },
      }),
    };
  };
  const q = await fetchAnyQuotes(['EB:US900123DF45', 'USDTRY=X'], fn);
  assert.deepEqual(Object.keys(q).sort(), ['EB:US900123DF45', 'USDTRY=X']);
  assert.ok(calls.some((u) => u.includes('ziraatbank')));
  assert.ok(
    calls.every((u) => !u.includes('EB%3A') && !u.includes('EB:')),
    'EB anahtarı Yahoo’ya gitmez',
  );
});

const raw: Record<string, RawQuote> = {
  'USDTRY=X': { price: 40, fetchedAt: 1 },
  'EURTRY=X': { price: 45, fetchedAt: 1 },
  'EB:US900123DF45': { price: 106, fetchedAt: 1, yieldPct: 7.25 },
};
const tx = (t: Partial<Transaction>): Transaction => ({
  id: String(Math.random()),
  kind: 'eurobond',
  symbol: 'US900123DF45',
  side: 'buy',
  quantity: 10000,
  price: 100,
  date: '2026-01-05',
  createdAt: 1,
  ...t,
});

test('eurobond portföyde: değer nominal × fiyat / 100, ortalama maliyet fiyat biriminde', () => {
  const txs = [
    tx({}),
    tx({ quantity: 10000, price: 102, date: '2026-02-05' }),
    tx({ side: 'sell', quantity: 5000, price: 105, date: '2026-03-05' }),
  ];
  const pos = computePosition(txs);
  close(pos.quantity, 15000, 1e-9);
  close(pos.avgCost, 101);
  close(pos.costBasis, 15000 * 1.01);
  close(pos.realizedPnl, 5000 * (1.05 - 1.01));
  assert.equal(heldQuantity(txs, 'eurobond', 'US900123DF45'), 15000);

  const [h] = computeHoldings(txs, raw, {});
  assert.equal(h.currency, 'USD');
  close(h.quantity, 15000, 1e-9);
  close(h.price, 106);
  close(h.marketValue, 15000 * 1.06);
  close(h.views.TRY!.value, 15000 * 1.06 * 40);
});

test('eurobond karşılaştırmada işlem tutarı da 100 nominal fiyatıyla', () => {
  const fx = new FxRates(raw, {});
  close(txAmountTry(tx({}), fx)!, 10000 * 1 * 40);
});
