import { Stack, router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AllocationBar, Card, PrimaryButton, SectionTitle } from '@/components/ui';
import { pnlColor, useColors } from '@/constants/theme';
import { usePortfolio } from '@/context/portfolio-context';
import { displaySymbol, kindInfo, quantityUnit } from '@/lib/assets';
import { formatMoney, formatPct, formatPrice, formatQuantity, formatTime } from '@/lib/format';
import type { Holding } from '@/lib/types';

export default function PortfolioScreen() {
  const c = useColors();
  const { ready, holdings, summary, refreshing, refresh, lastUpdated, error } = usePortfolio();
  const open = holdings.filter((h) => h.quantity > 0);
  const closed = holdings.filter((h) => h.quantity <= 0);

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
            <View style={[styles.hero, { backgroundColor: c.hero }]}>
              <Text style={[styles.heroLabel, { color: c.heroMuted }]}>Toplam Değer</Text>
              <Text style={[styles.heroValue, { color: c.heroText }]} adjustsFontSizeToFit numberOfLines={1}>
                {formatMoney(summary.valueTry, 'TRY')}
              </Text>
              <View style={styles.heroRow}>
                <HeroStat
                  label="Toplam K/Z"
                  value={formatMoney(summary.pnlTry, 'TRY', { signed: true })}
                  sub={formatPct(summary.pnlPct)}
                  color={pnlColor(c, summary.pnlTry, c.heroMuted)}
                />
                <HeroStat
                  label="Bugün"
                  value={formatMoney(summary.dayChangeTry, 'TRY', { signed: true })}
                  sub={formatPct(summary.dayChangePct)}
                  color={pnlColor(c, summary.dayChangeTry, c.heroMuted)}
                />
              </View>
              <Text style={[styles.updated, { color: c.heroMuted }]}>
                {refreshing
                  ? 'Fiyatlar güncelleniyor…'
                  : lastUpdated
                    ? `Son güncelleme ${formatTime(lastUpdated)}`
                    : 'Fiyat bekleniyor'}
              </Text>
            </View>

            {(error || summary.incomplete) && (
              <View style={[styles.banner, { backgroundColor: c.warningBg }]}>
                <Text style={[styles.bannerText, { color: c.warning }]}>
                  {error ?? 'Dolar kuru alınamadığı için bazı varlıklar toplama dahil edilmedi.'}
                </Text>
              </View>
            )}

            {summary.allocation.length > 1 && (
              <>
                <SectionTitle>Dağılım</SectionTitle>
                <Card>
                  <AllocationBar slices={summary.allocation} />
                </Card>
              </>
            )}

            <SectionTitle>Varlıklarım</SectionTitle>
            <Card style={styles.listCard}>
              {open.map((h, i) => (
                <HoldingRow key={h.key} holding={h} last={i === open.length - 1} />
              ))}
              {open.length === 0 && (
                <Text style={[styles.muted, { color: c.textSecondary, padding: 16 }]}>Elde varlık yok.</Text>
              )}
            </Card>

            {closed.length > 0 && (
              <>
                <SectionTitle>Satılanlar</SectionTitle>
                <Card style={styles.listCard}>
                  {closed.map((h, i) => (
                    <HoldingRow key={h.key} holding={h} last={i === closed.length - 1} />
                  ))}
                </Card>
              </>
            )}

            <Text style={[styles.disclaimer, { color: c.textSecondary }]}>
              Fiyatlar gecikmeli olabilir. Bu uygulama yatırım tavsiyesi vermez.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

function HeroStat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.heroStatLabel, { color: c.heroMuted }]}>{label}</Text>
      <Text style={[styles.heroStatValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.heroStatSub, { color }]}>{sub}</Text>
    </View>
  );
}

function HoldingRow({ holding: h, last }: { holding: Holding; last: boolean }) {
  const c = useColors();
  const info = kindInfo(h.kind);
  const isOpen = h.quantity > 0;
  const showName = h.name !== h.symbol && h.kind !== 'metal';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/asset/[key]', params: { key: h.key } })}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
        pressed && { backgroundColor: c.chip },
      ]}>
      <View style={[styles.badge, { backgroundColor: info.color }]}>
        <Text style={styles.badgeText}>{displaySymbol(h.kind, h.symbol).slice(0, 2)}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>
          {displaySymbol(h.kind, h.symbol)}
        </Text>
        <Text style={[styles.rowSub, { color: c.textSecondary }]} numberOfLines={1}>
          {isOpen
            ? `${formatQuantity(h.quantity)} ${quantityUnit(h.kind, h.symbol)} · ${h.priceMissing ? 'fiyat yok' : formatPrice(h.price, h.currency)}`
            : showName
              ? h.name
              : info.label}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {isOpen ? (
          <>
            <Text style={[styles.rowValue, { color: c.text }]}>
              {h.valueTry != null ? formatMoney(h.valueTry, 'TRY') : formatMoney(h.marketValue, h.currency)}
            </Text>
            <Text style={[styles.rowPnl, { color: pnlColor(c, h.unrealizedPnl) }]}>{formatPct(h.unrealizedPct)}</Text>
          </>
        ) : (
          <>
            <Text style={[styles.rowSub, { color: c.textSecondary }]}>Gerçekleşen</Text>
            <Text style={[styles.rowPnl, { color: pnlColor(c, h.realizedPnl) }]}>
              {formatMoney(h.realizedPnl, h.currency, { signed: true })}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

function EmptyState() {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📈</Text>
      <Text style={[styles.emptyTitle, { color: c.text }]}>Portföyün boş</Text>
      <Text style={[styles.emptyText, { color: c.textSecondary }]}>
        Hisse, kripto, döviz veya altın alımlarını ekle; güncel değerini ve kâr/zararını anlık takip et.
      </Text>
      <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
        <PrimaryButton label="İlk işlemini ekle" onPress={() => router.push('/add')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 8,
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
  hero: {
    borderRadius: 20,
    padding: 20,
    gap: 4,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  heroValue: {
    fontSize: 36,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  heroRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  heroStatLabel: {
    fontSize: 13,
  },
  heroStatValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  heroStatSub: {
    fontSize: 13,
    fontWeight: '600',
  },
  updated: {
    fontSize: 12,
    marginTop: 14,
  },
  banner: {
    borderRadius: 12,
    padding: 12,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
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
  rowRight: {
    alignItems: 'flex-end',
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rowPnl: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  muted: {
    fontSize: 14,
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
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
