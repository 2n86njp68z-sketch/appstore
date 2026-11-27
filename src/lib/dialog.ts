import { Alert, Platform } from 'react-native';

/** Onay sorusu; web'de tarayıcının onay penceresi. */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Tamam',
  destructive = false,
): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(Boolean(globalThis.confirm?.(`${title}\n\n${message}`)));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/** Bilgi mesajı; web'de tarayıcının uyarı penceresi. */
export function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
