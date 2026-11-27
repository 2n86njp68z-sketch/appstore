import * as Clipboard from 'expo-clipboard';
import { Stack, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui';
import { Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { pickJsonFiles } from '@/lib/backup-io';
import { confirmAsync, notify } from '@/lib/dialog';
import { formatNumber } from '@/lib/format';
import { SCRIPTABLE_EXPORT_SCRIPT } from '@/lib/scriptable-export-script';
import { describeCounts, parseScriptableTexts, type ScriptableImport } from '@/lib/scriptable-import';

const trDate = (iso?: string) => (iso ? iso.split('-').reverse().join('.') : '');

/** Scriptable'daki Ne Alayım ve USD Getiri verilerini aktarma. */
export default function ImportScriptableScreen() {
  const c = useColors();
  const { transactions, importTransactions, usdTryOn } = usePortfolio();
  const [data, setData] = useState<ScriptableImport | null>(null);
  const [withTargets, setWithTargets] = useState(true);
  const [busy, setBusy] = useState(false);

  const copyScript = async () => {
    try {
      await Clipboard.setStringAsync(SCRIPTABLE_EXPORT_SCRIPT);
      notify('Kopyalandı', "Scriptable'da sağ üstteki + ile yeni script aç, yapıştır ve ▶︎ ile çalıştır.");
    } catch (e) {
      notify('Kopyalanamadı', e instanceof Error ? e.message : String(e));
    }
  };

  const pick = async () => {
    setBusy(true);
    try {
      const texts = await pickJsonFiles();
      if (!texts) return;
      const parsed = parseScriptableTexts(texts, { usdTryOn });
      if (!parsed.ok) return notify('Aktarılamadı', parsed.error);
      if (parsed.data.transactions.length === 0 && Object.keys(parsed.data.targets).length === 0) {
        return notify('Aktarılacak bir şey yok', 'Dosyalarda lot ya da hedef oran bulunamadı.');
      }
      setData(parsed.data);
    } catch (e) {
      notify('Aktarılamadı', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const run = async (mode: 'merge' | 'replace') => {
    if (!data) return;
    const n = data.transactions.length;
    if (mode === 'replace' && transactions.length > 0) {
      const ok = await confirmAsync(
        'Portföyün yerine koy',
        `Şu anki ${transactions.length} işlem silinip Scriptable'dan gelen ${n} işlem yüklenecek.`,
        'Yerine koy',
        true,
      );
      if (!ok) return;
    }
    importTransactions(data.transactions, mode, withTargets ? data.targets : undefined);
    notify(
      'Aktarıldı',
      `${n} işlem ${mode === 'replace' ? 'yüklendi' : 'eklendi'}` +
        (withTargets && Object.keys(data.targets).length ? ', hedef oranlar alındı.' : '.'),
    );
    router.dismissTo('/');
  };

  const targetEntries = data ? Object.entries(data.targets).sort((a, b) => b[1] - a[1]) : [];

  return (
    <>
      <Stack.Screen options={{ title: "Scriptable'dan aktar" }} />
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
        <Text style={[Type.body, { color: c.textSecondary }]}>
          Ne Alayım ve USD Getiri scriptlerindeki lotlarını, alım-satım geçmişini ve hedef oranlarını GENIUS&apos;a
          taşı. Scriptlerine dokunulmaz, yalnız okunur.
        </Text>

        <Step n={1} title="Aktarma scriptini kopyala">
          <Text style={[Type.subhead, styles.stepText, { color: c.textSecondary }]}>
            Scriptable&apos;da + ile yeni script aç, yapıştır ve çalıştır. Ne Alayım ile aynı Scriptable&apos;da olmalı.
          </Text>
          <Pressable
            onPress={copyScript}
            accessibilityRole="button"
            style={({ pressed }) => [styles.ghost, { backgroundColor: c.tintSoft, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[Type.bodyStrong, { color: c.tint }]}>Scripti kopyala</Text>
          </Pressable>
        </Step>

        <Step n={2} title="Dosyayı kaydet">
          <Text style={[Type.subhead, styles.stepText, { color: c.textSecondary }]}>
            Script &quot;Kaydet&quot; deyince açılan pencereden iCloud Drive&apos;ı (ya da iPhone&apos;umda bir klasörü)
            seç. GENIUS-scriptable-…json adlı dosya oluşur.
          </Text>
        </Step>

        <Step n={3} title="Dosyayı seç" last>
          <Text style={[Type.subhead, styles.stepText, { color: c.textSecondary }]}>
            Kaydettiğin dosyayı seç. Dosyalar uygulamasında ne_alayim.json, lot_log.json ve usd_getiri.json&apos;u
            buluyorsan onları da doğrudan (birlikte) seçebilirsin.
          </Text>
          <Pressable
            onPress={busy ? undefined : pick}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.ghost,
              { backgroundColor: c.tintSoft, opacity: pressed || busy ? 0.7 : 1 },
            ]}>
            <Text style={[Type.bodyStrong, { color: c.tint }]}>Dosyayı seç</Text>
          </Pressable>
        </Step>

        {data && (
          <View style={[styles.preview, { backgroundColor: c.card }]}>
            <Text style={[Type.overline, { color: c.textSecondary }]}>AKTARILACAKLAR</Text>
            <Text style={[Type.title, { color: c.text, marginTop: 6 }]}>{data.transactions.length} işlem</Text>
            {data.transactions.length > 0 && (
              <Text style={[Type.subhead, { color: c.textSecondary }]}>
                {describeCounts(data.counts)} · {trDate(data.firstDate)}
                {data.lastDate !== data.firstDate ? ` – ${trDate(data.lastDate)}` : ''}
              </Text>
            )}
            {targetEntries.length > 0 && (
              <>
                <Text style={[Type.overline, styles.previewHead, { color: c.textSecondary }]}>HEDEF ORANLAR</Text>
                <View style={styles.chips}>
                  {targetEntries.map(([k, v]) => (
                    <View key={k} style={[styles.chip, { backgroundColor: c.chip }]}>
                      <Text style={[Type.caption, { color: c.text }]}>
                        {k.split(':')[1] === 'XAUT' ? 'Altın (XAUT)' : k.split(':')[1]} %{formatNumber(v, 0, 1)}
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.switchRow}>
                  <Text style={[Type.body, { color: c.text, flex: 1 }]}>Hedef oranları da al</Text>
                  <Switch
                    value={withTargets}
                    onValueChange={setWithTargets}
                    trackColor={{ true: c.tint }}
                    accessibilityLabel="Hedef oranları da al"
                  />
                </View>
              </>
            )}
            <Text style={[Type.overline, styles.previewHead, { color: c.textSecondary }]}>OKUNAN</Text>
            {data.sources.map((s) => (
              <Text key={s} style={[Type.subhead, styles.line, { color: c.textSecondary }]}>
                • {s}
              </Text>
            ))}
            {data.notes.length > 0 && (
              <>
                <Text style={[Type.overline, styles.previewHead, { color: c.textSecondary }]}>NOTLAR</Text>
                {data.notes.map((s) => (
                  <Text key={s} style={[Type.subhead, styles.line, { color: c.textSecondary }]}>
                    • {s}
                  </Text>
                ))}
              </>
            )}
            <View style={styles.actions}>
              {transactions.length === 0 ? (
                <PrimaryButton label="Aktar" onPress={() => run('replace')} />
              ) : (
                <>
                  <PrimaryButton label="Portföye ekle" onPress={() => run('merge')} />
                  <Pressable onPress={() => run('replace')} accessibilityRole="button" hitSlop={6}>
                    <Text style={[Type.bodyStrong, styles.replace, { color: c.negative }]}>Portföyün yerine koy</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Step({ n, title, children, last }: { n: number; title: string; children: ReactNode; last?: boolean }) {
  const c = useColors();
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.num, { backgroundColor: c.tint }]}>
          <Text style={[Type.bodyStrong, { color: '#FFFFFF', fontSize: 14 }]}>{n}</Text>
        </View>
        {!last && <View style={[styles.railLine, { backgroundColor: c.border }]} />}
      </View>
      <View style={styles.stepBody}>
        <Text style={[Type.headline, { color: c.text }]}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 56 },
  step: { flexDirection: 'row', gap: 12, marginTop: 18 },
  rail: { alignItems: 'center', width: 28 },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  railLine: { width: 2, flex: 1, marginTop: 6, marginBottom: -12, borderRadius: 1 },
  stepBody: { flex: 1, gap: 6, paddingTop: 3 },
  stepText: { fontSize: 13, lineHeight: 19 },
  ghost: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 4,
  },
  preview: { borderRadius: Radius.lg, padding: 16, marginTop: 24 },
  previewHead: { marginTop: 16, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  line: { fontSize: 12.5, lineHeight: 18, marginBottom: 4 },
  actions: { marginTop: 18, gap: 12, alignItems: 'stretch' },
  replace: { textAlign: 'center', fontSize: 15 },
});
