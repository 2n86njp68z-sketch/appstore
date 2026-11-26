"""BIST hisse listesinin kaynak verisini indirir.

1. İş Yatırım "Temel Değerler ve Oranlar" sayfasından tüm hisselerin kodu, adı, sektörü
2. KAP şirket listesinden her şirketin genel bilgi sayfası → internet adresi (logolar için)

Kullanım (internet erişimi gerekir; KAP'ı yormamak için aynı anda 3 istek atılır):
  python3 -I scripts/fetch-bist-sources.py <çıktı_klasörü>
  python3 -I scripts/build-bist-data.py <çıktı_klasörü>/stocks.json <çıktı_klasörü>/sites.json > src/data/bist.ts
"""
import html
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = {'User-Agent': 'Mozilla/5.0'}
ISY = 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx'
KAP_LIST = 'https://www.kap.org.tr/tr/bist-sirketler'
KAP_GENERAL = 'https://www.kap.org.tr/tr/sirket-bilgileri/genel/{oid}'


def get(url, timeout=60):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(3 + attempt * 3)


def isyatirim_stocks():
    s = get(ISY)
    i = s.find('temelTBody_Ozet')
    body = s[i:s.find('</tbody>', i)]
    out = []
    for row in re.findall(r'<tr>(.*?)</tr>', body, re.S):
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
        code = re.sub(r'<[^>]+>', '', cells[0]).strip()
        clean = lambda v: html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', v))).strip()  # noqa: E731
        out.append({'code': code, 'name': clean(cells[1]), 'sector': clean(cells[2])})
    return out


def kap_sites(codes):
    s = get(KAP_LIST).replace('\\"', '"')
    oid_by_code = {}
    for m in re.finditer(r'"mkkMemberOid":"([0-9a-f]+)","kapMemberTitle":"([^"]*)".*?"stockCode":"([^"]*)"', s):
        oid, title, stock_codes = m.groups()
        for c in re.split(r'[,\s]+', stock_codes):
            if c:
                oid_by_code.setdefault(c, (oid, title))

    def one(code):
        oid, title = oid_by_code[code]
        try:
            body = get(KAP_GENERAL.format(oid=oid), timeout=40).replace('\\"', '"')
            m = re.search(r'"itemKey":"kpy41_acc1_int_addres","value":"([^"]*)"', body)
            return code, {'kapTitle': title, 'website': m.group(1) if m else None}
        except Exception:  # noqa: BLE001
            return code, {'kapTitle': title, 'website': None, 'error': True}

    todo = [c for c in codes if c in oid_by_code]
    with ThreadPoolExecutor(max_workers=3) as ex:
        sites = dict(ex.map(one, todo))
    return {'sites': sites, 'missing': [c for c in codes if c not in oid_by_code]}


if __name__ == '__main__':
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    stocks = isyatirim_stocks()
    json.dump(stocks, open(os.path.join(out_dir, 'stocks.json'), 'w'), ensure_ascii=False, indent=0)
    print('İş Yatırım:', len(stocks), 'hisse', flush=True)
    sites = kap_sites([s['code'] for s in stocks])
    json.dump(sites, open(os.path.join(out_dir, 'sites.json'), 'w'), ensure_ascii=False, indent=1)
    print('KAP:', sum(1 for v in sites['sites'].values() if v.get('website')), 'internet adresi', flush=True)
