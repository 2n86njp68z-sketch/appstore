import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SCRIPTABLE_EXPORT_SCRIPT } from '../src/lib/scriptable-export-script';
import {
  describeCounts,
  istanbulDate,
  parseScriptableTexts,
  SCRIPTABLE_EXPORT_APP,
  type ScriptableImport,
} from '../src/lib/scriptable-import';

const ms = (s: string) => new Date(s).getTime();
const START = ms('2025-11-14T10:00:00+03:00');
const BUY2 = ms('2026-01-05T11:00:00+03:00');
const SPLIT = ms('2026-01-20T09:00:00+03:00');
const LOGMS = ms('2026-02-10T12:00:00+03:00');
const LOG2 = ms('2026-03-02T15:00:00+03:00');
const GOLD = ms('2025-12-01T10:00:00+03:00');
const NOW = new Date('2026-11-27T09:00:00+03:00');

const usdGetiri = {
  startMs: START,
  logMs: LOGMS,
  hist: {
    ANSGR: [
      { ms: START, lots: 100 },
      { ms: BUY2, lots: 150 },
    ],
    MGROS: [{ ms: START, lots: 10 }],
    ASELS: [
      { ms: START, lots: 50 },
      { ms: SPLIT + 1000, lots: 100 },
    ],
  },
  trades: [
    { ms: START, t: 'ANSGR', dl: 100, price: 90, tl: 9000, rate: 34, start: true },
    { ms: START, t: 'MGROS', dl: 10, price: 500, tl: 5000, rate: 34, start: true },
    { ms: START, t: 'ASELS', dl: 50, price: 60, tl: 3000, rate: 34, start: true },
    { ms: BUY2, t: 'ANSGR', dl: 50, price: 95, tl: 4750, rate: 35 },
  ],
  events: { ASELS: { splits: [{ ms: SPLIT, key: '2026-01-20', ratio: 2 }] } },
  rates: {},
  altin: {
    startMs: GOLD,
    hist: [{ ms: GOLD, lots: 0.05 }],
    trades: [{ ms: GOLD, t: 'ALTIN', dl: 0.05, price: 140000, tl: 7000, rate: 35, start: true }],
  },
};

const lotLog = [
  // USD Getiri'nin zaten işlediği kayıt: atlanmalı
  { ms: BUY2, lots: { ANSGR: 150, ASELS: 50, MGROS: 10 }, prices: { ANSGR: 95 } },
  // Sonraki: CCOLA alındı (ASELS bedelsizden sonra 100, işlem değil)
  {
    ms: LOG2,
    lots: { ANSGR: 150, ASELS: 100, MGROS: 10, CCOLA: 20 },
    prices: { ANSGR: 99, ASELS: 31, MGROS: 510, CCOLA: 60 },
  },
];

const neAlayim = {
  targets: { ANSGR: 24, MGROS: 23, CCOLA: 11, ASELS: 0 },
  lots: { ANSGR: 150, MGROS: 5, ASELS: 100, CCOLA: 20 },
  lastPrices: { ANSGR: 101, MGROS: 520, ASELS: 32, CCOLA: 61 },
  us: { targets: { TSM: 0 }, lots: { TSM: 2, SPY: 1 }, lastPrices: { TSM: 300, SPY: 650 }, frac: false },
  bes: { targets: { ABE: 100 }, lots: {}, lastPrices: {} },
  altin: { eklendi: true, listede: true, hedef: 10, adet: 0.05, sonFiyat: 150000 },
};

function ok(texts: string[], opts = {}): ScriptableImport {
  const r = parseScriptableTexts(texts, { now: NOW, ...opts });
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.data;
}

test('istanbulDate: Türkiye saatine göre gün', () => {
  assert.equal(istanbulDate(ms('2025-11-14T23:30:00+03:00')), '2025-11-14');
  assert.equal(istanbulDate(ms('2025-11-14T21:30:00Z')), '2025-11-15');
});

