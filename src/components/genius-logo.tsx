import { useId } from 'react';
import { useColorScheme, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { LOGO_ACCENT, LOGO_ASPECT, LOGO_FG, LOGO_SKEW, LOGO_VIEWBOX } from '@/components/genius-logo-paths';

/**
 * GENIUS logosu: hafif italik, kalın harfler (gece beyaz, gündüz siyah); G'nin çubuğu ve yukarı ok
 * şeklindeki I mor-eflatun renkte.
 */
export function GeniusLogo({ height = 28 }: { height?: number }) {
  const dark = useColorScheme() === 'dark';
  const id = 'genius' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="GENIUS" style={{ paddingHorizontal: 4 }}>
      <Svg width={height * LOGO_ASPECT} height={height} viewBox={LOGO_VIEWBOX}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#4F46E5" />
            <Stop offset="1" stopColor="#A855F7" />
          </LinearGradient>
        </Defs>
        <G transform={`skewX(${LOGO_SKEW})`}>
          <Path d={LOGO_FG} fill={dark ? '#FFFFFF' : '#000000'} />
          <Path d={LOGO_ACCENT} fill={`url(#${id})`} />
        </G>
      </Svg>
    </View>
  );
}
