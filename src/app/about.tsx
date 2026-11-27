import Constants from 'expo-constants';
import { Stack, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GeniusLogo } from '@/components/genius-logo';
import { ICONS, LineIcon, SettingsRow, settingsStyles } from '@/components/settings-row';
import { Radius, Type, useColors } from '@/constants/theme';
import { DATA_SOURCES, DISCLAIMER, SITE_URL, SUPPORT_URL } from '@/content/legal';

/** Hakkında: sürüm, yasal uyarı, veri kaynakları, gizlilik ve destek. */
export default function AboutScreen() {
  const c = useColors();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <>
      <Stack.Screen options={{ title: 'Hakkında' }} />
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <GeniusLogo height={34} />
          <Text style={[Type.subhead, { color: c.textSecondary }]}>Portföy takibi · Sürüm {version}</Text>
        </View>

        <View style={[styles.warn, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[Type.overline, { color: c.textSecondary }]}>YATIRIM TAVSİYESİ DEĞİLDİR</Text>
          <Text style={[Type.subhead, styles.warnText, { color: c.text }]}>{DISCLAIMER}</Text>
        </View>

        <View style={[settingsStyles.card, { backgroundColor: c.card, marginTop: 16 }]}>
          <SettingsRow
            icon={<LineIcon d={ICONS.shield} />}
            color="#10B981"
            title="Gizlilik politikası"
            subtitle="Hesap yok, veriler yalnızca cihazında"
            onPress={() => router.push('/privacy')}
          />
          <SettingsRow
            icon={<LineIcon d={ICONS.info} />}
            color="#6366F1"
            title="Destek ve sık sorulanlar"
            subtitle="Yedekleme, gecikmeli fiyatlar, alarmlar"
            onPress={() => void WebBrowser.openBrowserAsync(SUPPORT_URL)}
          />
          <SettingsRow
            icon={<LineIcon d={ICONS.chart} />}
            color="#0EA5E9"
            title="Web sürümü"
            subtitle={SITE_URL.replace('https://', '')}
            onPress={() => void WebBrowser.openBrowserAsync(SITE_URL)}
            last
          />
        </View>

        <Text style={[Type.overline, styles.section, { color: c.textSecondary }]}>VERİ KAYNAKLARI</Text>
        <View style={[styles.card, { backgroundColor: c.card }]}>
          {DATA_SOURCES.map((s, i) => (
            <Pressable
              key={s.name}
              onPress={() => void WebBrowser.openBrowserAsync(s.url)}
              accessibilityRole="link"
              accessibilityLabel={`${s.name}: ${s.use}`}
              style={({ pressed }) => [
                styles.source,
                i < DATA_SOURCES.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: c.border,
                },
                pressed && { opacity: 0.6 },
              ]}>
              <Text style={[Type.bodyStrong, { color: c.text, fontSize: 15 }]}>{s.name}</Text>
              <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12.5 }]}>{s.use}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[Type.subhead, styles.note, { color: c.textTertiary }]}>
          Veriler bu kaynakların herkese açık hizmetlerinden alınır; doğruluğu ve sürekliliği garanti edilmez. Marka ve
          logolar sahiplerine aittir.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  hero: { alignItems: 'center', gap: 8, marginVertical: 18 },
  warn: { borderRadius: Radius.lg, padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  warnText: { fontSize: 13, lineHeight: 19 },
  section: { marginTop: 22, marginBottom: 8, marginLeft: 6 },
  card: { borderRadius: Radius.lg, paddingHorizontal: 14 },
  source: { paddingVertical: 11, gap: 2 },
  note: { fontSize: 11.5, lineHeight: 16, marginTop: 8, paddingHorizontal: 6 },
});
