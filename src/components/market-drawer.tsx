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
  useId,
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
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
  type ListViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AssetIcon, CategoryIcon, CompareMark, FlagIcon, IndexMark, PairIcon } from '@/components/asset-icon';
import { CompanyLogo } from '@/components/company-logo';
import { GeniusLogo } from '@/components/genius-logo';
import { TrendIcon } from '@/components/trend-icon';
import { pnlColor, pnlSoft, Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { paletteFor } from '@/lib/donut';
import { formatAssetPrice, formatNumber, formatPct, formatPrice, trUpper } from '@/lib/format';
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
import type { AssetKind, AssetQuote, Currency, RawQuote } from '@/lib/types';

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
  /** Kartın altındaki kısa açıklama. */
  subtitle: string;
  /** Kartın rengi. */
  accent: string;
  /** Grup adı; yalnız grubun görünen ilk bölümünde üstte yazar. */
  group: string;
  showGroup?: boolean;
  icon: ReactNode;
  available: boolean;
  market?: MarketKey;
  /** Başlıkta görünen hisse sayısı. */
  total?: number;
  data: ListItem[];
}

interface SectionLook {
  subtitle: string;
  accent: string;
  group: string;
}

type SectionDef = SectionLook &
  (
    | { key: string; title: string; kind: AssetKind; market: MarketKey; overview?: undefined; links?: undefined }
    | {
        key: OverviewKey;
        title: string;
        overview: OverviewKey;
        kind?: undefined;
        market?: undefined;
        links?: undefined;
      }
    | { key: 'compare'; title: string; links: true; kind?: undefined; market?: undefined; overview?: undefined }
  );

const SECTION_DEFS: SectionDef[] = [
  // En üstte Karşılaştır (herkes görsün); sonra Türk bayraklılar, ABD bayraklılar, emtia, kripto,
  // endeksler ve kurlar.
  {
    key: 'compare',
    title: COMPARE_LINKS.title,
    links: true,
    group: 'Araçlar',
    accent: '#7C5CFF',
    subtitle: 'Getirileri aynı grafikte gör',
  },
  {
    key: 'bist',
    title: 'Türk Market',
    kind: 'bist',
    market: 'bist',
    group: 'Türkiye',
    accent: '#E30A17',
    subtitle: 'Borsa İstanbul hisseleri',
  },
  {
    key: 'fund',
    title: 'TEFAS',
    kind: 'fund',
    market: 'fund',
    group: 'Türkiye',
    accent: '#E64980',
    subtitle: 'Yatırım fonları',
  },
  {
    key: 'bes',
    title: 'BES',
    kind: 'bes',
    market: 'bes',
    group: 'Türkiye',
    accent: '#2B8A3E',
    subtitle: 'Emeklilik fonları',
  },
  {
    key: 'eurobond',
    title: 'Eurobond',
    kind: 'eurobond',
    market: 'eurobond',
    group: 'Türkiye',
    accent: '#1D4ED8',
    subtitle: 'T.C. Hazine tahvilleri',
  },
  {
    key: 'us',
    title: 'ABD Market',
    kind: 'us',
    market: 'us',
    group: 'ABD',
    accent: '#2F6BFF',
    subtitle: 'NASDAQ ve NYSE',
  },
  {
    key: 'etf',
    title: 'ABD ETF',
    kind: 'etf',
    market: 'etf',
    group: 'ABD',
    accent: '#15AABF',
    subtitle: 'Borsa yatırım fonları',
  },
  {
    key: 'metal',
    title: 'Emtia',
    kind: 'metal',
    market: 'metal',
    group: 'Emtia ve kripto',
    accent: '#E0A100',
    subtitle: 'Altın, gümüş, platin, petrol',
  },
  {
    key: 'crypto',
    title: 'Kripto',
    kind: 'crypto',
    market: 'crypto',
    group: 'Emtia ve kripto',
    accent: '#F7931A',
    subtitle: 'Bitcoin, Ethereum, Solana',
  },
  {
    key: 'index',
    title: OVERVIEW.index.title,
    overview: 'index',
    group: 'Piyasa özeti',
    accent: '#4F46E5',
    subtitle: 'S&P 500, Nasdaq, BIST 100',
  },
  {
    key: 'rates',
    title: OVERVIEW.rates.title,
    overview: 'rates',
    group: 'Piyasa özeti',
    accent: '#14B8A6',
    subtitle: 'Dolar ve Euro',
  },
];

/**
 * Piyasa nabzı şeridine dokunuluyor mu: şerit yatay kaydığı için oradan başlayan sürükleme menüyü
 * kapatmaz. Ekranda tek menü olduğundan modül düzeyinde tutulur.
 */
let stripTouching = false;

