import { useColorScheme } from 'react-native';

export const Colors = {
  light: {
    background: '#FFFFFF',
    card: '#F5F6F8',
    text: '#0F172A',
    textSecondary: '#64748B',
    border: '#E5E7EB',
    tint: '#2563EB',
    tintText: '#FFFFFF',
    positive: '#16A34A',
    negative: '#DC2626',
    chip: '#EEF1F5',
    warning: '#B45309',
    warningBg: '#FEF3C7',
  },
  dark: {
    background: '#000000',
    card: '#14161A',
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    border: '#2A2D34',
    tint: '#3B82F6',
    tintText: '#FFFFFF',
    positive: '#22C55E',
    negative: '#F87171',
    chip: '#22252B',
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
