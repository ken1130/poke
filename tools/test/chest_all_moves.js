/*
 * chest_all_moves.js — 每一招（非被動、非輔助）在「附近只有寶箱、沒有敵人」時會不會自動打寶箱。
 *
 * 用法（先在專案根目錄開伺服器：python3 -m http.server 8791）：
 *   node tools/test/chest_all_moves.js            → 全部招式（Nv5 與進化後），距離 70 與 180 px
 *   ENEMIES=1 node tools/test/chest_all_moves.js  → 另外檢查：有敵人時仍先打敵人
 *   ONLY=ember,lee-fist node tools/test/chest_all_moves.js → 只測這幾招
 * 環境變數：URL（預設 http://localhost:8791/dev.html?dev）、PW（playwright-core 路徑）、CHROME、PAGES（同時開幾頁）
 */
const PW = process.env.PW || '/tmp/claude-1000/-mnt-c-Users-user-Desktop-poke/35da4a8c-1178-4812-b045-25d9258365d6/scratchpad/pw/node_modules/playwright-core';
const { chromium } = require(PW);
const URL = process.env.URL || 'http://localhost:8791/dev.html?dev';
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const PAGES = +(process.env.PAGES || 6);
const SECS = +(process.env.SECS || 3.5);
const ENEMIES = !!process.env.ENEMIES;

// 不會主動攻擊的種類（被動／輔助／增益），不要求打寶箱。
const SKIP_KINDS = new Set(['support', 'buff', 'bulk', 'flameshield']);

async function boot(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.errs = [];
  p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.G && G.DB && G.Game, null, { timeout: 60000 });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    G.DB.playAsGuest(); const s = G.DB.save; s.owned[25] = { at: 1 }; s.partner = 25;
    G.Game.startRun();
    // 開場祝福、升級選卡、道具、技能光碟：自動點掉
    setInterval(() => {
      const boon = [...document.querySelectorAll('#boon-cards .card')].filter(c => c.offsetParent);
      if (boon.length) { (boon[2] || boon[0]).click(); return; }
      const cs = [...document.querySelectorAll('#cards .card, #item-cards .card, .card')].filter(c => c.offsetParent);
      if (cs.length) cs[0].click();
      for (const id of ['sbox-chest', 'sbox-ok']) { const e = document.getElementById(id); if (e && e.offsetParent) e.click(); }
    }, 150);
    for (let i = 0; i < 200 && G.Game.state !== 'playing'; i++) await new Promise(r => setTimeout(r, 100));
    G.Spawner.update = () => {};
    window.__keep = false;
    setInterval(() => { if (!window.__keep) G.EnemyMgr.clear(); }, 16);
    const pl = G.Game.player; pl.god = true; pl.maxHp = pl.hp = 1e9; pl.speed = 0;
  });
  return p;
}

