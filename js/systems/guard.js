/* ============ guard.js — modo «Proteger a Dazhuang» (2026-10-16, tabla V3.1 del dueño) ============
 * G.Modes.run === 'guard'. Dazhuang (un Machamp, DZ_DEX: cambiar aquí si el dueño quiere otro) está
 * en el centro y hay que protegerlo de 50 oleadas:
 *   - Cada oleada: una cantidad fija de un solo Pokémon (cada 3 oleadas, dos) que viene de lejos
 *     a por Dazhuang (enemy.js: `e.goal`; si un jugador se le pone muy cerca, va a por el jugador).
 *   - Cada 5 oleadas sale además un jefe; cada 10, una emboscada a menos de 5 casillas de Dazhuang.
 *     (Las dos cosas se suman a la oleada: hay que vencerlas para acabarla.)
 *   - Al vencer la oleada: Dazhuang se cura entero, lo del suelo vuela hacia vosotros, premio de
 *     monedas y 60 s para prepararse (o «Empezar la oleada» antes).
 *   - Dazhuang cae: se acaba la run. Superar la oleada 50: victoria.
 * Cinco puestos alrededor de Dazhuang (se abren al acercarse; usan el panel de la tienda de Kecleon,
 * #scr-shop, con sus estilos de escritorio y de móvil): objetos, artefacto (cambia cada 5 min),
 * pociones, mascotas y ayudantes (los ayudantes se quedan junto a Dazhuang y disparan), y mejoras
 * de Dazhuang (vida, escudo y su contraataque). Monedas: por derrotado y por oleada.
 *
 * Grupo: lo decide todo el anfitrión (oleadas, enemigos, vida de Dazhuang, ayudantes, artículos)
 * y lo manda en ['gd','s',{...}] varias veces por segundo. Comprar: ['gd','b',clave] al anfitrión,
 * que cobra (las monedas son del grupo) y aplica lo de Dazhuang; lo personal se lo devuelve al
 * comprador en ['gd','g',clave]. «Empezar ya»: ['gd','go'].
 */
