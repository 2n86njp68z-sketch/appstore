import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Yedek dosyasını dışarı verir. Telefonda paylaşma menüsü açılır ("Dosyalar'a Kaydet" ile iCloud Drive,
 * AirDrop, mesaj…); web'de dosya indirilir.
 */
export async function shareBackupFile(json: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, fileName);
  await file.write(json);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda paylaşma kullanılamıyor.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'GENIUS yedeği',
    UTI: 'public.json',
  });
}

/** Kullanıcının seçtiği yedek dosyasının içeriği; vazgeçerse null. */
export async function pickBackupFile(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  if (Platform.OS === 'web') {
    if (asset.file) return asset.file.text();
    return (await fetch(asset.uri)).text();
  }
  return new File(asset.uri).text();
}
