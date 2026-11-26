import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { PortfolioProvider } from '@/context/portfolio-context';

export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const c = Colors[dark ? 'dark' : 'light'];
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: c.background, card: c.card, text: c.text, primary: c.tint, border: c.border },
  };

  return (
    <PortfolioProvider>
      <ThemeProvider value={theme}>
        <Stack screenOptions={{ headerBackTitle: 'Geri' }}>
          <Stack.Screen
            name="index"
            options={{ title: 'Portföyüm', headerLargeTitle: true, headerShadowVisible: false }}
          />
          <Stack.Screen name="add" options={{ title: 'İşlem Ekle', presentation: 'modal' }} />
          <Stack.Screen name="asset/[key]" options={{ title: '' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </PortfolioProvider>
  );
}
