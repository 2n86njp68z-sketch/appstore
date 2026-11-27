import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { PortfolioWidgetProps } from './portfolio-widget-props';

/**
 * iPhone ana ekran ve kilit ekranı widget'ı (expo-widgets, SwiftUI). Uygulama fiyatları her yenilediğinde
 * hazır metinlerle güncellenir; widget kendisi fiyat çekmez.
 *
 * "widget" yönergesi bu fonksiyonu metne çevirir ve widget'ta ayrı çalıştırır: içinde yalnız SwiftUI
 * bileşenleri, değiştiriciler ve props kullanılabilir (dışarıdaki sabit ya da yardımcılar görülmez).
 */
const PortfolioWidget = (props: PortfolioWidgetProps, env: WidgetEnvironment) => {
  'widget';
  const green = '#34D399';
  const red = '#F87171';
  const white = '#FFFFFF';
  const dim = '#B8B5D6';
  const bg = containerBackground(
    { type: 'linearGradient', colors: ['#0F0C29', '#302B63'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
    'widget',
  );
  const family = env.widgetFamily ?? 'systemSmall';

  if (family === 'accessoryRectangular' || family === 'accessoryInline') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL('portfoytakip://')]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' })]}>GENIUS</Text>
        <Text
          modifiers={[
            font({ size: 17, weight: 'bold', design: 'rounded' }),
            monospacedDigit(),
            minimumScaleFactor(0.6),
            lineLimit(1),
          ]}>
          {props.value}
        </Text>
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{`Bugün ${props.dayPct}`}</Text>
      </VStack>
    );
  }

  if (props.empty) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[bg, widgetURL('portfoytakip://')]}>
        <Text modifiers={[font({ size: 15, weight: 'heavy' }), foregroundStyle(white)]}>GENIUS</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13 }), foregroundStyle(dim)]}>Portföyüne ilk varlığını eklemek için dokun.</Text>
      </VStack>
    );
  }

  const summary = (
    <VStack alignment="leading" spacing={3} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
      <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(white)]}>GENIUS</Text>
      <Spacer />
      <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(dim)]}>Toplam değer</Text>
      <Text
        modifiers={[
          font({ size: 24, weight: 'bold', design: 'rounded' }),
          foregroundStyle(white),
          monospacedDigit(),
          minimumScaleFactor(0.5),
          lineLimit(1),
        ]}>
        {props.value}
      </Text>
      <Text
        modifiers={[
          font({ size: 12, weight: 'semibold' }),
          foregroundStyle(props.dayUp ? green : red),
          monospacedDigit(),
          minimumScaleFactor(0.7),
          lineLimit(1),
        ]}>
        {`Bugün ${props.day} (${props.dayPct})`}
      </Text>
      <Text
        modifiers={[
          font({ size: 11, weight: 'medium' }),
          foregroundStyle(props.totalUp ? green : red),
          monospacedDigit(),
          minimumScaleFactor(0.7),
          lineLimit(1),
        ]}>
        {`Toplam ${props.totalPct}${props.yearly ? ` · Yıllık ${props.yearly}` : ''}`}
      </Text>
      <Text modifiers={[font({ size: 10 }), foregroundStyle(dim)]}>{props.updated}</Text>
    </VStack>
  );

  if (family === 'systemSmall') {
    return <VStack modifiers={[bg, widgetURL('portfoytakip://')]}>{summary}</VStack>;
  }

  return (
    <HStack alignment="top" spacing={14} modifiers={[bg, widgetURL('portfoytakip://')]}>
      {summary}
      <VStack alignment="leading" spacing={7} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(dim)]}>En büyük varlıklar</Text>
        {props.top.map((r) => (
          <HStack key={r.name} spacing={6}>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(white), lineLimit(1)]}>
              {r.name}
            </Text>
            <Spacer />
            <Text
              modifiers={[
                font({ size: 12, weight: 'semibold' }),
                foregroundStyle(r.up ? green : red),
                monospacedDigit(),
                lineLimit(1),
              ]}>
              {r.pct}
            </Text>
          </HStack>
        ))}
        <Spacer />
      </VStack>
    </HStack>
  );
};

export default createWidget<PortfolioWidgetProps>('PortfolioWidget', PortfolioWidget, {
  empty: true,
  value: '',
  day: '',
  dayPct: '',
  dayUp: true,
  totalPct: '',
  totalUp: true,
  updated: '',
  top: [],
});
