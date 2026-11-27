import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Font, Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { ALL_PORTFOLIOS } from '@/lib/portfolios';

/** Ana sayfanın üstünde portföyler arasında geçiş (birden fazla portföy varsa görünür). */
export function PortfolioSwitcher() {
  const c = useColors();
  const { portfolios, activePortfolio, setActivePortfolio } = usePortfolio();
  if (portfolios.length < 2) return null;
  const items = [{ id: ALL_PORTFOLIOS, name: 'Tümü' }, ...portfolios];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.wrap}
      accessibilityRole="tablist">
      {items.map((p) => {
        const sel = p.id === activePortfolio;
        return (
          <Pressable
            key={p.id}
            onPress={() => setActivePortfolio(p.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: sel ? c.tint : c.chip, opacity: pressed ? 0.75 : 1 },
            ]}>
            <Text style={[Type.caption, { color: sel ? '#FFFFFF' : c.text, fontFamily: Font.semibold, fontSize: 13 }]}>
              {p.name}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => router.push('/portfolios')}
        accessibilityRole="button"
        accessibilityLabel="Portföyleri düzenle"
        style={({ pressed }) => [styles.chip, { backgroundColor: c.chip, opacity: pressed ? 0.75 : 1 }]}>
        <Text style={[Type.caption, { color: c.textSecondary, fontFamily: Font.semibold, fontSize: 13 }]}>Düzenle</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -16, marginBottom: 4 },
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  chip: { borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
});
