/**
 * Gizlilik politikası ve destek sayfalarını üretir (App Store Connect'teki gizlilik ve destek bağlantıları).
 * Kullanım: npx tsx scripts/build-legal-html.ts <çıktı klasörü>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { privacyHtml, supportHtml } from '../src/content/legal-html';

const out = process.argv[2] ?? 'site';
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'privacy.html'), privacyHtml());
writeFileSync(join(out, 'support.html'), supportHtml());
console.log(`privacy.html ve support.html → ${out}`);
