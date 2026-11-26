import type { DisplayCurrency } from './types';

/** Türkçe sayı biçimi: binlik ayırıcı ".", ondalık ",". */
export function formatNumber(value: number, minFraction = 0, maxFraction = 2): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = Math.abs(value).toFixed(maxFraction);
  let [intPart, frac = ''] = fixed.split('.');
  while (frac.length > minFraction && frac.endsWith('0')) frac = frac.slice(0, -1);
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const isZero = Number(fixed) === 0;
  return (value < 0 && !isZero ? '-' : '') + intPart + (frac ? ',' + frac : '');
}

const SYMBOLS: Record<DisplayCurrency, string> = { TRY: '₺', USD: '$', EUR: '€' };

export function currencySymbol(currency: DisplayCurrency): string {
  return SYMBOLS[currency];
}

/** Fiyatın büyüklüğüne göre ondalık hane sayısı. */
export function priceDecimals(value: number): number {
  const v = Math.abs(value);
  if (v === 0 || v >= 10) return 2;
  if (v >= 1) return 4;
  return 6;
}

export function formatMoney(
  value: number,
  currency: DisplayCurrency,
  opts: { signed?: boolean; decimals?: number } = {},
): string {
  if (!Number.isFinite(value)) return '—';
  const decimals = opts.decimals ?? 2;
  const body = formatNumber(Math.abs(value), decimals, decimals);
  const isZero = body.replace(/[^1-9]/g, '') === '';
  const sign = value < 0 && !isZero ? '-' : opts.signed && !isZero ? '+' : '';
  return `${sign}${SYMBOLS[currency]}${body}`;
}

export function formatPrice(value: number, currency: DisplayCurrency): string {
  const d = priceDecimals(value);
  if (!Number.isFinite(value)) return '—';
  return `${SYMBOLS[currency]}${formatNumber(value, 2, d)}`;
}

/** Yüzde: "+%12,34" */
export function formatPct(value: number, opts: { signed?: boolean; decimals?: number } = { signed: true }): string {
  if (!Number.isFinite(value)) return '—';
  const d = opts.decimals ?? 2;
  const body = formatNumber(Math.abs(value), d, d);
  const isZero = !/[1-9]/.test(body);
  const sign = value < 0 && !isZero ? '-' : opts.signed && !isZero ? '+' : '';
  return `${sign}%${body}`;
}

export function formatQuantity(value: number): string {
  return formatNumber(value, 0, 8);
}

/**
 * Kullanıcının yazdığı ondalık sayıyı çözer. "1.234,56", "12,5", "12.5", "1 000" gibi girdileri kabul eder.
 * Geçersizse NaN döner.
 */
export function parseDecimal(input: string): number {
  let s = input.trim().replace(/[\s₺$]/g, '');
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Sondaki ayırıcı ondalıktır.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    if ((s.match(/,/g) ?? []).length > 1) return NaN;
    s = s.replace(',', '.');
  } else if (hasDot) {
    // Birden fazla nokta: binlik ayırıcı ("1.234.567").
    if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  }
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.$/.test(s)) return NaN;
  return Number(s);
}

/** Sayıyı düzenleme alanına yazmak için: "1234,5" (binlik ayırıcısız). */
export function toInputString(value: number): string {
  if (!Number.isFinite(value)) return '';
  return formatNumber(value, 0, priceDecimals(value) + 2).replace(/\./g, '');
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "26.11.2026" -> "2026-11-26"; geçersizse null. */
export function parseTrDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "2026-11-26" -> "26.11.2026" */
export function formatTrDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Türkçe büyük harf: "i" → "İ", "ı" → "I" (yazı tipinin büyük harf dönüşümüne güvenmeden). */
export function trUpper(text: string): string {
  return text.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}
