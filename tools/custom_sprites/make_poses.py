"""只有「平常」和「倒地」兩張圖時，自動補出其他姿勢，再交給 make_custom_sprite.py。

用法（在專案根目錄）：
    uv run --with pillow,numpy,scipy --python 3.12 --no-project python -I tools/custom_sprites/make_poses.py <idle 圖> <倒地圖> <輸出資料夾> [集氣光色 RRGGBB] [--white]

- 圖要是去背過的 PNG（透明背景）；加 --white 則把「跟邊緣相連的白色」當背景去掉（白底卡通圖用）。
- 輸出：idle、blink、walk1、walk2、attack、shoot、charge、hurt、faint（.png），檔名就是姿勢名。
  走路＝左右擺動、攻擊＝往前壓扁、發射＝拉長、集氣＝外圈發光（屬性色）、受傷＝後仰泛紅、眨眼＝稍微壓低。
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

def load(path, white=False):
    im = np.array(Image.open(path).convert('RGBA'))
    if white:   # 跟邊框相連的近白色 → 透明（眼白被黑線包住，不會被清掉）
        near = (im[..., :3].min(axis=2) > 232) | (im[..., 3] < 20)
        lab, n = ndimage.label(near)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        bg = np.isin(lab, list(edge))
        im[bg] = 0
    im[im[..., 3] < 40] = 0
    ys, xs = np.where(im[..., 3] > 0)
    return Image.fromarray(im[ys.min():ys.max() + 1, xs.min():xs.max() + 1])

def pad(img, k=0.25):
    w, h = img.size; p = int(max(w, h) * k)
    c = Image.new('RGBA', (w + 2 * p, h + 2 * p)); c.paste(img, (p, p)); return c

def rot(img, deg):
    return pad(img).rotate(deg, resample=Image.BICUBIC, expand=False)

def scale(img, sx, sy):
    w, h = img.size; return img.resize((max(1, round(w * sx)), max(1, round(h * sy))), Image.LANCZOS)

def tint(img, rgb, k):
    a = np.array(img).astype(np.float32)
    a[..., :3] = a[..., :3] * (1 - k) + np.array(rgb, np.float32) * k
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))

def glow(img, rgb, k=0.045):
    """外圈加一層屬性色的光（兩層：亮色貼身、外層稍暗）。"""
    big = pad(img, 0.15); a = np.array(big)
    m = a[..., 3] > 40
    r = max(2, int(max(big.size) * k))
    outer = ndimage.binary_dilation(m, iterations=r) & ~m
    inner = ndimage.binary_dilation(m, iterations=max(1, r // 2)) & ~m
    out = a.copy()
    out[outer] = [int(c * 0.7) for c in rgb] + [255]
    out[inner] = list(rgb) + [255]
    out[m] = a[m]
    return Image.fromarray(out)

def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    white = '--white' in sys.argv
    idle_p, faint_p, out = args[:3]
    col = tuple(int(args[3][i:i + 2], 16) for i in (0, 2, 4)) if len(args) > 3 else (255, 220, 120)
    os.makedirs(out, exist_ok=True)
    idle = load(idle_p, white); faint = load(faint_p, white)
    poses = {
        'idle': idle,
        'blink': scale(idle, 1.03, 0.97),
        'walk1': rot(idle, 7),
        'walk2': rot(idle, -7),
        'attack': rot(scale(idle, 1.12, 0.9), -10),
        'shoot': scale(idle, 0.94, 1.07),
        'charge': glow(scale(idle, 1.04, 0.96), col),
        'hurt': tint(rot(scale(idle, 0.96, 1.0), 14), (255, 70, 70), 0.35),
        'faint': faint,
    }
    for k, v in poses.items(): v.save(os.path.join(out, k + '.png'))
    print('ok', out, {k: v.size for k, v in poses.items()})

if __name__ == '__main__':
    main()
