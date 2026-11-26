import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AssetIcon } from '@/components/asset-icon';
import { Card, Chip, PrimaryButton, Segmented } from '@/components/ui';
import { Font, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import {
  ASSET_KINDS,
  FX_OPTIONS,
  METAL_OPTIONS,
  assetCurrency,
  commodityInfo,
  displaySymbol,
  isManualPriced,
  kindInfo,
  normalizeSymbol,
  quantityLabelFor,
  quoteSymbolFor,
  USDTRY_SYMBOL,
} from '@/lib/assets';
import {
  currencySymbol,
  formatMoney,
  formatQuantity,
  formatTrDate,
  parseDecimal,
  parseTrDate,
  todayIso,
  toInputString,
} from '@/lib/format';
import { stockInfo } from '@/lib/markets';
import { heldQuantity, resolveAssetQuote } from '@/lib/portfolio';
import { fetchAnyQuotes } from '@/lib/prices';
import type { AssetKind, TransactionSide } from '@/lib/types';

const SYMBOL_PATTERN = /^[A-Z0-9.\-_^=]{1,20}$/;

export default function AddTransactionScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ kind?: string; symbol?: string; side?: string }>();
  const { transactions, addTransaction, quotes } = usePortfolio();

  const initialKind = ASSET_KINDS.some((k) => k.kind === params.kind) ? (params.kind as AssetKind) : 'bist';
  const lockedAsset = Boolean(params.kind && params.symbol);

  const [kind, setKind] = useState<AssetKind>(initialKind);
  const [symbolInput, setSymbolInput] = useState(params.symbol ?? '');
  const [fxSymbol, setFxSymbol] = useState(initialKind === 'fx' && params.symbol ? params.symbol : 'USD');
  const [metalSymbol, setMetalSymbol] = useState(
    initialKind === 'metal' && params.symbol ? params.symbol : 'GRAM_ALTIN',
  );
  const [side, setSide] = useState<TransactionSide>(params.side === 'sell' ? 'sell' : 'buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(formatTrDate(todayIso()));
  const [error, setError] = useState<string>();
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const info = kindInfo(kind);
  const symbol = kind === 'fx' ? fxSymbol : kind === 'metal' ? metalSymbol : normalizeSymbol(kind, symbolInput);
  const held = useMemo(() => heldQuantity(transactions, kind, symbol), [transactions, kind, symbol]);
  const currency = assetCurrency(kind, symbol);
  const quantityLabel = quantityLabelFor(kind, symbol);
  const manual = isManualPriced(kind);
  const listed = stockInfo(kind, symbol);
  const commodity = kind === 'metal' ? commodityInfo(symbol) : undefined;

  const qty = parseDecimal(quantity);
  const unitPrice = parseDecimal(price);
  const total = qty > 0 && unitPrice > 0 ? qty * unitPrice : undefined;

  const inputStyle = [styles.input, { color: c.text, backgroundColor: c.background, borderColor: c.border }];

  async function fillCurrentPrice() {
    setError(undefined);
    if (!symbol) {
      setError('Önce sembolü yaz.');
      return;
    }
    const key = quoteSymbolFor(kind, symbol);
    if (!key) return;
    const needed = kind === 'metal' && currency === 'TRY' ? [key, USDTRY_SYMBOL] : [key];
    setFetchingPrice(true);
    try {
      const fresh = await fetchAnyQuotes(needed);
      const q = resolveAssetQuote(kind, symbol, { ...quotes, ...fresh }, {});
      if (q && needed.every((s) => fresh[s])) setPrice(toInputString(q.price));
      else setError(`"${symbol}" için fiyat bulunamadı. Sembolü kontrol et.`);
    } finally {
      setFetchingPrice(false);
    }
  }

  // Menüden bir hisse seçilerek gelindiyse güncel fiyatı kendiliğinden doldur.
  useEffect(() => {
    if (!lockedAsset || isManualPriced(kind)) return;
    const t = setTimeout(fillCurrentPrice, 0);
    return () => clearTimeout(t);
    // Yalnız ilk açılışta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    setError(undefined);
    if (!symbol) return setError('Sembol gerekli.');
    if ((kind === 'fund' || kind === 'bes') && !/^[A-Z0-9]{3}$/.test(symbol)) {
      return setError('Fon kodu 3 karakter olmalı (ör. AFT).');
    }
    if (kind !== 'other' && !SYMBOL_PATTERN.test(symbol)) return setError('Sembol yalnızca harf ve rakam içermeli.');
    if (!(qty > 0)) return setError(`${quantityLabel} sıfırdan büyük olmalı.`);
    if (!(unitPrice > 0)) return setError('Birim fiyat sıfırdan büyük olmalı.');
    const iso = parseTrDate(date);
    if (!iso) return setError('Tarihi GG.AA.YYYY biçiminde yaz.');
    if (iso > todayIso()) return setError('Tarih ileri bir gün olamaz.');
    if (side === 'sell' && qty > held + 1e-9) {
      return setError(held > 0 ? `En fazla ${formatQuantity(held)} satabilirsin.` : 'Elinde bu varlıktan yok.');
    }
    addTransaction({ kind, symbol, side, quantity: qty, price: unitPrice, date: iso });
    router.back();
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets>
      {lockedAsset && (
        <View style={styles.assetHead}>
          <AssetIcon kind={kind} symbol={symbol} label={symbol} color={info.color} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[Type.title, { color: c.text }]}>{displaySymbol(kind, symbol)}</Text>
            <Text style={[Type.subhead, { color: c.textSecondary }]} numberOfLines={2}>
              {commodity
                ? `${commodity.currency === 'USD' ? 'Dolar' : 'TL'} bazında · ${commodity.unit} fiyatı`
                : (listed?.name ?? info.label) + (listed?.company ? ` · ${listed.company}` : '')}
            </Text>
          </View>
        </View>
      )}

      {!lockedAsset && (
        <View style={styles.chips}>
          {ASSET_KINDS.map((k) => (
            <Chip key={k.kind} label={k.label} selected={kind === k.kind} onPress={() => setKind(k.kind)} />
          ))}
        </View>
      )}

      <Card style={styles.form}>
        {lockedAsset ? null : kind === 'fx' || kind === 'metal' ? (
          <Field label={kind === 'fx' ? 'Para birimi' : 'Tür'}>
            <View style={styles.chips}>
              {(kind === 'fx' ? FX_OPTIONS : METAL_OPTIONS).map((o) => (
                <Chip
                  key={o.symbol}
                  label={kind === 'fx' ? o.symbol : `${o.name} (${currencySymbol(assetCurrency('metal', o.symbol))})`}
                  selected={symbol === o.symbol}
                  onPress={() => (kind === 'fx' ? setFxSymbol(o.symbol) : setMetalSymbol(o.symbol))}
                />
              ))}
            </View>
          </Field>
        ) : (
          <Field label={kind === 'other' ? 'Varlık adı' : kind === 'fund' || kind === 'bes' ? 'Fon kodu' : 'Sembol'}>
            <TextInput
              value={symbolInput}
              onChangeText={setSymbolInput}
              placeholder={info.placeholder}
              placeholderTextColor={c.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              style={inputStyle}
            />
            {kind !== 'other' && symbol.length >= (kind === 'us' || kind === 'etf' ? 1 : kind === 'crypto' ? 2 : 3) && (
              <Text style={[styles.hint, { color: listed ? c.textSecondary : c.textTertiary }]}>
                {listed?.name ?? 'Bu kod listede yok; fiyatı alınabiliyorsa yine eklenir.'}
              </Text>
            )}
          </Field>
        )}

        <Field label="İşlem">
          <Segmented
            options={[
              { value: 'buy', label: 'Alış', color: c.buy },
              { value: 'sell', label: 'Satış', color: c.sell },
            ]}
            value={side}
            onChange={setSide}
          />
          {side === 'sell' && symbol !== '' && (
            <Text style={[styles.hint, { color: c.textSecondary }]}>Eldeki: {formatQuantity(held)}</Text>
          )}
        </Field>

        <Field label={quantityLabel}>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder="0"
            placeholderTextColor={c.textTertiary}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
        </Field>

        <Field
          label={`Birim fiyat (${currencySymbol(currency)})`}
          right={
            !manual ? (
              <Pressable onPress={fillCurrentPrice} disabled={fetchingPrice} hitSlop={8}>
                {fetchingPrice ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={[styles.link, { color: c.link }]}>Güncel fiyatı kullan</Text>
                )}
              </Pressable>
            ) : undefined
          }>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="0,00"
            placeholderTextColor={c.textTertiary}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
          {(kind === 'fund' || kind === 'bes') && (
            <Text style={[styles.hint, { color: c.textTertiary }]}>
              Fon fiyatları otomatik alınamıyor. Alış fiyatını gir; güncel fiyatı fonun sayfasından güncelleyebilirsin.
            </Text>
          )}
        </Field>

        <Field label="Tarih (GG.AA.YYYY)">
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="26.11.2026"
            placeholderTextColor={c.textTertiary}
            keyboardType="numbers-and-punctuation"
            style={inputStyle}
          />
        </Field>

        {total != null && (
          <View style={[styles.totalRow, { borderTopColor: c.border }]}>
            <Text style={[styles.totalLabel, { color: c.textSecondary }]}>Toplam tutar</Text>
            <Text style={[styles.totalValue, { color: c.text }]}>{formatMoney(total, currency)}</Text>
          </View>
        )}
      </Card>

      {error && <Text style={[styles.error, { color: c.negative }]}>{error}</Text>}

      <PrimaryButton
        label={side === 'buy' ? 'Alışı kaydet' : 'Satışı kaydet'}
        onPress={save}
        color={side === 'buy' ? c.buy : c.sell}
      />
    </ScrollView>
  );
}

function Field({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={[styles.label, { color: c.textSecondary }]}>{label}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 48,
  },
  assetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  form: {
    gap: 18,
  },
  field: {
    gap: 8,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: Font.semibold,
    letterSpacing: 0.2,
  },
  input: {
    fontFamily: Font.semibold,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    fontFamily: Font.medium,
    fontSize: 13,
  },
  link: {
    fontSize: 14,
    fontFamily: Font.semibold,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  totalLabel: {
    fontFamily: Font.medium,
    fontSize: 15,
  },
  totalValue: {
    fontSize: 18,
    fontFamily: Font.extrabold,
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontSize: 15,
    fontFamily: Font.medium,
    textAlign: 'center',
  },
});
