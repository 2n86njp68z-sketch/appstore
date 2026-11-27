import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  alertMessage,
  alertQuoteSymbols,
  alertsFor,
  checkAlerts,
  describeAlert,
  markFired,
  validAlerts,
  type PriceAlert,
} from '../src/lib/alerts';
import { makeBackup, parseBackup } from '../src/lib/backup';
import type { RawQuote } from '../src/lib/types';

const alert = (a: Partial<PriceAlert>): PriceAlert => ({
  id: Math.random().toString(36).slice(2),
  kind: 'bist',
  symbol: 'THYAO',
  op: 'above',
  price: 350,
  createdAt: 1,
  active: true,
  ...a,
});

const raw: Record<string, RawQuote> = {
  'THYAO.IS': { price: 352.5, fetchedAt: 1 },
  'ASELS.IS': { price: 180, fetchedAt: 1 },
  'GC=F': { price: 4000, fetchedAt: 1 },
  'USDTRY=X': { price: 40, fetchedAt: 1 },
  'EURTRY=X': { price: 45, fetchedAt: 1 },
};

test('üstüne çıkınca / altına inince; kapalı ve fiyatı olmayan alarm çalmaz', () => {
  const a = alert({ id: 'a' });
  const b = alert({ id: 'b', symbol: 'ASELS', op: 'below', price: 185 });
  const c = alert({ id: 'c', symbol: 'ASELS', op: 'below', price: 170 });
  const d = alert({ id: 'd', active: false, price: 300 });
  const e = alert({ id: 'e', symbol: 'YOKBOYLE' });
  const fired = checkAlerts([a, b, c, d, e], raw, {});
  assert.deepEqual(
    fired.map((f) => [f.alert.id, f.price]),
    [
      ['a', 352.5],
      ['b', 180],
    ],
  );
});

test('gram altın alarmı TL fiyatıyla (kontrat × kur / 31,1)', () => {
  const gram = (4000 * 40) / 31.1034768;
  const fired = checkAlerts([alert({ kind: 'metal', symbol: 'GRAM_ALTIN', price: 5000 })], raw, {});
  assert.equal(fired.length, 1);
  assert.ok(Math.abs(fired[0].price - gram) < 1e-9);
  // Kur da istenir
  assert.deepEqual(alertQuoteSymbols([alert({ kind: 'metal', symbol: 'GRAM_ALTIN' })]).sort(), [
    'EURTRY=X',
    'GC=F',
    'USDTRY=X',
  ]);
});

test('elle fiyatlanan varlıkta elle girilen fiyat', () => {
  const fired = checkAlerts(
    [alert({ kind: 'other', symbol: 'MEVDUAT', op: 'above', price: 100 })],
    {},
    { 'other:MEVDUAT': 120 },
  );
  assert.equal(fired.length, 1);
});

test('tetiklenen alarm kapanır, zaman ve fiyat yazılır; diğerleri değişmez', () => {
  const a = alert({ id: 'a' });
  const b = alert({ id: 'b', price: 400 });
  const next = markFired([a, b], [{ alert: a, price: 352.5 }], 1234);
  assert.deepEqual(next[0], { ...a, active: false, triggeredAt: 1234, triggeredPrice: 352.5 });
  assert.equal(next[1], b);
  // Kapanınca ikinci kez çalmaz
  assert.equal(checkAlerts(next, raw, {}).length, 0);
});

test('metinler', () => {
  assert.equal(describeAlert(alert({})), 'THYAO ₺350,00 üstüne çıkınca');
  assert.equal(
    describeAlert(alert({ kind: 'us', symbol: 'AAPL', op: 'below', price: 200 })),
    'AAPL $200,00 altına inince',
  );
  const m = alertMessage({ alert: alert({}), price: 352.5 });
  assert.equal(m.title, 'THYAO ▲ ₺352,50');
  assert.ok(m.body.includes('₺350,00') && m.body.includes('üstüne çıktı'));
  assert.equal(alertsFor([alert({}), alert({ symbol: 'ASELS' })], 'bist', 'ASELS').length, 1);
});

test('yedekte alarmlar korunur, bozuklar atlanır', () => {
  const list = [alert({ id: 'a' }), alert({ id: 'b', active: false, triggeredAt: 5 })];
  const json = makeBackup({
    transactions: [],
    manualPrices: {},
    displayCurrency: 'TRY',
    extra: { targets: {}, alerts: list },
  });
  const parsed = parseBackup(json);
  assert.ok(parsed.ok);
  assert.deepEqual(validAlerts(parsed.data.extra?.alerts), list);
  assert.deepEqual(validAlerts([{ id: 'x', op: 'sideways' }, null, 5]), []);
  assert.deepEqual(validAlerts(undefined), []);
});
