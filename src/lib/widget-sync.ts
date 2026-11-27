import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { PortfolioWidgetProps } from '@/widgets/portfolio-widget-props';

/**
 * Ana ekran widget'ını uygulamadaki son değerlerle günceller. Widget yalnız iPhone'da ve widget modülünü
 * içeren derlemelerde (geliştirme/App Store derlemesi) var; Expo Go'da ve web'de sessizce hiçbir şey yapmaz.
 */
type WidgetHandle = { updateSnapshot(props: PortfolioWidgetProps): void };

let widget: Promise<WidgetHandle | null> | null = null;
let lastKey = '';

function loadWidget(): Promise<WidgetHandle | null> {
  if (widget) return widget;
  widget =
    Platform.OS === 'ios' && requireOptionalNativeModule('ExpoWidgets')
      ? import('@/widgets/portfolio-widget').then((m) => m.default as WidgetHandle).catch(() => null)
      : Promise.resolve(null);
  return widget;
}

export async function syncWidget(props: PortfolioWidgetProps): Promise<void> {
  const key = JSON.stringify(props);
  if (key === lastKey) return;
  const w = await loadWidget();
  if (!w) return;
  try {
    w.updateSnapshot(props);
    lastKey = key;
  } catch {
    // widget eklenmemiş ya da kullanılamıyor
  }
}
