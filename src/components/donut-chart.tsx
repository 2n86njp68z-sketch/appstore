import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Font, useColors } from '@/constants/theme';
import {
  hitTest,
  labelCenter,
  layoutLabels,
  layoutSlices,
  roundedArcPath,
  type ChartCategory,
  type DonutHit,
  type DonutSlice,
  type LabelOptions,
} from '@/lib/donut';
import { formatPct } from '@/lib/format';
import type { AssetKind } from '@/lib/types';

const TAU = Math.PI * 2;
/** Açılan dilimlerin dışarı kayma miktarı (px). */
const EXPLODE = 10;
/** Seçili varlık dilimi için ek kayma (px). */
const SELECT_PUSH = 6;
/** Açılan dilimlerin dış kenarının büyüme miktarı (px). */
const GROW = 6;
/** Halkanın dışında yüzde etiketleri için bırakılan boşluk (px). */
const LABEL_SPACE = 40;
const LABEL_HEIGHT = 16;
const CORNER = 5;

/** Etiket yüzdesi: %10 ve üstü tam sayı, altı tek ondalık ("%31", "%8,6"). */
function labelText(pct: number): string {
  return formatPct(pct, { signed: false, decimals: pct >= 9.95 ? 0 : 1 });
}

/** Dokunulan noktanın grafiğe göre konumu. */
function localPoint(e: GestureResponderEvent, el: unknown): { x: number; y: number } {
  const ne = e.nativeEvent as unknown as Record<string, unknown>;
  if (Platform.OS === 'web' && el) {
    // Web'de onPress fare/dokunma olayını olduğu gibi verir; locationX yoktur.
    const rect = (el as HTMLElement).getBoundingClientRect();
    const touch = (ne.changedTouches as { clientX: number; clientY: number }[] | undefined)?.[0];
    const clientX = touch?.clientX ?? (ne.clientX as number);
    const clientY = touch?.clientY ?? (ne.clientY as number);
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  return { x: ne.locationX as number, y: ne.locationY as number };
}

interface Props {
  categories: ChartCategory[];
  openKind?: AssetKind;
  selectedAsset?: string;
  /** Kullanılabilir genişlik; yükseklik halkaya göre hesaplanır. */
  width: number;
  onTap: (hit: DonutHit) => void;
  /** Halkanın ortasında gösterilecek içerik. */
  children?: ReactNode;
}

export function DonutChart({ categories, openKind, selectedAsset, width, onTap, children }: Props) {
  // Yanlarda yüzde yazıları için geniş, üst/altta dar pay bırakılır.
  const outerPush = EXPLODE + SELECT_PUSH + GROW;
  const r1Raw = Math.min(width / 2 - outerPush - LABEL_SPACE, 150);
  const height = Math.ceil(2 * (r1Raw + outerPush + LABEL_HEIGHT + 10));
  const cx = width / 2;
  const cy = height / 2;
  const c = useColors();
  const r1 = r1Raw;
  const r0 = r1 * 0.72;

  // Kapanma animasyonu bitene kadar açık türü göstermeye devam et.
  const [shownKind, setShownKind] = useState(openKind);
  const shownKindRef = useRef(shownKind);
  const [anim] = useState(() => new Animated.Value(openKind ? 1 : 0));
  const viewRef = useRef<ComponentRef<typeof Pressable>>(null);
  const [progress, setProgress] = useState(openKind ? 1 : 0);

  useEffect(() => {
    shownKindRef.current = shownKind;
  }, [shownKind]);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setProgress(value));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    anim.stopAnimation();
    if (openKind) {
      if (openKind !== shownKindRef.current) {
        anim.setValue(0);
        setProgress(0);
        shownKindRef.current = openKind;
        setShownKind(openKind);
      }
      Animated.timing(anim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setShownKind(undefined);
      });
    }
  }, [openKind, anim]);

  const kind = openKind ?? shownKind;
  // Başka bir türe geçilirken ilk karede yeni tür kapalı başlasın.
  const p = openKind && openKind !== shownKind ? 0 : Math.max(0, progress);
  const slices = layoutSlices(categories, kind);
  const baseGap = slices.length > 1 ? 0.03 : 0;

  // Kenar yüzdeleri: görünürlük son (açılmış) konuma göre seçilir, konum animasyonla kayar.
  const pctById: Record<string, number> = {};
  for (const cat of categories) {
    pctById[cat.kind] = cat.pct;
    for (const a of cat.assets) pctById[a.key] = a.pct;
  }
  const labelOpts: LabelOptions = {
    cx,
    cy,
    radius: r1,
    gap: 6,
    height: LABEL_HEIGHT,
    charWidth: 7.2,
    minPct: 2,
  };
  const pushFor = (s: DonutSlice, t: number) =>
    s.expanded ? (EXPLODE + GROW) * t + (s.assetKey === selectedAsset ? SELECT_PUSH : 0) : 0;
  const labels = layoutLabels(slices, pctById, labelText, { ...labelOpts, push: (s) => pushFor(s, 1) });
  const sliceById = new Map(slices.map((s) => [s.id, s]));

  return (
    <Pressable
      ref={viewRef}
      onPress={(e) => {
        const { x, y } = localPoint(e, viewRef.current);
        onTap(hitTest(slices, x, y, cx, cy, r0, r1));
      }}
      accessibilityRole="button"
      accessibilityLabel="Portföy dağılım grafiği"
      style={{ width, height }}>
      <View style={[StyleSheet.absoluteFill, styles.noTouch]}>
        <Svg width={width} height={height}>
          {slices.map((s) => {
            const span = s.end - s.start;
            const full = span >= TAU - 1e-6;
            const gap = Math.min(s.expanded ? baseGap + 0.035 * p : baseGap, span * 0.3);
            let ox = cx;
            let oy = cy;
            let outer = r1;
            if (s.expanded && !full) {
              const mid = (s.start + s.end) / 2;
              const push = EXPLODE * p + (s.assetKey === selectedAsset ? SELECT_PUSH : 0);
              ox += Math.sin(mid) * push;
              oy -= Math.cos(mid) * push;
              outer = r1 + GROW * p;
            }
            let opacity = 1;
            if (kind && !s.expanded) opacity = 1 - 0.75 * Math.min(p, 1);
            else if (selectedAsset && s.expanded && s.assetKey !== selectedAsset) opacity = 0.5;
            return (
              <Path
                key={s.id}
                d={roundedArcPath(ox, oy, r0, outer, s.start + gap / 2, s.end - gap / 2, CORNER)}
                fill={s.color}
                opacity={opacity}
              />
            );
          })}
        </Svg>
      </View>
      {labels.map((l) => {
        const s = sliceById.get(l.id)!;
        const pos = labelCenter(s, l.width, { ...labelOpts, push: (x) => pushFor(x, p) });
        const opacity = kind ? (s.expanded ? Math.min(1, p) : 0) : 1;
        return (
          <Text
            key={l.id}
            numberOfLines={1}
            style={[
              styles.label,
              styles.noTouch,
              {
                left: pos.x - l.width / 2,
                top: pos.y - LABEL_HEIGHT / 2,
                width: l.width,
                color: c.textSecondary,
                opacity,
              },
            ]}>
            {l.text}
          </Text>
        );
      })}
      <View style={[StyleSheet.absoluteFill, styles.center, styles.noTouch]}>
        <View style={{ width: r0 * 1.6, alignItems: 'center' }}>{children}</View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  noTouch: {
    // Dokunuşlar her zaman dıştaki Pressable'a gitsin; konum ona göre ölçülsün.
    pointerEvents: 'none',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    height: LABEL_HEIGHT,
    lineHeight: LABEL_HEIGHT,
    textAlign: 'center',
    fontFamily: Font.bold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
