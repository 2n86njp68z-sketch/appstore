import { useId, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';

import { CompanyLogo } from '@/components/company-logo';
import { Font, useColors } from '@/constants/theme';
import { commodityInfo, type CommodityLook } from '@/lib/assets';
import { stockInfo } from '@/lib/markets';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Line,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import type { AssetKind } from '@/lib/types';

/*
 * Yuvarlak simgeler (bayraklar, külçeler, harf rozetleri). Hepsi 100×100 alanda çizilir ve
 * daireye kırpılır; böylece her boyutta keskin görünür.
 */

function starPoints(cx: number, cy: number, r: number, rotation = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const a = rotation + (k * Math.PI) / 5;
    const rad = k % 2 === 0 ? r : r * 0.382;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Daireye kırpılmış 100×100 çizim alanı. */
function Round({ size, children, label }: { size: number; children: ReactNode; label?: string }) {
  const id = 'c' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={label}>
      <Defs>
        <ClipPath id={id}>
          <Circle cx={50} cy={50} r={50} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>{children}</G>
    </Svg>
  );
}

function TurkeyFlag() {
  // Resmi oranlar (bayrak yüksekliği G): dış ay çapı G/2, iç ay çapı 0,4G, aralarındaki kayma G/16,
  // yıldız çapı G/4. Ay-yıldız dairenin ortasına gelecek şekilde ölçeklendi.
  const s = 50 / 23000;
  const x = (v: number) => 50 + (v - 35500) * s;
  return (
    <>
      <Rect x={0} y={0} width={100} height={100} fill="#E30A17" />
      <Circle cx={x(30000)} cy={50} r={15000 * s} fill="#FFFFFF" />
      <Circle cx={x(33750)} cy={50} r={12000 * s} fill="#E30A17" />
      <Polygon points={starPoints(x(49250), 50, 7500 * s, Math.PI)} fill="#FFFFFF" />
    </>
  );
}

function UsaFlag() {
  const h = 100 / 13;
  const stars: ReactNode[] = [];
  for (let row = 0; row < 5; row++) {
    const cols = row % 2 === 0 ? 5 : 4;
    for (let col = 0; col < cols; col++) {
      const cx = (row % 2 === 0 ? 7 : 12) + col * 10;
      const cy = 8 + row * 9.5;
      stars.push(<Polygon key={`${row}-${col}`} points={starPoints(cx, cy, 3)} fill="#FFFFFF" />);
    }
  }
  return (
    <>
      <Rect x={0} y={0} width={100} height={100} fill="#FFFFFF" />
      {Array.from({ length: 7 }, (_, i) => (
        <Rect key={i} x={0} y={i * 2 * h} width={100} height={h} fill="#B22234" />
      ))}
      <Rect x={0} y={0} width={54} height={7 * h} fill="#3C3B6E" />
      {stars}
    </>
  );
}

function EuFlag() {
  return (
    <>
      <Rect x={0} y={0} width={100} height={100} fill="#003399" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return <Polygon key={i} points={starPoints(50 + 30 * Math.sin(a), 50 - 30 * Math.cos(a), 6)} fill="#FFCC00" />;
      })}
    </>
  );
}

function UkFlag() {
  return (
    <>
      <Rect x={0} y={0} width={100} height={100} fill="#012169" />
      <Line x1={0} y1={0} x2={100} y2={100} stroke="#FFFFFF" strokeWidth={20} />
      <Line x1={100} y1={0} x2={0} y2={100} stroke="#FFFFFF" strokeWidth={20} />
      <Line x1={0} y1={0} x2={100} y2={100} stroke="#C8102E" strokeWidth={7} />
      <Line x1={100} y1={0} x2={0} y2={100} stroke="#C8102E" strokeWidth={7} />
      <Rect x={0} y={35} width={100} height={30} fill="#FFFFFF" />
      <Rect x={35} y={0} width={30} height={100} fill="#FFFFFF" />
      <Rect x={0} y={41} width={100} height={18} fill="#C8102E" />
      <Rect x={41} y={0} width={18} height={100} fill="#C8102E" />
    </>
  );
}

function SwissFlag() {
  return (
    <>
      <Rect x={0} y={0} width={100} height={100} fill="#DA291C" />
      <Rect x={40} y={20} width={20} height={60} fill="#FFFFFF" />
      <Rect x={20} y={40} width={60} height={20} fill="#FFFFFF" />
    </>
  );
}

