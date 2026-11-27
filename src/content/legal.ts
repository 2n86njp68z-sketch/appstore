/**
 * Gizlilik politikası, yasal uyarı ve veri kaynakları. Aynı metin uygulamada (Hakkında, Gizlilik) ve web'de
 * (scripts/build-legal-html.ts ile üretilen privacy.html; App Store Connect'teki gizlilik bağlantısı) gösterilir.
 */

export const SITE_URL = 'https://2n86njp68z-sketch.github.io/appstore/';
export const PRIVACY_URL = `${SITE_URL}privacy.html`;
export const SUPPORT_URL = `${SITE_URL}support.html`;
export const LEGAL_UPDATED = '27 Kasım 2026';

export const DISCLAIMER =
  'GENIUS bir portföy takip aracıdır, yatırım danışmanlığı hizmeti vermez. Burada yer alan bilgi, hesap ve öneriler ' +
  'yatırım danışmanlığı kapsamında değildir; yatırım tavsiyesi değildir. Fiyatlar gecikmeli olabilir ya da hata ' +
  'içerebilir. Yatırım kararlarını kendi araştırmana ve risk tercihlerine göre ver.';

export interface DataSource {
  name: string;
  use: string;
  url: string;
}

export const DATA_SOURCES: DataSource[] = [
  {
    name: 'Yahoo Finance',
    use: 'BIST ve ABD hisseleri, ETF, döviz, emtia ve endeks fiyatları; geçmiş fiyatlar; ABD bölünme ve temettüleri',
    url: 'https://finance.yahoo.com',
  },
  { name: 'CoinGecko', use: 'Kripto para fiyatları ve geçmişi', url: 'https://www.coingecko.com' },
  { name: 'TEFAS', use: 'Yatırım ve emeklilik (BES) fonu fiyatları', url: 'https://www.tefas.gov.tr' },
  { name: 'Borsa İstanbul', use: 'BIST 100 getiri endeksi (temettüler dahil)', url: 'https://www.borsaistanbul.com' },
  {
    name: 'Türkiye Cumhuriyet Merkez Bankası',
    use: 'TÜFE aylık değişimleri (enflasyon karşılaştırması)',
    url: 'https://www.tcmb.gov.tr',
  },
  { name: 'OECD', use: 'TÜFE (TCMB verisine ulaşılamazsa yedek)', url: 'https://data.oecd.org' },
  {
    name: 'İş Yatırım',
    use: 'BIST şirketlerinin bedelsiz sermaye artırımı ve temettü kayıtları',
    url: 'https://www.isyatirim.com.tr',
  },
  { name: 'Ziraat Bankası', use: 'Hazine eurobond fiyatları ve getirileri', url: 'https://www.ziraatbank.com.tr' },
  { name: 'Şirketlerin web siteleri', use: 'Hisse ve ETF logoları', url: 'https://www.kap.org.tr' },
];

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: 'Özet',
    paragraphs: [
      'GENIUS hesap açmanı istemez ve kişisel veri toplamaz. Girdiğin işlemler, hedef oranlar, fiyat alarmları ve ayarlar yalnızca kendi cihazında saklanır; geliştiriciye ya da başka birine gönderilmez. Uygulamada reklam, analitik ya da izleme (tracking) yoktur.',
    ],
  },
  {
    title: 'Cihazında saklanan veriler',
    paragraphs: [
      'Alım-satım işlemlerin, elle girdiğin fiyatlar, portföy adları, dengeleme hedefleri, fiyat alarmları, seçtiğin para birimi ve son çekilen fiyatlar uygulamanın cihazdaki yerel deposunda tutulur. Uygulamayı silersen bu veriler de silinir.',
      "Ana ekran widget'ı için portföy değeri ve günlük değişim gibi özet metinler, cihazdaki uygulama ile widget arasında paylaşılan alanda (App Group) tutulur.",
    ],
  },
  {
    title: 'Fiyat verisi için yapılan istekler',
    paragraphs: [
      'Güncel ve geçmiş fiyatları göstermek için uygulama doğrudan aşağıdaki "Veri kaynakları" bölümündeki hizmetlere istek gönderir. Bu isteklerde yalnızca fiyatı sorulan varlığın kodu (ör. THYAO.IS, bitcoin, fon kodu) ve tarih aralığı bulunur; miktarların, tutarların ya da kişisel bilgilerin gönderilmez.',
      'Bu hizmetler, her internet isteğinde olduğu gibi IP adresini ve hangi varlıkların fiyatının sorulduğunu görebilir. Bu bilgiler o hizmetlerin kendi gizlilik politikalarına tabidir.',
    ],
  },
  {
    title: 'Bildirimler',
    paragraphs: [
      "Fiyat alarmları cihazında yerel bildirim olarak oluşturulur. Bildirim için bir sunucu kullanılmaz; bildirim iznini istediğin zaman iPhone Ayarlar'ından kapatabilirsin.",
    ],
  },
  {
    title: 'Yedekleme ve aktarma',
    paragraphs: [
      'Yedeği dışa aktardığında dosya yalnızca senin seçtiğin yere (ör. Dosyalar, iCloud Drive, AirDrop) kaydedilir. Yedekten geri yükleme ve Scriptable verilerini aktarma, seçtiğin dosya cihazında okunarak yapılır; dosya hiçbir sunucuya gönderilmez.',
    ],
  },
  {
    title: 'Web sürümü',
    paragraphs: [
      'Web sürümü GitHub Pages üzerinde yayınlanır. Fiyatlar sitenin yanında hazırlanmış dosyalardan okunur; girdiğin veriler yalnızca tarayıcının yerel deposunda kalır. GitHub, siteye erişimle ilgili teknik kayıtlar (ör. IP adresi) tutabilir.',
    ],
  },
  {
    title: 'Çocuklar',
    paragraphs: ['Uygulama çocuklara yönelik değildir ve kimseden bilerek kişisel veri toplamaz.'],
  },
  {
    title: 'Değişiklikler',
    paragraphs: [`Bu metin değişirse güncel hâli bu sayfada yayınlanır. Son güncelleme: ${LEGAL_UPDATED}.`],
  },
];

export const SUPPORT_SECTIONS: LegalSection[] = [
  {
    title: 'Sık sorulanlar',
    paragraphs: [
      'Verilerim nerede? Yalnızca cihazında. Telefon değiştirirken Ayarlar → Yedekleme → "Yedeği dışa aktar" ile dosyayı kaydet, yeni telefonda "Yedekten geri yükle" ile yükle.',
      "Fiyatlar neden gecikmeli? Ücretsiz kaynaklar borsa fiyatlarını genellikle 15 dakika gecikmeli verir. Fon fiyatları TEFAS'ta günde bir kez açıklanır.",
      'Fiyat alarmı neden hemen gelmedi? Uygulama kapalıyken kontrolün zamanını iPhone belirler; anlık değildir. Uygulama açıkken her yenilemede kontrol edilir.',
      'Bir fiyat yanlış görünüyor. Varlık sayfasında fiyat kaynağı yoksa ya da yanlışsa (ör. mevduat, TEFAS\'ta olmayan fon) "Fiyatı elle güncelle" ile düzeltebilirsin.',
    ],
  },
];
