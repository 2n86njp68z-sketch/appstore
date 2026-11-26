"""src/data/crypto.ts dosyasını üretir (scripts/fetch-crypto-sources.py çıktısından).

Kullanım:
  python3 -I scripts/build-crypto-data.py <crypto.json> > src/data/crypto.ts
"""
import json
import sys
from datetime import date

coins = json.load(open(sys.argv[1], encoding='utf-8'))
rows = '\n'.join('  ' + json.dumps([c['code'], c['name'], c['id'], c['logo']], ensure_ascii=False) + ',' for c in coins)
print(f"""// Bu dosya scripts/build-crypto-data.py ile üretildi ({date.today().isoformat()}). Elle düzenlemeyin.
// Kaynak: CoinGecko (piyasa değerine göre ilk 500 coin; fiyat ve logo coin kimliğiyle alınır).

export interface CryptoInfo {{
  code: string;
  name: string;
  /** CoinGecko kimliği (fiyat bununla alınır). */
  id: string;
  logo: string;
}}

type Row = readonly [string, string, string, string];

// Piyasa değerine göre sıralı.
export const CRYPTO_COINS: readonly CryptoInfo[] = ([
{rows}
] as Row[]).map(([code, name, id, logo]) => ({{ code, name, id, logo }}));""")
