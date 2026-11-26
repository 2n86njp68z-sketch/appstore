"""Kripto para listesini indirir: piyasa değerine göre ilk 500 coin (CoinGecko, logolarıyla).

Uygulama kripto fiyatlarını da CoinGecko'dan, coinin kimliğiyle (ör. "bitcoin") alır. Böylece
aynı kısaltmayı kullanan farklı coinler karışmaz. Aynı kısaltmadan birden fazla varsa piyasa
değeri en büyük olan listede kalır.

Kullanım (internet erişimi gerekir):
  python3 -I scripts/fetch-crypto-sources.py <çıktı_klasörü>
  python3 -I scripts/build-crypto-data.py <çıktı_klasörü>/crypto.json > src/data/crypto.ts
"""
import json
import os
import sys
import time
import urllib.request

UA = {'User-Agent': 'portfoy-takip-data-script/1.0'}
CG = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page={page}'


def get_json(url):
    # Ücretsiz uç nokta dakikalık istek sınırı uyguluyor; 429 gelirse bekleyip tekrar dene.
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:  # noqa: BLE001
            print('  tekrar denenecek:', url.split('?')[0], e, flush=True)
            if attempt == 5:
                raise
            time.sleep(20 * (attempt + 1))


if __name__ == '__main__':
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    coins = []
    for page in (1, 2):
        coins += get_json(CG.format(page=page))
        time.sleep(5)
    seen = set()
    keep = []
    for c in coins:  # piyasa değerine göre sıralı geliyor
        sym = c['symbol'].upper()
        if sym in seen or not sym.isascii() or not sym.replace('.', '').isalnum():
            continue
        seen.add(sym)
        keep.append({'id': c['id'], 'code': sym, 'name': c['name'].strip(), 'logo': (c.get('image') or '').split('?')[0]})
    json.dump(keep, open(os.path.join(out_dir, 'crypto.json'), 'w'), ensure_ascii=False, indent=0)
    print('CoinGecko:', len(coins), 'coin;', len(keep), 'benzersiz kısaltma', flush=True)
