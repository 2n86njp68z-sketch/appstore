import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Card, PrimaryButton, SectionTitle, Segmented } from '@/components/ui';
import { Font, Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { requestNotificationPermission } from '@/lib/alert-task';
import { alertsFor, describeAlert, type PriceAlert } from '@/lib/alerts';
import { assetCurrency } from '@/lib/assets';
import { currencySymbol, formatAssetPrice, formatPct, parseDecimal, priceDecimals, toInputString } from '@/lib/format';
import type { AssetKind } from '@/lib/types';

const OPS: { value: PriceAlert['op']; label: string }[] = [
  { value: 'above', label: 'Üstüne çıkınca' },
  { value: 'below', label: 'Altına inince' },
];

const trDateTime = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Tek alarm satırı: koşul, uzaklık ya da tetiklenme, aç/kapa ve sil. */
export function AlertRow({
  alert: a,
  currentPrice,
  last,
  showName = true,
}: {
  alert: PriceAlert;
  currentPrice?: number;
  last?: boolean;
  showName?: boolean;
}) {
  const c = useColors();
  const { removeAlert, setAlertActive } = usePortfolio();
  const cur = assetCurrency(a.kind, a.symbol);
  const text = describeAlert(a);
  const distance =
    currentPrice != null && currentPrice > 0 ? ((a.price - currentPrice) / currentPrice) * 100 : undefined;
  let sub: string;
  if (a.triggeredAt) {
    sub = `Çaldı: ${trDateTime(a.triggeredAt)}${a.triggeredPrice ? ` · ${formatAssetPrice(a.kind, a.triggeredPrice, cur)}` : ''}`;
  } else if (!a.active) sub = 'Kapalı';
  else if (distance != null)
    sub = `Şu an ${formatAssetPrice(a.kind, currentPrice!, cur)} · ${formatPct(distance, { signed: true, decimals: 1 })} uzakta`;
  else sub = 'Bekliyor';
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <View style={[styles.opBadge, { backgroundColor: a.op === 'above' ? c.positiveSoft : c.negativeSoft }]}>
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <Path
            d={a.op === 'above' ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'}
            stroke={a.op === 'above' ? c.positive : c.negative}
            strokeWidth={2.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[Type.bodyStrong, { color: c.text, fontSize: 15 }]} numberOfLines={2}>
          {showName ? text : text.slice(text.indexOf(' ') + 1)}
        </Text>
        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Switch
        value={a.active}
        onValueChange={(v) => setAlertActive(a.id, v)}
        trackColor={{ true: c.tint }}
        thumbColor="#FFFFFF"
        accessibilityLabel={`${text} alarmı ${a.active ? 'açık' : 'kapalı'}`}
      />
      <Pressable
        onPress={() => removeAlert(a.id)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${text} alarmını sil`}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
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
    </View>
  );
}

/** Varlık sayfasındaki "Fiyat alarmı" bölümü: mevcut alarmlar ve yeni alarm formu. */
export function AssetAlerts({ kind, symbol, price }: { kind: AssetKind; symbol: string; price?: number }) {
  const c = useColors();
  const { alerts, addAlert } = usePortfolio();
  const mine = alertsFor(alerts, kind, symbol);
  const cur = assetCurrency(kind, symbol);
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState<PriceAlert['op']>('above');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string>();
  const unit = kind === 'eurobond' ? ' (100 nominal)' : '';

  const start = () => {
    setOp('above');
    setInput(price ? toInputString(Number((price * 1.05).toFixed(priceDecimals(price)))) : '');
    setError(undefined);
    setOpen(true);
  };

  const save = async () => {
    const level = parseDecimal(input);
    if (!(level > 0)) return setError('Geçerli bir fiyat yaz.');
    if (price != null && (op === 'above' ? price >= level : price <= level)) {
      return setError(
        op === 'above'
          ? 'Fiyat zaten bu seviyenin üstünde; daha yüksek bir seviye yaz ya da "Altına inince"yi seç.'
          : 'Fiyat zaten bu seviyenin altında; daha düşük bir seviye yaz ya da "Üstüne çıkınca"yı seç.',
      );
    }
    addAlert({ kind, symbol, op, price: level });
    setOpen(false);
    await requestNotificationPermission();
  };

  return (
    <>
      <SectionTitle
        right={
          !open ? (
            <Pressable onPress={start} hitSlop={8} accessibilityRole="button">
              <Text style={[Type.caption, { color: c.link, fontFamily: Font.semibold }]}>+ Alarm kur</Text>
            </Pressable>
          ) : undefined
        }>
        Fiyat alarmı
      </SectionTitle>
      {(mine.length > 0 || open) && (
        <Card style={{ paddingVertical: mine.length ? 4 : 0 }}>
          {mine.map((a, i) => (
            <AlertRow
              key={a.id}
              alert={a}
              currentPrice={price}
              last={i === mine.length - 1 && !open}
              showName={false}
            />
          ))}
          {open && (
            <View
              style={[
                styles.form,
                mine.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
              ]}>
              <Segmented options={OPS} value={op} onChange={setOp} />
              <View style={[styles.inputBox, { borderColor: c.border, backgroundColor: c.background }]}>
                <Text style={[Type.headline, { color: c.textSecondary }]}>{currencySymbol(cur)}</Text>
                <TextInput
                  value={input}
                  onChangeText={(t) => {
                    setInput(t);
                    setError(undefined);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="Fiyat"
                  placeholderTextColor={c.textTertiary}
                  accessibilityLabel={`Alarm fiyatı${unit}`}
                  style={[Type.headline, styles.input, { color: c.text }]}
                />
              </View>
              <Text style={[Type.subhead, { color: error ? c.negative : c.textSecondary, fontSize: 12 }]}>
                {error ??
                  (price
                    ? `Şu an ${formatAssetPrice(kind, price, cur)}${unit}. Fiyat bu seviyeye gelince bir kez bildirim gelir.`
                    : 'Fiyat bu seviyeye gelince bir kez bildirim gelir.')}
              </Text>
              <View style={styles.formActions}>
                <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityRole="button">
                  <Text style={[Type.bodyStrong, { color: c.textSecondary }]}>Vazgeç</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <PrimaryButton label="Alarmı kaydet" onPress={save} />
                </View>
              </View>
            </View>
          )}
        </Card>
      )}
      {mine.length === 0 && !open && (
        <Text style={[Type.subhead, styles.empty, { color: c.textTertiary }]}>
          Fiyat belirlediğin seviyenin üstüne çıkınca ya da altına inince bildirim al.
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  opBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 10, paddingVertical: 14 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
  },
  input: { flex: 1, paddingVertical: 10 },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 2 },
  empty: { fontSize: 12.5, marginTop: -2, marginBottom: 4, paddingHorizontal: 4 },
});
