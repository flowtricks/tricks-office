"""Outline award labels from locally installed WF Visual Sans (requires fonttools)."""
from pathlib import Path
import re
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/textures/awards'
FONTS = Path.home() / 'Library/Fonts'
medium = TTFont(next(FONTS.glob('*WFVisualSans-Medium.otf')))
regular = TTFont(next(FONTS.glob('*WFVisualSans-RegularText.otf')))
logo = (OUT / 'webflow-logo.svg').read_text()
logo_paths = re.sub(r'^.*?<svg[^>]*>|</svg>\s*$', '', logo, flags=re.S)

def text(value, x, y, size, font=medium):
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font['head'].unitsPerEm
    paths = []
    for char in value:
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, y)))
        paths.append(pen.getCommands())
        x += font['hmtx'].metrics[name][0] * scale
    return '<path fill="#e4eeec" d="' + ' '.join(paths) + '"/>'

def save(name, contents, title):
    (OUT / name).write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="2048" viewBox="0 0 512 2048">'
        f'<title>{title}</title><desc>Text outlined from WF Visual Sans; logo supplied by Timothy Ricks.</desc>'
        + ''.join(contents) + '</svg>\n')

for year in [2025, 2026]:
    lines = ['Community', 'Educator', 'of the Year'] if year == 2025 else ['Educator', 'of the Year']
    front = [text(line, 48, 1390 + i * 61, 51) for i, line in enumerate(lines)]
    front += [text('Presented to', 48, 1685, 27, regular), text('Timothy Ricks', 48, 1744, 43, regular)]
    front += [f'<g transform="translate(48 1900) scale(0.416)">{logo_paths}</g>']
    save(f'award-{year}-front.svg', front, f'{year} {" ".join(lines)} — Timothy Ricks')
    side = [text(line, 48, 1370 + i * 85, 77) for i, line in enumerate(['Webflow', 'Awards', str(year)])]
    save(f'award-{year}-side.svg', side, f'Webflow Awards {year}')
print('Generated four SVG labels with outlined WF Visual Sans text.')
