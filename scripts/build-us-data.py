"""src/data/us.ts dosyasını üretir (scripts/fetch-us-sources.py çıktısından).

Kullanım:
  python3 -I scripts/build-us-data.py <us-stocks.json> <us-sites.json> > src/data/us.ts
"""
import json
import re
import sys
from datetime import date

stocks = json.load(open(sys.argv[1], encoding='utf-8'))
sites = json.load(open(sys.argv[2], encoding='utf-8'))
EXCHANGES = ['NASDAQ', 'NYSE', 'NYSE American', 'NYSE Arca', 'Cboe BZX', 'IEX']


def host_of(url):
    if not url:
        return None
    m = re.match(r'(?:https?://)?([^/:?#]+)', url.strip(), re.I)
    host = m.group(1).lower() if m else None
    return host if host and re.fullmatch(r'[a-z0-9.-]+\.[a-z]{2,}', host) else None


rows = []
for s in stocks:
    ex = EXCHANGES.index(s['exchange']) if s['exchange'] in EXCHANGES else 0
    item = [s['code'], s['name'], ex]
    host = host_of(sites.get(s['code']))
    if host:
        item.append(host)
    rows.append('  ' + json.dumps(item, ensure_ascii=False) + ',')

print(f"""// Bu dosya scripts/build-us-data.py ile üretildi ({date.today().isoformat()}). Elle düzenlemeyin.
// Kaynak: NASDAQ Trader sembol dizini (kod, ad, borsa) ve Wikidata (internet adresi, CC0).

export interface UsStock {{
  code: string;
  name: string;
  exchange: string;
  /** Şirketin internet adresi (logo için). */
  website?: string;
}}

const EXCHANGES = {json.dumps(EXCHANGES)};

// [kod, ad, borsa sırası, internet adresi?] — dosya küçük kalsın diye dizi biçiminde.
const RAW: readonly (readonly [string, string, number, string?])[] = [
{chr(10).join(rows)}
];

export const US_STOCKS: readonly UsStock[] = RAW.map(([code, name, ex, website]) => ({{
  code,
  name,
  exchange: EXCHANGES[ex],
  website,
}}));""")
