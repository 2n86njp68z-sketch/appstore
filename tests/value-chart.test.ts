import assert from 'node:assert/strict';
import { test } from 'node:test';

import { historyNeeds, historySymbolFor, parseCoinGeckoChart, refreshPriceHistory } from '../src/lib/history';
import type { FxSeries, RawQuote, Transaction } from '../src/lib/types';
import { buildValueChart, chartDates, sliceFrom } from '../src/lib/value-chart';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

let id = 0;
const tx = (t: Partial<Transaction>): Transaction => ({
  id: String(++id),
  kind: 'bist',
  symbol: 'THYAO',
  side: 'buy',
  quantity: 10,
  price: 100,
  date: '2026-01-05',
  createdAt: id,
  ...t,
});
const series = (pairs: [string, number][]): FxSeries => ({
  dates: pairs.map((p) => p[0]),
  rates: pairs.map((p) => p[1]),
  fetchedAt: 1,
});
const raw: Record<string, RawQuote> = {
  'THYAO.IS': { price: 150, fetchedAt: 1 },
  'USDTRY=X': { price: 40, fetchedAt: 1 },
  'EURTRY=X': { price: 45, fetchedAt: 1 },
  'GC=F': { price: 4000, fetchedAt: 1 },
};
const base = {
  raw,
  manualPrices: {},
  fxHistory: {},
  actionsByKey: {},
  bench: {},
  currency: 'TRY' as const,
  today: '2026-01-15',
};

