// Bu dosya scripts/build-eurobond-data.py ile üretildi (2026-11-27). Elle düzenlemeyin.
// T.C. Hazine ve Maliye Bakanlığı eurobondları; kaynak: Ziraat Bankası eurobond sayfası.

export interface EurobondInfo {
  /** ISIN kodu (ör. US900123DF45). */
  code: string;
  /** Vade tarihi "YYYY-AA-GG". */
  maturity: string;
  currency: 'USD' | 'EUR';
}

const RAW: readonly (readonly [string, string, 'USD' | 'EUR'])[] = [
  ['US900123CL22', '2027-03-25', 'USD'],
  ['XS2361850527', '2027-07-08', 'EUR'],
  ['USM88269US88', '2027-09-24', 'USD'],
  ['US900123DF45', '2028-01-15', 'USD'],
  ['US900123CP36', '2028-02-17', 'USD'],
  ['US900123CQ19', '2028-10-24', 'USD'],
  ['US900123DH01', '2029-03-14', 'USD'],
  ['US900123CT57', '2029-04-26', 'USD'],
  ['US900123AL40', '2030-01-15', 'USD'],
  ['US900123CY43', '2030-03-13', 'USD'],
  ['XS2790222116', '2030-05-21', 'EUR'],
  ['US900123DJ66', '2030-07-13', 'USD'],
  ['US900123DA57', '2031-01-15', 'USD'],
  ['US900123DV94', '2031-05-22', 'USD'],
  ['US900123DC14', '2031-06-26', 'USD'],
  ['XS3123715297', '2031-08-17', 'EUR'],
  ['US900123DP27', '2032-02-12', 'USD'],
  ['US900123DQ00', '2032-05-29', 'USD'],
  ['US900123DL13', '2032-07-17', 'USD'],
  ['US900123DG28', '2033-01-19', 'USD'],
  ['US900123DT49', '2033-03-14', 'USD'],
  ['US900123DD96', '2033-09-20', 'USD'],
  ['US900123AT75', '2034-02-14', 'USD'],
  ['XS3293834662', '2034-03-10', 'EUR'],
  ['US900123DK30', '2034-05-15', 'USD'],
  ['XS3578925037', '2034-11-25', 'EUR'],
  ['US900123DN78', '2035-01-03', 'USD'],
  ['US900123DR82', '2035-09-16', 'USD'],
  ['US900123AY60', '2036-03-17', 'USD'],
  ['US900123DS65', '2036-11-04', 'USD'],
  ['US900123DW77', '2037-01-30', 'USD'],
  ['US900123DU12', '2038-01-14', 'USD'],
  ['US900123BB58', '2038-03-05', 'USD'],
  ['US900123BG46', '2040-05-30', 'USD'],
  ['US900123BJ84', '2041-01-14', 'USD'],
  ['US900123CB40', '2043-04-16', 'USD'],
  ['US900123CG37', '2045-02-17', 'USD'],
  ['US900123CM05', '2047-05-11', 'USD'],
];

export const EUROBONDS: readonly EurobondInfo[] = RAW.map(([code, maturity, currency]) => ({
  code,
  maturity,
  currency,
}));
