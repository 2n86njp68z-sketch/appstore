import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Radius, Type, useColors } from '@/constants/theme';

/** Ayarlar listesinde bir satır: renkli simge kutusu, başlık, açıklama ve ok. */
export function SettingsRow({
  icon,
  color,
  title,
  subtitle,
  onPress,
  last,
  right,
  destructive,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  last?: boolean;
  right?: ReactNode;
  destructive?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
        pressed && { opacity: 0.6 },
      ]}>
      <View style={[styles.icon, { backgroundColor: color }]}>{icon}</View>
      <View style={styles.text}>
        <Text style={[Type.bodyStrong, { color: destructive ? c.negative : c.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path
              d="M9 5 L16 12 L9 19"
              stroke={c.textTertiary}
              strokeWidth={2.6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null)}
    </Pressable>
  );
}

/** Ayarlar satırlarında kullanılan basit beyaz çizgi simgeleri (24×24). */
export function LineIcon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} stroke="#FFFFFF" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export const ICONS = {
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  merge: 'M6 4v6a6 6 0 0 0 6 6h6M14 12l4 4-4 4M6 20v-2',
  scale: 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  import: 'M4 12h12M12 8l4 4-4 4M20 4v16',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  widget: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chart: 'M4 19h16M6 15l4-4 3 3 5-6',
} as const;

export const settingsStyles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
  },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
