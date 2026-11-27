import assert from 'node:assert/strict';
import { test } from 'node:test';

import { quoteSymbolFor } from '../src/lib/assets';
import { computeBenchmarks, simulate, type BenchSeries } from '../src/lib/benchmarks';
import { MARKETS, stockInfo } from '../src/lib/markets';
import { FxRates } from '../src/lib/portfolio';
import {
  cpiFromMonthlyChanges,
  fetchBistIndex,
  fetchTurkeyCpi,
  parseTcmbCpiHtml,
  parseBistIndexCurrent,
  parseBistIndexHistory,
  parseOecdCpiCsv,
} from '../src/lib/prices';
import type { FxHistory, FxSeries, RawQuote, Transaction } from '../src/lib/types';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

const series = (points: Record<string, number>): FxSeries => {
  const dates = Object.keys(points).sort();
  return { dates, rates: dates.map((d) => points[d]), fetchedAt: 1 };
};

let id = 0;
const tx = (t: Partial<Transaction>): Transaction => ({
  id: String(++id),
  kind: 'bist',
  symbol: 'THYAO',
  side: 'buy',
  quantity: 1,
  price: 100,
  date: '2026-01-05',
  createdAt: id,
  ...t,
});

const raw: Record<string, RawQuote> = {
  'USDTRY=X': { price: 40, fetchedAt: 1 },
  'EURTRY=X': { price: 45, fetchedAt: 1 },
  'XU100.IS': { price: 12000, fetchedAt: 1 },
  '^SP500TR': { price: 15000, fetchedAt: 1 },
};
const fxHistory: FxHistory = { USD: series({ '2026-01-05': 30, '2026-03-02': 35 }) };
const bench: BenchSeries = {
  'XU100.IS': series({ '2026-01-05': 10000, '2026-03-02': 8000 }),
  '^SP500TR': series({ '2026-01-05': 12000, '2026-03-02': 15000 }),
  CPI: series({ '2025-10-01': 100, '2025-11-01': 110, '2025-12-01': 121 }),
};

test('simulate: her alışta o günün fiyatından pay alınır, satışta pay düşülür', () => {
  const fx = new FxRates(raw, fxHistory);
  const prices: Record<string, number> = { '2026-01-05': 10, '2026-02-02': 20, '2026-03-02': 25 };
  const txs = [
    tx({ quantity: 10, price: 100, date: '2026-01-05' }), // 1000 TL → 100 pay
    tx({ quantity: 10, price: 100, date: '2026-02-02' }), // 1000 TL → 50 pay
    tx({ side: 'sell', quantity: 5, price: 100, date: '2026-03-02' }), // 500 TL → −20 pay
  ];
  close(
    simulate(txs, fx, (d) => prices[d], 30)!,
    (100 + 50 - 20) * 30,
  );
  assert.equal(
    simulate(txs, fx, (d) => (d === '2026-02-02' ? undefined : prices[d]), 30),
    undefined,
    'fiyatı bilinmeyen gün varsa sonuç yok',
  );
});

test('simulate: dolarlı varlık işlem günündeki kurla TL tutara çevrilir', () => {
  const fx = new FxRates(raw, fxHistory);
  const usTx = tx({ kind: 'us', symbol: 'AAPL', quantity: 2, price: 50, date: '2026-01-05' }); // 100 $ × 30 = 3000 TL
  close(
    simulate([usTx], fx, () => 10, 12)!,
    (3000 / 10) * 12,
  );
});

