"""src/data/eurobonds.ts dosyasını üretir: T.C. Hazine ve Maliye Bakanlığı'nın dolar ve euro cinsi
eurobondları (ISIN, vade, döviz cinsi, kupon oranı).

Kaynaklar:
- Liste, vade ve döviz: Ziraat Bankası eurobond fiyat sayfası. Fiyatlar uygulama çalışırken aynı
  sayfadan alınır (src/lib/prices.ts → fetchEurobondQuotes).
- Kupon oranları: eurobondpro.com Hazine eurobond listesi; orada henüz olmayan yeni ihraçlar için
  Hazine'nin duyurusundaki oran (MANUAL_COUPONS).

Kullanım:
  curl -sL -o /tmp/ziraat-eurobond.html https://www.ziraatbank.com.tr/tr/bireysel/yatirim/eurobond
  curl -sL -o /tmp/eurobondpro.html https://eurobondpro.com/hazine-eurobond-listesi
  python3 -I scripts/build-eurobond-data.py /tmp/ziraat-eurobond.html /tmp/eurobondpro.html > src/data/eurobonds.ts
"""
import html
import json
import re
import sys
from datetime import date

# Kupon listelerinde henüz olmayan yeni ihraçlar (Hazine ve Maliye Bakanlığı duyurusu)
MANUAL_COUPONS = {
    'XS3578925037': 5.85,  # 25.11.2034 vadeli yeşil euro tahvil, 19.11.2026 duyurusu
}

page = open(sys.argv[1], encoding='utf-8', errors='replace').read()
coupons = dict(MANUAL_COUPONS)
if len(sys.argv) > 2:
    pro = open(sys.argv[2], encoding='utf-8', errors='replace').read()
    for isin, rate in re.findall(r'\\"isin\\":\\"([A-Z0-9]{12})\\"[^}]*?\\"couponRate\\":([0-9.]+)', pro):
        coupons.setdefault(isin, float(rate))
rows = []
seen = set()
for tr in re.findall(r'<tr.*?</tr>', page, re.S | re.I):
    cells = [html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<t[dh].*?</t[dh]>', tr, re.S | re.I)]
    if len(cells) < 4 or not re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}[0-9]', cells[0]):
        continue
    isin, maturity, _days, currency = cells[:4]
    m = re.fullmatch(r'(\d{2})\.(\d{2})\.(\d{4})', maturity)
    if not m or currency not in ('USD', 'EUR') or isin in seen:
        continue
    seen.add(isin)
    rows.append([isin, f'{m[3]}-{m[2]}-{m[1]}', currency, coupons.get(isin)])

if len(rows) < 10:
    sys.exit(f'Eurobond tablosu okunamadı ({len(rows)} satır)')
rows.sort(key=lambda r: (r[1], r[2]))
missing = [r[0] for r in rows if r[3] is None]
if missing:
    print(f'Kuponu bilinmeyen: {", ".join(missing)}', file=sys.stderr)

body = '\n'.join(f'  {json.dumps(r)},' for r in rows)
print(f"""// Bu dosya scripts/build-eurobond-data.py ile üretildi ({date.today().isoformat()}). Elle düzenlemeyin.
// T.C. Hazine ve Maliye Bakanlığı eurobondları; liste: Ziraat Bankası, kupon: eurobondpro.com ve Hazine duyuruları.

export interface EurobondInfo {{
  /** ISIN kodu (ör. US900123DF45). */
  code: string;
  /** Vade tarihi "YYYY-AA-GG". */
  maturity: string;
  currency: 'USD' | 'EUR';
  /** Yıllık kupon oranı (%); bilinmiyorsa yok. */
  coupon?: number;
}}

const RAW: readonly (readonly [string, string, 'USD' | 'EUR', number | null])[] = [
{body}
];

export const EUROBONDS: readonly EurobondInfo[] = RAW.map(([code, maturity, currency, coupon]) => ({{
  code,
  maturity,
  currency,
  ...(coupon != null ? {{ coupon }} : {{}}),
}}));""")
