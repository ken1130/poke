/* ============ pvp-extra.js — extras del PK (2026-10-16, a petición del dueño) ============
 * Va encima de pvp.js. Cada extra se activa en la sala (el anfitrión; por defecto todos sí,
 * cfg.pkx) y según cuántos sois al empezar:
 *   - Rondas (cualquier número): una ronda o al mejor de 3. Al acabar una ronda: quién la gana y
 *     el marcador (1 : 0) arriba; a los 4 s, la siguiente: todos con la vida llena en su sitio de
 *     salida, la zona, las bayas y el reloj de nuevo (5 s sin daño). Se quedan los movimientos y
 *     el nivel. Gana quien llega a 2; el resumen y los premios, una sola vez al final.
 *   - 2 jugadores: tesoro en el centro, suelo trampa y cambio de movimientos del que pierde la ronda.
 *   - 3 o más: fantasmas traviesos, tesoro en el centro, rachas de K.O. y duelo final.
 * Lo decide el anfitrión y lo manda a todos como ['pv', ...] (coop.js ya los reparte a todos).
 *   ['pv','rr', ronda, ganador, marcador, perdedores, final]  fin de ronda (ganador: uid o 'T0'/'T1'; null = empate)
 *   ['pv','rs', ronda, t0]                                   empieza la ronda (reloj de la run a t0)
 *   ['pv','ts', id, tipo] / ['pv','tg', id, uid, tipo]       tesoro: aparece / alguien lo coge
 *   ['pv','tp', [[x, y], ...]]                               trampas (explotan a los 3 s)
 *   ['pv','gp', uid, x, y, ángulo]                           piedrita de un fantasma (la juzga quien la recibe)
 *   ['pv','fd', t0, R0]                                      duelo final (la zona va de R0 a 260 en 10 s)
 */
