import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ICONS, LineIcon, SettingsRow, settingsStyles } from '@/components/settings-row';
import { Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { backupFileName, parseBackup } from '@/lib/backup';
import { pickBackupFile, shareBackupFile } from '@/lib/backup-io';
import { confirmAsync, notify } from '@/lib/dialog';

export default function SettingsScreen() {
  const c = useColors();
  const { transactions, exportBackup, importBackup } = usePortfolio();
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    if (transactions.length === 0) return notify('Yedek', 'Portföyünde henüz işlem yok.');
    setBusy(true);
    try {
      await shareBackupFile(exportBackup(), backupFileName());
    } catch (e) {
      notify('Yedek alınamadı', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (mode: 'replace' | 'merge') => {
    setBusy(true);
    try {
      const text = await pickBackupFile();
      if (text == null) return;
      const parsed = parseBackup(text);
      if (!parsed.ok) return notify('Geri yüklenemedi', parsed.error);
      const n = parsed.data.transactions.length;
      const when = parsed.data.exportedAt
        ? ` (${parsed.data.exportedAt.slice(0, 10).split('-').reverse().join('.')})`
        : '';
      const ok =
        mode === 'replace'
          ? await confirmAsync(
              'Yedekten geri yükle',
              `Yedekte ${n} işlem var${when}. Şu anki ${transactions.length} işlem silinip yedektekiler yüklenecek.`,
              'Geri yükle',
              true,
            )
          : await confirmAsync('Yedeği ekle', `Yedekteki ${n} işlemden portföyünde olmayanlar eklenecek.`, 'Ekle');
      if (!ok) return;
      importBackup(parsed.data, mode);
      notify(
        'Tamam',
        `${n} işlem ${mode === 'replace' ? 'yüklendi' : 'birleştirildi'}.` +
          (parsed.skipped ? ` Okunamayan ${parsed.skipped} kayıt atlandı.` : ''),
      );
    } catch (e) {
      notify('Geri yüklenemedi', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Ayarlar' }} />
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
        <Text style={[Type.overline, styles.section, { color: c.textSecondary }]}>YEDEKLEME</Text>
        <View style={[settingsStyles.card, { backgroundColor: c.card }]}>
          <SettingsRow
            icon={<LineIcon d={ICONS.upload} />}
            color="#4F46E5"
            title="Yedeği dışa aktar"
            subtitle="İşlemlerini dosya olarak kaydet: Dosyalar'a (iCloud Drive), AirDrop ya da mesajla"
            onPress={busy ? undefined : doExport}
          />
          <SettingsRow
            icon={<LineIcon d={ICONS.download} />}
            color="#0EA5E9"
            title="Yedekten geri yükle"
            subtitle="Seçtiğin yedek şu anki işlemlerin yerine geçer"
            onPress={busy ? undefined : () => doImport('replace')}
          />
          <SettingsRow
            icon={<LineIcon d={ICONS.merge} />}
            color="#14B8A6"
            title="Yedeği ekle (birleştir)"
            subtitle="Yedekteki işlemlerden portföyünde olmayanları ekler"
            onPress={busy ? undefined : () => doImport('merge')}
            last
          />
        </View>
        <Text style={[Type.subhead, styles.note, { color: c.textTertiary }]}>
          Veriler yalnızca bu cihazda duruyor. Uygulamayı silersen ya da telefon değiştirirsen kaybolmaması için ara
          sıra yedek al.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  section: {
    marginTop: 12,
    marginBottom: 8,
    marginLeft: 6,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    paddingHorizontal: 6,
  },
});
