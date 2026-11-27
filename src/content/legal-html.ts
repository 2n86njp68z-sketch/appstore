import {
  DATA_SOURCES,
  DISCLAIMER,
  LEGAL_UPDATED,
  PRIVACY_SECTIONS,
  SUPPORT_SECTIONS,
  type LegalSection,
} from './legal';

/** Yasal metinlerin tek başına açılan HTML sayfaları (GitHub Pages'te privacy.html, support.html). */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sections = (list: LegalSection[]) =>
  list.map((s) => `<h2>${esc(s.title)}</h2>\n${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}`).join('\n');

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · GENIUS</title>
<style>
:root{--bg:#ffffff;--text:#111317;--muted:#4b5563;--card:#f6f7f9;--tint:#4f46e5}
@media (prefers-color-scheme: dark){:root{--bg:#000000;--text:#f3f4f6;--muted:#9ca3af;--card:#111317;--tint:#818cf8}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:19px;margin:28px 0 6px}
p,li{color:var(--muted)}a{color:var(--tint)}
.brand{font-weight:900;font-style:italic;letter-spacing:.5px;color:var(--tint)}
.note{background:var(--card);border-radius:14px;padding:14px 16px;margin-top:20px}
.updated{font-size:14px;color:var(--muted)}
</style>
</head>
<body><main>
<div class="brand">GENIUS</div>
<h1>${esc(title)}</h1>
<div class="updated">Son güncelleme: ${esc(LEGAL_UPDATED)}</div>
${body}
</main></body></html>
`;
}

export function privacyHtml(): string {
  const sources = `<h2>Veri kaynakları</h2>\n<ul>\n${DATA_SOURCES.map(
    (d) => `<li><a href="${esc(d.url)}">${esc(d.name)}</a>: ${esc(d.use)}</li>`,
  ).join('\n')}\n</ul>`;
  return page(
    'Gizlilik politikası',
    `${sections(PRIVACY_SECTIONS)}\n${sources}\n<div class="note">${esc(DISCLAIMER)}</div>`,
  );
}

export function supportHtml(): string {
  return page(
    'Destek',
    `${sections(SUPPORT_SECTIONS)}\n<p><a href="./privacy.html">Gizlilik politikası</a> · <a href="./">Web sürümü</a></p>\n<div class="note">${esc(DISCLAIMER)}</div>`,
  );
}