G.PvPX = (() => {
  const WIN = 2, BREAK = 4, PREP = 5;            // rondas para ganar, pausa entre rondas, s sin daño al empezar la siguiente
  const TREASURE_EVERY = 30, TREASURE_R = 34;
  const TRAP_R = 50, TRAP_T = 3, TRAP_DMG = 0.15;
  const PEBBLE_EVERY = 2, PEBBLE_SPEED = 430, PEBBLE_LIFE = 0.9, PEBBLE_SLOW = 1;
  const DUEL_R = 260, DUEL_T = 10, SLOWMO = 600;
  const SEEK_R = 130;      // combat.js: círculos de este radio o más son "buscar blanco" (al invisible no se le encuentra)
  // Tesoros: ataque ×2 10 s, +40 % de velocidad 10 s, invisible 3 s.
  const KINDS = {
    atk: { name: '¡Ataque ×2!', icon: '⚔️', col: '#ff6b4d', t: 10 },
    spd: { name: '¡Velocidad +40 %!', icon: '👟', col: '#7fe0ff', t: 10 },
    inv: { name: '¡Invisible!', icon: '👻', col: '#d8c8ff', t: 3 }
  };
  const KIND_IDS = Object.keys(KINDS);

  let on = false, cfg = null, teams = false, f = {};
  let round = 1, scores = {}, inBreak = false, breakT = 0, lastWin = null, resultT = 0;
  let treasure = null, nextTreasure = 0, tid = 0;
  let traps = [], nextTrap = 0;
  let pebbles = [], pebT = 0;
  let duel = null, duelDone = false, slowUntil = 0;
  let streak = new Map(), glow = new Map(), big = null;

  const me = () => G.Net.uid;
  const send = ev => { if (G.Coop.isHost) G.Coop.broadcast(ev); else if (G.Coop.active) G.Coop.request(ev); };
  /** Lo mandas y te pasa a ti también (el anfitrión no recibe sus propios eventos). */
  const out = ev => { send(ev); onNet(ev); };
  const armed = () => on && G.Coop.active && G.Game.st.time >= G.PvP.grace && !inBreak;
  const players = () => G.Coop.active ? G.Coop.players() : [];
  const playerOf = uid => uid === me() ? G.Game.player : (G.Coop.mate(uid) || {}).pl;
  const keyOf = p => teams ? 'T' + (p.team | 0) : p.uid;
  const nameOfKey = k => {
    if (k == null) return '';
    if (teams) return G.T(G.PvP.TEAM_NAMES[+String(k).slice(1)] || '');
    const m = cfg && cfg.members.find(x => x.uid === k);
    return m ? m.name : '?';
  };

  function reset() {
    on = false; cfg = null; teams = false; f = {};
    round = 1; scores = {}; inBreak = false; breakT = 0; lastWin = null; resultT = 0;
    roundClear();
  }
  /** Lo de cada ronda: tesoro, trampas, piedritas, duelo, rachas. */
  function roundClear() {
    treasure = null; nextTreasure = TREASURE_EVERY; traps = []; nextTrap = (G.PvP.grace || 15) + G.U.rand(4, 8);
    pebbles = []; pebT = PEBBLE_EVERY; duel = null; duelDone = false; slowUntil = 0;
    streak = new Map(); glow = new Map(); big = null;
    for (const p of players()) { p.pkAtkT = 0; p.pkSpdT = 0; p.pkInvisT = 0; p.pebbleT = 0; }
  }

  /** pvp.js (begin): qué extras hay en esta partida. */
  function begin(c, pvpOn) {
    reset();
    if (!pvpOn || !c) return;
    on = true; cfg = c; teams = !!c.teams;
    const x = c.pkx || {}, v = k => x[k] !== false;       // por defecto, todos sí
    const n = (c.members || []).length;
    f = {
      bo3: v('bo3'),
      treasure: n >= 2 && v('treasure'),
      traps: n === 2 && v('traps'),
      reroll: n === 2 && !!c.arena && v('reroll'),
      ghosts: n >= 3 && !teams && v('ghosts'),     // (por equipos se levanta a los compañeros: sin fantasmas)
      streak: n >= 3 && v('streak'),
      duel: n >= 3 && v('duel')
    };
    for (const k of scoreKeys()) scores[k] = 0;
  }
  function scoreKeys() {
    if (!cfg) return [];
    return teams ? ['T0', 'T1'] : cfg.members.map(m => m.uid);
  }

  // ================= consultas (pvp.js, combat.js, hud.js, game.js) =================
  /** ¿Está `p` invisible para ti? (tú y tus compañeros de equipo sí os veis, flojito) */
  function hidden(p) {
    if (!on || !p || !(p.pkInvisT > 0)) return false;
    const mine = G.Coop.local;
    if (p === mine || p.uid === me()) return false;
    if (teams && mine && p.team === mine.team) return false;
    return true;
  }
  const isGhost = p => on && f.ghosts && !!p && p.dead;
  const atkK = () => { const pl = G.Game.player; return on && pl && pl.pkAtkT > 0 ? 2 : 1; };
  const timeScale = () => on && performance.now() < slowUntil ? 0.35 : 1;
  function zoneCap(t) {
    if (!duel) return null;
    const k = Math.max(0, Math.min(1, (t - duel.t0) / DUEL_T));
    const R1 = Math.min(duel.R0, DUEL_R);
    return duel.R0 + (R1 - duel.R0) * k;
  }
  /** "Ana 1 : 0 Luis" (2) o "Ana 1 · Luis 0 · Eva 0" (3 o más). null si es a una ronda. */
  function scoreLine() {
    if (!on || !f.bo3) return null;
    const ks = scoreKeys();
    if (ks.length === 2) return `${nameOfKey(ks[0])} ${scores[ks[0]] | 0} : ${scores[ks[1]] | 0} ${nameOfKey(ks[1])}`;
    return ks.map(k => `${nameOfKey(k)} ${scores[k] | 0}`).join(' · ');
  }

  // ================= rondas (anfitrión) =================
  /**
   * game.js (checkAllDown, anfitrión): ha acabado una ronda. Devuelve true si la partida sigue
   * (habrá otra ronda) y false si se acaba aquí (a una ronda, o alguien ha llegado a 2).
   */
  function hostRoundOver(winKey) {
    if (!on || !f.bo3) return false;
    if (winKey != null) scores[winKey] = (scores[winKey] | 0) + 1;
    const losers = winKey == null ? [] : players().filter(p => keyOf(p) !== winKey).map(p => p.uid);
    if (winKey != null && scores[winKey] >= WIN) {
      out(['pv', 'rr', round, winKey, Object.assign({}, scores), [], 1]);      // el marcador final, para el resumen
      return false;
    }
    out(['pv', 'rr', round, winKey, Object.assign({}, scores), losers, 0]);
    breakT = BREAK;
    return true;
  }

  // ================= red =================
  /** pvp.js onNet: los eventos de los extras. true si era uno de éstos. */
  function onNet(ev) {
    const k = ev[1];
    if (!['rr', 'rs', 'ts', 'tg', 'tp', 'gp', 'fd'].includes(k)) return false;
    if (!on) return true;
    const pl = G.Game.player;
    switch (k) {
      case 'rr': {
        scores = Object.assign({}, ev[4] || {});
        if (ev[6]) break;                       // final: sólo el marcador (el resumen llega con 'ov')
        inBreak = true; lastWin = ev[3]; resultT = BREAK; round = ev[2];
        treasure = null; traps = []; pebbles = [];
        G.Audio.sfx(lastWin != null && (lastWin === me() || (teams && pl && lastWin === 'T' + pl.team)) ? 'levelup' : 'boss');
        // Revancha: el que ha perdido puede cambiar sus movimientos mientras tanto.
        if (f.reroll && pl && (ev[5] || []).includes(me())) G.PvP.reroll(BREAK + PREP - 1);
        break;
      }
      case 'rs': {
        round = ev[2]; inBreak = false; resultT = 0; breakT = 0;
        roundClear();
        G.Game.setRoundTime(ev[3]);
        G.PvP.roundReset(ev[3]);
        if (pl) {
          if (pl.dead) pl.revive(1);
          pl.hp = pl.maxHp; pl.slowT = 0; pl.reviveT = 0; pl.invuln = 1;
          const i = Math.max(0, cfg.members.findIndex(m => m.uid === me())), a = i / cfg.members.length * 6.2832;
          pl.x = Math.round(Math.cos(a) * 420); pl.y = Math.round(Math.sin(a) * 300);
          G.Camera.x = pl.x; G.Camera.y = pl.y;
        }
        G.Pickups.clear();
        G.Spawner.say(G.I18n.f('¡Ronda {x}! Tenéis {x} s para prepararos…', round, PREP), 3, true);
        G.Audio.sfx('confirm');
        break;
      }
      case 'ts':
        treasure = { id: ev[2], kind: ev[3] };
        G.Spawner.say('¡Ha aparecido un tesoro en el centro de la zona!', 2.6, true);
        G.Audio.sfx('shiny');
        break;
      case 'tg': {
        if (treasure && treasure.id === ev[2]) treasure = null;
        const p = playerOf(ev[3]), d = KINDS[ev[4]];
        if (!p || !d) break;
        if (ev[4] === 'atk') p.pkAtkT = d.t; else if (ev[4] === 'spd') p.pkSpdT = d.t; else p.pkInvisT = d.t;
        G.Spawner.say(G.I18n.f('{x} ha cogido el tesoro: {x}', p === pl ? nameOfKey(me()) : (p.tag || nameOfKey(ev[3])), G.T(d.name)), 2.6, true);
        G.FX.ring(p.x, p.y, 8, 70, d.col, 0.5, 4);
        G.Audio.sfx(p === pl ? 'levelup' : 'select');
        break;
      }
      case 'tp':
        for (const [x, y] of ev[2] || []) traps.push({ x, y, t: TRAP_T });
        G.Audio.sfx('error');
        break;
      case 'gp':
        pebbles.push({ from: ev[2], x: ev[3], y: ev[4], vx: Math.cos(ev[5]) * PEBBLE_SPEED, vy: Math.sin(ev[5]) * PEBBLE_SPEED, t: PEBBLE_LIFE });
        break;
      case 'fd':
        duel = { t0: ev[2], R0: ev[3] }; duelDone = true;
        slowUntil = performance.now() + SLOWMO;
        big = { text: G.T('¡Duelo final!'), sub: G.T('La zona se cierra deprisa'), t: 2.8, col: '#ff5f6d' };
        if (pl && !pl.dead && pl.hp < pl.maxHp * 0.5) { pl.hp = pl.maxHp * 0.5; G.FX.ring(pl.x, pl.y, 6, 70, '#5fe08a', 0.5, 4); }
        G.Audio.sfx('boss');
        break;
    }
    return true;
  }

  /** pvp.js: alguien ha tumbado a alguien (todos lo ven una vez). Rachas sin caer en la ronda. */
  function onKo(atk, vic) {
    if (!on || !f.streak) return;
    if (vic) streak.set(vic, 0);
    if (!atk || atk === vic) return;
    const n = (streak.get(atk) | 0) + 1;
    streak.set(atk, n);
    if (n < 2) return;
    big = { text: G.T(n === 2 ? '¡Doble K.O.!' : n === 3 ? '¡Triple K.O.!' : '¡Imparable!'), sub: nameOfKey(atk), t: 2.6, col: '#ffd23f' };
    glow.set(atk, 8);
    G.Audio.sfx('bossDown');
  }

  // ================= cada fotograma =================
  function update(dt, pl) {
    if (!on || !G.Coop.active || !pl) return;
    const t = G.Game.st.time;
    // Tiempos de los efectos (los tuyos y los de los demás, para verlos).
    for (const p of players()) {
      if (p.pkAtkT > 0) p.pkAtkT -= dt;
      if (p.pkSpdT > 0) p.pkSpdT -= dt;
      if (p.pkInvisT > 0) p.pkInvisT -= dt;
      if (p.pebbleT > 0) p.pebbleT -= dt;
    }
    for (const [u, v] of glow) { if (v - dt <= 0) glow.delete(u); else glow.set(u, v - dt); }
    if (big && (big.t -= dt) <= 0) big = null;
    if (resultT > 0) resultT -= dt;

    // Fantasma: te mueves libre (sin chocar) y tiras piedritas.
    if (isGhost(pl)) ghostTick(dt, pl);
    for (const p of G.Coop.puppets()) if (isGhost(p) && p.anim.once) p.anim._start('Idle', false);

    // Piedritas: cada uno mira si le dan a él.
    for (let i = pebbles.length - 1; i >= 0; i--) {
      const b = pebbles[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt;
      if (!pl.dead && b.from !== me() && G.U.dist2(b.x, b.y, pl.x, pl.y - 10) < (pl.r + 8) ** 2) {
        pl.pebbleT = PEBBLE_SLOW;
        G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, G.T('¡Frenado!'), '#c8c8d8');
        G.FX.burst(b.x, b.y, '#a8a8b8', 6, 80);
        pebbles.splice(i, 1);
        continue;
      }
      if (b.t <= 0) pebbles.splice(i, 1);
    }

    // Trampas: parpadean 3 s y explotan.
    for (let i = traps.length - 1; i >= 0; i--) {
      const tr = traps[i];
      tr.t -= dt;
      if (tr.t > 0) continue;
      traps.splice(i, 1);
      G.FX.ring(tr.x, tr.y, 6, TRAP_R + 10, '#ff7b3d', 0.4, 5);
      G.FX.burst(tr.x, tr.y, '#ffb03d', 16, 180);
      if (G.Camera.sees(tr.x, tr.y, 60)) G.Audio.sfx('break');
      if (!pl.dead && !inBreak && G.U.dist2(tr.x, tr.y, pl.x, pl.y) <= (TRAP_R + pl.r) ** 2) trapHit(pl, tr);
    }

    if (G.Coop.isHost) hostTick(dt, t);
  }

  function trapHit(pl, tr) {
    pl.invuln = 0;
    const sh = G.Camera.shake;
    pl.hurt(pl.maxHp * TRAP_DMG);
    G.Camera.shake = sh;
    pl.invuln = Math.min(pl.invuln, 0.1);
    // Empujón hacia fuera de la trampa.
    const a = pl.x === tr.x && pl.y === tr.y ? Math.random() * 6.2832 : Math.atan2(pl.y - tr.y, pl.x - tr.x);
    for (let step = 60; step > 0; step -= 10) {
      const nx = pl.x + Math.cos(a) * step, ny = pl.y + Math.sin(a) * step;
      if (G.World.isFree(nx, ny, pl.r * 0.6)) { pl.x = nx; pl.y = ny; break; }
    }
    if (pl.dead) { const ev = ['pv', 'h', pl.uid || me(), null, 0, 1, 't']; send(ev); G.PvP.onNet(ev); }
  }

  function ghostTick(dt, pl) {
    const [ax, ay] = G.UI.isOpen('scr-pause') ? [0, 0] : G.Input.axis();
    const s = 210;
    pl.x += ax * s * dt; pl.y += ay * s * dt;
    const d = Math.hypot(pl.x, pl.y), lim = 1100;
    if (d > lim) { pl.x *= lim / d; pl.y *= lim / d; }
    pl.walking = ax !== 0 || ay !== 0;
    if (pl.walking) pl.moveAngle = Math.atan2(ay, ax);
    if (pl.anim.once) pl.anim._start('Idle', false);
    pl.anim.loop(pl.walking ? 'Walk' : 'Idle');
    pl.anim.dir = G.Sprites.dirFromAngle(pl.moveAngle || 0);
    // Piedrita cada 2 s hacia donde apuntas (ratón o pulgar derecho; si no, al vivo más cercano).
    if (!armed()) return;
    pebT -= dt;
    if (pebT > 0) return;
    let ang = null;
    if (G.Touch.active) { const v = G.Touch.aimVector(); if (v) ang = Math.atan2(v[1], v[0]); }
    else { const w = G.PvP.mouseWorld(); if (w) ang = Math.atan2(w[1] - pl.y, w[0] - pl.x); }
    if (ang == null) {
      let best = null, bd = 450 * 450;
      for (const p of G.Coop.puppets()) {
        if (p.dead || hidden(p)) continue;
        const dd = G.U.dist2(p.x, p.y, pl.x, pl.y);
        if (dd < bd) { bd = dd; best = p; }
      }
      if (best) ang = Math.atan2(best.y - pl.y, best.x - pl.x);
    }
    if (ang == null) { pebT = 0.3; return; }
    pebT = PEBBLE_EVERY;
    out(['pv', 'gp', me(), Math.round(pl.x), Math.round(pl.y - 10), +ang.toFixed(2)]);
    G.Audio.sfx('select');
  }

  function hostTick(dt, t) {
    // Entre rondas: a los 4 s, la siguiente.
    if (breakT > 0) {
      breakT -= dt;
      if (breakT <= 0) out(['pv', 'rs', round + 1, G.PvP.grace - PREP]);
      return;
    }
    if (!armed()) return;
    const alive = players().filter(p => !p.dead);
    // Tesoro en el centro (uno a la vez).
    if (f.treasure) {
      if (t >= nextTreasure) {
        nextTreasure = t + TREASURE_EVERY;
        if (!treasure) out(['pv', 'ts', ++tid, G.U.pick(KIND_IDS)]);
      }
      if (treasure) {
        const p = alive.find(q => G.U.dist2(q.x, q.y, 0, 0) <= (TREASURE_R + q.r) ** 2);
        if (p) out(['pv', 'tg', treasure.id, p.uid, treasure.kind]);
      }
    }
    // Suelo trampa: 2-4 círculos cada 12-18 s, cerca de los que siguen en pie y dentro de la zona.
    if (f.traps && t >= nextTrap) {
      nextTrap = t + G.U.rand(12, 18);
      const R = Math.max(80, G.PvP.zoneR(t) - TRAP_R - 10), list = [];
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n && alive.length; k++) {
        const who = alive[k % alive.length];
        let x = 0, y = 0;
        for (let tries = 0; tries < 12; tries++) {
          const a = Math.random() * 6.2832, d = G.U.rand(30, 170);
          x = who.x + Math.cos(a) * d; y = who.y + Math.sin(a) * d;
          const r = Math.hypot(x, y);
          if (r > R) { x *= R / r; y *= R / r; }
          if (list.every(([qx, qy]) => G.U.dist2(qx, qy, x, y) > (TRAP_R * 1.6) ** 2)) break;
        }
        list.push([Math.round(x), Math.round(y)]);
      }
      if (list.length) out(['pv', 'tp', list]);
    }
    // Duelo final: quedan 2 (por equipos, uno de cada equipo).
    if (f.duel && !duelDone && alive.length === 2 && (!teams || alive[0].team !== alive[1].team)) {
      duelDone = true;
      out(['pv', 'fd', +t.toFixed(2), Math.round(G.PvP.zoneR(t))]);
    }
  }

  // ================= dibujo =================
  const F = s => `800 ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  /** Suelo (game.js drawScene, debajo de todo): trampas y tesoro. */
  function drawGround(ctx) {
    if (!on || !G.Coop.active) return;
    const now = performance.now() / 1000;
    for (const tr of traps) {
      if (!G.Camera.sees(tr.x, tr.y, TRAP_R + 20)) continue;
      const k = 1 - tr.t / TRAP_T, blink = Math.sin(now * (8 + k * 22)) > 0;
      ctx.save();
      ctx.globalAlpha = blink ? 0.38 : 0.16;
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath(); ctx.ellipse(tr.x, tr.y, TRAP_R, TRAP_R * 0.62, 0, 0, 6.2832); ctx.fill();
      // Lo que falta para explotar: el círculo de dentro crece hasta el borde.
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffb03d';
      ctx.beginPath(); ctx.ellipse(tr.x, tr.y, TRAP_R * k, TRAP_R * 0.62 * k, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.strokeStyle = blink ? '#ffffff' : '#ff3b3b';
      ctx.beginPath(); ctx.ellipse(tr.x, tr.y, TRAP_R, TRAP_R * 0.62, 0, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = F(18); ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText('!', tr.x, tr.y + 7);
      ctx.fillStyle = '#ffe14d'; ctx.fillText('!', tr.x, tr.y + 7);
      ctx.restore();
    }
    if (treasure && G.Camera.sees(0, 0, 80)) {
      const d = KINDS[treasure.kind], beat = 0.5 + Math.sin(now * 5) * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.25 + beat * 0.25; ctx.fillStyle = d.col;
      ctx.beginPath(); ctx.ellipse(0, 0, TREASURE_R + 6 + beat * 6, (TREASURE_R + 6 + beat * 6) * 0.6, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(0, 0, TREASURE_R, TREASURE_R * 0.6, 0, 0, 6.2832); ctx.stroke();
      const by = -22 - Math.abs(Math.sin(now * 3)) * 8;
      ctx.font = '26px "Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(d.icon, 0, by);
      ctx.font = F(11); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
      const lb = G.T('Tesoro del PK');
      ctx.strokeText(lb, 0, by - 26); ctx.fillStyle = '#ffd23f'; ctx.fillText(lb, 0, by - 26);
      ctx.restore();
    }
  }

  /** game.js drawScene: dibuja a un jugador (invisible, fantasma, racha...). */
  function drawPlayer(ctx, p) {
    if (!on || !G.Coop.active) { p.draw(ctx); return; }
    if (hidden(p)) {
      // Para los rivales: sólo un brillo flojito si está cerca.
      const mine = G.Coop.local;
      if (mine && G.U.dist2(mine.x, mine.y, p.x, p.y) < 240 * 240) {
        const t = performance.now() / 1000;
        ctx.save();
        ctx.globalAlpha = 0.1 + Math.sin(t * 9) * 0.05; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - p.bodyH * 0.45, p.r * 1.3, p.bodyH * 0.6, 0, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 3; i++) {
          const a = t * 2 + i * 2.1;
          ctx.fillRect(Math.round(p.x + Math.cos(a) * p.r), Math.round(p.y - p.bodyH * 0.5 + Math.sin(a * 1.3) * p.bodyH * 0.4), 2, 2);
        }
        ctx.restore();
      }
      return;
    }
    const ghost = isGhost(p), g = glow.get(p.uid) || 0;
    ctx.save();
    if (ghost) {
      // Fantasma: medio transparente, con un halo lila y flotando un poco.
      const t = performance.now() / 1000;
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#b9a6ff';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.6, p.r * 0.6, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.translate(0, -5 - Math.sin(t * 3) * 3);
    }
    else if (p.pkInvisT > 0) ctx.globalAlpha = 0.4;          // tú (o tu compañero) invisible: medio transparente
    if (!ghost && !p.dead) {
      const t = performance.now() / 1000;
      if (g > 0) {
        // Racha: brillo dorado y un poco más grande.
        const R = Math.max(34, p.bodyH) * (1.1 + Math.sin(t * 8) * 0.08), cy = p.y - p.bodyH * 0.45;
        const gr = ctx.createRadialGradient(p.x, cy, R * 0.1, p.x, cy, R);
        gr.addColorStop(0, 'rgba(255,225,80,0.55)'); gr.addColorStop(1, 'rgba(255,190,40,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, cy, R, 0, 6.2832); ctx.fill();
      }
      const rings = [];
      if (p.pkAtkT > 0) rings.push(KINDS.atk.col);
      if (p.pkSpdT > 0) rings.push(KINDS.spd.col);
      rings.forEach((c, i) => {
        ctx.save(); ctx.globalAlpha *= 0.8; ctx.strokeStyle = c; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2 + i * 6, (p.r * 2 + i * 6) * 0.45, 0, 0, 6.2832); ctx.stroke();
        ctx.restore();
      });
    }
    const sc = p.anim.scale;
    if (g > 0 && !p.dead) p.anim.scale = (sc || 1) * 1.15;
    p.draw(ctx);
    p.anim.scale = sc;
    ctx.restore();
    if (ghost) {
      ctx.save();
      ctx.font = '700 7px Pixelify,"Segoe UI",sans-serif'; ctx.textAlign = 'center';
      const y = p.y - p.bodyH - 17, lb = '👻 ' + G.T('Fantasma del PK');
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(lb, p.x, y);
      ctx.fillStyle = '#d8c8ff'; ctx.fillText(lb, p.x, y);
      ctx.restore();
    }
  }

  /** Mundo, encima de todo (pvp.js drawWorld): piedritas. */
  function drawWorld(ctx) {
    if (!on || !G.Coop.active) return;
    for (const b of pebbles) {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(Math.round(b.x) - 3, Math.round(b.y) + 8, 6, 3);
      ctx.fillStyle = '#5a5a68'; ctx.fillRect(Math.round(b.x) - 4, Math.round(b.y) - 4, 8, 8);
      ctx.fillStyle = '#a8a8b8'; ctx.fillRect(Math.round(b.x) - 3, Math.round(b.y) - 3, 4, 4);
    }
  }

  /** Pantalla (pvp.js drawHud): marcador, resultado de la ronda, rachas, duelo y tus efectos. */
  function drawHud(ctx, w, h) {
    if (!on || !G.Coop.active) return;
    const pl = G.Game.player;
    ctx.save();
    ctx.textAlign = 'center';
    const txt = (s, x, y, size, col) => {
      ctx.font = F(size); ctx.lineWidth = Math.max(4, size / 5); ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
    };
    // Marcador (al mejor de 3), arriba en el centro.
    const sc = scoreLine();
    if (sc) {
      const line = G.I18n.f('Ronda {x}', round) + ' · ' + sc;
      ctx.font = F(14);
      const tw = ctx.measureText(line).width + 22, y = 118, cx = G.HUD.laneX(tw, w);
      ctx.fillStyle = 'rgba(10,14,32,.8)'; ctx.fillRect(cx - tw / 2, y - 17, tw, 24);
      ctx.fillStyle = '#ffd23f'; ctx.fillText(line, cx, y);
    }
    // Resultado de la ronda (entre rondas).
    if (inBreak) {
      const won = lastWin != null && (lastWin === me() || (teams && pl && lastWin === 'T' + pl.team));
      const head = lastWin == null ? G.T('¡Empate! Se repite la ronda') : won ? G.T(teams ? '¡Tu equipo gana la ronda!' : '¡Ganas la ronda!') : G.I18n.f('¡{x} gana la ronda!', nameOfKey(lastWin));
      ctx.fillStyle = 'rgba(8,10,24,.55)'; ctx.fillRect(0, h * 0.3, w, 112);
      txt(head, w / 2, h * 0.3 + 48, 30, won ? '#ffd23f' : '#ffffff');
      if (sc) txt(sc, w / 2, h * 0.3 + 84, 20, '#bff3ff');
      txt(G.I18n.f('Siguiente ronda en {x} s', Math.max(1, Math.ceil(resultT))), w / 2, h * 0.3 + 104, 12, '#d0d8f0');
    }
    // Rachas y duelo final: texto grande un momento.
    if (big) {
      const a = Math.min(1, big.t / 0.4), pop = 1 + Math.max(0, big.t - 2.2) * 0.6;
      ctx.globalAlpha = a;
      txt(big.text, w / 2, h * 0.24, Math.round(34 * pop), big.col);
      if (big.sub) txt(big.sub, w / 2, h * 0.24 + 26, 15, '#ffffff');
      ctx.globalAlpha = 1;
    }
    // Tus efectos del tesoro, encima de la barra de movimientos.
    if (pl && !pl.dead) {
      const list = [];
      if (pl.pkAtkT > 0) list.push([KINDS.atk, pl.pkAtkT]);
      if (pl.pkSpdT > 0) list.push([KINDS.spd, pl.pkSpdT]);
      if (pl.pkInvisT > 0) list.push([KINDS.inv, pl.pkInvisT]);
      if (pl.pebbleT > 0) list.push([{ name: '¡Frenado!', icon: '🪨', col: '#c8c8d8' }, pl.pebbleT]);
      list.forEach(([d, t], i) => txt(`${d.icon} ${G.T(d.name)} ${Math.ceil(t)} s`, w / 2, h - 132 - i * 22, 14, d.col));
    }
    ctx.restore();
  }

  return { begin, reset, onNet, onKo, update, hostRoundOver, hidden, isGhost, atkK, timeScale, zoneCap, scoreLine,
           drawGround, drawPlayer, drawWorld, drawHud, SEEK_R, DUEL_R, KINDS,
           get active() { return on && G.Coop.active; },
           get inBreak() { return on && inBreak; },
           get treasure() { return on ? treasure : null; },
           get features() { return f; },
           get _dbg() { return { round, scores, inBreak, breakT, treasure, traps, pebbles, duel, streak: [...streak], glow: [...glow], big, f, nextTreasure, nextTrap }; } };
})();
