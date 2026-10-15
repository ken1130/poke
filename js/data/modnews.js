/* ============ modnews.js — "Novedades" de esta versión (繁中 / inglés) ============
 * Lo que enseña la ventana de novedades (news-ui.js). La más nueva, primero.
 * Cada texto va ya en su idioma: { zh, en }.
 */
G.MODNEWS = [
  { d: '2026-10-15', title: { zh: '迷宮大更新：新招式、技能光碟、迷宮事件、夥伴與樓梯', en: 'Big dungeon update: new moves, move discs, dungeon events, partners and stairs' },
    new: [
      { zh: '卡克隆商店改成安全屋：走進去怪物進不來、不會受傷，自動跳出購物選單，按「購買」用這場的金幣買；每樣商品也能按「偷走」，卡克隆會暴怒追殺你', en: 'Kecleon’s shop is now a safe house: enemies can’t get in and you take no damage; a shop menu opens — press “Buy” to pay with this run’s coins, or “Steal” and Kecleon goes berserk' },
      { zh: '卡克隆的幸運輪盤：在商店選單裡，押這場金幣的 25%／50%／全部，結果可能歸零、×0.5、持平、×1.5、×2、×3，或大獎 ×5（每間店 3 次）', en: 'Kecleon’s Lucky Roulette: from the shop menu, bet 25%/50%/all of this run’s coins — you might lose it all, get ×0.5, break even, ×1.5, ×2, ×3 or the ×5 jackpot (3 spins per shop)' },
      { zh: '神秘房間不一定是怪物屋：也可能是寶藏房、治癒房或陷阱房', en: 'Mystery rooms aren’t always Monster Houses: they can also be treasure, healing or trap rooms' },
      { zh: '畫面左上顯示這場賺到的金幣；點金幣、攜帶道具、藥水、祝福、蛋、夥伴、遺物、增益都能看說明', en: 'Your run coins are shown top-left; tap coins, your held item, potions, blessings, the egg, your partner, relics or buffs to see what they do' },
      { zh: '一般模式開場祝福：開局從 3 個隨機祝福選 1 個（禮物光碟、開局夥伴、經驗 +30%、從 3 級開始、開局道具、傷害 +20%、速度 +15%、重抽 +3、復活種子、煉金術士、血量 +40）', en: 'Normal mode opening blessing: pick 1 of 3 random boons at the start (gift disc, starting partner, +30% XP, start at Lv 3, starting item, +20% damage, +15% speed, +3 rerolls, Revive Seed, Alchemist, +40 HP)' },
      { zh: '一般模式里程碑：撐過 10／20／30 分鐘各有獎勵（技能光碟／道具＋扭蛋券／十連扭蛋券＋金幣）', en: 'Normal mode milestones: rewards for surviving 10/20/30 minutes (move disc / item + ticket / ×10 ticket + coins)' },
      { zh: '冒險模式困難版：三星通關後解鎖，敵人血量 ×1.8、傷害 ×1.4，通關得第 4 顆星（粉紅色）和十連扭蛋券；每區館主最後一隻必掉道具', en: 'Adventure Hard: unlocked after 3 stars, enemies ×1.8 HP and ×1.4 damage, clearing it gives a pink 4th star and a ×10 ticket; each region’s final leader always drops an item' },
      { zh: '組隊名單顯示每位隊友的連線方式與延遲（直連／中繼、毫秒）', en: 'The group list shows each teammate’s connection type and latency (direct/relay, ms)' },
      { zh: '圖鑑可依屬性篩選（彩色屬性按鈕，跨所有地區），搜尋框也能直接打屬性名稱，例如「火」', en: 'Pokédex type filter (colored type chips, across all regions); you can also type a type name in the search box, e.g. “fire”' },
      { zh: '無盡塔：每 5 層三選一「遺物」，整座塔都有效（吸血、雙子火球、獵人之眼、永恆之芽、引爆器等 8 種）', en: 'Endless Tower: every 5 floors pick 1 of 3 relics that last the whole climb (lifesteal, twin fireballs, hunter’s eye, revive, detonator and more — 8 in all)' },
      { zh: '每日挑戰連續天數：連續 3／7／14／30 天有扭蛋券與稱號', en: 'Daily challenge streaks: tickets and titles at 3, 7, 14 and 30 days in a row' },
      { zh: '每週挑戰新增 4 種規則：只能一個攻擊、精英週、疾速惡魔、孤注一擲（從下週開始輪替）', en: 'Four new weekly rules: one attack only, elite week, speed demons, all or nothing (in rotation from next week)' },
      { zh: '傳說連戰可選難度：普通／困難／極難，越難獎勵越多，各難度分開記錄', en: 'Legend Rush difficulty tiers: normal, hard, very hard — harder means bigger rewards, with a separate record per tier' },
      { zh: '搞笑事件：鯉魚王大遷徙（30 隻只會亂跳、打了掉金幣）、卡比獸睡在路中間把怪彈開、呆呆獸被打要過 2.5 秒才反應、怪物會冒出吐槽對話泡泡', en: 'Funny events: the Great Magikarp Migration (30 that only flop and drop coins), a sleeping Snorlax that bounces enemies away, Slowpoke reacting 2.5 s late, and enemies saying silly things in speech bubbles' },
      { zh: '搞笑藥水：大頭症（頭超大＋暴擊）、顛倒（方向相反 8 秒）、迪斯可派對（周圍敵人跳舞變超慢）；卡克隆會說「歡迎光臨」，被偷時大喊「小偷！！給我站住！！」', en: 'Funny potions: Big Head (huge + crit), Reversed (controls flipped 8 s), Disco Party (nearby enemies dance and slow down); Kecleon greets you and yells “THIEF! GET BACK HERE!”' },
      { zh: '下樓梯有獎勵：到新樓層回復 30% 血量，並送一片不佔額度的技能光碟；越深扭蛋券越常掉、精英怪越常掉道具；結算畫面顯示最深樓層', en: 'Stairs are now worth it: each new floor heals 30% and gives a bonus move disc (doesn’t count toward the 3); deeper floors drop more tickets and elites drop more items; the results screen shows your deepest floor' },
      { zh: '寶可夢蛋可孵出約 500 種寶可夢的初始型態（不含傳說與幻之寶可夢，越常見越容易出）；夥伴會自己升級（每打倒 25 隻 +1 級），Lv.10、Lv.20 進化並變強', en: 'Eggs can hatch about 500 first-stage Pokémon (no legendaries or mythicals; common ones more often); partners level up (1 level per 25 defeated) and evolve at Lv.10 and Lv.20' },
      { zh: '卡克隆商店擴充到 12 種商品、每間隨機擺 4 個：新增技能光碟、招式學習器、能力藥、體力藥、復活種子、扭蛋券、寶可夢蛋', en: 'Kecleon Shop now has 12 kinds of wares, 4 random per shop: new move disc, TM, Protein, HP Up, Revive Seed, gacha ticket and Pokémon Egg' },
      { zh: '技能光碟開啟視窗改用像素美術的光碟', en: 'The move disc window now uses the pixel-art disc' },
      { zh: '第一次遇到光碟、藥水、蛋、怪物屋、商店、雕像、樓梯、精英怪、合體技時，會跳出簡短說明', en: 'Short tips the first time you meet move discs, potions, eggs, Monster Houses, shops, statues, stairs, elites and combo attacks' },
      { zh: '新成就分類「迷宮」：大獎光碟、怪物屋、打倒暴怒卡克隆、抵達 B3F／B5F／B10F、孵蛋、異色夥伴、精英怪、合體技（含新稱號）', en: 'New “Dungeon” achievements: jackpot discs, Monster Houses, beating furious Kecleon, reaching B3F/B5F/B10F, hatching, shiny partners, elites and combos (with new titles)' },
      { zh: '遊戲改名為「寶可夢迷宮倖存者」', en: 'The game is now called “Pokémon Dungeon Survivors”' },
      { zh: '怪物屋：小地圖上的「？」神秘房間，走進去會湧出大量怪物，撐過 30 秒或全部打倒就有大獎', en: 'Monster House: the “?” room on the minimap — step in, a horde appears; survive 30 s or clear it for big loot' },
      { zh: '卡克隆商店：用這場的金幣買藥水、道具、技能強化；沒錢硬拿就是偷，卡克隆會變成頭目追殺你（強度跟著時間和等級成長），打贏全店免費', en: 'Kecleon Shop: spend this run’s coins on potions, items and upgrades; take something without paying and Kecleon becomes a boss (scales with time and level) — beat it and the shop is free' },
      { zh: '下一層樓梯：從第 5 分鐘起每 5 分鐘出現，全員站上 2 秒就進入新地圖與下一個生態（B2F、B3F…），每層敵人血量 +15%、經驗與金幣 +20%（只在一般模式）', en: 'Next-floor stairs: from minute 5, every 5 minutes; everyone stands on them for 2 s to go down to a new map and biome (B2F, B3F…). Each floor gives enemies +15% HP and +20% XP and coins (normal mode only)' },
      { zh: '組隊合體技：靠近隊友會集氣，滿了按 F（手機按按鈕）在兩人中間發動大爆炸', en: 'Co-op combo attack: stay close to a teammate to charge it, then press F (or the button on mobile) for a huge blast between you two' },
      { zh: '寶可夢蛋：第 6 分鐘在每個人附近出現自己的蛋，打倒 120 隻後孵化，寶寶夥伴會跟著你自動攻擊（1/20 機率異色）', en: 'Pokémon Egg: at minute 6 each player gets their own egg; after 120 defeated it hatches into a baby partner that follows you and attacks (1/20 shiny)' },
      { zh: '精英怪：第 2 分鐘起偶爾出現更大更強的精英怪（迅捷、護盾、分裂、瞬移），打倒掉更多經驗，有機率掉道具', en: 'Elite enemies: from minute 2, bigger and tougher elites sometimes appear (Swift, Shield, Splitter, Blink) and drop extra XP and sometimes an item' },
      { zh: '新增 6 種攜帶道具：達人帶、焦點鏡、光粉、王者之證、進化奇石、漂浮氣球', en: 'Six new held items: Expert Belt, Scope Lens, Bright Powder, King’s Rock, Eviolite and Air Balloon' },
      { zh: '凹凸頭盔的反傷改成隨攻擊力成長，後期不再無感', en: 'Rocky Helmet’s recoil damage now grows with your attack, so it stays useful late in a run' },
      { zh: '神秘雕像：摸了之後全隊得到 3 分鐘的祝福，或有代價也有好處的詛咒', en: 'Mystery Statue: touch it for a 3-minute team blessing — or a curse with an upside' },
      { zh: '技能光碟：第 4、9、15 分鐘在每個人附近出現（一場 3 片），打開隨機得到 1～4 個技能強化（一場可重抽 3 次）。組隊時每人有自己的光碟，只有自己看得到、撿得到', en: 'Move discs: one appears near each player at minutes 4, 9 and 15 (3 per run) and gives 1–4 random move upgrades (3 rerolls per run). In groups each player has their own discs: only you can see and pick up yours' },
      { zh: '藥水：地圖上會隨機出現，效果隨機——變大、變小、狂暴、無敵星星、磁鐵、幸運，也可能是壞藥水（組隊時也是各自的）', en: 'Potions: they appear around the map with a random effect — giant, tiny, fury, star, magnet, lucky… or a bad one (each player gets their own)' },
      { zh: '開技能光碟有特效：光碟旋轉後一張一張翻出來，3 個發金光、4 個是彩虹大獎；地上的光碟有青藍色光柱，畫面外會有箭頭指路', en: 'Opening a move disc is now an event: it spins and the upgrades come out one by one — 3 glow gold, 4 is a rainbow jackpot; discs on the map have a cyan light beam and an arrow points to them when off-screen' },
      { zh: '右上角小地圖：有地形、看得懂的圖示（技能光碟、藥水、上鎖寶箱、祭壇、泉水、裂縫、頭目、隊友），下方列出距離與方向', en: 'Minimap (top right) with terrain and clear icons (move discs, potions, locked chests, altars, springs, rifts, bosses, teammates), plus distance and direction below it' },
      { zh: '點目前的招式或被動技，可以看它的效果、等級和下一級強化', en: 'Tap your current move or a passive to see what it does, its level and its next upgrade' },
      { zh: '毒系新招「腐蝕酸雨」：以自己為中心下毒雨，中毒＋緩速，升級後留下會擴散的毒水窪；進化「奈米屌雨」', en: 'New Poison move “Corrosive Rain”: poison rain around you that poisons and slows, later leaving spreading puddles; evolves into “Nano Rain”' },
      { zh: '格鬥系新招「李家拳」：快速單體連拳，每幾拳必定暴擊，滿級暴擊會流鼻血；進化「家暴神拳」打 12 隻', en: 'New Fighting move “Lee Fist”: fast single-target punches with a guaranteed crit every few hits, crits make enemies bleed at max level; evolves into “Fury Fist” (hits 12)' },
      { zh: '一般系新被動「歐美肥佬」：依寶可夢體型獲得護甲與減傷；進化「俠客歐尼爾」力場讓一般敵人碰不到你', en: 'New Normal passive “Heavyweight”: armor and damage reduction based on your Pokémon’s size; evolves into “Shaq”, a force field normal enemies cannot get through' },
      { zh: '幽靈系新招「幽冥矛」：射出穿透的矛；進化「暗影神槍」8 方向射出，穿透時分裂', en: 'New Ghost move “Spectral Spear”: piercing spears; evolves into “Shadow Lance”, 8 directions that split when piercing' },
      { zh: '草系新招「大自然的洗禮」：大樹從天而降砸向敵人；進化「樹~倒~囉~」一次砸 12 棵、木刺與藤蔓禁錮', en: 'New Grass move “Nature’s Baptism”: trees fall from the sky onto enemies; evolves into “Timber!” with up to 12 trees, spikes and rooting vines' }
    ],
    chg: [
      { zh: '安全屋更安全：有人在裡面時附近的怪物會被嚇跑、不會圍在外面；離開時卡克隆放出衝擊波彈開周圍的怪，並給 3 秒無敵', en: 'Safer safe house: while someone is inside, nearby enemies get scared off instead of waiting around it; when you leave, Kecleon’s shockwave knocks back nearby enemies and you get 3 s of invincibility' },
      { zh: '連線再優化：敵人資料只傳有變動的部分（訊息約小 70%，怪多時比較不會卡），隊友和敵人的移動改用平滑插值，網路不穩時抖動更少', en: 'Smoother online play: enemy updates now only send what changed (messages about 70% smaller, fewer hitches with big hordes), and teammates and enemies are smoothly interpolated, jittering less on unstable connections' },
      { zh: '招式欄上方的招式名稱改成深色底＋亮色字，更清楚', en: 'The move name above your move bar now has a dark backing and brighter text so it’s easier to read' },
      { zh: '冒險模式的關卡比較短：技能光碟、寶可夢蛋、怪物屋、商店、雕像會依關卡長度平均出現，短關卡也拿得到', en: 'Adventure stages are shorter, so move discs, eggs, Monster Houses, shops and statues are now spread across each stage’s length' },
      { zh: '美術統一：小地圖圖示、怪物屋邊界（符文石圈）、技能光碟光柱都改成像素風格', en: 'Art pass: minimap icons, the Monster House border (a ring of rune stones) and the move disc light beam are now pixel art' },
      { zh: '手機橫向畫面：小地圖縮小、清單只列 3 項，不再擋到畫面', en: 'Phones in landscape: smaller minimap and a 3-item list so it no longer covers the screen' },
      { zh: '房間畫面重新排版：隊員放上面，組隊／PK、模式、場景、頭目和異色集中在「玩法設定」卡片，卡片變小不用一直往下捲', en: 'Room screen redesigned: players on top, and team/PK, mode, scene, boss and shiny grouped in a “How to play” card; smaller cards so you don’t have to scroll' },
      { zh: '關於頁精簡，移除外部連結與捐款按鈕', en: 'Simpler About screen; external links and donation buttons removed' },
      { zh: '升級選卡的重抽改成每場免費 15 次（強化商店買的另外加上去）', en: 'Level-up card rerolls: 15 free per run (plus the ones bought in Upgrades)' },
      { zh: '招式平衡：水砲、冰凍光束、加農光炮、幻象光線傷害 ×1.5；毒針、污泥攻擊、骨頭回力鏢、替身、鬼火傷害 ×1.3', en: 'Move balance: Hydro Pump, Ice Beam, Flash Cannon and Psybeam deal ×1.5 damage; Poison Sting, Sludge, Bonemerang, Substitute and Will-O-Wisp ×1.3' },
      { zh: '電擊、噴射火焰、熱風、重踏、彗星拳進化後明顯變強（原本進化幾乎沒加傷害）', en: 'Thunder Shock, Flamethrower, Heat Wave, Bulldoze and Meteor Mash now get much stronger when they evolve (they barely improved before)' },
      { zh: '冒險模式結算畫面新增「下一關」與「再挑戰」按鈕', en: 'Adventure results: new “Next stage” and “Retry” buttons' },
      { zh: '組隊時每個人用自己的經驗值與經驗加成各自升級', en: 'In groups, everyone levels up with their own XP and XP bonus' },
      { zh: '連線更順：位置改走不會互相卡住的快速通道，掉一個封包不再讓後面的全部卡住；隊友和敵人的移動預測改用對方的時間計算，比較不會抖動', en: 'Smoother online play: positions now use a fast channel where one lost packet no longer holds up the rest, and teammate/enemy movement prediction uses the sender’s clock so it jitters less' }
    ],
    fix: [
      { zh: '修正升級選卡畫面在說明很長時卡片擠到左邊', en: 'Fixed level-up cards sticking to the left when a description was long' },
      { zh: '被動技（火焰盾、歐美肥佬、進化後的吸血鬼之牙）一直有效，招式欄上標示「被動」，不能也不需要點選', en: 'Passive moves (Flame Shield, Heavyweight, evolved Vampire Fang) are always on: they show “Passive” in the move bar and can no longer be selected' },
      { zh: '修正組隊時按暫停不會真的暫停：現在任何人按暫停，全隊都會停下，畫面會顯示誰按了暫停', en: 'Fixed pause not pausing in groups: now when anyone pauses, the game stops for the whole group and shows who paused' }
    ]
  },
  { d: '2026-10-14', title: { zh: '冒險模式、挑戰大更新', en: 'Adventure & challenges update' },
    new: [
      { zh: '冒險模式：8 個地區 24 關，道館館主、火箭隊、四天王與冠軍，每關最多 3 顆星（可組隊）', en: 'Adventure: 8 regions, 24 stages with Gym Leaders, Team Rocket, the Elite Four and the Champion; up to 3 stars per stage (co-op too)' },
      { zh: '挑戰：每日挑戰、每週挑戰（每週一種特殊規則）、無盡塔、傳說連戰，都有排行榜', en: 'Challenges: daily, weekly (a special rule each week), endless tower and legend rush, with leaderboards' },
      { zh: '挑戰也能組隊玩，有獨立的組隊排行榜（房間的「玩法」選單）', en: 'Challenges can be played in a group, with their own group leaderboards (room “Play” menu)' },
      { zh: '對局中進化：Lv.10、20、30 進化變強（設定裡可關閉）', en: 'Evolve during runs at Lv 10, 20 and 30 (can be turned off in Settings)' },
      { zh: '組隊團體戰頭目：2 人以上每 5 分鐘出現，打倒全隊得 ×10 扭蛋券', en: 'Raid boss in groups of 2+: every 5 minutes, beat it for a ×10 ticket' },
      { zh: '圖鑑任務：每隻寶可夢 3 個任務，全部完成可得異色', en: 'Pokédex challenges: 3 per Pokémon, finish them all for its shiny' },
      { zh: '團隊 PK（可自己選紅隊／藍隊）、PK 倒下後觀戰', en: 'Team PvP (pick red or blue) and spectating after you fall' },
      { zh: '第一次玩各模式時會有簡短提示', en: 'Short tips the first time you play each mode' }
    ],
    chg: [
      { zh: '主選單重新整理成兩欄；「遊戲模式」改為「自訂規則」，只影響「開始遊戲」', en: 'Main menu in two columns; “Game modes” is now “Custom rules” and only affects “Play”' },
      { zh: '開局前 3 分鐘敵人比較弱，沒升級也比較好上手', en: 'Enemies are weaker during the first 3 minutes, easier without upgrades' },
      { zh: '連線更順：每秒傳送 20 次並預測隊友移動', en: 'Smoother online play: 20 updates per second and movement prediction' },
      { zh: '手機版：冒險地圖的「開始遊戲」固定在下方、挑戰按鈕改橫排、遊玩時螢幕不會自動變暗', en: 'Mobile: the Adventure “Play” button stays visible, challenge buttons in a row, the screen no longer dims while playing' }
    ],
    fix: [
      { zh: '組隊升級、選羈絆、選道具時全隊暫停，等所有人選完才繼續；超過 25 秒會自動選擇', en: 'In groups, the game now pauses for everyone while anyone picks cards, bonds or items; auto-pick after 25 s' },
      { zh: '修正組隊時選完技能仍顯示「對方正在選擇」而卡住的問題', en: 'Fixed the group getting stuck on “X is choosing…” after everyone had picked' },
      { zh: '冒險地圖新增「和朋友一起玩這關」按鈕', en: 'Adventure map: new “With friends” button' },
      { zh: '房間「玩法」改成按鈕；冒險模式用地圖挑關卡（看得到星星和過關條件），朋友也看得到', en: 'Room “Play” is now buttons; Adventure stages are picked on the map with stars and goals, visible to everyone' },
      { zh: '房間可「複製邀請連結」，朋友點連結就直接進房；手機上「開始遊戲」固定在下方', en: 'Rooms: “Copy link” — friends open it and join directly; the start button stays visible on mobile' },
      { zh: '扭蛋拉霸機的文字變清楚了', en: 'Sharper text on the gacha slot machine' },
      { zh: '修正多個組隊與關卡結算的問題', en: 'Fixed several co-op and stage result issues' }
    ] },
  { d: '2026-10-13', title: { zh: '和朋友一起玩', en: 'Play with friends' },
    new: [
      { zh: '邀請碼房間：組隊或 PK、房內選場景與模式', en: 'Invite-code rooms: co-op or PvP, pick the scene and modes in the room' },
      { zh: '快捷訊息（電腦按 T、手機點 💬）、組隊 MVP、每日挑戰排行榜', en: 'Quick chat (T on PC, 💬 on mobile), group MVP and daily leaderboard' },
      { zh: '新招式：火焰盾、落雷、吸血鬼之牙、念力追噬箭；頭目新招式', en: 'New moves: flame shield, lightning, vampire fang, psychic arrows; new boss attacks' },
      { zh: '雲端存檔（綁定 Google）、存檔匯出／匯入', en: 'Cloud saves (Google), save export / import' }
    ] }
];
