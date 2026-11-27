import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { AssetIcon, CategoryIcon } from '@/components/asset-icon';
import { Font, pnlColor, pnlSoft, Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import {
  ASSET_KINDS,
  FX_OPTIONS,
  METAL_OPTIONS,
  assetCurrency,
  commodityInfo,
  displaySymbol,
  fixedName,
  isManualPriced,
  isTryCash,
  kindInfo,
  normalizeSymbol,
  priceFactor,
  quantityLabelFor,
  quantityUnit,
  quoteSymbolFor,
  USDTRY_SYMBOL,
} from '@/lib/assets';
import { applySplits } from '@/lib/corporate';
import {
  currencySymbol,
  formatAssetPrice,
  formatMoney,
  formatPct,
  formatQuantity,
  formatTrDate,
  parseDecimal,
  parseTrDate,
  todayIso,
  toInputString,
  trUpper,
} from '@/lib/format';
import { MARKETS, searchStocks, stockInfo, type MarketKey, type MarketStock } from '@/lib/markets';
import { computePosition, resolveAssetQuote } from '@/lib/portfolio';
import { filterByPortfolio, targetPortfolio } from '@/lib/portfolios';
import { fetchAnyQuotes } from '@/lib/prices';
import type { AssetKind, RawQuote, Transaction, TransactionSide } from '@/lib/types';

const SYMBOL_PATTERN = /^[A-Z0-9.\-_^=]{1,20}$/;

/** Varlık türünün arama listesi (emtia ve döviz seçenekli, "diğer" serbest). */
const MARKET_OF: Partial<Record<AssetKind, MarketKey>> = Object.fromEntries(
  (Object.keys(MARKETS) as MarketKey[]).filter((k) => k !== 'metal').map((k) => [MARKETS[k].kind, k]),
);

/** "#RRGGBB" → saydamlıklı renk. */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayIso(d);
};

/** Tutarla girişte miktarı alım birimine aşağı yuvarlar (hisse ve eurobond tam sayı). */
function unitsForAmount(kind: AssetKind, amount: number, unitPrice: number): number {
  const raw = amount / (unitPrice * priceFactor(kind));
  if (!(raw > 0) || !Number.isFinite(raw)) return 0;
  if (kind === 'bist' || kind === 'eurobond') return Math.floor(raw + 1e-9);
  return Math.floor(raw * 1e6 + 1e-6) / 1e6;
}

