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
import { pnlColor, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { displaySymbol, kindInfo, quantityUnit } from '@/lib/assets';
import { buildChartData, type ChartAsset, type ChartCategory, type DonutHit } from '@/lib/donut';
import { currencySymbol, formatMoney, formatPct, formatPrice, formatQuantity, formatTime } from '@/lib/format';
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
  const chartSize = Math.min(width - 32, 340);

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

  let center: { icon?: ReactNode; title: string; value?: number; sub: string; subColor: string };
  if (selected) {
    center = {
      icon: (
        <AssetIcon
          kind={selected.kind}
          symbol={selected.holding.symbol}
          label={selected.label}
          color={selected.color}
          size={20}
        />
      ),
      title: selected.label,
      value: selected.holding.views[cur]?.value,
      sub: `Portföyün ${formatPct(selected.pct, { signed: false })}'i`,
      subColor: c.textSecondary,
    };
  } else if (openCat) {
    center = {
      icon: <CategoryIcon kind={openCat.kind} size={20} />,
      title: openCat.label,
      value: openCat.totals[cur]?.value,
      sub: `Portföyün ${formatPct(openCat.pct, { signed: false })}'i`,
      subColor: c.textSecondary,
    };
  } else {
    center = {
      title: 'Toplam Değer',
      value: totals.value,
      sub: formatPct(totals.pnlPct),
      subColor: pnlColor(c, totals.pnl),
    };
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
              <Text style={styles.addButtonText}>+</Text>
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
                <Text style={[styles.bannerText, { color: c.warning }]}>
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
                  size={chartSize}
                  onTap={onChartTap}>
                  <View style={styles.centerTitleRow}>
                    {center.icon}
                    <Text style={[styles.centerTitle, { color: c.textSecondary }]} numberOfLines={1}>
                      {center.title}
                    </Text>
                  </View>
                  <Text style={[styles.centerValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
                    {center.value != null ? formatMoney(center.value, cur, { decimals: 0 }) : '—'}
                  </Text>
                  <Text style={[styles.centerSub, { color: center.subColor }]} numberOfLines={1}>
                    {center.sub}
                  </Text>
                  <CurrencySwitch active={cur} />
                </DonutChart>
                {activeKind ? (
                  <Pressable
                    onPress={closeAll}
                    hitSlop={8}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.backPill, { backgroundColor: c.chip, opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={[styles.backPillText, { color: c.tint }]}>‹ Tüm portföy</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.hint, { color: c.textSecondary }]}>
                    Ayrıntı için dilime, döviz için ortaya dokun
                  </Text>
                )}
              </View>
            )}

            <View style={styles.stats}>
              <Stat
                label="Toplam K/Z"
                value={formatMoney(totals.pnl, cur, { signed: true })}
                sub={formatPct(totals.pnlPct)}
                color={pnlColor(c, totals.pnl)}
              />
              <View style={[styles.statDivider, { backgroundColor: c.border }]} />
              <Stat
                label="Bugün"
                value={formatMoney(totals.dayChange, cur, { signed: true })}
                sub={formatPct(totals.dayChangePct)}
                color={pnlColor(c, totals.dayChange)}
              />
            </View>

            <View style={styles.listHeader}>
              <Text style={[styles.listTitle, { color: c.text }]}>
                {openCat ? kindInfo(openCat.kind).label : 'Dağılım'}
              </Text>
              {openCat && (
                <Pressable onPress={closeAll} hitSlop={10} accessibilityRole="button">
                  <Text style={[styles.link, { color: c.tint }]}>‹ Tüm portföy</Text>
                </Pressable>
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
                  <Text style={[styles.listTitle, { color: c.text }]}>Satılanlar</Text>
                </View>
                {closed.map((h, i) => (
                  <ClosedRow key={h.key} holding={h} currency={cur} last={i === closed.length - 1} />
                ))}
              </>
            )}

            <Text style={[styles.footer, { color: c.textSecondary }]}>
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
    <View style={styles.switchRow}>
      {DISPLAY_CURRENCIES.map((k) => (
        <View key={k} style={[styles.switchItem, k === active && { backgroundColor: c.tint }]}>
          <Text style={[styles.switchText, { color: k === active ? c.tintText : c.textSecondary }]}>
            {currencySymbol(k)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const c = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.statSub, { color }]}>{sub}</Text>
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
      style={({ pressed }) => [styles.row, (pressed || highlighted) && { backgroundColor: c.chip }]}>
      {!last && <View style={[styles.separator, { backgroundColor: c.border }]} />}
      {icon}
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSub, { color: c.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {pct ? <Text style={[styles.rowPct, { color: c.textSecondary }]}>{pct}</Text> : null}
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, { color: c.text }]}>{value}</Text>
        {change ? <Text style={[styles.rowChange, { color: changeColor }]}>{change}</Text> : null}
      </View>
    </Pressable>
  );
}

const ICON_SIZE = 38;

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
      pct={formatPct(cat.pct, { signed: false })}
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
      pct={formatPct(a.pct, { signed: false })}
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
      icon={<AssetIcon kind={h.kind} symbol={h.symbol} label={label} color={c.textSecondary} size={ICON_SIZE} />}
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
      <Text style={styles.emptyIcon}>📈</Text>
      <Text style={[styles.emptyTitle, { color: c.text }]}>Portföyün boş</Text>
      <Text style={[styles.emptyText, { color: c.textSecondary }]}>
        Hisse, kripto, döviz veya emtia alımlarını ekle; güncel değerini ve kâr/zararını anlık takip et.
      </Text>
      <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
        <PrimaryButton label="İlk işlemini ekle" onPress={() => router.push('/add')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  banner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chartWrap: {
    alignItems: 'center',
    marginTop: 4,
  },
  hint: {
    fontSize: 13,
    marginTop: 2,
    textAlign: 'center',
  },
  backPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  backPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  centerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  centerTitle: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  centerValue: {
    fontSize: 26,
    fontWeight: '800',
    marginVertical: 2,
    fontVariant: ['tabular-nums'],
  },
  centerSub: {
    fontSize: 14,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
  },
  switchItem: {
    width: 24,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  statLabel: {
    fontSize: 13,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  statSub: {
    fontSize: 13,
    fontWeight: '600',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 4,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
    borderRadius: 8,
  },
  separator: {
    position: 'absolute',
    left: 4 + ICON_SIZE + 12,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 13,
    marginTop: 2,
  },
  rowPct: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  rowRight: {
    alignItems: 'flex-end',
    minWidth: 92,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rowChange: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 56,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
});
