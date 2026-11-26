"""src/data/bist.ts dosyasını üretir.

Kaynaklar (ikisi de ücretsiz ve herkese açık):
- İş Yatırım "Temel Değerler ve Oranlar" sayfası: hisse kodu, şirket adı, sektör
- KAP (Kamuyu Aydınlatma Platformu) şirket genel bilgileri: internet adresi (logolar için)

Kullanım:
  python3 -I scripts/build-bist-data.py <isyatirim_stocks.json> <kap_sites.json> > src/data/bist.ts
"""
import json
import re
import sys
from datetime import date

stocks = json.load(open(sys.argv[1], encoding='utf-8'))
sites = json.load(open(sys.argv[2], encoding='utf-8'))['sites']

# KAP'ta kodla eşleşmeyen birkaç şirket için bilinen adresler.
MANUAL = {'HALKB': 'www.halkbank.com.tr', 'DOCO': 'www.doco.com'}

DOMAIN = re.compile(r'(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})', re.I)


def host_of(value):
    if not value:
        return None
    m = DOMAIN.search(value.strip())
    return m.group(1).lower() if m else None


def ts(s):
    return json.dumps(s, ensure_ascii=False)


lines = []
for st in stocks:
    code = st['code']
    web = MANUAL.get(code) or host_of((sites.get(code) or {}).get('website'))
    parts = [f'code: {ts(code)}', f'name: {ts(st["name"].strip())}', f'sector: {ts(st["sector"].strip())}']
    if web:
        parts.append(f'website: {ts(web)}')
    lines.append('  { ' + ', '.join(parts) + ' },')

print(f"""// Bu dosya scripts/build-bist-data.py ile üretildi ({date.today().isoformat()}). Elle düzenlemeyin.
// Kaynak: İş Yatırım (kod, ad, sektör) ve KAP (internet adresi).

export interface BistStock {{
  code: string;
  name: string;
  sector: string;
  /** Şirketin internet adresi (logo için). */
  website?: string;
}}

export const BIST_STOCKS: readonly BistStock[] = [
{chr(10).join(lines)}
];""")
