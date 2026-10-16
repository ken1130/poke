# 自訂角色精靈圖產生器

把一組貼圖做成遊戲用的動畫表（8 列方向 × N 影格的 PNG，加 meta）。

用法（在專案根目錄）：

    uv run --with pillow,numpy,scipy --python 3.12 --no-project python -I tools/custom_sprites/make_custom_sprite.py tools/custom_sprites/chick.json

- 設定檔裡 `src` 是原始貼圖資料夾（不進 git：貼圖有版權），`poses` 指定每個姿勢用哪一張（檔名不含 .png）。
- `mode`：`pixel`（原圖是像素畫，`grid` 是幾格）或 `smooth`（一般圖，`height` 是縮到幾像素高，`colors` 是壓成幾色）。
- `keep_all`：這些姿勢不清掉分離的小塊（例如倒下的光環）；`strip`：某姿勢要去掉接近哪些顏色的像素。
- 產出到 `out`：Idle、Walk、Attack、Shoot、Charge、Hurt、Faint 七張 + `meta.json` + `preview.png`（預覽，不用進 git）。
- `meta.json` 的內容貼進 `js/data/custom.js` 該角色的 `sprite` 欄位。
