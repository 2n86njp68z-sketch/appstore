import { assetKey } from './assets';
import { stockInfo } from './markets';
import type { AssetKind, Transaction } from './types';

/**
 * Scriptable'daki "Ne Alayım?" ve "USD Getiri" scriptlerinin verilerini GENIUS işlemlerine çevirir.
 *
 * Dosyalar (Scriptable'ın Documents klasöründe):
 * - usd_getiri.json: her alım/satım zamanı, lot farkı, fiyatı ve kuruyla (en doğru kaynak). Takibin
 *   başladığı gün eldeki lotlar o günün fiyatıyla alınmış sayılır ("start").
 * - lot_log.json: Ne Alayım'da lotlar her değiştiğinde zaman ve o anki fiyatlarla düşen kayıt.
 * - ne_alayim.json: güncel lotlar, hedef oranlar ve son fiyatlar.
 *
 * Sıra: USD Getiri'nin işlemleri → onun henüz işlemediği lot_log kayıtları (farklar) → Ne Alayım'daki güncel
 * lotlarla son fark. Bedelsizler USD Getiri'nin kaydettiği bölünmelerle ayıklanır; GENIUS bedelsiz ve
 * temettüyü kendisi işlediği için işlemler o günkü adet ve fiyatlarıyla aktarılır.
 *
 * Ne Alayım'daki "ALTIN" Tether Gold'dur (XAUT, 1 adet = 1 ons): GENIUS'ta kripto XAUT olarak, dolar
 * fiyatıyla eklenir.
 */

export const SCRIPTABLE_EXPORT_APP = 'GENIUS-Scriptable';

type Book = 'bist' | 'us' | 'bes' | 'altin';

const BOOK_NAMES: Record<Book, string> = { bist: 'BIST', us: 'ABD', bes: 'BES', altin: 'Altın' };

export interface ScriptableImport {
  transactions: Transaction[];
  /** Hedef oranlar (varlık anahtarı → %); Ne Alayım'ın BIST + altın listesi. */
  targets: Record<string, number>;
  /** Okunan dosyalar. */
  sources: string[];
  /** Kullanıcıya gösterilecek notlar. */
  notes: string[];
  /** Bölüm başına işlem sayısı. */
  counts: Partial<Record<Book, number>>;
  firstDate?: string;
  lastDate?: string;
}

export type ParsedScriptable = { ok: true; data: ScriptableImport } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Dosya şekilleri (yalnız kullanılan alanlar)

