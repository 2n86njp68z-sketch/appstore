import { StyleSheet, Text, View } from 'react-native';

import { FlagIcon } from '@/components/asset-icon';
import { pnlColor, pnlSoft, Radius, Type, useColors } from '@/constants/theme';
import type { BenchKey, BenchmarkResult } from '@/lib/benchmarks';
import { formatMoney, formatPct } from '@/lib/format';

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

function monthLabel(ym?: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

const INFO: Record<BenchKey, { title: string; sub: (r: BenchmarkResult) => string; worth: string }> = {
  bist100: { title: 'BIST 100', sub: () => 'Fiyat endeksi · temettüler hariç', worth: 'BIST 100 alsaydın' },
  sp500tr: { title: 'S&P 500', sub: () => 'Temettüler dahil · TL bazında', worth: 'S&P 500 alsaydın' },
  cpi: {
    title: 'Enflasyon',
    sub: (r) => `TÜİK TÜFE · ${monthLabel(r.asOf)} verisine kadar${r.partial ? ' (sonraki alışlar hariç)' : ''}`,
    worth: 'Enflasyon kadar artsaydı',
  },
};

function BenchIcon({ k, size }: { k: BenchKey; size: number }) {
  if (k === 'bist100') return <FlagIcon code="TR" size={size} />;
  if (k === 'sp500tr') return <FlagIcon code="USD" size={size} />;
  return (
    <View style={[styles.cpiIcon, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[Type.caption, { color: '#FFFFFF', fontSize: size * 0.42 }]}>%</Text>
    </View>
  );
}

/**
 * Portföyün BIST 100, S&P 500 (temettüler dahil) ve TÜFE ile karşılaştırması.
 * Her alışta aynı TL tutarı o gün ölçüte yatırılmış gibi hesaplanır.
 */
export function BenchmarkCard({ results }: { results: BenchmarkResult[] }) {
  const c = useColors();
  if (results.length === 0) return null;
  return (
    <View>
      <View style={styles.header}>
        <Text style={[Type.title, { color: c.text }]}>Karşılaştırma</Text>
        <Text style={[Type.subhead, { color: c.textTertiary }]}>Aynı gün, aynı tutarla</Text>
      </View>
      <View style={[styles.card, { backgroundColor: c.card }]}>
        {results.map((r, i) => {
          const info = INFO[r.key];
          const color = pnlColor(c, r.diffPct);
          return (
            <View
              key={r.key}
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <BenchIcon k={r.key} size={30} />
              <View style={styles.main}>
                <Text style={[Type.bodyStrong, { color: c.text }]}>{info.title}</Text>
                <Text style={[Type.subhead, styles.sub, { color: c.textSecondary }]}>{info.sub(r)}</Text>
                {r.missing ? (
                  <Text style={[Type.subhead, styles.sub, { color: c.textTertiary }]}>
                    Alışların bu tarihten sonra; enflasyon verisi henüz yok
                  </Text>
                ) : (
                  <Text style={[Type.subhead, styles.sub, styles.tabular, { color: c.textTertiary }]}>
                    {info.worth}: {formatMoney(r.value, 'TRY', { decimals: 0 })}
                  </Text>
                )}
              </View>
              {!r.missing && (
                <View style={[styles.pill, { backgroundColor: pnlSoft(c, r.diffPct) }]}>
                  <Text style={[Type.caption, styles.tabular, { color }]}>{formatPct(r.diffPct)}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <Text style={[Type.subhead, styles.note, { color: c.textTertiary }]}>
        Her alışın, aynı gün aynı TL tutarıyla bu ölçüte yatırılmış gibi hesaplanır. Yüzde, portföyünün ne kadar önde
        (+) ya da geride (−) olduğunu gösterir.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 8,
  },
  card: {
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  sub: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  pill: {
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  cpiIcon: {
    backgroundColor: '#F59F00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 8,
    paddingHorizontal: 4,
  },
});
