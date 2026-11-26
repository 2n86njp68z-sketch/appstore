import { router } from 'expo-router';
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ListViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { CategoryIcon } from '@/components/asset-icon';
import { CompanyLogo } from '@/components/company-logo';
import { pnlColor, pnlSoft, Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { paletteFor } from '@/lib/donut';
import { BIST_STOCKS, searchBist, type BistStock } from '@/lib/bist';
import { formatNumber, formatPct } from '@/lib/format';
import { fetchQuotesBatched } from '@/lib/prices';
import type { AssetKind, RawQuote } from '@/lib/types';

// ---------------------------------------------------------------------------
// Açma/kapama

interface DrawerContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useMarketDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useMarketDrawer, MarketDrawerProvider içinde kullanılmalı');
  return ctx;
}

export function MarketDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);
  return (
    <DrawerContext.Provider value={value}>
      {children}
      <MarketDrawer open={isOpen} onClose={close} />
    </DrawerContext.Provider>
  );
}

/** Sol üstteki ☰ düğmesi. */
export function DrawerButton() {
  const c = useColors();
  const { open } = useMarketDrawer();
  return (
    <Pressable
      onPress={open}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Piyasalar menüsünü aç"
      style={({ pressed }) => [styles.menuButton, { backgroundColor: c.chip, opacity: pressed ? 0.7 : 1 }]}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.menuLine, { backgroundColor: c.text, width: i === 1 ? 12 : 16 }]} />
      ))}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Fiyatlar: yalnız ekranda görünen hisseler için, 20'li gruplar halinde

const QUOTE_TTL_MS = 2 * 60 * 1000;