G.Guard = (() => {
  // ---------------- números (todo lo ajustable, aquí) ----------------
  const WAVES = 50;              // oleadas para ganar
  const PREP = 60, FIRST_PREP = 25;   // s de preparación (la primera, más corta)
  const BOSS_EVERY = 5, AMBUSH_EVERY = 10;
  const AMBUSH_AT = 12;          // s después de empezar la oleada
  const DZ_DEX = 68;             // Machamp (怪力; 2026-10-19 el dueño: antes Snorlax)
  const DZ_K = 1.6;              // escala del sprite (Machamp es más pequeño que Snorlax)
  const DZ_HP = 1500;            // vida base; × (1 + 0,2 × oleada) × mejoras × grupo
  const DZ_GROW = 0.2;
  const HIT_K = 0.6, HIT_CD = 1.0;  // a Dazhuang le pegan ×0,6 y cada 1 s (sin nadie defendiendo aguanta 12-17 s rodeado)
  const SPAWN_R = [760, 920];    // de dónde vienen (distancia a Dazhuang)
  const AMBUSH_R = [90, 160];    // emboscada: a menos de 5 casillas (160)
  const STALL_R = 170;           // puestos alrededor de Dazhuang
  const OPEN_R = 70, FIGHT_OPEN_R = 38, CLOSE_R = 110;
  const VT = w => 20 + w * 28;   // «minuto» de la run equivalente a la oleada w (la 50 ≈ 24 min)
  const COUNT = w => Math.round(6 + w * 0.8);           // enemigos por oleada (solo; en grupo × scaleRate)
  const AMBUSH_N = w => 5 + Math.floor(w / 5);
  const WAVE_COINS = w => 15 + 3 * w, KILL_COINS = w => 1 + Math.floor(w / 8), START_COINS = 100;
  const HELPER_MAX = 4;
  const UP_MAX = { hp: 8, sh: 5, atk: 8 };
  const POTS = ['heal', 'giant', 'fury', 'star', 'lucky', 'dzheal'];
  const POT_PRICE = { heal: 25, giant: 45, fury: 45, star: 60, lucky: 35, dzheal: 60 };
  const ITEM_PRICE = { 1: 60, 2: 100, 3: 160 }, ART_PRICE = 700, ART_EVERY = 300;
  const EGG_PRICE = 120, CANDY_PRICE = 70, GEAR_K = 1.6;
  const HELP_PRICE = n => 160 + 120 * n;
  const UP_PRICE = { hp: 90, sh: 110, atk: 90 };
  // Copia de spawner.js (no se exportan): resistencia extra, daño y experiencia de los normales.
  const hpK = t => 3.3 + Math.min(1.7, t / 420), DMG_K = 2.4, XP_K = 5.6;

  const on = () => G.Modes.run === 'guard';
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const pm = () => 1 + (S ? S.wave : 0) / 30;               // los precios suben con las oleadas

  let S = null;          // estado (el anfitrión lo decide; los demás, la copia que llega)
  let dzAnim = null, flashT = 0, counterFx = 0;
  const helperAnims = new Map();
  let netT = 0, waveIds = new Set(), spawnQ = [], spawnT = 0, ambushT = null;
  // Rezagados (2026-10-19, «queda 1 y no aparece nunca»): cada STRAY_EVERY s, los que quedan lejos o atascados vienen junto a Dazhuang.
  const STRAY_EVERY = 8, STRAY_FAR = 520, STRAY_MAX = 3;
  let strayT = STRAY_EVERY, strayPos = new Map(), strays = [];

  function reset() {
    S = null; waveIds = new Set(); spawnQ = []; spawnT = 0; ambushT = null; netT = 0; nearK = null; skip = null;
    strayT = STRAY_EVERY; strayPos = new Map(); strays = [];
    helperAnims.clear(); dzAnim = null; flashT = 0;
    closePanel(true); showNext(false);
  }

  /** Al empezar la run (en todos los ordenadores). */
  function begin(pl) {
    if (!on()) return;
    let x = pl.x, y = pl.y - 70;
    for (let i = 0; i < 20 && !G.World.isFree(x, y, 30); i++) { x = pl.x + G.U.rand(-120, 120); y = pl.y + G.U.rand(-140, 0); }
    S = { wave: 0, phase: 'prep', prepT: FIRST_PREP, left: 0, won: false,
          dz: { x, y, r: 30, hp: 1, mhp: 1, sh: 0, msh: 0, dead: false, level: 1, _vx: 0, _vy: 0, bodyH: 60 },
          up: { hp: 0, sh: 0, atk: 0 }, helpers: [], items: [], gear: [], art: null, artT: ART_EVERY };
    stalls();
    G.Sprites.preload([DZ_DEX]);
    dzAnim = new G.Sprites.Animator(DZ_DEX, DZ_K, false);
    if (authority()) {
      recalc(true);
      rollWares();
      S.art = G.Items.rollArt();
      pl.coins = (pl.coins || 0) + START_COINS;
      G.Spawner.say('¡Protege a Dazhuang! La primera oleada llega en 25 s: aprovecha los puestos', 4.2);
    }
    showNext(true);
  }

  /** Los cinco puestos, alrededor de Dazhuang. */
  const KINDS = ['item', 'art', 'pot', 'pet', 'up'];
  function stalls() {
    // En arco a los lados y por debajo de Dazhuang (encima queda su nombre y su barra de vida).
    const ANG = [168, 212, 328, 12, 90];        // grados (y hacia abajo): objetos, artefacto, pociones, mascotas, mejoras
    S.stalls = KINDS.map((k, i) => {
      const a = ANG[i] * Math.PI / 180;
      return { k, x: Math.round(S.dz.x + Math.cos(a) * STALL_R * 1.1), y: Math.round(S.dz.y + Math.sin(a) * STALL_R * 0.75 + (i === 4 ? 30 : 0)) };
    });
  }

  /** Vida y escudo máximos de Dazhuang (al subir de oleada o mejorar). full: lo rellena. */
  function recalc(full) {
    const n = G.Game.everyone().length;
    const old = S.dz.mhp, ratio = old > 1 ? S.dz.hp / old : 1;
    S.dz.mhp = Math.round(DZ_HP * (1 + DZ_GROW * S.wave) * (1 + 0.25 * S.up.hp) * (1 + 0.35 * (n - 1)));
    S.dz.msh = Math.round(S.dz.mhp * 0.12 * S.up.sh);
    S.dz.hp = full ? S.dz.mhp : Math.max(1, Math.round(S.dz.mhp * ratio));
    if (full) S.dz.sh = S.dz.msh;
  }

  function rollWares() {
    const set = new Set();
    for (let i = 0; i < 12 && set.size < 4; i++) set.add(G.Items.roll());
    S.items = [...set];
    S.gear = G.U.pickN(Object.keys(G.Companion.GEAR), 3);
  }

  // ---------------- oleadas (anfitrión) ----------------

  function waveDefs(w) {
    const vt = VT(w), ti = G.Enemies.tierAt(vt), tier = G.Enemies.TIERS[ti];
    const pool = G.Enemies.candidates(tier).filter(p => !G.Sprites.hovers(p.dex) || true);
    const n = w % 3 === 0 ? 2 : 1;
    return G.U.pickN(pool, n).map(p => {
      const d = G.Enemies.defFor(p, tier, ti);
      // Que vengan a por Dazhuang: nada de quedarse lejos disparando, curando o invocando.
      if (!['chase', 'charger', 'tank'].includes(d.behavior)) d.behavior = 'chase';
      return d;
    });
  }

  function mkEnemy(def, x, y, boss) {
    const vt = VT(S.wave), n = G.Game.everyone().length;
    let e;
    if (boss) {
      e = new G.Enemy(def, x, y, G.Modes.scale(Object.assign({}, G.Enemies.bossScale(vt), { hp: G.Enemies.bossScale(vt).hp * G.Coop.scaleHp(n) * (n > 1 ? 1.4 : 1) })), true);
      const floor = Math.round(G.Enemies.bossFloor(vt) * G.Coop.scaleHp(n) * (n > 1 ? 1.4 : 1));
      if (e.maxHp < floor) e.maxHp = e.hp = floor;
      e.dmg *= G.Coop.scaleDmg(n);
      G.GmaxFoe.guardBoss(e, S.wave);   // jefes de oleada Dinamax desde la 10 (gmaxfoe.js)
    } else {
      const sc = G.Enemies.scale(vt);
      e = new G.Enemy(def, x, y, G.Modes.scale(Object.assign({}, sc, { hp: sc.hp * G.Coop.scaleHp(n) * hpK(vt) })));
      e.dmg *= DMG_K * G.Coop.scaleDmg(n); e.xp = Math.round(e.xp * XP_K);
      e.spd = Math.min(e.spd, 92);
      if (vt >= 120 && Math.random() < 0.04) e.makeElite(G.Enemy.rollAffixes(vt));
    }
    e.goal = S.dz;
    G.EnemyMgr.add(e);
    waveIds.add(e.id);
    return e;
  }

  function freeAround(cx, cy, r0, r1, a0, spread) {
    for (let k = 0; k < 12; k++) {
      const a = a0 + G.U.rand(-spread, spread), d = G.U.rand(r0, r1);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9;
      if (G.World.isFree(x, y, 14)) return [x, y];
    }
    return null;
  }

  function startWave() {
    if (!S || S.phase === 'fight' || S.won) return;
    S.wave++;
    S.phase = 'fight';
    recalc(true);
    const w = S.wave, defs = waveDefs(w);
    G.Sprites.preload(defs.map(d => d.dex));
    const total = Math.round(COUNT(w) * G.Coop.scaleRate(G.Game.everyone().length));
    // De uno o dos lados (oleada grande: dos).
    const sides = w >= 8 ? 2 : 1, base = Math.random() * 6.2832;
    spawnQ = [];
    for (let i = 0; i < total; i++) spawnQ.push({ def: defs[i % defs.length], a: base + (i % sides) * Math.PI * G.U.rand(0.7, 1.3) });
    spawnT = 0;
    if (w % BOSS_EVERY === 0) {
      const slot = G.Enemies.BOSS_SLOTS[Math.min(G.Enemies.BOSS_SLOTS.length - 1, Math.floor((w - 1) / 10))];
      const pool = G.DEX.filter(p => !p.leg && p.rarity < 5 && G.SPRITE_META[p.dex] && p.bst >= slot.bst[0] && p.bst <= slot.bst[1]);
      const p = G.U.pick(pool.length ? pool : G.DEX.filter(q => !q.leg && G.SPRITE_META[q.dex] && q.bst >= 500));
      const def = G.Enemies.bossFor(p.dex, slot, 1);
      if (def.behavior === 'ranged') def.behavior = 'chase';
      G.Sprites.preload([def.dex]);
      spawnQ.unshift({ def, a: base + Math.PI, boss: true });
    }
    ambushT = w % AMBUSH_EVERY === 0 ? AMBUSH_AT : null;
    S.ambushDefs = w % AMBUSH_EVERY === 0 ? defs : null;
    G.Spawner.say(G.I18n.f('¡Oleada {x}/{x}!', w, WAVES) + (w % BOSS_EVERY === 0 ? ' · ' + G.T('¡Viene un jefe!') : ''), 3);
    G.Audio.sfx(w % BOSS_EVERY === 0 ? 'boss' : 'surge');
    sendState(true);
  }

  function ambush() {
    const n = Math.round(AMBUSH_N(S.wave) * G.Coop.scaleRate(G.Game.everyone().length));
    const defs = S.ambushDefs || waveDefs(S.wave);
    for (let i = 0; i < n; i++) {
      const pt = freeAround(S.dz.x, S.dz.y, AMBUSH_R[0], AMBUSH_R[1], Math.random() * 6.2832, Math.PI);
      if (!pt) continue;
      const e = mkEnemy(defs[i % defs.length], pt[0], pt[1], false);
      G.FX.burst(e.x, e.y - 10, '#c9a6ff', 10, 140);
    }
    G.FX.ring(S.dz.x, S.dz.y, 10, AMBUSH_R[1] + 20, '#ff5f6d', 0.6, 4);
    G.Spawner.say('¡Emboscada! Han salido junto a Dazhuang', 3);
    G.Audio.sfx('boss');
  }

  function waveCleared() {
    const w = S.wave;
    const pl = G.Game.player;
    pl.coins = (pl.coins || 0) + WAVE_COINS(w);
    G.Pickups.pullAll();                          // lo del suelo, para vosotros
    if (w >= WAVES) { win(); return; }
    S.phase = 'prep'; S.prepT = PREP;
    recalc(true);
    rollWares();
    G.Spawner.say(G.I18n.f('¡Oleada {x} superada! +{x} monedas · {x} s para prepararos', w, WAVE_COINS(w), PREP), 3.6);
    G.Audio.sfx('legend');
    G.FX.ring(S.dz.x, S.dz.y, 10, 140, '#7dffb0', 0.7, 5);
    sendState(true);
  }

  function win() {
    S.phase = 'won'; S.won = true;
    sendState(true);
    G.Spawner.say('¡Has protegido a Dazhuang de las 50 oleadas!', 4);
    setTimeout(() => G.Game.guardEnd && G.Game.guardEnd(true), 1600);
  }
  function lose() {
    if (S.phase === 'lost') return;
    S.phase = 'lost'; S.dz.dead = true;
    sendState(true);
    G.Spawner.say('¡Dazhuang ha caído!', 3);
    G.Audio.sfx('gameover');
    setTimeout(() => G.Game.guardEnd && G.Game.guardEnd(false), 1400);
  }

  /** Anfitrión (o solitario), cada fotograma. */
  function tick(dt, players) {
    if (!on() || !S || !authority()) return;
    const pl = G.Game.player;
    if (S.phase === 'won' || S.phase === 'lost') return;
    // Artefacto del puesto: cambia cada 5 min.
    if ((S.artT -= dt) <= 0) { S.artT = ART_EVERY; S.art = G.Items.rollArt(); sendState(true); }
    if (S.phase === 'prep') {
      if ((S.prepT -= dt) <= 0) startWave();
    } else if (S.phase === 'fight') {
      // Van saliendo en tandas de 4, cada 1,2 s.
      if (spawnQ.length && (spawnT -= dt) <= 0) {
        spawnT = 1.2;
        for (let k = 0; k < 4 && spawnQ.length; k++) {
          const q = spawnQ[0];
          const pt = freeAround(S.dz.x, S.dz.y, SPAWN_R[0], SPAWN_R[1], q.a, 0.5) || freeAround(S.dz.x, S.dz.y, SPAWN_R[0], SPAWN_R[1], Math.random() * 6.2832, 3);
          if (!pt) break;
          spawnQ.shift();
          mkEnemy(q.def, pt[0], pt[1], !!q.boss);
        }
      }
      if (ambushT != null && (ambushT -= dt) <= 0) { ambushT = null; ambush(); }
      // Los que quedan (los que ya no están en la lista han caído: aquí no se recolocan).
      let alive = 0;
      for (const id of waveIds) {
        const e = G.EnemyMgr.get(id);
        if (!e || e.dead) { waveIds.delete(id); pl.coins = (pl.coins || 0) + KILL_COINS(S.wave); continue; }
        alive++;
      }
      S.left = alive + spawnQ.length + (ambushT != null ? Math.round(AMBUSH_N(S.wave)) : 0);
      pullStrays(dt, alive);
      if (!S.left) waveCleared();
    }
    hitDazhuang(dt);
    counter(dt);
    helpers(dt);
    if (S.dz.hp <= 0) lose();
    if ((netT -= dt) <= 0) sendState(false);
  }

  /**
   * Con todos fuera y pocos en pie (≤ STRAY_MAX), cada STRAY_EVERY s: el que está muy lejos de
   * Dazhuang o casi no se ha movido (atascado tras un árbol, agua o una roca) aparece a su lado.
   * La oleada se quedaba sin terminar por uno que nunca llegaba. También se marcan en el borde
   * de la pantalla y en el minimapa (markers → strays).
   */
  function pullStrays(dt, alive) {
    strays = [];
    if (spawnQ.length || ambushT != null || !alive || alive > STRAY_MAX) { strayT = STRAY_EVERY; strayPos.clear(); return; }
    for (const id of waveIds) { const e = G.EnemyMgr.get(id); if (e && !e.dead) strays.push(e); }
    if ((strayT -= dt) > 0) return;
    strayT = STRAY_EVERY;
    for (const e of strays) {
      const last = strayPos.get(e.id);
      const stuck = last && G.U.dist2(last[0], last[1], e.x, e.y) < 40 * 40;
      const far = G.U.dist2(e.x, e.y, S.dz.x, S.dz.y) > STRAY_FAR * STRAY_FAR;
      strayPos.set(e.id, [e.x, e.y]);
      if (!stuck && !far) continue;
      const pt = freeAround(S.dz.x, S.dz.y, 200, 300, Math.random() * 6.2832, Math.PI);
      if (!pt) continue;
      G.FX.burst(e.x, e.y - 10, '#c9a6ff', 8, 120);
      e.x = pt[0]; e.y = pt[1];
      strayPos.set(e.id, [e.x, e.y]);
      G.FX.burst(e.x, e.y - 10, '#c9a6ff', 12, 160);
      G.FX.ring(e.x, e.y, 6, 50, '#c9a6ff', 0.4, 3);
    }
  }

  /** Los enemigos que tocan a Dazhuang le pegan (primero al escudo). */
  function hitDazhuang() {
    const dz = S.dz;
    for (const e of G.EnemyMgr.queryCircle(dz.x, dz.y, dz.r + 70)) {
      if (e.dead || e.remote || e.dmg <= 0 || e.touchCd > 0) continue;
      if (G.U.dist2(e.x, e.y, dz.x, dz.y) > (e.r + dz.r + 4) ** 2) continue;
      e.touchCd = HIT_CD;
      let d = e.dmg * HIT_K;
      if (dz.sh > 0) { const a = Math.min(dz.sh, d); dz.sh -= a; d -= a; }
      dz.hp = Math.max(0, dz.hp - d);
      flashT = 0.12;
      const [nx, ny] = G.U.norm(e.x - dz.x, e.y - dz.y);
      e.kx += nx * 140; e.ky += ny * 140;
      if (G.Camera.sees(dz.x, dz.y, 0)) G.FX.dmgText(dz.x + G.U.rand(-14, 14), dz.y - dz.bodyH - 10, '-' + Math.round(e.dmg * HIT_K), '#ff8a95');
    }
  }

  /**
   * Un golpe en área que cae en (x, y) radio r (jefes Dinamax, gmaxfoe.js): si Dazhuang está dentro,
   * le quita `dmg` (primero al escudo). Sólo quien lleva la partida. ¿Le dio? → true.
   */
  function blast(x, y, r, dmg) {
    const dz = S && S.dz;
    if (!dz || dz.hp <= 0 || (G.Coop.active && !G.Coop.isHost)) return false;
    if (G.U.dist2(dz.x, dz.y, x, y) > (r + dz.r * 0.6) ** 2) return false;
    let d = dmg;
    if (dz.sh > 0) { const a = Math.min(dz.sh, d); dz.sh -= a; d -= a; }
    dz.hp = Math.max(0, dz.hp - d);
    flashT = 0.2;
    if (G.Camera.sees(dz.x, dz.y, 0)) G.FX.dmgText(dz.x, dz.y - dz.bodyH - 14, '-' + Math.round(dmg), '#ff5a6a', true);
    return true;
  }
  /** Dazhuang (para los jefes Dinamax que lo eligen de blanco), o null. */
  const target = () => (S && S.dz && S.dz.hp > 0 ? S.dz : null);

  /** Contraataque de Dazhuang: un pisotón que aparta y daña a los de alrededor. */
  let counterT = 1;
  function counter(dt) {
    if ((counterT -= dt) > 0) return;
    counterT = 1.1;
    const dz = S.dz, R = dz.r + 64 + 6 * S.up.atk;
    const near = G.EnemyMgr.queryCircle(dz.x, dz.y, R).filter(e => !e.dead && !e.remote);
    if (!near.length) return;
    const dmg = (12 + 4 * S.wave) * (1 + 0.35 * S.up.atk);
    for (const e of near.slice(0, 6 + S.up.atk)) e.hurt(dmg, '#ffd27a', e.x - dz.x, e.y - dz.y, e.boss ? 0 : 160);
    stompFx();
    if (G.Coop.active) G.Coop.broadcast(['gd', 'fx']);
  }
  function stompFx() {
    if (!S) return;
    const dz = S.dz, R = dz.r + 64 + 6 * S.up.atk;
    counterFx = 0.3;
    G.FX.ring(dz.x, dz.y, 10, R, '#ffd27a', 0.35, 4);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.2832;
      G.FX.px(dz.x + Math.cos(a) * R * 0.6, dz.y + Math.sin(a) * R * 0.35, i % 2 ? '#e8c890' : '#a07a4a', { vx: Math.cos(a) * 80, vy: -40, life: 0.35 });
    }
  }

  /** Ayudantes: junto a Dazhuang, disparan al enemigo más cercano (los dispara el anfitrión). */
  function helpers(dt) {
    const pl = G.Game.player;
    for (const h of S.helpers) {
      if ((h.cd = (h.cd || 0) - dt) > 0) continue;
      const e = G.Projectiles.nearest(G.EnemyMgr.all(), h.x, h.y, 300);
      if (!e) { h.cd = 0.3; continue; }
      h.cd = 1.0;
      const mon = G.DEX_BY[h.dex], type = (mon && mon.types[0]) || 'normal';
      const a = Math.atan2(e.y - h.y, e.x - h.x), sp = 340;
      G.Projectiles.spawn({
        x: h.x + Math.cos(a) * 8, y: h.y + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        dmg: (16 + 3.5 * S.wave) * (1 + 0.15 * S.up.atk), r: 7, life: 300 / sp + 0.15, pierce: 1,
        color: G.U.TYPE_COLOR[type], hits: new Set(), vis: G.VFX.forType(type), ghost: false, owner: pl, mtype: type
      });
      h.shot = performance.now();
    }
  }

  // ---------------- grupo ----------------

  function pack() {
    return { w: S.wave, ph: S.phase, pt: Math.round(S.prepT * 10) / 10, l: S.left, x: Math.round(S.dz.x), y: Math.round(S.dz.y),
             hp: Math.round(S.dz.hp), mhp: S.dz.mhp, sh: Math.round(S.dz.sh), msh: S.dz.msh, up: S.up,
             hl: S.helpers.map(h => [h.dex, Math.round(h.x), Math.round(h.y)]), it: S.items, gr: S.gear, art: S.art, at: Math.round(S.artT) };
  }
  function sendState(now) {
    if (!G.Coop.active || !G.Coop.isHost || !S) return;
    netT = now ? 0.25 : 0.3;
    G.Coop.broadcast(['gd', 's', pack()]);
  }
  /** Invitado: lo que manda el anfitrión. */
  function onNet(ev) {
    if (!on()) return;
    if (ev[1] === 'fx') { stompFx(); return; }
    if (ev[1] === 'poor') { G.Spawner.say(G.I18n.f('Faltan monedas: cuesta {x}', ev[2]), 2, true); G.Audio.sfx('error'); return; }
    if (ev[1] === 'g') { applyPersonal(G.Game.player, ev[2]); return; }
    if (ev[1] !== 's' || !S) return;
    const d = ev[2];
    if (d.hp < S.dz.hp) flashT = 0.12;
    Object.assign(S, { wave: d.w, phase: d.ph, prepT: d.pt, left: d.l, up: d.up, items: d.it || [], gear: d.gr || [], art: d.art, artT: d.at });
    if (S.dz.x !== d.x || S.dz.y !== d.y) { S.dz.x = d.x; S.dz.y = d.y; stalls(); }
    Object.assign(S.dz, { hp: d.hp, mhp: d.mhp, sh: d.sh, msh: d.msh, dead: d.ph === 'lost' });
    S.helpers = (d.hl || []).map(([dex, x, y]) => ({ dex, x, y }));
    S.won = d.ph === 'won';
  }
  /** Anfitrión: lo que pide un invitado. */
  function onClient(from, ev) {
    if (!on() || !S) return;
    if (ev[1] === 'go') startNow();
    else if (ev[1] === 'b') hostBuy(String(ev[2] || ''), from);
  }

  // ---------------- puestos y artículos ----------------

  const STALL_INFO = {
    item: { name: 'Puesto de objetos', icon: 'choiceband', col: '#ffd23f' },
    art:  { name: 'Puesto de artefactos', icon: 'tank64', col: '#ff9ef0' },
    pot:  { name: 'Puesto de pociones', sprite: 'potion', col: '#ff7ad9' },
    pet:  { name: 'Mascotas y ayudantes', sprite: 'egg', col: '#9fe0b0' },
    up:   { name: 'Mejorar a Dazhuang', icon: 'up', col: '#7fe0ff' }
  };
  const POT_INFO = {
    heal:   { name: 'Poción curativa', desc: 'Recuperas el 60 % de tu vida.', icon: 'berry' },
    giant:  { name: '¡Gigante!', desc: G.Loot.POTIONS.giant.desc, sprite: 'potion' },
    fury:   { name: '¡Furia!', desc: G.Loot.POTIONS.fury.desc, sprite: 'potion' },
    star:   { name: '¡Estrella!', desc: G.Loot.POTIONS.star.desc, sprite: 'potion' },
    lucky:  { name: '¡Suerte!', desc: G.Loot.POTIONS.lucky.desc, sprite: 'potion' },
    dzheal: { name: 'Bocadillo de Dazhuang', desc: 'Dazhuang recupera la mitad de su vida.', icon: 'heart' }
  };
  const UP_INFO = {
    hp:  { name: 'Barriga reforzada', desc: '+25 % de vida máxima para Dazhuang.', icon: 'heart' },
    sh:  { name: 'Escudo de siesta', desc: 'Dazhuang empieza cada oleada con un escudo (+12 % de su vida por nivel).', icon: 'shield' },
    atk: { name: 'Pisotón', desc: 'El contraataque de Dazhuang hace +35 % de daño, llega más lejos y a más enemigos.', icon: 'fist' }
  };

  /** Todos los artículos de un puesto: { key, name, desc, price, icon|sprite|item, tier, host, why } */
  function wares(k, pl) {
    const m = pm(), out = [];
    if (!S) return out;
    if (k === 'item') for (const id of S.items) {
      const it = G.Items.BY[id];
      if (it) out.push({ key: 'item:' + id, name: it.name, desc: it.desc, item: id, tier: it.tier, price: Math.round(ITEM_PRICE[it.tier || 1] * m) });
    }
    if (k === 'art' && S.art && G.Items.BY[S.art]) {
      const it = G.Items.BY[S.art];
      out.push({ key: 'art:' + S.art, name: it.name, desc: it.desc, item: S.art, tier: 4, price: Math.round(ART_PRICE * m),
                 note: G.I18n.f('Cambia en {x}', G.U.mmss(Math.max(0, S.artT))) });
    }
    if (k === 'pot') for (const id of POTS) {
      const p = POT_INFO[id];
      out.push({ key: 'pot:' + id, name: p.name, desc: p.desc, icon: p.icon, sprite: p.sprite, price: Math.round(POT_PRICE[id] * m), host: id === 'dzheal',
                 why: id === 'dzheal' && S.dz.hp >= S.dz.mhp ? 'Dazhuang ya está entero' : null });
    }
    if (k === 'pet') {
      out.push({ key: 'pet:egg', name: 'Huevo de mascota', desc: 'Un huevo que eclosiona al momento: tu mascota te sigue y dispara.', sprite: 'egg',
                 price: Math.round(EGG_PRICE * m), why: pl && (pl.buddy || pl.egg) ? 'Ya tienes mascota' : null });
      out.push({ key: 'pet:candy', name: 'Caramelo Compañero', desc: 'Tu compañero sube 3 niveles (si aún es un huevo, saldrá con ellos).', icon: 'w_pcandy',
                 price: Math.round(CANDY_PRICE * m) });
      for (const g of S.gear) {
        const gi = G.Companion.GEAR[g];
        if (gi) out.push({ key: 'gear:' + g, name: gi.name, desc: gi.desc, icon: gi.icon, tier: gi.tier, price: Math.round(gi.price * GEAR_K * m),
                           why: G.Companion.gear(pl, g) ? 'Equipado' : null });
      }
      out.push({ key: 'help', name: 'Ayudante', desc: 'Un Pokémon que se queda junto a Dazhuang y dispara a los enemigos que se acercan.', icon: 'friends',
                 price: Math.round(HELP_PRICE(S.helpers.length) * m), host: true,
                 why: S.helpers.length >= HELPER_MAX ? G.I18n.f('Máximo {x} ayudantes', HELPER_MAX) : null,
                 note: G.I18n.f('Ayudantes: {x}/{x}', S.helpers.length, HELPER_MAX) });
    }
    if (k === 'up') for (const id of ['hp', 'sh', 'atk']) {
      const lv = S.up[id], u = UP_INFO[id];
      out.push({ key: 'up:' + id, name: u.name, desc: u.desc, icon: u.icon, price: Math.round(UP_PRICE[id] * (lv + 1) * m), host: true,
                 note: G.I18n.f('Nivel {x}/{x}', lv, UP_MAX[id]), why: lv >= UP_MAX[id] ? 'Nivel máximo' : null });
    }
    return out;
  }
  function wareByKey(key, pl) {
    for (const k of KINDS) { const w = wares(k, pl).find(o => o.key === key); if (w) return w; }
    return null;
  }

  /** Comprar (cualquiera). */
  function buy(key) {
    const pl = G.Game.player, w = wareByKey(key, pl);
    if (!w || w.why) return;
    if ((pl.coins || 0) < w.price && authority()) { G.Spawner.say(G.I18n.f('Faltan monedas: cuesta {x}', w.price), 2, true); G.Audio.sfx('error'); return; }
    G.Audio.sfx('coin');
    if (authority()) hostBuy(key, null);
    else G.Coop.request(['gd', 'b', key]);
  }
  /** Anfitrión: cobra y aplica (lo de Dazhuang aquí; lo personal, en el ordenador de quien compra). */
  function hostBuy(key, from) {
    const host = G.Game.player, buyer = from ? G.Game.everyone().find(p => p.uid === from) : host;
    const w = wareByKey(key, buyer || host);
    if (!w || (w.why && w.host)) return;
    if ((host.coins || 0) < w.price) { if (from) G.Coop.sendTo(from, ['gd', 'poor', w.price]); return; }
    host.coins -= w.price;
    if (key.startsWith('item:')) S.items = S.items.filter(id => 'item:' + id !== key);
    if (key.startsWith('art:')) S.art = null;
    if (w.host) applyHost(key);
    else if (from) G.Coop.sendTo(from, ['gd', 'g', key]);
    else applyPersonal(host, key);
    sendState(true);
  }
  function applyHost(key) {
    const dz = S.dz;
    if (key === 'pot:dzheal') { dz.hp = Math.min(dz.mhp, dz.hp + dz.mhp * 0.5); G.FX.ring(dz.x, dz.y, 8, 90, '#7dffb0', 0.5, 4); }
    else if (key === 'help') {
      const i = S.helpers.length, a = -Math.PI / 2 + Math.PI / 4 + i * Math.PI / 2;
      const pool = G.DEX.filter(p => !p.leg && p.rarity <= 3 && G.SPRITE_META[p.dex] && p.bst >= 300 && p.bst <= 480);
      const p = G.U.pick(pool);
      S.helpers.push({ dex: p.dex, x: Math.round(dz.x + Math.cos(a) * 70), y: Math.round(dz.y + Math.sin(a) * 50), cd: 1 });
      G.Sprites.preload([p.dex]);
      G.Spawner.say(G.I18n.f('¡{x} protegerá a Dazhuang!', G.T(p.name)), 2.6);
    } else if (key.startsWith('up:')) {
      const id = key.slice(3);
      if (S.up[id] < UP_MAX[id]) S.up = Object.assign({}, S.up, { [id]: S.up[id] + 1 });
      recalc(false);
      if (id === 'sh') dz.sh = dz.msh;
      G.FX.ring(dz.x, dz.y, 8, 110, '#7fe0ff', 0.6, 4);
    }
    G.Audio.sfx('legend');
  }
  /** Lo personal: en tu ordenador. */
  function applyPersonal(pl, key) {
    if (!pl) return;
    G.FX.ring(pl.x, pl.y, 6, 70, '#7dffb0', 0.5, 3);
    if (key.startsWith('item:') || key.startsWith('art:')) G.Game.offerItem(key.slice(key.indexOf(':') + 1));
    else if (key === 'pot:heal') { pl.heal(pl.maxHp * 0.6); G.Spawner.say(G.T('¡Te has curado!'), 2, true); }
    else if (key.startsWith('pot:')) G.Loot.drink(pl, key.slice(4));
    else if (key === 'pet:egg') {
      if (pl.buddy || pl.egg) return;
      G.Companion.gotEgg(pl);
      if (pl.egg) pl.egg.from = (pl.kills || 0) - G.Companion.KILLS;          // eclosiona ya
    } else if (key === 'pet:candy') G.Companion.addLevels(pl, 3);
    else if (key.startsWith('gear:')) G.Companion.addGear(pl, key.slice(5));
  }

  /** «Empezar la oleada» antes de que acabe la preparación. */
  function startNow() {
    if (!S || S.phase !== 'prep') return;
    if (authority()) startWave();
    else G.Coop.request(['gd', 'go']);
  }

  // ---------------- panel (usa #scr-shop) ----------------

  let panelK = null, skip = null, panelKey = '', saved = null, nearK = null;
  const $ = id => document.getElementById(id);
  function iconHtml(w) {
    if (w.item) return G.Icons.html(w.item, 36);
    if (w.sprite) return `<img src="${G.Tiles.propSprite(G.World.biome, w.sprite, w.sprite === 'potion' ? 5 : 0).toDataURL()}" style="width:36px;height:36px;image-rendering:pixelated">`;
    return G.Icons.html(w.icon || 'coin', 36);
  }
  function openPanel(k) {
    const scr = $('scr-shop');
    if (!scr) return;
    if (!saved) {
      saved = { h2: scr.querySelector('h2').textContent, leave: $('shop-leave').textContent };
      $('shop-roul').style.display = 'none';
      const note = scr.querySelector('.note'); if (note) note.style.display = 'none';
    }
    panelK = k; panelKey = '';
    $('shop-leave').textContent = G.T('Cerrar');
    $('shop-leave').onclick = () => { skip = panelK; closePanel(); };
    const box = scr.querySelector('.box');
    if (box) { box.classList.remove('min'); $('shop-min').onclick = () => box.classList.toggle('min'); }
    scr.classList.add('guard-shop');
    scr.classList.remove('hidden');
    refreshPanel();
    G.Audio.sfx('select');
  }
  function closePanel(force) {
    if (!panelK && !force) return;
    panelK = null;
    const scr = $('scr-shop');
    if (!scr || !saved) return;
    scr.classList.add('hidden'); scr.classList.remove('guard-shop');
    scr.querySelector('h2').textContent = saved.h2;
    $('shop-leave').textContent = saved.leave;
    $('shop-roul').style.display = '';
    const note = scr.querySelector('.note'); if (note) note.style.display = '';
    saved = null;
  }
  function refreshPanel() {
    if (!panelK || !S) return;
    const pl = G.Game.player, coins = Math.floor(pl.coins || 0);
    const list = wares(panelK, pl);
    const key = panelK + ':' + coins + ':' + JSON.stringify(list.map(w => [w.key, w.price, w.why, w.note])) + ':' + S.wave + ':' + S.phase;
    if (key === panelKey) return;
    panelKey = key;
    const scr = $('scr-shop');
    scr.querySelector('h2').textContent = G.T(STALL_INFO[panelK].name);
    $('shop-sub').textContent = G.I18n.f('Monedas del grupo: {x}', coins) + ' · ' + G.I18n.f('Oleada {x}/{x}', S.wave, WAVES);
    const tabs = $('shop-tabs');
    tabs.innerHTML = KINDS.map(k => `<button class="shop-tab${panelK === k ? ' on' : ''}" data-gtab="${k}">${G.T(STALL_INFO[k].name)}</button>`).join('');
    tabs.querySelectorAll('[data-gtab]').forEach(b => { b.onclick = () => { panelK = b.dataset.gtab; panelKey = ''; G.Audio.sfx('select'); refreshPanel(); }; });
    const box = $('shop-list');
    box.innerHTML = '';
    if (!list.length) box.innerHTML = `<p class="sub" style="grid-column:1/-1;margin:8px">${G.T(panelK === 'art' ? 'El artefacto de este turno ya se ha vendido. Vuelve cuando cambie.' : 'No queda nada en este puesto. Se repone al acabar la oleada.')}</p>`;
    for (const w of list) {
      const can = coins >= w.price && !w.why;
      const row = document.createElement('div');
      row.className = 'shop-card' + (w.tier ? ' t' + w.tier : '');
      const chips = (w.tier ? `<span class="tier-chip t${w.tier}">${G.T(G.Items.TIER_NAME[w.tier] || '')}</span>` : '') + (w.note ? `<span class="tag-chip pet-chip">${G.T(w.note)}</span>` : '');
      row.innerHTML = `<div class="ico">${iconHtml(w)}</div>` +
        `<div class="txt"><div class="chips">${chips}</div><b>${G.T(w.name)}</b><small>${G.T(w.desc || '')}</small></div>` +
        `<div class="act"><span class="price ${can || w.why ? '' : 'poor'}">${G.Icons.html('coin', 14)} ${w.price}</span>` +
        `<div class="row" style="gap:4px">` + (w.why ? `<span class="owned">${G.T(w.why)}</span>` : `<button class="btn small gold" data-gbuy="${w.key}" ${can ? '' : 'disabled'}>${G.T('Comprar')}</button>`) + '</div></div>';
      box.appendChild(row);
    }
    box.querySelectorAll('[data-gbuy]').forEach(b => { b.onclick = () => buy(b.dataset.gbuy); });
  }

  // ---------------- botón «Empezar la oleada» ----------------

  let nextBtn = null;
  function showNext(want) {
    if (!want) { if (nextBtn) nextBtn.classList.add('hidden'); return; }
    if (!nextBtn) {
      nextBtn = document.createElement('button');
      nextBtn.id = 'guard-next';
      nextBtn.className = 'btn gold hidden';
      nextBtn.type = 'button';
      nextBtn.onclick = () => { G.Audio.sfx('confirm'); startNow(); };
      document.body.appendChild(nextBtn);
    }
  }

  // ---------------- cada fotograma (todos) ----------------

  /*
   * Avisos de la vida de Dazhuang (2026-10-19, el dueño: «¿cómo sabe el jugador cuánta le queda?»).
   * En todos los ordenadores: al bajar del 50 % y del 25 %, aviso grande (una vez por oleada) y
   * aro rojo; si le pegan y estás lejos (fuera de la pantalla), recordatorio cada 6 s.
   */
  let warnLvl = 0, lastHp = null, hitWarnT = 0, warnWave = -1;
  function hpAlerts(dt, pl) {
    const dz = S.dz, k = dz.hp / Math.max(1, dz.mhp);
    if (warnWave !== S.wave || S.phase !== 'fight') { warnLvl = 0; warnWave = S.wave; }
    if (S.phase === 'fight' && !dz.dead) {
      if (warnLvl < 1 && k < 0.5) { warnLvl = 1; G.Spawner.say(G.T('¡A Dazhuang le queda la mitad de la vida!'), 2.6, true); G.Audio.sfx('error'); G.FX.ring(dz.x, dz.y, 10, 120, '#ffb44a', 0.6, 5); }
      if (warnLvl < 2 && k < 0.25) { warnLvl = 2; G.Spawner.say(G.T('¡Dazhuang no aguanta más! ¡Ve a protegerlo!'), 3, true); G.Audio.sfx('boss'); G.FX.ring(dz.x, dz.y, 10, 160, '#ff3a4a', 0.8, 6); G.Game.flash && G.Game.flash('#ff3a4a', 0.25); }
      // Le pegan y no lo estás viendo: recordatorio.
      const hurt = lastHp != null && dz.hp < lastHp - 0.5;
      if ((hitWarnT -= dt) <= 0 && hurt && !G.Camera.sees(dz.x, dz.y, -40)) { hitWarnT = 6; G.Spawner.say(G.T('¡Están atacando a Dazhuang!'), 2, true); }
    }
    lastHp = dz.hp;
  }

  function update(dt, pl) {
    if (!on() || !S || !pl) { if (panelK) closePanel(); if (nextBtn) nextBtn.classList.add('hidden'); return; }
    hpAlerts(dt, pl);
    if (flashT > 0) flashT -= dt;
    if (counterFx > 0) counterFx -= dt;
    if (dzAnim) { dzAnim.loop(S.dz.dead ? 'Faint' : counterFx > 0 ? 'Attack' : 'Idle'); dzAnim.update(dt); }
    for (const h of S.helpers) {
      let a = helperAnims.get(h.dex);
      if (!a) { a = new G.Sprites.Animator(h.dex, 1, false); helperAnims.set(h.dex, a); }
      a.loop('Idle'); a.update(dt);
    }
    if (!authority() && S.phase === 'prep') S.prepT = Math.max(0, S.prepT - dt);
    // Botón «Empezar la oleada» durante la preparación.
    if (nextBtn) {
      const vis = S.phase === 'prep' && !pl.dead && G.Game.state !== 'over';
      nextBtn.classList.toggle('hidden', !vis);
      if (vis) {
        const t = G.I18n.f('Empezar la oleada {x} ya ({x})', S.wave + 1, Math.ceil(S.prepT));
        if (nextBtn.textContent !== t) nextBtn.textContent = t;
      }
    }
    // Puestos: se abren al acercarte (el que tengas más cerca).
    const choosing = G.Game.state === 'choice' || ['scr-levelup', 'scr-bond', 'scr-item', 'scr-sbox', 'scr-relic', 'scr-boon', 'scr-pause'].some(id => document.getElementById(id) && G.UI.isOpen(id));
    if (pl.dead || choosing) { if (panelK) closePanel(); return; }
    let best = null, bd = Infinity;
    for (const st of S.stalls) { const d = G.U.dist2(pl.x, pl.y, st.x, st.y + 10); if (d < bd) { bd = d; best = st; } }
    // Durante la oleada sólo se abre pisando el mostrador (si no, peleando junto a Dazhuang saltaba sin parar).
    const R = S.phase === 'fight' ? FIGHT_OPEN_R : OPEN_R;
    if (best && bd < R * R) {
      if (best.k !== nearK) {                 // llegas a otro puesto: su pestaña
        nearK = best.k;
        if (skip !== best.k) { if (panelK) { panelK = best.k; panelKey = ''; } else openPanel(best.k); }
      }
    } else if (bd > CLOSE_R * CLOSE_R) { skip = null; nearK = null; if (panelK) closePanel(); }
    if (panelK) refreshPanel();
  }

  // ---------------- dibujo ----------------

  function label(ctx, txt, x, y, col, size = 12) {
    ctx.font = `800 ${size}px Pixelify,"Segoe UI",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
  }
  /** Barra de píxeles (fondo oscuro, borde negro). */
  function bar(ctx, x, y, w, h, k, col, k2, col2) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = '#0f0c16'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#3a2433'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * G.U.clamp(k, 0, 1)), h);
    if (k2 > 0) { ctx.fillStyle = col2; ctx.fillRect(x, y, Math.round(w * G.U.clamp(k2, 0, 1)), Math.max(2, Math.round(h / 2))); }
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, Math.round(w * G.U.clamp(k, 0, 1)), 1);
  }

  function drawables() {
    if (!on() || !S) return [];
    const out = [];
    const dz = S.dz;
    out.push({ y: dz.y, draw(ctx) {
      G.Sprites.drawShadow(ctx, DZ_DEX, dz.x, dz.y, DZ_K);
      if (dzAnim) dzAnim.draw(ctx, dz.x, dz.y, { flash: flashT > 0, softFlash: true, tint: 'dark-body' });   // Machamp negro (sprites.js)
      const top = dz.y - dz.bodyH - 26;
      label(ctx, G.T('Dazhuang'), dz.x, top - 8, '#ffd27a', 13);
      bar(ctx, dz.x - 40, top, 80, 7, dz.hp / Math.max(1, dz.mhp), dz.hp / dz.mhp > 0.35 ? '#5fe08a' : '#ff5f6d', dz.msh ? dz.sh / Math.max(1, dz.mhp) : 0, '#7fe0ff');
    } });
    for (const h of S.helpers) {
      const a = helperAnims.get(h.dex);
      out.push({ y: h.y, draw(ctx) {
        G.Sprites.drawShadow(ctx, h.dex, h.x, h.y, 1);
        if (a) a.draw(ctx, h.x, h.y, {});
      } });
    }
    for (const st of S.stalls) {
      const info = STALL_INFO[st.k];
      out.push({ y: st.y, draw(ctx) {
        // De arriba abajo, juntos: el nombre, lo que vende (flotando un poco) y el mostrador.
        const bob = Math.round(Math.sin(performance.now() / 300 + st.x) * 2);
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(Math.round(st.x - 34), Math.round(st.y - 2), 68, 6);   // sombra
        G.Pickups.sprite(ctx, 'counter', 0, st.x, st.y - 10, 1);
        if (info.icon) G.Icons.draw(ctx, info.icon, st.x - 12, st.y - 50 + bob, 24);
        else G.Pickups.sprite(ctx, info.sprite, info.sprite === 'potion' ? 5 : 0, st.x, st.y - 38 + bob, 1);
        label(ctx, G.T(info.name), st.x, st.y - 58, info.col, 11);
      } });
    }
    return out;
  }

  /** Línea de arriba (hud.js): oleada, enemigos que quedan, vida de Dazhuang y preparación. */
  function hudLine() {
    if (!on() || !S) return null;
    const dz = S.dz;
    const title = S.phase === 'prep'
      ? (S.wave ? G.I18n.f('Oleada {x}/{x} superada', S.wave, WAVES) : G.T('Proteger a Dazhuang')) + ' · ' + G.I18n.f('Siguiente en {x} s', Math.ceil(S.prepT))
      : S.phase === 'fight' ? G.I18n.f('Oleada {x}/{x}', S.wave, WAVES) + ' · ' + G.I18n.f('Quedan {x}', S.left)
      : S.phase === 'won' ? G.T('¡Dazhuang está a salvo!') : G.T('¡Dazhuang ha caído!');
    const sub = G.I18n.f('Dazhuang {x}/{x}', Math.ceil(dz.hp).toLocaleString(), Math.round(dz.mhp).toLocaleString()) + ` (${Math.max(0, Math.round(dz.hp / Math.max(1, dz.mhp) * 100))}%)` + (dz.msh ? ' · ' + G.I18n.f('Escudo {x}', Math.ceil(dz.sh)) : '')
      + (S.wave % BOSS_EVERY === BOSS_EVERY - 1 && S.phase === 'prep' ? ' · ' + G.T('La siguiente trae jefe') : '');
    return { title, sub, bar: dz.hp / Math.max(1, dz.mhp), color: dz.hp / dz.mhp > 0.35 ? '#ffd27a' : '#ff8a95' };
  }

  /** Para el minimapa y las flechas de borde (hud.js). */
  function markers() {
    if (!on() || !S) return null;
    return { dz: S.dz, stalls: S.stalls, strays };
  }

  /** Al acabar la run (game.js): resumen, récord y limpieza. */
  const KEY_BEST = 'ps.guard.best';
  function best() { try { return +localStorage.getItem(KEY_BEST) || 0; } catch (e) { return 0; } }
  function summary() {
    if (!S) return null;
    const reached = S.won ? WAVES : Math.max(0, S.wave - (S.phase === 'fight' || S.phase === 'lost' ? 1 : 0));
    return { wave: S.wave, cleared: reached, won: !!S.won };
  }
  function end() {
    const sm = summary();
    if (sm) { try { if (sm.cleared > best()) localStorage.setItem(KEY_BEST, String(sm.cleared)); } catch (e) { /* nada */ } }
    closePanel(true); showNext(false);
    return sm;
  }
  /** Invitado: la oleada a la que se llegó (lo manda el anfitrión al acabar). */
  function setWave(w) { if (S) S.wave = w; }

  return { blast, target, reset, begin, tick, update, drawables, hudLine, markers, onNet, onClient, startNow, buy, summary, end, best, setWave,
           WAVES, get on() { return on() && !!S; }, get dz() { return S && S.dz; }, get state() { return S; } };
})();