/** "#RRGGBB" → saydamlıklı renk. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Menünün üstündeki "Piyasa nabzı" şeridi. */
const PULSE: {
  label: string;
  icon: (size: number) => ReactNode;
  get: (q: Record<string, RawQuote>) => { price: number; previousClose?: number } | undefined;
  currency: Currency | null;
}[] = [
  { label: 'BIST 100', icon: (s) => <FlagIcon code="TR" size={s} />, get: (q) => q['XU100.IS'], currency: null },
  { label: 'S&P 500', icon: (s) => <FlagIcon code="USD" size={s} />, get: (q) => q['^GSPC'], currency: null },
  { label: 'Nasdaq 100', icon: (s) => <FlagIcon code="USD" size={s} />, get: (q) => q['^NDX'], currency: null },
  {
    label: 'Dolar',
    icon: (s) => <PairIcon main="USD" second="TR" size={s} />,
    get: (q) => q['USDTRY=X'],
    currency: 'TRY',
  },
  {
    label: 'Euro',
    icon: (s) => <PairIcon main="EUR" second="TR" size={s} />,
    get: (q) => q['EURTRY=X'],
    currency: 'TRY',
  },
  {
    label: 'Gram Altın',
    icon: (s) => <CategoryIcon kind="metal" size={s} />,
    get: (q) => resolveAssetQuote('metal', 'GRAM_ALTIN', q, {}),
    currency: 'TRY',
  },
  {
    label: 'Bitcoin',
    icon: (s) => <CategoryIcon kind="crypto" size={s} />,
    get: (q) => q['CG:bitcoin'],
    currency: 'USD',
  },
];
const PULSE_KEYS = ['XU100.IS', '^GSPC', '^NDX', 'USDTRY=X', 'EURTRY=X', 'GC=F', 'CG:bitcoin'];

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
        onMoveShouldSetPanResponder: (_, g) => !stripTouching && g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
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
    const look = { subtitle: d.subtitle, accent: d.accent, group: d.group };
    if (d.links) {
      return {
        ...look,
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
        ...look,
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
      ...look,
      key: d.key,
      title: d.title,
      available: m != null,
      market: m,
      icon: <CategoryIcon kind={d.kind} size={30} />,
      total: m ? (results ? results[m].length : MARKETS[m].stocks.length) : undefined,
      data,
    };
  });
  // Grup adı, grubun görünen ilk bölümünün üstünde yazar.
  sections.forEach((sec, i) => {
    sec.showGroup = i === 0 || sections[i - 1].group !== sec.group;
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

  // Piyasa nabzı şeridinin fiyatları menü açılınca istenir.
  useEffect(() => {
    if (open) request(PULSE_KEYS);
  }, [open, request]);

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
        <TopGlow />
        <View style={styles.headerRow}>
          <View style={styles.drawerLogo}>
            <GeniusLogo height={30} />
          </View>
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
          // Piyasa nabzı en üstteki Karşılaştır bölümünün hemen altında
          renderSectionFooter={({ section }) =>
            !searching && section.key === 'compare' ? (
              <PulseStrip
                quotes={allQuotes}
                onTouchStart={() => {
                  stripTouching = true;
                }}
                onTouchEnd={() => {
                  stripTouching = false;
                }}
              />
            ) : null
          }
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

/** Menünün üstünde, logonun arkasında hafif mor parıltı. */
function TopGlow() {
  const id = 'glow' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const dark = useColorScheme() === 'dark';
  return (
    <Svg style={styles.glow} width="100%" height={260} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="18%" cy="0%" rx="85%" ry="100%">
          <Stop offset="0" stopColor="#7C5CFF" stopOpacity={dark ? 0.38 : 0.2} />
          <Stop offset="0.55" stopColor="#4F46E5" stopOpacity={dark ? 0.12 : 0.06} />
          <Stop offset="1" stopColor="#4F46E5" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** "Piyasa nabzı": BIST 100, S&P 500, Nasdaq, Dolar, Euro, Gram Altın, Bitcoin yan yana kayar. */
function PulseStrip({
  quotes,
  onTouchStart,
  onTouchEnd,
}: {
  quotes: Record<string, RawQuote>;
  onTouchStart: () => void;
  onTouchEnd: () => void;
}) {
  const c = useColors();
  return (
    <View style={styles.pulse} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <View style={styles.pulseHeader}>
        <View style={[styles.liveDot, { backgroundColor: c.positive, shadowColor: c.positive }]} />
        <Text style={[Type.overline, { color: c.textSecondary }]}>PİYASA NABZI</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pulseRow}>
        {PULSE.map((p) => {
          const q = p.get(quotes);
          const change =
            q?.previousClose != null && q.previousClose > 0
              ? ((q.price - q.previousClose) / q.previousClose) * 100
              : undefined;
          const value = q ? (p.currency ? formatPrice(q.price, p.currency) : formatNumber(q.price, 2, 2)) : '—';
          return (
            <View
              key={p.label}
              style={[styles.pulseChip, { backgroundColor: c.card, borderColor: c.border }]}
              accessibilityLabel={`${p.label} ${value} ${change != null ? formatPct(change) : ''}`}>
              <View style={styles.pulseTop}>
                {p.icon(16)}
                <Text style={[Type.caption, { color: c.textSecondary }]} numberOfLines={1}>
                  {p.label}
                </Text>
              </View>
              <Text style={[Type.number, { color: c.text, fontSize: 15 }]} numberOfLines={1}>
                {value}
              </Text>
              <View style={styles.pulseChange}>
                <TrendIcon change={change} up={c.positive} down={c.negative} flat={c.textTertiary} size={14} />
                <Text
                  style={[
                    Type.caption,
                    styles.changeText,
                    { color: change != null ? pnlColor(c, change) : c.textTertiary },
                  ]}>
                  {change != null ? formatPct(change) : '—'}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Bölüm kartı: bölümün rengiyle hafif renk geçişli zemin, parlayan simge, açıklama, sayı rozeti ve
 * açılınca dönen ok. Grubun ilk bölümünde üstte grup adı yazar.
 */
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
  const dark = useColorScheme() === 'dark';
  const id = 'sec' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const { accent } = section;
  return (
    <View style={[styles.sectionWrap, { backgroundColor: c.background, paddingTop: section.showGroup ? 14 : 4 }]}>
      {section.showGroup && (
        <Text style={[Type.overline, styles.groupLabel, { color: c.textTertiary }]}>{trUpper(section.group)}</Text>
      )}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${section.title}, ${section.subtitle}${count != null ? `, ${count}` : ''}`}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          styles.sectionCard,
          {
            backgroundColor: c.card,
            borderColor: withAlpha(accent, expanded ? 0.6 : dark ? 0.3 : 0.22),
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={accent} stopOpacity={expanded ? (dark ? 0.42 : 0.24) : dark ? 0.26 : 0.13} />
              <Stop offset="1" stopColor={accent} stopOpacity={dark ? 0.03 : 0.01} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
        <View
          style={[
            styles.iconHalo,
            {
              backgroundColor: withAlpha(accent, dark ? 0.28 : 0.16),
              shadowColor: accent,
              borderColor: withAlpha(accent, 0.35),
            },
          ]}>
          {section.icon}
        </View>
        <View style={styles.sectionText}>
          <Text style={[Type.headline, { color: c.text }]} numberOfLines={1}>
            {section.title}
          </Text>
          <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={1}>
            {section.subtitle}
          </Text>
        </View>
        {count != null && (
          <View style={[styles.countPill, { backgroundColor: withAlpha(accent, dark ? 0.3 : 0.14) }]}>
            <Text style={[Type.caption, styles.changeText, { color: c.text }]}>{formatNumber(count, 0, 0)}</Text>
          </View>
        )}
        <View style={[styles.chevron, { backgroundColor: expanded ? accent : withAlpha(accent, dark ? 0.22 : 0.12) }]}>
          <Svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
            <Path
              d="M9 5 L16 12 L9 19"
              stroke={expanded ? '#FFFFFF' : c.text}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
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
          {market === 'metal' || market === 'eurobond' ? displaySymbol(MARKETS[market].kind, stock.code) : stock.code}
        </Text>
        <Text style={[Type.subhead, { color: c.textSecondary, fontSize: 12 }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {/* Fonların fiyatı otomatik gelmiyor: fiyat yoksa sütun gizlenir, ad tam görünür. */}
      {(!manual || quote) && (
        <View style={styles.priceCol}>
          <Text style={[Type.number, styles.price, { color: quote ? c.text : c.textTertiary }]} numberOfLines={1}>
            {quote ? formatAssetPrice(MARKETS[market].kind, quote.price, MARKETS[market].currencyOf(stock.code)) : '—'}
          </Text>
          {/* Eurobondlarda günlük değişim yerine yıllık getiri */}
          {market === 'eurobond' && quote?.yieldPct != null ? (
            <View style={[styles.change, { backgroundColor: c.chip }]}>
              <Text style={[Type.caption, styles.changeText, { color: c.textSecondary }]}>
                getiri %{formatNumber(quote.yieldPct, 2, 2)}
              </Text>
            </View>
          ) : (
            !manual && (
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
            )
          )}
        </View>
      )}
      {!manual && <TrendIcon change={change} up={c.positive} down={c.negative} flat={c.textTertiary} size={22} />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  drawerLogo: {
    // Logonun kendi iç boşluğu sola hizayı bozmasın
    marginLeft: -4,
  },
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
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  pulse: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  pulseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  pulseRow: {
    gap: 8,
    paddingHorizontal: 12,
  },
  pulseChip: {
    minWidth: 118,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  pulseTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionWrap: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  groupLabel: {
    marginLeft: 6,
    marginBottom: 8,
  },
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconHalo: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  sectionText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  countPill: {
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chevron: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
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
