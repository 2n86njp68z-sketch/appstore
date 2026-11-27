/**
 * Scriptable'da çalıştırılan küçük script: Ne Alayım ve USD Getiri'nin dosyalarını (ne_alayim.json,
 * lot_log.json, usd_getiri.json) tek dosyada toplar ve kaydetme penceresiyle Dosyalar'a (iCloud Drive)
 * kaydettirir. GENIUS bu dosyayı "Scriptable'dan aktar" ile okur. Uygulamadan panoya kopyalanır.
 */
export const SCRIPTABLE_EXPORT_SCRIPT = `// GENIUS'a aktar — Scriptable
// Ne Alayım ve USD Getiri scriptlerinin verilerini tek dosyada toplar.
// Çalıştırınca kaydetme penceresi açılır: iCloud Drive ya da iPhone'umda bir
// klasör seç. Sonra GENIUS > Ayarlar > Scriptable'dan aktar ile bu dosyayı seç.
// Hiçbir veriyi değiştirmez, yalnız okur.

const FILES = { neAlayim: "ne_alayim.json", lotLog: "lot_log.json", usdGetiri: "usd_getiri.json" };

async function read(name) {
  const mans = [FileManager.local()];
  try { mans.push(FileManager.iCloud()); } catch (e) {}
  for (const fm of mans) {
    try {
      const p = fm.joinPath(fm.documentsDirectory(), name);
      if (!fm.fileExists(p)) continue;
      if (fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p)) await fm.downloadFileFromiCloud(p);
      return JSON.parse(fm.readString(p));
    } catch (e) {}
  }
  return null;
}

const out = { app: "GENIUS-Scriptable", version: 1, exportedAt: new Date().toISOString() };
const found = [];
for (const [key, name] of Object.entries(FILES)) {
  out[key] = await read(name);
  if (out[key] != null) found.push(name);
}

const a = new Alert();
if (!found.length) {
  a.title = "Veri bulunamadı";
  a.message = "ne_alayim.json, lot_log.json ve usd_getiri.json bulunamadı. Bu scripti Ne Alayım ile aynı Scriptable'da çalıştır.";
  a.addAction("Tamam");
  await a.presentAlert();
} else {
  a.title = "GENIUS'a aktar";
  a.message = "Bulunan: " + found.join(", ") + "\\n\\nŞimdi dosyayı kaydedeceğin yeri seç (ör. iCloud Drive). Sonra GENIUS > Ayarlar > Scriptable'dan aktar ile bu dosyayı seç.";
  a.addAction("Kaydet");
  a.addCancelAction("Vazgeç");
  if ((await a.presentAlert()) === 0) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = "GENIUS-scriptable-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".json";
    await DocumentPicker.exportString(JSON.stringify(out), name);
  }
}
Script.complete();
`;