type Lots = Record<string, number>;
interface Split {
  ms: number;
  ratio: number;
}
interface GTrade {
  ms: number;
  t: string;
  dl: number;
  price: number;
  rate?: number;
  start?: boolean;
}
interface GBook {
  startMs?: number;
  hist?: Record<string, { ms: number; lots: number }[]>;
  trades?: GTrade[];
  events?: Record<string, { splits?: Split[] }>;
}
interface UsdGetiri extends GBook {
  logMs?: number;
  rates?: Record<string, number>;
  us?: GBook;
  bes?: GBook;
  altin?: { startMs?: number; hist?: { ms: number; lots: number }[]; trades?: GTrade[] };
}
interface LogEntry {
  ms: number;
  lots: Lots;
  prices?: Lots;
  us?: { lots?: Lots; prices?: Lots };
  bes?: { lots?: Lots; prices?: Lots };
  altin?: { adet?: number; fiyat?: number | null };
}
interface NeAlayim {
  targets?: Lots;
  lots?: Lots;
  lastPrices?: Lots;
  us?: { targets?: Lots; lots?: Lots; lastPrices?: Lots };
  bes?: { targets?: Lots; lots?: Lots; lastPrices?: Lots };
  altin?: { listede?: boolean; hedef?: number; adet?: number; sonFiyat?: number };
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

function classify(json: unknown): { usd?: UsdGetiri; log?: LogEntry[]; ne?: NeAlayim } {
  if (isObj(json) && json.app === SCRIPTABLE_EXPORT_APP) {
    return {
      usd: isObj(json.usdGetiri) ? (json.usdGetiri as UsdGetiri) : undefined,
      log: Array.isArray(json.lotLog) ? (json.lotLog as LogEntry[]) : undefined,
      ne: isObj(json.neAlayim) ? (json.neAlayim as NeAlayim) : undefined,
    };
  }
  if (Array.isArray(json)) {
    if (json.length === 0 || json.some((e) => isObj(e) && num(e.ms) != null && isObj(e.lots))) {
      return { log: json as LogEntry[] };
    }
    return {};
  }
  if (isObj(json)) {
    if (num(json.startMs) != null && Array.isArray(json.trades)) return { usd: json as UsdGetiri };
    if (isObj(json.targets) || isObj(json.lots)) return { ne: json as NeAlayim };
  }
  return {};
}

// ---------------------------------------------------------------------------

/** Türkiye saatiyle (UTC+3) gün: "YYYY-AA-GG". */
export function istanbulDate(ms: number): string {
  return new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
}

const round = (n: number, dec: number) => Math.round(n * 10 ** dec) / 10 ** dec;
const DEC: Record<Book, number> = { bist: 0, us: 4, bes: 6, altin: 6 };

function splitFactor(splits: Split[] | undefined, fromMs: number, toMs: number): number {
  return (splits ?? []).filter((s) => s.ms > fromMs && s.ms <= toMs && s.ratio > 0).reduce((f, s) => f * s.ratio, 1);
}

function cleanLots(o: unknown): Lots {
  const r: Lots = {};
  if (!isObj(o)) return r;
  for (const [k, v] of Object.entries(o)) {
    const n = num(v);
    if (n != null && n > 0) r[k.toUpperCase()] = n;
  }
  return r;
}

export function parseScriptableTexts(
  texts: string[],
  opts: {
    now?: Date;
    /** Bir gündeki dolar kuru (TL); altın işlemlerinin dolar fiyatı için, dosyada kur yoksa. */
    usdTryOn?: (date: string) => number | undefined;
  } = {},
): ParsedScriptable {
  const now = opts.now ?? new Date();
  let usd: UsdGetiri | undefined;
  let log: LogEntry[] | undefined;
  let ne: NeAlayim | undefined;
  for (const text of texts) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Dosya okunamadı: geçerli bir JSON değil.' };
    }
    const c = classify(json);
    usd = c.usd ?? usd;
    log = c.log ?? log;
    ne = c.ne ?? ne;
  }
  if (!usd && !log && !ne) {
    return {
      ok: false,
      error:
        'Bu dosyada Ne Alayım ya da USD Getiri verisi bulunamadı. Aktarma scriptinin kaydettiği dosyayı ya da ne_alayim.json, lot_log.json, usd_getiri.json dosyalarını seç.',
    };
  }

  const notes: string[] = [];
  const sources: string[] = [];
  if (usd) sources.push('USD Getiri (usd_getiri.json)');
  if (log) sources.push('Ne Alayım işlem kaydı (lot_log.json)');
  if (ne) sources.push('Ne Alayım (ne_alayim.json)');

  interface Trade {
    ms: number;
    book: Book;
    t: string;
    dl: number;
    /** Bölümün para biriminde: BIST/BES/altın TL, ABD dolar. */
    price: number;
    rate?: number;
  }
  const trades: Trade[] = [];
  // Bölüm başına bilinen son durum: zaman ve lot
  const state: Record<Book, Record<string, { ms: number; lots: number }>> = { bist: {}, us: {}, bes: {}, altin: {} };
  const splitsOf = (book: Book, t: string): Split[] | undefined =>
    book === 'bist' ? usd?.events?.[t]?.splits : book === 'us' ? usd?.us?.events?.[t]?.splits : undefined;
  let skippedNoPrice = 0;
  let startMs: number | undefined;

  // 1) USD Getiri
  if (usd) {
    const books: [Book, { hist?: GBook['hist'] | { ms: number; lots: number }[]; trades?: GTrade[] } | undefined][] = [
      ['bist', usd],
      ['us', usd.us],
      ['bes', usd.bes],
      ['altin', usd.altin],
    ];
    for (const [book, b] of books) {
      if (!b) continue;
      for (const tr of b.trades ?? []) {
        const ms = num(tr.ms);
        const dl = num(tr.dl);
        const price = num(tr.price);
        if (ms == null || dl == null || dl === 0 || price == null || price <= 0 || typeof tr.t !== 'string') continue;
        const t = book === 'altin' ? 'ALTIN' : tr.t.toUpperCase();
        trades.push({ ms, book, t, dl, price, rate: num(tr.rate) });
        if (tr.start && (startMs == null || ms < startMs)) startMs = ms;
      }
      // Son durum: bölünmeler dahil hist'teki son lot
      if (book === 'altin') {
        const h = Array.isArray(b.hist) ? b.hist : [];
        const last = h[h.length - 1];
        if (last) state.altin.ALTIN = { ms: last.ms, lots: last.lots };
      } else if (isObj(b.hist)) {
        for (const [t, h] of Object.entries(b.hist as Record<string, { ms: number; lots: number }[]>)) {
          const last = Array.isArray(h) ? h[h.length - 1] : undefined;
          if (last) state[book][t.toUpperCase()] = { ms: last.ms, lots: last.lots };
        }
      }
    }
    if (startMs != null) {
      notes.push(
        `Takibin başladığı ${istanbulDate(startMs).split('-').reverse().join('.')} günü elindeki lotlar, USD Getiri'deki gibi o günün fiyatıyla alınmış sayıldı. Gerçek alış fiyatlarını biliyorsan o işlemleri varlık sayfasından silip doğrusunu ekleyebilirsin.`,
      );
    }
  }

  // Bir lot durumunu son bilinenle karşılaştırıp fark kadar işlem ekler
  const apply = (book: Book, target: Lots, ms: number, prices: Lots | undefined) => {
    const names = new Set([...Object.keys(state[book]), ...Object.keys(target)]);
    for (const t of names) {
      const C = round(target[t] ?? 0, DEC[book]);
      const last = state[book][t] ?? { ms: 0, lots: 0 };
      if (last.ms > ms) continue;
      const f = last.ms > 0 ? splitFactor(splitsOf(book, t), last.ms, ms) : 1;
      // Bedelsiz oldu ama Ne Alayım'daki lot henüz güncellenmedi: işlem yok
      if (f !== 1 && last.lots > 0 && C === last.lots) {
        state[book][t] = { ms, lots: last.lots * f };
        continue;
      }
      const dl = round(C - last.lots * f, DEC[book]);
      if (dl !== 0) {
        const price = num(prices?.[t]);
        if (!price || price <= 0) {
          skippedNoPrice++;
          continue;
        }
        trades.push({ ms, book, t, dl, price, rate: num(usd?.rates?.[istanbulDate(ms)]) });
      }
      state[book][t] = { ms, lots: C };
    }
  };

  // 2) lot_log: USD Getiri'nin işlemediği kayıtlar (USD Getiri yoksa hepsi; ilki başlangıç)
  if (log) {
    const after = usd ? (num(usd.logMs) ?? num(usd.startMs) ?? 0) : 0;
    const entries = log
      .filter((e) => isObj(e) && num(e.ms) != null && e.ms > after && isObj(e.lots))
      .sort((a, b) => a.ms - b.ms);
    const hasUs = !usd || !!usd.us;
    const hasBes = !usd || !!usd.bes;
    const hasAltin = !usd || !!usd.altin;
    for (const e of entries) {
      apply('bist', cleanLots(e.lots), e.ms, cleanLots(e.prices));
      // Eski kayıtlarda ABD/BES/altın yok: o bölüm için bir şey ifade etmez
      if (e.us && (hasUs || Object.keys(cleanLots(e.us.lots)).length)) {
        apply('us', cleanLots(e.us.lots), e.ms, cleanLots(e.us.prices));
      }
      if (e.bes && (hasBes || Object.keys(cleanLots(e.bes.lots)).length)) {
        apply('bes', cleanLots(e.bes.lots), e.ms, cleanLots(e.bes.prices));
      }
      if (e.altin && (hasAltin || (num(e.altin.adet) ?? 0) > 0)) {
        const fiyat = num(e.altin.fiyat);
        apply('altin', { ALTIN: num(e.altin.adet) ?? 0 }, e.ms, fiyat ? { ALTIN: fiyat } : undefined);
      }
    }
    if (!usd && entries.length) {
      notes.push(
        `İlk kayıttaki (${istanbulDate(entries[0].ms).split('-').reverse().join('.')}) lotlar o günün fiyatıyla alınmış sayıldı; sonraki her lot değişikliği o anki fiyatla alış/satış olarak eklendi.`,
      );
      notes.push(
        'USD Getiri verisi olmadığı için aradaki bedelsizler ayıklanamadı: bedelsizde artan lotlar alış gibi görünebilir. Böyle bir işlem varsa varlık sayfasından silebilirsin.',
      );
    }
  }

  // 3) Ne Alayım'daki güncel lotlar (son fark)
  if (ne) {
    const nowMs = now.getTime();
    const altin = isObj(ne.altin) ? ne.altin : undefined;
    const neBooks: [Book, Lots, Lots | undefined][] = [
      ['bist', cleanLots(ne.lots), cleanLots(ne.lastPrices)],
      ['us', cleanLots(ne.us?.lots), cleanLots(ne.us?.lastPrices)],
      ['bes', cleanLots(ne.bes?.lots), cleanLots(ne.bes?.lastPrices)],
      ['altin', { ALTIN: num(altin?.adet) ?? 0 }, num(altin?.sonFiyat) ? { ALTIN: num(altin?.sonFiyat)! } : undefined],
    ];
    // Eski dosyalarda altın BIST listesinin içinde durabilir
    if (neBooks[0][1].ALTIN != null) {
      neBooks[3][1].ALTIN ||= neBooks[0][1].ALTIN;
      if (neBooks[0][2]?.ALTIN) neBooks[3][2] = { ALTIN: neBooks[0][2].ALTIN };
      delete neBooks[0][1].ALTIN;
    }
    const before = trades.length;
    const hadHistory = before > 0;
    for (const [book, lots, prices] of neBooks) apply(book, lots, nowMs, prices);
    if (trades.length > before) {
      notes.push(
        hadHistory
          ? "Ne Alayım'daki güncel lotlar kayıtlardan farklı olan kalemler bugünkü (son bilinen) fiyatla eklendi."
          : "Ne Alayım'da işlem geçmişi olmadığı için eldeki lotlar bugün, son bilinen fiyatla alınmış sayıldı (maliyet bilinmiyor). Gerçek alış fiyatlarını biliyorsan bu işlemleri silip doğrusunu ekleyebilirsin.",
      );
    }
  }

  if (skippedNoPrice > 0) notes.push(`Fiyatı bilinmeyen ${skippedNoPrice} lot değişikliği atlandı.`);

  // İşlemlere çevir
  const transactions: Transaction[] = [];
  const counts: Partial<Record<Book, number>> = {};
  const ids = new Set<string>();
  let noRate = 0;
  trades.sort((a, b) => a.ms - b.ms || (a.dl > 0 ? 1 : -1) - (b.dl > 0 ? 1 : -1));
  for (const tr of trades) {
    const date = istanbulDate(tr.ms);
    let kind: AssetKind;
    let symbol = tr.t;
    let price = tr.price;
    if (tr.book === 'bist') kind = 'bist';
    else if (tr.book === 'bes') kind = 'bes';
    else if (tr.book === 'us') kind = stockInfo('etf', symbol) && !stockInfo('us', symbol) ? 'etf' : 'us';
    else {
      kind = 'crypto';
      symbol = 'XAUT';
      const rate = tr.rate ?? num(usd?.rates?.[date]) ?? opts.usdTryOn?.(date);
      if (!rate) {
        noRate++;
        continue;
      }
      price = tr.price / rate;
    }
    let id = `scr-${kind}-${symbol}-${tr.ms}`;
    for (let n = 2; ids.has(id); n++) id = `scr-${kind}-${symbol}-${tr.ms}-${n}`;
    ids.add(id);
    transactions.push({
      id,
      kind,
      symbol,
      side: tr.dl > 0 ? 'buy' : 'sell',
      quantity: Math.abs(tr.dl),
      price,
      date,
      createdAt: tr.ms,
    });
    counts[tr.book] = (counts[tr.book] ?? 0) + 1;
  }
  if (noRate > 0) notes.push(`Dolar kuru bilinmediği için ${noRate} altın işlemi atlandı.`);

  // Hedef oranlar: Ne Alayım'ın BIST + altın listesi
  const targets: Record<string, number> = {};
  if (ne) {
    for (const [t, v] of Object.entries(cleanLots(ne.targets))) {
      if (t === 'ALTIN') targets[assetKey('crypto', 'XAUT')] = v;
      else targets[assetKey('bist', t)] = v;
    }
    if (isObj(ne.altin) && ne.altin.listede && (num(ne.altin.hedef) ?? 0) > 0) {
      targets[assetKey('crypto', 'XAUT')] = num(ne.altin.hedef)!;
    }
    const sep = [
      ...Object.values(cleanLots(ne.us?.targets)).filter((v) => v > 0),
      ...Object.values(cleanLots(ne.bes?.targets)).filter((v) => v > 0),
    ];
    if (sep.length && Object.keys(targets).length) {
      notes.push(
        "Ne Alayım'da ABD ve BES hedefleri ayrı hesaplandığı için alınmadı; GENIUS tüm portföyü birlikte dengeler. İstersen Ne alayım? ekranında ekleyebilirsin.",
      );
    }
  }

  const dates = transactions.map((t) => t.date).sort();
  return {
    ok: true,
    data: {
      transactions,
      targets,
      sources,
      notes,
      counts,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
    },
  };
}

/** "BIST 12 · ABD 3 · Altın 2" */
export function describeCounts(counts: Partial<Record<Book, number>>): string {
  return (Object.keys(BOOK_NAMES) as Book[])
    .filter((b) => counts[b])
    .map((b) => `${BOOK_NAMES[b]} ${counts[b]}`)
    .join(' · ');
}