test('üç dosya birlikte: USD Getiri işlemleri + sonraki lot_log + güncel lotlar', () => {
  const combined = JSON.stringify({
    app: SCRIPTABLE_EXPORT_APP,
    version: 1,
    exportedAt: NOW.toISOString(),
    neAlayim,
    lotLog,
    usdGetiri,
  });
  const d = ok([combined]);
  const row = (symbol: string) =>
    d.transactions
      .filter((t) => t.symbol === symbol)
      .map((t) => [t.side, t.quantity, t.price, t.date, t.kind].join(' '));

  assert.deepEqual(row('ANSGR'), ['buy 100 90 2025-11-14 bist', 'buy 50 95 2026-01-05 bist']);
  // Bedelsiz alış sayılmadı; işlemler o günkü adetle (GENIUS bedelsizi kendisi işler)
  assert.deepEqual(row('ASELS'), ['buy 50 60 2025-11-14 bist']);
  // lot_log'daki yeni alış
  assert.deepEqual(row('CCOLA'), ['buy 20 60 2026-03-02 bist']);
  // Ne Alayım'da 10 → 5: bugün son fiyattan satış
  assert.deepEqual(row('MGROS'), ['buy 10 500 2025-11-14 bist', 'sell 5 520 2026-11-27 bist']);
  // ABD: hisse ve ETF ayrı tür
  assert.deepEqual(row('TSM'), ['buy 2 300 2026-11-27 us']);
  assert.deepEqual(row('SPY'), ['buy 1 650 2026-11-27 etf']);
  // Altın → kripto XAUT, dolar fiyatıyla (140.000 TL / 35)
  assert.deepEqual(row('XAUT'), ['buy 0.05 4000 2025-12-01 crypto']);

  assert.deepEqual(d.targets, { 'bist:ANSGR': 24, 'bist:MGROS': 23, 'bist:CCOLA': 11, 'crypto:XAUT': 10 });
  assert.equal(d.sources.length, 3);
  assert.equal(d.firstDate, '2025-11-14');
  assert.equal(d.lastDate, '2026-11-27');
  assert.equal(describeCounts(d.counts), 'BIST 6 · ABD 2 · Altın 1');
  assert.ok(d.notes.some((n) => n.includes('14.11.2025')));
  assert.ok(d.notes.some((n) => n.includes('ABD ve BES hedefleri')));
  // Kimlikler tekil ve tekrar aktarımda aynı (birleştirmede çift kayıt olmaz)
  assert.equal(new Set(d.transactions.map((t) => t.id)).size, d.transactions.length);
  assert.deepEqual(
    ok([combined]).transactions.map((t) => t.id),
    d.transactions.map((t) => t.id),
  );
});

test('ham dosyalar ayrı ayrı (sıra fark etmez) aynı sonucu verir', () => {
  const combined = ok([JSON.stringify({ app: SCRIPTABLE_EXPORT_APP, neAlayim, lotLog, usdGetiri })]);
  const raw = ok([JSON.stringify(neAlayim), JSON.stringify(usdGetiri), JSON.stringify(lotLog)]);
  assert.deepEqual(raw.transactions, combined.transactions);
  assert.deepEqual(raw.targets, combined.targets);
});

test('bedelsizden sonra Ne Alayım güncellenmediyse işlem yazılmaz', () => {
  const ne = { ...neAlayim, lots: { ...neAlayim.lots, ASELS: 50 } };
  const u = {
    ...usdGetiri,
    hist: { ...usdGetiri.hist, ASELS: [{ ms: START, lots: 50 }] },
  };
  const d = ok([JSON.stringify(ne), JSON.stringify(u)]);
  assert.deepEqual(
    d.transactions.filter((t) => t.symbol === 'ASELS').map((t) => `${t.side} ${t.quantity}`),
    ['buy 50'],
  );
});

test('yalnız lot_log: ilk kayıt başlangıç, sonrakiler fark', () => {
  const d = ok([JSON.stringify(lotLog)]);
  const sum = d.transactions.map((t) => `${t.symbol} ${t.side} ${t.quantity} ${t.price}`);
  assert.deepEqual(sum, [
    'ANSGR buy 150 95',
    // İlk kayıtta fiyatı olmayanlar, fiyatı ilk bilinen kayıtta eklenir
    'ASELS buy 100 31',
    'MGROS buy 10 510',
    'CCOLA buy 20 60',
  ]);
  assert.ok(d.notes.some((n) => n.includes('bedelsizler ayıklanamadı')));
  assert.ok(d.notes.some((n) => n.includes('Fiyatı bilinmeyen')));
});

