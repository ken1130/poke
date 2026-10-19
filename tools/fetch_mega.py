#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Descarga las formas Mega de SpriteCollab que tienen animación completa (Idle+Walk+Attack)
a assets/pokemon/{30000+dex}/ y genera js/data/sprites-mega.js (2026-10-19, V3.1).

    python tools/fetch_mega.py

Usa las funciones de tools/fetch_sprites.py. La subcarpeta de cada Mega se busca en
tracker.json por el nombre del subgrupo ('Mega', 'Mega_X', 'Mega_Y').
Fuente: https://github.com/PMDCollab/SpriteCollab (CC BY-NC 4.0)
"""
import io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_sprites as F

OFFSET = 30000
OUT_META = os.path.join(F.ROOT, 'js', 'data', 'sprites-mega.js')
# (dex base, nombre del subgrupo en SpriteCollab)
MEGAS = [(670, 'Mega'), (65, 'Mega'), (94, 'Mega'), (308, 'Mega'), (310, 'Mega'), (282, 'Mega'), (475, 'Mega'),
         (229, 'Mega'), (334, 'Mega'), (428, 'Mega'), (354, 'Mega'), (323, 'Mega'), (530, 'Mega'), (302, 'Mega'),
         (303, 'Mega'), (359, 'Mega'), (448, 'Mega'), (80, 'Mega'), (319, 'Mega'), (604, 'Mega'), (6, 'Mega_X'),
         (691, 'Mega'), (362, 'Mega'), (560, 'Mega'), (142, 'Mega'), (208, 'Mega'), (248, 'Mega'), (227, 'Mega'),
         (115, 'Mega'), (780, 'Mega'), (718, 'Mega'), (719, 'Mega'), (150, 'Mega_Y'), (978, 'Mega'), (491, 'Mega'),
         (380, 'Mega'), (381, 'Mega'), (384, 'Mega'), (807, 'Mega')]


def main():
    tracker = json.loads(F.fetch(F.RAW + '/tracker.json').decode('utf-8'))
    metas = {}
    for dex, sub_name in MEGAS:
        node = tracker.get(f'{dex:04d}', {})
        sub = next(((k, v) for k, v in node.get('subgroups', {}).items() if v.get('name') == sub_name), None)
        if not sub or not F.REQUIRED <= set(sub[1].get('sprite_files', {})):
            print('  sin forma', dex, sub_name)
            continue
        code, info = sub
        base = f'{F.BASE}/{dex:04d}/{code}'
        out = os.path.join(F.OUT_ASSETS, str(OFFSET + dex))
        xml = F.fetch(base + '/AnimData.xml')
        if not xml:
            print('  sin AnimData', dex)
            continue
        anims, shadow = F.parse_animdata(xml.decode('utf-8', 'replace'))
        normal = F.download_set(base, out, anims)
        if not F.REQUIRED <= set(normal):
            print('  incompleto', dex)
            continue
        meta = {'s': shadow, 'a': normal}
        sh = info.get('subgroups', {}).get('0001', {})
        if {'Idle', 'Walk'} <= set(sh.get('sprite_files', {})):
            sxml = F.fetch(base + '/0001/AnimData.xml')
            sanims = F.parse_animdata(sxml.decode('utf-8', 'replace'))[0] if sxml else anims
            shiny = F.download_set(base + '/0001', os.path.join(out, 's'), sanims, normal)
            if 'Idle' in shiny and 'Walk' in shiny:
                meta['sh'] = 1
                diff = {k: v for k, v in shiny.items() if normal.get(k) != v}
                if diff:
                    meta['sa'] = diff
                miss = [k for k in normal if k not in shiny]
                if miss:
                    meta['sm'] = miss
        metas[OFFSET + dex] = meta
        print('  ok', dex, sub_name, code, 'shiny' if meta.get('sh') else '')
    lines = ['/* ============ sprites-mega.js — GENERADO por tools/fetch_mega.py, no editar a mano ============',
             ' * Las formas Mega (data/mega.js): mismo formato que sprites-meta.js; su número es 30000 + el de',
             ' * la Pokédex del Pokémon base. Se añaden a G.SPRITE_META (sus hojas: assets/pokemon/{30000+dex}/).',
             ' */',
             'Object.assign(G.SPRITE_META, {']
    for d in sorted(metas):
        lines.append(f'  {d}: {json.dumps(metas[d], separators=(",", ":"))},')
    lines += ['});', '']
    with io.open(OUT_META, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print(len(metas), 'Mega')


if __name__ == '__main__':
    main()
