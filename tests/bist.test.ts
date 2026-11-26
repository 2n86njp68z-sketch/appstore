import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BIST_STOCKS, bistInfo, foldForSearch, logoCandidates, searchBist } from '../src/lib/bist';
import { computeHoldings } from '../src/lib/portfolio';

test('veri seti: tüm BIST hisseleri, tekrar yok, kodlar geçerli', () => {
  assert.ok(BIST_STOCKS.length > 500, `${BIST_STOCKS.length} hisse`);
  const codes = BIST_STOCKS.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((c) => /^[A-Z0-9]{3,6}$/.test(c)));
  assert.ok(BIST_STOCKS.every((s) => s.name.length > 0 && s.name === s.name.trim()));
  const withSite = BIST_STOCKS.filter((s) => s.website).length;
  assert.ok(withSite / BIST_STOCKS.length > 0.95, `${withSite} web adresi`);
  assert.ok(BIST_STOCKS.every((s) => !s.website || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s.website)));
});

test('bilinen şirketler', () => {
  assert.equal(bistInfo('THYAO')?.name, 'Türk Hava Yolları');
  assert.equal(bistInfo('THYAO')?.website, 'www.turkishairlines.com');
  assert.equal(bistInfo('AKBNK')?.website, 'www.akbank.com');
  assert.equal(bistInfo('YOKBOYLE'), undefined);
});

test('Türkçe harf farkı aramayı etkilemez', () => {
  assert.equal(foldForSearch('Türk Hava YOLLARI'), 'turk hava yollari');
  assert.equal(foldForSearch('İŞ BANKASI'), 'is bankasi');
  assert.equal(foldForSearch('  Şişe   Cam '), 'sise cam');
});

test('arama sıralaması: tam kod, kod başı, kelime başı, içinde geçen', () => {
  assert.equal(searchBist('thyao')[0].code, 'THYAO');
  assert.equal(searchBist('THY')[0].code, 'THYAO');
  assert.ok(searchBist('turk hava').some((s) => s.code === 'THYAO'));
  assert.ok(searchBist('türk hava').some((s) => s.code === 'THYAO'));
  const akb = searchBist('akb');
  assert.equal(akb[0].code, 'AKBNK');
  assert.ok(searchBist('aselsan').some((s) => s.code === 'ASELS'));
  assert.equal(searchBist('zzzzqq').length, 0);
  assert.equal(searchBist('').length, BIST_STOCKS.length);
});

test('logo adayları: önce sitenin büyük simgesi', () => {
  assert.deepEqual(logoCandidates('www.akbank.com'), [
    'https://www.akbank.com/apple-touch-icon.png',
    'https://www.google.com/s2/favicons?domain=www.akbank.com&sz=128',
    'https://www.akbank.com/favicon.ico',
  ]);
  assert.equal(logoCandidates('https://metgunenerji.com.tr/')[0], 'https://metgunenerji.com.tr/apple-touch-icon.png');
});

test('portföyde Türk Market hissesi listedeki Türkçe adla görünür', () => {
  const [h] = computeHoldings(
    [{ id: '1', kind: 'bist', symbol: 'THYAO', side: 'buy', quantity: 1, price: 1, date: '2026-01-01', createdAt: 1 }],
    { 'THYAO.IS': { price: 2, name: 'TURK HAVA YOLLARI', fetchedAt: 1 } },
    {},
  );
  assert.equal(h.name, 'Türk Hava Yolları');
});