test('chartDates: işlem günleri ve bugün hep var, uzun dönem seyreltilir', () => {
  const d = chartDates([tx({ date: '2026-01-05' }), tx({ date: '2026-01-08' })], '2026-01-10');
  assert.deepEqual(d, ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10']);
  const long = chartDates([tx({ date: '2020-01-01' }), tx({ date: '2023-06-17' })], '2026-01-10', 100);
  assert.ok(long.length <= 104 && long.length > 90);
  assert.ok(long.includes('2023-06-17') && long[long.length - 1] === '2026-01-10');
});

test('değer: günlük kapanış × eldeki adet; son nokta güncel fiyat; yatırılan para', () => {
  const txs = [
    tx({}),
    tx({ date: '2026-01-08', quantity: 5, price: 120 }),
    tx({ date: '2026-01-12', side: 'sell', quantity: 5, price: 130 }),
  ];
  const hist = series([
    ['2026-01-05', 100],
    ['2026-01-06', 110],
    ['2026-01-07', 105],
    ['2026-01-08', 120],
    ['2026-01-09', 125],
    ['2026-01-12', 130],
    ['2026-01-13', 140],
  ]);
  const c = buildValueChart({ ...base, transactions: txs, priceHistory: { 'THYAO.IS': hist } })!;
  const at = (d: string) => c.value[c.dates.indexOf(d)];
  const inv = (d: string) => c.invested[c.dates.indexOf(d)];
  assert.equal(at('2026-01-05'), 1000);
  assert.equal(at('2026-01-06'), 1100);
  assert.equal(at('2026-01-09'), 15 * 125);
  // Hafta sonu: son kapanış
  assert.equal(at('2026-01-10'), 15 * 125);
  assert.equal(at('2026-01-12'), 10 * 130);
  assert.equal(at('2026-01-14'), 10 * 140);
  // Bugün: güncel fiyat (ana sayfadaki toplamla aynı)
  assert.equal(at('2026-01-15'), 10 * 150);
  assert.equal(inv('2026-01-07'), 1000);
  assert.equal(inv('2026-01-08'), 1600);
  assert.equal(inv('2026-01-15'), 1600 - 650);
  assert.deepEqual(c.approximated, []);
});

test('geçmişi olmayan varlık işlem fiyatlarıyla çizilir ve not düşülür', () => {
  const c = buildValueChart({
    ...base,
    transactions: [tx({ kind: 'eurobond', symbol: 'US900123DG28', quantity: 10000, price: 98 })],
    raw: { ...raw, 'EB:US900123DG28': { price: 99, fetchedAt: 1 } },
    priceHistory: {},
  })!;
  // 10.000 nominal × 98 / 100 × 40 TL
  close(c.value[0], 10000 * 0.98 * 40);
  close(c.value[c.value.length - 1], 10000 * 0.99 * 40);
  assert.deepEqual(c.approximated, ['US900123DG28']);
});

test('dolar bazında: her gün kendi kuruyla; gram altın kontrat × kur / 31,1', () => {
  const fxHistory = {
    USD: series([
      ['2026-01-05', 36],
      ['2026-01-10', 38],
    ]),
  };
  const c = buildValueChart({
    ...base,
    currency: 'USD',
    fxHistory,
    transactions: [tx({ kind: 'metal', symbol: 'GRAM_ALTIN', quantity: 31.1034768, price: (3000 * 36) / 31.1034768 })],
    priceHistory: {
      'GC=F': series([
        ['2026-01-05', 3000],
        ['2026-01-10', 3500],
      ]),
    },
  })!;
  // 1 ons altın: gün sonu kontrat fiyatı dolar
  close(c.value[0], 3000, 1e-6);
  close(c.value[c.dates.indexOf('2026-01-12')], 3500, 1e-6);
  close(c.value[c.value.length - 1], 4000, 1e-6);
  close(c.invested[0], 3000, 1e-6);
});

test('ölçütler: aynı paralar aynı gün endekse; enflasyon aylık', () => {
  const bench = {
    'XU100.IS': series([
      ['2026-01-05', 10000],
      ['2026-01-08', 11000],
      ['2026-01-14', 12000],
    ]),
    CPI: series([
      ['2025-12-01', 100],
      ['2026-01-01', 103],
    ]),
  };
  const c = buildValueChart({
    ...base,
    raw: { ...raw, 'XU100.IS': { price: 12500, fetchedAt: 1 } },
    bench,
    transactions: [tx({})],
    priceHistory: {},
  })!;
  const b = c.bench.bist100!;
  assert.equal(b[0], 1000);
  assert.equal(b[c.dates.indexOf('2026-01-09')], 1100);
  assert.equal(b[b.length - 1], 1250);
  // Ocak alışı, son açıklanan ay Ocak: değişmez
  assert.ok(c.bench.cpi!.every((v) => Math.abs(v - 1000) < 1e-9));
  assert.equal(c.bench.sp500tr, undefined);
});

test('sliceFrom: son N günün ilk noktası', () => {
  const c = buildValueChart({ ...base, transactions: [tx({ date: '2025-01-01' })], priceHistory: {} })!;
  const i = sliceFrom(c, 30);
  assert.ok(c.dates[i] >= '2025-12-16');
  assert.equal(sliceFrom(c, null), 0);
});

test('geçmiş sembolleri ve CoinGecko ayrıştırma', () => {
  assert.equal(historySymbolFor('bist', 'THYAO'), 'THYAO.IS');
  assert.equal(historySymbolFor('metal', 'GRAM_ALTIN'), 'GC=F');
  assert.equal(historySymbolFor('bes', 'ABE'), 'TEFAS:EMK:ABE');
  assert.equal(historySymbolFor('crypto', 'BTC'), 'CG:bitcoin');
  assert.equal(historySymbolFor('eurobond', 'US900123DG28'), undefined);
  const needs = historyNeeds([
    tx({ date: '2026-02-01' }),
    tx({ date: '2025-03-01' }),
    tx({ kind: 'other', symbol: 'MEVDUAT' }),
  ]);
  assert.deepEqual([...needs], [['THYAO.IS', '2025-03-01']]);
  const s = parseCoinGeckoChart({
    prices: [
      [Date.parse('2026-01-01T00:00:00Z'), 90000],
      [Date.parse('2026-01-01T12:00:00Z'), 91000],
      [Date.parse('2026-01-02T00:00:00Z'), 92000],
    ],
  })!;
  assert.deepEqual(s.dates, ['2026-01-01', '2026-01-02']);
  assert.deepEqual(s.rates, [91000, 92000]);
});

test('TEFAS geçmişi 1 aylık parçalarla istenir ve sonra yalnız yeni günler eklenir', async () => {
  const calls: { bas: string; bit: string }[] = [];
  const fetchFn = async (_url: string, init?: { body?: string }) => {
    const b = JSON.parse(init!.body!);
    calls.push({ bas: b.basTarih, bit: b.bitTarih });
    const day = `${b.bitTarih.slice(0, 4)}-${b.bitTarih.slice(4, 6)}-${b.bitTarih.slice(6, 8)}`;
    return {
      ok: true,
      status: 200,
      json: async () => ({ resultList: [{ fonKodu: 'ABE', tarih: `${day}T00:00:00`, fiyat: calls.length }] }),
      text: async () => '',
    };
  };
  const now = new Date('2026-04-15T12:00:00Z');
  const first = await refreshPriceHistory([tx({ kind: 'bes', symbol: 'ABE', date: '2026-01-01' })], {}, fetchFn, now);
  const s = first!['TEFAS:EMK:ABE'];
  assert.ok(calls.length >= 4 && calls.length <= 5, `${calls.length} istek`);
  // Her istek en çok 28 gün
  for (const c of calls) {
    const days =
      (Date.parse(`${c.bit.slice(0, 4)}-${c.bit.slice(4, 6)}-${c.bit.slice(6)}`) -
        Date.parse(`${c.bas.slice(0, 4)}-${c.bas.slice(4, 6)}-${c.bas.slice(6)}`)) /
      86_400_000;
    assert.ok(days <= 28, `${days} gün`);
  }
  assert.equal(s.from, '2026-01-01');
  // Yarım gün sonra yenilenmez; 13 saat sonra yalnız son günler istenir
  calls.length = 0;
  assert.equal(
    await refreshPriceHistory(
      [tx({ kind: 'bes', symbol: 'ABE', date: '2026-01-01' })],
      first!,
      fetchFn,
      new Date('2026-04-15T20:00:00Z'),
    ),
    null,
  );
  assert.equal(calls.length, 0);
  const later = await refreshPriceHistory(
    [tx({ kind: 'bes', symbol: 'ABE', date: '2026-01-01' })],
    first!,
    fetchFn,
    new Date('2026-04-16T02:00:00Z'),
  );
  assert.equal(calls.length, 1);
  assert.ok(later!['TEFAS:EMK:ABE'].dates.length > s.dates.length - 1);
});
