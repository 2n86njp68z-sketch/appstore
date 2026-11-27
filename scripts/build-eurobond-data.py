"""src/data/eurobonds.ts dosyasını üretir: T.C. Hazine ve Maliye Bakanlığı'nın dolar ve euro cinsi
eurobondları (ISIN, vade, döviz cinsi).

Kaynak: Ziraat Bankası eurobond fiyat sayfası (Hazine eurobondlarının listesi). Fiyatlar uygulama
çalışırken aynı sayfadan alınır (src/lib/prices.ts → fetchEurobondQuotes).

Kullanım:
  curl -sL -o /tmp/ziraat-eurobond.html https://www.ziraatbank.com.tr/tr/bireysel/yatirim/eurobond
  python3 -I scripts/build-eurobond-data.py /tmp/ziraat-eurobond.html > src/data/eurobonds.ts
"""
import html
import json
import re
import sys
from datetime import date

page = open(sys.argv[1], encoding='utf-8', errors='replace').read()
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
    rows.append([isin, f'{m[3]}-{m[2]}-{m[1]}', currency])

if len(rows) < 10:
    sys.exit(f'Eurobond tablosu okunamadı ({len(rows)} satır)')
rows.sort(key=lambda r: (r[1], r[2]))

body = '\n'.join(f'  {json.dumps(r)},' for r in rows)
print(f"""// Bu dosya scripts/build-eurobond-data.py ile üretildi ({date.today().isoformat()}). Elle düzenlemeyin.
// T.C. Hazine ve Maliye Bakanlığı eurobondları; kaynak: Ziraat Bankası eurobond sayfası.

export interface EurobondInfo {{
  /** ISIN kodu (ör. US900123DF45). */
  code: string;
  /** Vade tarihi "YYYY-AA-GG". */
  maturity: string;
  currency: 'USD' | 'EUR';
}}

const RAW: readonly (readonly [string, string, 'USD' | 'EUR'])[] = [
{body}
];

export const EUROBONDS: readonly EurobondInfo[] = RAW.map(([code, maturity, currency]) => ({{ code, maturity, currency }}));""")
