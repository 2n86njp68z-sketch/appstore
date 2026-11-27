import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DATA_SOURCES, DISCLAIMER, PRIVACY_SECTIONS, PRIVACY_URL, SUPPORT_URL } from '../src/content/legal';
import { privacyHtml, supportHtml } from '../src/content/legal-html';

test('gizlilik sayfası: bütün bölümler, kaynaklar ve uyarı; HTML kaçışlı', () => {
  const html = privacyHtml();
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('lang="tr"') && html.includes('prefers-color-scheme: dark'));
  for (const s of PRIVACY_SECTIONS) assert.ok(html.includes(`<h2>${s.title}</h2>`), s.title);
  for (const d of DATA_SOURCES) assert.ok(html.includes(d.url), d.name);
  assert.ok(html.includes('yatırım tavsiyesi değildir'));
  // Kesme işareti kaçışsız da geçerli; < ve > yok
  assert.ok(!/<p>[^<]*[<>][^<]*<\/p>/.test(html));
  assert.ok(DISCLAIMER.includes('yatırım danışmanlığı kapsamında değildir'));
});

test('destek sayfası ve bağlantılar', () => {
  const html = supportHtml();
  assert.ok(html.includes('Sık sorulanlar') && html.includes('./privacy.html'));
  assert.ok(PRIVACY_URL.endsWith('/privacy.html') && SUPPORT_URL.endsWith('/support.html'));
});
