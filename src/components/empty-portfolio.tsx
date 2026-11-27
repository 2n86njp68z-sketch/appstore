import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { CategoryIcon } from '@/components/asset-icon';
import { useMarketDrawer } from '@/components/market-drawer';
import { Radius, Type, useColors } from '@/constants/theme';
import { kindInfo } from '@/lib/assets';
import type { AssetKind } from '@/lib/types';

/** Boş halkadaki silik dilimler: eklenince halkanın nasıl dolacağını ima eder. */
const GHOSTS: { kind: AssetKind; share: number }[] = [
  { kind: 'bist', share: 0.34 },
  { kind: 'us', share: 0.26 },
  { kind: 'metal', share: 0.22 },
  { kind: 'crypto', share: 0.18 },
];
/** "Hızlı başla" kutucukları: dokununca o türde ekleme ekranı açılır. */
const QUICK: { kind: AssetKind; title: string; sub: string }[] = [
  { kind: 'bist', title: 'Türk Market', sub: 'BIST hisseleri' },
  { kind: 'us', title: 'ABD Market', sub: 'Hisse ve ETF' },
  { kind: 'metal', title: 'Altın', sub: 'Gram, ons, gümüş' },
  { kind: 'crypto', title: 'Kripto', sub: 'Bitcoin, Ethereum' },
];

/** Dilimler arası boşluk (derece). */
const GAP_DEG = 7;

/**
 * Portföy boşken ana ekran: dolu haldeki halkayla aynı boyda boş bir halka, ortasında ₺0,
 * altında küçük "Ekle" düğmesi ve piyasalara göz atma bağlantısı.
 */
export function EmptyPortfolio() {
  const c = useColors();
  const { open } = useMarketDrawer();
  const dark = useColorScheme() === 'dark';
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen - 32, 480);
  const r1 = Math.min(width / 2 - 40, 150);
  const r0 = r1 * 0.72;
  const size = r1 * 2 + 24;
  const mid = (r1 + r0) / 2;
  const stroke = r1 - r0;
  const circ = 2 * Math.PI * mid;
  // Yuvarlak uçlar dilimi her iki yanda yarım kalınlık kadar uzatır; boşluk korunsun diye düşülür.
  const capDeg = ((stroke / 2) * 360) / circ;

  // Hafif açılış: halka büyüyerek, alt kısım kayarak gelir.
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const rise = anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  // Her dilim, kendinden öncekilerin toplam payı kadar dönmüş başlar (saat 12'den, saat yönünde).
  const arcs = GHOSTS.map(({ kind, share }, i) => {
    const before = GHOSTS.slice(0, i).reduce((sum, g) => sum + g.share, 0);
    return { kind, start: -90 + before * 360 + GAP_DEG / 2 + capDeg, sweep: share * 360 - GAP_DEG - 2 * capDeg };
  });

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ opacity: anim, transform: [{ scale }] }}>
        <Pressable
          onPress={() => router.push('/add')}
          accessibilityRole="button"
          accessibilityLabel="Portföy boş. İlk varlığını eklemek için dokun"
          style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            {/* Halka zemini */}
            <Circle cx={size / 2} cy={size / 2} r={mid} stroke={c.chip} strokeWidth={stroke} fill="none" />
            {/* Silik dilimler */}
            {arcs.map((a) => (
              <Circle
                key={a.kind}
                cx={size / 2}
                cy={size / 2}
                r={mid}
                fill="none"
                stroke={kindInfo(a.kind).color}
                strokeOpacity={dark ? 0.42 : 0.18}
                strokeWidth={stroke - 6}
                strokeLinecap="round"
                strokeDasharray={`${(a.sweep / 360) * circ} ${circ}`}
                rotation={a.start}
                origin={`${size / 2}, ${size / 2}`}
              />
            ))}
            {/* İç çizgi: halkayı içten çevreleyen ince hat */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r0 - 10}
              stroke={c.border}
              strokeWidth={1}
              strokeDasharray="2 6"
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
          <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <Text style={[Type.overline, { color: c.textSecondary }]}>TOPLAM DEĞER</Text>
            <Text style={[Type.display, styles.zero, { color: c.text }]}>₺0</Text>
            <View style={[styles.emptyPill, { backgroundColor: c.chip }]}>
              <Text style={[Type.caption, { color: c.textSecondary }]}>Portföyün boş</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.below, { opacity: anim, transform: [{ translateY: rise }] }]}>
        <Pressable
          onPress={() => router.push('/add')}
          accessibilityRole="button"
          accessibilityLabel="Ekle"
          style={({ pressed }) => [
            styles.addPill,
            { backgroundColor: c.tint, shadowColor: c.tint, opacity: pressed ? 0.8 : 1 },
            pressed && { transform: [{ scale: 0.97 }] },
          ]}>
          <View style={styles.plus}>
            <View style={[styles.plusH, { backgroundColor: c.tintText }]} />
            <View style={[styles.plusV, { backgroundColor: c.tintText }]} />
          </View>
          <Text style={[Type.bodyStrong, { color: c.tintText }]}>Ekle</Text>
        </Pressable>

        <Text style={[Type.subhead, styles.hint, { color: c.textSecondary }]}>
          Hisse, fon, kripto, döviz ya da altın ekle; değerini ve kâr/zararını anlık takip et.
        </Text>
      </Animated.View>

      <Animated.View style={[styles.quick, { opacity: anim, transform: [{ translateY: rise }] }]}>
        <View style={styles.quickHeader}>
          <Text style={[Type.overline, { color: c.textSecondary }]}>HIZLI BAŞLA</Text>
          <Pressable onPress={open} hitSlop={8} accessibilityRole="button">
            <Text style={[Type.subhead, styles.link, { color: c.link }]}>Piyasalara göz at ›</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {QUICK.map((q) => (
            <Pressable
              key={q.kind}
              onPress={() => router.push({ pathname: '/add', params: { kind: q.kind } })}
              accessibilityRole="button"
              accessibilityLabel={`${q.title} ekle`}
              style={({ pressed }) => [
                styles.tile,
                { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <CategoryIcon kind={q.kind} size={32} />
              <View style={styles.tileText}>
                <Text style={[Type.bodyStrong, { color: c.text }]} numberOfLines={1}>
                  {q.title}
                </Text>
                <Text style={[Type.subhead, { color: c.textTertiary, fontSize: 12 }]} numberOfLines={1}>
                  {q.sub}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 24,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  zero: {
    fontSize: 40,
    lineHeight: 48,
  },
  emptyPill: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 2,
  },
  below: {
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 24,
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: Radius.pill,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  plus: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusH: {
    position: 'absolute',
    width: 12,
    height: 2,
    borderRadius: 1,
  },
  plusV: {
    position: 'absolute',
    width: 2,
    height: 12,
    borderRadius: 1,
  },
  hint: {
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 16,
    maxWidth: 300,
  },
  link: {
    fontSize: 13,
  },
  quick: {
    alignSelf: 'stretch',
    marginTop: 32,
  },
  quickHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileText: {
    flex: 1,
    minWidth: 0,
  },
});