const METAL_STYLES = {
  gold: { bg: ['#FEF3C7', '#FCD34D'], bar: '#F59E0B', edge: '#B45309', shine: '#FDE68A' },
  silver: { bg: ['#F1F5F9', '#CBD5E1'], bar: '#94A3B8', edge: '#475569', shine: '#E2E8F0' },
  platinum: { bg: ['#EEF4FB', '#BFD3EA'], bar: '#7D9CC4', edge: '#36507A', shine: '#DCE7F5' },
  palladium: { bg: ['#F3F0FA', '#D3C8EC'], bar: '#A595C7', edge: '#5B4B86', shine: '#E7E1F5' },
} as const;

/** Brent petrol: kehribar zemin üzerinde petrol damlası. */
function OilDrop() {
  const id = 'o' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE8A3" />
          <Stop offset="1" stopColor="#F59E0B" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
      <Path
        d="M50 18 C50 18 27 46 27 61 C27 75 37.5 84 50 84 C62.5 84 73 75 73 61 C73 46 50 18 50 18 Z"
        fill="#1F2937"
      />
      <Path
        d="M39 62 C39 55 43 49 46 45"
        stroke="#FFFFFF"
        strokeOpacity={0.55}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

/** Emtia simgesi: külçe ya da petrol damlası. */
export function CommodityArt({ look }: { look: CommodityLook }) {
  return look === 'oil' ? <OilDrop /> : <Bullion metal={look} />;
}

function TextBadge({ bg, text }: { bg: string; text: string }) {
  return <Glyph bg={bg} text={text} fontSize={30} />;
}

function Bullion({ metal }: { metal: keyof typeof METAL_STYLES }) {
  const st = METAL_STYLES[metal];
  const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const bar = (cx: number, top: number) => (
    <G key={`${cx}-${top}`}>
      <Polygon
        points={`${cx - 12},${top} ${cx + 12},${top} ${cx + 16},${top + 15} ${cx - 16},${top + 15}`}
        fill={st.bar}
        stroke={st.edge}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Polygon
        points={`${cx - 10},${top + 3} ${cx + 10},${top + 3} ${cx + 11},${top + 6} ${cx - 11},${top + 6}`}
        fill={st.shine}
      />
    </G>
  );
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={st.bg[0]} />
          <Stop offset="1" stopColor={st.bg[1]} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
      <G transform="translate(50 54) scale(1.18) translate(-50 -54)">
        {bar(32, 55)}
        {bar(68, 55)}
        {bar(50, 38)}
      </G>
    </>
  );
}

const SVG_FONT = Platform.select({ ios: 'Helvetica', android: 'sans-serif', default: 'Arial, Helvetica, sans-serif' });

function Glyph({ bg, text, fontSize = 52 }: { bg: string; text: string; fontSize?: number }) {
  return (
    <>
      <Rect x={0} y={0} width={100} height={100} fill={bg} />
      <SvgText
        x={50}
        y={50 + fontSize * 0.35}
        fontSize={fontSize}
        fontFamily={SVG_FONT}
        fontWeight="700"
        fill="#FFFFFF"
        textAnchor="middle">
        {text}
      </SvgText>
    </>
  );
}

function CryptoMark() {
  // ₿ benzeri: eğik B ve üst/alt çizgiler (yazı tipine bağlı kalmamak için çizildi).
  return (
    <>
      <Rect x={0} y={0} width={100} height={100} fill="#F7931A" />
      <G transform="rotate(14 50 50)">
        <Rect x={41} y={18} width={5} height={10} fill="#FFFFFF" />
        <Rect x={53} y={18} width={5} height={10} fill="#FFFFFF" />
        <Rect x={41} y={72} width={5} height={10} fill="#FFFFFF" />
        <Rect x={53} y={72} width={5} height={10} fill="#FFFFFF" />
        <SvgText x={51} y={69} fontSize={54} fontFamily={SVG_FONT} fontWeight="800" fill="#FFFFFF" textAnchor="middle">
          B
        </SvgText>
      </G>
    </>
  );
}