export default function AddTransactionScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ kind?: string; symbol?: string; side?: string }>();
  const { allTransactions, addTransaction, quotes, manualPrices, actionsByKey, portfolios, activePortfolio } =
    usePortfolio();
  const [portfolioId, setPortfolioId] = useState(targetPortfolio(activePortfolio));
  const transactions = useMemo(() => filterByPortfolio(allTransactions, portfolioId), [allTransactions, portfolioId]);

  const initialKind = ASSET_KINDS.some((k) => k.kind === params.kind) ? (params.kind as AssetKind) : 'bist';
  const lockedAsset = Boolean(params.kind && params.symbol);

  const [kind, setKind] = useState<AssetKind>(initialKind);
  const [symbolInput, setSymbolInput] = useState(params.symbol ?? '');
  const [picked, setPicked] = useState(lockedAsset);
  const [fxSymbol, setFxSymbol] = useState(initialKind === 'fx' && params.symbol ? params.symbol : 'USD');
  const [metalSymbol, setMetalSymbol] = useState(
    initialKind === 'metal' && params.symbol ? params.symbol : 'GRAM_ALTIN',
  );
  const [side, setSide] = useState<TransactionSide>(params.side === 'sell' ? 'sell' : 'buy');
  const [byAmount, setByAmount] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(formatTrDate(todayIso()));
  const [error, setError] = useState<string>();
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [fresh, setFresh] = useState<Record<string, RawQuote>>({});

  const info = kindInfo(kind);
  const accent = info.color;
  const symbol = kind === 'fx' ? fxSymbol : kind === 'metal' ? metalSymbol : normalizeSymbol(kind, symbolInput);
  const currency = assetCurrency(kind, symbol);
  const factor = priceFactor(kind);
  const manual = isManualPriced(kind);
  const tryCash = isTryCash(kind, symbol);
  const listed = stockInfo(kind, symbol);
  const commodity = kind === 'metal' ? commodityInfo(symbol) : undefined;
  const market = MARKET_OF[kind];
  const hasAsset = kind === 'fx' || kind === 'metal' || (symbol !== '' && (picked || kind === 'other'));
  const live = symbol ? resolveAssetQuote(kind, symbol, { ...quotes, ...fresh }, manualPrices) : undefined;
  const liveChange =
    live?.previousClose != null && live.previousClose > 0
      ? ((live.price - live.previousClose) / live.previousClose) * 100
      : undefined;

  // Seçili portföydeki pozisyon (bedelsizler uygulanmış)
  const assetTxs = applySplits(
    transactions.filter((t) => t.kind === kind && t.symbol === symbol),
    actionsByKey[`${kind}:${symbol}`] ?? [],
  );
  const position = computePosition(assetTxs);
  const held = position.quantity;

  const unitPrice = tryCash ? 1 : parseDecimal(price);
  const qty = byAmount && !tryCash ? unitsForAmount(kind, parseDecimal(amount), unitPrice) : parseDecimal(quantity);
  const total = qty > 0 && unitPrice > 0 ? qty * unitPrice * factor : undefined;

  // İşlem sonrası pozisyon ve satışta gerçekleşen kâr/zarar
  let after: (ReturnType<typeof computePosition> & { realized: number }) | undefined;
  if (qty > 0 && unitPrice > 0) {
    const next: Transaction = {
      id: 'yeni',
      kind,
      symbol,
      side,
      quantity: qty,
      price: unitPrice,
      date: '9999-12-31',
      createdAt: Number.MAX_SAFE_INTEGER,
    };
    const p = computePosition([...assetTxs, next]);
    after = { ...p, realized: p.realizedPnl - position.realizedPnl };
  }

  const suggestions = useMemo<MarketStock[]>(() => {
    if (lockedAsset || picked || !market || !symbolInput.trim()) return [];
    return searchStocks(symbolInput, MARKETS[market].stocks).slice(0, 6);
  }, [lockedAsset, picked, market, symbolInput]);

  async function fillCurrentPrice(k: AssetKind = kind, s: string = symbol) {
    setError(undefined);
    if (!s) {
      setError('Önce varlığı seç.');
      return;
    }
    const key = quoteSymbolFor(k, s);
    if (!key) return;
    const cur = assetCurrency(k, s);
    const needed = k === 'metal' && cur === 'TRY' ? [key, USDTRY_SYMBOL] : [key];
    setFetchingPrice(true);
    try {
      const got = await fetchAnyQuotes(needed);
      setFresh((prev) => ({ ...prev, ...got }));
      const q = resolveAssetQuote(k, s, { ...quotes, ...got }, {});
      if (q && needed.every((x) => got[x])) setPrice(toInputString(q.price));
      else setError(`"${displaySymbol(k, s)}" için fiyat bulunamadı. Kodu kontrol et.`);
    } finally {
      setFetchingPrice(false);
    }
  }

  // Menüden bir varlık seçilerek gelindiyse güncel fiyatı kendiliğinden doldur.
  useEffect(() => {
    if (!lockedAsset || isManualPriced(kind) || isTryCash(kind, symbol)) return;
    const t = setTimeout(() => fillCurrentPrice(), 0);
    return () => clearTimeout(t);
    // Yalnız ilk açılışta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseKind(k: AssetKind) {
    if (k === kind) return;
    setKind(k);
    setSymbolInput('');
    setPicked(false);
    setPrice('');
    setByAmount(false);
    setError(undefined);
    if (k === 'fx' && fxSymbol !== 'TRY') void fillCurrentPrice(k, fxSymbol);
    if (k === 'metal') void fillCurrentPrice(k, metalSymbol);
  }

  function pickStock(s: MarketStock) {
    setSymbolInput(s.code);
    setPicked(true);
    setError(undefined);
    if (!isManualPriced(kind)) void fillCurrentPrice(kind, normalizeSymbol(kind, s.code));
  }

  function pickOption(s: string) {
    if (kind === 'fx') setFxSymbol(s);
    else setMetalSymbol(s);
    setPrice('');
    if (!isTryCash(kind, s)) void fillCurrentPrice(kind, s);
  }

  function setShare(f: number) {
    if (!(held > 0)) return;
    setByAmount(false);
    const v = kind === 'bist' || kind === 'eurobond' ? Math.floor(held * f + 1e-9) : held * f;
    setQuantity(toInputString(Number(v.toFixed(6))));
  }

  function toggleAmountMode() {
    if (byAmount) {
      if (qty > 0) setQuantity(toInputString(qty));
    } else if (total != null) {
      setAmount(toInputString(Number(total.toFixed(2))));
    }
    setByAmount(!byAmount);
  }

  function save() {
    setError(undefined);
    if (!symbol) return setError('Önce varlığı seç.');
    if (kind === 'eurobond' && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(symbol)) {
      return setError('Eurobond için 12 haneli ISIN kodunu gir (ör. US900123DF45).');
    }
    if ((kind === 'fund' || kind === 'bes') && !/^[A-Z0-9]{3}$/.test(symbol)) {
      return setError('Fon kodu 3 karakter olmalı (ör. AFT).');
    }
    if (kind !== 'other' && !SYMBOL_PATTERN.test(symbol)) return setError('Kod yalnızca harf ve rakam içermeli.');
    if (!(unitPrice > 0)) return setError('Birim fiyat sıfırdan büyük olmalı.');
    if (!(qty > 0)) {
      return setError(
        byAmount ? 'Bu tutar bir birim almaya yetmiyor.' : `${quantityLabelFor(kind, symbol)} sıfırdan büyük olmalı.`,
      );
    }
    const iso = parseTrDate(date);
    if (!iso) return setError('Tarihi GG.AA.YYYY biçiminde yaz.');
    if (iso > todayIso()) return setError('Tarih ileri bir gün olamaz.');
    if (side === 'sell' && qty > held + 1e-9) {
      return setError(held > 0 ? `En fazla ${formatQuantity(held)} satabilirsin.` : 'Elinde bu varlıktan yok.');
    }
    addTransaction({ kind, symbol, side, quantity: qty, price: unitPrice, date: iso, portfolioId });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  }

  const unit = quantityUnit(kind, symbol);
  const buy = side === 'buy';
  const sideColor = buy ? c.buy : c.sell;
  const isoDate = parseTrDate(date);
  const name = commodity
    ? `${commodity.currency === 'USD' ? 'Dolar' : 'TL'} bazında · ${commodity.unit} fiyatı`
    : kind === 'fx'
      ? (fixedName(kind, symbol) ?? symbol)
      : (listed?.name ?? (kind === 'other' ? 'Elle fiyatlanan varlık' : info.label));

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets>
      {/* Varlık türü */}
      {!lockedAsset && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kindRow}
          style={styles.kindScroll}
          keyboardShouldPersistTaps="handled">
          {ASSET_KINDS.map((k) => {
            const sel = k.kind === kind;
            return (
              <Pressable
                key={k.kind}
                onPress={() => chooseKind(k.kind)}
                accessibilityRole="tab"
                accessibilityState={{ selected: sel }}
                style={({ pressed }) => [
                  styles.kindPill,
                  {
                    backgroundColor: sel ? alpha(k.color, 0.18) : c.card,
                    borderColor: sel ? k.color : c.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <CategoryIcon kind={k.kind} size={22} />
                <Text style={[Type.bodyStrong, { color: sel ? c.text : c.textSecondary, fontSize: 14 }]}>
                  {k.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Varlık seçimi: arama / seçenekler */}
      {!lockedAsset && (kind === 'fx' || kind === 'metal') && (
        <View style={styles.optionGrid}>
          {(kind === 'fx' ? FX_OPTIONS : METAL_OPTIONS).map((o) => {
            const sel = symbol === o.symbol;
            return (
              <Pressable
                key={o.symbol}
                onPress={() => pickOption(o.symbol)}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: sel ? alpha(accent, 0.16) : c.card,
                    borderColor: sel ? accent : c.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <AssetIcon kind={kind} symbol={o.symbol} label={o.symbol} color={accent} size={26} />
                <Text style={[Type.bodyStrong, { color: c.text, fontSize: 13.5, flex: 1 }]} numberOfLines={1}>
                  {o.name.replace(/\s*\(.*\)$/, '')}
                </Text>
                <Text style={[Type.caption, { color: c.textTertiary, fontFamily: Font.semibold }]}>
                  {currencySymbol(assetCurrency(kind, o.symbol))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!lockedAsset && kind !== 'fx' && kind !== 'metal' && (!picked || kind === 'other') && (
        <View>
          <View style={[styles.search, { backgroundColor: c.card, borderColor: symbolInput ? accent : c.border }]}>
            {kind !== 'other' && (
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path
                  d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"
                  stroke={c.textTertiary}
                  strokeWidth={2.2}
                  fill="none"
                  strokeLinecap="round"
                />
              </Svg>
            )}
            <TextInput
              value={symbolInput}
              onChangeText={(t) => {
                setSymbolInput(t);
                setPicked(false);
              }}
              placeholder={
                kind === 'other'
                  ? 'Varlık adı (ör. Mevduat)'
                  : kind === 'fund' || kind === 'bes'
                    ? 'Fon kodu ya da adı'
                    : kind === 'eurobond'
                      ? 'ISIN ya da vade (ör. 2030)'
                      : `Kod ya da ad (ör. ${info.placeholder})`
              }
              placeholderTextColor={c.textTertiary}
              autoCapitalize={kind === 'other' ? 'sentences' : 'characters'}
              autoCorrect={false}
              accessibilityLabel="Varlık ara"
              style={[styles.searchInput, { color: c.text }]}
            />
          </View>
          {suggestions.length > 0 && (
            <View style={[styles.suggest, { backgroundColor: c.card, borderColor: c.border }]}>
              {suggestions.map((s, i) => (
                <Pressable
                  key={s.code}
                  onPress={() => pickStock(s)}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.code} ${s.name}`}
                  style={({ pressed }) => [
                    styles.suggestRow,
                    i < suggestions.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: c.border,
                    },
                    pressed && { backgroundColor: c.chip },
                  ]}>
                  <AssetIcon kind={kind} symbol={s.code} label={s.code} color={accent} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[Type.bodyStrong, { color: c.text, fontSize: 15 }]} numberOfLines={1}>
                      {displaySymbol(kind, s.code)}
                    </Text>
                    <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={1}>
                      {s.name}
                    </Text>
                  </View>
                  <Svg width={14} height={14} viewBox="0 0 24 24">
                    <Path
                      d="M9 5l7 7-7 7"
                      stroke={c.textTertiary}
                      strokeWidth={2.6}
                      fill="none"
                      strokeLinecap="round"
                    />
                  </Svg>
                </Pressable>
              ))}
            </View>
          )}
          {kind !== 'other' && symbolInput.trim().length >= 2 && suggestions.length === 0 && !picked && (
            <Pressable onPress={() => pickStock({ code: symbol, name: symbol })} style={styles.useTyped}>
              <Text style={[Type.subhead, { color: c.link, fontSize: 13 }]}>
                Listede yok: &quot;{symbol}&quot; kodunu yine de kullan
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Varlık kartı */}
      {hasAsset && kind !== 'other' && (
        <View style={[styles.hero, { borderColor: alpha(accent, 0.55) }]}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={accent} stopOpacity={0.34} />
                <Stop offset="1" stopColor={accent} stopOpacity={0.06} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#hero)" />
          </Svg>
          <View style={styles.heroTop}>
            <AssetIcon kind={kind} symbol={symbol} label={symbol} color={accent} size={52} ring />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[Type.overline, { color: c.textSecondary }]}>{trUpper(info.label)}</Text>
              <Text style={[Type.title, { color: c.text, fontSize: 24 }]} numberOfLines={1}>
                {displaySymbol(kind, symbol)}
              </Text>
              <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12.5 }]} numberOfLines={1}>
                {name}
              </Text>
            </View>
            {!lockedAsset && kind !== 'fx' && kind !== 'metal' && (
              <Pressable
                onPress={() => {
                  setPicked(false);
                  setPrice('');
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Varlığı değiştir">
                <Text style={[Type.caption, { color: c.link, fontFamily: Font.semibold }]}>Değiştir</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.heroBottom}>
            <View>
              <Text style={[styles.heroLabel, { color: c.textSecondary }]}>{tryCash ? 'Değer' : 'Güncel fiyat'}</Text>
              <View style={styles.heroPriceRow}>
                {fetchingPrice && !live ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={[styles.heroPrice, { color: c.text }]}>
                    {live ? formatAssetPrice(kind, live.price, currency) : '—'}
                  </Text>
                )}
                {liveChange != null && !tryCash && (
                  <View style={[styles.changePill, { backgroundColor: pnlSoft(c, liveChange) }]}>
                    <Text style={[Type.caption, { color: pnlColor(c, liveChange), fontFamily: Font.semibold }]}>
                      {formatPct(liveChange)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            {held > 0 && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.heroLabel, { color: c.textSecondary }]}>Elinde</Text>
                <Text style={[Type.bodyStrong, styles.tabular, { color: c.text }]}>
                  {formatQuantity(held)} {unit}
                </Text>
                {!tryCash && (
                  <Text style={[Type.subhead, styles.tabular, { color: c.textSecondary, fontSize: 12 }]}>
                    ort. {formatAssetPrice(kind, position.avgCost, currency)}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {hasAsset && (
        <>
          {/* Alış / satış */}
          <View style={[styles.sideToggle, { backgroundColor: c.card }]}>
            {(['buy', 'sell'] as const).map((s) => {
              const sel = side === s;
              const col = s === 'buy' ? c.buy : c.sell;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSide(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  style={[styles.sideBtn, sel && { backgroundColor: col }]}>
                  <Svg width={16} height={16} viewBox="0 0 24 24">
                    <Path
                      d={s === 'buy' ? 'M12 5v14M6 13l6 6 6-6' : 'M12 19V5M6 11l6-6 6 6'}
                      stroke={sel ? '#FFFFFF' : c.textSecondary}
                      strokeWidth={2.6}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                  <Text style={[Type.headline, { color: sel ? '#FFFFFF' : c.textSecondary, fontSize: 16 }]}>
                    {s === 'buy' ? 'Alış' : 'Satış'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Miktar */}
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.label, { color: c.textSecondary }]}>
                {tryCash ? quantityLabelFor(kind, symbol) : buy ? 'Ne kadar alıyorsun?' : 'Ne kadar satıyorsun?'}
              </Text>
              {!tryCash && unitPrice > 0 && (
                <View style={[styles.modeSwitch, { backgroundColor: c.chip }]}>
                  {[false, true].map((m) => (
                    <Pressable
                      key={String(m)}
                      onPress={() => m !== byAmount && toggleAmountMode()}
                      accessibilityRole="button"
                      accessibilityState={{ selected: byAmount === m }}
                      style={[styles.modeBtn, byAmount === m && { backgroundColor: c.background }]}>
                      <Text
                        style={[
                          Type.caption,
                          { color: byAmount === m ? c.text : c.textSecondary, fontFamily: Font.semibold },
                        ]}>
                        {m ? 'Tutar' : quantityLabelFor(kind, symbol)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.bigRow}>
              {byAmount && <Text style={[styles.bigUnit, { color: c.textTertiary }]}>{currencySymbol(currency)}</Text>}
              <TextInput
                value={byAmount ? amount : quantity}
                onChangeText={byAmount ? setAmount : setQuantity}
                placeholder="0"
                placeholderTextColor={c.textTertiary}
                keyboardType="decimal-pad"
                accessibilityLabel={byAmount ? 'Tutar' : quantityLabelFor(kind, symbol)}
                style={[styles.bigInput, { color: c.text }]}
              />
              {!byAmount && <Text style={[styles.bigUnit, { color: c.textTertiary }]}>{unit}</Text>}
            </View>
            {byAmount && qty > 0 && (
              <Text style={[Type.subhead, { color: c.textSecondary }]}>
                ≈ {formatQuantity(qty)} {unit}
                {total != null && ` · ${formatMoney(total, currency)}`}
              </Text>
            )}
            {side === 'sell' && held > 0 && (
              <View style={styles.quickRow}>
                {[
                  { f: 0.25, l: '%25' },
                  { f: 0.5, l: '%50' },
                  { f: 1, l: 'Tümü' },
                ].map((q) => (
                  <Pressable
                    key={q.l}
                    onPress={() => setShare(q.f)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.quick, { backgroundColor: c.chip, opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={[Type.caption, { color: c.text, fontFamily: Font.semibold }]}>{q.l}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {side === 'sell' && held <= 0 && (
              <Text style={[Type.subhead, { color: c.textTertiary, fontSize: 12.5 }]}>
                Bu portföyde bu varlıktan yok.
              </Text>
            )}
          </View>

          {/* Fiyat */}
          {!tryCash && (
            <View style={[styles.card, { backgroundColor: c.card }]}>
              <View style={styles.cardHead}>
                <Text style={[styles.label, { color: c.textSecondary }]}>
                  {kind === 'eurobond'
                    ? `Fiyat (100 nominal, ${currencySymbol(currency)})`
                    : `${buy ? 'Alış' : 'Satış'} fiyatı (${currencySymbol(currency)})`}
                </Text>
                {!manual && (
                  <Pressable
                    onPress={() => fillCurrentPrice()}
                    disabled={fetchingPrice}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Güncel fiyatı kullan"
                    style={[styles.livePill, { backgroundColor: alpha(accent, 0.16) }]}>
                    {fetchingPrice ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <Text style={[Type.caption, { color: c.text, fontFamily: Font.semibold }]}>
                        {live ? `Güncel ${formatAssetPrice(kind, live.price, currency)}` : 'Güncel fiyat'} ↻
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
              <View style={styles.bigRow}>
                <Text style={[styles.midUnit, { color: c.textTertiary }]}>{currencySymbol(currency)}</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0,00"
                  placeholderTextColor={c.textTertiary}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Birim fiyat"
                  style={[styles.midInput, { color: c.text }]}
                />
              </View>
              {(kind === 'fund' || kind === 'bes') && (
                <Text style={[Type.subhead, { color: c.textTertiary, fontSize: 12.5 }]}>
                  Fon fiyatları TEFAS&apos;tan her gün gelir. İşlem gününün fon fiyatını gir.
                </Text>
              )}
            </View>
          )}

          {/* Tarih ve portföy */}
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Tarih</Text>
            <View style={styles.dateRow}>
              {[
                { l: 'Bugün', d: daysAgo(0) },
                { l: 'Dün', d: daysAgo(1) },
              ].map((q) => {
                const sel = isoDate === q.d;
                return (
                  <Pressable
                    key={q.l}
                    onPress={() => setDate(formatTrDate(q.d))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    style={[styles.dateChip, { backgroundColor: sel ? alpha(sideColor, 0.18) : c.chip }]}>
                    <Text style={[Type.caption, { color: sel ? c.text : c.textSecondary, fontFamily: Font.semibold }]}>
                      {q.l}
                    </Text>
                  </Pressable>
                );
              })}
              <TextInput
                value={date}
                onChangeText={setDate}
                placeholder="GG.AA.YYYY"
                placeholderTextColor={c.textTertiary}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Tarih (GG.AA.YYYY)"
                style={[styles.dateInput, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
              />
            </View>
            {portfolios.length > 1 && (
              <>
                <Text style={[styles.label, { color: c.textSecondary, marginTop: 14 }]}>Portföy</Text>
                <View style={styles.dateRow}>
                  {portfolios.map((p) => {
                    const sel = portfolioId === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setPortfolioId(p.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: sel }}
                        style={[styles.dateChip, { backgroundColor: sel ? c.tint : c.chip }]}>
                        <Text
                          style={[
                            Type.caption,
                            { color: sel ? '#FFFFFF' : c.textSecondary, fontFamily: Font.semibold },
                          ]}>
                          {p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>

          {/* Özet */}
          {total != null && after && (
            <View
              style={[styles.summary, { borderColor: alpha(sideColor, 0.5), backgroundColor: alpha(sideColor, 0.08) }]}>
              <SummaryLine
                label={buy ? 'Ödenecek' : 'Alınacak'}
                value={formatMoney(total, currency)}
                strong
                note={
                  tryCash
                    ? undefined
                    : `${formatQuantity(qty)} ${unit} × ${formatAssetPrice(kind, unitPrice, currency)}`
                }
              />
              {buy ? (
                <SummaryLine
                  label="İşlem sonrası"
                  value={`${formatQuantity(after.quantity)} ${unit}`}
                  note={tryCash ? undefined : `ort. maliyet ${formatAssetPrice(kind, after.avgCost, currency)}`}
                />
              ) : (
                <>
                  {!tryCash && (
                    <SummaryLine
                      label="Gerçekleşen kâr/zarar"
                      value={formatMoney(after.realized, currency, { signed: true })}
                      valueColor={pnlColor(c, after.realized)}
                      note={
                        position.avgCost > 0
                          ? formatPct((unitPrice / position.avgCost - 1) * 100, { signed: true, decimals: 1 })
                          : undefined
                      }
                    />
                  )}
                  <SummaryLine label="Kalan" value={`${formatQuantity(after.quantity)} ${unit}`} />
                </>
              )}
            </View>
          )}

          {error && <Text style={[styles.error, { color: c.negative }]}>{error}</Text>}

          <Pressable
            onPress={save}
            accessibilityRole="button"
            accessibilityLabel={buy ? 'Alışı kaydet' : 'Satışı kaydet'}
            style={({ pressed }) => [styles.saveBtn, { backgroundColor: sideColor, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={[Type.headline, styles.saveText]}>{buy ? 'Alışı kaydet' : 'Satışı kaydet'}</Text>
            {total != null && (
              <Text style={[Type.subhead, styles.saveSub]}>
                {formatMoney(total, currency)}
                {isoDate && isoDate !== todayIso() ? ` · ${formatTrDate(isoDate)}` : ''}
              </Text>
            )}
          </Pressable>
        </>
      )}

      {!hasAsset && (
        <Text style={[Type.subhead, styles.empty, { color: c.textTertiary }]}>
          {kind === 'other'
            ? 'Mevduat, gayrimenkul gibi fiyatını elle gireceğin bir varlık için ad yaz.'
            : `${info.label} listesinde ara ve eklemek istediğin varlığı seç.`}
        </Text>
      )}
    </ScrollView>
  );
}

function SummaryLine({
  label,
  value,
  note,
  strong,
  valueColor,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
  valueColor?: string;
}) {
  const c = useColors();
  return (
    <View style={styles.sumLine}>
      <View style={{ flex: 1 }}>
        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 13 }]}>{label}</Text>
        {note ? <Text style={[Type.caption, { color: c.textTertiary, marginTop: 1 }]}>{note}</Text> : null}
      </View>
      <Text style={[strong ? styles.sumStrong : Type.bodyStrong, styles.tabular, { color: valueColor ?? c.text }]}>
        {value}
      </Text>
    </View>
  );
}

/** Web'de tarayıcının odak çerçevesi yerine kartın kendi kenarlığı. */
// Chrome odak halkasında genişliği yok sayar; stil türlerinde "none" olmadığı için dönüştürülür.
const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  tabular: { fontVariant: ['tabular-nums'] },
  kindScroll: { marginHorizontal: -16 },
  kindRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 2 },
  kindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 7,
    paddingRight: 14,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '48.5%',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, minWidth: 0, fontFamily: Font.semibold, fontSize: 17, paddingVertical: 14, ...NO_OUTLINE },
  suggest: { marginTop: 8, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  useTyped: { paddingTop: 10, paddingHorizontal: 4 },
  hero: { borderRadius: Radius.lg, borderWidth: 1, padding: 16, gap: 16, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  heroLabel: { fontFamily: Font.medium, fontSize: 12 },
  heroPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, minHeight: 30 },
  heroPrice: { fontFamily: Font.bold, fontSize: 24, fontVariant: ['tabular-nums'] },
  changePill: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  sideToggle: { flexDirection: 'row', borderRadius: Radius.pill, padding: 4, gap: 4 },
  sideBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    paddingVertical: 12,
  },
  card: { borderRadius: Radius.lg, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26 },
  label: { fontSize: 13, fontFamily: Font.semibold, letterSpacing: 0.2 },
  modeSwitch: { flexDirection: 'row', borderRadius: Radius.pill, padding: 3 },
  modeBtn: { borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  bigInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: Font.bold,
    fontSize: 38,
    paddingVertical: 2,
    fontVariant: ['tabular-nums'],
    ...NO_OUTLINE,
  },
  bigUnit: { fontFamily: Font.semibold, fontSize: 18 },
  midInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: Font.bold,
    fontSize: 26,
    paddingVertical: 2,
    fontVariant: ['tabular-nums'],
    ...NO_OUTLINE,
  },
  midUnit: { fontFamily: Font.semibold, fontSize: 20 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quick: { borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  livePill: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: 26,
    justifyContent: 'center',
  },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  dateChip: { borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  dateInput: {
    flex: 1,
    minWidth: 130,
    fontFamily: Font.semibold,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summary: { borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 6 },
  sumLine: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  sumStrong: { fontFamily: Font.extrabold, fontSize: 20 },
  error: { fontSize: 14.5, fontFamily: Font.medium, textAlign: 'center' },
  saveBtn: { borderRadius: Radius.lg, paddingVertical: 15, alignItems: 'center', gap: 2 },
  saveText: { color: '#FFFFFF', fontSize: 17 },
  saveSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5 },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 24, lineHeight: 20 },
});
