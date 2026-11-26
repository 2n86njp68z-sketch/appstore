"""src/data/etf.ts dosyasını üretir (scripts/fetch-us-sources.py çıktısındaki us-etfs.json'dan).

Logolar için ETF'yi çıkaran şirketin sitesi, adın başındaki çıkarıcı adından bulunur.

Kullanım:
  python3 -I scripts/build-etf-data.py <us-etfs.json> > src/data/etf.ts
"""
import json
import sys
from datetime import date

etfs = json.load(open(sys.argv[1], encoding='utf-8'))
EXCHANGES = ['NASDAQ', 'NYSE', 'NYSE American', 'NYSE Arca', 'Cboe BZX', 'IEX']

# Çıkarıcı adı (adın başı) → resmi site. Uzun önekler önce denenir.
ISSUERS = {
    'iShares': 'www.ishares.com', 'Invesco': 'www.invesco.com', 'State Street': 'www.ssga.com', 'SPDR': 'www.ssga.com',
    'Innovator': 'www.innovatoretfs.com', 'First Trust': 'www.ftportfolios.com', 'FT ': 'www.ftportfolios.com',
    'ProShares': 'www.proshares.com', 'Direxion': 'www.direxion.com', 'Global X': 'www.globalxetfs.com',
    'Vanguard': 'www.vanguard.com', 'Leverage Shares': 'leverageshares.com', 'GraniteShares': 'graniteshares.com',
    'WisdomTree': 'www.wisdomtree.com', 'VanEck': 'www.vaneck.com', 'Defiance': 'www.defianceetfs.com',
    'Fidelity': 'www.fidelity.com', 'JPMorgan': 'am.jpmorgan.com', 'Pacer': 'www.paceretfs.com', 'PGIM': 'www.pgim.com',
    'Franklin': 'www.franklintempleton.com', 'YieldMax': 'www.yieldmaxetfs.com', 'AllianzIM': 'www.allianzim.com',
    'Roundhill': 'www.roundhillinvestments.com', 'Northern Trust': 'www.northerntrust.com', 'FlexShares': 'www.northerntrust.com',
    'Amplify': 'amplifyetfs.com', 'Goldman Sachs': 'www.gsam.com', 'Calamos': 'www.calamos.com', 'Xtrackers': 'www.dws.com',
    'Simplify': 'www.simplify.us', 'T. Rowe Price': 'www.troweprice.com', 'Harbor': 'www.harborcapital.com',
    'MicroSectors': 'www.microsectors.com', 'Dimensional': 'www.dimensional.com', 'Schwab': 'www.schwab.com',
    'Avantis': 'www.avantisinvestors.com', 'Nuveen': 'www.nuveen.com', 'KraneShares': 'kraneshares.com',
    'Capital Group': 'www.capitalgroup.com', 'American Century': 'www.americancentury.com', 'AB ': 'www.alliancebernstein.com',
    'Virtus': 'www.virtus.com', 'VictoryShares': 'www.vcm.com', 'Columbia': 'www.columbiathreadneedleus.com',
    'Hartford': 'www.hartfordfunds.com', 'BNY': 'www.bny.com', 'PIMCO': 'www.pimco.com',
    'NYLIM': 'www.newyorklifeinvestments.com', 'ALPS': 'www.alpsfunds.com', 'BondBloxx': 'bondbloxxetf.com',
    'Cambria': 'www.cambriafunds.com', 'John Hancock': 'www.jhinvestments.com', 'Janus Henderson': 'www.janushenderson.com',
    'Sprott': 'sprott.com', 'Principal': 'www.principal.com', 'Grayscale': 'www.grayscale.com', 'Neuberger': 'www.nb.com',
    'AdvisorShares': 'advisorshares.com', 'ARK ': 'www.ark-funds.com', 'Bitwise': 'bitwiseinvestments.com',
    'Strive': 'www.strivefunds.com', 'Matthews': 'www.matthewsasia.com', 'Hennessy': 'www.hennessyfunds.com',
    'Morgan Stanley': 'www.morganstanley.com', 'BlackRock': 'www.blackrock.com', 'Eaton Vance': 'www.eatonvance.com',
    'Putnam': 'www.putnam.com', 'Federated Hermes': 'www.federatedhermes.com', 'Thornburg': 'www.thornburg.com',
}
ORDER = sorted(ISSUERS, key=len, reverse=True)


def site_for(name):
    for prefix in ORDER:
        if name.startswith(prefix):
            return ISSUERS[prefix]
    return None


# Listede önce en çok bilinen (büyük) ETF'ler, sonra diğerleri alfabetik sırayla gösterilir.
POPULAR = [
    'SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'VUG', 'VEA', 'IEFA', 'VTV', 'BND', 'AGG', 'IWM', 'IEMG', 'VXUS', 'VWO',
    'VIG', 'GLD', 'IJH', 'VGT', 'XLK', 'IWF', 'SCHD', 'VO', 'IJR', 'RSP', 'BNDX', 'VB', 'ITOT', 'EFA', 'SPLG',
    'IVW', 'VYM', 'QQQM', 'XLF', 'SCHX', 'TLT', 'SMH', 'VNQ', 'XLV', 'IWD', 'SLV', 'IBIT', 'DIA', 'VT', 'SCHG',
    'XLE', 'SOXX', 'MDY', 'ARKK', 'TQQQ', 'SQQQ', 'SOXL', 'SPYG', 'JEPI', 'JEPQ', 'XLY', 'XLI', 'XLP', 'XLU', 'EEM',
]
rank = {code: i for i, code in enumerate(POPULAR)}
etfs = sorted(etfs, key=lambda e: rank.get(e['code'], len(POPULAR)))

rows = []
for e in etfs:
    item = [e['code'], e['name'].strip(), EXCHANGES.index(e['exchange']) if e['exchange'] in EXCHANGES else 0]
    site = site_for(e['name'].strip())
    if site:
        item.append(site)
    rows.append('  ' + json.dumps(item, ensure_ascii=False) + ',')

print(f"""// Bu dosya scripts/build-etf-data.py ile üretildi ({date.today().isoformat()}). Elle düzenlemeyin.
// Kaynak: NASDAQ Trader sembol dizini (ETF işaretli kalemler); logolar çıkarıcı şirketin sitesinden.\n// Sıra: önce en bilinen ETF'ler, sonra alfabetik.

export interface EtfInfo {{
  code: string;
  name: string;
  exchange: string;
  /** Çıkarıcı şirketin internet adresi (logo için). */
  website?: string;
}}

const EXCHANGES = {json.dumps(EXCHANGES)};

const RAW: readonly (readonly [string, string, number, string?])[] = [
{chr(10).join(rows)}
];

export const US_ETFS: readonly EtfInfo[] = RAW.map(([code, name, ex, website]) => ({{
  code,
  name,
  exchange: EXCHANGES[ex],
  website,
}}));""")
