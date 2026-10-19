#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Formas regionales (Alola, Galar, Hisui, Paldea) y especies nuevas sólo con Idle/Walk
(hoja «Poke Survivor 新增內容_V3.1», 2026-10-19).

    python tools/fetch_forms.py

Baja los sprites de SpriteCollab (sprite/{dex}/{forma}/ y el shiny en {forma}/0001/) a
assets/pokemon/{id}/ y genera js/data/pokedex-forms.js, que se carga DESPUÉS de
pokedex.js, evolutions.js y sprites-meta.js y les añade:
  - las entradas de la Pokédex (con `base`, `form` y `extra: true`; ver más abajo),
  - su geometría de animaciones (G.SPRITE_META[id]),
  - sus evoluciones (G.EVOS).

Ids:
  - forma regional: 20000 + 10 × nº de su especie + nº de forma (Rattata de Alola = 20191,
    Meowth de Galar = 20522, Tauros de Paldea acuático = 21283). Nunca chocan con la
    Pokédex (≤ 1025) ni con los personajes originales (10001+).
  - especies que faltaban (Jellicent, Sirfetch'd, Copperajah, Toedscool, Pecharunt): su
    número de la Pokédex. Sólo tienen Idle y Walk (o algo más): lo que falta se rellena
    con lo que haya (FALLBACK de fetch_sprites.py).
  `extra: true` = no cuentan para el logro «todos los Pokémon» (el total de antes, 966).

Fuente de datos: PokeAPI (tipos, stats y nombres: es / zh-Hant / en). Créditos: SpriteCollab.
"""
import io
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_sprites as FS          # fetch, parse_animdata, download_set
import fetch_pokedex as FP          # rarity, gen_of

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JS = os.path.join(ROOT, 'js', 'data', 'pokedex-forms.js')
CACHE = os.path.join(ROOT, 'tools', 'cache', 'forms')
API = 'https://pokeapi.co/api/v2'

REGION = {   # sufijos de nombre
    'alola':  ('de Alola', '阿羅拉', 'Alolan'),
    'galar':  ('de Galar', '伽勒爾', 'Galarian'),
    'hisui':  ('de Hisui', '洗翠', 'Hisuian'),
    'paldea': ('de Paldea', '帕底亞', 'Paldean'),
}
# (especie, carpeta de forma en SpriteCollab, nombre en PokeAPI, región, nº de forma, variante)
FORMS = [
    (19, '0001', 'rattata-alola', 'alola', 1), (20, '0001', 'raticate-alola', 'alola', 1),
    (26, '0001', 'raichu-alola', 'alola', 1), (27, '0001', 'sandshrew-alola', 'alola', 1),
    (28, '0001', 'sandslash-alola', 'alola', 1), (37, '0001', 'vulpix-alola', 'alola', 1),
    (38, '0001', 'ninetales-alola', 'alola', 1), (50, '0001', 'diglett-alola', 'alola', 1),
    (51, '0001', 'dugtrio-alola', 'alola', 1), (52, '0001', 'meowth-alola', 'alola', 1),
    (52, '0002', 'meowth-galar', 'galar', 2), (53, '0001', 'persian-alola', 'alola', 1),
    (58, '0001', 'growlithe-hisui', 'hisui', 1), (59, '0001', 'arcanine-hisui', 'hisui', 1),
    (74, '0001', 'geodude-alola', 'alola', 1), (75, '0001', 'graveler-alola', 'alola', 1),
    (76, '0001', 'golem-alola', 'alola', 1), (77, '0001', 'ponyta-galar', 'galar', 1),
    (78, '0001', 'rapidash-galar', 'galar', 1), (79, '0001', 'slowpoke-galar', 'galar', 1),
    (80, '0001', 'slowbro-galar', 'galar', 1), (83, '0001', 'farfetchd-galar', 'galar', 1),
    (88, '0001', 'grimer-alola', 'alola', 1), (89, '0001', 'muk-alola', 'alola', 1),
    (100, '0001', 'voltorb-hisui', 'hisui', 1), (101, '0001', 'electrode-hisui', 'hisui', 1),
    (103, '0001', 'exeggutor-alola', 'alola', 1), (105, '0001', 'marowak-alola', 'alola', 1),
    (110, '0001', 'weezing-galar', 'galar', 1), (122, '0001', 'mr-mime-galar', 'galar', 1),
    (128, '0001', 'tauros-paldea-combat-breed', 'paldea', 1, ('Combatiente', '鬥戰種', 'Combat Breed')),
    (128, '0002', 'tauros-paldea-blaze-breed', 'paldea', 2, ('Ardiente', '火熾種', 'Blaze Breed')),
    (128, '0003', 'tauros-paldea-aqua-breed', 'paldea', 3, ('Acuático', '水瀾種', 'Aqua Breed')),
    (144, '0001', 'articuno-galar', 'galar', 1), (145, '0001', 'zapdos-galar', 'galar', 1),
    (146, '0001', 'moltres-galar', 'galar', 1), (157, '0001', 'typhlosion-hisui', 'hisui', 1),
    (194, '0002', 'wooper-paldea', 'paldea', 1), (199, '0001', 'slowking-galar', 'galar', 1),
    (211, '0001', 'qwilfish-hisui', 'hisui', 1), (215, '0001', 'sneasel-hisui', 'hisui', 1),
    (222, '0001', 'corsola-galar', 'galar', 1), (263, '0001', 'zigzagoon-galar', 'galar', 1),
    (264, '0001', 'linoone-galar', 'galar', 1), (503, '0001', 'samurott-hisui', 'hisui', 1),
    (549, '0001', 'lilligant-hisui', 'hisui', 1), (554, '0001', 'darumaka-galar', 'galar', 1),
    (555, '0002', 'darmanitan-galar-standard', 'galar', 1), (562, '0001', 'yamask-galar', 'galar', 1),
    (570, '0001', 'zorua-hisui', 'hisui', 1), (571, '0001', 'zoroark-hisui', 'hisui', 1),
    (628, '0001', 'braviary-hisui', 'hisui', 1), (705, '0001', 'sliggoo-hisui', 'hisui', 1),
    (706, '0001', 'goodra-hisui', 'hisui', 1), (713, '0001', 'avalugg-hisui', 'hisui', 1),
    (724, '0001', 'decidueye-hisui', 'hisui', 1),
]
NEW_SPECIES = [593, 865, 879, 948, 1025]
# Evoluciones de las formas (de qué evoluciona y a qué). Números: especie normal; 'f:N:k' = forma k de N.
EVO = [
    ('f:19:1', 'f:20:1'), ('25', 'f:26:1'), ('f:27:1', 'f:28:1'), ('f:37:1', 'f:38:1'), ('f:50:1', 'f:51:1'),
    ('f:52:1', 'f:53:1'), ('f:52:2', '863'), ('f:58:1', 'f:59:1'), ('f:74:1', 'f:75:1'), ('f:75:1', 'f:76:1'),
    ('f:77:1', 'f:78:1'), ('f:79:1', 'f:80:1'), ('f:79:1', 'f:199:1'), ('f:83:1', '865'), ('f:88:1', 'f:89:1'),
    ('f:100:1', 'f:101:1'), ('102', 'f:103:1'), ('104', 'f:105:1'), ('109', 'f:110:1'), ('439', 'f:122:1'),
    ('156', 'f:157:1'), ('f:194:1', '980'), ('f:211:1', '904'), ('f:215:1', '903'), ('f:222:1', '864'),
    ('f:263:1', 'f:264:1'), ('f:264:1', '862'), ('502', 'f:503:1'), ('548', 'f:549:1'), ('f:554:1', 'f:555:1'),
    ('f:562:1', '867'), ('f:570:1', 'f:571:1'), ('627', 'f:628:1'), ('704', 'f:705:1'), ('f:705:1', 'f:706:1'),
    ('712', 'f:713:1'), ('723', 'f:724:1'), ('592', '593'), ('878', '879'),
]


LABELS = "/* Rótulos de la Pokédex (menu.js) */\nG.I18n.add({ 'Forma de Alola': '阿羅拉的樣子', 'Forma de Galar': '伽勒爾的樣子', 'Forma de Hisui': '洗翠的樣子', 'Forma de Paldea': '帕底亞的樣子' }, 'zh');\nG.I18n.add({ 'Forma de Alola': 'Alolan form', 'Forma de Galar': 'Galarian form', 'Forma de Hisui': 'Hisuian form', 'Forma de Paldea': 'Paldean form' });\n"


def fid(base, k):
    return 20000 + base * 10 + k


def ref(x):
    if x.startswith('f:'):
        _, b, k = x.split(':')
        return fid(int(b), int(k))
    return int(x)


def api(path):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, path.replace('/', '_') + '.json')
    if os.path.exists(fn):
        return json.load(open(fn, encoding='utf-8'))
    raw = FS.fetch(f'{API}/{path}')
    if not raw:
        return None
    d = json.loads(raw.decode('utf-8'))
    json.dump(d, open(fn, 'w', encoding='utf-8'))
    return d


def names(species):
    out = {}
    for n in species.get('names', []):
        out[n['language']['name']] = n['name']
    return out.get('es') or species['name'].capitalize(), out.get('zh-hant') or out.get('zh-Hant') or '', out.get('en') or species['name'].capitalize()


def stats_of(p):
    base = {st['stat']['name']: st['base_stat'] for st in p['stats']}
    bst = sum(base.values())
    return {
        'hp': round(70 + base['hp'] * 0.45),
        'spd': round(78 + base['speed'] * 0.42),
        'atk': round(0.70 + max(base['attack'], base['special-attack']) / 100 * 0.55, 2),
        'bst': bst,
    }


def sprites(new_id, url_base, want_shiny):
    """Baja normal (y shiny) de url_base a assets/pokemon/{new_id}/. Devuelve la meta o None."""
    out = os.path.join(FS.OUT_ASSETS, str(new_id))
    xml = FS.fetch(f'{url_base}/AnimData.xml')
    if not xml:
        return None
    anims, shadow = FS.parse_animdata(xml.decode('utf-8', 'replace'))
    normal = FS.download_set(url_base, out, anims)
    if not {'Idle', 'Walk'} <= set(normal):
        return None
    meta = {'s': shadow, 'a': normal}
    if want_shiny:
        sxml = FS.fetch(f'{url_base}/0001/AnimData.xml')
        if sxml:
            sanims = FS.parse_animdata(sxml.decode('utf-8', 'replace'))[0]
            shiny = FS.download_set(f'{url_base}/0001', os.path.join(out, 's'), sanims, normal)
            if 'Idle' in shiny and 'Walk' in shiny:
                meta['sh'] = 1
                diff = {k: v for k, v in shiny.items() if normal.get(k) != v}
                if diff:
                    meta['sa'] = diff
                miss = [k for k in normal if k not in shiny]
                if miss:
                    meta['sm'] = miss
    return meta


def main():
    tracker = json.loads(FS.fetch(FS.RAW + '/tracker.json').decode('utf-8'))
    hover = {}
    meta_js = open(os.path.join(ROOT, 'js', 'data', 'sprites-meta.js'), encoding='utf-8').read()
    for line in meta_js.splitlines():   # «flota» del Pokémon normal (para la sombra)
        line = line.strip()
        if line[:1].isdigit() and '"hv":1' in line:
            hover[int(line.split(':', 1)[0])] = 1

    rows, metas = [], {}

    def do_form(f):
        base, folder, slug, region, k = f[:5]
        variant = f[5] if len(f) > 5 else None
        new = fid(base, k)
        e = tracker.get(f'{base:04d}', {}).get('subgroups', {}).get(folder, {})
        shiny = {'Idle', 'Walk'} <= set(e.get('subgroups', {}).get('0001', {}).get('sprite_files', {}))
        m = sprites(new, f'{FS.BASE}/{base:04d}/{folder}', shiny)
        p, s = api(f'pokemon/{slug}'), api(f'pokemon-species/{base}')
        return f, new, m, p, s, variant, region

    with ThreadPoolExecutor(max_workers=8) as ex:
        for f, new, m, p, s, variant, region in ex.map(do_form, FORMS):
            if not m or not p or not s:
                print('  ! sin datos:', f)
                continue
            es, zh, en = names(s)
            suf_es, suf_zh, suf_en = REGION[region]
            if variant:
                name_es = f'{es} {suf_es} ({variant[0]})'
                name_zh = f'{zh}（{suf_zh}・{variant[1]}）'
                name_en = f'{suf_en} {en} ({variant[2]})'
            else:
                name_es, name_zh, name_en = f'{es} {suf_es}', f'{zh}（{suf_zh}）', f'{suf_en} {en}'
            st = stats_of(p)
            if f[0] in hover:
                m['hv'] = 1
            metas[new] = m
            rows.append({'dex': new, 'name': name_es, 'types': [t['type']['name'] for t in p['types']],
                         'hp': st['hp'], 'spd': st['spd'], 'atk': st['atk'],
                         'rarity': FP.rarity(st['bst'], f[0], s.get('is_legendary'), s.get('is_mythical')),
                         'bst': st['bst'], 'starter': False, 'gen': FP.gen_of(f[0]),
                         'leg': bool(s.get('is_legendary') or s.get('is_mythical')),
                         'base': f[0], 'form': region, 'extra': True, '_zh': name_zh, '_en': name_en})

    for d in NEW_SPECIES:
        e = tracker.get(f'{d:04d}', {})
        shiny = {'Idle', 'Walk'} <= set(e.get('subgroups', {}).get('0000', {}).get('subgroups', {}).get('0001', {}).get('sprite_files', {}))
        m = sprites(d, f'{FS.BASE}/{d:04d}', False)
        if m and shiny:   # el shiny de las especies está en 0000/0001
            xml = FS.fetch(f'{FS.BASE}/{d:04d}/0000/0001/AnimData.xml')
            if xml:
                sanims = FS.parse_animdata(xml.decode('utf-8', 'replace'))[0]
                sh = FS.download_set(f'{FS.BASE}/{d:04d}/0000/0001', os.path.join(FS.OUT_ASSETS, str(d), 's'), sanims, m['a'])
                if 'Idle' in sh and 'Walk' in sh:
                    m['sh'] = 1
                    miss = [k for k in m['a'] if k not in sh]
                    if miss:
                        m['sm'] = miss
        p, s = api(f'pokemon/{d}'), api(f'pokemon-species/{d}')
        if not m or not p or not s:
            print('  ! sin datos:', d)
            continue
        es, zh, en = names(s)
        st = stats_of(p)
        metas[d] = m
        rows.append({'dex': d, 'name': es, 'types': [t['type']['name'] for t in p['types']],
                     'hp': st['hp'], 'spd': st['spd'], 'atk': st['atk'],
                     'rarity': FP.rarity(st['bst'], d, s.get('is_legendary'), s.get('is_mythical')),
                     'bst': st['bst'], 'starter': False, 'gen': FP.gen_of(d),
                     'leg': bool(s.get('is_legendary') or s.get('is_mythical')),
                     'extra': True, '_zh': zh, '_en': en})

    rows.sort(key=lambda r: (r.get('base', r['dex']), r['dex']))
    have = {r['dex'] for r in rows}
    evos = {}
    for a, b in EVO:
        fa, fb = ref(a), ref(b)
        if (fa in have or fa < 10000) and (fb in have or fb < 10000):
            evos.setdefault(fa, []).append(fb)

    lines = [
        '/* ============ pokedex-forms.js — GENERADO por tools/fetch_forms.py, no editar a mano ============',
        ' * Formas regionales y especies que faltaban (hoja V3.1, 2026-10-19). Se carga después de',
        ' * pokedex.js, evolutions.js y sprites-meta.js: añade a G.DEX (cada forma junto a su especie),',
        ' * G.DEX_BY, G.SPRITE_META y G.EVOS. Forma: dex = 20000 + 10 × especie + nº de forma, con',
        ' * `base` (la especie) y `form` (alola/galar/hisui/paldea). `extra`: no cuenta para «todos los',
        ' * Pokémon» (el logro sigue siendo con los de antes). Nombres: lang-v31-forms.js.',
        ' */',
        '(() => {',
        '  const ADD = [',
    ]
    for r in rows:
        lines.append('    ' + json.dumps({k: v for k, v in r.items() if not k.startswith('_')}, ensure_ascii=False, separators=(',', ':')) + ',')
    lines += ['  ];', '  const META = {']
    for d in sorted(metas):
        lines.append(f'    {d}: {json.dumps(metas[d], separators=(",", ":"))},')
    lines += ['  };', f'  const EVOS = {json.dumps({str(k): v for k, v in evos.items()}, separators=(",", ":"))};', '''
  // Cada una justo detrás de su especie (o en su sitio por número), para que salgan juntas en la Pokédex.
  for (const p of ADD) {
    if (G.DEX_BY[p.dex]) continue;
    const after = p.base || p.dex;
    let i = G.DEX.length;
    for (let k = 0; k < G.DEX.length; k++) {
      const q = G.DEX[k], key = q.base || q.dex;
      if (key > after || (key === after && q.dex > p.dex && !(p.base && !q.base))) { i = k; break; }
    }
    G.DEX.splice(i, 0, p);
    G.DEX_BY[p.dex] = p;
  }
  for (const d in META) if (!G.SPRITE_META[d]) G.SPRITE_META[d] = META[d];
  for (const k in EVOS) G.EVOS[k] = [...new Set([...(G.EVOS[k] || []), ...EVOS[k]])];
})();
''']
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))

    # Traducciones de los nombres (zh / en).
    tr = os.path.join(ROOT, 'js', 'data', 'lang-v31-forms.js')
    zh = ',\n'.join(f'  {json.dumps(r["name"], ensure_ascii=False)}: {json.dumps(r["_zh"], ensure_ascii=False)}' for r in rows if r['_zh'])
    en = ',\n'.join(f'  {json.dumps(r["name"], ensure_ascii=False)}: {json.dumps(r["_en"], ensure_ascii=False)}' for r in rows)
    with io.open(tr, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* ============ lang-v31-forms.js — GENERADO por tools/fetch_forms.py (nombres de las formas regionales) ============ */\n'
                f'G.I18n.add({{\n{zh}\n}}, \'zh\');\nG.I18n.add({{\n{en}\n}});\n')
    with io.open(tr, 'a', encoding='utf-8', newline='\n') as f:
        f.write(LABELS)
    print(f'{len(rows)} entradas ({sum(1 for r in rows if r.get("base"))} formas), {len(evos)} evoluciones')


if __name__ == '__main__':
    main()
