#!/usr/bin/env python3
"""Formas «despiertas» de los personajes originales (2026-10-21).

A partir de las hojas de assets/pokemon/{dex}/ (dex 10001-10008) genera las de la forma despierta
en assets/pokemon/{30000+dex}/ (40001-40008), con el mismo número y orden de fotogramas:
  · cada fotograma se amplía PAD px por cada lado (para que quepa el aura) y el ancla se mueve igual;
  · recoloreado por personaje (giro de tono / tono fijo / tinte de los píxeles poco saturados), un poco
    más de brillo en las luces y el contorno (los píxeles muy oscuros) teñido con el color del personaje;
  · un aura de píxeles brillantes alrededor de la silueta, distinta en cada fotograma (parpadea al animar).
Todo píxel a píxel, sin desenfoques: sigue siendo pixel art.

Uso (desde la raíz del proyecto):
    python3 -I tools/custom_sprites/make_awaken.py [dex ...]
Escribe las hojas, meta.json, preview.png en tools/custom_sprites/out_awaken/ (no va al git) y
js/data/sprites-awaken.js (la geometría, como sprites-mega.js).
"""
import json
import os
import sys
import time
import colorsys
import random

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAD = 4
ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint']

# Recoloreado de cada uno. Claves:
#   hue       giro de tono (grados) de los píxeles saturados
#   hue_set   tono fijo (grados) para los saturados (en vez de girar)
#   hue_in    sólo se toca el tono de los píxeles cuyo tono está en ese rango [a, b] (grados)
#   sat, val  multiplicadores de saturación y valor
#   tint, tk  color y fuerza con que se tiñen los píxeles POCO saturados (blancos, grises, cremas)
#   dark, dk  color y fuerza con que se tiñen los píxeles oscuros pero no de contorno (el pelo negro del panda)
#   outline   color del contorno (los píxeles casi negros)
#   aura      [color vivo, color claro] de los píxeles del aura; `shape` 'dot' | 'plus' | 'star'; `n` cuántos por fotograma
CFG = {
    10001: dict(name='Panda', hue=0, sat=1.0, val=1.0, tint=(255, 238, 190), tk=0.22, dark=(70, 40, 150), dk=0.85,
                outline=(45, 25, 80), aura=[(255, 214, 80), (255, 248, 200)], shape='star', n=5),
    10002: dict(name='Pollito', hue=-16, sat=1.15, val=1.08, tint=(255, 250, 220), tk=0.15,
                outline=(120, 55, 10), aura=[(120, 230, 255), (255, 255, 255)], shape='plus', n=6),
    10003: dict(name='Didi', hue_set=205, sat=1.0, val=1.08, tint=(150, 205, 255), tk=0.5,
                outline=(25, 45, 100), aura=[(110, 185, 255), (225, 242, 255)], shape='dot', n=6),
    10004: dict(name='Heroe', hue=42, hue_in=(280, 360), sat=1.55, val=0.97, tint=(255, 235, 200), tk=0.1,
                outline=(95, 15, 25), aura=[(255, 200, 60), (255, 120, 40)], shape='star', n=5),
    10005: dict(name='Turbo Abuela', hue_set=272, sat=0.85, val=1.05, tint=(205, 190, 255), tk=0.35,
                outline=(55, 25, 90), aura=[(200, 165, 255), (245, 235, 255)], shape='dot', n=7),
    10006: dict(name='Tom', hue_set=245, hue_in=(170, 260), sat=1.5, val=0.66, tint=(140, 140, 190), tk=0.35,
                outline=(12, 6, 28), aura=[(255, 55, 90), (255, 150, 170)], shape='plus', n=7),
    10007: dict(name='Lika', hue=92, sat=1.1, val=1.0, tint=(200, 255, 200), tk=0.15,
                outline=(20, 55, 25), aura=[(190, 80, 225), (240, 170, 255)], shape='dot', n=6),
    10008: dict(name='Jerry', hue_set=335, sat=0.9, val=1.08, tint=(255, 225, 240), tk=0.2,
                outline=(105, 30, 75), aura=[(255, 160, 215), (255, 255, 255)], shape='star', n=5),
}


