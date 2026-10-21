#!/usr/bin/env python3
"""Formas «despiertas» de los personajes originales (2026-10-21).

A partir de las hojas de assets/pokemon/{dex}/ (dex 10001-10008) genera las de la forma despierta
en assets/pokemon/{30000+dex}/ (40001-40008), con el mismo número y orden de fotogramas:
  · cada fotograma se amplía PAD px por cada lado (para que quepa el aura) y el ancla se mueve igual;
  · recoloreado por personaje (giro de tono / tono fijo / tinte de los píxeles poco saturados), un poco
    más de brillo en las luces y el contorno (los píxeles muy oscuros) teñido con el color del personaje;
  · un aura de píxeles brillantes alrededor de la silueta, distinta en cada fotograma (parpadea al animar);
  · un ACCESORIO distintivo por personaje (corona, cuernos, capa, alas, cola de fuego...), dibujado a mano en
    píxeles (ACC más abajo) y compuesto en cada fotograma de cada animación, anclado al cuerpo: los de la cabeza
    van delante, centrados en la coronilla (la primera fila ancha de la silueta); capa/alas/cola van DETRÁS del
    cuerpo (se pintan primero). Las filas 5-7 (mirando a la izquierda) son espejo de las demás, así que los
    accesorios asimétricos (capa, cola) se voltean en ellas. Los que tienen varios cuadros (llama, alas, gotas)
    cambian con el índice del fotograma.
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
PAD = 4   # margen por defecto; cada personaje puede ampliarlo (CFG 'pad': [x, arriba, abajo]) para que quepa su accesorio
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
                outline=(45, 25, 80), aura=[(255, 214, 80), (255, 248, 200)], shape='star', n=5, pad=(4, 8, 4)),
    10002: dict(name='Pollito', hue=-16, sat=1.15, val=1.08, tint=(255, 250, 220), tk=0.15,
                outline=(120, 55, 10), aura=[(120, 230, 255), (255, 255, 255)], shape='plus', n=6, pad=(4, 8, 4)),
    10003: dict(name='Didi', hue_set=205, sat=1.0, val=1.08, tint=(150, 205, 255), tk=0.5,
                outline=(25, 45, 100), aura=[(110, 185, 255), (225, 242, 255)], shape='dot', n=6, pad=(8, 8, 4)),
    10004: dict(name='Heroe', hue=42, hue_in=(280, 360), sat=1.55, val=0.97, tint=(255, 235, 200), tk=0.1,
                outline=(95, 15, 25), aura=[(255, 200, 60), (255, 120, 40)], shape='star', n=5, pad=(4, 4, 4)),
    10005: dict(name='Turbo Abuela', hue_set=272, sat=0.85, val=1.05, tint=(205, 190, 255), tk=0.35,
                outline=(55, 25, 90), aura=[(200, 165, 255), (245, 235, 255)], shape='dot', n=7, pad=(4, 6, 4)),
    10006: dict(name='Tom', hue_set=245, hue_in=(170, 260), sat=1.5, val=0.66, tint=(140, 140, 190), tk=0.35,
                outline=(12, 6, 28), aura=[(255, 55, 90), (255, 150, 170)], shape='plus', n=7, pad=(4, 8, 4)),
    10007: dict(name='Lika', hue=92, sat=1.1, val=1.0, tint=(200, 255, 200), tk=0.15,
                outline=(20, 55, 25), aura=[(190, 80, 225), (240, 170, 255)], shape='dot', n=6, pad=(4, 8, 4)),
    10008: dict(name='Jerry', hue_set=335, sat=0.9, val=1.08, tint=(255, 225, 240), tk=0.2,
                outline=(105, 30, 75), aura=[(255, 160, 215), (255, 255, 255)], shape='star', n=5, pad=(4, 4, 4)),
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


# ---------------------------------------------------------------------------------------------------
# Accesorios (pixel art a mano). Cada dibujo es una lista de filas de letras; '.' = transparente; la paleta
# da el color de cada letra. Se le añade solo un contorno de 1 px (4 vecinos) del color `ol`. `hot` es el
# píxel del dibujo que se coloca sobre el ancla (antes de añadir el contorno).
# Un accesorio (ACC[dex]) es una lista de piezas:
#   layer   'front' (delante del cuerpo) | 'back' (detrás: se pinta antes que el cuerpo)
#   frames  [dibujo, ...]  se elige frames[índice del fotograma % len] (parpadeo / aleteo barato)
#   at      'head'  → ancla = (centro de la coronilla, primera fila ancha de la silueta)
#           'body'  → ancla = (x0 + fx·ancho, y0 + fy·alto) de la caja opaca del cuerpo
#   dx, dy  ajuste fijo en píxeles (dx se voltea junto con el dibujo en las filas 5-7)
#   flip    True si el dibujo es asimétrico y debe voltearse en las filas 5-7 (el cuerpo mira a la izquierda)
#   offs    [(dx, dy), ...] desplazamiento extra por índice de fotograma (vaivén de 1 px)
# ---------------------------------------------------------------------------------------------------

def art(rows, pal, ol, hot):
    h, w = len(rows), max(len(r) for r in rows)
    im = np.zeros((h + 2, w + 2, 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.':
                im[y + 1, x + 1, :3] = pal[ch]
                im[y + 1, x + 1, 3] = 255
    a = im[..., 3] > 0
    edge = dilate(a, 1) & ~a
    im[edge, :3] = ol
    im[edge, 3] = 255
    return {'img': im, 'hot': (hot[0] + 1, hot[1] + 1)}


def mirror(d):
    im = d['img'][:, ::-1]
    return {'img': im, 'hot': (im.shape[1] - 1 - d['hot'][0], d['hot'][1])}


def pair(rows_right, pal, ol, gap, hot_y):
    """Dos piezas simétricas (cuernos, alas): el dibujo derecho y su espejo a la izquierda, separados `gap` px.
    El punto caliente queda en el centro del hueco, a la altura hot_y."""
    right = art(rows_right, pal, ol, (0, hot_y))
    left = mirror(right)
    h, w = right['img'].shape[:2]
    im = np.zeros((h, w * 2 + gap, 4), np.uint8)
    im[:, :w] = left['img']
    im[:, w + gap:] = right['img']
    return {'img': im, 'hot': (w + gap // 2, right['hot'][1])}


# --- Panda: corona de hojas de bambú doradas ---
CROWN = art([
    '........G........',
    '...G...GWG...G...',
    '..GWG..GWG..GWG..',
    '..GWG.GGWGG.GWG..',
    '...GGGGGWGGGGG...',
    '....GGGgGgGGG....',
    '....ggggggggg....',
], {'G': (255, 205, 50), 'W': (255, 245, 190), 'g': (200, 140, 20)}, (100, 60, 10), (8, 6))

# --- Pollito: cuernos de rayo (amarillo / cian) ---
BOLT = pair([
    '...YYYY.',
    '..YYYY..',
    '..YYY...',
    '.YYYYY..',
    '..YYYY..',
    '..CYY...',
    '.CCY....',
    'CC......',
], {'Y': (255, 235, 70), 'C': (130, 240, 255)}, (50, 30, 70), 6, 7)

# --- Didi: cuernos de cristal de hielo + gotas de agua ---
ICE = pair([
    '.....B.',
    '....BB.',
    '....BWB',
    '...BWB.',
    '...BWB.',
    '..BWBB.',
    '..BBB..',
    '..BB...',
], {'B': (150, 210, 255), 'W': (235, 248, 255)}, (35, 70, 140), 4, 7)
DROP = art([
    '..B.',
    '.BB.',
    'BWBB',
    'BBBB',
    '.BB.',
], {'B': (110, 185, 255), 'W': (235, 248, 255)}, (30, 60, 130), (2, 2))


# --- Héroe: capa roja (detrás), con vaivén ---
def cape(sway):
    rows = []
    H = 24
    for y in range(H):
        # cuello de 14 px; se abre hacia la izquierda (la espalda: el héroe mira a la derecha en las filas 0-4)
        xl = round(10 - 10 * y / (H - 1)) + (sway if y > 6 else 0)
        xr = round(23 + 3 * y / (H - 1))
        row = ['.'] * 28
        for x in range(max(0, xl), min(28, xr + 1)):
            fold = y > 4 and ((x - xl) % 8 == 5) and y % 7 != 0
            row[x] = 'D' if fold else 'R'
        rows.append(''.join(row))
    last = list(rows[-1])                      # borde inferior con picos
    for x in range(28):
        if x % 5 in (2, 3):
            last[x] = '.'
    rows[-1] = ''.join(last)
    return art(rows, {'R': (215, 35, 45), 'D': (150, 15, 30)}, (80, 5, 15), (16, 0))


CAPE = [cape(0), cape(-1)]

# --- Turbo Abuela: cola de fuego fantasma violeta (detrás), parpadea ---
FPAL = {'P': (165, 105, 255), 'L': (230, 210, 255)}
FLAME_A = art([
    '..........PP..',
    '.........PLP..',
    '.........PLP..',
    '........PLLP..',
    '.......PLLLP..',
    '.......PLLLP..',
    '......PLLLLP..',
    '......PLLLP...',
    '.....PLLLLP...',
    '.....PLLLP..P.',
    '....PLLLLP.PP.',
    '....PLLLP..PLP',
    '...PLLLLP.PLP.',
    '...PLLLPPPLLP.',
    '..PLLLLLLLLP..',
    '..PLLLLLLLP...',
    '.PPLLLLLLP....',
    'PPPLLLLPP.....',
    'PPPPPPPP......',
], FPAL, (60, 30, 110), (2, 18))
FLAME_B = art([
    '..............',
    '........P.....',
    '........PP....',
    '.......PLP....',
    '.......PLLP...',
    '........PLLP..',
    '........PLLP..',
    '.......PLLLP..',
    '......PLLLLP..',
    '......PLLLP.P.',
    '.....PLLLLP.PP',
    '....PLLLLP.PLP',
    '....PLLLP.PLLP',
    '...PLLLLPPPLP.',
    '..PLLLLLLLLP..',
    '..PLLLLLLLP...',
    '.PPLLLLLLP....',
    'PPPLLLLPP.....',
    'PPPPPPPP......',
], FPAL, (60, 30, 110), (2, 18))

# --- Tom: cuernos de diablo negros con la punta roja ---
HORN_TOM = pair([
    '....R.',
    '....RR',
    '....KR',
    '...HK.',
    '..HKK.',
    '.HKK..',
    '.KK...',
], {'K': (55, 50, 70), 'H': (120, 115, 145), 'R': (240, 55, 75)}, (8, 4, 16), 4, 6)

# --- Lika: cuernos verdes que gotean veneno ---
HORN_LIKA = pair([
    '....G.',
    '....GG',
    '....HG',
    '...HG.',
    '..HGG.',
    '.GGG..',
    '.GG...',
], {'G': (95, 220, 85), 'H': (190, 255, 150)}, (20, 70, 30), 4, 6)
PPAL = {'V': (190, 80, 225), 'L': (240, 170, 255)}
POISON_A = art(['V', 'V', 'L'], PPAL, (90, 25, 120), (0, 0))
POISON_B = art(['V', 'V', 'V', 'VL', 'LV'], PPAL, (90, 25, 120), (0, 0))

# --- Jerry: alas de hada rosas (detrás), aletean ---
WING_OPEN = [
    '.......PPP...',
    '.....PPPLLPP.',
    '....PPLLLLLPP',
    '...PPLLLLLLLP',
    '..PPLLLLLLLLP',
    '.PPLLLLLLLLP.',
    'PPLLLLLLLLP..',
    'PLLLLLLLLP...',
    'PPLLLLLLP....',
    '.PPPPPPP.....',
    '.PPLLLPP.....',
    '.PLLLLLPP....',
    '.PLLLLLLP....',
    '..PLLLLLP....',
    '..PPLLLP.....',
    '...PPPP......',
]
WING_FOLD = [
    '.............',
    '.............',
    '......PPP....',
    '....PPPLLP...',
    '...PPLLLLPP..',
    '..PPLLLLLLP..',
    '.PPLLLLLLLP..',
    'PPLLLLLLLP...',
    'PLLLLLLLP....',
    'PPPPPPPP.....',
    '.PPLLLPP.....',
    '.PLLLLLP.....',
    '.PLLLLLP.....',
    '..PLLLP......',
    '..PPPP.......',
    '.............',
]
WPAL = {'P': (255, 165, 220), 'L': (255, 225, 245)}
WINGS = [pair(WING_OPEN, WPAL, (160, 50, 115), 18, 8), pair(WING_FOLD, WPAL, (160, 50, 115), 18, 8)]

ACC = {
    10001: [dict(layer='front', frames=[CROWN], at='head', dx=0, dy=3)],
    10002: [dict(layer='front', frames=[BOLT], at='head', dx=0, dy=3)],
    10003: [dict(layer='front', frames=[ICE], at='head', dx=0, dy=3),
            dict(layer='front', frames=[DROP], at='body', fx=0.0, fy=0.35, dx=-6, dy=0, offs=[(0, 0), (0, 2)]),
            dict(layer='front', frames=[DROP], at='body', fx=1.0, fy=0.55, dx=5, dy=0, offs=[(0, 1), (0, -1)]),
            dict(layer='front', frames=[DROP], at='body', fx=1.0, fy=0.18, dx=7, dy=0, offs=[(0, -1), (0, 1)])],
    10004: [dict(layer='back', frames=CAPE, at='body', fx=0.5, fy=0.3, dx=2, dy=0, flip=True)],
    10005: [dict(layer='back', frames=[FLAME_A, FLAME_B], at='body', fx=1.0, fy=0.85, dx=-6, dy=0, flip=True)],
    10006: [dict(layer='front', frames=[HORN_TOM], at='head', dx=0, dy=3)],
    10007: [dict(layer='front', frames=[HORN_LIKA], at='body', fx=0.3, fy=0.0, dx=0, dy=3),    # la cabeza del Lika está arriba a la izquierda
            dict(layer='front', frames=[POISON_A, POISON_B], at='body', fx=0.3, fy=0.0, dx=-8, dy=2),
            dict(layer='front', frames=[POISON_B, POISON_A], at='body', fx=0.3, fy=0.0, dx=8, dy=3)],
    10008: [dict(layer='back', frames=WINGS, at='body', fx=0.5, fy=0.3, dx=0, dy=2)],
}


def body_box(a):
    """Caja opaca (x0, y0, x1, y1 inclusive) y coronilla (hx, hy): la primera fila que mide al menos el 30 % del
    ancho de la caja (así el mechón del Pollito no cuenta) y la x media de las 3 filas siguientes."""
    ys, xs = np.nonzero(a)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w = x1 - x0 + 1
    hy = y0
    for y in range(y0, y1 + 1):
        if a[y].sum() >= max(3, 0.3 * w):
            hy = y
            break
    sy, sx = np.nonzero(a[hy:hy + 3])
    hx = int(round(sx.mean())) if len(sx) else (x0 + x1) // 2
    return (x0, y0, x1, y1), (hx, hy)


def blit(dst, piece, x, y):
    """Pinta piece['img'] con su punto caliente en (x, y); recorta a los bordes."""
    im = piece['img']
    hx, hy = piece['hot']
    H, W = dst.shape[:2]
    h, w = im.shape[:2]
    ox, oy = x - hx, y - hy
    for yy in range(h):
        ty = oy + yy
        if ty < 0 or ty >= H:
            continue
        for xx in range(w):
            tx = ox + xx
            if tx < 0 or tx >= W or im[yy, xx, 3] == 0:
                continue
            dst[ty, tx] = im[yy, xx]


def accessories(body, dex, row, col, layer):
    """Devuelve una capa (mismo tamaño que `body`, transparente) con las piezas de `layer` ancladas al cuerpo
    (`body`: fotograma recoloreado, sin aura). `row` 5-7 = el cuerpo mira a la izquierda."""
    out = np.zeros_like(body)
    a = body[..., 3] > 0
    if not a.any() or dex not in ACC:
        return out
    (x0, y0, x1, y1), (hx, hy) = body_box(a)
    left = row in (5, 6, 7)
    for pc in ACC[dex]:
        if pc['layer'] != layer:
            continue
        piece = pc['frames'][col % len(pc['frames'])]
        dx, dy = pc.get('dx', 0), pc.get('dy', 0)
        if pc.get('offs'):
            ox, oy = pc['offs'][col % len(pc['offs'])]
            dx += ox
            dy += oy
        if pc['at'] == 'head':
            x, y = hx, hy
        else:
            fx = pc.get('fx', 0.5)
            if left:
                fx = 1 - fx
            x = int(round(x0 + fx * (x1 - x0)))
            y = int(round(y0 + pc.get('fy', 0.5) * (y1 - y0)))
        if left:
            dx = -dx
            if pc.get('flip'):
                piece = mirror(piece)
        blit(out, piece, x + dx, y + dy)
    return out


def compose(body, dex, row, col):
    """detrás → cuerpo → delante."""
    back = accessories(body, dex, row, col, 'back')
    front = accessories(body, dex, row, col, 'front')
    out = back.copy()
    for layer in (body, front):
        m = layer[..., 3] > 0
        out[m] = layer[m]
    return out


def build(dex):
    cfg = CFG[dex]
    px, pt, pb = cfg.get('pad', (PAD, PAD, PAD))
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
        W, H = fw + 2 * px, fh + pt + pb
        sheet = np.zeros((H * 8, W * n, 4), np.uint8)
        for row in range(8):
            for col in range(n):
                fr = im[row * fh:(row + 1) * fh, col * fw:(col + 1) * fw]
                body = np.zeros((H, W, 4), np.uint8)
                body[pt:pt + fh, px:px + fw] = recolor(fr, cfg)
                big = compose(body, dex, row, col)
                big = aura(big, cfg, seed=dex * 1000 + ANIMS.index(anim) * 100 + row * 10 + col)
                sheet[row * H:(row + 1) * H, col * W:(col + 1) * W] = big
        Image.fromarray(sheet).save(os.path.join(dst, anim + '.png'))
        out_meta['a'][anim] = {'w': W, 'h': H, 'n': n, 'r': 8, 'd': list(am['d']), 'ax': am['ax'] + px, 'ay': am['ay'] + pt}
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
