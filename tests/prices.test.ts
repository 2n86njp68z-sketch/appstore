import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchQuote, fetchQuotes, parseYahooChart } from '../src/lib/prices';

function chart(meta: Record<string, unknown>) {
  return { chart: { result: [{ meta, timestamp: [], indicators: {} }], error: null } };
}

test('Yahoo chart yanıtı çözülür', () => {
  const q = parseYahooChart(
    chart({
      currency: 'TRY',
      symbol: 'THYAO.IS',
      regularMarketPrice: 312.5,
      chartPreviousClose: 305,
      longName: 'Türk Hava Yolları A.O.',
    }),
    123,
  );
  assert.deepEqual(q, { price: 312.5, previousClose: 305, name: 'Türk Hava Yolları A.O.', fetchedAt: 123 });
});

test('previousClose yedeği ve shortName', () => {
  const q = parseYahooChart(chart({ regularMarketPrice: 10, previousClose: 9, shortName: 'X ' }), 1);
  assert.equal(q?.previousClose, 9);
  assert.equal(q?.name, 'X');
});

test('geçersiz yanıtlar null döner', () => {
  assert.equal(parseYahooChart(null), null);
  assert.equal(parseYahooChart({ chart: { result: null, error: { code: 'Not Found' } } }), null);
  assert.equal(parseYahooChart(chart({ regularMarketPrice: 0 })), null);
  assert.equal(parseYahooChart(chart({ regularMarketPrice: 'x' })), null);
});

function fakeFetch(handler: (url: string) => { status: number; body?: unknown }) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const r = handler(url);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fn, calls };
}

test('ilk sunucu hata verirse ikinciye geçer', async () => {
  const { fn, calls } = fakeFetch((url) =>
    url.startsWith('https://query1') ? { status: 429 } : { status: 200, body: chart({ regularMarketPrice: 42 }) },
  );
  const q = await fetchQuote('AAPL', fn);
  assert.equal(q.price, 42);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/v8\/finance\/chart\/AAPL\?range=1d&interval=1d$/);
});

test('sembol URL için kodlanır', async () => {
  const { fn, calls } = fakeFetch(() => ({ status: 200, body: chart({ regularMarketPrice: 1 }) }));
  await fetchQuote('USDTRY=X', fn);
  assert.match(calls[0], /chart\/USDTRY%3DX\?/);
});

test('404 ise ikinci sunucu denenmez', async () => {
  const { fn, calls } = fakeFetch(() => ({ status: 404 }));
  await assert.rejects(fetchQuote('NOPE', fn), /Sembol bulunamadı/);
  assert.equal(calls.length, 1);
});

test('fetchQuotes başarısızları ayrı listeler', async () => {
  const { fn } = fakeFetch((url) =>
    url.includes('BAD') ? { status: 404 } : { status: 200, body: chart({ regularMarketPrice: 5 }) },
  );
  const r = await fetchQuotes(['GOOD', 'BAD'], fn);
  assert.deepEqual(Object.keys(r.quotes), ['GOOD']);
  assert.deepEqual(r.failed, ['BAD']);
});