test('computeBenchmarks: BIST 100, S&P 500 TR (TL bazında) ve TÜFE', () => {
  const txs = [tx({ quantity: 10, price: 100, date: '2026-01-05' })]; // 1000 TL
  // TÜFE için 2025'te bir alış daha
  const withOld = [...txs, tx({ quantity: 10, price: 100, date: '2025-10-15' })];
  const res = computeBenchmarks(withOld, 3000, raw, fxHistory, bench);
  const by = Object.fromEntries(res.map((r) => [r.key, r]));
  assert.deepEqual(
    res.map((r) => r.key),
    ['bist100', 'sp500tr', 'cpi'],
  );

  // BIST 100: 2025-10-15 serinin başından önce → ilk fiyat (10000); bugün 12000
  close(by.bist100.value, (1000 / 10000 + 1000 / 10000) * 12000);
  close(by.bist100.diffPct, (3000 / by.bist100.value - 1) * 100);

  // S&P 500 TR: fiyat × o günkü kur; bugün 15000 × 40
  const spUnits = 1000 / (12000 * 30) + 1000 / (12000 * 30);
  close(by.sp500tr.value, spUnits * 15000 * 40);

  // TÜFE: Ekim 2025 alışı 100 → 121; Ocak 2026 alışı son açıklanan aydan sonra, tutar aynen kalır
  close(by.cpi.value, 1000 * 1.21 + 1000);
  assert.equal(by.cpi.asOf, '2025-12');
  assert.equal(by.cpi.partial, true);
  assert.equal(by.cpi.missing, undefined);
});

test('computeBenchmarks: tüm alışlar son TÜFE ayından sonraysa enflasyon "veri yok"', () => {
  const res = computeBenchmarks([tx({ date: '2026-02-10' })], 120, raw, fxHistory, bench);
  const cpi = res.find((r) => r.key === 'cpi')!;
  assert.equal(cpi.missing, true);
  assert.equal(cpi.asOf, '2025-12');
});

test('computeBenchmarks: işlem yoksa veya seri eksikse ölçüt gösterilmez', () => {
  assert.deepEqual(computeBenchmarks([], 0, raw, fxHistory, bench), []);
  const res = computeBenchmarks([tx({})], 100, raw, fxHistory, { 'XU100.IS': bench['XU100.IS'] });
  assert.deepEqual(
    res.map((r) => r.key),
    ['bist100'],
  );
  // Güncel fiyat yoksa serinin son değeri kullanılır
  const { 'XU100.IS': _x, ...noNow } = raw;
  void _x;
  const [r] = computeBenchmarks([tx({})], 100, noNow, fxHistory, { 'XU100.IS': bench['XU100.IS'] });
  close(r.value, (100 / 10000) * 8000);
});

const CSV = `DATAFLOW,REF_AREA,FREQ,METHODOLOGY,MEASURE,UNIT_MEASURE,EXPENDITURE,ADJUSTMENT,TRANSFORMATION,TIME_PERIOD,OBS_VALUE,OBS_STATUS
OECD.SDD.TPS:DSD_PRICES@DF_PRICES_ALL(1.0),TUR,M,N,CPI,IX,_T,N,_Z,2025-12,1348.454,A
OECD.SDD.TPS:DSD_PRICES@DF_PRICES_ALL(1.0),TUR,M,N,CPI,IX,_T,N,_Z,2025-11,1336.1,A
OECD.SDD.TPS:DSD_PRICES@DF_PRICES_ALL(1.0),TUR,M,N,CPI,IX,_T,N,_Z,2025,1200,A
OECD.SDD.TPS:DSD_PRICES@DF_PRICES_ALL(1.0),TUR,M,N,CPI,IX,_T,N,_Z,2025-10,,A
`;

test('OECD TÜFE CSV: aylık seri, sıralı, boş ve yıllık satırlar atlanır', () => {
  const s = parseOecdCpiCsv(CSV, 7)!;
  assert.deepEqual(s.dates, ['2025-11-01', '2025-12-01']);
  assert.deepEqual(s.rates, [1336.1, 1348.454]);
  assert.equal(s.fetchedAt, 7);
  assert.equal(parseOecdCpiCsv('a,b\n1,2'), null);
  assert.equal(parseOecdCpiCsv(''), null);
});

const TCMB_HTML = `<html><body><table class="x">
<tr><th>Ay-Yıl</th><th>TÜFE (Yıllık % Değişim)</th><th>TÜFE (Aylık % Değişim)</th></tr>
<tr><td><p>10-2026</p></td><td>29.77</td><td>2.58</td></tr>
<tr><td>09-2026</td><td>29.73</td><td>1.84</td></tr>
<tr><td>08-2026</td><td>31.51</td><td>-0,50</td></tr>
<tr><td>13-2026</td><td>1</td><td>1</td></tr>
<tr><td>Not</td><td></td><td></td></tr>
</table></body></html>`;

