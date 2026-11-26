import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { AssetIcon, CategoryIcon } from '@/components/asset-icon';
import { DonutChart } from '@/components/donut-chart';
import { PrimaryButton } from '@/components/ui';
import { pnlColor, pnlSoft, Radius, Type, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { displaySymbol, kindInfo, quantityUnit } from '@/lib/assets';
import { buildChartData, type ChartAsset, type ChartCategory, type DonutHit } from '@/lib/donut';
import { currencySymbol, formatMoney, formatPct, formatPrice, formatQuantity, formatTime, trUpper } from '@/lib/format';
import { DISPLAY_CURRENCIES } from '@/lib/portfolio';
import type { AssetKind, DisplayCurrency, Holding } from '@/lib/types';

function tick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

export default function PortfolioScreen() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const { ready, holdings, summary, refreshing, refresh, lastUpdated, error, displayCurrency, cycleDisplayCurrency } =
    usePortfolio();
  const [openKind, setOpenKind] = useState<AssetKind>();
  const [selectedAsset, setSelectedAsset] = useState<string>();

  const cur = displayCurrency;
  const totals = summary.totals[cur];
  const categories = useMemo(() => buildChartData(holdings, summary), [holdings, summary]);
  // Açık tür portföyden kalktıysa (ör. hepsi satıldıysa) kapalı say.
  const openCat = categories.find((x) => x.kind === openKind);
  const activeKind = openCat?.kind;
  const selected = openCat?.assets.find((a) => a.key === selectedAsset);
  const closed = holdings.filter((h) => h.quantity <= 0);
  const chartSize = Math.min(width - 16, 420);

  function openCategory(kind: AssetKind) {
    tick();
    setOpenKind(kind);
    setSelectedAsset(undefined);
  }

  function closeAll() {
    if (!activeKind) return;
    tick();
    setOpenKind(undefined);
    setSelectedAsset(undefined);
  }

  function onChartTap(hit: DonutHit) {
    if (hit.type === 'slice') {
      const s = hit.slice;
      if (s.kind !== activeKind) return openCategory(s.kind);
      if (s.assetKey) {
        tick();
        setSelectedAsset((prev) => (prev === s.assetKey ? undefined : s.assetKey));
      }
      return;
    }
    // Ortaya dokununca para birimi değişir (TL → $ → € → TL); dışarıya dokununca her şey kapanır.
    if (hit.type === 'center') {
      tick();
      cycleDisplayCurrency();
      return;
    }
    closeAll();
  }

  // Halkanın ortası: başlık, değer ve kâr/zarar rozeti (pay yüzdeleri halkanın kenarında).
  let center: { icon?: ReactNode; title: string; value?: number; pnl?: number; pnlPct?: number };
  if (selected) {
    const v = selected.holding.views[cur];
    center = {
      icon: (
        <AssetIcon
          kind={selected.kind}
          symbol={selected.holding.symbol}
          label={selected.label}
          color={selected.color}
          size={16}
        />
      ),
      title: selected.label,
      value: v?.value,
      pnl: v?.pnl,
      pnlPct: v?.pnlPct,
    };
  } else if (openCat) {
    const t = openCat.totals[cur];
    center = {
      icon: <CategoryIcon kind={openCat.kind} size={16} />,
      title: openCat.label,
      value: t?.value,
      pnl: t?.pnl,
      pnlPct: t?.pnlPct,
    };
  } else {
    center = { title: 'Toplam Değer', value: totals.value, pnl: totals.pnl, pnlPct: totals.pnlPct };
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/add')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="İşlem ekle"
              style={({ pressed }) => [styles.addButton, { backgroundColor: c.tint, opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.plusH, { backgroundColor: c.tintText }]} />
              <View style={[styles.plusV, { backgroundColor: c.tintText }]} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {!ready ? (
          <ActivityIndicator style={{ marginTop: 48 }} />
        ) : holdings.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {(error || totals.incomplete) && (
              <View style={[styles.banner, { backgroundColor: c.warningBg }]}>
                <Text style={[Type.subhead, { color: c.warning }]}>
                  {error ?? 'Kur alınamadığı için bazı varlıklar toplama dahil edilmedi.'}
                </Text>
              </View>
            )}

            {categories.length > 0 && (
              <View style={styles.chartWrap}>
                <DonutChart
                  categories={categories}
                  openKind={activeKind}
                  selectedAsset={selected?.key}
                  width={chartSize}
                  onTap={onChartTap}>
                  <View style={styles.centerTitleRow}>
                    {center.icon}
                    <Text style={[Type.overline, styles.centerTitle, { color: c.textSecondary }]} numberOfLines={1}>
                      {trUpper(center.title)}
                    </Text>
                  </View>
                  <Text
                    style={[Type.display, styles.centerValue, { color: c.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    {center.value != null ? formatMoney(center.value, cur, { decimals: 0 }) : '—'}
                  </Text>
                  {center.pnlPct != null && (
                    <View style={[styles.pnlPill, { backgroundColor: pnlSoft(c, center.pnl) }]}>
                      <Text style={[Type.caption, styles.tabular, { color: pnlColor(c, center.pnl) }]}>
                        {formatPct(center.pnlPct)}
                      </Text>
                    </View>
                  )}
                  <CurrencySwitch active={cur} />
                </DonutChart>
                {activeKind ? (
                  <Pressable
                    onPress={closeAll}
                    hitSlop={8}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.backPill, { backgroundColor: c.chip, opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={[Type.caption, { color: c.link, fontSize: 13 }]}>‹ Tüm portföy</Text>
                  </Pressable>
                ) : (
                  <Text style={[Type.subhead, styles.hint, { color: c.textTertiary }]}>
                    Ayrıntı için dilime, döviz için ortaya dokun
                  </Text>
                )}
              </View>
            )}

            <View style={styles.stats}>
              <StatCard
                label="Toplam K/Z"
                value={formatMoney(totals.pnl, cur, { signed: true })}
                pct={formatPct(totals.pnlPct)}
                tone={totals.pnl}
              />
              <StatCard
                label="Bugün"
                value={formatMoney(totals.dayChange, cur, { signed: true })}
                pct={formatPct(totals.dayChangePct)}
                tone={totals.dayChange}
              />
            </View>

            <View style={styles.listHeader}>
              <Text style={[Type.title, { color: c.text }]}>{openCat ? kindInfo(openCat.kind).label : 'Dağılım'}</Text>
              {openCat ? (
                <Pressable onPress={closeAll} hitSlop={10} accessibilityRole="button">
                  <Text style={[Type.bodyStrong, { color: c.link }]}>‹ Tüm portföy</Text>
                </Pressable>
              ) : (
                <Text style={[Type.subhead, { color: c.textTertiary }]}>{categories.length} kategori</Text>
              )}
            </View>

            <View>
              {openCat
                ? openCat.assets.map((a, i) => (
                    <AssetRow
                      key={a.key}
                      asset={a}
                      currency={cur}
                      highlighted={a.key === selected?.key}
                      last={i === openCat.assets.length - 1}
                    />
                  ))
                : categories.map((cat, i) => (
                    <CategoryRow
                      key={cat.kind}
                      category={cat}
                      currency={cur}
                      last={i === categories.length - 1}
                      onPress={() => openCategory(cat.kind)}
                    />
                  ))}
            </View>

            {closed.length > 0 && !openCat && (
              <>
                <View style={styles.listHeader}>
                  <Text style={[Type.title, { color: c.text }]}>Satılanlar</Text>
                </View>
                {closed.map((h, i) => (
                  <ClosedRow key={h.key} holding={h} currency={cur} last={i === closed.length - 1} />
                ))}
              </>
            )}

            <Text style={[Type.subhead, styles.footer, { color: c.textTertiary }]}>
              {refreshing
                ? 'Fiyatlar güncelleniyor…'
                : lastUpdated
                  ? `Son güncelleme ${formatTime(lastUpdated)}`
                  : 'Fiyat bekleniyor'}
              {cur !== 'TRY' ? '\nDöviz bazında kâr/zarar, alış günlerindeki kurla hesaplanır.' : ''}
              {'\n'}Fiyatlar gecikmeli olabilir. Bu uygulama yatırım tavsiyesi vermez.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

/** Halkanın ortasındaki "₺ $ €" göstergesi; seçili olan vurgulanır. */
function CurrencySwitch({ active }: { active: DisplayCurrency }) {
  const c = useColors();
  return (
    <View style={[styles.switchRow, { backgroundColor: c.chip }]}>
      {DISPLAY_CURRENCIES.map((k) => (
        <View key={k} style={[styles.switchItem, k === active && { backgroundColor: c.tint }]}>
          <Text style={[Type.caption, { color: k === active ? c.tintText : c.textSecondary }]}>
            {currencySymbol(k)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatCard({ label, value, pct, tone }: { label: string; value: string; pct: string; tone: number }) {
  const c = useColors();
  const color = pnlColor(c, tone);
  return (
    <View style={[styles.statCard, { backgroundColor: c.card }]}>
      <Text style={[Type.subhead, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[Type.headline, styles.tabular, styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View style={[styles.pnlPill, styles.statPill, { backgroundColor: pnlSoft(c, tone) }]}>
        <Text style={[Type.caption, styles.tabular, { color }]}>{pct}</Text>
      </View>
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  pct,
  value,
  change,
  changeColor,
  last,
  highlighted,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  pct?: string;
  value: string;
  change: string;
  changeColor: string;
  last: boolean;
  highlighted?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, (pressed || highlighted) && { backgroundColor: c.card }]}>
      {!last && <View style={[styles.separator, { backgroundColor: c.border }]} />}
      {icon}
      <View style={styles.rowMain}>
        <Text style={[Type.headline, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[Type.subhead, styles.rowSub, { color: c.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {pct ? (
        <View style={[styles.weight, { backgroundColor: c.chip }]}>
          <Text style={[Type.caption, styles.tabular, { color: c.textSecondary }]}>{pct}</Text>
        </View>
      ) : null}
      <View style={styles.rowRight}>
        <Text style={[Type.number, styles.rowValue, { color: c.text }]}>{value}</Text>
        {change ? (
          <Text style={[Type.caption, styles.tabular, styles.rowChange, { color: changeColor }]}>{change}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const ICON_SIZE = 40;

function CategoryRow({
  category: cat,
  currency,
  last,
  onPress,
}: {
  category: ChartCategory;
  currency: DisplayCurrency;
  last: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const t = cat.totals[currency];
  return (
    <Row
      icon={<CategoryIcon kind={cat.kind} size={ICON_SIZE} />}
      title={kindInfo(cat.kind).label}
      subtitle={`${cat.assets.length} varlık`}
      pct={formatPct(cat.pct, { signed: false, decimals: 1 })}
      value={t ? formatMoney(t.value, currency, { decimals: 0 }) : '—'}
      change={t ? formatPct(t.pnlPct) : ''}
      changeColor={pnlColor(c, t?.pnl)}
      last={last}
      onPress={onPress}
    />
  );
}

function AssetRow({
  asset: a,
  currency,
  highlighted,
  last,
}: {
  asset: ChartAsset;
  currency: DisplayCurrency;
  highlighted: boolean;
  last: boolean;
}) {
  const c = useColors();
  const h = a.holding;
  const v = h.views[currency];
  return (
    <Row
      icon={<AssetIcon kind={h.kind} symbol={h.symbol} label={a.label} color={a.color} size={ICON_SIZE} ring />}
      title={a.label}
      subtitle={`${formatQuantity(h.quantity)} ${quantityUnit(h.kind, h.symbol)} · ${
        h.priceMissing ? 'fiyat yok' : formatPrice(h.price, h.currency)
      }`}
      pct={formatPct(a.pct, { signed: false, decimals: 1 })}
      value={v ? formatMoney(v.value, currency, { decimals: 0 }) : '—'}
      change={v ? formatPct(v.pnlPct) : ''}
      changeColor={pnlColor(c, v?.pnl)}
      last={last}
      highlighted={highlighted}
      onPress={() => router.push({ pathname: '/asset/[key]', params: { key: a.key } })}
    />
  );
}

function ClosedRow({ holding: h, currency, last }: { holding: Holding; currency: DisplayCurrency; last: boolean }) {
  const c = useColors();
  const realized = h.views[currency]?.realized;
  const label = displaySymbol(h.kind, h.symbol);
  return (
    <Row
      icon={<AssetIcon kind={h.kind} symbol={h.symbol} label={label} color={c.textTertiary} size={ICON_SIZE} />}
      title={label}
      subtitle={`${kindInfo(h.kind).label} · gerçekleşen`}
      value={
        realized != null
          ? formatMoney(realized, currency, { signed: true })
          : formatMoney(h.realizedPnl, h.currency, { signed: true })
      }
      change=""
      changeColor={c.textSecondary}
      last={last}
      onPress={() => router.push({ pathname: '/asset/[key]', params: { key: h.key } })}
    />
  );
}

function EmptyState() {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyBadge, { backgroundColor: c.tintSoft }]}>
        <Text style={styles.emptyIcon}>📈</Text>
      </View>
      <Text style={[Type.title, { color: c.text, fontSize: 24 }]}>Portföyün boş</Text>
      <Text style={[Type.body, styles.emptyText, { color: c.textSecondary }]}>
        Hisse, kripto, döviz veya emtia alımlarını ekle; güncel değerini ve kâr/zararını anlık takip et.
      </Text>
      <View style={{ alignSelf: 'stretch', marginTop: 12 }}>
        <PrimaryButton label="İlk işlemini ekle" onPress={() => router.push('/add')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 56,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusH: {
    position: 'absolute',
    width: 14,
    height: 2.5,
    borderRadius: 2,
  },
  plusV: {
    position: 'absolute',
    width: 2.5,
    height: 14,
    borderRadius: 2,
  },
  banner: {
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 8,
  },
  chartWrap: {
    alignItems: 'center',
    gap: 6,
  },
  hint: {
    textAlign: 'center',
  },
  backPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  centerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  centerTitle: {
    flexShrink: 1,
  },
  centerValue: {
    marginTop: 4,
  },
  pnlPill: {
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 2,
    marginTop: 10,
  },
  switchItem: {
    width: 28,
    height: 20,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statValue: {
    fontSize: 18,
    marginTop: 6,
  },
  statPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    gap: 12,
    borderRadius: Radius.md,
  },
  separator: {
    position: 'absolute',
    left: 6 + ICON_SIZE + 12,
    right: 6,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowSub: {
    marginTop: 2,
  },
  weight: {
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rowRight: {
    alignItems: 'flex-end',
    minWidth: 88,
  },
  rowValue: {
    fontSize: 15,
  },
  rowChange: {
    marginTop: 3,
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 28,
    lineHeight: 18,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 16,
    gap: 10,
  },
  emptyBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 22,
  },
});
