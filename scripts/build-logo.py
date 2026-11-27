"""src/components/genius-logo-paths.ts dosyasını üretir: GENIUS logosunun SVG çizgileri.

Harfler Unbounded Black yazı tipinden alınır (SIL Open Font License). Logo dokunuşları:
- G'nin yatay çubuğu ayrı (renkli) çizilir,
- I harfi yukarı ok olur,
- Bütün yazı uygulamada hafif italik (skewX) gösterilir.

Kullanım:
  python3 -I scripts/build-logo.py node_modules/@expo-google-fonts/unbounded/900Black/Unbounded_900Black.ttf \\
    > src/components/genius-logo-paths.ts
"""
import math
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

font = TTFont(sys.argv[1])
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()

WORD = 'GENIUS'
TRACK = 34  # harf arası (1000 birimlik em'de)
SKEW = -10  # derece; uygulamada skewX ile uygulanır
TOP = 860  # okun ucu cap yüksekliğinin (750) üstüne çıkar
BOTTOM = 30


def glyph_path(ch, dx):
    pen = SVGPathPen(glyphs)
    glyphs[cmap[ord(ch)]].draw(TransformPen(pen, (1, 0, 0, -1, dx, 0)))
    return pen.getCommands()


def g_split(d):
    """G'nin iki parçası: dış kavis ve yatay çubuk + sap (ikinci kontur)."""
    i = d.index('M', 1)
    return d[:i], d[i:]


fg, accent = [], []
x = 0
for ch in WORD:
    adv = glyphs[cmap[ord(ch)]].width
    if ch == 'G':
        outer, bar = g_split(glyph_path(ch, x))
        fg.append(outer)
        accent.append(bar)
    elif ch == 'I':
        # I yerine yukarı ok: sap I'nın genişliğinde, ucu cap yüksekliğinin üstünde
        pts = [(60, 0), (60, -520), (-10, -520), (189, -800), (388, -520), (318, -520), (318, 0)]
        accent.append('M' + 'L'.join(f'{px + x} {py}' for px, py in pts) + 'Z')
    else:
        fg.append(glyph_path(ch, x))
    x += adv + TRACK
width = x - TRACK
shift = math.tan(math.radians(-SKEW)) * TOP

print(f'''// Bu dosya scripts/build-logo.py ile üretildi. Elle düzenlemeyin.
// Harfler: Unbounded Black (SIL Open Font License).

export const LOGO_VIEWBOX = '-20 {-TOP} {width + shift + 40:.0f} {TOP + BOTTOM}';
export const LOGO_ASPECT = {(width + shift + 40) / (TOP + BOTTOM):.4f};
export const LOGO_SKEW = {SKEW};
/** Gece beyaz, gündüz siyah çizilen harfler. */
export const LOGO_FG = '{''.join(fg)}';
/** Renkli dokunuşlar: G'nin çubuğu ve I oku. */
export const LOGO_ACCENT = '{''.join(accent)}';''')
