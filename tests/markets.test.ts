import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeSymbol, quoteSymbolFor } from '../src/lib/assets';
import { MARKETS, searchStocks, stockInfo } from '../src/lib/markets';
import { computeHoldings } from '../src/lib/portfolio';

const US = MARKETS.us.stocks;

test('ABD veri seti: tüm borsalar, tekrar yok, ETF/varant/imtiyazlı yok', () => {
  assert.ok(US.length > 5000, `${US.length} hisse`);
  const codes = US.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((c) => /^[A-Z]{1,5}(\.[A-Z])?$/.test(c)));
  assert.ok(
    US.every((s) => !/\b(warrant|preferred|ETF)\b|%/i.test(s.name)),
    'hisse olmayan kalmış',
  );
  const exchanges = new Set(US.map((s) => s.exchange));
  for (const ex of ['NASDAQ', 'NYSE', 'NYSE American']) assert.ok(exchanges.has(ex), ex);
  assert.ok(US.every((s) => !s.website || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s.website)));
});

test('bilinen ABD şirketleri ve web adresleri', () => {
  const cases: [string, string, string][] = [
    ['AAPL', 'Apple Inc.', 'apple.com'],
    ['MSFT', 'Microsoft Corporation', 'www.microsoft.com'],
    ['NVDA', 'NVIDIA Corporation', 'www.nvidia.com'],
    ['BRK.B', 'Berkshire Hathaway Inc. Class B', 'www.berkshirehathaway.com'],
    ['GOOGL', 'Alphabet Inc. Class A', 'abc.xyz'],
  ];
  for (const [code, name, site] of cases) {
    const s = stockInfo('us', code);
    assert.equal(s?.name, name, code);
    assert.equal(s?.website, site, code);
  }
  // Büyük şirketlerin hepsinin logosu için adres olmalı
  for (const code of ['AMZN', 'META', 'TSLA', 'JPM', 'V', 'KO', 'TSM', 'BABA', 'NFLX', 'AMD']) {
    assert.ok(stockInfo('us', code)?.website, `${code} web adresi`);
  }
});

test('Yahoo sembolü: hisse sınıfı noktası tireye döner', () => {
  assert.equal(MARKETS.us.quoteSymbol('BRK.B'), 'BRK-B');
  assert.equal(quoteSymbolFor('us', 'BRK.B'), 'BRK-B');
  assert.equal(quoteSymbolFor('us', 'AAPL'), 'AAPL');
  assert.equal(MARKETS.bist.quoteSymbol('THYAO'), 'THYAO.IS');
  assert.equal(normalizeSymbol('us', 'brk-b'), 'BRK.B');
  assert.equal(normalizeSymbol('us', ' aapl '), 'AAPL');
});

test('ABD aramasında ad ve kod', () => {
  assert.equal(searchStocks('aapl', US)[0].code, 'AAPL');
  assert.ok(searchStocks('apple', US).some((s) => s.code === 'AAPL'));
  assert.ok(searchStocks('nvidia', US).some((s) => s.code === 'NVDA'));
  assert.equal(searchStocks('brk.b', US)[0].code, 'BRK.B');
  // Tek harf "V" tam eşleşmesi Visa'yı başa getirir
  assert.equal(searchStocks('v', US)[0].code, 'V');
});

test('stockInfo yalnız Türk/ABD Market için', () => {
  assert.equal(stockInfo('bist', 'THYAO')?.name, 'Türk Hava Yolları');
  assert.equal(stockInfo('us', 'THYAO'), undefined);
  assert.equal(stockInfo('fx', 'USD'), undefined);
});

test('portföyde ABD hissesi listedeki adla görünür', () => {
  const [h] = computeHoldings(
    [{ id: '1', kind: 'us', symbol: 'BRK.B', side: 'buy', quantity: 1, price: 400, date: '2026-01-01', createdAt: 1 }],
    { 'BRK-B': { price: 500, fetchedAt: 1 }, 'USDTRY=X': { price: 50, fetchedAt: 1 } },
    {},
  );
  assert.equal(h.name, 'Berkshire Hathaway Inc. Class B');
  assert.equal(h.price, 500);
});
