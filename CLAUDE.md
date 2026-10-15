# PokéSurvivor — cómo se trabaja y se publica

Normas fijas del dueño del proyecto. Se aplican SIEMPRE.

## 語言（最重要）
- **一律用繁體中文回覆主人**：最後的總結、工作過程中的每一句說明、指令的說明文字，全部都要中文。不可以用英文或西班牙文回覆（程式碼與檔名照原樣即可）。

## 多人協作（主人＋peter，2026-10-15 起）
推送前每次都要做，避免互相蓋掉（詳細步驟見 `docs/dev/MOD-NOTES.md` 的發佈流程）：
1. `git fetch origin`，看 `git log main..origin/main` 對方改了什麼，跟主人說。
2. 先提交自己的改動，再拉最新版本：`git pull origin main`（合併），或 `git rebase origin/main`（只重排自己還沒推的提交）。不 force push、不蓋掉對方的提交。
3. 產生檔（`index.html`、`js/app.min.js`、`version.json`）衝突時不手動合併：取任一邊後重新跑下面第 2 步的建置。
4. 不要自己覆蓋或還原對方的檔案；跟主人的決定衝突時，先問主人。
5. 合併後測試沒有錯誤才推送。

## Publicar una versión
1. Se edita `dev.html` (nunca `index.html`, que se genera).
2. `node tools/build.js --sin-seo && node tools/export_data.js`
   - `build.js` genera `index.html`, `js/app.min.js` y **`version.json`** (la huella de esta versión).
   - **No ejecutar `tools/make_seo_pages.py`** ni `build.js` sin `--sin-seo`：會把原作者的捐款頁（`apoyar/`、`en/support/`）和舊網域的 SEO 頁重新產生出來（主人已決定不要）。
3. Commit (sin "Co-Authored-By" ni ninguna firma de IA) y `git push origin main` sólo cuando el dueño lo pida.
   - 本專案的更新日誌寫在 `js/data/modnews.js`（繁中／英文）。

## Actualización automática de los jugadores (obligatorio)
Al publicar, todos los jugadores deben pasar a la versión nueva sin perder nada
(`js/core/updater.js`, mira `version.json` cada 5 min):
- **Fuera de partida** (menú, sala de cooperativo incluida): aviso de 5 s y la página se recarga.
  Si está en el gacha, la tienda de mejoras, los ajustes o escribiendo en un campo, espera a que termine.
- **En partida**: no se toca. Al acabar, la run se guarda como siempre y, al volver al menú, se recarga.
- Antes de recargar se sube a la nube lo pendiente.
No quitar `updater.js` ni la escritura de `version.json` en `tools/build.js`.

## Novedades (changelog)
Cada cambio de juego o arreglo de fallos va también en `js/data/changelog.js`
(español e inglés, en `new` / `chg` / `fix` de la fecha de hoy). Los cambios de
servidores, base de datos o costes NO van ahí.

## Servidores
- Firebase: proyecto **pokesurvivor-free** (autenticación normal: cuentas gratis sin límite).
  **Nunca** activar "Identity Platform" ni nada que lo active (funciones de bloqueo, MFA,
  "Actualizar para habilitar"): cobra por usuario. El proyecto viejo pokesurvivor-jpter se apaga a final de octubre de 2026.
- Cloudflare (Worker `cloudflare/turn-worker.js`, plan de 5 $): no debe pasar de 5 $ al mes (el TURN tiene tope).
- Mantenimiento: `MAINTENANCE` en `js/main.js` (con `?dev` se puede entrar para probar).
