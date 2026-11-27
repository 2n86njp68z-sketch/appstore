import { assetCurrency, assetKey, displaySymbol, EURTRY_SYMBOL, quoteSymbolFor, USDTRY_SYMBOL } from './assets';
import { formatAssetPrice } from './format';
import { resolveAssetQuote } from './portfolio';
import type { AssetKind, RawQuote } from './types';

/**
 * Fiyat alarmı: varlığın fiyatı (kendi para biriminde) belirlenen seviyenin üstüne çıkınca ya da altına
 * inince bir kez bildirim gönderilir; sonra alarm kapanır (istenirse yeniden açılır).
 */
export interface PriceAlert {
  id: string;
  kind: AssetKind;
  symbol: string;
  op: 'above' | 'below';
  /** Varlığın kendi para biriminde seviye (eurobondda 100 nominal başına). */
  price: number;
  createdAt: number;
  active: boolean;
  triggeredAt?: number;
  triggeredPrice?: number;
}

export interface FiredAlert {
  alert: PriceAlert;
  price: number;
}

/** Etkin alarmlardan koşulu sağlananlar. */
export function checkAlerts(
  alerts: PriceAlert[],
  raw: Record<string, RawQuote>,
  manualPrices: Record<string, number>,
): FiredAlert[] {
  const out: FiredAlert[] = [];
  for (const a of alerts) {
    if (!a.active) continue;
    const q = resolveAssetQuote(a.kind, a.symbol, raw, manualPrices);
    if (!q || !(q.price > 0)) continue;
    if (a.op === 'above' ? q.price >= a.price : q.price <= a.price) out.push({ alert: a, price: q.price });
  }
  return out;
}

/** Tetiklenen alarmları kapatır (tetiklenme zamanı ve fiyatıyla). */
export function markFired(alerts: PriceAlert[], fired: FiredAlert[], now = Date.now()): PriceAlert[] {
  const byId = new Map(fired.map((f) => [f.alert.id, f.price]));
  return alerts.map((a) =>
    byId.has(a.id) ? { ...a, active: false, triggeredAt: now, triggeredPrice: byId.get(a.id) } : a,
  );
}

/** Alarmların fiyatı için gereken kaynak sembolleri (kurlar dahil; gram altın vb. TL'ye çevrilir). */
export function alertQuoteSymbols(alerts: PriceAlert[]): string[] {
  const set = new Set<string>([USDTRY_SYMBOL, EURTRY_SYMBOL]);
  for (const a of alerts) {
    if (!a.active) continue;
    const s = quoteSymbolFor(a.kind, a.symbol);
    if (s) set.add(s);
  }
  return [...set];
}

/** "THYAO ₺350,00 üstüne çıkınca" */
export function describeAlert(a: Pick<PriceAlert, 'kind' | 'symbol' | 'op' | 'price'>): string {
  const level = formatAssetPrice(a.kind, a.price, assetCurrency(a.kind, a.symbol));
  return `${displaySymbol(a.kind, a.symbol)} ${level} ${a.op === 'above' ? 'üstüne çıkınca' : 'altına inince'}`;
}

/** Bildirim metni. */
export function alertMessage(f: FiredAlert): { title: string; body: string } {
  const { alert: a, price } = f;
  const cur = assetCurrency(a.kind, a.symbol);
  const name = displaySymbol(a.kind, a.symbol);
  const up = a.op === 'above';
  return {
    title: `${name} ${up ? '▲' : '▼'} ${formatAssetPrice(a.kind, price, cur)}`,
    body: `${name} fiyatı belirlediğin ${formatAssetPrice(a.kind, a.price, cur)} seviyesinin ${up ? 'üstüne çıktı' : 'altına indi'}.`,
  };
}

/** Bir varlığın alarmları. */
export function alertsFor(alerts: PriceAlert[], kind: AssetKind, symbol: string): PriceAlert[] {
  const key = assetKey(kind, symbol);
  return alerts.filter((a) => assetKey(a.kind, a.symbol) === key);
}

/** Yedekten gelen alarmları doğrular. */
export function validAlerts(x: unknown): PriceAlert[] {
  if (!Array.isArray(x)) return [];
  return x.filter(
    (a): a is PriceAlert =>
      !!a &&
      typeof a === 'object' &&
      typeof a.id === 'string' &&
      typeof a.kind === 'string' &&
      typeof a.symbol === 'string' &&
      (a.op === 'above' || a.op === 'below') &&
      typeof a.price === 'number' &&
      a.price > 0 &&
      typeof a.active === 'boolean',
  );
}
