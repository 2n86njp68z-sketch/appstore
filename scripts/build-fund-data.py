"""src/data/funds.ts dosyasını üretir (scripts/fetch-fund-sources.py çıktısından).

Kullanım:
  python3 -I scripts/build-fund-data.py <funds.json> > src/data/funds.ts
"""
import json
import re
import sys
from datetime import date

funds = json.load(open(sys.argv[1], encoding='utf-8'))

# KAP'ta genel bilgi sayfası olmayan emeklilik şirketlerinin bilinen resmi siteleri (logo için).
MANUAL_SITES = {
    'VIENNALIFE': 'www.viennalife.com.tr',
    'BEREKET': 'www.bereketemeklilik.com.tr',
    'ALLIANZ': 'www.allianz.com.tr',
    'BNP PARIBAS': 'www.bnpparibascardif.com.tr',
    'HDI FİBA': 'www.hdifiba.com.tr',
    'GARANTİ': 'www.garantibbvaemeklilik.com.tr',
    'AXA': 'www.axasigorta.com.tr',
    'ZURİCH': 'www.zurichsigorta.com.tr',
    'KATILIM EMEKLİLİK': 'www.katilimemeklilik.com.tr',
    'METLİFE': 'www.metlife.com.tr',
}
KEEP = {'BIST', 'TL', 'ESG', 'HSBC', 'QNB', 'BNP', 'BYF', 'S&P', 'ABD', 'AB', 'OKS', 'EYF', 'ETF', 'ING', 'TEB',
        'ICBC', 'DWS', 'PYŞ', 'ÖPY', 'KKB', 'SPK', 'II', 'III', 'IV', 'USD', 'EUR', 'ATP', 'GSYH', 'RE-PIE', 'IPO'}
LOWER = {'VE', 'İLE', 'VEYA'}
# Büyük harfle yazılmış yabancı adlarda ASCII "I" Türkçedeki gibi "ı" olmamalı; KAP'taki yazım hataları da.
FIXED = {
    'ALLIANZ': 'Allianz', 'TRIVE': 'Trive', 'PARIBAS': 'Paribas', 'CARDIF': 'Cardif', 'VIENNALIFE': 'Viennalife',
    'PRIME': 'Prime', 'BLOCKCHAIN': 'Blockchain', 'DEĞIŞKEN': 'Değişken', 'INVEST': 'Invest',
    'INVESTMENT': 'Investment', 'DIGITAL': 'Digital', 'CAPITAL': 'Capital', 'INTERNATIONAL': 'International',
    'METLIFE': 'MetLife', 'FINTECH': 'Fintech', 'LIFE': 'Life', 'PINE': 'Pine', 'ISTANBUL': 'İstanbul',
}


def tr_lower(s):
    return s.replace('I', 'ı').replace('İ', 'i').lower()


def tr_cap(word):
    first = {'i': 'İ', 'ı': 'I'}.get(word[0], word[0].upper())
    return first + word[1:]


def title(text):
    out = []
    for w in re.split(r'(\s+)', text.strip()):
        if not w or w.isspace():
            out.append(w)
            continue
        core = w.strip('()-,.')
        if core in FIXED:
            out.append(w.replace(core, FIXED[core]))
        elif core.upper() in KEEP or core in KEEP or re.search(r'\d', core) or w in ('A.Ş.', 'A.Ş'):
            out.append(w)
        elif core in LOWER and out:
            out.append(tr_lower(w))
        else:
            # Parantez gibi baştaki işaretleri koru
            m = re.match(r'^([(\-]*)(.*)$', tr_lower(w))
            out.append(m.group(1) + (tr_cap(m.group(2)) if m.group(2) else ''))
    return re.sub(r'\s+', ' ', ''.join(out)).strip()


def company_short(company):
    return title(re.sub(r'\s*A\.Ş\.?$', '', company.strip()))


def bes_name(name):
    # "AGESA HAYAT VE EMEKLİLİK A.Ş. BİRİNCİ ..." → "BİRİNCİ ..." (şirket adı ayrıca tutuluyor)
    m = re.search(r'A\.Ş\.?\s*', name[:80])
    return name[m.end():] if m and m.end() < len(name) else name


def host_of(url):
    if not url:
        return None
    m = re.match(r'(?:https?://)?([^/:?#\s]+)', url.strip(), re.I)
    h = m.group(1).lower() if m else None
    return h if h and re.fullmatch(r'[a-z0-9.-]+\.[a-z]{2,}', h) else None


def site_for(f):
    host = host_of(f.get('website'))
    if host:
        return host
    for key, site in MANUAL_SITES.items():
        if f['company'].upper().startswith(key):
            return site
    return None


def rows(kind):
    out = []
    for f in funds:
        if f['type'] != kind:
            continue
        name = title(bes_name(f['name']) if kind == 'BES' else f['name'])
        item = [f['code'], name, company_short(f['company'])]
        site = site_for(f)
        if site:
            item.append(site)
        out.append('  ' + json.dumps(item, ensure_ascii=False) + ',')
    return '\n'.join(out)


print(f"""// Bu dosya scripts/build-fund-data.py ile üretildi ({date.today().isoformat()}). Elle düzenlemeyin.
// Kaynak: KAP yatırım fonu (YF → TEFAS) ve emeklilik yatırım fonu (EYF → BES) listeleri.

export interface FundInfo {{
  code: string;
  name: string;
  /** Kurucu/yönetici şirket. */
  company: string;
  /** Şirketin internet adresi (logo için). */
  website?: string;
}}

type Row = readonly [string, string, string, string?];

const toFund = ([code, name, company, website]: Row): FundInfo => ({{ code, name, company, website }});

export const TEFAS_FUNDS: readonly FundInfo[] = ([
{rows('TEFAS')}
] as Row[]).map(toFund);

export const BES_FUNDS: readonly FundInfo[] = ([
{rows('BES')}
] as Row[]).map(toFund);""")
