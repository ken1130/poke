/* ============ gmaxfoe.js — jefes Dinamax / Gigamax (2026-10-19) ============
 * El dueño: «el Dinamax, mejor en otro sitio; el jugador ya tiene la Megaevolución». Así que el
 * Gigamax es de los ENEMIGOS: algunos jefes salen gigamaxizados (maybe, desde spawner.js, guard.js
 * y rift.js):
 *   normal          jefes de siempre (no los del piso ni el Señor): CHANCE.normal
 *   tower           jefes de la torre sin fin: CHANCE.tower
 *   guard           Proteger a Dazhuang: todos los jefes de oleada desde la 10
 *   legend          Desafío legendario: uno de cada 3 legendarios (rift.js)
 * Un jefe Dinamax: tamaño ×SIZE, vida ×HP, daño ×DMG, nubes de su color, y cada CD s lanza su
 * «Maxi» contra el jugador más cercano: un círculo de aviso (WARN s) y luego el golpe. Los de la
 * hoja (G.MaxMoves.GMAX: Charizard, Pikachu, Meowth...) usan su movimiento Gigamax propio.
 * Grupo: lo decide el anfitrión (['gmx', id, gid, x, y, r, dmg]) y cada uno mira si le dio a su
 * Pokémon. El aspecto viaja en 'ne' (posición 12: el gid).
 */