test('TCMB enflasyon tablosu: aylık değişimler sıralı okunur, endeks art arda çarpılarak kurulur', () => {
  const changes = parseTcmbCpiHtml(TCMB_HTML);
  assert.deepEqual(changes, [
    { month: '2026-08', pct: -0.5 },
    { month: '2026-09', pct: 1.84 },
    { month: '2026-10', pct: 2.58 },
  ]);
  const s = cpiFromMonthlyChanges(changes, 5)!;
  assert.deepEqual(s.dates, ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
  close(s.rates[0], 100);
  close(s.rates[3], 100 * 0.995 * 1.0184 * 1.0258);
  assert.equal(s.fetchedAt, 5);
  // Ay atlanırsa orada durulur
  const gap = cpiFromMonthlyChanges([
    { month: '2025-11', pct: 1 },
    { month: '2025-12', pct: 1 },
    { month: '2026-02', pct: 1 },
  ])!;
  assert.deepEqual(gap.dates, ['2025-10-01', '2025-11-01', '2025-12-01']);
  assert.equal(cpiFromMonthlyChanges([]), null);
  assert.deepEqual(parseTcmbCpiHtml('<p>yok</p>'), []);
});

test('fetchTurkeyCpi: önce TCMB; olmazsa OECD (geçici hatada bir kez daha dener)', async () => {
  const calls: string[] = [];
  const ok = (body: string) => ({ ok: true, status: 200, json: async () => ({}), text: async () => body });
  const err = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => '' });

  const tcmbOk = async (url: string) => (calls.push(url), ok(TCMB_HTML));
  // Örnek tablo Temmuz 2026'dan başlıyor: 2027 başından itibaren istenince yeterli
  const s = await fetchTurkeyCpi(2027, tcmbOk);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /tcmb\.gov\.tr/);
  assert.equal(s.dates.at(-1), '2026-10-01');

  // 2024'ten isteniyorsa TCMB tablosu kısa kalır → OECD
  calls.length = 0;
  let oecdTries = 0;
  const mixed = async (url: string) => {
    calls.push(url);
    if (url.includes('tcmb')) return ok(TCMB_HTML);
    return ++oecdTries === 1 ? err(500) : ok(CSV);
  };
  const o = await fetchTurkeyCpi(2024, mixed);
  assert.equal(calls.filter((u) => u.includes('oecd')).length, 2, 'OECD bir kez daha denenir');
  assert.match(
    calls.find((u) => u.includes('oecd'))!,
    /TUR\.M\.N\.CPI\.IX.*startPeriod=2024-01/,
  );
  assert.equal(o.dates.at(-1), '2025-12-01');

  // Web: TCMB hiç denenmez
  calls.length = 0;
  await fetchTurkeyCpi(2024, async (url: string) => (calls.push(url), ok(CSV)), { tcmb: false });
  assert.ok(calls.every((u) => u.includes('oecd')));
});

test('ABD ETF listesi: binlerce fon, Yahoo sembolü, ihraççı sitesi', () => {
  assert.ok(MARKETS.etf.stocks.length > 4000, `${MARKETS.etf.stocks.length} ETF`);
  const spy = stockInfo('etf', 'SPY')!;
  assert.match(spy.name, /S&P 500/);
  assert.match(spy.website ?? '', /ssga\.com/);
  assert.deepEqual(MARKETS.etf.quoteKeys('SPY'), ['SPY']);
  assert.equal(quoteSymbolFor('etf', 'QQQ'), 'QQQ');
  assert.equal(MARKETS.etf.currencyOf('SPY'), 'USD');
});

