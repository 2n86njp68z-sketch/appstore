// Yalnız kullanılan kalınlıklar (paket kökünden almak 7 kalınlığın hepsini uygulamaya ekler).
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { GeniusLogo } from '@/components/genius-logo';
import { MarketDrawerProvider } from '@/components/market-drawer';
import { Colors, Font } from '@/constants/theme';
import { PortfolioProvider } from '@/context/portfolio-context';

// Yazı tipi yüklenene kadar açılış ekranı kalsın.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  const dark = scheme === 'dark';
  const c = Colors[dark ? 'dark' : 'light'];
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      background: c.background,
      card: c.background,
      text: c.text,
      primary: c.link,
      border: c.border,
    },
    fonts: {
      regular: { fontFamily: Font.regular, fontWeight: '400' as const },
      medium: { fontFamily: Font.medium, fontWeight: '500' as const },
      bold: { fontFamily: Font.bold, fontWeight: '700' as const },
      heavy: { fontFamily: Font.extrabold, fontWeight: '800' as const },
    },
  };

  return (
    <PortfolioProvider>
      <ThemeProvider value={theme}>
        <MarketDrawerProvider>
          <Stack
            screenOptions={{
              headerBackTitle: 'Geri',
              headerShadowVisible: false,
              headerTitleStyle: { fontFamily: Font.bold, fontSize: 17 },
              headerLargeTitleStyle: { fontFamily: Font.extrabold },
              headerBackTitleStyle: { fontFamily: Font.medium },
              contentStyle: { backgroundColor: c.background },
            }}>
            <Stack.Screen name="index" options={{ title: 'GENIUS', headerTitle: () => <GeniusLogo /> }} />
            <Stack.Screen name="add" options={{ title: 'İşlem Ekle', presentation: 'modal' }} />
            <Stack.Screen name="asset/[key]" options={{ title: '' }} />
          </Stack>
        </MarketDrawerProvider>
        <StatusBar style="auto" />
      </ThemeProvider>
    </PortfolioProvider>
  );
}
