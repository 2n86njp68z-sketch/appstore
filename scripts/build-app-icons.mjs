// Uygulama simgelerini üretir: assets/icon.png (iOS), splash-icon.png, Android uyarlanabilir simge
// parçaları ve favicon.png. Simge: koyu lacivert-mor zemin üstünde logodaki italik "G"; ortadaki çubuk
// logodaki gibi mor renk geçişli.
//
// Kullanım (Playwright gerekir; çizim tarayıcıda yapılır):
//   node scripts/build-app-icons.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// G'nin çizgileri logo dosyasından: dış kavis ve renkli çubuk ayrı
const paths = readFileSync(new URL('../src/components/genius-logo-paths.ts', import.meta.url), 'utf8');
const fg = paths.match(/LOGO_FG =\s*'([^']*)'/)[1];
const accent = paths.match(/LOGO_ACCENT =\s*'([^']*)'/)[1];
const gOuter = fg.slice(0, fg.indexOf('M', 1));
const gBar = accent.slice(0, accent.indexOf('M', 1));

// İtalik "G": yerleşimi tarayıcıda ölçülerek ortalanır (data-scale: simgedeki genişlik/yükseklik oranı).
function gMark({ scale, fill, barGradient = true }) {
  const bar = barGradient ? 'url(#acc)' : fill;
  return `<g class="mark" data-scale="${scale}"><g transform="skewX(-10)"><path d="${gOuter}" fill="${fill}"/><path d="${gBar}" fill="${bar}"/></g></g>`;
}

const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E1B4B"/><stop offset="0.55" stop-color="#0F0C29"/><stop offset="1" stop-color="#05040F"/></linearGradient>
  <radialGradient id="glow" cx="30%" cy="22%" r="75%"><stop offset="0" stop-color="#7C5CFF" stop-opacity="0.55"/><stop offset="1" stop-color="#7C5CFF" stop-opacity="0"/></radialGradient>
  <linearGradient id="acc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#6366F1"/><stop offset="1" stop-color="#C084FC"/></linearGradient>
</defs>`;

const svg = (size, body, bg = true) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}
${bg ? `<rect width="${size}" height="${size}" fill="url(#bg)"/><rect width="${size}" height="${size}" fill="url(#glow)"/>` : ''}${body}</svg>`;

const outputs = [
  // iOS: tam kare, saydamlık yok (köşeleri iOS yuvarlar)
  { file: 'assets/icon.png', size: 1024, svg: svg(1024, gMark({ scale: 0.58, fill: '#FFFFFF' })) },
  // Açılış ekranı: koyu zemin üstünde (app.json backgroundColor) saydam G
  { file: 'assets/splash-icon.png', size: 512, svg: svg(512, gMark({ scale: 0.9, fill: '#FFFFFF' }), false), transparent: true },
  // Android uyarlanabilir simge: güvenli alan ortadaki %66
  { file: 'assets/android-icon-foreground.png', size: 512, svg: svg(512, gMark({ scale: 0.44, fill: '#FFFFFF' }), false), transparent: true },
  { file: 'assets/android-icon-background.png', size: 512, svg: svg(512, '') },
  { file: 'assets/android-icon-monochrome.png', size: 432, svg: svg(432, gMark({ scale: 0.44, fill: '#FFFFFF', barGradient: false }), false), transparent: true },
  { file: 'assets/favicon.png', size: 48, svg: svg(48, gMark({ scale: 0.66, fill: '#FFFFFF' })) },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const o of outputs) {
  await page.setViewportSize({ width: o.size, height: o.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${o.svg}</body></html>`);
  // G'yi sınır kutusuna göre ortala ve ölçekle (optik denge için çok az yukarıda)
  await page.evaluate((size) => {
    for (const g of document.querySelectorAll('g.mark')) {
      const box = g.getBBox();
      const k = (size * Number(g.dataset.scale)) / Math.max(box.width, box.height);
      const tx = size / 2 - (box.x + box.width / 2) * k;
      const ty = size / 2 - (box.y + box.height / 2) * k - size * 0.01;
      g.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    }
  }, o.size);
  await page.locator('svg').screenshot({ path: o.file, omitBackground: Boolean(o.transparent) });
  console.log(o.file, `${o.size}×${o.size}`);
}
await browser.close();