test('yalnız ne_alayim: eldeki lotlar bugün son fiyatla, altın için kur dışarıdan', () => {
  const d = ok([JSON.stringify(neAlayim)], { usdTryOn: () => 42 });
  const gold = d.transactions.find((t) => t.symbol === 'XAUT')!;
  assert.equal(gold.date, '2026-11-27');
  assert.ok(Math.abs(gold.price - 150000 / 42) < 1e-9);
  assert.ok(d.transactions.every((t) => t.side === 'buy' && t.date === '2026-11-27'));
  assert.ok(d.notes.some((n) => n.includes('maliyet bilinmiyor')));
  // Kur yoksa altın atlanır
  const noFx = ok([JSON.stringify(neAlayim)]);
  assert.equal(
    noFx.transactions.find((t) => t.symbol === 'XAUT'),
    undefined,
  );
  assert.ok(noFx.notes.some((n) => n.includes('Dolar kuru bilinmediği')));
});

test('bozuk ya da ilgisiz dosya', () => {
  const bad = parseScriptableTexts(['{nope']);
  assert.ok(!bad.ok);
  const other = parseScriptableTexts([JSON.stringify({ app: 'GENIUS', transactions: [] })]);
  assert.ok(!other.ok && other.error.includes('bulunamadı'));
});

test('aktarma scripti: geçerli JavaScript ve doğru dosyaları okur', () => {
  // Scriptable'da üst seviye await var: async fonksiyon gövdesi olarak derlenebilmeli
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction(SCRIPTABLE_EXPORT_SCRIPT));
  for (const f of ['ne_alayim.json', 'lot_log.json', 'usd_getiri.json', SCRIPTABLE_EXPORT_APP]) {
    assert.ok(SCRIPTABLE_EXPORT_SCRIPT.includes(f), f);
  }
});

test('aktarma scripti Scriptable benzeri ortamda çalışır ve birleşik dosyayı üretir', async () => {
  const files: Record<string, string> = {
    '/local/ne_alayim.json': JSON.stringify(neAlayim),
    '/cloud/usd_getiri.json': JSON.stringify(usdGetiri),
  };
  const fm = (root: string) => ({
    documentsDirectory: () => root,
    joinPath: (a: string, b: string) => `${a}/${b}`,
    fileExists: (p: string) => p in files,
    isFileStoredIniCloud: (p: string) => p.startsWith('/cloud'),
    isFileDownloaded: () => false,
    downloadFileFromiCloud: async () => {},
    readString: (p: string) => files[p],
  });
  let exported: { content: string; name: string } | undefined;
  const alerts: string[] = [];
  class Alert {
    title = '';
    message = '';
    addAction() {}
    addCancelAction() {}
    async presentAlert() {
      alerts.push(this.title);
      return 0;
    }
  }
  const env = {
    FileManager: { local: () => fm('/local'), iCloud: () => fm('/cloud') },
    Alert,
    DocumentPicker: {
      exportString: async (content: string, name: string) => {
        exported = { content, name };
        return [name];
      },
    },
    Script: { complete() {} },
  };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  await new AsyncFunction(...Object.keys(env), SCRIPTABLE_EXPORT_SCRIPT)(...Object.values(env));
  assert.deepEqual(alerts, ["GENIUS'a aktar"]);
  assert.ok(exported && /^GENIUS-scriptable-\d{4}-\d\d-\d\d\.json$/.test(exported.name));
  const out = JSON.parse(exported!.content);
  assert.equal(out.app, SCRIPTABLE_EXPORT_APP);
  assert.equal(out.lotLog, null);
  // Ürettiği dosya GENIUS'ta okunur
  const d = ok([exported!.content]);
  assert.ok(d.transactions.some((t) => t.symbol === 'ANSGR'));
});
