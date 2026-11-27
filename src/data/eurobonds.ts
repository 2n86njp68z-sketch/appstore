// Bu dosya scripts/build-eurobond-data.py ile üretildi (2026-11-27). Elle düzenlemeyin.
// T.C. Hazine ve Maliye Bakanlığı eurobondları; liste: Ziraat Bankası, kupon: eurobondpro.com ve Hazine duyuruları.

export interface EurobondInfo {
  /** ISIN kodu (ör. US900123DF45). */
  code: string;
  /** Vade tarihi "YYYY-AA-GG". */
  maturity: string;
  currency: 'USD' | 'EUR';
  /** Yıllık kupon oranı (%); bilinmiyorsa yok. */
  coupon?: number;
}

const RAW: readonly (readonly [string, string, 'USD' | 'EUR', number | null])[] = [
  ['US900123CL22', '2027-03-25', 'USD', 6.0],
  ['XS2361850527', '2027-07-08', 'EUR', 4.375],
  ['USM88269US88', '2027-09-24', 'USD', 8.6],
  ['US900123DF45', '2028-01-15', 'USD', 9.875],
  ['US900123CP36', '2028-02-17', 'USD', 5.125],
  ['US900123CQ19', '2028-10-24', 'USD', 6.125],
  ['US900123DH01', '2029-03-14', 'USD', 9.375],
  ['US900123CT57', '2029-04-26', 'USD', 7.625],
  ['US900123AL40', '2030-01-15', 'USD', 11.875],
  ['US900123CY43', '2030-03-13', 'USD', 5.25],
  ['XS2790222116', '2030-05-21', 'EUR', 5.875],
  ['US900123DJ66', '2030-07-13', 'USD', 9.125],
  ['US900123DA57', '2031-01-15', 'USD', 5.95],
  ['US900123DV94', '2031-05-22', 'USD', 6.375],
  ['US900123DC14', '2031-06-26', 'USD', 5.875],
  ['XS3123715297', '2031-08-17', 'EUR', 5.2],
  ['US900123DP27', '2032-02-12', 'USD', 7.125],
  ['US900123DQ00', '2032-05-29', 'USD', 7.25],
  ['US900123DL13', '2032-07-17', 'USD', 7.125],
  ['US900123DG28', '2033-01-19', 'USD', 9.375],
  ['US900123DT49', '2033-03-14', 'USD', 6.3],
  ['US900123DD96', '2033-09-20', 'USD', 6.5],
  ['US900123AT75', '2034-02-14', 'USD', 8.0],
  ['XS3293834662', '2034-03-10', 'EUR', 5.15],
  ['US900123DK30', '2034-05-15', 'USD', 7.625],
  ['XS3578925037', '2034-11-25', 'EUR', 5.85],
  ['US900123DN78', '2035-01-03', 'USD', 6.5],
  ['US900123DR82', '2035-09-16', 'USD', 6.95],
  ['US900123AY60', '2036-03-17', 'USD', 6.875],
  ['US900123DS65', '2036-11-04', 'USD', 6.8],
  ['US900123DW77', '2037-01-30', 'USD', 7.5],
  ['US900123DU12', '2038-01-14', 'USD', 6.875],
  ['US900123BB58', '2038-03-05', 'USD', 7.25],
  ['US900123BG46', '2040-05-30', 'USD', 6.75],
  ['US900123BJ84', '2041-01-14', 'USD', 6.0],
  ['US900123CB40', '2043-04-16', 'USD', 4.875],
  ['US900123CG37', '2045-02-17', 'USD', 6.625],
  ['US900123CM05', '2047-05-11', 'USD', 5.75],
];

export const EUROBONDS: readonly EurobondInfo[] = RAW.map(([code, maturity, currency, coupon]) => ({
  code,
  maturity,
  currency,
  ...(coupon != null ? { coupon } : {}),
}));
