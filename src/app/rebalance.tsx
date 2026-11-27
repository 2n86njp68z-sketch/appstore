import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AssetIcon } from '@/components/asset-icon';
import { PrimaryButton, Segmented } from '@/components/ui';
import { pnlColor, Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { displaySymbol, kindInfo, quantityUnit } from '@/lib/assets';
import { confirmAsync, notify } from '@/lib/dialog';
import { formatMoney, formatNumber, formatQuantity, parseDecimal, todayIso } from '@/lib/format';
import {
  planBuy,
  planRebalance,
  planWithdraw,
  stepFor,
  type RebalanceItem,
  type RebalanceResult,
} from '@/lib/rebalance';
import type { Holding } from '@/lib/types';

type Mode = 'buy' | 'rebalance' | 'withdraw';

const MODES: { value: Mode; label: string }[] = [
  { value: 'buy', label: 'Nakit ekle' },
  { value: 'rebalance', label: 'Dengele' },
  { value: 'withdraw', label: 'Nakit çek' },
];

const MODE_HINT: Record<Mode, string> = {
  buy: 'Eklediğin nakitle, satış yapmadan hedefine en çok yaklaştıran alımlar.',
  rebalance: 'Nakit eklemeden: hedefin üstündekileri sat, gelirle altındakileri al.',
  withdraw: 'Çekmen gereken tutar için, kalan portföy hedefe en yakın kalacak satışlar.',
};

const pct = (x: number) => `%${formatNumber(x * 100, 1, 1)}`;

/** Portföy dengeleme: hedef oranlar ve "Ne alayım?" hesabı. */
export default function RebalanceScreen() {
  const c = useColors();
  const { holdings, targets, setTargets, addTransaction } = usePortfolio();
  const open = useMemo(() => holdings.filter((h) => h.quantity > 0 && (h.views.TRY?.value ?? 0) > 0), [holdings]);
  const total = open.reduce((s, h) => s + (h.views.TRY?.value ?? 0), 0);
  const [mode, setMode] = useState<Mode>('buy');
  const [amount, setAmount] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, formatNumber(v, 0, 2)])),
  );
  const [result, setResult] = useState<RebalanceResult | null>(null);

  const targetOf = (key: string) => parseDecimal(inputs[key] ?? '') || 0;
  const targetSum = open.reduce((s, h) => s + targetOf(h.key), 0);

  const saveInputs = (next: Record<string, string>) => {
    setInputs(next);
    setResult(null);
    const t: Record<string, number> = {};
    for (const [k, v] of Object.entries(next)) {
      const n = parseDecimal(v);
      if (n > 0) t[k] = n;
    }
    setTargets(t);
  };

  const items: RebalanceItem[] = open.map((h) => ({
    key: h.key,
    label: displaySymbol(h.kind, h.symbol),
    unitPrice: (h.views.TRY?.value ?? 0) / h.quantity,
    quantity: h.quantity,
    step: stepFor(h.kind, h.symbol),
  }));

  const calculate = () => {
    if (targetSum <= 0) return notify('Hedef yok', 'Önce varlıkların için hedef oranları gir.');
    const t = Object.fromEntries(open.map((h) => [h.key, targetOf(h.key)]));
    const cash = parseDecimal(amount);
    if (mode !== 'rebalance' && !(cash > 0)) return notify('Tutar', 'Eklenecek ya da çekilecek tutarı gir.');
    setResult(
      mode === 'buy'
        ? planBuy(items, t, cash)
        : mode === 'withdraw'
          ? planWithdraw(items, t, cash)
          : planRebalance(items, t),
    );
  };

  const trades = result?.rows.filter((r) => Math.abs(r.delta) > 1e-9) ?? [];
  const byKey = new Map(open.map((h) => [h.key, h]));

  const apply = async () => {
    if (!trades.length) return;
    const ok = await confirmAsync(
      'İşlemleri ekle',
      `${trades.length} işlem bugünün tarihi ve güncel fiyatlarla portföyüne eklenecek. Gerçekte yaptığın işlemlerle aynıysa ekle.`,
      'Ekle',
    );
    if (!ok) return;
    for (const r of trades) {
      const h = byKey.get(r.key);
      if (!h) continue;
      addTransaction({
        kind: h.kind,
        symbol: h.symbol,
        side: r.delta > 0 ? 'buy' : 'sell',
        quantity: Math.abs(r.delta),
        price: h.price,
        date: todayIso(),
      });
    }
    router.back();
  };

  if (open.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Ne alayım?' }} />
        <View style={[styles.empty, { backgroundColor: c.background }]}>
          <Text style={[Type.body, { color: c.textSecondary, textAlign: 'center' }]}>
            Dengeleme için önce portföyüne varlık ekle.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Ne alayım?' }} />
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Segmented
          options={MODES}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setResult(null);
          }}
        />
        <Text style={[Type.subhead, styles.hint, { color: c.textSecondary }]}>{MODE_HINT[mode]}</Text>

        {mode !== 'rebalance' && (
          <View style={[styles.amountBox, { backgroundColor: c.card }]}>
            <Text style={[Type.subhead, { color: c.textSecondary }]}>
              {mode === 'buy' ? 'Eklenecek nakit (₺)' : 'Çekilecek tutar (₺)'}
            </Text>
            <TextInput
              value={amount}
              onChangeText={(v) => {
                setAmount(v);
                setResult(null);
              }}
              placeholder="0"
              placeholderTextColor={c.textTertiary}
              keyboardType="decimal-pad"
              style={[Type.title, styles.amountInput, { color: c.text }]}
              accessibilityLabel="Tutar"
            />
          </View>
        )}

        <View style={styles.headRow}>
          <Text style={[Type.title, { color: c.text }]}>Hedef oranlar</Text>
          <Text
            style={[
              Type.subhead,
              { color: Math.abs(targetSum - 100) < 0.01 ? c.positive : targetSum > 0 ? c.warning : c.textTertiary },
            ]}>
            Toplam %{formatNumber(targetSum, 0, 2)}
          </Text>
        </View>
        <View style={styles.quickRow}>
          <Pressable
            onPress={() =>
              saveInputs(
                Object.fromEntries(
                  open.map((h) => [h.key, formatNumber(((h.views.TRY?.value ?? 0) / total) * 100, 0, 1)]),
                ),
              )
            }
            style={[styles.quick, { backgroundColor: c.chip }]}
            accessibilityRole="button">
            <Text style={[Type.caption, { color: c.text }]}>Şu anki oranları al</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              saveInputs(Object.fromEntries(open.map((h) => [h.key, formatNumber(100 / open.length, 0, 2)])))
            }
            style={[styles.quick, { backgroundColor: c.chip }]}
            accessibilityRole="button">
            <Text style={[Type.caption, { color: c.text }]}>Eşit dağıt</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: c.card }]}>
          {open.map((h, i) => (
            <TargetRow
              key={h.key}
              holding={h}
              weight={(h.views.TRY?.value ?? 0) / total}
              value={inputs[h.key] ?? ''}
              onChange={(v) => saveInputs({ ...inputs, [h.key]: v })}
              last={i === open.length - 1}
            />
          ))}
        </View>
        {targetSum > 0 && Math.abs(targetSum - 100) >= 0.01 && (
          <Text style={[Type.subhead, styles.note, { color: c.textTertiary }]}>
            Toplam %100 değil; oranlar birbirine göre ölçeklenerek kullanılır.
          </Text>
        )}

        <View style={{ marginTop: 16 }}>
          <PrimaryButton label="Hesapla" onPress={calculate} />
        </View>

        {result && (
          <>
            <Text style={[Type.title, styles.resultTitle, { color: c.text }]}>
              {trades.length ? 'Öneri' : 'İşlem gerekmiyor'}
            </Text>
            {trades.length > 0 && (
              <View style={[styles.card, { backgroundColor: c.card }]}>
                {trades.map((r, i) => {
                  const h = byKey.get(r.key)!;
                  const buy = r.delta > 0;
                  return (
                    <View
                      key={r.key}
                      style={[
                        styles.tradeRow,
                        i < trades.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: c.border,
                        },
                      ]}>
                      <View style={[styles.badge, { backgroundColor: buy ? c.positiveSoft : c.negativeSoft }]}>
                        <Text style={[Type.caption, { color: buy ? c.positive : c.negative }]}>
                          {buy ? 'AL' : 'SAT'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[Type.bodyStrong, { color: c.text }]}>
                          {r.label} · {formatQuantity(Math.abs(r.delta))}{' '}
                          {h.kind === 'bist' ? 'lot' : quantityUnit(h.kind, h.symbol)}
                        </Text>
                        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]}>
                          {pct(r.before)} → {pct(r.after)} (hedef {pct(r.target)})
                        </Text>
                      </View>
                      <Text style={[Type.number, { color: buy ? c.text : c.negative }]}>
                        {formatMoney(r.amount, 'TRY')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            <View style={[styles.summary, { backgroundColor: c.card }]}>
              {result.bought > 0 && <SummaryLine label="Alım" value={formatMoney(result.bought, 'TRY')} />}
              {result.sold > 0 && <SummaryLine label="Satış" value={formatMoney(result.sold, 'TRY')} />}
              {mode === 'buy' && <SummaryLine label="Kullanılmayan nakit" value={formatMoney(result.left, 'TRY')} />}
              {mode === 'withdraw' && (result.short ?? 0) > 0 && (
                <SummaryLine label="Toplanamayan" value={formatMoney(result.short!, 'TRY')} color={c.negative} />
              )}
              {mode === 'withdraw' && result.left > 0 && (
                <SummaryLine label="Fazladan çıkan" value={formatMoney(result.left, 'TRY')} />
              )}
              {mode === 'buy' && (result.needForPerfect ?? 0) > 0 && (
                <SummaryLine
                  label="Satmadan tam hedef için gereken nakit"
                  value={formatMoney(result.needForPerfect!, 'TRY', { decimals: 0 })}
                />
              )}
            </View>
            {trades.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <PrimaryButton label="Bu işlemleri portföye ekle" onPress={apply} color={c.buy} />
              </View>
            )}
          </>
        )}
        <Text style={[Type.subhead, styles.disclaimer, { color: c.textTertiary }]}>
          Öneriler girdiğin hedef oranlara göre yapılan matematiksel hesaptır; yatırım tavsiyesi değildir. İşlem öncesi
          fiyatları ve komisyonu aracı kurumunda kontrol et.
        </Text>
      </ScrollView>
    </>
  );
}

function TargetRow({
  holding: h,
  weight,
  value,
  onChange,
  last,
}: {
  holding: Holding;
  weight: number;
  value: string;
  onChange: (v: string) => void;
  last: boolean;
}) {
  const c = useColors();
  const target = parseDecimal(value) || 0;
  const diff = target > 0 ? weight * 100 - target : 0;
  return (
    <View
      style={[styles.targetRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <AssetIcon kind={h.kind} symbol={h.symbol} label={h.symbol} color={kindInfo(h.kind).color} size={32} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[Type.bodyStrong, { color: c.text }]} numberOfLines={1}>
          {displaySymbol(h.kind, h.symbol)}
        </Text>
        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]}>
          Şu an {pct(weight)}
          {target > 0 && Math.abs(diff) >= 0.05 && (
            <Text style={{ color: pnlColor(c, -diff) }}>
              {' '}
              · hedefin {formatNumber(Math.abs(diff), 1, 1)} puan {diff > 0 ? 'üstünde' : 'altında'}
            </Text>
          )}
        </Text>
      </View>
      <View style={[styles.targetBox, { backgroundColor: c.background, borderColor: c.border }]}>
        <Text style={[Type.subhead, { color: c.textTertiary }]}>%</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="0"
          placeholderTextColor={c.textTertiary}
          keyboardType="decimal-pad"
          style={[Type.bodyStrong, styles.targetInput, { color: c.text }]}
          accessibilityLabel={`${h.symbol} hedef oranı`}
        />
      </View>
    </View>
  );
}

function SummaryLine({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = useColors();
  return (
    <View style={styles.summaryLine}>
      <Text style={[Type.subhead, { color: c.textSecondary, flex: 1 }]}>{label}</Text>
      <Text style={[Type.number, { color: color ?? c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 56 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  hint: { fontSize: 12.5, lineHeight: 18, marginTop: 8, paddingHorizontal: 4 },
  amountBox: { borderRadius: Radius.lg, padding: 14, marginTop: 14, gap: 4 },
  amountInput: { fontSize: 26, paddingVertical: 2 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 8,
  },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quick: { borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  card: { borderRadius: Radius.lg, paddingHorizontal: 14 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  targetBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    width: 84,
  },
  targetInput: { flex: 1, paddingVertical: 8, textAlign: 'right' },
  note: { fontSize: 12, marginTop: 6, paddingHorizontal: 4 },
  resultTitle: { marginTop: 24, marginBottom: 8 },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  badge: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, minWidth: 40, alignItems: 'center' },
  summary: { borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },
  summaryLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  disclaimer: { fontSize: 11.5, lineHeight: 16, marginTop: 18, paddingHorizontal: 4 },
});
