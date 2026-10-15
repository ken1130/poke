# 已知踩坑紀錄（Known Failures）

改程式前先看一遍，避免同樣的坑再踩一次。每踩到一個新坑就在最下面加一條：
**症狀 → 原因 → 修法 → 以後怎麼避免**。

---

## 1. 區域變數跟外層函式同名 → TDZ 錯誤，效果整個失效（2026-10-15）

- **症狀**：腐蝕酸雨／奈米屌雨沒傷害、沒緩速；李拳的流血也沒作用。遊戲不會跳錯誤視窗，只是效果默默消失（主迴圈 `js/game.js` 會吞掉單一畫格的例外）。
- **原因**：`js/systems/combat.js` 的 `tickDots` 在迴圈裡寫了 `let alive = false;`，但同一個區塊前面又呼叫外層的 `alive(e)` 函式。JS 的 `let` 在宣告前就已經「佔住」名字（暫時性死區 TDZ），所以 `alive(e)` 直接丟出 `ReferenceError: Cannot access 'alive' before initialization`，整段中毒／緩速／流血結算都沒跑。
- **修法**：區域變數改名為 `keep`。
- **以後怎麼避免**：
  - 函式裡新增 `let`／`const` 前，先搜尋同檔案有沒有同名的外層函式或變數（`alive`、`hit`、`dist`、`row`、`stat` 這類常見名字特別注意）。
  - 效果「沒作用」時，第一步先開瀏覽器主控台看有沒有 `[Game] fallo en un fotograma` 錯誤。

## 2. 工作目錄被轉成 CRLF 換行（2026-10-15）

- **症狀**：`git status` 顯示一百多個檔案「有改動」，但 `git diff -w` 幾乎沒有內容。
- **原因**：Windows 端的工具把整個專案轉成 CRLF，repo 裡存的是 LF。
- **以後怎麼避免**：
  - 提交時**只加自己改的檔案**，並用 `git -c core.autocrlf=input add <檔案>` 轉回 LF，不要 `git add -A`，否則會產生一個改動全部檔案的大提交，也會跟 peter 的改動大量衝突。
  - 用腳本改檔案時要注意換行：比對字串要用 `\r\n`，或先判斷檔案是哪一種換行。

## 3. WSL 裡沒有 node（2026-10-15）

- **症狀**：`node tools/build.js` 找不到指令。
- **處理**：下載官方 node 壓縮檔解到暫存目錄再用，不必安裝到系統。無頭瀏覽器測試（playwright 的 chromium）缺 `libnss3`、`libnspr4`、`libasound2` 時，用 `apt-get download` 下載 .deb，`dpkg -x` 解開，再設定 `LD_LIBRARY_PATH` 即可，不需要 sudo。
- **測試存檔**：沒登入時 `G.DB.save` 是空的，測試腳本要先呼叫 `G.DB.playAsGuest()` 才能開局。

## 4. 翻譯句型被較短的句型搶先套用（2026-10-15）

- **症狀**：蛋孵化訊息顯示成「El 蛋 ha eclosionado! ¡皮丘加入了你！」，一半西班牙文。
- **原因**：`js/core/i18n.js` 的 `{x}` 句型是照「加入順序」比對，先找到的就用。`'¡{x} se une a ti!'` 的 `{x}` 能吃下任何字，所以把整句 `'¡El huevo ha eclosionado! ¡{x} se une a ti!'` 也吃掉了。
- **修法**：句型改成依「固定文字長度」由長到短排序，越具體的越優先。
- **以後怎麼避免**：新增含 `{x}` 的翻譯後，可以跑一次全句型檢查（每個西班牙文句型丟進 `G.I18n.f`，確認翻出來的是自己的譯文）。

## 5. 無頭瀏覽器測試：開局會停在選卡（2026-10-15）

- **症狀**：測試腳本 `G.Game.startRun()` 後 `G.Game.state` 一直是 `'choice'`，遊戲不動。
- **原因**：開局會先跳「祝福卡」（`#boon-cards`），升級也會跳選卡，不點的話遊戲是暫停的。
- **以後怎麼避免**：測試腳本用 `setInterval` 自動點掉可見的 `#boon-cards .card`／`#lvl-cards .card`／`#item-cards .card`，等 `state === 'playing'` 再開始測。

## 6. WSL 的 git 推不上去、提交沒有作者（2026-10-15）

- **症狀**：`git push` 出現 `could not read Username for 'https://github.com'`；`git commit` 出現 `Author identity unknown`。
- **原因**：GitHub 登入資訊和 git 作者設定都在 Windows 那邊，WSL 裡的 git 沒有。
- **處理**：推送改用 Windows 的 `git.exe push origin main`（在 WSL 裡也能直接執行）；提交用 `git -c user.name=ken1130 -c user.email=<主人的信箱> commit ...`。
- **換行**：這份專案已設定 `git config core.autocrlf input`，Windows 換行（CRLF）不會再被當成改動。
