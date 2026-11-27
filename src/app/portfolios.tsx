import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PrimaryButton } from '@/components/ui';
import { Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { confirmAsync } from '@/lib/dialog';
import { formatMoney } from '@/lib/format';
import { ALL_PORTFOLIOS, MAIN_PORTFOLIO, portfolioOf } from '@/lib/portfolios';

/** Portföyler: seç, yeni ekle, adını değiştir, sil. */
export default function PortfoliosScreen() {
  const c = useColors();
  const {
    portfolios,
    activePortfolio,
    setActivePortfolio,
    addPortfolio,
    renamePortfolio,
    deletePortfolio,
    portfolioValues,
    allTransactions,
    displayCurrency,
  } = usePortfolio();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const count = (id: string) => allTransactions.filter((t) => portfolioOf(t) === id).length;
  const total = Object.values(portfolioValues).reduce((a, b) => a + b, 0);

  const add = () => {
    const id = addPortfolio(name || 'Yeni portföy');
    setName('');
    setActivePortfolio(id);
  };

  const remove = async (id: string, label: string) => {
    const n = count(id);
    const ok = await confirmAsync(
      `"${label}" silinsin mi?`,
      n ? `Bu portföydeki ${n} işlem de silinecek. Bu geri alınamaz.` : 'Portföy boş.',
      'Sil',
      true,
    );
    if (ok) deletePortfolio(id);
  };

  const rows = [
    ...(portfolios.length > 1
      ? [{ id: ALL_PORTFOLIOS, name: 'Tümü', sub: `${portfolios.length} portföy birlikte`, value: total }]
      : []),
    ...portfolios.map((p) => ({
      id: p.id,
      name: p.name,
      sub: `${count(p.id)} işlem`,
      value: portfolioValues[p.id] ?? 0,
    })),
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Portföyler' }} />
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={[Type.subhead, styles.intro, { color: c.textSecondary }]}>
          Hesaplarını ayrı tut (ör. uzun vade, BES, çocuk hesabı). Ana sayfada seçtiğin portföy ya da hepsi birlikte
          görünür; yeni işlemler seçili portföye eklenir.
        </Text>

        <View style={[styles.card, { backgroundColor: c.card }]}>
          {rows.map((r, i) => {
            const selected = r.id === activePortfolio;
            const isEditing = editing === r.id;
            return (
              <View
                key={r.id}
                style={[
                  styles.row,
                  i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
                ]}>
                <Pressable
                  onPress={() => {
                    setActivePortfolio(r.id);
                    router.back();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${r.name}, ${r.sub}`}
                  style={styles.rowMain}>
                  <View style={[styles.radio, { borderColor: selected ? c.tint : c.textTertiary }]}>
                    {selected && <View style={[styles.radioDot, { backgroundColor: c.tint }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    {isEditing ? (
                      <TextInput
                        value={editName}
                        onChangeText={setEditName}
                        autoFocus
                        maxLength={40}
                        onSubmitEditing={() => {
                          renamePortfolio(r.id, editName);
                          setEditing(null);
                        }}
                        onBlur={() => {
                          if (editName.trim()) renamePortfolio(r.id, editName);
                          setEditing(null);
                        }}
                        accessibilityLabel="Portföy adı"
                        style={[Type.bodyStrong, styles.editInput, { color: c.text, borderColor: c.tint }]}
                      />
                    ) : (
                      <Text style={[Type.bodyStrong, { color: c.text }]}>{r.name}</Text>
                    )}
                    <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]}>{r.sub}</Text>
                  </View>
                  <Text style={[Type.bodyStrong, styles.value, { color: c.text }]}>
                    {formatMoney(r.value, displayCurrency, { decimals: 0 })}
                  </Text>
                </Pressable>
                {r.id !== ALL_PORTFOLIOS && (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => {
                        setEditing(r.id);
                        setEditName(r.name);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.name} adını değiştir`}>
                      <Svg width={17} height={17} viewBox="0 0 24 24">
                        <Path
                          d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"
                          stroke={c.textTertiary}
                          strokeWidth={2}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </Svg>
                    </Pressable>
                    {r.id !== MAIN_PORTFOLIO && (
                      <Pressable
                        onPress={() => remove(r.id, r.name)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`${r.name} portföyünü sil`}>
                        <Svg width={17} height={17} viewBox="0 0 24 24">
                          <Path
                            d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
                            stroke={c.textTertiary}
                            strokeWidth={2}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </Svg>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Text style={[Type.overline, styles.section, { color: c.textSecondary }]}>YENİ PORTFÖY</Text>
        <View style={[styles.addBox, { backgroundColor: c.card }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ad (ör. BES, Uzun vade)"
            placeholderTextColor={c.textTertiary}
            maxLength={40}
            onSubmitEditing={add}
            accessibilityLabel="Yeni portföy adı"
            style={[
              Type.body,
              styles.addInput,
              { color: c.text, borderColor: c.border, backgroundColor: c.background },
            ]}
          />
          <PrimaryButton label="Portföy ekle" onPress={add} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 14, paddingHorizontal: 4 },
  card: { borderRadius: Radius.lg, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  value: { fontVariant: ['tabular-nums'], fontSize: 15 },
  actions: { flexDirection: 'row', gap: 14, paddingLeft: 2 },
  editInput: { borderBottomWidth: 1.5, paddingVertical: 2 },
  section: { marginTop: 24, marginBottom: 8, marginLeft: 6 },
  addBox: { borderRadius: Radius.lg, padding: 14, gap: 12 },
  addInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
});
