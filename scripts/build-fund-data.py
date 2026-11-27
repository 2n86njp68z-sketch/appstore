"""src/data/funds.ts dosyasını üretir (scripts/fetch-fund-sources.py çıktısından).

KAP listesine, TEFAS'ın açık servisinde işlem gören ama KAP listesinde olmayan fonlar da eklenir
(scripts/fetch-tefas-funds.py çıktısı); şirketleri fon adının başından, KAP'taki şirketlerle eşleştirilir.

Kullanım:
  python3 -I scripts/fetch-tefas-funds.py /tmp/tefas
  python3 -I scripts/build-fund-data.py <funds.json> /tmp/tefas/tefas-YAT.json /tmp/tefas/tefas-EMK.json > src/data/funds.ts
"""
import json
import re
import sys
from datetime import date

funds = json.load(open(sys.argv[1], encoding='utf-8'))
tefas_lists = {'TEFAS': sys.argv[2] if len(sys.argv) > 2 else None, 'BES': sys.argv[3] if len(sys.argv) > 3 else None}

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


def company_prefix(company):
    """Fon adlarının başında geçen şirket öneki: "ATA PORTFÖY YÖNETİMİ A.Ş." → "ATA PORTFÖY"."""
    c = re.sub(r'\s*A\.Ş\.?$', '', company.strip().upper())
    i = c.find('PORTFÖY')
    return c[: i + len('PORTFÖY')] if i > 0 else c


def add_tefas_funds():
    """TEFAS'ta olup KAP listesinde olmayan fonları ekler."""
    known = {(f['type'], f['code']) for f in funds}
    companies = {}
    for f in funds:
        companies.setdefault(company_prefix(f['company']), f)
    prefixes = sorted(companies, key=len, reverse=True)
    for kind, path in tefas_lists.items():
        if not path:
            continue
        added = 0
        for t in json.load(open(path, encoding='utf-8')):
            if (kind, t['code']) in known:
                continue
            name = t['name'].strip()
            upper = name.upper()
            match = next((companies[p] for p in prefixes if upper.startswith(p + ' ') or upper.startswith(p)), None)
            if kind == 'BES':
                m = re.match(r'^(.*?A\.Ş\.?)\s', name)
                company = m.group(1) if m else (match['company'] if match else '')
            else:
                company = match['company'] if match else ''
            funds.append({'type': kind, 'code': t['code'], 'name': name, 'company': company or 'TEFAS',
                          'website': match.get('website') if match else None})
            added += 1
        print(f'{kind}: TEFAS listesinden {added} fon eklendi', file=sys.stderr)


add_tefas_funds()
funds.sort(key=lambda f: (f['type'], f['code']))


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
// Kaynak: KAP yatırım fonu (YF → TEFAS) ve emeklilik yatırım fonu (EYF → BES) listeleri, TEFAS fon listesi.

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
