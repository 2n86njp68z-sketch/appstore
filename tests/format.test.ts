import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatMoney,
  formatNumber,
  formatPct,
  formatPrice,
  formatQuantity,
  parseDecimal,
  parseTrDate,
  formatTrDate,
  toInputString,
} from '../src/lib/format';

test('formatNumber Türkçe ayırıcı kullanır', () => {
  assert.equal(formatNumber(1234567.891, 2, 2), '1.234.567,89');
  assert.equal(formatNumber(0.5, 0, 2), '0,5');
  assert.equal(formatNumber(-1000, 0, 2), '-1.000');
  assert.equal(formatNumber(-0.001, 2, 2), '0,00');
  assert.equal(formatNumber(NaN), '—');
});

test('formatMoney işaret ve sembol', () => {
  assert.equal(formatMoney(1234.5, 'TRY'), '₺1.234,50');
  assert.equal(formatMoney(-50, 'USD'), '-$50,00');
  assert.equal(formatMoney(50, 'TRY', { signed: true }), '+₺50,00');
  assert.equal(formatMoney(0, 'TRY', { signed: true }), '₺0,00');
});

test('formatPrice küçük fiyatlarda daha çok hane gösterir', () => {
  assert.equal(formatPrice(312.456, 'TRY'), '₺312,46');
  assert.equal(formatPrice(1.23456, 'USD'), '$1,2346');
  assert.equal(formatPrice(0.00012345, 'USD'), '$0,000123');
});

test('formatPct', () => {
  assert.equal(formatPct(12.345), '+%12,35');
  assert.equal(formatPct(-3.1), '-%3,10');
  assert.equal(formatPct(0), '%0,00');
  assert.equal(formatPct(40, { signed: false }), '%40,00');
});

test('formatQuantity gereksiz sıfırları atar', () => {
  assert.equal(formatQuantity(10), '10');
  assert.equal(formatQuantity(0.0015), '0,0015');
  assert.equal(formatQuantity(1500.25), '1.500,25');
});

test('parseDecimal farklı yazımları çözer', () => {
  assert.equal(parseDecimal('12,5'), 12.5);
  assert.equal(parseDecimal('12.5'), 12.5);
  assert.equal(parseDecimal('1.234,56'), 1234.56);
  assert.equal(parseDecimal('1,234.56'), 1234.56);
  assert.equal(parseDecimal('1.234.567'), 1234567);
  assert.equal(parseDecimal(' ₺ 1 000 '), 1000);
  assert.equal(parseDecimal('0,0015'), 0.0015);
  assert.ok(Number.isNaN(parseDecimal('')));
  assert.ok(Number.isNaN(parseDecimal('abc')));
  assert.ok(Number.isNaN(parseDecimal('1,2,3')));
});

test('toInputString ile parseDecimal birbirini tersler', () => {
  for (const v of [1234.5, 0.000123, 312.46, 42]) {
    assert.ok(Math.abs(parseDecimal(toInputString(v)) - v) < 1e-9, String(v));
  }
});

test('tarih çevirileri', () => {
  assert.equal(parseTrDate('26.11.2026'), '2026-11-26');
  assert.equal(parseTrDate('1.2.2025'), '2025-02-01');
  assert.equal(parseTrDate('31.02.2025'), null);
  assert.equal(parseTrDate('2025-02-01'), null);
  assert.equal(formatTrDate('2026-11-26'), '26.11.2026');
});
