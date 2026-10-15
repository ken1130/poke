/* ============ modnews.js — "Novedades" de esta versión (繁中 / inglés) ============
 * Lo que enseña la ventana de novedades (news-ui.js). La más nueva, primero.
 * Cada texto va ya en su idioma: { zh, en }.
 */
G.MODNEWS = [
  { d: '2026-10-15', title: { zh: '五個新招式、技能寶箱與藥水', en: 'Five new moves, move chests and potions' },
    new: [
      { zh: '技能寶箱：第 4 和第 11 分鐘在每個人附近出現，打開隨機得到 1～4 個技能強化（一場可重抽 15 次，每人最多開 2 箱）', en: 'Move chests: one appears near each player at minutes 4 and 11 and gives 1–4 random move upgrades (15 rerolls per run, up to 2 chests each)' },
      { zh: '藥水：地圖上會隨機出現，效果隨機——變大、變小、狂暴、無敵星星、磁鐵、幸運，也可能是壞藥水', en: 'Potions: they appear around the map with a random effect — giant, tiny, fury, star, magnet, lucky… or a bad one' },
      { zh: '右上角小地圖：顯示技能寶箱、藥水、寶箱、祭壇、泉水、頭目、裂縫與隊友', en: 'Minimap (top right): move chests, potions, chests, altars, springs, bosses, rifts and teammates' },
      { zh: '毒系新招「腐蝕酸雨」：以自己為中心下毒雨，中毒＋緩速，升級後留下會擴散的毒水窪；進化「奈米屌雨」', en: 'New Poison move “Corrosive Rain”: poison rain around you that poisons and slows, later leaving spreading puddles; evolves into “Nano Rain”' },
      { zh: '格鬥系新招「李家拳」：快速單體連拳，每幾拳必定暴擊，滿級暴擊會流鼻血；進化「家暴神拳」打 12 隻', en: 'New Fighting move “Lee Fist”: fast single-target punches with a guaranteed crit every few hits, crits make enemies bleed at max level; evolves into “Fury Fist” (hits 12)' },
      { zh: '一般系新被動「歐美肥佬」：依寶可夢體型獲得護甲與減傷；進化「俠客歐尼爾」力場讓一般敵人碰不到你', en: 'New Normal passive “Heavyweight”: armor and damage reduction based on your Pokémon’s size; evolves into “Shaq”, a force field normal enemies cannot get through' },
      { zh: '幽靈系新招「幽冥矛」：射出穿透的矛；進化「暗影神槍」8 方向射出，穿透時分裂', en: 'New Ghost move “Spectral Spear”: piercing spears; evolves into “Shadow Lance”, 8 directions that split when piercing' },
      { zh: '草系新招「大自然的洗禮」：大樹從天而降砸向敵人；進化「樹~倒~囉~」一次砸 12 棵、木刺與藤蔓禁錮', en: 'New Grass move “Nature’s Baptism”: trees fall from the sky onto enemies; evolves into “Timber!” with up to 12 trees, spikes and rooting vines' }
    ],
    chg: [
      { zh: '冒險模式結算畫面新增「下一關」與「再挑戰」按鈕', en: 'Adventure results: new “Next stage” and “Retry” buttons' },
      { zh: '組隊時每個人用自己的經驗值與經驗加成各自升級', en: 'In groups, everyone levels up with their own XP and XP bonus' },
      { zh: '連線更順：位置改走不會互相卡住的快速通道，掉一個封包不再讓後面的全部卡住；隊友和敵人的移動預測改用對方的時間計算，比較不會抖動', en: 'Smoother online play: positions now use a fast channel where one lost packet no longer holds up the rest, and teammate/enemy movement prediction uses the sender’s clock so it jitters less' }
    ],
    fix: [
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
