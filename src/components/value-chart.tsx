import { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { Font, pnlColor, Radius, Type, useColors } from '@/constants/theme';
import { formatMoney, formatPct } from '@/lib/format';
import type { DisplayCurrency } from '@/lib/types';
import { sliceFrom, type ValueChart } from '@/lib/value-chart';

type SeriesKey = 'value' | 'invested' | 'bist100' | 'sp500tr' | 'cpi';

/**
 * Seri renkleri: kategorik sıranın ilk dört tonu (renk körlüğü denetiminden geçti); "yatırılan" nötr gri
 * kesikli çizgi. Gece modunda aynı tonların koyu zemine göre ayarlanmış adımları.
 */
const SERIES_COLORS: Record<'light' | 'dark', Record<SeriesKey, string>> = {
  light: { value: '#257de0', bist100: '#f47230', sp500tr: '#00b894', cpi: '#f2a600', invested: '#8A9099' },
  dark: { value: '#338ced', bist100: '#e76624', sp500tr: '#00a888', cpi: '#d28e05', invested: '#7C8490' },
};

const LABELS: Record<SeriesKey, string> = {
  value: 'Portföy',
  invested: 'Yatırılan',
  bist100: 'BIST 100',
  sp500tr: 'S&P 500',
  cpi: 'Enflasyon',
};

const RANGES: { label: string; days: number | null }[] = [
  { label: '1A', days: 30 },
  { label: '3A', days: 91 },
  { label: '6A', days: 182 },
  { label: '1Y', days: 365 },
  { label: 'Tümü', days: null },
];

const H = 190;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;
const PAD_RIGHT = 48;

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const shortDate = (iso: string, withYear = true) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${withYear ? ` ${y}` : ''}`;
};
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Eksen etiketi: "₺412B", "$9,8B", "₺1,2Mn" */
function compactMoney(v: number, cur: DisplayCurrency): string {
  const sym = cur === 'TRY' ? '₺' : cur === 'USD' ? '$' : '€';
  const a = Math.abs(v);
  const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace('.', ','));
  if (a >= 1e6) return `${sym}${fmt(v / 1e6)}Mn`;
  if (a >= 1e3) return `${sym}${fmt(v / 1e3)}B`;
  return `${sym}${Math.round(v)}`;
}

/** "Güzel" eksen adımları (1, 2, 2,5, 5 × 10ⁿ): aralığa en çok `max` çizgi düşen en küçük adım. */
function niceTicks(min: number, max: number, maxLines = 4): number[] {
  if (!(max > min)) return [min];
  const pow = 10 ** Math.floor(Math.log10((max - min) / maxLines));
  const step = [1, 2, 2.5, 5, 10, 20].map((m) => m * pow).find((s) => (max - min) / s <= maxLines) ?? max - min;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(t);
  return out;
}

export function ValueChartCard({ chart, currency }: { chart: ValueChart; currency: DisplayCurrency }) {
  const c = useColors();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = SERIES_COLORS[scheme];
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Partial<Record<SeriesKey, boolean>>>({
    bist100: true,
    sp500tr: true,
    cpi: true,
  });
  const [active, setActive] = useState<number | null>(null);

  const spanDays = dayNum(chart.dates[chart.dates.length - 1]) - dayNum(chart.dates[0]);
  const ranges = RANGES.filter((r) => r.days == null || r.days < spanDays);
  const start = sliceFrom(chart, range);
  const dates = chart.dates.slice(start);
  const n = dates.length;

  const all: { key: SeriesKey; data: number[] }[] = [
    { key: 'invested', data: chart.invested.slice(start) },
    ...(['bist100', 'sp500tr', 'cpi'] as const)
      .filter((k) => chart.bench[k])
      .map((k) => ({ key: k as SeriesKey, data: chart.bench[k]!.slice(start) })),
    { key: 'value', data: chart.value.slice(start) },
  ];
  const visible = all.filter((s) => !hidden[s.key]);

  const plotW = Math.max(0, width - PAD_RIGHT);
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const x0 = dayNum(dates[0]);
  const x1 = Math.max(x0 + 1, dayNum(dates[n - 1]));
  const xs = dates.map((d) => ((dayNum(d) - x0) / (x1 - x0)) * plotW);
  const values = visible.flatMap((s) => s.data).filter((v) => Number.isFinite(v));
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (!(hi > lo)) {
    lo = lo * 0.95;
    hi = hi * 1.05 || 1;
  }
  const pad = (hi - lo) * 0.08;
  lo = Math.max(0, lo - pad);
  hi = hi + pad;
  const y = (v: number) => PAD_TOP + plotH - ((v - lo) / (hi - lo)) * plotH;
  const ticks = niceTicks(lo, hi);

  const path = (data: number[]) =>
    data.map((v, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${y(v).toFixed(1)}`).join('');
  const valueData = all.find((s) => s.key === 'value')!.data;
  const area = n > 1 ? `${path(valueData)}L${xs[n - 1].toFixed(1)},${PAD_TOP + plotH}L0,${PAD_TOP + plotH}Z` : '';

  const idx = active ?? n - 1;
  const at = (key: SeriesKey) => all.find((s) => s.key === key)?.data[idx];
  const v = at('value') ?? 0;
  const inv = at('invested') ?? 0;
  const profit = v - inv;

  const pan = useMemo(() => {
    const pick = (locX: number) => {
      if (n < 2 || plotW <= 0) return;
      const day = x0 + (Math.min(Math.max(locX, 0), plotW) / plotW) * (x1 - x0);
      let best = 0;
      for (let i = 1; i < n; i++) if (Math.abs(dayNum(dates[i]) - day) < Math.abs(dayNum(dates[best]) - day)) best = i;
      setActive(best);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: (e) => pick(e.nativeEvent.locationX),
      onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
      onPanResponderRelease: () => setActive(null),
      onPanResponderTerminate: () => setActive(null),
      onPanResponderTerminationRequest: () => true,
    });
    // dates dizisi her çizimde yeni; uzunluğu ve uçları yeterli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, plotW, x0, x1, start, range]);

  const toggle = (k: SeriesKey) => k !== 'value' && setHidden((h) => ({ ...h, [k]: !h[k] }));
  const fmt = (x: number | undefined) => (x == null ? '—' : formatMoney(x, currency, { decimals: 0 }));

  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <View style={styles.head}>
        <Text style={[Type.overline, { color: c.textSecondary }]}>PORTFÖY DEĞERİ</Text>
        <View style={styles.ranges}>
          {ranges.map((r) => {
            const sel = r.days === range;
            return (
              <Pressable
                key={r.label}
                onPress={() => {
                  setRange(r.days);
                  setActive(null);
                }}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`Dönem ${r.label}`}
                style={[styles.range, sel && { backgroundColor: c.chip }]}>
                <Text style={[Type.caption, { color: sel ? c.text : c.textSecondary, fontFamily: Font.semibold }]}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={[Type.title, styles.tabular, { color: c.text, marginTop: 6 }]}>{fmt(v)}</Text>
      <Text style={[Type.subhead, styles.tabular, { color: c.textSecondary, fontSize: 12.5 }]}>
        {shortDate(dates[idx])} · Kâr{' '}
        <Text style={{ color: pnlColor(c, profit) }}>
          {formatMoney(profit, currency, { signed: true, decimals: 0 })}
          {inv > 0 ? ` (${formatPct((profit / inv) * 100, { signed: true, decimals: 1 })})` : ''}
        </Text>
      </Text>

      <View
        style={{ height: H, marginTop: 8 }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
        accessible
        accessibilityLabel={`Portföy değeri grafiği, ${shortDate(dates[0])} ile ${shortDate(dates[n - 1])} arası`}>
        {width > 0 && n > 1 && (
          <Svg width={width} height={H}>
            <Defs>
              <LinearGradient id="vc-area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.value} stopOpacity={scheme === 'dark' ? 0.28 : 0.18} />
                <Stop offset="1" stopColor={colors.value} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {ticks.map((t) => (
              <Line
                key={`g${t}`}
                x1={0}
                x2={plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={c.border}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            {ticks.map((t) => (
              <SvgText
                key={`l${t}`}
                x={width - 2}
                y={y(t) + 4}
                fontSize={10}
                fill={c.textTertiary}
                textAnchor="end"
                fontFamily={Font.medium}>
                {compactMoney(t, currency)}
              </SvgText>
            ))}
            {!hidden.value && <Path d={area} fill="url(#vc-area)" />}
            {visible.map((s) => (
              <Path
                key={s.key}
                d={path(s.data)}
                stroke={colors[s.key]}
                strokeWidth={s.key === 'invested' ? 1.5 : 2}
                strokeDasharray={s.key === 'invested' ? '4 4' : undefined}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {active != null && (
              <>
                <Line
                  x1={xs[idx]}
                  x2={xs[idx]}
                  y1={PAD_TOP}
                  y2={PAD_TOP + plotH}
                  stroke={c.textTertiary}
                  strokeWidth={1}
                />
                {visible.map((s) => (
                  <Circle
                    key={s.key}
                    cx={xs[idx]}
                    cy={y(s.data[idx])}
                    r={4.5}
                    fill={colors[s.key]}
                    stroke={c.card}
                    strokeWidth={2}
                  />
                ))}
              </>
            )}
            <SvgText x={0} y={H - 6} fontSize={10} fill={c.textTertiary} fontFamily={Font.medium}>
              {shortDate(dates[0])}
            </SvgText>
            <SvgText x={plotW} y={H - 6} fontSize={10} fill={c.textTertiary} textAnchor="end" fontFamily={Font.medium}>
              {shortDate(dates[n - 1])}
            </SvgText>
          </Svg>
        )}
      </View>

      {/* Lejant: her serinin o günkü değeri; dokununca çizgi açılır/kapanır */}
      <View style={styles.legend}>
        {[...all].reverse().map((s) => {
          const off = !!hidden[s.key];
          return (
            <Pressable
              key={s.key}
              onPress={() => toggle(s.key)}
              disabled={s.key === 'value'}
              accessibilityRole={s.key === 'value' ? undefined : 'switch'}
              accessibilityState={s.key === 'value' ? undefined : { checked: !off }}
              accessibilityLabel={`${LABELS[s.key]} ${fmt(s.data[idx])}`}
              style={[styles.legendItem, { borderColor: c.border, opacity: off ? 0.45 : 1 }]}>
              <Svg width={14} height={6}>
                <Line
                  x1={1}
                  x2={13}
                  y1={3}
                  y2={3}
                  stroke={colors[s.key]}
                  strokeWidth={2.5}
                  strokeDasharray={s.key === 'invested' ? '3 3' : undefined}
                  strokeLinecap="round"
                />
              </Svg>
              <View>
                <Text style={[Type.caption, styles.tabular, { color: c.text, fontFamily: Font.semibold }]}>
                  {off ? LABELS[s.key] : fmt(s.data[idx])}
                </Text>
                {!off && <Text style={[styles.legendLabel, { color: c.textSecondary }]}>{LABELS[s.key]}</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.note, { color: c.textTertiary }]}>
        Ölçütler: aynı paralar aynı günlerde BIST 100&apos;e, S&amp;P 500&apos;e yatırılsaydı ya da enflasyon kadar
        artsaydı. Alınan temettüler çizgiye dahil değil.
        {chart.approximated.length
          ? ` Geçmiş fiyatı alınamayanlar (${chart.approximated.slice(0, 4).join(', ')}${chart.approximated.length > 4 ? '…' : ''}) işlem fiyatlarıyla çizildi.`
          : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: 16, marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ranges: { flexDirection: 'row', gap: 2 },
  range: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  legendLabel: { fontSize: 10.5, marginTop: 1 },
  note: { fontSize: 11, lineHeight: 16, marginTop: 10 },
});
