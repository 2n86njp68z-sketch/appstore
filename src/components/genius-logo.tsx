import { StyleSheet, Text, useColorScheme } from 'react-native';

import { Font } from '@/constants/theme';

/** Uygulamanın adı, logo olarak: Unbounded Black; gece modunda beyaz, gündüz siyah. */
export function GeniusLogo({ size = 22 }: { size?: number }) {
  const dark = useColorScheme() === 'dark';
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="GENIUS"
      numberOfLines={1}
      style={[styles.logo, { fontSize: size, letterSpacing: size * 0.06, color: dark ? '#FFFFFF' : '#000000' }]}>
      GENIUS
    </Text>
  );
}

const styles = StyleSheet.create({
  logo: {
    fontFamily: Font.logo,
    includeFontPadding: false,
    // Sol menü düğmesine yapışmasın
    paddingHorizontal: 4,
  },
});
