import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Font } from '@/constants/theme';
import { logoCandidates } from '@/lib/markets';

/** Hangi sitenin kaçıncı aday adresinde logo bulunduğunu hatırlar (-1: bulunamadı). */
const found = new Map<string, number>();
/** Bundan küçük simgeler bulanık görüneceği için kullanılmaz. */
const MIN_PX = 32;

function LetterAvatar({ label, color, size }: { label: string; color: string; size: number }) {
  const letter = (label.match(/[A-Za-z0-9ÇĞİÖŞÜçğıöşü]/)?.[0] ?? '?').toLocaleUpperCase('tr-TR');
  return (
    <View style={[styles.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.44, fontFamily: Font.bold }}>{letter}</Text>
    </View>
  );
}

/**
 * Şirketin kendi sitesindeki simgeyi gösterir (beyaz daire içinde). Yüklenene kadar ve hiç
 * bulunamazsa harf rozeti görünür.
 */
export function CompanyLogo({
  website,
  logoUrl,
  label,
  color,
  size,
}: {
  /** Şirketin internet adresi; logo sitesinden alınır. */
  website?: string;
  /** Doğrudan logo resmi (ör. kripto). Varsa önce o denenir. */
  logoUrl?: string;
  label: string;
  color: string;
  size: number;
}) {
  const candidates = [...(logoUrl ? [logoUrl] : []), ...(website ? logoCandidates(website) : [])];
  // Önbellek anahtarı: bu kaynağın kimliği
  const source = logoUrl ?? website;
  const known = source ? found.get(source) : undefined;
  const [index, setIndex] = useState(known ?? 0);
  const [loaded, setLoaded] = useState(false);
  const letter = <LetterAvatar label={label} color={color} size={size} />;

  if (!source || index < 0 || index >= candidates.length) return letter;

  const next = () => {
    setLoaded(false);
    const n = index + 1;
    if (n >= candidates.length) found.set(source, -1);
    setIndex(n >= candidates.length ? -1 : n);
  };

  return (
    <View style={{ width: size, height: size }}>
      {!loaded && letter}
      <View
        style={[
          styles.round,
          styles.logoBox,
          { width: size, height: size, borderRadius: size / 2, opacity: loaded ? 1 : 0 },
        ]}>
        <Image
          source={{ uri: candidates[index] }}
          style={{ width: size * 0.74, height: size * 0.74 }}
          resizeMode="contain"
          onError={next}
          onLoad={(e) => {
            const src = (e.nativeEvent as { source?: { width?: number; height?: number } }).source;
            if (src?.width && src.width < MIN_PX) return next();
            found.set(source, index);
            setLoaded(true);
          }}
          accessibilityIgnoresInvertColors
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#FFFFFF',
  },
});
