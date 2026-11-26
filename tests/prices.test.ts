import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fetchHistory,
  fetchQuote,
  fetchQuotes,
  historyRange,
  parseYahooChart,
  parseYahooHistory,
} from '../src/lib/prices';

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

test('kur geçmişi: yerel saate göre tarih, boş günler atlanır', () => {
  // gmtoffset +3600: 23:00 UTC zaman damgası ertesi güne düşer.
  const json = {
    chart: {
      result: [
        {
          meta: { gmtoffset: 3600 },
          timestamp: [1735772400, 1735858800, 1735945200],
          indicators: { quote: [{ close: [35.4, null, 35.6] }] },
        },
      ],
    },
  };
  const s = parseYahooHistory(json, 7);
  assert.deepEqual(s, { dates: ['2025-01-02', '2025-01-04'], rates: [35.4, 35.6], fetchedAt: 7 });
  assert.equal(parseYahooHistory({ chart: { result: [{}] } }), null);
});

test('geçmiş aralığı en eski işlemi kapsar', () => {
  const now = new Date('2026-11-26');
  assert.equal(historyRange('2026-06-01', now), '1y');
  assert.equal(historyRange('2025-03-01', now), '2y');
  assert.equal(historyRange('2023-01-01', now), '5y');
  assert.equal(historyRange('2018-01-01', now), '10y');
  assert.equal(historyRange('2010-01-01', now), 'max');
});

test('fetchHistory doğru adresi çağırır', async () => {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        chart: { result: [{ timestamp: [1735776000], indicators: { quote: [{ close: [35] }] } }] },
      }),
    };
  };
  const s = await fetchHistory('USDTRY=X', '5y', fn);
  assert.deepEqual(s.rates, [35]);
  assert.match(calls[0], /chart\/USDTRY%3DX\?range=5y&interval=1d$/);
});