function useVisibleQuotes(seed: Record<string, RawQuote>) {
  const [quotes, setQuotes] = useState<Record<string, RawQuote>>({});
  const quotesRef = useRef(quotes);
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seedRef = useRef(seed);
  useEffect(() => {
    seedRef.current = seed;
  }, [seed]);
  useEffect(() => {
    quotesRef.current = quotes;
  }, [quotes]);

  const request = useCallback((codes: string[]) => {
    const now = Date.now();
    for (const code of codes) {
      const sym = `${code}.IS`;
      const have = quotesRef.current[sym] ?? seedRef.current[sym];
      if (!have || now - have.fetchedAt > QUOTE_TTL_MS) pending.current.add(sym);
    }
    if (timer.current || pending.current.size === 0) return;
    timer.current = setTimeout(async () => {
      timer.current = null;
      const batch = [...pending.current];
      pending.current.clear();
      const got = await fetchQuotesBatched(batch, undefined, 16).catch(() => ({}));
      if (Object.keys(got).length) setQuotes((prev) => ({ ...prev, ...got }));
    }, 250);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { quotes, request };
}

// ---------------------------------------------------------------------------
// Bölümler

interface MarketSection {
  key: string;
  title: string;
  icon: ReactNode;
  available: boolean;
  data: BistStock[];
}

function EtfIcon({ size }: { size: number }) {
  return (
    <View style={[styles.etf, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[Type.caption, { color: '#FFFFFF', fontSize: size * 0.3 }]}>ETF</Text>
    </View>
  );
}

const SECTION_DEFS: { key: string; title: string; kind?: AssetKind; available: boolean }[] = [
  { key: 'bist', title: 'Türk Market', kind: 'bist', available: true },
  { key: 'us', title: 'ABD Market', kind: 'us', available: false },
  { key: 'metal', title: 'Emtia', kind: 'metal', available: false },
  { key: 'fund', title: 'Fon', kind: 'other', available: false },
  { key: 'etf', title: 'ABD ETF', available: false },
];

const BIST_COLORS = paletteFor('bist');

function MarketDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.9, 400);
  const { quotes: portfolioQuotes } = usePortfolio();
  const { quotes, request } = useVisibleQuotes(portfolioQuotes);

  // Kapanma animasyonu bitene kadar menü ekranda kalır.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const [progress] = useState(() => new Animated.Value(0));
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>('bist');

  // Aç/kapa animasyonu
  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 260 : 200,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    if (!open) Keyboard.dismiss();
  }, [open, progress]);

  // Android geri tuşu menüyü kapatsın
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  // Sola kaydırınca kapanır
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -50 || g.vx < -0.5) onClose();
        },
      }),
    [onClose],
  );

  const searching = query.trim().length > 0;
  const results = useMemo(() => (searching ? searchBist(query) : BIST_STOCKS), [query, searching]);

  const sections: MarketSection[] = SECTION_DEFS.filter((d) => !searching || d.key === 'bist').map((d) => ({
    key: d.key,
    title: d.title,
    available: d.available,
    icon: d.kind ? <CategoryIcon kind={d.kind} size={30} /> : <EtfIcon size={30} />,
    data: d.key === 'bist' && (searching || expanded === 'bist') ? (results as BistStock[]) : [],
  }));

  const colorFor = useCallback((code: string) => {
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
    return BIST_COLORS[h % BIST_COLORS.length];
  }, []);

  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);
  // FlatList bu geri çağırmanın hiç değişmemesini ister.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const codes = viewableItems.map((v) => (v.item as BistStock | undefined)?.code).filter(Boolean) as string[];
    if (codes.length) requestRef.current(codes);
  }, []);

  const openStock = useCallback(
    (code: string) => {
      onClose();
      router.push({ pathname: '/add', params: { kind: 'bist', symbol: code } });
    },
    [onClose],
  );

  const fallbackCode = query
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const showFallback = searching && results.length === 0 && /^[A-Z0-9]{3,6}$/.test(fallbackCode);

  if (!mounted) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer, { pointerEvents: open ? 'auto' : 'none' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Menüyü kapat" />
      </Animated.View>
      <Animated.View
        {...pan.panHandlers}
        style={[
          styles.panel,
          {
            width: panelWidth,
            backgroundColor: c.background,
            borderRightColor: c.border,
            paddingTop: insets.top + 12,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] }) }],
          },
        ]}>
        <View style={styles.headerRow}>
          <Text style={[Type.title, { color: c.text, fontSize: 24 }]}>Piyasalar</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Line x1={6} y1={6} x2={18} y2={18} stroke={c.textSecondary} strokeWidth={2.2} strokeLinecap="round" />
              <Line x1={18} y1={6} x2={6} y2={18} stroke={c.textSecondary} strokeWidth={2.2} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </View>

        <View style={[styles.search, { backgroundColor: c.chip }]}>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Circle cx={10.5} cy={10.5} r={6.5} stroke={c.textSecondary} strokeWidth={2.2} fill="none" />
            <Path d="M15.5 15.5 L20 20" stroke={c.textSecondary} strokeWidth={2.2} strokeLinecap="round" />
          </Svg>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Hisse ara: kod veya şirket adı"
            placeholderTextColor={c.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={[Type.body, styles.searchInput, { color: c.text }]}
            accessibilityLabel="Hisse ara"
          />
          {searching && Platform.OS !== 'ios' && (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Aramayı temizle">
              <Text style={[Type.bodyStrong, { color: c.textSecondary }]}>✕</Text>
            </Pressable>
          )}
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.code}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={14}
          maxToRenderPerBatch={16}
          windowSize={7}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 10, minimumViewTime: 150 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderSectionHeader={({ section }) => (
            <SectionHeader
              section={section as MarketSection}
              expanded={searching || expanded === section.key}
              count={section.key === 'bist' ? (searching ? results.length : BIST_STOCKS.length) : undefined}
              onPress={() => {
                if (!section.available || searching) return;
                setExpanded((prev) => (prev === section.key ? null : section.key));
              }}
            />
          )}
          renderItem={({ item }) => (
            <StockRow
              stock={item}
              quote={quotes[`${item.code}.IS`] ?? portfolioQuotes[`${item.code}.IS`]}
              color={colorFor(item.code)}
              onPress={openStock}
            />
          )}
          ListFooterComponent={
            showFallback ? (
              <Pressable onPress={() => openStock(fallbackCode)} style={styles.fallback} accessibilityRole="button">
                <Text style={[Type.body, { color: c.textSecondary }]}>
                  Listede yok. <Text style={{ color: c.link }}>{fallbackCode} kodunu ekle ›</Text>
                </Text>
              </Pressable>
            ) : searching && results.length === 0 ? (
              <Text style={[Type.body, styles.fallback, { color: c.textSecondary }]}>Sonuç bulunamadı.</Text>
            ) : undefined
          }
        />
      </Animated.View>
    </View>
  );
}