function FundMark({ bg = '#64748B' }: { bg?: string }) {
  return (
    <>
      <Rect x={0} y={0} width={100} height={100} fill={bg} />
      <Rect x={28} y={58} width={10} height={16} rx={2} fill="#FFFFFF" />
      <Rect x={45} y={44} width={10} height={30} rx={2} fill="#FFFFFF" />
      <Rect x={62} y={30} width={10} height={44} rx={2} fill="#FFFFFF" />
    </>
  );
}

const FLAGS: Record<string, () => ReactNode> = {
  TR: TurkeyFlag,
  USD: UsaFlag,
  EUR: EuFlag,
  GBP: UkFlag,
  CHF: SwissFlag,
};

/** Tek bir bayrak simgesi. code: TR, USD, EUR, GBP, CHF */
export function FlagIcon({ code, size }: { code: string; size: number }) {
  const Flag = FLAGS[code];
  return <Round size={size}>{Flag ? <Flag /> : <Glyph bg="#64748B" text={code.slice(0, 1)} />}</Round>;
}

/** TradingView'deki döviz çiftleri gibi: büyük bayrak ve sağ altta küçük ikinci bayrak. */
function PairIcon({ main, second, size }: { main: string; second: string; size: number }) {
  const c = useColors();
  const small = Math.round(size * 0.5);
  return (
    <View style={{ width: size, height: size }}>
      <FlagIcon code={main} size={Math.round(size * 0.86)} />
      <View
        style={{
          position: 'absolute',
          right: -1,
          bottom: -1,
          borderRadius: small,
          borderWidth: 1.5,
          borderColor: c.background,
        }}>
        <FlagIcon code={second} size={small} />
      </View>
    </View>
  );
}

/** Varlık türü simgesi: BIST → Türk bayrağı, ABD → ABD bayrağı, Emtia → altın külçe… */
export function CategoryIcon({ kind, size }: { kind: AssetKind; size: number }) {
  switch (kind) {
    case 'bist':
      return <FlagIcon code="TR" size={size} />;
    case 'us':
      return <FlagIcon code="USD" size={size} />;
    case 'metal':
      return (
        <Round size={size}>
          <Bullion metal="gold" />
        </Round>
      );
    case 'crypto':
      return (
        <Round size={size}>
          <CryptoMark />
        </Round>
      );
    case 'fx':
      return <PairIcon main="USD" second="EUR" size={size} />;
    case 'etf':
      return (
        <Round size={size}>
          <TextBadge bg="#15AABF" text="ETF" />
        </Round>
      );
    case 'fund':
      return (
        <Round size={size}>
          <FundMark bg="#E64980" />
        </Round>
      );
    case 'bes':
      return (
        <Round size={size}>
          <TextBadge bg="#2B8A3E" text="BES" />
        </Round>
      );
    case 'other':
      return (
        <Round size={size}>
          <FundMark />
        </Round>
      );
  }
}

/**
 * Tek bir varlığın simgesi. Altın/gümüş külçe, dövizlerde bayrak; hisse ve kriptolarda
 * dilim rengiyle harf rozeti.
 */
export function AssetIcon({
  kind,
  symbol,
  label,
  color,
  size,
  ring,
}: {
  kind: AssetKind;
  symbol: string;
  label: string;
  color: string;
  size: number;
  /** Logo/bayrak/külçe simgelerinin etrafına dilim rengiyle halka çizer. */
  ring?: boolean;
}) {
  const info = stockInfo(kind, symbol);
  const website = info?.website;
  const logoUrl = info?.logo;
  const logo = website != null || logoUrl != null;
  const commodity = kind === 'metal' ? commodityInfo(symbol) : undefined;
  const pictured = logo || commodity != null || (kind === 'fx' && FLAGS[symbol] != null);
  if (pictured) {
    const inner = ring ? size - 7 : size;
    const icon = logo ? (
      <CompanyLogo website={website} logoUrl={logoUrl} label={label} color={color} size={inner} />
    ) : commodity ? (
      <Round size={inner}>
        <CommodityArt look={commodity.look} />
      </Round>
    ) : (
      <PairIcon main={symbol} second="TR" size={inner} />
    );
    if (!ring) return icon;
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {icon}
      </View>
    );
  }
  const letter = (label.match(/[A-Za-z0-9ÇĞİÖŞÜçğıöşü]/)?.[0] ?? '?').toLocaleUpperCase('tr-TR');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.44, fontFamily: Font.bold }}>{letter}</Text>
    </View>
  );
}
