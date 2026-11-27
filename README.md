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
  - Bölümler: en üstte Karşılaştır (altında Piyasa nabzı); Türk Market, TEFAS, BES, Eurobond; ABD Market, ABD ETF; Emtia, Kripto; Nakit.
  - En üstte "Piyasa nabzı": BIST 100, S&P 500, Nasdaq 100, Dolar, Euro, Gram Altın ve Bitcoin yan yana kayar.
  - Bölümler gruplar halinde (Araçlar, Türkiye, ABD, Emtia ve kripto, Nakit ve döviz), her biri kendi renginde kart.
  - Bölüme dokununca kalemler alt alta kutucuklar halinde açılır. Aynı anda tek bölüm açık kalır.
  - Kutunun solundaki çubuk ve sağdaki yön çizgisi yükselende yeşil, düşende kırmızı.
  - Türk Market, TEFAS ve BES'te Türk bayrağı; ABD Market ve ABD ETF'te ABD bayrağı.
    - Türk Market: BIST'teki 629 hisse
    - ABD Market: NASDAQ, NYSE ve NYSE American'daki 5.866 hisse (ADR'ler dahil; ETF, varant ve imtiyazlı paylar hariç)
    - Emtia: altın, gümüş, platin, paladyum ve Brent petrol; her biri dolar bazında ($/ons, Brent $/varil) ve TL bazında (₺/gram, Brent ₺/varil)
    - TEFAS: 2.145 yatırım fonu, günlük fiyat ve değişimiyle
    - BES: 400 emeklilik yatırım fonu, günlük fiyat ve değişimiyle
    - Eurobond (Avrupa Birliği bayrağı): T.C. Hazine ve Maliye Bakanlığı'nın tedavüldeki dolar ve euro cinsi 38 eurobondu (33 USD, 5 EUR; Kasım 2026); vade, kupon, fiyat (100 nominal başına) ve yıllık getiri. Liste Ziraat Bankası ve eurobondpro.com ile karşılaştırılarak doğrulandı.
    - Kripto: piyasa değerine göre ilk 491 coin
    - Nakit: Türk Lirası (fiyatı hep 1 ₺), Dolar (USD/TRY) ve Euro (EUR/TRY); dokununca portföye nakit olarak eklenir. Endeksler (BIST 100, S&P 500, Nasdaq 100) yalnız üstteki Piyasa nabzında görünür.
    - Karşılaştır: [Grafik](https://2n86njp68z-sketch.github.io/Grafik/) sitesi (temettü dahil getiri grafikleri, TL/USD, karşılaştırma); uygulama içi tarayıcıda (iOS'ta Safari penceresi) açılır
      - "Portföyümü karşılaştır": portföyün TL değeri en büyük 4 varlığı (Grafik'in listesinde olanlar) Grafik'te aynı grafikte, temettü dahil açılır; dönem en eski alışı kapsar
    - ABD ETF: ABD borsalarındaki 5.830 ETF; en bilinenler (SPY, VOO, IVV, QQQ…) en üstte, logolar çıkaran şirketin sitesinden
  - Her satırda logo, kod, şirket adı, fiyat ve günlük değişim yazar.
  - Arama tüm bölümlerde birden yapılır.
  - Fiyatlar yalnız ekranda görünen kalemler için 20'li gruplar halinde çekilir.
  - Hisseye dokununca güncel fiyatı dolu işlem ekleme ekranı açılır. Eklenen hisse portföyde de logosuyla görünür.
- **Kâr/zarar:** Halkanın altındaki ince kartta yan yana "Bugün" (günlük) ve "Toplam" kâr/zarar, tutar ve yüzde olarak; yanında "Yıllık" getiri.
- **Portföy değeri grafiği (ana sayfa):** Portföyün zaman içindeki değeri, seçili para biriminde (TL, dolar, euro). Her gün elde olan miktar × o günün kapanışı; son nokta güncel fiyat (ana sayfadaki toplamla aynı).
  - Dönem: 1A, 3A, 6A, 1Y, Tümü. Grafikte parmağını gezdirince o günün tarihi, değeri ve kârı (değer − yatırılan) yazar; açık çizgilerin o günkü değerleri lejantta görünür.
  - Çizgiler: Portföy, Yatırılan (alışlar − satışlar, işlem günündeki kurla; kesikli gri) ve dokunarak açılan ölçütler: BIST 100, S&P 500, Enflasyon (aynı paralar aynı günlerde bunlara yatırılsaydı / enflasyon kadar artsaydı).
  - Geçmiş fiyatlar: hisse, ETF, döviz ve emtia Yahoo'dan; kripto CoinGecko'dan (son 365 gün); TEFAS ve BES fonları TEFAS'tan (site bir istekte en çok 1 ay verdiği için aylık parçalarla, sonra yalnız yeni günler; en çok 8 fon). Yarım günde bir yenilenir, telefonda saklanır.
  - Geçmişi olmayanlar (eurobond, elle fiyatlananlar, CoinGecko'nun 365 günü öncesi) son işlem fiyatıyla çizilir; kartın altında hangileri olduğu yazar. Alınan nakit temettüler çizgiye dahil değildir.
  - Renkler renk körlüğü denetiminden geçmiş kategorik paletten; her çizginin değeri lejantta yazılı olduğu için renge bağlı kalmaz.
  - Web sürümünde tarayıcı Yahoo ve TEFAS'a erişemediği için hisse ve fonlar işlem fiyatlarıyla çizilir (kripto ve ölçütler tam); grafik telefonda tam görünür.
- **Fiyat alarmları:** Varlık sayfasındaki "Fiyat alarmı" bölümünden ("+ Alarm kur") ya da Ayarlar → Araçlar → Fiyat alarmları'ndan.
  - "Üstüne çıkınca" ya da "Altına inince" ve seviye (varlığın kendi para biriminde; eurobondda 100 nominal başına). Öneri olarak şu anki fiyatın %5 üstü gelir; fiyat zaten seviyenin ötesindeyse uyarır.
  - Fiyat seviyeye gelince bir kez bildirim gelir ve alarm kapanır ("Çaldı: tarih · fiyat"); anahtarla yeniden açılabilir, çöp kutusuyla silinir. Listede şu anki fiyat ve seviyeye uzaklık yazar.
  - Uygulama açıkken her fiyat yenilemesinde kontrol edilir (yalnız yeni gelen fiyatlarla). Kapalıyken arka plan görevi (expo-background-task) fiyatları çekip kontrol eder; ne zaman çalışacağına telefon karar verir (en az 15 dakikada bir, iPhone'da çoğu zaman daha seyrek), yani anlık değildir. Arka plan görevi geliştirme/App Store derlemesinde çalışır; Expo Go'da alarmlar uygulama açıkken kontrol edilir.
  - İlk alarmda bildirim izni istenir; reddedildiyse alarmlar ekranından Ayarlar'a gidilir. Web sürümünde bildirim yok, alarm sayfa açıkken uyarı olarak çıkar.
  - Alarmlar yedeğe girer.
- **Ana ekran widget'ı (iPhone):** Expo'nun resmi widget modülüyle (expo-widgets, SwiftUI). Üç boyut: küçük (toplam değer, bugün ve toplam kâr/zarar, yıllık getiri, güncellenme saati), orta (yanında en büyük üç varlık ve günlük değişimleri) ve kilit ekranı (değer ve günlük %). Dokununca uygulama açılır.
  - Seçili para biriminde (TL, dolar, euro) gösterir. Uygulama fiyatları her yenilediğinde widget hazır metinlerle güncellenir; widget kendisi internete çıkmaz.
  - Widget, App Group (group.com.portfoytakip.app) ve ayrı bir uzantı (com.portfoytakip.app.widgets) gerektirdiği için Expo Go'da görünmez; EAS ile alınan geliştirme ya da App Store derlemesinde çıkar (Apple Developer hesabı gerekir). Ayar app.json'daki expo-widgets eklentisinde; kod src/widgets/.
- **Yıllık getiri (XIRR):** Her alış, satış ve temettü kendi tarihiyle hesaba girer; bugünkü değer bugünkü akış sayılır. Çıkan oran mevduat faizi gibi yıllık oranlarla kıyaslanabilir.
  - Ana sayfadaki "Yıllık" hücresi portföyün tamamı içindir (satılıp kapanan varlıklar dahil); dokununca açıklaması çıkar. Seçili para biriminde (TL, dolar, euro) hesaplanır.
  - Varlık detayında "Para birimine göre" kartında her para birimi için ayrı yazar.
  - En az 30 günlük geçmiş gerekir (daha kısa sürede yıllığa çevirmek yanıltıcıdır); 1 yıldan kısa dönemde oran yıllığa çevrilmiştir.
- **Karşılaştırma:** Portföy üç ölçütle karşılaştırılır. Her alış, aynı gün aynı TL tutarıyla ölçüte yatırılmış gibi hesaplanır, satışlar da aynı şekilde düşülür (yalnız bir günü değil, tüm geçmişi karşılaştırır).
  - Sonuç yüzde olarak yazar: "+%12" portföyün ölçütten %12 önde olduğunu, "−%5" geride olduğunu gösterir. Altında "ölçütü alsaydın bugün ne olurdu" tutarı yazar.
  - BIST 100: temettüler dahil getiri endeksi (XU100_CFNNTLTL), Borsa İstanbul'un kendi sitesinden. Alınamazsa ya da güncel değilse XU100 fiyat endeksine (temettüler hariç) düşülür; kartta hangisinin kullanıldığı yazar.
  - S&P 500: temettüler dahil getiri endeksi (^SP500TR), her günün dolar kuruyla TL'ye çevrilir.
  - Enflasyon: TÜİK TÜFE, TCMB'nin enflasyon sayfasından (güncel, anahtar gerekmez). Sayfadaki aylık % değişimler art arda çarpılarak endeks kurulur. Son açıklanan aydan sonraki alışlar için enflasyon henüz bilinmediğinden tutar olduğu gibi alınır; kartta verinin hangi aya kadar olduğu yazar.
- **Varlık türleri:**
  - Türk Market: Borsa İstanbul hisseleri (THYAO, ASELS…)
  - ABD Market: ABD hisseleri (AAPL, BRK.B…)
  - Kripto (BTC, ETH…)
  - Nakit: Türk lirası (TL; fiyat sorulmaz, miktar TL tutarı olarak girilir, fiyatı hep 1 ₺) ve döviz (USD, EUR, GBP, CHF)
  - Emtia: altın, gümüş, platin, paladyum, Brent petrol (dolar ve TL bazında)
  - TEFAS ve BES fonları (fiyat TEFAS'tan otomatik; TEFAS'ta işlem görmeyen fonun fiyatı elle girilebilir)
  - Eurobond: miktar nominal olarak girilir, fiyat 100 nominal başınadır; değer = nominal × fiyat / 100
  - "Diğer": fiyatını elle girdiğin mevduat vb.
- **Alış/satış kaydı:** Ortalama maliyet ve gerçekleşen kâr/zarar hesaplanır.
  - İşlem ekranı: üstte varlığın renginde kart (güncel fiyat, günlük değişim, elindeki miktar ve ortalama maliyet), büyük Alış/Satış düğmesi, büyük miktar alanı.
  - Miktar ya da tutarla giriş: "Tutar"a geçince yazdığın TL/dolar tutarına kaç adet düştüğü hesaplanır (hisse ve eurobond tam adede yuvarlanır). Satışta "%25 · %50 · Tümü" kısayolları.
  - Fiyat kendiliğinden gelir; "Güncel ↻" ile yenilenir. Tarihte "Bugün / Dün" kısayolları.
  - Altta özet: ödenecek/alınacak tutar, alışta işlem sonrası miktar ve yeni ortalama maliyet, satışta gerçekleşecek kâr/zarar ve kalan miktar.
  - "+" ile açılınca önce varlık türü (bayrak/simgeli), sonra arama: kod ya da ad yazdıkça öneriler logolarıyla çıkar; emtia ve dövizde seçenek kartları.
- **Bedelsiz ve temettü:** Elde tutulan hisselerin bedelsiz sermaye artırımları/bölünmeleri ve nakit temettüleri kendiliğinden işlenir (günde bir yenilenir).
  - Bedelsiz/bölünme: hak kullanım gününden önce alınan paylar çoğalır, pay başı maliyet aynı oranda düşer; toplam maliyet değişmez. İşlem listesinde girdiğin adetler görünür.
  - Temettü: hak kullanım gününden önce eldeki pay × pay başına net temettü; kâr/zarara eklenir, varlık detayında "Temettü ve bedelsiz" listesinde görünür.
  - BIST: İş Yatırım şirket kartındaki resmi kayıtlar (temettünün stopaj sonrası net tutarı). ABD hisse ve ETF: Yahoo'nun bölünme/temettü olayları; temettüden ABD'de kaynakta kesilen %20 vergi düşülür.
  - Bedelli sermaye artırımı ödeme gerektirdiği için otomatik işlenmez; katıldıysan alış olarak ekle.
  - Karşılaştırma kartında portföy değerine alınan temettüler de eklenir.
- **Fiyatlar:** Otomatik çekilir. Aşağı çekince ve uygulama öne gelince yenilenir.
- **Kayıt:** Veriler yalnızca telefonda tutulur. Hesap ya da sunucu gerekmez.
- **Hakkında ve gizlilik (Ayarlar → Hakkında):** Sürüm, "yatırım tavsiyesi değildir" uyarısı, kullanılan veri kaynakları (dokununca sitesi açılır), gizlilik politikası, destek ve web sürümü bağlantıları.
- **Yedekleme (Ayarlar → Yedekleme):** İşlemler ve elle girilen fiyatlar tek bir dosya olarak dışa aktarılır (telefonda paylaşma menüsü: Dosyalar'a/iCloud Drive'a kaydet, AirDrop, mesaj; web'de indirme). Yedekten geri yükleme mevcut işlemlerin yerine geçer; "Yedeği ekle" yalnız eksik işlemleri ekler.
- **Birden fazla portföy (Ayarlar → Araçlar → Portföyler):** Hesapları ayrı tutmak için (ör. uzun vade, BES, çocuk hesabı). Portföy eklenir, adı değiştirilir, silinir (Ana portföy silinemez; silinen portföyün işlemleri de silinir).
  - İki ya da daha fazla portföy olunca ana sayfanın üstünde "Tümü · Ana portföy · …" seçici çıkar. Halka, kâr/zarar, yıllık getiri, grafik, karşılaştırma ve widget seçili portföye (ya da hepsine birlikte) göre hesaplanır.
  - Yeni işlemler seçili portföye eklenir ("Tümü"ndeyken Ana portföye); işlem ekleme ekranında portföy değiştirilebilir. Satışta eldeki miktar o portföye göre kontrol edilir. "Tümü" görünümünde varlık sayfasındaki işlemlerin yanında portföy adı yazar.
  - Dengeleme hedef oranları portföy başına ayrı tutulur. Scriptable'dan aktarma seçili portföye yapılır ("Portföyün yerine koy" yalnız o portföyün işlemlerinin yerine geçer).
  - Önceki sürümün verileri ve hedefleri kendiliğinden Ana portföye geçer. Portföyler yedeğe girer.
- **Portföy dengeleme ("Ne alayım?"):** Kâr/zarar kartının altındaki düğmeden ya da Ayarlar → Araçlar'dan açılır. Her varlığa hedef oran girilir (hatırlanır, yedeğe de girer); "Şu anki oranları al" ve "Eşit dağıt" ile hızlı doldurulur.
  - Nakit ekle: satış yapmadan, eklenen nakitle hedefin en gerisindekiler alınır. Satış yapmadan tam hedefe ulaşmak için gereken tutar da yazar.
  - Dengele: hedefin üstündekiler satılır, gelirle altındakiler alınır.
  - Nakit çek: istenen tutar, kalan portföy hedefe en yakın kalacak şekilde fazlası olanlardan satılır.
  - Her varlık kendi alım biriminin katlarıyla önerilir (hisse/fon 1 lot, kripto 0,0001, gram altın 0,1 gr, eurobond 1.000 nominal). Her satırda işlem tutarı ve oranın önce → sonra (hedef) değeri yazar.
  - "Bu işlemleri portföye ekle" ile öneriler güncel fiyattan bugünün tarihiyle işlem olarak eklenir.
- **Scriptable'dan aktarma (Ayarlar → Araçlar):** Scriptable'daki "Ne Alayım?" ve "USD Getiri" scriptlerinin verileri GENIUS'a taşınır; scriptlere dokunulmaz.
  - "Scripti kopyala" ile küçük bir aktarma scripti panoya kopyalanır. Scriptable'da yeni scripte yapıştırıp çalıştırınca ne_alayim.json, lot_log.json ve usd_getiri.json tek dosyada toplanır ve Dosyalar'a (iCloud Drive) kaydedilir. GENIUS'ta "Dosyayı seç" ile bu dosya (ya da üç dosyanın kendisi) seçilir.
  - İşlemler: USD Getiri'nin kaydettiği her alım/satım kendi zamanı ve fiyatıyla; onun henüz işlemediği lot_log kayıtları farklarıyla; Ne Alayım'daki güncel lotlarla kalan fark son bilinen fiyatla. Takibin başladığı gün eldeki lotlar o günün fiyatıyla alınmış sayılır (USD Getiri'deki gibi).
  - Bedelsizler USD Getiri'nin bölünme kayıtlarıyla ayıklanır (alış sayılmaz); GENIUS bedelsiz ve temettüyü kendisi işler.
  - ABD hisseleri ABD Market'e, ETF'ler ABD ETF'e, BES fonları BES'e, "ALTIN" (Tether Gold) kripto XAUT'a (dolar fiyatıyla) aktarılır.
  - Ne Alayım'ın BIST + altın hedef oranları "Ne alayım?" ekranına alınabilir. Önizlemede işlem sayısı, tarih aralığı ve notlar görünür; "Portföye ekle" ya da "Portföyün yerine koy" seçilir. Aynı dosya tekrar eklenirse işlemler çift yazılmaz.
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
    asset/[key].tsx     Varlık detayı, işlem geçmişi ve fiyat alarmı
    settings.tsx        Ayarlar: araçlar, yedekleme, hakkında
    rebalance.tsx       Portföy dengeleme ("Ne alayım?")
    portfolios.tsx      Portföyler (ekle, adını değiştir, sil)
    alerts.tsx          Fiyat alarmları
    import-scriptable.tsx  Scriptable'dan aktarma
    about.tsx, privacy.tsx Hakkında ve gizlilik politikası
  constants/theme.ts    Renkler, yazı tipi ve yazı stilleri
  content/legal.ts      Gizlilik, yasal uyarı ve veri kaynakları metni (uygulama + web)
  widgets/              iPhone ana ekran widget'ı (expo-widgets)
  components/
    market-drawer.tsx   Sol menü: arama, bölümler, piyasa listeleri
    benchmark-card.tsx  Ana sayfadaki karşılaştırma kartı
    value-chart.tsx     Portföy değeri grafiği
    price-alerts.tsx    Alarm satırı ve varlık sayfasındaki alarm bölümü
    portfolio-switcher.tsx  Ana sayfadaki portföy seçici
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
    xirr.ts             Yıllık getiri (XIRR)
    rebalance.ts        Dengeleme hesapları
    value-chart.ts, history.ts  Portföy değeri serisi ve geçmiş fiyatlar
    alerts.ts, alert-task.ts    Fiyat alarmları, bildirim ve arka plan görevi
    portfolios.ts       Birden fazla portföy
    corporate.ts        Bedelsiz/bölünme ve temettü
    backup.ts, backup-io.ts     Yedek dosyası
    scriptable-import.ts        Scriptable verilerini aktarma
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
  - `src/data/funds.ts`: TEFAS (yatırım fonu) ve BES (emeklilik yatırım fonu) listeleri **KAP**'tan, KAP'ta olmayan ama TEFAS'ta işlem görenler **TEFAS**'ın fon listesinden; logolar kurucu şirketin sitesinden
  - `src/data/crypto.ts`: **CoinGecko**'dan ilk 500 coin (logolarıyla)
- Fiyatlar:
  - Hisse, ETF, döviz, emtia ve endeksler (XU100, ^SP500TR): Yahoo Finance
  - BIST 100 getiri endeksi: Borsa İstanbul (`borsaistanbul.com`). Uzun geçmiş dosyası (~500 KB) yalnız yeni kapanış açıklanınca iner, anlık değer saatte bir yenilenir. Site tarayıcıdan erişime izin vermediği için web sürümünde fiyat endeksi kullanılır.
  - Enflasyon (TÜİK TÜFE): TCMB enflasyon sayfası (`www.tcmb.gov.tr`, Ocak 2005'ten bu yana aylık değişimler). Alınamazsa OECD istatistik servisi (`sdmx.oecd.org`, Aralık 2025'e kadar). TCMB sitesi tarayıcıdan erişime izin vermediği için web sürümünde OECD kullanılır.
  - Kripto: CoinGecko, coin kimliğiyle; aynı kısaltmalı coinler karışmaz
  - Eurobond: Ziraat Bankası'nın eurobond sayfasındaki günlük tablo (bankanın alış fiyatı ve getirisi; değer bu fiyatla hesaplanır)
  - Fonlar (TEFAS/BES): **TEFAS'ın açık fon servisi** (`tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir`; 2026'da eski servisin yerine geldi, giriş gerektirmez). Portföydeki birkaç fon için fon başına son iki haftanın fiyatı, listeler için bir fon türündeki bütün fonların son iki işlem günü tek istekte alınır; günlük değişim bu iki günden hesaplanır.
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
python3 -I scripts/fetch-tefas-funds.py /tmp/tefas
python3 -I scripts/build-fund-data.py /tmp/fon/funds.json /tmp/tefas/tefas-YAT.json /tmp/tefas/tefas-EMK.json > src/data/funds.ts
python3 -I scripts/fetch-crypto-sources.py /tmp/kripto
python3 -I scripts/build-crypto-data.py /tmp/kripto/crypto.json > src/data/crypto.ts
curl -sL -o /tmp/ziraat-eurobond.html https://www.ziraatbank.com.tr/tr/bireysel/yatirim/eurobond
curl -sL -o /tmp/eurobondpro.html https://eurobondpro.com/hazine-eurobond-listesi
python3 -I scripts/build-eurobond-data.py /tmp/ziraat-eurobond.html /tmp/eurobondpro.html > src/data/eurobonds.ts
```

Uygulama simgeleri (iOS, açılış, Android, favicon) logodaki italik G'den üretilir (Playwright gerekir):

```bash
node scripts/build-app-icons.mjs
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

## App Store'a gönderme

Uygulama tarafı hazır: gizlilik politikası, yasal uyarı, veri kaynakları, Apple'ın istediği gizlilik bildirimi (privacy manifest) ve EAS derleme ayarları projede. Kalan adımlar Apple hesabı gerektirdiği için senin:

1. [Apple Developer Program](https://developer.apple.com/programs/)'a kaydol (yıllık 99 $) ve [expo.dev](https://expo.dev)'de ücretsiz hesap aç.
2. `app.json` içindeki `ios.bundleIdentifier` (şu an `com.portfoytakip.app`) ve widget eklentisindeki `bundleIdentifier` / `groupIdentifier` değerlerini kendine özel yap (ör. `com.adin.genius`, `com.adin.genius.widgets`, `group.com.adin.genius`). Üçü aynı kökten olmalı.
3. Telefonda deneme derlemesi (widget, arka plan alarmı ve bildirimler dahil her şey çalışır): `npx eas-cli@latest build --platform ios --profile development`. Çıkan bağlantıdan iPhone'a kurulur; geliştirme sunucusu `npx expo start` ile açılır.
4. App Store derlemesi: `npx eas-cli@latest build --platform ios --profile production` (sürüm numarası EAS'ta kendiliğinden artar; sertifikaları ve App Group'u EAS ayarlar).
5. Gönder: `npx eas-cli@latest submit --platform ios`. Önce TestFlight'ta dene, sonra incelemeye gönder.

**App Store Connect'te doldurulacaklar:**

| Alan | Değer |
| --- | --- |
| Kategori | Finans (Finance) |
| Gizlilik politikası URL'si | https://2n86njp68z-sketch.github.io/appstore/privacy.html |
| Destek URL'si | https://2n86njp68z-sketch.github.io/appstore/support.html |
| Uygulama gizliliği (App Privacy) | "Data Not Collected" (veri toplanmıyor): hesap, analitik, reklam ve izleme yok; veriler cihazda |
| Şifreleme (Export Compliance) | Standart dışı şifreleme yok (`usesNonExemptEncryption: false` app.json'da) |
| Yaş sınırı | 4+ (kumar, kullanıcı içeriği vb. yok) |
| İnceleme notu | "Hesap ya da giriş gerekmez. Fiyatlar herkese açık kaynaklardan (Yahoo Finance, CoinGecko, TEFAS…) çekilir; uygulama alım-satım yaptırmaz, yalnızca kullanıcının girdiği işlemleri takip eder." |

- Ekran görüntüleri: 6,9" (1320×2868) ve 6,5" (1284×2778) iPhone boyutları istenir; geliştirme derlemesinden ya da simülatörden alınabilir.
- Gizlilik ve destek sayfaları `src/content/legal.ts`'teki metinden üretilir (`scripts/build-legal-html.ts`); web sürümüyle birlikte GitHub Pages'e yayınlanır ve uygulamada Ayarlar → Hakkında / Gizlilik politikası'nda görünür. Metni değiştirince ikisi birlikte güncellenir.
- "Yatırım tavsiyesi değildir" uyarısı: Hakkında ekranında, dengeleme ekranının altında ve ana sayfanın en altında.
- Gizlilik bildirimi (`ios.privacyManifests`): uygulamanın kullandığı sistem API'leri (UserDefaults, dosya zamanları, açılış süresi, disk alanı) Apple'ın onaylı gerekçeleriyle bildirildi; veri toplama ve izleme yok.

## Bilinen sınırlamalar

- Fiyatlar Yahoo Finance'in resmi olmayan uç noktasından geliyor. Gecikmeli olabilir.
  - Yayına çıkmadan önce lisanslı bir veri sağlayıcı düşünülmeli.
  - Sağlayıcı değişirse yalnızca `src/lib/prices.ts` değişir.
- Geçmiş kurlar da Yahoo Finance'ten günlük kapanış olarak alınıyor. Gün içi kur farkı dikkate alınmıyor.
- TEFAS fon servisi resmi olarak belgelenmemiştir; değişirse fon fiyatları gelmez (o zaman fiyat elle girilebilir).
- Türkiye CDS'i yok: güncel CDS yayımlayan siteler (investing.com, Bloomberg HT, doviz.com) ya ücretli ya da otomatik veri çekmeye izin vermiyor; ücretsiz `fveri.com` verisi Haziran 2026'da kalmış. Lisanslı bir kaynak bulununca Nakit bölümünün yanına eklenebilir.
- TÜFE, TCMB sayfasındaki tablodan okunuyor; sayfanın düzeni değişirse okuma bozulabilir (o zaman OECD'ye düşer). Daha sağlam yol TCMB EVDS servisi (`evds3.tcmb.gov.tr`, ücretsiz ama kişisel API anahtarı ister).
- Bedelsiz ve temettü kayıtları web sürümünde alınamıyor (kaynaklar tarayıcıdan erişime izin vermiyor); telefondaki uygulamada çalışır.
- Veriler yalnızca telefonda duruyor; uygulama silinirse gider. Ayarlar'dan düzenli yedek alınmalı.
