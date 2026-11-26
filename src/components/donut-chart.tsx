import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { arcPath, hitTest, layoutSlices, type ChartCategory, type DonutHit } from '@/lib/donut';
import type { AssetKind } from '@/lib/types';

const TAU = Math.PI * 2;
/** Açılan dilimlerin dışarı kayma miktarı (px). */
const EXPLODE = 10;
/** Seçili varlık dilimi için ek kayma (px). */
const SELECT_PUSH = 6;

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
  size: number;
  onTap: (hit: DonutHit) => void;
  /** Halkanın ortasında gösterilecek içerik. */
  children?: ReactNode;
}

export function DonutChart({ categories, openKind, selectedAsset, size, onTap, children }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r1 = size / 2 - EXPLODE - SELECT_PUSH - 8;
  const r0 = r1 * 0.68;

  // Kapanma animasyonu bitene kadar açık türü göstermeye devam et.
  const [shownKind, setShownKind] = useState(openKind);
  const shownKindRef = useRef(shownKind);
  shownKindRef.current = shownKind;
  const anim = useRef(new Animated.Value(openKind ? 1 : 0)).current;
  const viewRef = useRef<ComponentRef<typeof Pressable>>(null);
  const [progress, setProgress] = useState(openKind ? 1 : 0);

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
  const baseGap = slices.length > 1 ? 0.022 : 0;

  return (
    <Pressable
      ref={viewRef}
      onPress={(e) => {
        const { x, y } = localPoint(e, viewRef.current);
        onTap(hitTest(slices, x, y, cx, cy, r0, r1));
      }}
      accessibilityRole="button"
      accessibilityLabel="Portföy dağılım grafiği"
      style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, styles.noTouch]}>
        <Svg width={size} height={size}>
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
              outer = r1 + 6 * p;
            }
            let opacity = 1;
            if (kind && !s.expanded) opacity = 1 - 0.75 * Math.min(p, 1);
            else if (selectedAsset && s.expanded && s.assetKey !== selectedAsset) opacity = 0.5;
            return (
              <Path
                key={s.id}
                d={arcPath(ox, oy, r0, outer, s.start + gap / 2, s.end - gap / 2)}
                fill={s.color}
                opacity={opacity}
              />
            );
          })}
        </Svg>
      </View>
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
});