test('BIST 100 getiri endeksi varsa ve güncelse o kullanılır, yoksa fiyat endeksi', () => {
  const txs = [tx({ quantity: 10, price: 100, date: '2026-01-05' })];
  const XU100TR = series({ '2026-01-02': 20000, '2026-01-05': 20000, '2026-11-26': 25000 });
  const withTr = computeBenchmarks(txs, 1500, raw, fxHistory, { ...bench, XU100TR }, '2026-11-27');
  const b = withTr.find((r) => r.key === 'bist100')!;
  assert.equal(b.variant, 'total');
  close(b.value, (1000 / 20000) * 25000);

  // Seri eskimiş (10 günden uzun güncellenmemiş) → fiyat endeksi
  const old = computeBenchmarks(txs, 1500, raw, fxHistory, { ...bench, XU100TR }, '2026-12-20');
  assert.equal(old.find((r) => r.key === 'bist100')!.variant, 'price');
  // Seri ilk alışı kapsamıyor → fiyat endeksi
  const late = series({ '2026-02-02': 21000, '2026-11-26': 25000 });
  const notCovered = computeBenchmarks(txs, 1500, raw, fxHistory, { ...bench, XU100TR: late }, '2026-11-27');
  const p = notCovered.find((r) => r.key === 'bist100')!;
  assert.equal(p.variant, 'price');
  close(p.value, (1000 / 10000) * 12000);
});

const BIST_HISTORY = {
  status: 'success',
  data: [
    { indexName: 'XU100_CFNNTLTL', clval: 21469.27, hisTs: '2026-11-26' },
    { indexName: 'XU100_CFNNTLTL', clval: 21283.83, hisTs: '2026-11-25' },
    { indexName: 'XU100_CFNNTLTL', clval: 0, hisTs: '2026-11-24' },
    { indexName: 'XU100_CFNNTLTL', clval: 9.9487, hisTs: '1997-01-02' },
  ],
};
const BIST_CURRENT = (current: string, before: string) => ({
  status: 'success',
  data: {
    code: 'XU100_CFNNTLTL',
    before: { value: '21283.83', lastCalculatedDate: before },
    current: { value: '21500.5', lastCalculatedDate: current },
  },
});

test('Borsa İstanbul endeks verisi: geçmiş süzülür ve sıralanır, anlık değer okunur', () => {
  const h = parseBistIndexHistory(BIST_HISTORY, '2026-01-01', 3)!;
  assert.deepEqual(h.dates, ['2026-11-25', '2026-11-26']);
  assert.deepEqual(h.rates, [21283.83, 21469.27]);
  assert.equal(parseBistIndexHistory({ data: 'x' }, '2026-01-01'), null);
  const cur = parseBistIndexCurrent(BIST_CURRENT('2026-11-26', '2026-11-25'))!;
  assert.deepEqual(cur.current, { date: '2026-11-26', value: 21500.5 });
  assert.deepEqual(cur.before, { date: '2026-11-25', value: 21283.83 });
  assert.equal(parseBistIndexCurrent({}), null);
});

test('fetchBistIndex: büyük geçmiş yalnız yeni kapanış çıkınca iner, son nokta anlık değer', async () => {
  const calls: string[] = [];
  let live = BIST_CURRENT('2026-11-26', '2026-11-25');
  const fn = async (url: string) => {
    calls.push(url.match(/veriTuru=([^&]+)/)![1]);
    const body = url.includes('endeks-graphic') ? BIST_HISTORY : live;
    return { ok: true, status: 200, json: async () => body };
  };
  const first = await fetchBistIndex('XU100_CFNNTLTL', '2026-11-25', undefined, fn);
  assert.deepEqual(calls, ['current-before', 'endeks-graphic']);
  assert.match(calls.join(), /current-before/);
  assert.deepEqual(first.dates, ['2026-11-25', '2026-11-26']);
  assert.equal(first.rates.at(-1), 21500.5, 'bugünün kapanışı yerine anlık değer');

  calls.length = 0;
  await fetchBistIndex('XU100_CFNNTLTL', '2026-11-25', first, fn);
  assert.deepEqual(calls, ['current-before'], 'yeni kapanış yok: geçmiş inmez');

  calls.length = 0;
  live = BIST_CURRENT('2026-11-27', '2026-11-26');
  const old = { ...first, dates: ['2026-11-25'], rates: [21283.83] };
  const next = await fetchBistIndex('XU100_CFNNTLTL', '2026-11-25', old, fn);
  assert.deepEqual(calls, ['current-before', 'endeks-graphic'], 'yeni kapanış var: geçmiş yenilenir');
  assert.deepEqual(next.dates, ['2026-11-25', '2026-11-26', '2026-11-27']);

  // Hiçbir şey gelmezse hata
  const fail = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(fetchBistIndex('XU100_CFNNTLTL', '2026-11-25', undefined, fail));
});