def recolor(rgba, cfg):
    """Recolorea un fotograma (array h×w×4). Devuelve otro array."""
    out = rgba.copy()
    a = rgba[..., 3] > 0
    if not a.any():
        return out
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    outline = a & (mx < 0.27)
    dark = a & ~outline & (mx < 0.42)
    body = a & ~outline
    satpx = body & (sat > 0.22) & ~dark
    lowpx = body & (sat <= 0.22) & ~dark
    # tono / saturación / valor de los saturados
    ys, xs = np.nonzero(satpx)
    for y, x in zip(ys, xs):
        r, g, b = rgb[y, x]
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        hd = h * 360
        if 'hue_in' in cfg:
            lo, hi = cfg['hue_in']
            inr = lo <= hd <= hi
        else:
            inr = True
        if inr:
            if 'hue_set' in cfg:
                hd = cfg['hue_set']
            else:
                hd = (hd + cfg.get('hue', 0)) % 360
            s = min(1.0, s * cfg.get('sat', 1.0))
            v = min(1.0, v * cfg.get('val', 1.0))
        r, g, b = colorsys.hsv_to_rgb(hd / 360.0, s, v)
        out[y, x, :3] = (int(r * 255 + 0.5), int(g * 255 + 0.5), int(b * 255 + 0.5))
    # tinte de los poco saturados (blancos, cremas, grises)
    if 'tint' in cfg and lowpx.any():
        t = np.array(cfg['tint'], np.float32) / 255.0
        k = cfg.get('tk', 0.2)
        px = rgb[lowpx]
        # se tiñe según el brillo: el blanco toma el color del tinte; un gris, más oscuro
        tinted = px * (1 - k) + (t * mx[lowpx][:, None]) * k
        out[lowpx, :3] = np.clip(tinted * 255 + 0.5, 0, 255).astype(np.uint8)
    # oscuros que no son contorno (pelo negro, sombras): color del personaje por su brillo
    if 'dark' in cfg and dark.any():
        d = np.array(cfg['dark'], np.float32) / 255.0
        k = cfg.get('dk', 0.8)
        px = rgb[dark]
        lum = (mx[dark] / 0.42)[:, None]
        tinted = px * (1 - k) + (d * (0.45 + 0.55 * lum)) * k
        out[dark, :3] = np.clip(tinted * 255 + 0.5, 0, 255).astype(np.uint8)
    # luces un poco más claras (el cuarto más brillante del cuerpo)
    o = out[..., :3].astype(np.float32)
    omx = o.max(axis=2)
    if body.any():
        th = np.percentile(omx[body], 75)
        hi = body & (omx >= th)
        o[hi] = np.minimum(255, o[hi] * 1.08 + 6)
        out[..., :3] = o.astype(np.uint8)
    # contorno teñido
    if 'outline' in cfg and outline.any():
        oc = np.array(cfg['outline'], np.float32)
        lum = (mx[outline] / 0.27)[:, None]
        out[outline, :3] = np.clip(oc * (0.55 + 0.45 * lum) + 0.5, 0, 255).astype(np.uint8)
    return out


def dilate(mask, r):
    m = mask.copy()
    for _ in range(r):
        n = m.copy()
        n[1:, :] |= m[:-1, :]
        n[:-1, :] |= m[1:, :]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        m = n
    return m


SHAPES = {
    'dot': [(0, 0)],
    'plus': [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)],
    'star': [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2)],
}


def aura(frame, cfg, seed):
    """Píxeles brillantes alrededor de la silueta (en el borde ampliado). Sólo donde no hay dibujo."""
    h, w = frame.shape[:2]
    a = frame[..., 3] > 0
    if not a.any():
        return frame
    ring = dilate(a, 4) & ~dilate(a, 1)
    ys, xs = np.nonzero(ring)
    if not len(ys):
        return frame
    rnd = random.Random(seed)
    idx = list(range(len(ys)))
    rnd.shuffle(idx)
    vivid, light = cfg['aura']
    placed = 0
    shape = SHAPES[cfg.get('shape', 'dot')]
    taken = np.zeros((h, w), bool)
    for i in idx:
        if placed >= cfg.get('n', 5):
            break
        cy, cx = ys[i], xs[i]
        if taken[max(0, cy - 3):cy + 4, max(0, cx - 3):cx + 4].any():
            continue
        big = rnd.random() < 0.5
        pts = shape if big else [(0, 0)]
        ok = True
        for dx, dy in pts:
            x, y = cx + dx, cy + dy
            if x < 0 or y < 0 or x >= w or y >= h or a[y, x]:
                ok = False
                break
        if not ok:
            continue
        for dx, dy in pts:
            x, y = cx + dx, cy + dy
            center = dx == 0 and dy == 0
            col = light if center else vivid
            frame[y, x, :3] = col
            frame[y, x, 3] = 255 if center or abs(dx) + abs(dy) == 1 else 190
        taken[cy, cx] = True
        placed += 1
    return frame


