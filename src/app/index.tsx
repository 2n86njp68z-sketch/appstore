import * as Haptics from 'expo-haptics';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
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

import { DonutChart } from '@/components/donut-chart';
import { PrimaryButton } from '@/components/ui';
import { pnlColor, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { displaySymbol, kindInfo, quantityUnit } from '@/lib/assets';
import { buildChartData, type ChartAsset, type ChartCategory, type DonutHit } from '@/lib/donut';
import { formatMoney, formatPct, formatPrice, formatQuantity, formatTime } from '@/lib/format';
import type { AssetKind, Holding } from '@/lib/types';

function tick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

export default function PortfolioScreen() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const { ready, holdings, summary, refreshing, refresh, lastUpdated, error } = usePortfolio();
  const [openKind, setOpenKind] = useState<AssetKind>();
  const [selectedAsset, setSelectedAsset] = useState<string>();

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
    // Ortaya dokunmak bir seviye geri gider, dışarıya dokunmak her şeyi kapatır.
    if (hit.type === 'center' && selected) {
      tick();
      setSelectedAsset(undefined);
      return;
    }
    closeAll();
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
            {(error || summary.incomplete) && (
              <View style={[styles.banner, { backgroundColor: c.warningBg }]}>
                <Text style={[styles.bannerText, { color: c.warning }]}>
                  {error ?? 'Dolar kuru alınamadığı için bazı varlıklar toplama dahil edilmedi.'}
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
                  <CenterLabel
                    title={selected ? selected.label : openCat ? openCat.label : 'Toplam Değer'}
                    value={selected ? selected.valueTry : openCat ? openCat.valueTry : summary.valueTry}
                    sub={
                      selected
                        ? `Portföyün ${formatPct(selected.pct, { signed: false })}'i`
                        : openCat
                          ? `Portföyün ${formatPct(openCat.pct, { signed: false })}'i`
                          : formatPct(summary.pnlPct)
                    }
                    subColor={selected || openCat ? c.textSecondary : pnlColor(c, summary.pnlTry)}
                  />
                </DonutChart>
                <Text style={[styles.hint, { color: c.textSecondary }]}>
                  {activeKind ? 'Geri dönmek için ortaya dokun' : 'Ayrıntı için bir dilime dokun'}
                </Text>
              </View>
            )}

            <View style={styles.stats}>
              <Stat
                label="Toplam K/Z"
                value={formatMoney(summary.pnlTry, 'TRY', { signed: true })}
                sub={formatPct(summary.pnlPct)}
                color={pnlColor(c, summary.pnlTry)}
              />
              <View style={[styles.statDivider, { backgroundColor: c.border }]} />
              <Stat
                label="Bugün"
                value={formatMoney(summary.dayChangeTry, 'TRY', { signed: true })}
                sub={formatPct(summary.dayChangePct)}
                color={pnlColor(c, summary.dayChangeTry)}
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
                      highlighted={a.key === selected?.key}
                      last={i === openCat.assets.length - 1}
                    />
                  ))
                : categories.map((cat, i) => (
                    <CategoryRow
                      key={cat.kind}
                      category={cat}
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
                  <ClosedRow key={h.key} holding={h} last={i === closed.length - 1} />
                ))}
              </>
            )}

            <Text style={[styles.footer, { color: c.textSecondary }]}>
              {refreshing
                ? 'Fiyatlar güncelleniyor…'
                : lastUpdated
                  ? `Son güncelleme ${formatTime(lastUpdated)}`
                  : 'Fiyat bekleniyor'}
              {'\n'}Fiyatlar gecikmeli olabilir. Bu uygulama yatırım tavsiyesi vermez.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

function CenterLabel({ title, value, sub, subColor }: { title: string; value: number; sub: string; subColor: string }) {
  const c = useColors();
  return (
    <>
      <Text style={[styles.centerTitle, { color: c.textSecondary }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.centerValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(value, 'TRY', { decimals: 0 })}
      </Text>
      <Text style={[styles.centerSub, { color: subColor }]} numberOfLines={1}>
        {sub}
      </Text>
    </>
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
  color,
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
  color: string;
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
      <View style={[styles.dot, { backgroundColor: color }]} />
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
        <Text style={[styles.rowChange, { color: changeColor }]}>{change}</Text>
      </View>
    </Pressable>
  );
}

function CategoryRow({
  category: cat,
  last,
  onPress,
}: {
  category: ChartCategory;
  last: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Row
      color={cat.color}
      title={kindInfo(cat.kind).label}
      subtitle={`${cat.assets.length} varlık`}
      pct={formatPct(cat.pct, { signed: false })}
      value={formatMoney(cat.valueTry, 'TRY', { decimals: 0 })}
      change={formatPct(cat.pnlPct)}
      changeColor={pnlColor(c, cat.pnlTry)}
      last={last}
      onPress={onPress}
    />
  );
}

function AssetRow({ asset: a, highlighted, last }: { asset: ChartAsset; highlighted: boolean; last: boolean }) {
  const c = useColors();
  const h = a.holding;
  return (
    <Row
      color={a.color}
      title={a.label}
      subtitle={`${formatQuantity(h.quantity)} ${quantityUnit(h.kind, h.symbol)} · ${
        h.priceMissing ? 'fiyat yok' : formatPrice(h.price, h.currency)
      }`}
      pct={formatPct(a.pct, { signed: false })}
      value={formatMoney(a.valueTry, 'TRY', { decimals: 0 })}
      change={formatPct(h.unrealizedPct)}
      changeColor={pnlColor(c, h.unrealizedPnl)}
      last={last}
      highlighted={highlighted}
      onPress={() => router.push({ pathname: '/asset/[key]', params: { key: a.key } })}
    />
  );
}

function ClosedRow({ holding: h, last }: { holding: Holding; last: boolean }) {
  const c = useColors();
  return (
    <Row
      color={c.border}
      title={displaySymbol(h.kind, h.symbol)}
      subtitle={`${kindInfo(h.kind).label} · gerçekleşen`}
      value={formatMoney(h.realizedPnl, h.currency, { signed: true })}
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
  },
  centerTitle: {
    fontSize: 14,
    fontWeight: '600',
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
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
    borderRadius: 8,
  },
  separator: {
    position: 'absolute',
    left: 28,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
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
