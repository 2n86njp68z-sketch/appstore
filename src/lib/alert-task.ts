import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { alertMessage, alertQuoteSymbols, checkAlerts, markFired, type FiredAlert, type PriceAlert } from './alerts';
import { notify } from './dialog';
import { fetchAnyQuotes } from './prices';
import { loadAlertData, saveAlerts } from './storage';

/**
 * Fiyat alarmlarının bildirimleri ve arka plan kontrolü.
 *
 * - Uygulama açıkken her fiyat yenilemesinde alarmlar kontrol edilir.
 * - Kapalıyken iOS/Android'in arka plan görevi (en az 15 dakikada bir; ne zaman çalışacağına sistem karar
 *   verir, iPhone'da çoğu zaman daha seyrek) fiyatları çekip kontrol eder ve yerel bildirim gönderir.
 * - Web'de bildirim ve arka plan yok: tetiklenen alarm sayfa açıkken uyarı olarak gösterilir.
 */
export const ALERT_TASK = 'genius-price-alerts';
const IS_WEB = Platform.OS === 'web';

if (!IS_WEB) {
  // Uygulama öndeyken de bildirim görünsün
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // Görev uygulama yüklenirken (arka planda uyandırıldığında da) tanımlanmalı
  if (!TaskManager.isTaskDefined(ALERT_TASK)) {
    TaskManager.defineTask(ALERT_TASK, async () => {
      try {
        const { alerts, manualPrices } = await loadAlertData();
        if (!alerts.some((a) => a.active)) return BackgroundTask.BackgroundTaskResult.Success;
        const quotes = await fetchAnyQuotes(alertQuoteSymbols(alerts));
        const fired = checkAlerts(alerts, quotes, manualPrices);
        if (fired.length) {
          await saveAlerts(markFired(alerts, fired));
          await sendAlertNotifications(fired);
        }
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  }
}

/** Tetiklenen alarmları bildirir (web'de uyarı penceresi). */
export async function sendAlertNotifications(fired: FiredAlert[]): Promise<void> {
  if (IS_WEB) {
    for (const f of fired) {
      const m = alertMessage(f);
      notify(m.title, m.body);
    }
    return;
  }
  for (const f of fired) {
    const m = alertMessage(f);
    await Notifications.scheduleNotificationAsync({
      content: { title: m.title, body: m.body, data: { kind: f.alert.kind, symbol: f.alert.symbol } },
      trigger: null,
    }).catch(() => {});
  }
}

export type NotificationPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function notificationPermission(): Promise<NotificationPermission> {
  if (IS_WEB) return 'unsupported';
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Bildirim izni ister; verildiyse true. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (IS_WEB) return false;
  try {
    const p = await Notifications.requestPermissionsAsync();
    return p.granted;
  } catch {
    return false;
  }
}

/** Arka plan kontrolü kullanılabiliyor mu? */
export async function backgroundAvailable(): Promise<boolean> {
  if (IS_WEB) return false;
  try {
    return (
      (await TaskManager.isAvailableAsync()) &&
      (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available
    );
  } catch {
    return false;
  }
}

/** Etkin alarm varsa arka plan görevini kaydeder, yoksa kaldırır. */
export async function syncAlertTask(alerts: PriceAlert[]): Promise<void> {
  if (IS_WEB) return;
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(ALERT_TASK);
    const want = alerts.some((a) => a.active);
    if (want && !registered && (await backgroundAvailable())) {
      await BackgroundTask.registerTaskAsync(ALERT_TASK, { minimumInterval: 15 });
    } else if (!want && registered) {
      await BackgroundTask.unregisterTaskAsync(ALERT_TASK);
    }
  } catch {
    // arka plan yoksa alarmlar uygulama açıkken kontrol edilir
  }
}
