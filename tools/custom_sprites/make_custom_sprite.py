"""把貼圖做成遊戲（SpriteCollab 格式）的動畫表：8 列方向 × N 影格，外加 meta。"""
import sys, os, json, time
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from scipy import ndimage

DIRS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]   # Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft
ANIMS = {   # (pose, 往面向方向位移 px, 往上位移 px, 持續 1/60 秒)
    'Idle':   [('idle', 0, 0, 70), ('blink', 0, 0, 8)],
    'Walk':   [('idle', 0, 0, 7), ('walk1', 0, 1, 7), ('idle', 0, 0, 7), ('walk2', 0, 1, 7)],
    'Attack': [('idle', 0, 0, 4), ('attack', 2, 0, 5), ('attack', 5, 0, 8), ('idle', 0, 0, 5)],
    'Shoot':  [('idle', 0, 0, 5), ('shoot', 1, 0, 6), ('shoot', 3, 0, 10), ('idle', 0, 0, 5)],
    'Charge': [('charge', 0, 0, 8), ('charge', 0, 1, 8), ('charge', 0, 0, 8), ('charge', 0, -1, 8)],
    'Hurt':   [('hurt', -2, 0, 12), ('hurt', -1, 0, 12)],
    'Faint':  [('hurt', -1, 0, 10), ('faint', 0, 0, 40)],
}

def crop_alpha(a):
    ys, xs = np.where(a[..., 3] > 0)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

def keep_main(img):
    mask = img[..., 3] > 0
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n <= 1: return img
    sizes = ndimage.sum(mask, lab, range(1, n + 1)); main = 1 + int(np.argmax(sizes))
    img = img.copy(); img[lab != main] = 0
    return img

def load_pixel(path, grid, keep_all=False):
    im = np.array(Image.open(path).convert('RGBA'))
    H, W = im.shape[:2]; cs = W / grid
    idx = [int((i + 0.5) * cs) for i in range(grid)]
    out = im[np.ix_(idx, idx)].copy()
    out[..., 3] = np.where(out[..., 3] > 127, 255, 0)
    out[out[..., 3] == 0] = 0
    if not keep_all: out = keep_main(out)
    return crop_alpha(out)

def load_smooth(path, height, colors, athr=127, thick=1, boost=None, outline=0, keep_all=False):
    im = np.array(Image.open(path).convert('RGBA'))
    mask = im[..., 3] > 40
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    main = 1 + int(np.argmax(sizes))
    if keep_all: im[~np.isin(lab, 1 + np.where(sizes >= sizes.max() * 0.01)[0])] = 0   # 分開的手腳也留著（只清小雜點）
    else: im[lab != main] = 0
    im = crop_alpha(im)
    if thick > 1:   # 縮圖前把深色線條加粗，細的五官才不會消失
        rgb = Image.fromarray(np.where(im[..., 3:4] > 0, im[..., :3], 255).astype(np.uint8), 'RGB').filter(ImageFilter.MinFilter(thick))
        im = im.copy(); im[..., :3] = np.array(rgb)
    # 預乘 alpha 再縮，避免邊緣出現黑邊
    f = im.astype(np.float32); a = f[..., 3:4] / 255
    pre = np.concatenate([f[..., :3] * a, f[..., 3:4]], axis=2)
    h0, w0 = im.shape[:2]; w = max(1, round(w0 * height / h0))
    small = np.array(Image.fromarray(pre.astype(np.uint8)).resize((w, height), Image.LANCZOS)).astype(np.float32)
    a2 = small[..., 3:4] / 255
    rgb = np.clip(small[..., :3] / np.maximum(a2, 1e-3), 0, 255)
    alpha = np.where(small[..., 3] > athr, 255, 0).astype(np.uint8)
    # 顏色減到少數幾色，邊緣變硬，比較像像素畫
    rgbimg = Image.fromarray(rgb.astype(np.uint8), 'RGB')
    if boost:   # 照片顏色偏灰：[對比, 飽和, 亮度]
        rgbimg = ImageEnhance.Contrast(rgbimg).enhance(boost[0])
        rgbimg = ImageEnhance.Color(rgbimg).enhance(boost[1])
        rgbimg = ImageEnhance.Brightness(rgbimg).enhance(boost[2])
    q = rgbimg.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    out = np.dstack([np.array(q), alpha]); out[alpha == 0] = 0
    if outline: out = add_outline(out, outline)
    return crop_alpha(out)

def add_outline(img, k):
    """外面加 1 像素深色外框（取相鄰像素顏色 × k），像原作的像素寶可夢。"""
    img = np.pad(img, ((1, 1), (1, 1), (0, 0)))
    m = img[..., 3] > 0
    ring = ndimage.binary_dilation(m, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])) & ~m
    out = img.copy()
    for y, x in zip(*np.where(ring)):
        nb = img[max(0, y - 1):y + 2, max(0, x - 1):x + 2].reshape(-1, 4)
        nb = nb[nb[:, 3] > 0][:, :3].astype(float)
        out[y, x, :3] = (nb.min(axis=0) * k).astype(np.uint8); out[y, x, 3] = 255
    return out

