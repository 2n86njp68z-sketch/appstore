import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
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

import { AssetIcon, CategoryIcon, CompareMark, FlagIcon, IndexMark, PairIcon } from '@/components/asset-icon';
import { CompanyLogo } from '@/components/company-logo';
import { TrendIcon } from '@/components/trend-icon';
import { pnlColor, pnlSoft, Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { paletteFor } from '@/lib/donut';
import { formatNumber, formatPct, formatPrice } from '@/lib/format';
import { MARKETS, searchStocks, type MarketKey, type MarketStock } from '@/lib/markets';
import { commodityInfo, displaySymbol } from '@/lib/assets';
import { fetchGrafikCatalog, portfolioCompareLink } from '@/lib/grafik';
import {
  COMPARE_LINKS,
  OVERVIEW,
  searchLinks,
  searchOverview,
  type LinkItem,
  type OverviewItem,
  type OverviewKey,
} from '@/lib/overview';
import { resolveAssetQuote } from '@/lib/portfolio';
import { fetchAnyQuotes } from '@/lib/prices';
import type { AssetKind, AssetQuote, RawQuote } from '@/lib/types';

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

/** Arama ya da bölüm açılışında fiyatı hemen istenen satır sayısı (ekranı dolduracak kadar). */
const FIRST_ROWS = 20;

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

  const request = useCallback((symbols: string[]) => {
    const now = Date.now();
    for (const sym of symbols) {
      const have = quotesRef.current[sym] ?? seedRef.current[sym];
      if (!have || now - have.fetchedAt > QUOTE_TTL_MS) pending.current.add(sym);
    }
    if (timer.current || pending.current.size === 0) return;
    timer.current = setTimeout(async () => {
      timer.current = null;
      const batch = [...pending.current];
      pending.current.clear();
      const got = await fetchAnyQuotes(batch, undefined, 16).catch(() => ({}));
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

interface StockItem {
  key: string;
  market: MarketKey;
  stock: MarketStock;
}

/** Endeks ve kur satırı. */
interface OverviewRowItem {
  key: string;
  overview: OverviewItem;
}

/** Karşılaştır bölümündeki site bağlantısı. */
interface LinkRowItem {
  key: string;
  link: LinkItem;
}

/** "Portföyümü karşılaştır": portföyün en büyük varlıkları Grafik'te aynı grafikte. */
interface PortfolioCompareItem {
  key: 'compare:portfolio';
  portfolioCompare: true;
}

type ListItem = StockItem | OverviewRowItem | LinkRowItem | PortfolioCompareItem;

interface MarketSection {
  key: string;
  title: string;
  icon: ReactNode;
  available: boolean;
  market?: MarketKey;
  /** Başlıkta görünen hisse sayısı. */
  total?: number;
  data: ListItem[];
}

type SectionDef =
  | { key: string; title: string; kind: AssetKind; market: MarketKey; overview?: undefined; links?: undefined }
  | { key: OverviewKey; title: string; overview: OverviewKey; kind?: undefined; market?: undefined; links?: undefined }
  | { key: 'compare'; title: string; links: true; kind?: undefined; market?: undefined; overview?: undefined };

const SECTION_DEFS: SectionDef[] = [
  // Türk bayraklılar, ABD bayraklılar alt alta; ardından emtia, kripto, endeksler ve kurlar.
  { key: 'bist', title: 'Türk Market', kind: 'bist', market: 'bist' },
  { key: 'fund', title: 'TEFAS', kind: 'fund', market: 'fund' },
  { key: 'bes', title: 'BES', kind: 'bes', market: 'bes' },
  { key: 'us', title: 'ABD Market', kind: 'us', market: 'us' },
  { key: 'etf', title: 'ABD ETF', kind: 'etf', market: 'etf' },
  { key: 'metal', title: 'Emtia', kind: 'metal', market: 'metal' },
  { key: 'crypto', title: 'Kripto', kind: 'crypto', market: 'crypto' },
  { key: 'index', title: OVERVIEW.index.title, overview: 'index' },
  { key: 'rates', title: OVERVIEW.rates.title, overview: 'rates' },
  { key: 'compare', title: COMPARE_LINKS.title, links: true },
];

const MARKET_KEYS = SECTION_DEFS.flatMap((d) => (d.market ? [d.market] : []));

const OVERVIEW_ROWS = Object.fromEntries(
  (Object.keys(OVERVIEW) as OverviewKey[]).map((k) => [
    k,
    OVERVIEW[k].items.map((o) => ({ key: `${k}:${o.quoteKey}`, overview: o })),
  ]),
) as Record<OverviewKey, OverviewRowItem[]>;

const PORTFOLIO_COMPARE_ROW: PortfolioCompareItem = { key: 'compare:portfolio', portfolioCompare: true };
const LINK_ROWS: ListItem[] = [
  PORTFOLIO_COMPARE_ROW,
  ...COMPARE_LINKS.items.map((link) => ({ key: `link:${link.url}`, link })),
];

function overviewIcon(key: OverviewKey, size: number) {
  return key === 'index' ? <IndexMark size={size} /> : <CategoryIcon kind="fx" size={size} />;
}

/** Her piyasanın satır nesneleri bir kez oluşturulur (arama sonuçları da aynı nesneleri kullanır). */
const itemCache = new Map<MarketKey, { list: StockItem[]; byCode: Map<string, StockItem> }>();

function itemsFor(market: MarketKey) {
  let entry = itemCache.get(market);
  if (!entry) {
    const list = MARKETS[market].stocks.map((stock) => ({ key: `${market}:${stock.code}`, market, stock }));
    entry = { list, byCode: new Map(list.map((i) => [i.stock.code, i])) };
    itemCache.set(market, entry);
  }
  return entry;
}

const PALETTES = Object.fromEntries(MARKET_KEYS.map((m) => [m, paletteFor(MARKETS[m].kind)])) as Record<
  MarketKey,
  string[]
>;

/** Logosu olmayan hisseler için koddan sabit bir rozet rengi. */
function colorFor(market: MarketKey, code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  const palette = PALETTES[market];
  return palette[h % palette.length];
}

function MarketDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.9, 400);
  const { quotes: portfolioQuotes, manualPrices } = usePortfolio();
  const { quotes, request } = useVisibleQuotes(portfolioQuotes);

  // Kapanma animasyonu bitene kadar menü ekranda kalır.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const [progress] = useState(() => new Animated.Value(0));
  const [query, setQuery] = useState('');
  // Açılışta bölümler kapalı; dokunulan bölüm aşağı doğru açılır (aynı anda tek bölüm açık).
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const allQuotes = useMemo(() => ({ ...portfolioQuotes, ...quotes }), [portfolioQuotes, quotes]);
  const searching = query.trim().length > 0;
  // Arama tüm piyasalarda birden yapılır.
  const results = useMemo<Record<MarketKey, MarketStock[]> | null>(
    () =>
      searching
        ? (Object.fromEntries(MARKET_KEYS.map((m) => [m, searchStocks(query, MARKETS[m].stocks)])) as Record<
            MarketKey,
            MarketStock[]
          >)
        : null,
    [query, searching],
  );
  const overviewResults = useMemo<Record<OverviewKey, OverviewItem[]> | null>(
    () =>
      searching
        ? {
            index: searchOverview(query, OVERVIEW.index.items),
            rates: searchOverview(query, OVERVIEW.rates.items),
          }
        : null,
    [query, searching],
  );
  const linkResults = useMemo(() => (searching ? searchLinks(query, COMPARE_LINKS.items) : null), [query, searching]);
  const noResults =
    results != null &&
    MARKET_KEYS.every((m) => results[m].length === 0) &&
    overviewResults != null &&
    overviewResults.index.length === 0 &&
    overviewResults.rates.length === 0 &&
    linkResults != null &&
    linkResults.length === 0;

  const sections: MarketSection[] = SECTION_DEFS.filter((d) => {
    if (!results || !overviewResults || !linkResults) return true;
    if (d.links) return linkResults.length > 0;
    return d.market ? results[d.market].length > 0 : overviewResults[d.overview].length > 0;
  }).map((d) => {
    if (d.links) {
      return {
        key: d.key,
        title: d.title,
        available: true,
        icon: <CompareMark size={30} />,
        total: linkResults ? linkResults.length + 1 : LINK_ROWS.length,
        data: linkResults
          ? LINK_ROWS.filter((r) => !('link' in r) || linkResults.includes(r.link))
          : expanded === d.key
            ? LINK_ROWS
            : [],
      };
    }
    if (d.overview) {
      const found = overviewResults?.[d.overview];
      const rows = OVERVIEW_ROWS[d.overview];
      return {
        key: d.key,
        title: d.title,
        available: true,
        icon: overviewIcon(d.overview, 30),
        total: found ? found.length : rows.length,
        data: found ? rows.filter((r) => found.includes(r.overview)) : expanded === d.key ? rows : [],
      };
    }
    const m = d.market;
    let data: StockItem[] = [];
    if (m && results) {
      const { byCode } = itemsFor(m);
      data = results[m].map((stock) => byCode.get(stock.code)!);
    } else if (m && expanded === d.key) {
      data = itemsFor(m).list;
    }
    return {
      key: d.key,
      title: d.title,
      available: m != null,
      market: m,
      icon: <CategoryIcon kind={d.kind} size={30} />,
      total: m ? (results ? results[m].length : MARKETS[m].stocks.length) : undefined,
      data,
    };
  });

  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);
  // FlatList bu geri çağırmanın hiç değişmemesini ister.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const symbols: string[] = [];
    for (const v of viewableItems) {
      // Bölüm başlıklarının kaydında satır yerine bölüm nesnesi gelir: yalnız satırlar alınır.
      const item = v.item as Partial<StockItem & OverviewRowItem> | undefined;
      if (item?.overview) symbols.push(item.overview.quoteKey);
      else if (item?.stock && item.market) symbols.push(...MARKETS[item.market].quoteKeys(item.stock.code));
    }
    if (symbols.length) requestRef.current(symbols);
  }, []);

  // Arama sonucu değişince ya da bir bölüm açılınca ilk satırların fiyatı hemen istenir: liste verisi
  // değiştiğinde görünürlük bildirimi her zaman gelmiyor (özellikle web'de).
  useEffect(() => {
    if (!open) return;
    const defs = results ? SECTION_DEFS : SECTION_DEFS.filter((d) => d.key === expanded);
    const symbols: string[] = [];
    // Endeks ve kur bölümleri kısa: hepsi birden istenir.
    for (const d of defs) {
      if (d.overview) {
        const items = overviewResults ? overviewResults[d.overview] : OVERVIEW[d.overview].items;
        symbols.push(...items.map((i) => i.quoteKey));
      }
    }
    const lists = defs.flatMap((d) =>
      d.market && !MARKETS[d.market].manual
        ? [[d.market, results ? results[d.market] : MARKETS[d.market].stocks] as const]
        : [],
    );
    let budget = FIRST_ROWS;
    for (const [m, list] of lists) {
      for (const stock of list.slice(0, budget)) symbols.push(...MARKETS[m].quoteKeys(stock.code));
      budget -= Math.min(budget, list.length);
      if (budget === 0) break;
    }
    if (symbols.length) request(symbols);
  }, [open, results, overviewResults, expanded, request]);

  // Kripto açılınca tüm listenin fiyatı bir kerede (100'lük gruplarla) alınır; CoinGecko'nun ücretsiz
  // servisi dakikalık istek sınırı uyguladığı için kaydırdıkça ayrı ayrı istemekten daha güvenli.
  const cryptoVisible = expanded === 'crypto' || (results != null && results.crypto.length > 0);
  useEffect(() => {
    if (!open || !cryptoVisible) return;
    request(MARKETS.crypto.stocks.flatMap((s) => MARKETS.crypto.quoteKeys(s.code)));
  }, [open, cryptoVisible, request]);

  const openStock = useCallback(
    (market: MarketKey, code: string) => {
      onClose();
      router.push({ pathname: '/add', params: { kind: MARKETS[market].kind, symbol: code } });
    },
    [onClose],
  );

  // Dövizlere dokununca portföye eklenir; endeksler yalnız izlenir.
  const openOverview = useCallback(
    (o: OverviewItem) => {
      if (!o.asset) return;
      onClose();
      router.push({ pathname: '/add', params: { kind: o.asset.kind, symbol: o.asset.symbol } });
    },
    [onClose],
  );

  // Listede olmayan bir kod yazıldıysa yine de eklenebilsin.
  const fallbackCode = query
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, '');
  const fallbackMarkets = noResults
    ? (['bist', 'us'] as MarketKey[]).filter((m) =>
        m === 'bist' ? /^[A-Z0-9]{3,6}$/.test(fallbackCode) : /^[A-Z]{1,5}(\.[A-Z])?$/.test(fallbackCode),
      )
    : [];

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
          keyExtractor={(item) => item.key}
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
              count={(section as MarketSection).total}
              onPress={() => {
                if (!section.available || searching) return;
                setExpanded((prev) => (prev === section.key ? null : section.key));
              }}
            />
          )}
          renderItem={({ item }: { item: ListItem }) => {
            if ('portfolioCompare' in item) return <PortfolioCompareRow />;
            if ('link' in item) return <LinkRow item={item.link} />;
            if ('overview' in item) {
              return (
                <OverviewRow item={item.overview} quote={allQuotes[item.overview.quoteKey]} onPress={openOverview} />
              );
            }
            const def = MARKETS[item.market];
            // Görünen satırların fiyatları + portföyde zaten olanlar; emtia kurla hesaplanır, fonlar elle girilir.
            const q = resolveAssetQuote(def.kind, item.stock.code, allQuotes, manualPrices);
            return <StockRow item={item} quote={q} onPress={openStock} />;
          }}
          ListFooterComponent={
            noResults ? (
              <View style={styles.fallback}>
                <Text style={[Type.body, { color: c.textSecondary }]}>Sonuç bulunamadı.</Text>
                {fallbackMarkets.map((m) => (
                  <Pressable key={m} onPress={() => openStock(m, fallbackCode)} hitSlop={6} accessibilityRole="button">
                    <Text style={[Type.bodyStrong, styles.fallbackLink, { color: c.link }]}>
                      {`${fallbackCode} kodunu ${MARKETS[m].title}'e ekle ›`}
                    </Text>
                  </Pressable>
                ))}
              </View>
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

/**
 * Portföyün en büyük 4 varlığını (Grafik'te bulunanlar) Grafik'te aynı grafikte açar. Grafik'in listesi
 * satır görününce indirilir; liste gelmeden dokunulursa eşleşen tüm semboller kullanılır.
 */
function PortfolioCompareRow() {
  const c = useColors();
  const { holdings } = usePortfolio();
  const [catalog, setCatalog] = useState<Set<string> | null>(null);
  useEffect(() => {
    let alive = true;
    fetchGrafikCatalog()
      .then((set) => alive && setCatalog(set))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const link = portfolioCompareLink(holdings, catalog);
  const subtitle = link
    ? `${link.holdings.map((h) => displaySymbol(h.kind, h.symbol)).join(', ')} · temettü dahil, aynı grafikte`
    : holdings.length === 0
      ? 'Önce portföye varlık ekle'
      : 'Portföyündeki varlıklar Grafik listesinde yok';
  return (
    <Pressable
      onPress={async () => {
        const set = catalog ?? (await fetchGrafikCatalog().catch(() => null));
        const target = portfolioCompareLink(holdings, set);
        if (target) void WebBrowser.openBrowserAsync(target.url);
      }}
      disabled={!link}
      accessibilityRole="link"
      accessibilityLabel={`Portföyümü karşılaştır: ${subtitle}`}
      style={({ pressed }) => [
        styles.stockCard,
        { backgroundColor: c.card, borderColor: c.border, opacity: link ? 1 : 0.6 },
        pressed && { opacity: 0.6 },
      ]}>
      <View style={[styles.stockBar, { backgroundColor: '#7C5CFF' }]} />
      <CompareMark size={36} />
      <View style={styles.stockMain}>
        <Text style={[Type.headline, { color: c.text, fontSize: 15 }]} numberOfLines={1}>
          Portföyümü karşılaştır
        </Text>
        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <ExternalIcon color={c.textSecondary} />
    </Pressable>
  );
}

function ExternalIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityLabel="Tarayıcıda açılır">
      <Path
        d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
        stroke={color}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Site bağlantısı: uygulama içi tarayıcıda (iOS'ta Safari penceresi) açılır. */
const LinkRow = memo(function LinkRow({ item }: { item: LinkItem }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        void WebBrowser.openBrowserAsync(item.url);
      }}
      accessibilityRole="link"
      accessibilityLabel={`${item.code}: ${item.name}`}
      style={({ pressed }) => [
        styles.stockCard,
        { backgroundColor: c.card, borderColor: c.border },
        pressed && { opacity: 0.6 },
      ]}>
      <View style={[styles.stockBar, { backgroundColor: '#7C5CFF' }]} />
      <CompanyLogo logoUrl={item.logo} label={item.code} color="#7C5CFF" size={36} />
      <View style={styles.stockMain}>
        <Text style={[Type.headline, { color: c.text, fontSize: 15 }]} numberOfLines={1}>
          {item.code}
        </Text>
        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={2}>
          {item.name}
        </Text>
      </View>
      <ExternalIcon color={c.textSecondary} />
    </Pressable>
  );
});

const OverviewRow = memo(function OverviewRow({
  item,
  quote,
  onPress,
}: {
  item: OverviewItem;
  quote?: RawQuote;
  onPress: (item: OverviewItem) => void;
}) {
  const c = useColors();
  const change =
    quote?.previousClose != null && quote.previousClose > 0
      ? ((quote.price - quote.previousClose) / quote.previousClose) * 100
      : undefined;
  const barColor = change == null || change === 0 ? c.border : pnlColor(c, change);
  const value = quote
    ? item.currency
      ? formatPrice(quote.price, item.currency)
      : formatNumber(quote.price, 2, 2)
    : '—';
  return (
    <Pressable
      onPress={() => onPress(item)}
      disabled={!item.asset}
      accessibilityRole={item.asset ? 'button' : 'text'}
      accessibilityLabel={`${item.code} ${item.name}`}
      style={({ pressed }) => [
        styles.stockCard,
        { backgroundColor: c.card, borderColor: c.border },
        pressed && { opacity: 0.6 },
      ]}>
      <View style={[styles.stockBar, { backgroundColor: barColor }]} />
      {'flag' in item.icon ? (
        <FlagIcon code={item.icon.flag} size={36} />
      ) : (
        <PairIcon main={item.icon.pair[0]} second={item.icon.pair[1]} size={36} />
      )}
      <View style={styles.stockMain}>
        <Text style={[Type.headline, { color: c.text, fontSize: 15 }]} numberOfLines={1}>
          {item.code}
        </Text>
        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <View style={styles.priceCol}>
        <Text style={[Type.number, styles.price, { color: quote ? c.text : c.textTertiary }]} numberOfLines={1}>
          {value}
        </Text>
        <View style={[styles.change, { backgroundColor: change != null ? pnlSoft(c, change) : c.chip }]}>
          <Text
            style={[Type.caption, styles.changeText, { color: change != null ? pnlColor(c, change) : c.textTertiary }]}>
            {change != null ? formatPct(change) : '—'}
          </Text>
        </View>
      </View>
      <TrendIcon change={change} up={c.positive} down={c.negative} flat={c.textTertiary} size={22} />
    </Pressable>
  );
});

const StockRow = memo(function StockRow({
  item,
  quote,
  onPress,
}: {
  item: StockItem;
  quote?: AssetQuote;
  onPress: (market: MarketKey, code: string) => void;
}) {
  const c = useColors();
  const { stock, market } = item;
  const manual = MARKETS[market].manual;
  const commodity = market === 'metal' ? commodityInfo(stock.code) : undefined;
  const subtitle = commodity
    ? `${commodity.currency === 'USD' ? 'Dolar' : 'TL'} bazında · ${commodity.unit}`
    : stock.name;
  const change =
    quote?.previousClose != null && quote.previousClose > 0
      ? ((quote.price - quote.previousClose) / quote.previousClose) * 100
      : undefined;
  // Kutunun solundaki çubuk ve sağdaki yön çizgisi: yükselişte yeşil, düşüşte kırmızı.
  const barColor = change == null || change === 0 ? c.border : pnlColor(c, change);
  return (
    <Pressable
      onPress={() => onPress(market, stock.code)}
      accessibilityRole="button"
      accessibilityLabel={`${stock.code} ${stock.name}`}
      style={({ pressed }) => [
        styles.stockCard,
        { backgroundColor: c.card, borderColor: c.border },
        pressed && { opacity: 0.6 },
      ]}>
      <View style={[styles.stockBar, { backgroundColor: barColor }]} />
      <AssetIcon
        kind={MARKETS[market].kind}
        symbol={stock.code}
        label={stock.code}
        color={colorFor(market, stock.code)}
        size={36}
      />
      <View style={styles.stockMain}>
        <Text style={[Type.headline, { color: c.text, fontSize: 15 }]} numberOfLines={1}>
          {market === 'metal' ? displaySymbol('metal', stock.code) : stock.code}
        </Text>
        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {/* Fonların fiyatı otomatik gelmiyor: fiyat yoksa sütun gizlenir, ad tam görünür. */}
      {(!manual || quote) && (
        <View style={styles.priceCol}>
          <Text style={[Type.number, styles.price, { color: quote ? c.text : c.textTertiary }]} numberOfLines={1}>
            {quote ? formatPrice(quote.price, MARKETS[market].currencyOf(stock.code)) : '—'}
          </Text>
          {!manual && (
            <View style={[styles.change, { backgroundColor: change != null ? pnlSoft(c, change) : c.chip }]}>
              <Text
                style={[
                  Type.caption,
                  styles.changeText,
                  { color: change != null ? pnlColor(c, change) : c.textTertiary },
                ]}>
                {change != null ? formatPct(change) : '—'}
              </Text>
            </View>
          )}
        </View>
      )}
      {!manual && <TrendIcon change={change} up={c.positive} down={c.negative} flat={c.textTertiary} size={22} />}
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
  stockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginVertical: 4,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  stockBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  stockMain: {
    flex: 1,
    minWidth: 0,
  },
  price: {
    fontSize: 14,
    textAlign: 'right',
  },
  change: {
    minWidth: 60,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'flex-end',
  },
  changeText: {
    fontVariant: ['tabular-nums'],
  },
  fallback: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  fallbackLink: {
    fontSize: 14,
  },
});
