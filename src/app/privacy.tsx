import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Type, useColors } from '@/constants/theme';
import { DATA_SOURCES, PRIVACY_SECTIONS } from '@/content/legal';

/** Gizlilik politikası (web'deki privacy.html ile aynı metin). */
export default function PrivacyScreen() {
  const c = useColors();
  return (
    <>
      <Stack.Screen options={{ title: 'Gizlilik politikası' }} />
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
        {PRIVACY_SECTIONS.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={[Type.headline, styles.h, { color: c.text }]} accessibilityRole="header">
              {s.title}
            </Text>
            {s.paragraphs.map((p, i) => (
              <Text key={i} style={[Type.body, styles.p, { color: c.textSecondary }]}>
                {p}
              </Text>
            ))}
          </View>
        ))}
        <View style={styles.section}>
          <Text style={[Type.headline, styles.h, { color: c.text }]} accessibilityRole="header">
            Veri kaynakları
          </Text>
          {DATA_SOURCES.map((d) => (
            <Text key={d.name} style={[Type.body, styles.li, { color: c.textSecondary }]}>
              • {d.name}: {d.use}
            </Text>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 56 },
  section: { marginTop: 16, gap: 8 },
  h: { fontSize: 17 },
  p: { fontSize: 14.5, lineHeight: 21 },
  li: { fontSize: 14, lineHeight: 20 },
});
