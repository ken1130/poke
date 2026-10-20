#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ataque / Defensa / Ataque Esp. / Defensa Esp. de cada Pokémon del juego y la clase de daño
(física / especial) de cada movimiento, desde PokeAPI (2026-10-20, «los seis stats»).
Deja js/data/stats6.js; el juego no toca internet.
    python3 tools/fetch_stats6.py
- Pokémon: los de js/data/pokedex.js (por número), las formas regionales (fetch_forms.FORMS) y las
  Megas (fetch_mega.MEGAS). Si PokeAPI no tiene una Mega (las nuevas de Z-A), se usa la del Pokémon
  base ×1,2 (lo que suele subir una Mega).
- Movimientos: por su id (los de los juegos se llaman igual en PokeAPI). Los que no existen (los
  inventados) los pone a mano js/data/stats6-custom.js.
"""
import json, os, re, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import fetch_forms, fetch_mega  # noqa: E402  (sólo las listas; su main no se ejecuta)

API = 'https://pokeapi.co/api/v2'
OUT = os.path.join(ROOT, 'js', 'data', 'stats6.js')


def get(path):
    req = urllib.request.Request(API + path, headers={'User-Agent': 'pokesurvivor/1.0'})
    for _ in range(3):
        try:
            return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:
            pass
    return None


def four(p):
    s = {x['stat']['name']: x['base_stat'] for x in p['stats']}
    return [s['attack'], s['defense'], s['special-attack'], s['special-defense']]


def main():
    dex_src = open(os.path.join(ROOT, 'js', 'data', 'pokedex.js'), encoding='utf-8').read()
    dexes = sorted({int(d) for d in re.findall(r'"dex":(\d+)', dex_src)})
    forms_src = open(os.path.join(ROOT, 'js', 'data', 'pokedex-forms.js'), encoding='utf-8').read()
    dexes += sorted({int(d) for d in re.findall(r'"dex":(\d+)', forms_src) if int(d) < 20000} - set(dexes))
    print('Pokémon:', len(dexes), '· formas:', len(fetch_forms.FORMS), '· Megas:', len(fetch_mega.MEGAS))

    with ThreadPoolExecutor(16) as ex:
        base = dict(zip(dexes, ex.map(lambda d: get(f'/pokemon/{d}'), dexes)))
    out, miss = {}, []
    for d, p in base.items():
        if p: out[d] = four(p)
        else: miss.append(d)

    # Formas regionales: dex = 20000 + 10 × especie + nº de forma (como pokedex-forms.js)
    def form_job(f):
        sp, _code, api, _reg, n = f[:5]
        return 20000 + 10 * sp + n, get(f'/pokemon/{api}')
    with ThreadPoolExecutor(16) as ex:
        for fid, p in ex.map(form_job, fetch_forms.FORMS):
            if p: out[fid] = four(p)
            else: miss.append(fid)

    # Megas: 30000 + especie. Nombre en PokeAPI: <especie>-mega(-x/-y)
    def mega_job(m):
        sp, sub = m
        name = base[sp]['name'] if base.get(sp) else None
        suf = {'Mega': '-mega', 'Mega_X': '-mega-x', 'Mega_Y': '-mega-y'}[sub]
        p = get(f'/pokemon/{name}{suf}') if name else None
        return sp, p
    with ThreadPoolExecutor(16) as ex:
        for sp, p in ex.map(mega_job, fetch_mega.MEGAS):
            if p: out[30000 + sp] = four(p)
            elif sp in out: out[30000 + sp] = [round(v * 1.2) for v in out[sp]]

    moves_src = open(os.path.join(ROOT, 'js', 'data', 'moves.js'), encoding='utf-8').read()
    ids = sorted(set(re.findall(r"\{ id: '([a-z0-9-]+)'", moves_src)))
    with ThreadPoolExecutor(16) as ex:
        res = dict(zip(ids, ex.map(lambda i: get(f'/move/{i}'), ids)))
    cat, nocat = {}, []
    for i, m in res.items():
        dc = m and m.get('damage_class') and m['damage_class']['name']
        if dc in ('physical', 'special'): cat[i] = 'p' if dc == 'physical' else 's'
        else: nocat.append(i)

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('/* ============ stats6.js — GENERADO por tools/fetch_stats6.py, no editar a mano ============\n'
                ' * G.STATS6[dex] = [Ataque, Defensa, Ataque Esp., Defensa Esp.] (stats base de PokeAPI).\n'
                ' * G.MOVE_CAT[id] = "p" (físico) | "s" (especial). Lo inventado: stats6-custom.js.\n */\n')
        f.write('G.STATS6 = ' + json.dumps({str(k): v for k, v in sorted(out.items())}, separators=(',', ':')) + ';\n')
        f.write('G.MOVE_CAT = ' + json.dumps(cat, separators=(',', ':'), sort_keys=True) + ';\n')
    print('stats:', len(out), '· sin datos:', miss)
    print('movimientos con clase:', len(cat), '· sin clase (a mano):', nocat)


if __name__ == '__main__':
    main()