def make_back(img, erode):
    """背面：輪廓留著，內部填成身體的主色（把臉蓋掉）。"""
    a = img[..., 3] > 0
    inner = ndimage.binary_erosion(a, iterations=erode)
    if not inner.any(): return img.copy()
    px = img[inner][:, :3]
    bright = px[px.max(axis=1) > 90]
    if len(bright): px = bright
    cols = np.unique(px, axis=0)
    best, body = -1, cols[0]
    for c in cols:
        same = inner & np.all(img[..., :3] == c, axis=2)
        lab, n = ndimage.label(same)
        if n == 0: continue
        big = ndimage.sum(same, lab, range(1, n + 1)).max()
        if big > best: best, body = big, c
    out = img.copy(); out[inner, :3] = body
    return out

def mirror(img): return img[:, ::-1].copy()

def place(canvas, img, x, y):
    h, w = img.shape[:2]
    H, W = canvas.shape[:2]
    x0, y0 = max(0, x), max(0, y); x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0: return
    src = img[y0 - y:y1 - y, x0 - x:x1 - x]
    dst = canvas[y0:y1, x0:x1]
    m = src[..., 3] > 0
    dst[m] = src[m]

def main(cfg_path):
    cfg = json.load(open(cfg_path))
    out = cfg['out']; os.makedirs(out, exist_ok=True)
    poses = {}
    for key, fname in cfg['poses'].items():
        p = os.path.join(cfg['src'], fname + '.png')
        img = load_pixel(p, cfg['grid'], key in cfg.get('keep_all', [])) if cfg['mode'] == 'pixel' else load_smooth(p, cfg.get('heights', {}).get(key, cfg['height']), cfg.get('colors', 10), cfg.get('alpha', 127), cfg.get('thickens', {}).get(key, cfg.get('thicken', 1)), cfg.get('boost'), cfg.get('outline', 0), key in cfg.get('keep_all', []))
        for col in cfg.get('strip', {}).get(key, []):
            near = (np.abs(img[..., :3].astype(int) - np.array(col)).max(axis=2) < 40) & (img[..., 3] > 0)
            img[near] = 0; img = crop_alpha(keep_main(img))
        if key == 'faint' and cfg.get('faint_rotate'):
            img = np.rot90(img, k=-1).copy()     # 躺下
        poses[key] = img
    erode = cfg.get('erode', 2)
    variants = {}
    for key, img in poses.items():
        if cfg.get('face_left'): img = mirror(img)   # 原圖臉朝左：先翻成朝右
        back = make_back(img, erode) if cfg.get('back', True) else img
        variants[key] = [img, img, img, back, back, mirror(back), mirror(img), mirror(img)]
    maxw = max(v.shape[1] for vs in variants.values() for v in vs)
    maxh = max(v.shape[0] for vs in variants.values() for v in vs)
    M = cfg.get('margin', 6)
    fw, fh = maxw + 2 * M, maxh + 2 * M
    fw += fw % 2; fh += fh % 2
    feet = fh - M           # 腳底那一列的下緣
    ax, ay = fw / 2 - 0.5, feet - 0.5
    meta = {'s': cfg.get('shadow', 1), 'v': int(time.time()), 'a': {}}
    previews = []
    anims = dict(ANIMS)
    if 'blink' not in poses: anims['Idle'] = [('idle', 0, 0, 60), ('idle', 0, 1, 12)]
    for k, fr in cfg.get('anims', {}).items(): anims[k] = [tuple(f) for f in fr]   # 設定檔自訂某個動畫的影格
    for anim, frames in anims.items():
        n = len(frames)
        sheet = np.zeros((8 * fh, n * fw, 4), np.uint8)
        for row, (dx, dy) in enumerate(DIRS):
            for fi, (pose, fwd, up, dur) in enumerate(frames):
                img = variants[pose][row]
                h, w = img.shape[:2]
                x = fi * fw + (fw - w) // 2 + fwd * dx
                y = row * fh + feet - h + fwd * dy - up
                place(sheet, img, x, y)
        Image.fromarray(sheet).save(os.path.join(out, anim + '.png'))
        meta['a'][anim] = {'w': fw, 'h': fh, 'n': n, 'r': 8, 'd': [f[3] for f in frames], 'ax': ax, 'ay': ay}
        previews.append((anim, sheet))
    json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
    # 預覽：每個動畫的第 0 列（朝下）所有影格，加上 Idle 的 8 個方向，放大 3 倍
    k = 3
    rows = [s[:fh] for _, s in previews]
    idle = previews[0][1]
    turn = np.concatenate([idle[r * fh:(r + 1) * fh, :fw] for r in range(8)], axis=1)
    rows.append(turn)
    W = max(r.shape[1] for r in rows); Hs = sum(r.shape[0] for r in rows) + 4 * len(rows)
    pv = np.zeros((Hs, W, 4), np.uint8); pv[..., :3] = 120; pv[..., 3] = 255
    y = 0
    for r in rows:
        place(pv, r, 0, y); y += r.shape[0] + 4
    Image.fromarray(pv).resize((W * k, Hs * k), Image.NEAREST).save(os.path.join(out, 'preview.png'))
    print(cfg['id'], 'frame', fw, 'x', fh, 'anchor', ax, ay, '| poses:', {k: v.shape[:2] for k, v in poses.items()})

if __name__ == '__main__':
    main(sys.argv[1])
