"""ABD hisse listesinin kaynak verisini indirir.

1. NASDAQ Trader sembol dizini (nasdaqlisted.txt + otherlisted.txt): NASDAQ, NYSE, NYSE American
   ve diğer ABD borsalarında işlem gören tüm menkul kıymetler. Yalnız hisseler (ADR'ler dahil) alınır;
   ETF, varant, hak, birim (unit), imtiyazlı pay ve tahvil benzerleri ayıklanır.
2. Wikidata (CC0): borsa kodu → şirketin resmi internet adresi (logolar için).

Kullanım (internet erişimi gerekir):
  python3 -I scripts/fetch-us-sources.py <çıktı_klasörü>
  python3 -I scripts/build-us-data.py <çıktı_klasörü>/us-stocks.json <çıktı_klasörü>/us-sites.json > src/data/us.ts
  python3 -I scripts/build-etf-data.py <çıktı_klasörü>/us-etfs.json > src/data/etf.ts
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

UA = {'User-Agent': 'portfoy-takip-data-script/1.0'}
NASDAQ = 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt'
OTHER = 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'
WIKIDATA = 'https://query.wikidata.org/sparql'

# Hisse olmayan menkul kıymetleri adından tanı.
NOT_STOCK = re.compile(
    r'\b(warrants?|rights?|units?|preferred|preference|notes?|debentures?|bonds?|subordinated|'
    r'trust certificates?|depositary shares? representing .*(preferred|series)|perpetual|'
    r'cumulative|contingent value|etn|exchange traded|when issued)\b|%',
    re.I,
)
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        return r.read().decode('utf-8', 'replace')


DESCRIPTOR = re.compile(
    r'\s+(New\s+)?(Common Stock|Capital Stock|Common Shares?|Ordinary Shares?|Common Units?|'
    r'Shares? of Beneficial Interest|American Depositary (Shares?|Receipts?)|American Depository Shares?|ADSs?)\b.*$',
    re.I,
)


def clean_name(name, code):
    """"Alphabet Inc. - Class A Common Stock" → "Alphabet Inc. Class A"; sınıf koddan da eklenir (BRK.B)."""
    n = DESCRIPTOR.sub('', re.sub(r'\s+', ' ', name).strip())
    n = re.sub(r'\s+-\s+', ' ', n).strip(' ,-')
    m = re.search(r'\.([A-Z])$', code)
    if m and not re.search(rf'Class\s+{m.group(1)}\b', n):
        n += f' Class {m.group(1)}'
    return n


def rows(text):
    lines = [l for l in text.splitlines() if l and not l.startswith('File Creation Time')]
    head = lines[0].split('|')
    return [dict(zip(head, l.split('|'))) for l in lines[1:]]


def nasdaq_trader():
    """(hisseler, ETF'ler) döndürür."""
    out, etfs = {}, {}
    ex_names = {'N': 'NYSE', 'A': 'NYSE American', 'P': 'NYSE Arca', 'Z': 'Cboe BZX', 'V': 'IEX'}
    for r in rows(get(NASDAQ)):
        sym, name = r['Symbol'].strip(), r['Security Name'].strip()
        if r['Test Issue'] == 'N' and r['ETF'] == 'Y' and re.fullmatch(r'[A-Z]{1,5}', sym):
            etfs[sym] = {'code': sym, 'name': re.sub(r'\s+', ' ', name), 'exchange': 'NASDAQ'}
        if r['Test Issue'] == 'Y' or r['ETF'] == 'Y' or r.get('NextShares') == 'Y':
            continue
        if not re.fullmatch(r'[A-Z]{1,5}', sym) or NOT_STOCK.search(name):
            continue
        out[sym] = {'code': sym, 'name': clean_name(name, sym), 'exchange': 'NASDAQ'}
    for r in rows(get(OTHER)):
        sym, name = r['ACT Symbol'].strip(), r['Security Name'].strip()
        if r['Test Issue'] == 'N' and r['ETF'] == 'Y' and re.fullmatch(r'[A-Z]{1,5}(\.[A-Z])?', sym):
            etfs.setdefault(sym, {'code': sym, 'name': re.sub(r'\s+', ' ', name), 'exchange': ex_names.get(r['Exchange'], r['Exchange'])})
        if r['Test Issue'] == 'Y' or r['ETF'] == 'Y':
            continue
        # Hisse sınıfları "BRK.B" biçiminde; $, = ve diğer ekler imtiyazlı/varant/birimdir.
        if not re.fullmatch(r'[A-Z]{1,5}(\.[A-Z])?', sym) or NOT_STOCK.search(name):
            continue
        out.setdefault(sym, {'code': sym, 'name': clean_name(name, sym), 'exchange': ex_names.get(r['Exchange'], r['Exchange'])})
    return sorted(out.values(), key=lambda s: s['code']), sorted(etfs.values(), key=lambda s: s['code'])


# Borsalar: NASDAQ, NYSE, NYSE American. Ağır tek sorgu zaman aşımına uğruyor; borsa başına iki hafif sorgu.
EXCHANGES = ['Q82059', 'Q13677', 'Q846626']
QUERIES = [
    'SELECT ?ticker ?website WHERE {{ ?item p:P414 ?st . ?st ps:P414 wd:{ex} ; pq:P249 ?ticker . '
    'FILTER NOT EXISTS {{ ?st pq:P582 ?ended }} ?item wdt:P856 ?website . }}',
    'SELECT ?ticker ?website WHERE {{ ?item wdt:P414 wd:{ex} ; wdt:P249 ?ticker ; wdt:P856 ?website . }}',
]


def wikidata_sites():
    sites = {}
    for ex in EXCHANGES:
        for q in QUERIES:
            url = WIKIDATA + '?' + urllib.parse.urlencode({'query': q.format(ex=ex), 'format': 'json'})
            for b in json.loads(get(url))['results']['bindings']:
                t = b['ticker']['value'].strip().upper().replace('-', '.').replace(' ', '')
                w = b['website']['value'].strip()
                # Birden fazla adres varsa en kısası (genelde ana alan adı) kalsın.
                if t not in sites or len(w) < len(sites[t]):
                    sites[t] = w
    return sites


if __name__ == '__main__':
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    stocks, etfs = nasdaq_trader()
    json.dump(stocks, open(os.path.join(out_dir, 'us-stocks.json'), 'w'), ensure_ascii=False, indent=0)
    json.dump(etfs, open(os.path.join(out_dir, 'us-etfs.json'), 'w'), ensure_ascii=False, indent=0)
    print('NASDAQ Trader:', len(stocks), 'hisse,', len(etfs), 'ETF', flush=True)
    sites = wikidata_sites()
    json.dump(sites, open(os.path.join(out_dir, 'us-sites.json'), 'w'), ensure_ascii=False, indent=0)
    print('Wikidata:', len(sites), 'kod için internet adresi;', sum(1 for s in stocks if s['code'] in sites), 'listede eşleşti', flush=True)
