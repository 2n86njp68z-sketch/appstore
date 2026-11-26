"""TEFAS (yatırım fonu) ve BES (emeklilik yatırım fonu) listelerini KAP'tan indirir.

- KAP "Yatırım Fonları (YF)" sayfası → TEFAS'ta işlem gören yatırım fonları
- KAP "Emeklilik Yatırım Fonları (EYF)" listesi → BES fonları. Sayfa yalnız şirket başına bir fon
  gösterdiği için tam liste KAP'ın aynı sayfadaki PDF dışa aktarımından okunur (pdftotext gerekir).
- Her fonun kurucu/yönetici şirketinin KAP genel bilgi sayfası → internet adresi (logolar için)

Not: Günlük fon fiyatları KAP'ta yok; TEFAS sitesi otomatik erişime karşı korunduğu için
oradan çekilmez. Uygulamada fon fiyatları şimdilik elle girilir.

Kullanım (internet erişimi gerekir):
  python3 -I scripts/fetch-fund-sources.py <çıktı_klasörü>
  python3 -I scripts/build-fund-data.py <çıktı_klasörü>/funds.json > src/data/funds.ts
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = {'User-Agent': 'Mozilla/5.0'}
PAGES = {'YF': 'https://www.kap.org.tr/tr/YatirimFonlari/YF', 'EYF': 'https://www.kap.org.tr/tr/YatirimFonlari/EYF'}
KAP_GENERAL = 'https://www.kap.org.tr/tr/sirket-bilgileri/genel/{oid}'
BES_PDF = 'https://www.kap.org.tr/tr/api/fund/generic/pdf/EYF/Y/fonlar-EYF'
FUND = re.compile(
    r'"fundCode":"([A-Z0-9]{3})","fundName":"([^"]*)","fundType":"(YF|EYF)","fundClass":"[^"]*",'
    r'"fundState":"([^"]*)".*?"fundMemberOid":"([0-9a-f]*)","fundMemberTitle":"([^"]*)"'
)


def get(url, timeout=60):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(3 + attempt * 3)


def get_bytes(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def fold(text):
    t = text.replace('İ', 'I').replace('ı', 'i').upper()
    for a, b in (('Ç', 'C'), ('Ğ', 'G'), ('Ö', 'O'), ('Ş', 'S'), ('Ü', 'U')):
        t = t.replace(a, b)
    return re.sub(r'[^A-Z0-9]', '', t)


def bes_from_pdf():
    """KAP'ın EYF PDF'inden (kod, ad, kurucu) satırlarını okur."""
    text = subprocess.run(['pdftotext', '-layout', '-', '-'], input=get_bytes(BES_PDF), capture_output=True, check=True).stdout.decode('utf-8')
    out, cur, comp_col = [], None, None
    for line in text.splitlines():
        if 'Fon Adı' in line and 'Fon Kurucusu' in line:
            comp_col = line.index('Fon Kurucusu')
            continue
        if not line.strip() or comp_col is None or line.strip() == 'Kodu':
            continue
        m = re.match(r'^([A-Z0-9]{3})\s{2,}(.*)$', line)
        if m:
            parts = re.split(r'\s{2,}', m.group(2).strip())
            cur = {'code': m.group(1), 'name': parts[0], 'company': parts[1] if len(parts) > 1 else ''}
            out.append(cur)
        elif cur:
            parts = re.split(r'\s{2,}', line.strip())
            if len(parts) >= 2:
                cur['name'] += ' ' + parts[0]
                cur['company'] += ' ' + parts[1]
            elif len(line) - len(line.lstrip()) >= comp_col - 2:
                cur['company'] += ' ' + parts[0]
            else:
                cur['name'] += ' ' + parts[0]
    for f in out:
        f['name'] = re.sub(r'\s+', ' ', f['name']).strip()
        f['company'] = re.sub(r'\s+', ' ', f['company']).strip()
    return out


def funds():
    out = {}
    for ftype, url in PAGES.items():
        s = get(url).replace('\\"', '"')
        for code, name, kind, state, oid, company in FUND.findall(s):
            if kind != ftype or state != 'Y':  # Y: işlemde olan fon
                continue
            out.setdefault((ftype, code), {
                'type': 'TEFAS' if ftype == 'YF' else 'BES',
                'code': code,
                'name': re.sub(r'\s+', ' ', name).strip(),
                'company': re.sub(r'\s+', ' ', company).strip(),
                'companyOid': oid,
            })
    # BES: tam liste PDF'ten; şirketlerin KAP kimliği sayfadaki örnek fonlardan (şirket adıyla eşleştirilir).
    oid_by_company = {fold(f['company']): f['companyOid'] for f in out.values() if f['type'] == 'BES'}
    for f in bes_from_pdf():
        out[('EYF', f['code'])] = {
            'type': 'BES',
            'code': f['code'],
            'name': f['name'],
            'company': f['company'],
            'companyOid': oid_by_company.get(fold(f['company']), ''),
        }
    return sorted(out.values(), key=lambda f: (f['type'], f['code']))


def company_sites(oids):
    def one(oid):
        try:
            body = get(KAP_GENERAL.format(oid=oid), timeout=40).replace('\\"', '"')
            m = re.search(r'"itemKey":"kpy41_acc1_int_addres","value":"([^"]*)"', body)
            return oid, m.group(1) if m else None
        except Exception:  # noqa: BLE001
            return oid, None

    with ThreadPoolExecutor(max_workers=3) as ex:
        return dict(ex.map(one, sorted(oids)))


if __name__ == '__main__':
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    fl = funds()
    sites = company_sites({f['companyOid'] for f in fl if f['companyOid']})
    for f in fl:
        f['website'] = sites.get(f.pop('companyOid'))
    json.dump(fl, open(os.path.join(out_dir, 'funds.json'), 'w'), ensure_ascii=False, indent=0)
    n_tefas = sum(1 for f in fl if f['type'] == 'TEFAS')
    print('TEFAS fon:', n_tefas, '; BES fon:', len(fl) - n_tefas, '; şirket:', len(sites),
          '; adresli şirket:', sum(1 for v in sites.values() if v), flush=True)
