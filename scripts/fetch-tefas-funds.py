"""TEFAS'ın açık fon servisinden yatırım (YAT) ve emeklilik (EMK) fonlarının güncel listesini indirir.

scripts/build-fund-data.py bu listelerle KAP listesinde olmayan fonları ekler.

Kullanım:
  python3 -I scripts/fetch-tefas-funds.py <çıktı_klasörü>
"""
import json
import os
import sys
import urllib.request
from datetime import date, timedelta

API = 'https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir'
out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)
end = date.today()
start = end - timedelta(days=7)
for kind in ('YAT', 'EMK'):
    body = {
        'fonTipi': kind, 'fonKodu': None, 'aramaMetni': None, 'fonTurKod': None, 'fonGrubu': None,
        'sfonTurKod': None, 'fonTurAciklama': None, 'kurucuKod': None,
        'basTarih': start.strftime('%Y%m%d'), 'bitTarih': end.strftime('%Y%m%d'),
        'basSira': 1, 'bitSira': 100000, 'dil': 'TR', 'sFonTurKod': '', 'fonKod': '', 'fonGrup': '', 'fonUnvanTip': '',
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    rows = data.get('resultList') or []
    # Her fonun yalnız en son satırı
    latest = {}
    for row in rows:
        code = row.get('fonKodu')
        if code and (code not in latest or row['tarih'] > latest[code]['tarih']):
            latest[code] = row
    path = os.path.join(out_dir, f'tefas-{kind}.json')
    json.dump([{'code': c, 'name': r['fonUnvan']} for c, r in sorted(latest.items())], open(path, 'w'), ensure_ascii=False)
    print(f'{kind}: {len(latest)} fon → {path}', file=sys.stderr)
