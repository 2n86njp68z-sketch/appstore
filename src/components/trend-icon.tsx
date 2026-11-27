import Svg, { Polyline } from 'react-native-svg';

/**
 * Yön çizgisi: yükselişte yukarı giden yeşil, düşüşte aşağı giden kırmızı çizgi (kutusuz, yalnız çizgi).
 * Değişim yoksa yatay çizgi; bilinmiyorsa aynı genişlikte boşluk bırakır ki satırlar hizalı kalsın.
 */
export function TrendIcon({
  change,
  size = 22,
  up,
  down,
  flat,
}: {
  change: number | undefined;
  size?: number;
  up: string;
  down: string;
  flat: string;
}) {
  if (change == null || !Number.isFinite(change)) return <Svg width={size} height={size} />;
  const dir = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const color = dir === 'up' ? up : dir === 'down' ? down : flat;
  const line =
    dir === 'up' ? '3,17 9,11 13,14 21,6' : dir === 'down' ? '3,7 9,13 13,10 21,18' : '3,12 9,12 13,12 21,12';
  const head = dir === 'up' ? '15,6 21,6 21,12' : dir === 'down' ? '15,18 21,18 21,12' : null;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityLabel={dir === 'up' ? 'Yükseliyor' : dir === 'down' ? 'Düşüyor' : 'Değişmedi'}>
      <Polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {head && (
        <Polyline
          points={head}
          fill="none"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}
