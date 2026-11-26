import { BIST_STOCKS, type BistStock } from '../data/bist';

export { BIST_STOCKS };
export type { BistStock };

const BY_CODE = new Map(BIST_STOCKS.map((s) => [s.code, s]));

export function bistInfo(code: string): BistStock | undefined {
  return BY_CODE.get(code);
}

/** Aramada Türkçe harf farkını yok sayar: "türk" = "TURK", "İŞ" = "IS". */
export function foldForSearch(text: string): string {
  return text
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

const FOLDED = BIST_STOCKS.map((s) => ({
  stock: s,
  code: foldForSearch(s.code),
  name: foldForSearch(s.name),
  words: foldForSearch(s.name).split(' '),
}));

/**
 * Kod veya şirket adına göre arar. Sıralama: kodu tam eşleşen, kodu böyle başlayan, adındaki bir
 * kelime böyle başlayan, adında geçen.
 */
export function searchBist(query: string, list: readonly BistStock[] = BIST_STOCKS): BistStock[] {
  const q = foldForSearch(query);
  if (!q) return [...list];
  const allowed = list === BIST_STOCKS ? null : new Set(list.map((s) => s.code));
  const scored: { stock: BistStock; score: number }[] = [];
  for (const f of FOLDED) {
    if (allowed && !allowed.has(f.stock.code)) continue;
    let score = -1;
    if (f.code === q) score = 0;
    else if (f.code.startsWith(q)) score = 1;
    else if (f.name.startsWith(q) || f.words.some((w) => w.startsWith(q))) score = 2;
    else if (f.code.includes(q) || f.name.includes(q)) score = 3;
    if (score >= 0) scored.push({ stock: f.stock, score });
  }
  scored.sort((a, b) => a.score - b.score || a.stock.code.localeCompare(b.stock.code));
  return scored.map((s) => s.stock);
}

/** Simge adayları: sitenin büyük simgesi, sitenin simgesinin Google'daki büyük kopyası, favicon. */
export function logoCandidates(website: string): string[] {
  const host = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return [
    `https://${host}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
    `https://${host}/favicon.ico`,
  ];
}
