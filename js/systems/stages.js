/* ============ stages.js — Aventura: 8 regiones × 3 fases ============
 * Cada fase tiene su objetivo (no sólo aguantar) y hasta 3 estrellas:
 *   ★ superarla · ★ acabar con la mitad de la vida o más · ★ el reto de la fase
 * La tercera de cada región es un gimnasio (el líder saca a sus Pokémon uno tras
 * otro). La última región es la Liga: Alto Mando y Campeón.
 *
 * Objetivos:
 *   survive  aguanta X segundos
 *   kills    derrota a N Pokémon antes de X segundos
 *   collect  recoge N bayas doradas repartidas por el mapa
 *   zone     quédate dentro de la zona marcada X segundos (se mueve cada poco)
 *   boss     derrota a los Pokémon del líder, uno tras otro
 *
 * Se desbloquean en orden; cada región nueva pide además unas estrellas.
 * En grupo (sala "Equipo" con una fase elegida) lo lleva el anfitrión y manda
 * el progreso con 'stg'; al acabar, el resultado llega en el 'ov'.
 * Guardado: save.stages[id] = estrellas (1-3) · save.stageClears = nº de veces
 */
G.Stages = (() => {
  // Regiones: nombre, escenario base y estrellas que piden para entrar.
  const REGIONS = [
    { name: 'Bosque Verde', need: 0 }, { name: 'Monte Moon', need: 4 }, { name: 'Ciudad Carmín', need: 8 },
    { name: 'Ciudad Azulona', need: 12 }, { name: 'Ciudad Fucsia', need: 16 }, { name: 'Ciudad Azafrán', need: 20 },
    { name: 'Isla Canela', need: 24 }, { name: 'Liga Pokémon', need: 28 }
  ];
  // obj: { k, t (segundos), n }, star3: { kills } | { time }
  const S = (r, i, scene, obj, star3, extra = {}) => Object.assign({ r, i, scene, obj, star3 }, extra);
  const GYM = (r, i, scene, leader, seq, types, time, title = 'Gimnasio') =>
    S(r, i, scene, { k: 'boss', seq, leader }, { time }, { gym: true, title, types });
  const LIST = [
    S(0, 0, 0, { k: 'survive', t: 120 }, { kills: 120 }),
    S(0, 1, 21, { k: 'kills', n: 140, t: 180 }, { time: 130 }),
    GYM(0, 2, 33, 'Brock', [74, 95], ['rock', 'ground'], 150),
    S(1, 0, 1, { k: 'collect', n: 6 }, { time: 150 }),
    S(1, 1, 23, { k: 'survive', t: 150 }, { kills: 140 }),
    GYM(1, 2, 40, 'Misty', [120, 121], ['water'], 240),
    S(2, 0, 25, { k: 'zone', t: 30 }, { time: 100 }),
    S(2, 1, 43, { k: 'kills', n: 160, t: 200 }, { time: 170 }),
    GYM(2, 2, 25, 'Teniente Surge', [100, 25, 26], ['electric'], 270),
    S(3, 0, 24, { k: 'survive', t: 180 }, { kills: 230 }),
    S(3, 1, 39, { k: 'collect', n: 8 }, { time: 180 }),
    GYM(3, 2, 24, 'Erika', [71, 114, 45], ['grass'], 220),
    S(4, 0, 28, { k: 'zone', t: 40 }, { time: 130 }),
    S(4, 1, 32, { k: 'kills', n: 200, t: 240 }, { time: 200 }),
    GYM(4, 2, 28, 'Koga', [109, 89, 110], ['poison'], 300),
    S(5, 0, 38, { k: 'collect', n: 10 }, { time: 200 }),
    S(5, 1, 31, { k: 'survive', t: 210 }, { kills: 300 }),
    GYM(5, 2, 31, 'Sabrina', [64, 122, 65], ['psychic'], 300),
    S(6, 0, 22, { k: 'zone', t: 45 }, { time: 140 }),
    GYM(6, 1, 29, 'Giovanni', [111, 34, 112], ['ground'], 300, 'Team Rocket'),
    GYM(6, 2, 22, 'Blaine', [77, 78, 59], ['fire'], 300),
    GYM(7, 0, 26, 'Lorelei', [87, 124, 131], ['ice', 'water'], 300, 'Alto Mando'),
    GYM(7, 1, 27, 'Bruno · Agatha · Lance', [68, 94, 149], ['fighting', 'ghost', 'dragon'], 330, 'Alto Mando'),
    GYM(7, 2, 30, 'Azul', [18, 65, 130, 6], null, 360, 'Campeón')
  ];
  LIST.forEach((s, k) => { s.id = k; s.code = (s.r + 1) + '-' + (s.i + 1); });

  // ---------------- guardado ----------------
  const saved = () => { const s = G.DB.save; s.stages = s.stages || {}; return s.stages; };
  const starsOf = id => (G.DB.save && G.DB.save.stages && G.DB.save.stages[id]) || 0;
  const totalStars = () => LIST.reduce((a, s) => a + starsOf(s.id), 0);
  // ---- Difícil (2026-10-15): con las 3 ★ se desbloquea; superarla da una 4ª estrella (rosa). ----
  // save.stagesHard[id] = true. Enemigos con ×1,8 de vida y ×1,4 de daño.
  const HARD_HP = 1.8, HARD_DMG = 1.4;
  const hardSaved = () => { const s = G.DB.save; s.stagesHard = s.stagesHard || {}; return s.stagesHard; };
  const hardDone = id => !!(G.DB.save && G.DB.save.stagesHard && G.DB.save.stagesHard[id]);
  const hardOpen = id => starsOf(id) >= 3;
  const HARD_COL = '#ff6fb8';
  /** ¿Se puede jugar? (la anterior superada y las estrellas de la región) */
  function unlocked(id) {
    const s = LIST[id];
    if (!s) return false;
    if (id > 0 && !starsOf(id - 1)) return false;
    return totalStars() >= REGIONS[s.r].need;
  }

  // ---------------- textos ----------------
  function goalText(s) {
    const o = s.obj;
    if (o.k === 'survive') return G.I18n.f('Aguanta {x}', G.U.mmss(o.t));
    if (o.k === 'kills') return G.I18n.f('Derrota a {x} Pokémon en {x}', o.n, G.U.mmss(o.t));
    if (o.k === 'collect') return G.I18n.f('Recoge {x} bayas doradas', o.n);
    if (o.k === 'zone') return G.I18n.f('Quédate {x} s en la zona marcada', o.t);
    return G.I18n.f('Derrota a {x}', G.T(o.leader)) + ' (' + o.seq.map(d => G.T(G.DEX_BY[d].name)).join(' → ') + ')';
  }
  function star3Text(s) {
    return s.star3.kills ? G.I18n.f('Derrota a {x} Pokémon', s.star3.kills) : G.I18n.f('Supérala en menos de {x}', G.U.mmss(s.star3.time));
  }
  const title = s => s.code + ' · ' + (s.gym ? G.T(s.title) + ' ' + G.T(s.obj.leader) : G.T(REGIONS[s.r].name));

  // ---------------- partida ----------------
  let sel = null;            // fase elegida (para la próxima partida)
  let st = null;             // estado de la fase en curso
  let result = null;         // { win } al acabar
  let net = null;            // invitado: lo último que ha mandado el anfitrión
  let sendT = 0;

  let hardSel = false;       // la próxima partida es la versión difícil
  /** @param hard  versión difícil (en una sala la elige el anfitrión: no se mira tu progreso) */
  function select(id, hard = false) { sel = LIST[id] || null; hardSel = !!(sel && hard); }
  const on = () => G.Modes.run === 'stage' && sel;
  const authority = () => !G.Coop.active || G.Coop.isHost;

  /** Al empezar la partida (antes de sortear el mapa). */
  function prepare() {
    st = null; result = null; net = null;
    if (!on()) return;
    const s = sel;
    // Equilibrio (2026-10-14): fases cortas = más enemigos a la vez pero más blandos al principio,
    // para que se pueda jugar sin mejoras; cada región sube vida y daño. (Ver goals: ~45% de los
    // que salen para el objetivo y ~60% para la estrella.)
    const hk = hardSel ? HARD_HP : 1, dk = hardSel ? HARD_DMG : 1;
    G.Modes.setRules({ hp: (0.75 + s.r * 0.05) * hk, dmg: (0.7 + s.r * 0.015) * dk, count: COUNT[s.r], reward: 1.3, types: s.types || null });
    st = { hard: hardSel, s, t: 0, got: 0, inZone: 0, zone: null, zoneT: 0, bossI: -1, boss: null, nextBossT: s.obj.k === 'boss' ? 35 : 0, kills0: 0, done: false, endT: 0 };
  }
  const scene = () => (on() ? sel.scene : null);
  /** Niveles con los que empiezas la fase (cartas nada más empezar). */
  const headStart = () => (on() ? 3 + sel.r : 0);
  /** Las fases avanzadas traen enemigos de más adelante (segundos que se suman al reloj de oleadas). */
  const tOffset = () => (on() ? 15 + sel.r * 30 : 0);
  // Cuántos enemigos más salen en cada región (las primeras, más: hay menos tiempo).
  const COUNT = [1.5, 1.45, 1.35, 1.3, 1.2, 1.1, 1, 1];

  /** Anfitrión o solitario, cada fotograma. */
  function update(dt, time, pl) {
    if (!st || !authority() || st.done && st.endT <= 0) return;
    const s = st.s, o = s.obj;
    if (st.done) { if ((st.endT -= dt) <= 0) G.Game.stageEnd(true); return; }
    st.t = time;
    const players = G.Game.everyone();
    let win = false;
    if (o.k === 'survive') win = time >= o.t;
    else if (o.k === 'kills') {
      win = pl.kills >= o.n;
      if (!win && time >= o.t) { G.Game.stageEnd(false); return; }
    } else if (o.k === 'collect') {
      if (!st.spawned) spawnTokens(pl, o.n);
      win = st.got >= o.n;
    } else if (o.k === 'zone') {
      if (!st.zone || (st.zoneT -= dt) <= 0) moveZone(players);
      if (players.some(p => !p.dead && G.U.dist2(p.x, p.y, st.zone.x, st.zone.y) < st.zone.r * st.zone.r)) st.inZone += dt;
      win = st.inZone >= o.t;
    } else if (o.k === 'boss') {
      if (st.boss && st.boss.dead) {
        const bx = st.boss.x, by = st.boss.y;
        st.boss = null; st.nextBossT = time + 2.5;
        if (st.bossI >= o.seq.length - 1) { win = true; if (s.i === 2) regionReward(bx, by); }
      }
      if (!win && !st.boss && time >= st.nextBossT) nextBoss(pl, time);
    }
    if (win) {
      st.done = true; st.endT = 2.2; sendT = 0;      // que les llegue ya a los demás
      // Estrellas con lo de este momento (no con lo de 2 s después).
      st.winT = time; st.winHp = pl.hp / pl.maxHp;
      G.Spawner.say(G.T('¡Fase superada!'), 2.4);
      G.Audio.sfx('shinyGet');
      G.Game.flash('#fff6c0', 0.5);
    }
    if (G.Coop.isHost && (sendT -= dt) <= 0) { sendT = 0.5; G.Coop.broadcast(['stg', snap()]); }
  }

  /**
   * El último Pokémon del líder de cada región (la 3ª fase) siempre suelta algo bueno:
   * un objeto equipable y, la primera vez que se supera (o la primera en difícil), un ticket ×10.
   */
  function regionReward(x, y) {
    G.Pickups.drop('item', x - 20, y - 8, G.Items.roll());
    const first = !starsOf(st.s.id) || (st.hard && !hardDone(st.s.id));
    if (first) G.Pickups.drop('ticket10', x + 20, y - 8, 1);
    G.Spawner.say(G.T('¡Premio del líder!') + (first ? ' ' + G.T('(ticket ×10 la primera vez)') : ''), 3);
  }

  function spawnTokens(pl, n) {
    st.spawned = true;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + G.U.rand(-0.3, 0.3);
      let x = pl.x, y = pl.y;
      for (let k = 0; k < 12; k++) {
        const d = G.U.rand(380, 950);
        x = pl.x + Math.cos(a) * d; y = pl.y + Math.sin(a) * d;
        if (G.World.isFree(x, y, 14)) break;
      }
      G.Pickups.drop('token', x, y, 1);
    }
  }
  function moveZone(players) {
    const alive = players.filter(p => !p.dead);
    const c = alive.length ? G.U.pick(alive) : players[0];
    let x = c.x, y = c.y;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * 6.2832, d = G.U.rand(240, 380);
      x = c.x + Math.cos(a) * d; y = c.y + Math.sin(a) * d;
      if (G.World.isFree(x, y, 30)) break;
    }
    st.zone = { x, y, r: 92 }; st.zoneT = 14;
    G.Audio.sfx('confirm');
  }
  function nextBoss(pl, time) {
    const o = st.s.obj;
    st.bossI++;
    const dex = o.seq[st.bossI];
    const T = time + tOffset();
    const slots = G.Enemies.BOSS_SLOTS;
    const slot = slots[Math.min(slots.length - 1, Math.floor(T / 200))];
    const last = st.bossI === o.seq.length - 1;
    const def = G.Enemies.bossFor(dex, slot, (0.3 + st.s.r * 0.04) * (last ? 1.3 : 1));
    st.boss = G.Spawner.spawnBossNow(null, T, def);
    G.Spawner.say(G.I18n.f('¡{x} saca a {x}!', G.T(o.leader), G.T(G.DEX_BY[dex].name)), 3);
  }

  /** Has cogido una baya dorada (anfitrión o solitario). */
  function token(who) {
    if (!st) return;
    st.got++;
    G.FX.ring(who.x, who.y, 8, 70, '#ffd23f', 0.5, 4);
    G.FX.dmgText(who.x, who.y - who.bodyH - 8, st.got + ' / ' + st.s.obj.n, '#ffd23f', true);
  }

  /** Estado para los invitados (y para el HUD). */
  function snap() {
    if (!st) return null;
    return { t: st.t, got: st.got, in: Math.round(st.inZone * 10) / 10, z: st.zone ? [Math.round(st.zone.x), Math.round(st.zone.y), st.zone.r] : null,
             b: st.bossI, done: st.done ? 1 : 0 };
  }
  function onNet(ev) { if (ev[0] === 'stg') net = ev[1]; }
  /** Lo que se ve (anfitrión: lo suyo; invitado: lo que llega). */
  function view() {
    if (!st) return null;
    if (authority()) return snap();
    return net || { t: 0, got: 0, in: 0, z: null, b: -1, done: 0 };
  }

  /** Línea del HUD. */
  function hudLine() {
    if (!st) return null;
    const s = st.s, o = s.obj, v = view(), pl = G.Game.player, time = G.Game.st.time;
    let sub = '', bar = null;
    if (o.k === 'survive') { sub = G.U.mmss(Math.min(time, o.t)) + ' / ' + G.U.mmss(o.t); bar = time / o.t; }
    else if (o.k === 'kills') { sub = Math.min(pl.kills, o.n) + ' / ' + o.n + ' · ' + G.I18n.f('quedan {x}', G.U.mmss(Math.max(0, o.t - time))); bar = pl.kills / o.n; }
    else if (o.k === 'collect') { sub = v.got + ' / ' + o.n; bar = v.got / o.n; }
    else if (o.k === 'zone') { sub = Math.floor(v.in) + ' / ' + o.t + ' s'; bar = v.in / o.t; }
    else { sub = o.seq.map((d, i) => (i < v.b || (i === v.b && v.done) ? '✔ ' : i === v.b ? '▶ ' : '') + G.T(G.DEX_BY[d].name)).join(' · '); bar = Math.max(0, v.b) / o.seq.length; }
    return { title: s.code + (st.hard ? ' · ' + G.T('Difícil') : '') + ' · ' + goalText(s).split(' (')[0], sub, bar: v.done ? 1 : bar, color: '#ffd23f' };
  }

  /** Dibujo en el mundo: la zona (debajo de todo). */
  function drawable() {
    if (!st || st.s.obj.k !== 'zone') return null;
    const v = view();
    if (!v || !v.z) return null;
    return { y: -1e9, draw(ctx) {
      const [x, y, r] = v.z, k = 0.5 + Math.sin(performance.now() / 260) * 0.2;
      const pl = G.Game.player, inside = pl && G.U.dist2(pl.x, pl.y, x, y) < r * r;
      ctx.save();
      ctx.globalAlpha = 0.18 + (inside ? 0.12 : 0);
      ctx.fillStyle = inside ? '#5fe08a' : '#ffd23f';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = k + 0.2;
      ctx.lineWidth = 3; ctx.strokeStyle = inside ? '#5fe08a' : '#ffd23f';
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -performance.now() / 40;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    } };
  }

  /** HUD: flecha hacia la zona o la baya más cercana si no se ve. */
  function drawHud(ctx, w, h, pl, F) {
    if (!st || !pl) return;
    let tx = null, ty = null;
    const o = st.s.obj;
    if (o.k === 'zone') { const v = view(); if (v && v.z) { tx = v.z[0]; ty = v.z[1]; } }
    else if (o.k === 'collect') {
      let bd = Infinity;
      for (const p of G.Pickups.all()) if (p.kind === 'token') { const d = G.U.dist2(p.x, p.y, pl.x, pl.y); if (d < bd) { bd = d; tx = p.x; ty = p.y; } }
    }
    if (tx == null) return;
    const cam = G.Camera;
    const sx = (tx - cam.left()) * cam.scale, sy = (ty - cam.top()) * cam.scale;
    if (sx > 20 && sx < w - 20 && sy > 20 && sy < h - 20) return;
    const M = 40, ex = G.HUD.edgeX(sx, M, w), ey = G.U.clamp(sy, M + 70, h - M - 70);
    const a = Math.atan2(sy - ey, sx - ex);
    ctx.save();
    ctx.translate(ex, ey);
    const beat = 0.5 + Math.sin(performance.now() / 150) * 0.5;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(0, 0, 26 + beat * 6, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = beat > 0.5 ? '#fff3b0' : '#ffd23f'; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 36, Math.sin(a) * 36);
    ctx.lineTo(Math.cos(a + 2.45) * 18, Math.sin(a + 2.45) * 18);
    ctx.lineTo(Math.cos(a - 2.45) * 18, Math.sin(a - 2.45) * 18);
    ctx.closePath(); ctx.stroke(); ctx.fill();
    const d = Math.round(Math.hypot(tx - pl.x, ty - pl.y) / 32);
    ctx.font = F(800, 11); ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
    const lb = (o.k === 'zone' ? G.T('Zona') : G.T('Baya')) + ' · ' + d + ' m';
    const lx = -Math.cos(a) * 30, ly = -Math.sin(a) * 26 + 4;
    ctx.strokeText(lb, lx, ly); ctx.fillStyle = '#fff3b0'; ctx.fillText(lb, lx, ly);
    ctx.restore();
  }

  // ---------------- al acabar ----------------

  function setResult(win) { result = { win: !!win }; }

  /** Tras el resumen: estrellas y premios (antes de G.Modes.afterRun). */
  function afterRun(r) {
    if (!st) return;
    // Si ya estaba superada (y luego caes en esos 2 s), cuenta como superada.
    const s = st.s, win = result ? !!result.win || !!st.done : !!st.done;
    const box = document.getElementById('over-stats'), ttl = document.getElementById('over-title');
    const pl = r.pl;
    const hpK = st.winHp != null ? st.winHp : pl ? pl.hp / pl.maxHp : 0;
    const tWin = st.winT != null ? st.winT : r.time;
    const stars = !win ? 0 : 1 + (hpK >= 0.5 ? 1 : 0)
      + ((s.star3.kills ? r.kills >= s.star3.kills : tWin <= s.star3.time) ? 1 : 0);
    const before = starsOf(s.id);
    let rw = '';
    if (win && G.DB.save) {
      const sv = G.DB.save;
      sv.tickets = sv.tickets || { t1: 0, t10: 0 };
      const gained = Math.max(0, stars - before);
      if (!before) {
        const coins = 150 + s.r * 50;
        sv.coins += coins;
        rw += coins + ' ' + G.T('monedas');
        if (s.gym) { sv.tickets.t10 += 1; rw += ' + 1 ' + G.T('ticket ×10'); }
      }
      if (gained) { sv.tickets.t1 += gained; rw += (rw ? ' + ' : '') + gained + ' ' + G.T('tickets'); }
      if (st.hard && !hardDone(s.id)) {
        hardSaved()[s.id] = true;
        sv.tickets.t10 += 1; rw += (rw ? ' + ' : '') + '1 ' + G.T('ticket ×10') + ' (' + G.T('Difícil') + ')';
      }
      saved()[s.id] = Math.max(before, stars);
      sv.stats.stageClears = (sv.stats.stageClears || 0) + 1;
      sv.stats.stageStars = totalStars();
      G.DB.commit();
    }
    if (ttl) ttl.textContent = G.T(win ? '¡Fase superada!' : 'Fase fallida');
    if (box) {
      const starRow = [0, 1, 2].map(i => `<span style="font-size:28px;color:${i < stars ? '#ffd23f' : '#4a5470'}">★</span>`).join('')
        + (st.hard ? `<span style="font-size:28px;color:${win ? HARD_COL : '#4a5470'}" title="${G.T('Difícil')}">★</span>` : '');
      const lines = [G.T('Superarla'), G.T('Acabar con la mitad de la vida o más'), star3Text(s)];
      box.insertAdjacentHTML('afterbegin', `<div style="grid-column:1/-1;text-align:center" class="panel">
        <span>${G.T('Aventura')} · ${title(s)}${st.hard ? ' · <b style="color:' + HARD_COL + '">' + G.T('Difícil') + '</b>' : ''}</span><div>${starRow}</div>
        <div style="font-size:12px;color:var(--muted)">${lines.map((t, i) => (i < stars ? '★ ' : '☆ ') + t).join(' · ')}</div>
        ${rw ? `<div class="gold" style="margin-top:4px">${G.T('Premio')}: ${rw}</div>` : ''}
        ${win && LIST[s.id + 1] && unlocked(s.id + 1) && !before ? `<div style="color:#5fe08a">${G.I18n.f('¡Desbloqueada la fase {x}!', LIST[s.id + 1].code)}</div>` : ''}
        <div class="row" data-next-row style="justify-content:center;gap:8px;margin-top:8px"></div>
      </div>`);
      nextButtons(box.querySelector('[data-next-row]'), s, win, stars);
    }
    st = null; result = null; net = null;
  }

  /**
   * Botones del resumen: "Siguiente fase" (si está desbloqueada) y "Repetir". En solitario
   * empiezan ya; en una sala, el anfitrión vuelve a la sala con esa fase elegida (los
   * demás esperan a que empiece).
   */
  function nextButtons(row, s, win, stars) {
    if (!row) return;
    const room = G.Social.room, next = LIST[s.id + 1];
    if (room && !room.isHost) { row.innerHTML = `<small style="color:var(--muted)">${G.T('El anfitrión elige la siguiente fase.')}</small>`; return; }
    const go = id => {
      const again = document.getElementById('btn-again');
      if (again) again.click();               // vuelve al menú o a la sala (y guarda como siempre)
      setTimeout(() => {
        if (room) { G.Social.setMods(Object.assign({}, room.mods, { stage: id, ch: null, rush: false })); return; }
        select(id); G.Modes.start('stage');
      }, 60);
    };
    const btns = [];
    if (win && next && unlocked(next.id)) btns.push(['next', '▶ ' + G.I18n.f(room ? 'Siguiente: {x} (a la sala)' : 'Siguiente fase: {x}', next.code), next.id, true]);
    if (!win || stars < 3) btns.push(['retry', '↻ ' + G.T(win ? 'Repetir (a por las 3 ★)' : 'Reintentar'), s.id, !win]);
    row.innerHTML = btns.map(([k, l, , gold]) => `<button class="btn ${gold ? 'gold' : ''}" data-k="${k}">${l}</button>`).join('');
    btns.forEach(([k, , id]) => { row.querySelector(`[data-k="${k}"]`).onclick = () => go(id); });
  }

  function merge(r, older) {
    if (!older.stages) return;
    r.stages = r.stages || {};
    for (const k in older.stages) r.stages[k] = Math.max(r.stages[k] || 0, older.stages[k] || 0);
    if (older.stagesHard) { r.stagesHard = r.stagesHard || {}; for (const k in older.stagesHard) r.stagesHard[k] = r.stagesHard[k] || older.stagesHard[k]; }
  }

  // ---------------- mapa ----------------

  let overlay = null, pick = null, partyStage = null;
  let picker = null;        // { pick(id) } si se abre para elegir la fase de una sala
  function closeMap() { if (overlay) { overlay.remove(); overlay = null; } }

  /** @param opts  { pick(id), current } para elegir la fase de una sala (en vez de jugarla) */
  function openMap(opts) {
    closeMap();
    picker = opts && opts.pick ? opts : null;
    if (picker && Number.isInteger(picker.current)) pick = picker.current;
    overlay = document.createElement('div');
    overlay.className = 'pn-ov';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:66;display:flex;align-items:center;justify-content:center;background:rgba(5,9,20,.7)';
    overlay.onclick = e => { if (e.target === overlay) closeMap(); };
    document.body.appendChild(overlay);
    if (pick == null) { const nx = LIST.find(s => unlocked(s.id) && !starsOf(s.id)); pick = nx ? nx.id : 0; }
    renderMap();
  }

  function renderMap() {
    const total = totalStars();
    const chip = s => {
      const ok = unlocked(s.id), n = starsOf(s.id);
      return `<button class="btn small ${s.id === pick ? 'gold' : ''}" data-st="${s.id}" ${ok ? '' : 'disabled'}
        style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 4px;${s.gym ? 'border-color:#ffd23f' : ''}">
        <span>${ok ? '' : '🔒 '}${s.code}${s.gym ? ' 🏅' : ''}</span>
        <span style="font-size:13px;letter-spacing:1px;color:${n ? '#ffd23f' : '#6a7390'}">${'★'.repeat(n)}${'☆'.repeat(3 - n)}${hardDone(s.id) ? `<b style="color:${HARD_COL}">★</b>` : ''}</span></button>`;
    };
    const s = LIST[pick] || LIST[0], ok = unlocked(s.id), n = starsOf(s.id);
    const reg = REGIONS[s.r];
    const why = !ok ? (s.id > 0 && !starsOf(s.id - 1) ? G.I18n.f('Supera antes la fase {x}.', LIST[s.id - 1].code)
                                                      : G.I18n.f('Necesitas {x} estrellas (tienes {x}).', reg.need, total)) : '';
    overlay.innerHTML = `
      <div class="box pn-sheet pn-stages" style="width:min(640px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:18px 20px">
        <div class="row between pn-bar"><h3 style="margin:0">${G.T(picker ? 'Elige la fase de la sala' : 'Aventura')} <small class="gold">★ ${total} / ${LIST.length * 3}</small></h3>
          <button class="btn small ghost" data-close>${G.T('Volver')}</button></div>
        <p class="sub" style="margin:6px 0 4px">${G.T('Supera las fases en orden, gana estrellas y llega a la Liga. Cada región nueva pide unas estrellas.')}</p>
        <div class="st-regions" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px">
          ${REGIONS.map((R, ri) => `<div class="panel" style="padding:6px 8px">
            <div style="font-size:13px;display:flex;justify-content:space-between"><b>${ri + 1}. ${G.T(R.name)}</b>
              ${R.need ? `<small style="color:${total >= R.need ? 'var(--muted)' : '#ff8a96'}">★${R.need}</small>` : ''}</div>
            <div style="display:flex;gap:4px;margin-top:4px">${LIST.filter(x => x.r === ri).map(chip).join('')}</div></div>`).join('')}
        </div>
        <div class="panel st-detail" style="padding:10px 12px;margin-top:10px;position:sticky;bottom:-18px;z-index:2;background:var(--box2);box-shadow:0 -6px 16px #0007">
          <div class="row between" style="gap:10px;align-items:flex-start">
            <div class="grow">
              <b class="gold">${title(s)}</b> <small style="color:var(--muted)">${G.T(G.Tiles.BIOMES[s.scene].name)}</small>
              <div style="font-size:14px;margin:4px 0">🎯 ${goalText(s)}</div>
              <div style="font-size:12px;color:var(--muted)">★ ${G.T('Superarla')} · ★ ${G.T('Acabar con la mitad de la vida o más')} · ★ ${star3Text(s)}</div>
              ${s.types ? `<div style="font-size:12px;margin-top:2px">${G.UI.typeChips(s.types)}</div>` : ''}
              ${why ? `<div style="color:#ff8a96;font-size:13px;margin-top:4px">🔒 ${why}</div>` : ''}
              ${ok ? `<div style="font-size:12px;margin-top:4px;color:${HARD_COL}">☠ ${hardOpen(s.id)
                ? G.T(hardDone(s.id) ? 'Difícil superada: 4ª estrella conseguida.' : 'Difícil desbloqueada: enemigos con ×1,8 de vida y ×1,4 de daño. Premio: 4ª estrella y un ticket ×10.')
                : G.T('Consigue las 3 ★ para desbloquear la versión difícil.')}</div>` : ''}
              <div style="font-size:12px;color:var(--muted);margin-top:4px">${G.T('En grupo: crea una sala en «Jugar con amigos» y elige la fase allí.')}</div>
            </div>
            <div style="text-align:center"><div style="color:#ffd23f;font-size:18px">${'★'.repeat(n)}${'☆'.repeat(3 - n)}${hardOpen(s.id) ? `<span style="color:${hardDone(s.id) ? HARD_COL : '#4a5470'}">★</span>` : ''}</div>
              <button class="btn gold" data-play ${ok ? '' : 'disabled'}>${G.T(picker ? 'Elegir esta fase' : 'Jugar')}</button>
              ${!picker && hardOpen(s.id) ? `<button class="btn small" data-hard style="display:block;margin:6px auto 0;border-color:${HARD_COL};color:${HARD_COL}">☠ ${G.T('Difícil')}</button>` : ''}
              ${picker ? '' : `<button class="btn small" data-party ${ok ? '' : 'disabled'} style="display:block;margin:6px auto 0">👥 ${G.T('Con amigos')}</button>`}</div>
          </div>
        </div>
      </div>`;
    overlay.querySelector('[data-close]').onclick = closeMap;
    overlay.querySelectorAll('[data-st]').forEach(b => { b.onclick = () => { pick = +b.dataset.st; G.Audio.sfx('click'); renderMap(); }; });
    const pb = overlay.querySelector('[data-play]');
    pb.dataset.sfx = 'confirm';
    pb.onclick = () => {
      if (!unlocked(pick)) return;
      if (picker) { const p = picker; closeMap(); p.pick(pick); return; }
      closeMap(); select(pick); G.Modes.start('stage');
    };
    const hb = overlay.querySelector('[data-hard]');
    if (hb) hb.onclick = () => { if (!unlocked(pick) || !hardOpen(pick)) return; closeMap(); select(pick, true); G.Modes.start('stage'); };
    // Con amigos: abre "Jugar con amigos" y, al crear la sala, ya viene elegida esta fase.
    if (!picker) overlay.querySelector('[data-party]').onclick = () => { if (!unlocked(pick)) return; partyStage = pick; closeMap(); G.PartyUI.open(); };
    if (G.I18n.walk) G.I18n.walk(overlay);
  }

  /** Texto bajo "Aventura" en el menú. */
  function menuLine() {
    const nx = LIST.find(s => unlocked(s.id) && !starsOf(s.id));
    return '★ ' + totalStars() + ' / ' + LIST.length * 3 + (nx ? ' · ' + G.I18n.f('Siguiente: {x}', nx.code) : '');
  }

  /** Fases que puede elegir el anfitrión en su sala (las que tiene desbloqueadas). */
  function choices() { return LIST.filter(s => unlocked(s.id)).map(s => ({ id: s.id, label: title(s) })); }
  /** La fase elegida con "Con amigos" (una vez: la sala la pone al crearse). */
  function takePartyStage() { const s = partyStage; partyStage = null; return s; }

  /**
   * Cuánto suele durar la fase en curso (s), para repartir lo que sale durante la run
   * (discos, huevo, sorpresas del mapa: loot.js, companion.js, dungeon.js). null si no
   * es una fase. Aguantar / derrotar: su tiempo; zona, bayas y jefes: el tiempo de la
   * tercera estrella (lo que tarda alguien que lo hace bien).
   */
  function runLength() {
    if (!on()) return null;
    const s = sel, o = s.obj;
    if ((o.k === 'survive' || o.k === 'kills') && o.t) return o.t;
    return (s.star3 && s.star3.time) || 180;
  }

  return { LIST, REGIONS, select, prepare, scene, headStart, tOffset, runLength, update, token, onNet, hudLine, drawable, drawHud, setResult, afterRun,
           merge, openMap, closeMap, menuLine, choices, takePartyStage, goalText, star3Text, unlocked, starsOf, totalStars, title,
           hardDone, hardOpen,
           get hard() { return !!(st && st.hard); },
           get active() { return !!st; },
           /** Tipo de objetivo de la fase en curso ('collect', 'zone'...) o null. */
           get goal() { return st ? st.s.obj.k : null; },
           /** Fase ya superada (esperando el resumen): nada te hace daño. */
           get won() { if (!st) return false; const v = view(); return !!(st.done || (v && v.done)); } };
})();
