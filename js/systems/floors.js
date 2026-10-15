/* ============ floors.js — pisos del dungeon y ataque combinado (2026-10-15) ============
 *
 * Escaleras (sólo en la partida normal): desde el minuto 5, cada 5 min aparecen unas
 * escaleras lejos de vosotros. Cuando TODOS los que siguen en pie están encima 2 s,
 * se baja al siguiente piso: mapa nuevo (otra semilla) y el bioma siguiente; fuera
 * enemigos, disparos y objetos del suelo (los discos y pociones de cada uno se
 * vuelven a dejar cerca). Cada piso: enemigos con +15 % de vida y +20 % de
 * experiencia y monedas (acumulativo).
 *
 * Ataque combinado (sólo en grupo): la barra se llena mientras estás cerca de un
 * compañero (~20 s); llena, con F (o el botón en móvil) estalla una gran explosión
 * entre los dos.
 *
 * Cooperativo: las escaleras y la bajada las decide el anfitrión (['st', x, y] y
 * ['fl', semilla, piso]); el ataque combinado lo hace cada uno (su daño va al
 * anfitrión como cualquier golpe) y los demás sólo ven el efecto (['cb', ...]).
 */
G.Floors = (() => {
  const T = () => G.Game.st.time;
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const FIRST = 300, EVERY = 300, STAND = 2, STAIRS_R = 50;

  let floor = 0, stairs = null, nextAt = FIRST, standT = 0, fadeT = 0;
  let combo = 0, comboFlash = 0;

  function reset() { floor = 0; stairs = null; nextAt = FIRST; standT = 0; fadeT = 0; combo = 0; comboFlash = 0; }
  const allowed = () => G.Modes.run === 'normal' && !G.PvP.on && !G.Rift.inArena;

  // ---------------- escaleras ----------------

  function spawnStairs(live) {
    const p = G.U.pick(live);
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * 6.2832, d = G.U.rand(700, 1000);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      let ok = G.World.isFree(x, y, 30);
      for (let j = 0; ok && j < 8; j++) ok = G.World.isFree(x + Math.cos(j * 0.785) * 44, y + Math.sin(j * 0.785) * 32, 10);
      if (!ok) continue;
      setStairs(Math.round(x), Math.round(y));
      if (G.Coop.active) G.Coop.broadcast(['st', stairs.x, stairs.y]);
      G.Spawner.say(G.T('¡Han aparecido escaleras al siguiente piso! Míralas en el minimapa'), 3.5, true);
      G.Audio.sfx('surge');
      return;
    }
  }
  function setStairs(x, y) { stairs = x == null ? null : { x, y, t: 0 }; standT = 0; }

  /** Quién está encima de las escaleras (de los que siguen en pie). */
  function onStairs(players) {
    const live = players.filter(p => !p.dead);
    const on = live.filter(p => G.U.dist2(p.x, p.y, stairs.x, stairs.y) < STAIRS_R * STAIRS_R).length;
    return [on, live.length];
  }

  /** Cada fotograma de juego, en todos los ordenadores. */
  function update(dt, players) {
    if (fadeT > 0) fadeT -= dt;
    if (comboFlash > 0) comboFlash -= dt;
    comboTick(dt, players);
    if (!authority()) { if (stairs) stairs.t += dt; return; }
    if (!allowed()) return;
    const live = players.filter(p => !p.dead);
    if (!live.length) return;
    if (!stairs && T() >= nextAt) { nextAt = T() + EVERY; spawnStairs(live); }
    if (!stairs) return;
    stairs.t += dt;
    const [on, n] = onStairs(players);
    if (on >= n && n > 0) {
      standT += dt;
      if (standT >= STAND) {
        const seed = Math.floor(Math.random() * 1e6) + 1, next = floor + 1;
        if (G.Coop.active) G.Coop.broadcast(['fl', seed, next]);
        descend(seed, next);
      }
    } else standT = Math.max(0, standT - dt * 2);
  }

  /** Bajar al piso n (todos lo hacen igual; el anfitrión además recoloca discos y pociones). */
  function descend(seed, n) {
    const host = authority();
    // Discos y pociones de cada uno: se vuelven a dejar cerca en el piso nuevo.
    const keep = host ? G.Pickups.all().filter(p => p.kind === 'sbox' || p.kind === 'potion').map(p => [p.kind, p.value]) : [];
    floor = n; stairs = null; standT = 0; nextAt = T() + EVERY;
    G.World.reset(seed);
    if (!G.Game.fixedScene) G.World.setBiome(Math.floor(T() / 240) + floor, true);
    G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.Pickups.clear(); G.FX.clear();
    G.Path.clear(); G.Hazards.clear(); G.Rift.reset(); G.Dungeon.clearSites();
    if (G.Raid.clear && host) G.Raid.clear();
    // Todos al centro del piso nuevo (cada uno el suyo, un poco separados).
    const pl = G.Game.player;
    if (pl) {
      const i = G.Coop.active ? Math.max(0, G.Coop.players().indexOf(pl)) : 0;
      pl.x = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 40; pl.y = 0;
      G.Camera.x = pl.x; G.Camera.y = pl.y;
      pl.invuln = Math.max(pl.invuln || 0, 2);
    }
    if (host) for (const [kind, owner] of keep) {
      for (let k = 0; k < 30; k++) {
        const a = Math.random() * 6.2832, d = G.U.rand(260, 480), x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (G.World.isFree(x, y, 16)) { G.Pickups.drop(kind, x, y, owner); break; }
      }
    }
    fadeT = 2.2;                       // el cartel "B2F" del fundido (drawHud)
    G.Audio.sfx('biome');
  }

  /** Spawner: un enemigo recién creado en este piso. */
  function scaleEnemy(e) {
    if (!floor || !e) return;
    const k = 1 + 0.15 * floor;
    e.maxHp = e.hp = Math.round(e.maxHp * k);
    e.xp = Math.round(e.xp * (1 + 0.2 * floor));
  }
  const coinMul = () => 1 + 0.2 * floor;

  // ---------------- ataque combinado ----------------

  const COMBO_R = 140, COMBO_FILL = 20, BLAST_R = 300;
  const nearestMate = pl => {
    let best = null, bd = Infinity;
    for (const o of G.Coop.puppets()) {
      if (o.dead) continue;
      const d = G.U.dist2(o.x, o.y, pl.x, pl.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { o: best, d: Math.sqrt(bd) } : null;
  };

  function comboTick(dt, players) {
    const pl = G.Game.player;
    if (!G.Coop.active || G.PvP.on || !pl || pl.dead) return;
    const m = nearestMate(pl);
    if (m && m.d < COMBO_R) combo = Math.min(1, combo + dt / COMBO_FILL);
    else combo = Math.max(0, combo - dt / 60);
    if (combo >= 1 && G.Input.tap('keyf')) fireCombo();
  }

  function fireCombo() {
    const pl = G.Game.player;
    if (combo < 1 || !pl || pl.dead) return;
    const m = nearestMate(pl);
    const mate = m ? m.o : pl;
    const x = (pl.x + mate.x) / 2, y = (pl.y + mate.y) / 2;
    combo = 0;
    const dmg = 250 * pl.atk * (1 + 0.04 * pl.level);
    for (const e of G.EnemyMgr.queryCircle(x, y, BLAST_R)) {
      if (e.dead) continue;
      e.hurt(dmg, '#ffe14d', e.x - x, e.y - y, 260, 'crit');
      pl.dmgDealt += dmg;
    }
    const ca = typeColor(pl), cb = typeColor(mate);
    comboFx(x, y, ca, cb);
    if (G.Coop.isHost) G.Coop.broadcast(['cb', Math.round(x), Math.round(y), ca, cb]);
    else G.Coop.toHost(['cb', Math.round(x), Math.round(y), ca, cb]);
  }
  const typeColor = p => G.U.TYPE_COLOR[(p.mon && p.mon.types && p.mon.types[0]) || 'normal'] || '#ffffff';

  /** Lo que se ve del ataque combinado (también para los demás). */
  function comboFx(x, y, ca, cb) {
    comboFlash = 0.5;
    G.FX.ring(x, y, 10, BLAST_R, ca, 0.7, 8);
    G.FX.ring(x, y, 30, BLAST_R * 0.8, cb, 0.9, 6);
    G.FX.ring(x, y, 4, BLAST_R * 1.15, '#ffffff', 0.5, 3);
    G.FX.burst(x, y - 20, ca, 40, 320);
    G.FX.burst(x, y - 20, cb, 40, 280);
    G.FX.burst(x, y - 20, '#fff3b0', 24, 200);
    if (G.U.dist2(x, y, G.Camera.x, G.Camera.y) < 900 * 900) G.Camera.kick(1.1);
    G.Audio.sfx('legend');
    G.Spawner.say(G.T('¡ATAQUE COMBINADO!'), 1.8, true);
  }

  // ---------------- red ----------------

  function onNet(ev) {
    if (ev[0] === 'st') setStairs(ev[1], ev[2]);
    else if (ev[0] === 'fl') descend(ev[1], ev[2]);
    else if (ev[0] === 'cb') comboFx(ev[1], ev[2], ev[3], ev[4]);
  }

  // ---------------- dibujo ----------------

  /** Las escaleras, para ordenarlas con lo demás del suelo (game.js drawScene). */
  function drawable() {
    if (!stairs) return null;
    return { y: stairs.y - 4000, draw: drawStairs };   // planas: debajo de todo
  }
  function drawStairs(ctx) {
    const s = stairs;
    if (!s || !G.Camera.sees(s.x, s.y, 120)) return;
    const now = performance.now() / 1000;
    const img = G.Tiles.propSprite(G.World.biome, 'stairs', 0), k = 2;
    ctx.save();
    // Halo azul que late para que se vean desde lejos.
    ctx.globalAlpha = 0.18 + Math.sin(now * 3) * 0.08;
    ctx.fillStyle = '#7fb8ff';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 58, 40, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(s.x - img.width * k / 2), Math.round(s.y - img.height * k / 2), img.width * k, img.height * k);
    if (Math.random() < 0.06) G.FX.twinkle(s.x + G.U.rand(-30, 30), s.y + G.U.rand(-24, 20));
    // Cartel y, si alguien espera encima, cuántos faltan.
    const pls = G.Coop.active ? G.Coop.players() : [G.Game.player];
    const [on, n] = onStairs(pls);
    ctx.font = '800 12px Pixelify,"Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center';
    const lbl = on > 0 && n > 1 ? G.I18n.f('Todos a las escaleras: {x}/{x}', on, n) : G.T('BAJAR AL SIGUIENTE PISO');
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
    const ly = s.y - 44 - Math.abs(Math.sin(now * 2.5)) * 4;
    ctx.strokeText(lbl, s.x, ly);
    ctx.fillStyle = '#cfe4ff'; ctx.fillText(lbl, s.x, ly);
    if (on > 0 && on >= n) {
      const f = Math.min(1, standT / STAND);
      ctx.strokeStyle = '#7fb8ff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(s.x, s.y, 46, -Math.PI / 2, -Math.PI / 2 + 6.2832 * (authority() ? f : (now % 1))); ctx.stroke();
    }
    ctx.restore();
  }

  /** HUD (coordenadas de pantalla): piso, barra del combinado y fundido al bajar. */
  function drawHud(ctx, w, h, pl, F, roundRect) {
    ctx.save();
    if (floor > 0 || (allowed() && T() > FIRST - 1)) {
      ctx.textAlign = 'center';
      ctx.font = F(800, 12);
      ctx.fillStyle = '#9fc8ff';
      ctx.fillText('B' + (floor + 1) + 'F', w / 2 - 62, 42);
    }
    if (G.Coop.active && !G.PvP.on && pl && !pl.dead) {
      const x = 16 + 48 + 168 + 10, y = 37, bw = 74;
      ctx.textAlign = 'left';
      ctx.font = F(800, 9);
      ctx.fillStyle = combo >= 1 ? '#ffe14d' : '#cfd8ea';
      const touch = G.Touch.active;
      ctx.fillText(G.T('Combo') + (combo >= 1 ? (touch ? '!' : ' [F]') : ''), x, y - 3);
      roundRect(ctx, x, y, bw, 8, 4); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
      if (combo > 0) {
        ctx.save(); roundRect(ctx, x, y, bw, 8, 4); ctx.clip();
        const g = ctx.createLinearGradient(x, 0, x + bw, 0);
        g.addColorStop(0, '#ff8ad8'); g.addColorStop(1, '#ffe14d');
        ctx.fillStyle = combo >= 1 && Math.sin(performance.now() / 90) > 0 ? '#ffffff' : g;
        ctx.fillRect(x, y, bw * combo, 8);
        ctx.restore();
      }
      // Móvil: botón grande cuando está lleno.
      if (combo >= 1 && touch) {
        const S = 64, bx = w - S - 24, by = h - S - 150;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(bx + S / 2, by + S / 2, S / 2, 0, 6.2832);
        ctx.fillStyle = Math.sin(performance.now() / 120) > 0 ? '#ffd23f' : '#ff8ad8'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#2a1a08'; ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center'; ctx.font = F(800, 13); ctx.fillStyle = '#1a1208';
        ctx.fillText(G.T('Combo'), bx + S / 2, by + S / 2 + 5);
        G.Touch.addButton(bx, by, S, S, fireCombo, 8);
      }
    }
    ctx.restore();
  }

  /** Fundido al bajar: lo último que se dibuja (encima del HUD y el minimapa; game.js render). */
  function drawFade(ctx, w, h, F) {
    ctx.save();
    if (fadeT > 0) {
      // Fundido a negro al bajar, con el piso nuevo en grande (como en Mundo Misterioso).
      const a = Math.min(1, fadeT / 0.8);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.font = F(800, 40); ctx.fillStyle = '#cfe4ff';
      ctx.fillText('B' + (floor + 1) + 'F', w / 2, h / 2);
      ctx.font = F(700, 14); ctx.fillStyle = '#9fc8ff';
      ctx.fillText(G.T('Enemigos más fuertes, más premios'), w / 2, h / 2 + 30);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  return { reset, update, onNet, scaleEnemy, drawable, drawHud, drawFade, fireCombo, comboFx, descend,
           get floor() { return floor; }, get stairs() { return stairs; }, get coinMul() { return coinMul(); },
           get combo() { return combo; }, set combo(v) { combo = v; } };
})();