G.GmaxFoe = (() => {
  const SIZE = 1.35, HP = 2, DMG = 1.15, CD = [6, 8], CD0 = 3, WARN = 1.1, RANGE = 460;
  const CHANCE = { normal: 0.25, tower: 0.4 };
  const GUARD_FROM = 10, LEGEND_EVERY = 3;
  const COL = t => G.U.TYPE_COLOR[t] || '#ff3a4a';
  // «Maxi» de cada tipo contra ti (el nombre es el de maxmoves.js).
  const BY_TYPE = {
    normal:   { r: 110, k: 1.3 },
    fire:     { r: 100, k: 1.0, zone: { r: 110, life: 3, k: 0.25 } },
    water:    { r: 120, k: 1.0, slow: 2.5 },
    electric: { r: 110, k: 1.1, slow: 2 },
    grass:    { r: 110, k: 0.9, zone: { r: 120, life: 3, k: 0.2 }, slow: 1.5 },
    ice:      { r: 100, k: 1.0, slow: 3 },
    fighting: { r: 70,  k: 1.8, knock: 260 },
    poison:   { r: 110, k: 0.8, zone: { r: 120, life: 3, k: 0.25 } },
    ground:   { r: 150, k: 1.1 },
    flying:   { r: 130, k: 0.9, knock: 320 },
    psychic:  { r: 110, k: 1.0, weak: 3 },
    bug:      { r: 110, k: 0.9, weak: 3 },
    rock:     { r: 120, k: 1.2 },
    ghost:    { r: 110, k: 1.0, noheal: 3 },
    dragon:   { r: 120, k: 1.5 },
    dark:     { r: 110, k: 1.0, weak: 3 },
    steel:    { r: 110, k: 1.1, zone: { r: 110, life: 4, k: 0.2 } },
    fairy:    { r: 110, k: 1.0, healSelf: 0.04 }
  };

  /** Lo que lanza un jefe de `dex` y tipos `types`: el Gigamax de la hoja o el «Maxi» de su tipo. */
  function defFor(dex, types) {
    const g = G.MaxMoves.GMAX[dex];
    if (g) {
      // Los efectos del movimiento Gigamax, vistos desde el otro lado.
      const d = { id: String(dex), type: g.type, name: g.name, col: g.col, r: g.single ? 80 : Math.max(100, g.r || 110),
                  k: g.single ? 1.8 : 1.1 };
      if (g.zone || g.burn || g.poison) d.zone = { r: (g.zone && g.zone.r) || 110, life: (g.zone && g.zone.life) || 3, k: 0.25 };
      if (g.slow || g.root || g.freeze) d.slow = 2.5;
      if (g.confuse) d.weak = 3;
      if (g.knock) d.knock = Math.min(320, g.knock + 60);
      if (g.heal) d.healSelf = g.heal + 0.02;
      if (g.coins) d.coins = 6;
      if (g.crit) d.rage = 0.08;
      return d;
    }
    const t = types && BY_TYPE[types[0]] ? types[0] : 'normal';
    return Object.assign({ id: 't:' + t, type: t, name: G.MaxMoves.info(t)[0], col: COL(t) }, BY_TYPE[t]);
  }
  const defOf = gid => {
    if (!gid) return null;
    if (gid.startsWith('t:')) { const t = gid.slice(2); return BY_TYPE[t] ? Object.assign({ id: gid, type: t, name: G.MaxMoves.info(t)[0], col: COL(t) }, BY_TYPE[t]) : null; }
    return G.MaxMoves.GMAX[gid] ? defFor(+gid || gid, null) : null;
  };

  let warns = [], zones = [];
  function reset() { warns = []; zones = []; }

  /** Aspecto: más grande y con sus datos (también en las copias de un invitado). */
  function look(e, gid) {
    const d = defOf(gid);
    if (!d || e.gmaxFoe) return;
    e.gmaxFoe = { gid, d, cd: CD0 + Math.random() * 2 };
    e.scale *= SIZE;
    e.anim = new G.Sprites.Animator(e.dex, e.scale, e.shiny);
    e.r = G.Sprites.bodyRadius(e.dex, e.scale);
    e.bodyH = G.Sprites.bodyHeight(e.dex, e.scale);
  }
  /** Lo hace Dinamax (antes de G.EnemyMgr.add, para que el grupo lo reciba así). */
  function make(e) {
    if (!e || e.gmaxFoe) return;
    look(e, defFor(e.dex, e.types).id);
    // Vida ×HP sobre la de antes del medidor de daño (spawner.js dpsFloor); si el medidor ya la subía,
    // como mínimo ×1,5 sobre eso (20 s → 30 s de vuestro daño), no ×2 encima (2026-10-20: eran 40 s).
    const up = e._dpsUp || 1;
    e.maxHp = e.hp = Math.round(e.maxHp * Math.min(HP, Math.max(HP / up, 1.5)));
    e.dmg *= DMG;
  }
  /** ¿Sale Dinamax este jefe? (spawner.js: jefes de siempre de la partida normal y de la torre) */
  function maybe(e) {
    if (!e || !e.boss || e.floorBoss || e.raid || e.legend || e.dummy || G.PvP.on) return;
    const c = CHANCE[G.Modes.run];
    if (c && Math.random() < c) make(e);
  }
  /** Proteger a Dazhuang: los jefes de oleada, desde la GUARD_FROM. */
  function guardBoss(e, wave) { if (wave >= GUARD_FROM) make(e); }
  /** Desafío legendario: uno de cada LEGEND_EVERY (el 3.º, el 6.º...). */
  function legendBoss(e, wins) { if ((wins + 1) % LEGEND_EVERY === 0) make(e); }

  const authority = () => !G.Coop.active || G.Coop.isHost;

  /** Cada fotograma: los jefes lanzan (anfitrión o solo), los avisos caen y las zonas pegan. */
  function update(dt) {
    if (authority()) {
      for (const e of G.EnemyMgr.all()) {
        const f = e.gmaxFoe;
        if (!f || e.dead || e.remote) continue;
        if (e.disabled) continue;
        if ((f.cd -= dt) > 0) continue;
        const tg = nearestPlayer(e);
        if (!tg) { f.cd = 0.5; continue; }
        f.cd = G.U.rand(CD[0], CD[1]);
        const d = f.d, dmg = Math.round(e.dmg * d.k * 1.4);
        // Un poco por delante de donde vas (para que haya que moverse, no sólo quedarse quieto).
        const x = Math.round(tg.x + (tg._vx || 0) * 0.35), y = Math.round(tg.y + (tg._vy || 0) * 0.35);
        start(e.id, f.gid, x, y, d.r, dmg);
        if (G.Coop.active) G.Coop.broadcast(['gmx', e.id, f.gid, x, y, d.r, dmg]);
        if (d.healSelf) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * d.healSelf); G.FX.ring(e.x, e.y, 6, 60, '#5fe08a', 0.4, 3); }
        if (d.rage) e.dmg *= 1 + d.rage;
      }
    }
    for (let i = warns.length - 1; i >= 0; i--) {
      const w = warns[i];
      if ((w.t += dt) < WARN) continue;
      warns.splice(i, 1);
      impact(w);
    }
    const pl = G.Game.player;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.t += dt;
      if (z.t >= z.life) { zones.splice(i, 1); continue; }
      if ((z.tick -= dt) > 0) continue;
      z.tick = 0.5;
      if (pl && !pl.dead && G.U.dist2(pl.x, pl.y, z.x, z.y) < (z.r + pl.r) ** 2) pl.hurt(z.dmg, z.type, 's');
    }
  }
  /** Blanco: el jugador más cercano o, en Proteger a Dazhuang, Dazhuang si está más cerca (2026-10-19). */
  function nearestPlayer(e) {
    let best = null, bd = RANGE * RANGE;
    const cands = G.Game.everyone().slice();
    if (G.Modes.run === 'guard') { const dz = G.Guard.target(); if (dz) cands.push(dz); }
    for (const p of cands) {
      if (!p || p.dead) continue;
      const d2 = G.U.dist2(p.x, p.y, e.x, e.y);
      if (d2 < bd) { bd = d2; best = p; }
    }
    return best;
  }

  /** Empieza un «Maxi»: aviso en el suelo y el nombre encima del jefe. */
  function start(id, gid, x, y, r, dmg) {
    const d = defOf(gid);
    if (!d) return;
    warns.push({ id, d, x, y, r, dmg, t: 0 });
    const e = G.EnemyMgr.get(id);
    if (e && G.Camera.sees(e.x, e.y, 120)) {
      G.FX.dmgText(e.x, e.y - e.bodyH - 26, G.T(d.name) + '!', d.col, true);
      G.Audio.sfx('surge');
    }
  }
  /** Cae: lo que se ve (maxmoves.js) y, a tu Pokémon, lo que le toca si está dentro. */
  function impact(w) {
    const d = w.d, gid = G.MaxMoves.GMAX[d.id] ? d.id : null;
    G.MaxMoves.fx(d.type, w.x, w.y, gid);
    if (d.zone) zones.push({ type: d.type, x: w.x, y: w.y, r: d.zone.r, life: d.zone.life, t: 0, tick: 0.5, dmg: Math.max(1, Math.round(w.dmg * d.zone.k)), col: d.col });
    if (d.coins && authority()) for (let n = 0; n < d.coins; n++) G.Pickups.drop('coin', w.x + G.U.rand(-50, 50), w.y + G.U.rand(-30, 30), 3);
    if (G.Modes.run === 'guard' && authority()) G.Guard.blast(w.x, w.y, w.r, w.dmg);   // también a Dazhuang (guard.js)
    const pl = G.Game.player;
    if (!pl || pl.dead || G.U.dist2(pl.x, pl.y, w.x, w.y) > (w.r + pl.r * 0.5) ** 2) return;
    pl.hurt(w.dmg, d.type, 's');                              // «Maxi»: Defensa Esp.
    if (pl.dead) return;
    let msg = null;
    if (d.slow) { pl.lordSlowT = Math.max(pl.lordSlowT || 0, d.slow); msg = '¡Más lento!'; }
    if (d.weak) { pl.lordWeakT = Math.max(pl.lordWeakT || 0, d.weak); msg = '¡Menos ataque!'; }
    if (d.noheal) { pl.lordNoHealT = Math.max(pl.lordNoHealT || 0, d.noheal); msg = '¡No puedes curarte!'; }
    if (d.knock) {
      const [nx, ny] = G.U.norm(pl.x - w.x, pl.y - w.y);
      const tx = pl.x + (nx || 1) * d.knock * 0.4, ty = pl.y + (ny || 0) * d.knock * 0.4;
      if (!G.World.isWall(tx, ty)) { pl.x = tx; pl.y = ty; }
    }
    if (msg) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 20, G.T(msg), d.col, false);
  }

  /** Invitado: un «Maxi» que ha empezado el anfitrión. */
  function onNet(ev) {
    if (ev[0] !== 'gmx') return;
    const [, id, gid, x, y, r, dmg] = ev;
    if (!isFinite(x) || !isFinite(y)) return;
    start(id, gid, x, y, G.U.clamp(+r || 100, 40, 200), Math.max(0, +dmg || 0));
  }

  /** Suelo: los avisos (círculo que se va llenando) y las zonas. */
  function draw(ctx) {
    const T = performance.now() / 1000;
    for (const z of zones) {
      if (!G.Camera.sees(z.x, z.y, z.r)) continue;
      const fade = Math.min(1, (z.life - z.t) / 0.4, z.t / 0.15);
      ctx.save();
      ctx.globalAlpha = 0.25 * fade; ctx.fillStyle = z.col;
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.8 * fade;
      for (let k = 0; k < 16; k++) {
        const a = k * 2.4 + z.x, rr = z.r * (0.2 + ((k * 37) % 80) / 100);
        const h = 4 + Math.sin(T * 8 + k) * 2.5;
        ctx.fillStyle = (k & 1) ? z.col : '#ffffff';
        ctx.fillRect(Math.round(z.x + Math.cos(a) * rr), Math.round(z.y + Math.sin(a) * rr * 0.55 - h), 3, Math.round(h));
      }
      ctx.restore();
    }
    for (const w of warns) {
      if (!G.Camera.sees(w.x, w.y, w.r)) continue;
      const k = Math.min(1, w.t / WARN), blink = Math.sin(T * 18) > 0;
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.2 * k; ctx.fillStyle = w.d.col;
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.r * k, w.r * 0.55 * k, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = blink ? 0.95 : 0.6; ctx.strokeStyle = '#ff3a4a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.r, w.r * 0.55, 0, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = w.d.col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.r - 6, (w.r - 6) * 0.55, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
  }

  /** Nubes Dinamax alrededor del jefe (antes de dibujarlo). */
  function drawAura(ctx, e) {
    const f = e.gmaxFoe;
    if (!f || e.dead) return;
    const t = performance.now() / 1000, R = Math.max(22, e.r * 1.3), col = f.d.col;
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * 6.2832 + t * 0.8, wob = Math.sin(t * 3 + i) * 3;
      const x = e.x + Math.cos(a) * (R + wob), y = e.y + Math.sin(a) * (R * 0.42 + wob * 0.4), s = 7 + (i % 3) * 2;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = i % 2 ? '#c81e32' : col;
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#ffd0d4';
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), 2, 2);
    }
    const hy = e.y - (e.bodyH || 40) - 12;
    for (let i = 0; i < 9; i++) {
      const x = e.x + (i - 4) * 8 + Math.sin(t * 2 + i) * 2, y = hy + Math.sin(t * 2.5 + i * 1.7) * 3;
      ctx.globalAlpha = 0.5; ctx.fillStyle = i % 2 ? '#dc283c' : col;
      ctx.fillRect(Math.round(x - 4), Math.round(y - 4), 9, 9);
    }
    ctx.restore();
  }

  return { reset, make, look, maybe, guardBoss, legendBoss, update, onNet, draw, drawAura, defFor, CHANCE, GUARD_FROM, LEGEND_EVERY };
})();