function SectionHeader({
  section,
  expanded,
  count,
  onPress,
}: {
  section: MarketSection;
  expanded: boolean;
  count?: number;
  onPress: () => void;
}) {
  const c = useColors();
  const active = section.available && expanded;
  return (
    <View style={{ backgroundColor: c.background }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: active, disabled: !section.available }}
        style={({ pressed }) => [
          styles.sectionRow,
          { backgroundColor: active ? c.card : 'transparent', opacity: pressed ? 0.75 : 1 },
        ]}>
        {section.icon}
        <Text style={[Type.headline, styles.sectionTitle, { color: c.text }]}>{section.title}</Text>
        {section.available ? (
          <>
            {count != null && <Text style={[Type.subhead, { color: c.textTertiary }]}>{count}</Text>}
            <Svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
              <Path
                d="M9 5 L16 12 L9 19"
                stroke={c.textSecondary}
                strokeWidth={2.6}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </>
        ) : (
          <View style={[styles.soon, { backgroundColor: c.chip }]}>
            <Text style={[Type.caption, { color: c.textSecondary, fontSize: 11 }]}>yakında</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const StockRow = memo(function StockRow({
  stock,
  quote,
  color,
  onPress,
}: {
  stock: BistStock;
  quote?: RawQuote;
  color: string;
  onPress: (code: string) => void;
}) {
  const c = useColors();
  const change =
    quote?.previousClose != null && quote.previousClose > 0
      ? ((quote.price - quote.previousClose) / quote.previousClose) * 100
      : undefined;
  return (
    <Pressable
      onPress={() => onPress(stock.code)}
      accessibilityRole="button"
      accessibilityLabel={`${stock.code} ${stock.name}`}
      style={({ pressed }) => [styles.stockRow, pressed && { backgroundColor: c.card }]}>
      <CompanyLogo code={stock.code} label={stock.code} color={color} size={36} />
      <View style={styles.stockMain}>
        <Text style={[Type.headline, { color: c.text, fontSize: 15 }]} numberOfLines={1}>
          {stock.code}
        </Text>
        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={1}>
          {stock.name}
        </Text>
      </View>
      <Text style={[Type.number, styles.price, { color: quote ? c.text : c.textTertiary }]} numberOfLines={1}>
        {quote ? formatNumber(quote.price, 2, 2) : '—'}
      </Text>
      <View style={[styles.change, { backgroundColor: change != null ? pnlSoft(c, change) : c.chip }]}>
        <Text
          style={[Type.caption, styles.changeText, { color: change != null ? pnlColor(c, change) : c.textTertiary }]}>
          {change != null ? formatPct(change) : '—'}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  menuLine: {
    height: 2,
    borderRadius: 1,
  },
  layer: {
    zIndex: 100,
    elevation: 100,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: Radius.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    height: 44,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  sectionTitle: {
    flex: 1,
  },
  soon: {
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  etf: {
    backgroundColor: '#7C5CFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  stockMain: {
    flex: 1,
    minWidth: 0,
  },
  price: {
    fontSize: 14,
    minWidth: 60,
    textAlign: 'right',
  },
  change: {
    minWidth: 66,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 5,
    alignItems: 'flex-end',
  },
  changeText: {
    fontVariant: ['tabular-nums'],
  },
  fallback: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
});
