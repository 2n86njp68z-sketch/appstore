# Portföy Takip

Hisse (BIST ve ABD), kripto, döviz, gram altın/gümüş ve fon gibi varlıkları tek yerde takip eden iPhone/Android uygulaması.
Expo (React Native) ile yazıldı. Geliştirmek ve App Store'a göndermek için Mac gerekmez.

## Özellikler

- **Portföy özeti:** Toplam değer (TL), toplam kâr/zarar, günlük değişim
- **Dağılım çubuğu:** Varlık türlerine göre yüzdeler
- **Varlık türleri:**
  - BIST hisse (THYAO, ASELS…)
  - ABD hisse (AAPL…)
  - Kripto (BTC, ETH…)
  - Döviz (USD, EUR, GBP, CHF)
  - Gram altın ve gram gümüş
  - "Diğer": fiyatını elle girdiğin fon, mevduat vb.
- **Alış/satış kaydı:** Ortalama maliyet ve gerçekleşen kâr/zarar hesaplanır
- **Fiyatlar:** Otomatik çekilir. Aşağı çekince ve uygulama öne gelince yenilenir.
- **Kayıt:** Veriler yalnızca telefonda tutulur. Hesap ya da sunucu gerekmez.
- **Görünüm:** Açık ve koyu tema

## Proje yapısı

```
src/
  app/                  Ekranlar (Expo Router)
    _layout.tsx         Gezinme ve tema
    index.tsx           Ana sayfa: özet + varlık listesi
    add.tsx             İşlem ekleme
    asset/[key].tsx     Varlık detayı ve işlem geçmişi
  components/ui.tsx     Ortak bileşenler (kart, buton, dağılım çubuğu…)
  context/              Uygulama durumu, kayıt ve fiyat yenileme
  lib/
    portfolio.ts        Hesaplamalar (ortalama maliyet, K/Z, toplamlar)
    prices.ts           Fiyat çekme (Yahoo Finance)
    format.ts           Türkçe sayı/tarih biçimleri
    assets.ts           Varlık türleri ve semboller
tests/                  Birim testleri
```

## Komutlar

```bash
npm install          # bağımlılıkları kur
npm start            # geliştirme sunucusunu başlat (QR kod çıkar)
npm test             # testleri çalıştır
npm run typecheck    # tip kontrolü
npm run format       # kodu biçimlendir
```

## iPhone'da deneme (Mac gerekmez)

1. iPhone'a App Store'dan **Expo Go** uygulamasını kur.
2. Bir bilgisayarda (Windows olur) projeyi indir. Bilgisayarda [Node.js](https://nodejs.org) kurulu olmalı.
3. `npm install`, ardından `npm start` çalıştır.
4. Ekrandaki QR kodu iPhone kamerasıyla okut. Uygulama Expo Go içinde açılır.

Telefon ile bilgisayar aynı Wi-Fi'da değilse `npx expo start --tunnel` kullan.

## App Store'a gönderme (sonraki adım)

1. [Apple Developer Program](https://developer.apple.com/programs/)'a kaydol (yıllık 99 $).
2. [expo.dev](https://expo.dev) üzerinde ücretsiz hesap aç.
3. iOS sürümünü Expo'nun bulut sunucularında derle: `npx eas-cli@latest build --platform ios`. Sertifikaları EAS otomatik ayarlar.
4. App Store Connect'e gönder: `npx eas-cli@latest submit --platform ios`. Önce TestFlight'ta dene, sonra incelemeye gönder.

Göndermeden önce `app.json` içindeki `ios.bundleIdentifier` değerini (şu an `com.portfoytakip.app`) kendine özel bir değerle değiştir.

## Bilinen sınırlamalar

- Fiyatlar Yahoo Finance'in resmi olmayan uç noktasından geliyor. Gecikmeli olabilir.
  - Yayına çıkmadan önce lisanslı bir veri sağlayıcı düşünülmeli.
  - Sağlayıcı değişirse yalnızca `src/lib/prices.ts` değişir.
- Dolar bazlı varlıkların TL kâr/zararı güncel kurla hesaplanıyor. Alış günündeki kur dikkate alınmıyor.
- Veriler yalnızca telefonda duruyor. Uygulama silinirse veriler de silinir. Yedekleme ileride eklenebilir.