/** Corre en la página: un movimiento, un cofre a `dist` px. */
async function runCase(p, id, evo, dist, withEnemy) {
  return p.evaluate(async ({ id, evo, dist, withEnemy, SECS }) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 100 && G.Game.state !== 'playing'; i++) await sleep(100);
    const pl = G.Game.player;
    pl.god = true; pl.hp = pl.maxHp; pl.dead = false; pl.sleepT = 0;
    G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields && G.Combat.clearFields();
    pl.moves.length = 0; pl.slots.length = 0; pl.active = 0;
    if (!pl.addMove(id)) return { err: 'addMove' };
    const m = pl.moves[0];
    while (G.Moves.levelUp(m)) {}
    if (evo && !G.Moves.evolve(m)) return { err: 'noevo' };
    if (G.Moves.isPassive(m)) return { passive: true, kind: m.kind };
    // Órbita: el cofre en el círculo de los orbes. Rastro (charcos donde pisas): pegado al cofre.
    if (m.kind === 'orbit') dist = Math.round(m.radius);
    if (m.kind === 'trail') dist = Math.round(pl.r + 14);
    // Busca un cofre (o roca, convertida en cofre) lejos del último sitio para no repetir.
    window.__used = window.__used || new Set();
    let chest = null;
    for (let R = 600; R < 6000 && !chest; R += 600) {
      const cands = G.World.propsInCircle(pl.x, pl.y, R).filter(q => q.solid && q.destructible && !__used.has(q.id))
        .sort((a, b) => (b.type === 'chest') - (a.type === 'chest'));
      for (const q of cands) {
        // Sitio libre para el jugador a `dist` px del cofre.
        for (let k = 0; k < 16; k++) {
          const a = k / 16 * Math.PI * 2, x = q.x + Math.cos(a) * dist, y = q.y + Math.sin(a) * dist;
          if (!G.World.isFree(x, y, 14)) continue;
          // Camino libre entre el jugador y el cofre (que un árbol no tape los disparos).
          let clear = true;
          for (let s = 0.1; s < 0.9 && clear; s += 0.05) {
            const b = G.World.projectileBlock(x + (q.x - x) * s, y + (q.y - y) * s, 6);
            if (b && b !== q) clear = false;
          }
          if (clear) { chest = q; pl.x = x; pl.y = y; break; }
        }
        if (chest) break;
      }
    }
    if (!chest) return { err: 'nochest' };
    __used.add(chest.id);
    // Que sólo este cuente: los demás objetos de alrededor dejan de ser rompibles.
    for (const q of G.World.propsInCircle(chest.x, chest.y, 700)) if (q !== chest) q.destructible = false;
    chest.type = 'chest'; chest.hp = chest.maxHp = 1e8;
    let enemy = null;
    if (withEnemy) {
      window.__keep = true;
      // Enemigo al otro lado del jugador, más cerca que el cofre (50 px): debe ir primero a por él.
      const k = 50 / dist, ex = pl.x + (pl.x - chest.x) * k, ey = pl.y + (pl.y - chest.y) * k;
      enemy = G.Spawner.spawnAt(ex, ey, 0);
      if (enemy) { enemy.maxHp = enemy.hp = 1e8; enemy.speed = 0; enemy.spd = 0; }
    }
    m.t = 0;
    const t0 = G.Game.st.time;
    await sleep(SECS * 1000);
    window.__keep = false;
    const r = { kind: m.kind, chestDmg: Math.round(1e8 - chest.hp), state: G.Game.state, gt: +(G.Game.st.time - t0).toFixed(1) };
    if (enemy) r.enemyDmg = Math.round(1e8 - enemy.hp);
    chest.destructible = false;
    r.dist = dist;
    return r;
  }, { id, evo, dist, withEnemy, SECS });
}

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const pages = await Promise.all(Array.from({ length: PAGES }, () => boot(b)));
  const meta = await pages[0].evaluate(() => G.Moves.ALL.map(d => ({ id: d.id, kind: d.kind, only: d.only || null,
    evo: !!(G.Moves.EVO[d.id] && G.Moves.EVO_MODS[d.kind]) })));
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const jobs = [];
  for (const d of meta) {
    if (SKIP_KINDS.has(d.kind)) continue;
    if (only && !only.has(d.id)) continue;
    for (const evo of d.evo ? [false, true] : [false]) {
      if (ENEMIES) jobs.push({ d, evo, dist: 90, withEnemy: true });
      else for (const dist of [70, 180]) jobs.push({ d, evo, dist, withEnemy: false });
    }
  }
  const res = [];
  let next = 0;
  await Promise.all(pages.map(async p => {
    while (next < jobs.length) {
      const j = jobs[next++];
      let r;
      try { r = await runCase(p, j.d.id, j.evo, j.dist, j.withEnemy); } catch (e) { r = { err: String(e).slice(0, 120) }; }
      res.push({ ...j, r });
      process.stderr.write('.');
    }
  }));
  process.stderr.write('\n');
  // Resumen por movimiento
  const key = j => j.d.id + (j.evo ? '*' : '');
  const by = new Map();
  for (const x of res) { const k = key(x); if (!by.has(k)) by.set(k, { d: x.d, evo: x.evo, cases: [] }); by.get(k).cases.push(x); }
  let fail = 0;
  const rows = [];
  for (const [k, v] of [...by].sort()) {
    if (v.cases.some(c => c.r.passive)) { rows.push(`PASIVO  ${k} (${v.d.kind})`); continue; }
    let ok, txt;
    if (ENEMIES) {
      const c = v.cases[0].r;
      // Minas: estallan cuando las pisan (el enemigo quieto no las pisa); basta con que no vayan al cofre.
      ok = !c.err && (c.enemyDmg > 0 || (v.d.kind === 'mine' && c.chestDmg === 0));
      txt = `enemy=${c.enemyDmg} chest=${c.chestDmg}${c.err ? ' ' + c.err : ''}`;
    } else {
      const near = v.cases.find(c => c.dist === 70).r, far = v.cases.find(c => c.dist === 180).r;
      ok = !near.err && near.chestDmg > 0;
      txt = `70px=${near.err || near.chestDmg} 180px=${far.err || far.chestDmg}`;
    }
    if (!ok) fail++;
    rows.push(`${ok ? 'OK  ' : 'FAIL'}    ${k.padEnd(22)} ${v.d.kind.padEnd(11)} ${v.d.only ? 'only=' + v.d.only + ' ' : ''}${txt}`);
  }
  console.log(rows.join('\n'));
  console.log(`\n${fail} FAIL / ${rows.length}`);
  const errs = pages.flatMap(p => p.errs);
  if (errs.length) console.log('console errors:', JSON.stringify([...new Set(errs)].slice(0, 10)));
  await b.close();
  process.exit(fail ? 1 : 0);
})();