def build(dex):
    cfg = CFG[dex]
    src = os.path.join(ROOT, 'assets', 'pokemon', str(dex))
    dst_dex = 30000 + dex
    dst = os.path.join(ROOT, 'assets', 'pokemon', str(dst_dex))
    os.makedirs(dst, exist_ok=True)
    meta = json.load(open(os.path.join(src, 'meta.json')))
    out_meta = {'s': 1, 'v': int(time.time()), 'a': {}}
    previews = []
    for anim in ANIMS:
        am = meta['a'][anim]
        im = np.array(Image.open(os.path.join(src, anim + '.png')).convert('RGBA'))
        fw, fh, n = am['w'], am['h'], am['n']
        W, H = fw + 2 * PAD, fh + 2 * PAD
        sheet = np.zeros((H * 8, W * n, 4), np.uint8)
        for row in range(8):
            for col in range(n):
                fr = im[row * fh:(row + 1) * fh, col * fw:(col + 1) * fw]
                big = np.zeros((H, W, 4), np.uint8)
                big[PAD:PAD + fh, PAD:PAD + fw] = recolor(fr, cfg)
                big = aura(big, cfg, seed=dex * 1000 + ANIMS.index(anim) * 100 + row * 10 + col)
                sheet[row * H:(row + 1) * H, col * W:(col + 1) * W] = big
        Image.fromarray(sheet).save(os.path.join(dst, anim + '.png'))
        out_meta['a'][anim] = {'w': W, 'h': H, 'n': n, 'r': 8, 'd': list(am['d']), 'ax': am['ax'] + PAD, 'ay': am['ay'] + PAD}
        previews.append(sheet[0:H, :])            # fila 0 (hacia abajo) de cada animación
    json.dump(out_meta, open(os.path.join(dst, 'meta.json'), 'w'), separators=(',', ':'))
    return out_meta, previews


def main():
    dexes = [int(x) for x in sys.argv[1:]] or sorted(CFG)
    metas = {}
    prev_rows = []
    for dex in dexes:
        m, previews = build(dex)
        metas[30000 + dex] = m
        # vista previa: la fila 0 de cada animación, una al lado de otra, ×3
        w = sum(p.shape[1] for p in previews) + 4 * len(previews)
        h = max(p.shape[0] for p in previews)
        row = np.zeros((h, w, 4), np.uint8)
        row[..., :3] = (40, 44, 64); row[..., 3] = 255
        x = 0
        for p in previews:
            ph, pw = p.shape[:2]
            alpha = p[..., 3:4].astype(np.float32) / 255.0
            row[0:ph, x:x + pw, :3] = (p[..., :3] * alpha + row[0:ph, x:x + pw, :3] * (1 - alpha)).astype(np.uint8)
            x += pw + 4
        prev_rows.append(row)
        print(dex, '->', 30000 + dex, CFG[dex]['name'], 'ok')
    # sprites-awaken.js (la geometría, como sprites-mega.js)
    if not sys.argv[1:]:
        lines = ['/* ============ sprites-awaken.js — GENERADO por tools/custom_sprites/make_awaken.py, no editar a mano ============',
                 ' * Formas despiertas de los personajes originales (data/custom-awaken.js): mismo formato que sprites-meta.js;',
                 ' * su número es 30000 + el del personaje (40001-40008). Hojas en assets/pokemon/{dex}/.',
                 ' */',
                 'Object.assign(G.SPRITE_META, {']
        items = sorted(metas.items())
        for i, (d, m) in enumerate(items):
            lines.append('  %d: %s%s' % (d, json.dumps(m, separators=(',', ':')), ',' if i < len(items) - 1 else ''))
        lines.append('});')
        open(os.path.join(ROOT, 'js', 'data', 'sprites-awaken.js'), 'w').write('\n'.join(lines) + '\n')
        print('js/data/sprites-awaken.js escrito')
    outdir = os.path.join(ROOT, 'tools', 'custom_sprites', 'out_awaken')
    os.makedirs(outdir, exist_ok=True)
    W = max(r.shape[1] for r in prev_rows)
    H = sum(r.shape[0] + 4 for r in prev_rows)
    canvas = np.zeros((H, W, 4), np.uint8)
    canvas[..., :3] = (40, 44, 64); canvas[..., 3] = 255
    y = 0
    for r in prev_rows:
        canvas[y:y + r.shape[0], 0:r.shape[1]] = r
        y += r.shape[0] + 4
    Image.fromarray(canvas).resize((W * 3, H * 3), Image.NEAREST).save(os.path.join(outdir, 'preview.png'))
    print('preview:', os.path.join(outdir, 'preview.png'))


if __name__ == '__main__':
    main()
