import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AssetIcon } from '@/components/asset-icon';
import { AlertRow } from '@/components/price-alerts';
import { Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import {
  backgroundAvailable,
  notificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from '@/lib/alert-task';
import { assetKey, displaySymbol, kindInfo } from '@/lib/assets';
import { resolveAssetQuote } from '@/lib/portfolio';

/** Bütün fiyat alarmları, bildirim izni ve arka plan durumu. */
export default function AlertsScreen() {
  const c = useColors();
  const { alerts, holdings, quotes, manualPrices } = usePortfolio();
  const [perm, setPerm] = useState<NotificationPermission>('undetermined');
  const [bg, setBg] = useState<boolean | null>(null);

  useEffect(() => {
    notificationPermission().then(setPerm);
    backgroundAvailable().then(setBg);
  }, []);

  const sorted = [...alerts].sort(
    (a, b) => Number(b.active) - Number(a.active) || (b.triggeredAt ?? b.createdAt) - (a.triggeredAt ?? a.createdAt),
  );
  const priceOf = (kind: Parameters<typeof resolveAssetQuote>[0], symbol: string) =>
    resolveAssetQuote(kind, symbol, quotes, manualPrices)?.price;
  const open = holdings.filter((h) => h.quantity > 0);

  const askPermission = async () => {
    if (perm === 'denied') {
      Linking.openSettings().catch(() => {});
      return;
    }
    await requestNotificationPermission();
    setPerm(await notificationPermission());
  };

  const web = Platform.OS === 'web';
  const status = web
    ? 'Web sürümünde bildirim yok: alarmlar sayfa açıkken kontrol edilir ve uyarı olarak çıkar. Telefonda bildirim gelir.'
    : perm !== 'granted'
      ? 'Bildirim izni verilmedi: alarm çalınca haber veremem.'
      : bg
        ? 'Uygulama açıkken her fiyat yenilemesinde, kapalıyken arka planda kontrol edilir. Arka plan kontrolünün zamanını telefon belirler (en az 15 dakikada bir; iPhone çoğu zaman daha seyrek çalıştırır), bu yüzden anlık değildir.'
        : 'Bu kurulumda arka plan kontrolü yok (ör. Expo Go): alarmlar uygulama açıkken her fiyat yenilemesinde kontrol edilir.';

  return (
    <>
      <Stack.Screen options={{ title: 'Fiyat alarmları' }} />
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
        <View style={[styles.info, { backgroundColor: c.card }]}>
          <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 13, lineHeight: 19 }]}>{status}</Text>
          {!web && perm !== 'granted' && (
            <Pressable
              onPress={askPermission}
              accessibilityRole="button"
              style={({ pressed }) => [styles.ghost, { backgroundColor: c.tintSoft, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[Type.bodyStrong, { color: c.tint }]}>
                {perm === 'denied' ? 'Ayarlar’dan bildirimleri aç' : 'Bildirimlere izin ver'}
              </Text>
            </Pressable>
          )}
        </View>

        {sorted.length > 0 ? (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            {sorted.map((a, i) => (
              <AlertRow key={a.id} alert={a} currentPrice={priceOf(a.kind, a.symbol)} last={i === sorted.length - 1} />
            ))}
          </View>
        ) : (
          <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
            Henüz alarm yok. Aşağıdan bir varlık seç, sayfasındaki &quot;Alarm kur&quot; ile seviyeyi belirle.
          </Text>
        )}

        {open.length > 0 && (
          <>
            <Text style={[Type.overline, styles.section, { color: c.textSecondary }]}>ALARM KUR</Text>
            <View style={styles.chips}>
              {open.map((h) => (
                <Pressable
                  key={h.key}
                  onPress={() => router.push({ pathname: '/asset/[key]', params: { key: assetKey(h.kind, h.symbol) } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${displaySymbol(h.kind, h.symbol)} için alarm kur`}
                  style={({ pressed }) => [styles.chip, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
                  <AssetIcon
                    kind={h.kind}
                    symbol={h.symbol}
                    label={displaySymbol(h.kind, h.symbol)}
                    color={kindInfo(h.kind).color}
                    size={22}
                  />
                  <Text style={[Type.bodyStrong, { color: c.text, fontSize: 14 }]}>
                    {displaySymbol(h.kind, h.symbol)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  info: { borderRadius: Radius.lg, padding: 14, gap: 10 },
  ghost: { alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  card: { borderRadius: Radius.lg, paddingHorizontal: 14, marginTop: 14 },
  empty: { marginTop: 18, paddingHorizontal: 4, lineHeight: 22 },
  section: { marginTop: 22, marginBottom: 8, marginLeft: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
  },
});
