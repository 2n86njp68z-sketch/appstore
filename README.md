# GENIUS

Portföy takip uygulaması.

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
  - Bölümler: Türk Market, TEFAS, BES (Türk bayraklılar), ABD Market, ABD ETF (ABD bayraklılar), Emtia, Kripto, Endeks, Kurlar, Karşılaştır.
  - En üstte "Piyasa nabzı": BIST 100, S&P 500, Nasdaq 100, Dolar, Euro, Gram Altın ve Bitcoin yan yana kayar.
  - Bölümler gruplar halinde (Türkiye, ABD, Emtia ve kripto, Piyasa özeti, Araçlar), her biri kendi renginde kart.
  - Bölüme dokununca kalemler alt alta kutucuklar halinde açılır. Aynı anda tek bölüm açık kalır.
  - Kutunun solundaki çubuk ve sağdaki yön çizgisi yükselende yeşil, düşende kırmızı.
  - Türk Market, TEFAS ve BES'te Türk bayrağı; ABD Market ve ABD ETF'te ABD bayrağı.
    - Türk Market: BIST'teki 629 hisse
    - ABD Market: NASDAQ, NYSE ve NYSE American'daki 5.866 hisse (ADR'ler dahil; ETF, varant ve imtiyazlı paylar hariç)
    - Emtia: altın, gümüş, platin, paladyum ve Brent petrol; her biri dolar bazında ($/ons, Brent $/varil) ve TL bazında (₺/gram, Brent ₺/varil)
    - TEFAS: 2.106 yatırım fonu
    - BES: 288 emeklilik yatırım fonu
    - Eurobond (Avrupa Birliği bayrağı): T.C. Hazine ve Maliye Bakanlığı'nın dolar ve euro cinsi 38 eurobondu; vade, döviz cinsi, fiyat (100 nominal başına) ve yıllık getiri
    - Kripto: piyasa değerine göre ilk 491 coin
    - Endeks: S&P 500, Nasdaq 100, BIST 100 (yalnız izlenir, portföye eklenmez)
    - Kurlar: Dolar (USD/TRY) ve Euro (EUR/TRY); dokununca portföye döviz olarak eklenir
    - Karşılaştır: [Grafik](https://2n86njp68z-sketch.github.io/Grafik/) sitesi (temettü dahil getiri grafikleri, TL/USD, karşılaştırma); uygulama içi tarayıcıda (iOS'ta Safari penceresi) açılır
      - "Portföyümü karşılaştır": portföyün TL değeri en büyük 4 varlığı (Grafik'in listesinde olanlar) Grafik'te aynı grafikte, temettü dahil açılır; dönem en eski alışı kapsar
    - ABD ETF: ABD borsalarındaki 5.830 ETF; en bilinenler (SPY, VOO, IVV, QQQ…) en üstte, logolar çıkaran şirketin sitesinden
  - Her satırda logo, kod, şirket adı, fiyat ve günlük değişim yazar.
  - Arama tüm bölümlerde birden yapılır.
  - Fiyatlar yalnız ekranda görünen kalemler için 20'li gruplar halinde çekilir.
  - Hisseye dokununca güncel fiyatı dolu işlem ekleme ekranı açılır. Eklenen hisse portföyde de logosuyla görünür.
- **Kâr/zarar:** Halkanın altındaki ince kartta yan yana "Bugün" (günlük) ve "Toplam" kâr/zarar, tutar ve yüzde olarak.
- **Karşılaştırma:** Portföy üç ölçütle karşılaştırılır. Her alış, aynı gün aynı TL tutarıyla ölçüte yatırılmış gibi hesaplanır, satışlar da aynı şekilde düşülür (yalnız bir günü değil, tüm geçmişi karşılaştırır).
  - Sonuç yüzde olarak yazar: "+%12" portföyün ölçütten %12 önde olduğunu, "−%5" geride olduğunu gösterir. Altında "ölçütü alsaydın bugün ne olurdu" tutarı yazar.
  - BIST 100: temettüler dahil getiri endeksi (XU100_CFNNTLTL), Borsa İstanbul'un kendi sitesinden. Alınamazsa ya da güncel değilse XU100 fiyat endeksine (temettüler hariç) düşülür; kartta hangisinin kullanıldığı yazar.
  - S&P 500: temettüler dahil getiri endeksi (^SP500TR), her günün dolar kuruyla TL'ye çevrilir.
  - Enflasyon: TÜİK TÜFE, TCMB'nin enflasyon sayfasından (güncel, anahtar gerekmez). Sayfadaki aylık % değişimler art arda çarpılarak endeks kurulur. Son açıklanan aydan sonraki alışlar için enflasyon henüz bilinmediğinden tutar olduğu gibi alınır; kartta verinin hangi aya kadar olduğu yazar.
- **Varlık türleri:**
  - Türk Market: Borsa İstanbul hisseleri (THYAO, ASELS…)
  - ABD Market: ABD hisseleri (AAPL, BRK.B…)
  - Kripto (BTC, ETH…)
  - Döviz (USD, EUR, GBP, CHF)
  - Emtia: altın, gümüş, platin, paladyum, Brent petrol (dolar ve TL bazında)
  - TEFAS ve BES fonları (fiyat elle girilir)
  - Eurobond: miktar nominal olarak girilir, fiyat 100 nominal başınadır; değer = nominal × fiyat / 100
  - "Diğer": fiyatını elle girdiğin mevduat vb.
- **Alış/satış kaydı:** Ortalama maliyet ve gerçekleşen kâr/zarar hesaplanır
- **Fiyatlar:** Otomatik çekilir. Aşağı çekince ve uygulama öne gelince yenilenir.
- **Kayıt:** Veriler yalnızca telefonda tutulur. Hesap ya da sunucu gerekmez.
- **Görünüm:** Telefonun ayarına göre gündüz beyaz, gece siyah. Yazı tipi Manrope (₺ ve Türkçe harf destekli).

## Web sürümü (link)

Uygulamanın web sürümü GitHub Pages'te: **https://2n86njp68z-sketch.github.io/appstore/**

- Telefondan ya da bilgisayardan linke dokunup açılır. Telefonda tarayıcı menüsünden "Ana Ekrana Ekle" denebilir.
- Tarayıcılar Yahoo, Borsa İstanbul ve TCMB'ye doğrudan erişemediği için fiyatlar GitHub'da hazırlanır:
  `.github/workflows/pages.yml` hafta içi saatte bir, hafta sonu günde bir `scripts/build-web-data.ts` ile tüm listelerin
  (~12.300 sembol) fiyatlarını, kur/endeks geçmişlerini, BIST 100 getiri endeksini ve TÜFE'yi çekip sitenin yanına koyar
  (`gh-pages` branch'i). Web sürümündeki fiyatlar bu yüzden en fazla bir saatlik olabilir; kripto canlıdır.
- Veriler (işlemler) tarayıcıda, o cihazda saklanır.
- Telefondaki uygulama bu dosyaları kullanmaz, verileri doğrudan kaynaklarından çeker.

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
    market-drawer.tsx   Sol menü: arama, bölümler, piyasa listeleri
    benchmark-card.tsx  Ana sayfadaki karşılaştırma kartı
    company-logo.tsx    Şirket logosu (sitesinden), yoksa harf rozeti
    donut-chart.tsx     Dokunulabilir halka grafik
    asset-icon.tsx      Bayraklar, külçeler ve harf rozetleri (SVG)
    ui.tsx              Ortak bileşenler (kart, buton…)
  context/              Uygulama durumu, kayıt ve fiyat yenileme
  data/                 BIST, ABD, ETF, fon ve kripto listeleri (üretilmiş dosyalar)
  lib/
    markets.ts          Piyasalar, hisse arama ve logo adresleri
    portfolio.ts        Hesaplamalar (ortalama maliyet, K/Z, TL/USD/EUR toplamlar)
    benchmarks.ts       BIST 100, S&P 500 ve enflasyon karşılaştırması
    donut.ts            Grafik dilimleri, renkler ve dokunma hesabı
    prices.ts           Fiyat, geçmiş kur ve TÜFE çekme (Yahoo Finance, CoinGecko, OECD)
    format.ts           Türkçe sayı/tarih biçimleri
    assets.ts           Varlık türleri ve semboller
tests/                  Birim testleri
```

## Hisse listesi ve logolar

- Hisse listeleri ücretsiz ve herkese açık kaynaklardan üretilir:
  - `src/data/bist.ts`: hisse kodu, adı ve sektörü **İş Yatırım**'dan, internet adresi **KAP**'tan
  - `src/data/us.ts`: kod, ad ve borsa **NASDAQ Trader** sembol dizininden, internet adresi **Wikidata**'dan (CC0)
  - `src/data/etf.ts`: ETF'ler yine **NASDAQ Trader** dizininden; logo için çıkaran şirketin (iShares, Vanguard, SPDR…) sitesi adından bulunur
  - `src/data/funds.ts`: TEFAS (yatırım fonu) ve BES (emeklilik yatırım fonu) listeleri **KAP**'tan; logolar kurucu şirketin sitesinden
  - `src/data/crypto.ts`: **CoinGecko**'dan ilk 500 coin (logolarıyla)
- Fiyatlar:
  - Hisse, ETF, döviz, emtia ve endeksler (XU100, ^SP500TR): Yahoo Finance
  - BIST 100 getiri endeksi: Borsa İstanbul (`borsaistanbul.com`). Uzun geçmiş dosyası (~500 KB) yalnız yeni kapanış açıklanınca iner, anlık değer saatte bir yenilenir. Site tarayıcıdan erişime izin vermediği için web sürümünde fiyat endeksi kullanılır.
  - Enflasyon (TÜİK TÜFE): TCMB enflasyon sayfası (`www.tcmb.gov.tr`, Ocak 2005'ten bu yana aylık değişimler). Alınamazsa OECD istatistik servisi (`sdmx.oecd.org`, Aralık 2025'e kadar). TCMB sitesi tarayıcıdan erişime izin vermediği için web sürümünde OECD kullanılır.
  - Kripto: CoinGecko, coin kimliğiyle; aynı kısaltmalı coinler karışmaz
  - Eurobond: Ziraat Bankası'nın eurobond sayfasındaki günlük tablo (bankanın alış fiyatı ve getirisi; değer bu fiyatla hesaplanır)
  - Fonlar (TEFAS/BES): **elle girilir.** Günlük fon fiyatları yalnız TEFAS'ta var ve TEFAS sitesi otomatik erişime karşı korunuyor. Lisanslı bir veri kaynağı bağlanınca otomatik olabilir.
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
python3 -I scripts/build-etf-data.py /tmp/us/us-etfs.json > src/data/etf.ts
python3 -I scripts/fetch-fund-sources.py /tmp/fon       # pdftotext gerekir (poppler-utils)
python3 -I scripts/build-fund-data.py /tmp/fon/funds.json > src/data/funds.ts
python3 -I scripts/fetch-crypto-sources.py /tmp/kripto
python3 -I scripts/build-crypto-data.py /tmp/kripto/crypto.json > src/data/crypto.ts
curl -sL -o /tmp/ziraat-eurobond.html https://www.ziraatbank.com.tr/tr/bireysel/yatirim/eurobond
python3 -I scripts/build-eurobond-data.py /tmp/ziraat-eurobond.html > src/data/eurobonds.ts
```

Logo (GENIUS) çizgileri Unbounded Black yazı tipinden üretilir (fontTools gerekir):

```bash
python3 -I scripts/build-logo.py node_modules/@expo-google-fonts/unbounded/900Black/Unbounded_900Black.ttf > src/components/genius-logo-paths.ts
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
- TEFAS/BES fon fiyatları elle giriliyor (yukarıda nedeni yazıyor).
- Türkiye CDS'i yok: güncel CDS yayımlayan siteler (investing.com, Bloomberg HT, doviz.com) ya ücretli ya da otomatik veri çekmeye izin vermiyor; ücretsiz `fveri.com` verisi Haziran 2026'da kalmış. Lisanslı bir kaynak bulununca Kurlar bölümüne eklenebilir.
- TÜFE, TCMB sayfasındaki tablodan okunuyor; sayfanın düzeni değişirse okuma bozulabilir (o zaman OECD'ye düşer). Daha sağlam yol TCMB EVDS servisi (`evds3.tcmb.gov.tr`, ücretsiz ama kişisel API anahtarı ister).
- Veriler yalnızca telefonda duruyor. Uygulama silinirse veriler de silinir. Yedekleme ileride eklenebilir.
