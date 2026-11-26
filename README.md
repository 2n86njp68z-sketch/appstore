# Portföy Takip

Hisse (BIST ve ABD), kripto, döviz, gram altın/gümüş ve fon gibi varlıkları tek yerde takip eden iPhone/Android uygulaması.
Expo (React Native) ile yazıldı. Geliştirmek ve App Store'a göndermek için Mac gerekmez.

## Özellikler

- **Halka grafik:** Ana sayfanın ortasında portföy türlere göre (Türk Market, ABD Market, Emtia…) dilim dilim görünür.
  - Her dilimin portföydeki payı halkanın kenarında yazar.
  - Bir dilime dokununca o dilim yerinde içindeki varlıklara ayrılır, her biri farklı renkte. Diğer dilimler soluklaşır.
  - Ayrılan bir varlığa dokununca ortada onun değeri yazar.
  - "‹ Tüm portföy" düğmesiyle ya da halkanın dışına dokunarak geri dönülür.
- **Para birimi:** Halkanın ortasına her dokunuşta TL → Dolar → Euro → TL arasında geçilir.
  - Ana sayfadaki tüm tutarlar ve kâr/zarar seçilen para biriminde görünür. Seçim hatırlanır.
  - Dolar ve euro bazında kâr/zarar, her alışın kendi tarihindeki kurla hesaplanır. Bu yüzden TL'de kârda olan bir varlık dolar bazında zararda görünebilir.
- **Simgeler:** Yuvarlak bayrak ve resimler.
  - Türk Market için Türk bayrağı, ABD Market için ABD bayrağı, Emtia için altın külçe.
  - Dövizlerde bayrak çifti (ör. USD/TRY), gümüş için gümüş külçe.
  - Hisse ve kriptolarda dilim rengiyle harf rozeti.
- **Piyasalar menüsü (sol üstteki ☰):**
  - En üstte arama çubuğu var. Kod ya da şirket adı yazdıkça sonuçlar anında süzülür, Türkçe harf farkı önemli değildir.
  - Bölümler: Türk Market, ABD Market, Emtia, Fon, ABD ETF. Türk Market ve ABD Market hazır, diğerleri "yakında".
  - Bölüme dokununca hisseler alt alta açılır. Aynı anda tek bölüm açık kalır.
    - Türk Market: BIST'teki 629 hisse
    - ABD Market: NASDAQ, NYSE ve NYSE American'daki 5.866 hisse (ADR'ler dahil; ETF, varant ve imtiyazlı paylar hariç)
  - Her satırda logo, kod, şirket adı, fiyat ve günlük değişim yazar.
  - Arama iki piyasada birden yapılır.
  - Fiyatlar yalnız ekranda görünen hisseler için 20'li gruplar halinde çekilir.
  - Hisseye dokununca güncel fiyatı dolu işlem ekleme ekranı açılır. Eklenen hisse portföyde de logosuyla görünür.
- **Portföy özeti:** Toplam değer (TL), toplam kâr/zarar, günlük değişim
- **Varlık türleri:**
  - Türk Market: Borsa İstanbul hisseleri (THYAO, ASELS…)
  - ABD Market: ABD hisseleri (AAPL, BRK.B…)
  - Kripto (BTC, ETH…)
  - Döviz (USD, EUR, GBP, CHF)
  - Emtia: gram altın ve gram gümüş
  - "Diğer": fiyatını elle girdiğin fon, mevduat vb.
- **Alış/satış kaydı:** Ortalama maliyet ve gerçekleşen kâr/zarar hesaplanır
- **Fiyatlar:** Otomatik çekilir. Aşağı çekince ve uygulama öne gelince yenilenir.
- **Kayıt:** Veriler yalnızca telefonda tutulur. Hesap ya da sunucu gerekmez.
- **Görünüm:** Telefonun ayarına göre gündüz beyaz, gece siyah. Yazı tipi Manrope (₺ ve Türkçe harf destekli).

## Proje yapısı

```
src/
  app/                  Ekranlar (Expo Router)
    _layout.tsx         Gezinme ve tema
    index.tsx           Ana sayfa: halka grafik + liste
    add.tsx             İşlem ekleme
    asset/[key].tsx     Varlık detayı ve işlem geçmişi
  constants/theme.ts    Renkler, yazı tipi ve yazı stilleri
  components/
    market-drawer.tsx   Sol menü: arama, bölümler, Türk Market listesi
    company-logo.tsx    Şirket logosu (sitesinden), yoksa harf rozeti
    donut-chart.tsx     Dokunulabilir halka grafik
    asset-icon.tsx      Bayraklar, külçeler ve harf rozetleri (SVG)
    ui.tsx              Ortak bileşenler (kart, buton…)
  context/              Uygulama durumu, kayıt ve fiyat yenileme
  data/bist.ts, us.ts   BIST ve ABD hisseleri (üretilmiş dosyalar)
  lib/
    markets.ts          Piyasalar, hisse arama ve logo adresleri
    portfolio.ts        Hesaplamalar (ortalama maliyet, K/Z, TL/USD/EUR toplamlar)
    donut.ts            Grafik dilimleri, renkler ve dokunma hesabı
    prices.ts           Fiyat ve geçmiş kur çekme (Yahoo Finance)
    format.ts           Türkçe sayı/tarih biçimleri
    assets.ts           Varlık türleri ve semboller
tests/                  Birim testleri
```

## Hisse listesi ve logolar

- Hisse listeleri ücretsiz ve herkese açık kaynaklardan üretilir:
  - `src/data/bist.ts`: hisse kodu, adı ve sektörü **İş Yatırım**'dan, internet adresi **KAP**'tan
  - `src/data/us.ts`: kod, ad ve borsa **NASDAQ Trader** sembol dizininden, internet adresi **Wikidata**'dan (CC0)
- ABD'de bilinen şirketlerin hepsinin internet adresi var. Wikidata'da kaydı olmayan küçük şirketlerde (yaklaşık 3.700) harf rozeti görünür.
- Logolar uygulama çalışırken şirketin kendi sitesinden alınır. Sıra şöyle:
  1. Sitenin büyük simgesi (`apple-touch-icon`)
  2. Google'ın simge servisindeki büyük kopyası
  3. `favicon.ico`
- Hiçbiri yoksa ya da simge 32 pikselden küçükse harf rozeti görünür.
- Logolar şirketlerin ticari markalarıdır. App Store'a çıkmadan önce lisanslı bir logo/veri kaynağı düşünülmeli.

Listeyi güncellemek için (internet erişimi gerekir):

```bash
python3 -I scripts/fetch-bist-sources.py /tmp/bist
python3 -I scripts/build-bist-data.py /tmp/bist/stocks.json /tmp/bist/sites.json > src/data/bist.ts
python3 -I scripts/fetch-us-sources.py /tmp/us
python3 -I scripts/build-us-data.py /tmp/us/us-stocks.json /tmp/us/us-sites.json > src/data/us.ts
```

## Komutlar

```bash
npm install          # bağımlılıkları kur
npm start            # geliştirme sunucusunu başlat (QR kod çıkar)
npm test             # testleri çalıştır
npm run typecheck    # tip kontrolü
npm run lint         # kod denetimi (ESLint)
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
- Geçmiş kurlar da Yahoo Finance'ten günlük kapanış olarak alınıyor. Gün içi kur farkı dikkate alınmıyor.
- Veriler yalnızca telefonda duruyor. Uygulama silinirse veriler de silinir. Yedekleme ileride eklenebilir.
