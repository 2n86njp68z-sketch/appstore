import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PrimaryButton, SectionTitle, StatRow } from '@/components/ui';
import { pnlColor, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { displaySymbol, kindInfo } from '@/lib/assets';
import {
  currencySymbol,
  formatMoney,
  formatPct,
  formatPrice,
  formatQuantity,
  formatTrDate,
  parseDecimal,
  priceDecimals,
  toInputString,
} from '@/lib/format';
import type { Transaction } from '@/lib/types';

function confirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Sil', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function AssetScreen() {
  const c = useColors();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { holdings, deleteTransaction, setManualPrice } = usePortfolio();
  const h = holdings.find((x) => x.key === key);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState('');

  if (!h) {
    return (
      <View style={[styles.missing, { backgroundColor: c.background }]}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={[styles.missingText, { color: c.textSecondary }]}>Bu varlık için işlem kalmadı.</Text>
        <PrimaryButton label="Portföye dön" onPress={() => router.back()} />
      </View>
    );
  }

  const info = kindInfo(h.kind);
  const title = displaySymbol(h.kind, h.symbol);
  const usd = h.currency === 'USD';

  function savePrice() {
    const p = parseDecimal(priceInput);
    if (!(p > 0) || !h) return;
    setManualPrice(h.kind, h.symbol, p);
    setEditingPrice(false);
  }

  function addMore(side: 'buy' | 'sell') {
    if (!h) return;
    router.push({ pathname: '/add', params: { kind: h.kind, symbol: h.symbol, side } });
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[styles.kind, { color: info.color }]}>{info.label}</Text>
          {h.name !== h.symbol && h.name !== title && (
            <Text style={[styles.name, { color: c.textSecondary }]} numberOfLines={2}>
              {h.name}
            </Text>
          )}
          <Text style={[styles.price, { color: c.text }]}>
            {h.priceMissing ? 'Fiyat yok' : formatPrice(h.price, h.currency)}
          </Text>
          {h.dayChangePct != null && (
            <Text style={[styles.change, { color: pnlColor(c, h.dayChangePct) }]}>
              {formatPct(h.dayChangePct)} bugün
            </Text>
          )}

          {h.kind === 'other' &&
            (editingPrice ? (
              <View style={styles.priceEdit}>
                <TextInput
                  value={priceInput}
                  onChangeText={setPriceInput}
                  keyboardType="decimal-pad"
                  autoFocus
                  placeholder={`Güncel fiyat (${currencySymbol(h.currency)})`}
                  placeholderTextColor={c.textSecondary}
                  style={[styles.input, { color: c.text, backgroundColor: c.chip }]}
                  onSubmitEditing={savePrice}
                />
                <Pressable onPress={savePrice} style={[styles.smallButton, { backgroundColor: c.tint }]}>
                  <Text style={styles.smallButtonText}>Kaydet</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setPriceInput(h.priceMissing ? '' : toInputString(h.price));
                  setEditingPrice(true);
                }}
                hitSlop={8}>
                <Text style={[styles.link, { color: c.tint }]}>Fiyatı elle güncelle</Text>
              </Pressable>
            ))}
        </Card>

        <SectionTitle>Pozisyon</SectionTitle>
        <Card style={{ paddingVertical: 8 }}>
          <StatRow label={`Eldeki ${info.quantityLabel.toLowerCase()}`} value={formatQuantity(h.quantity)} />
          {h.quantity > 0 && (
            <>
              <StatRow
                label="Ortalama maliyet"
                value={formatMoney(h.avgCost, h.currency, { decimals: priceDecimals(h.avgCost) })}
              />
              <StatRow label="Toplam maliyet" value={formatMoney(h.costBasis, h.currency)} />
              <StatRow label="Güncel değer" value={formatMoney(h.marketValue, h.currency)} />
              <StatRow
                label="Kâr / Zarar"
                value={`${formatMoney(h.unrealizedPnl, h.currency, { signed: true })} (${formatPct(h.unrealizedPct)})`}
                valueColor={pnlColor(c, h.unrealizedPnl)}
              />
              {usd && h.valueTry != null && <StatRow label="TL karşılığı" value={formatMoney(h.valueTry, 'TRY')} />}
            </>
          )}
          {Math.abs(h.realizedPnl) > 0.005 && (
            <StatRow
              label="Gerçekleşen K/Z"
              value={formatMoney(h.realizedPnl, h.currency, { signed: true })}
              valueColor={pnlColor(c, h.realizedPnl)}
            />
          )}
        </Card>

        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Alış ekle" color={c.positive} onPress={() => addMore('buy')} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="Satış ekle"
              color={c.negative}
              disabled={h.quantity <= 0}
              onPress={() => addMore('sell')}
            />
          </View>
        </View>

        <SectionTitle>İşlemler</SectionTitle>
        <Card style={styles.listCard}>
          {[...h.transactions].reverse().map((t, i, arr) => (
            <TransactionRow
              key={t.id}
              tx={t}
              currency={h.currency}
              last={i === arr.length - 1}
              onDelete={() =>
                confirm('İşlemi sil', `${formatTrDate(t.date)} tarihli işlem silinsin mi?`, () =>
                  deleteTransaction(t.id),
                )
              }
            />
          ))}
        </Card>
      </ScrollView>
    </>
  );
}

function TransactionRow({
  tx,
  currency,
  last,
  onDelete,
}: {
  tx: Transaction;
  currency: 'TRY' | 'USD';
  last: boolean;
  onDelete: () => void;
}) {
  const c = useColors();
  const buy = tx.side === 'buy';
  return (
    <View style={[styles.txRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <View style={[styles.txBadge, { backgroundColor: buy ? c.positive : c.negative }]}>
        <Text style={styles.txBadgeText}>{buy ? 'AL' : 'SAT'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.txMain, { color: c.text }]}>
          {formatQuantity(tx.quantity)} × {formatPrice(tx.price, currency)}
        </Text>
        <Text style={[styles.txSub, { color: c.textSecondary }]}>{formatTrDate(tx.date)}</Text>
      </View>
      <Text style={[styles.txTotal, { color: c.text }]}>{formatMoney(tx.quantity * tx.price, currency)}</Text>
      <Pressable onPress={onDelete} hitSlop={10} accessibilityRole="button" accessibilityLabel="İşlemi sil">
        <Text style={[styles.delete, { color: c.negative }]}>Sil</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 8,
  },
  kind: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 15,
    marginTop: 4,
  },
  price: {
    fontSize: 32,
    fontWeight: '700',
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  change: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  priceEdit: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  smallButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  txBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    minWidth: 38,
    alignItems: 'center',
  },
  txBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  txMain: {
    fontSize: 15,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  txSub: {
    fontSize: 13,
    marginTop: 2,
  },
  txTotal: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  delete: {
    fontSize: 14,
    fontWeight: '600',
  },
  missing: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
  missingText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
