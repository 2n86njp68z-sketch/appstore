import { useColorScheme, type TextStyle } from 'react-native';

/**
 * Renkler. Gündüz beyaz, gece siyah zemin; telefonun açık/koyu ayarını takip eder.
 * - tint: dolgulu düğmeler ve vurgular, link: yazı halindeki bağlantılar
 * - positive/negative: kâr/zarar yazıları; *Soft: arka plan rozetleri; buy/sell: düğme dolguları
 */
export const Colors = {
  light: {
    background: '#FFFFFF',
    card: '#F6F7F9',
    chip: '#EEF0F4',
    border: '#E9EBF0',
    text: '#0B1220',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    tint: '#4F46E5',
    tintText: '#FFFFFF',
    tintSoft: '#EEF0FF',
    link: '#4F46E5',
    positive: '#059669',
    positiveSoft: '#E6F6EF',
    negative: '#E11D48',
    negativeSoft: '#FDECEF',
    buy: '#059669',
    sell: '#E11D48',
    warning: '#B45309',
    warningBg: '#FEF3C7',
  },
  dark: {
    background: '#000000',
    card: '#111317',
    chip: '#1C1F25',
    border: '#23262D',
    text: '#F3F4F6',
    textSecondary: '#9CA3AF',
    textTertiary: '#6B7280',
    tint: '#6366F1',
    tintText: '#FFFFFF',
    tintSoft: '#1E1F3A',
    link: '#A5B4FC',
    positive: '#34D399',
    positiveSoft: '#0D2A20',
    negative: '#FB7185',
    negativeSoft: '#3A121B',
    buy: '#059669',
    sell: '#E11D48',
    warning: '#FBBF24',
    warningBg: '#3A2E10',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };

export function useColors(): ThemeColors {
  const scheme = useColorScheme();
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}

/** Kâr yeşil, zarar kırmızı, sıfır nötr. */
export function pnlColor(colors: ThemeColors, value: number | undefined, neutral = colors.textSecondary): string {
  if (value == null || Math.abs(value) < 0.005) return neutral;
  return value > 0 ? colors.positive : colors.negative;
}

/** Kâr/zarar rozetinin arka planı. */
export function pnlSoft(colors: ThemeColors, value: number | undefined): string {
  if (value == null || Math.abs(value) < 0.005) return colors.chip;
  return value > 0 ? colors.positiveSoft : colors.negativeSoft;
}

/** Yazı tipi: Manrope (₺, Türkçe harfler ve hizalı rakamlar destekli). */
export const Font = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/** Yazı stilleri. Özel yazı tipinde kalınlık fontFamily ile seçilir (fontWeight kullanılmaz). */
export const Type = {
  display: { fontFamily: Font.extrabold, fontSize: 30, letterSpacing: -0.8, fontVariant: tabular },
  title: { fontFamily: Font.bold, fontSize: 20, letterSpacing: -0.4 },
  headline: { fontFamily: Font.bold, fontSize: 16, letterSpacing: -0.2 },
  body: { fontFamily: Font.medium, fontSize: 15 },
  bodyStrong: { fontFamily: Font.semibold, fontSize: 15 },
  subhead: { fontFamily: Font.medium, fontSize: 13 },
  caption: { fontFamily: Font.semibold, fontSize: 12 },
  overline: { fontFamily: Font.bold, fontSize: 11, letterSpacing: 1.1 },
  number: { fontFamily: Font.bold, fontVariant: tabular },
} satisfies Record<string, TextStyle>;

export const Radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
