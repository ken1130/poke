/* ============ artifacts.js — lo que hacen los artefactos (2026-10-16) ============
 * Los artefactos son objetos equipables especiales (data/items.js, ARTS): sólo salen de
 * los cofres con candado (10 %), ocupan un hueco de objeto y sólo otro artefacto los
 * sustituye (game.js offerItem). Aquí está lo que no cabe en on/off:
 *
 *   quicksilver  huellas que duran 1 s y hacen daño al pisarlas (update/draw)
 *   arsenal      Danza Espada hasta Nv. 15 (buffCap); el crítico va en on/off
 *   elderwand    cada ataque −5 % de recarga, hasta −60 %; al moverte vuelve a 0
 *                (onAttack; player.js cdK y el reinicio al caminar)
 *   liver        Fortaleza hasta Nv. 10 (buffCap); inmune a proyectiles (blocked, combat.js)
 *   dice         ×2 (90 %) o 0 (10 %) en cada golpe (diceK/zeroed/miss, combat.js)
 *   climber      cada golpe deja al enemigo con al menos 6 quemaduras (~20/s) (onHit)
 *   (2026-10-17, tabla V3.1 del dueño)
 *   tank64       +500 de vida y ×1,3 de tamaño (player.setArtSize)
 *   iceghost     atraviesa el terreno fuera de salas/arena (player.js) y a los enemigos: no
 *                hacen daño al chocar y se congelan 1 s (combat.js resolve → frozen); al
 *                quitártelo, unstick te saca de la pared
 *   cleaver      sangrado aparte (30 × ataque /s, hasta que caen) · socks: veneno aparte (18 /s, 3 s)
 *                (onHit → G.Combat.artDot)
 *   fishrod      cada 15 s pescas un Pokémon de Agua que lucha 40 s (hasta 3); dispara sólo
 *                en el ordenador de su dueño; los demás lo ven por myState [23] (fishCode)
 *   goat         ×1,6 daño, ×2 curación, ×1,5 vida, −25 % recarga, ×1,3 velocidad (on/off, player.js)
 *
 * Cooperativo: cada uno lleva el suyo; las huellas y las quemaduras las calcula el que
 * las lleva (e.hurt / la quemadura de un enemigo copia se mandan al anfitrión).
 */
G.Arts = (() => {
  const A = () => G.Items.ART;
  let steps = [];               // huellas: { x, y, t, ang, side }
  let stepAcc = 0, stepSide = 0;
  const stepHit = new Map();    // id del enemigo -> cuándo le hizo daño una huella por última vez
  let zero = false;             // el último golpe ha salido "nada" en los dados
  let blockT = 0;

  function reset() { steps = []; stepHit.clear(); stepAcc = 0; zero = false; ice = []; fishLive.clear(); }

  // ---------------- Fantasma de Hielo ----------------
  let ice = [];                 // bloques de hielo: { e, until } (performance.now)
  /** Un enemigo se ha quedado congelado (combat.js resolve). */
  function frozen(e, secs) {
    ice = ice.filter(b => b.e !== e);
    ice.push({ e, until: performance.now() + secs * 1000 });
    if (G.Camera.sees(e.x, e.y, 30)) {
      G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#bff3ff', 8, 110);
      for (let k = 0; k < 4; k++) G.FX.sp('shard', 'ice', e.x, e.y - e.bodyH * 0.5, { vx: G.U.rand(-90, 90), vy: G.U.rand(-110, -30), life: 0.35, angle: Math.random() * 6.3, scale: 1.2 });
    }
  }
  /** Al quitarte el Fantasma de Hielo dentro de una pared o una roca: al sitio libre más cercano. */
  function unstick(p) {
    if (!p || G.World.isFree(p.x, p.y, p.r * 0.8, true)) return;
    for (let d = 16; d <= 640; d += 16) for (let k = 0; k < 16; k++) {
      const a = k / 16 * 6.2832, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (G.World.isFree(x, y, p.r, true)) { p.x = x; p.y = y; G.FX.ring(x, y, 4, 40, '#bff3ff', 0.3, 3); return; }
    }
  }

  // ---------------- Caña de Ben Simmons ----------------
  // Pokémon de Agua que se pueden pescar (los que tengan sprite).
  const FISH = [7, 54, 60, 79, 86, 90, 98, 116, 118, 120, 129, 158, 183, 194, 258, 270, 283, 318, 339, 349, 393, 418, 456, 501, 535, 656, 728, 816, 912];
  let fishPool = null;
  const fishList = () => fishPool || (fishPool = FISH.filter(d => G.DEX_BY[d] && G.SPRITE_META[d]));
  const fishLive = new Map();   // jugador -> [{ dex, x, y, anim, face, shotT }]
  /** Para myState [23]: hasta 3 números de Pokédex en un número (0 = ninguno). */
  function fishCode(p) {
    if (!p || !p.hasItem || !p.hasItem('fishrod') || !p.fishes) return 0;
    return p.fishes.slice(0, 3).reduce((a, f, i) => a + f.dex * Math.pow(1100, i), 0);
  }
  const decodeFish = c => { const out = []; while (c > 0 && out.length < 3) { out.push(c % 1100); c = Math.floor(c / 1100); } return out; };
  /** Tu caña: pesca cada 15 s. */
  function fishTick(dt, pl) {
    const F = A().fishrod, now = G.Game.st.time;
    pl.fishes = (pl.fishes || []).filter(f => f.until > now);
    if ((pl.fishT = (pl.fishT == null ? 3 : pl.fishT) - dt) > 0) return;
    pl.fishT = F.every;
    if (pl.fishes.length >= F.max || (G.Dungeon && G.Dungeon.inRoom)) return;
    const list = fishList();
    if (!list.length) return;
    const dex = G.U.pick(list);
    pl.fishes.push({ dex, until: now + F.life });
    G.Sprites.preload([dex], 8000, false);
    G.FX.burst(pl.x + 30, pl.y - 6, '#8ccaff', 14, 160);
    for (let k = 0; k < 3; k++) G.FX.sp('splash', 'water', pl.x + 20 + k * 10, pl.y + 4, { life: 0.4, scale: 1.4, frameRate: 9 });
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, G.I18n.f('¡Has pescado a {x}!', G.T(G.DEX_BY[dex].name)), '#8ccaff', true);
    G.Audio.sfx('select');
  }
  /** Mueve y anima los pescados de todos; dispara sólo los tuyos. */
  function fishUpdate(dt, pl) {
    for (const p of G.Game.everyone()) {
      const want = p === pl ? (p.hasItem && p.hasItem('fishrod') && p.fishes ? p.fishes.map(f => f.dex) : []) : decodeFish((p.net && p.net.fc) || 0);
      let arr = fishLive.get(p) || [];
      if (!want.length) { if (arr.length) fishLive.delete(p); continue; }
      arr = want.map((dex, i) => arr[i] && arr[i].dex === dex ? arr[i]
        : { dex, x: p.x + 30, y: p.y + 10, face: 0, shotT: 0.5 + i * 0.3, anim: new G.Sprites.Animator(dex, 0.75, false) });
      fishLive.set(p, arr);
      arr.forEach((c, i) => {
        // En abanico delante-detrás del entrenador (no encima del compañero, que va detrás en diagonal).
        const b = (p.moveAngle || Math.PI / 2) + Math.PI - 0.75 + (i - 1) * 0.9;
        const tx = p.x + Math.cos(b) * (p.r + 44), ty = p.y + Math.sin(b) * (p.r * 0.5 + 30);
        const ox = c.x, oy = c.y;
        c.x = G.U.damp(c.x, tx, 5, dt); c.y = G.U.damp(c.y, ty, 5, dt);
        const moving = Math.abs(c.x - ox) + Math.abs(c.y - oy) > 18 * dt;
        if (moving) c.face = Math.atan2(c.y - oy, c.x - ox);
        c.anim.dir = G.Sprites.dirFromAngle(c.face);
        if (!c.anim.busy()) c.anim.loop(moving ? 'Walk' : 'Idle');
        c.anim.update(dt);
        if (p === pl && !pl.dead && !(G.PvP && G.PvP.on)) fishShoot(c, pl, dt);
      });
    }
  }
  function fishShoot(c, pl, dt) {
    if ((c.shotT -= dt) > 0) return;
    const F = A().fishrod, range = 240;
    const e = G.Projectiles.nearest(G.EnemyMgr.all(), c.x, c.y, range);
    if (!e) { c.shotT = 0.25; return; }
    c.shotT = F.rate;
    const a = Math.atan2(e.y - c.y, e.x - c.x), sp = 320;
    c.face = a;
    c.anim.play('Attack', { speed: 1.6 });
    G.Projectiles.spawn({
      x: c.x + Math.cos(a) * 6, y: c.y + Math.sin(a) * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      dmg: F.dmg * pl.atk * (1 + 0.06 * Math.max(0, pl.level - 1)), r: 6, life: range / sp + 0.15,
      pierce: 0, color: G.U.TYPE_COLOR.water, hits: new Set(), vis: G.VFX.forType('water'), ghost: false, owner: pl, mtype: 'water'
    });
  }

  /** Para ordenarlos por Y con el resto (game.js drawScene): los pescados y los bloques de hielo. */
  function drawables() {
    const out = [];
    for (const arr of fishLive.values()) for (const c of arr) out.push({ y: c.y, draw(ctx) {
      G.Sprites.drawShadow(ctx, c.dex, c.x, c.y, 0.75);
      c.anim.draw(ctx, c.x, c.y, {});
      // Gotitas que caen (acaba de salir del agua).
      if (Math.random() < 0.04) G.FX.px(c.x + G.U.rand(-6, 6), c.y - 14, '#8ccaff', { vy: 30, life: 0.3 });
    } });
    const t = performance.now();
    ice = ice.filter(b => b.until > t && !b.e.dead);
    for (const b of ice) out.push({ y: b.e.y + 0.5, draw(ctx) {
      // Bloque de hielo de píxeles alrededor del enemigo: borde oscuro, cuerpo translúcido, brillos.
      const e = b.e, w = Math.round(e.r * 2.4 / 2) * 2, h = Math.round((e.bodyH + 10) / 2) * 2;
      const x = Math.round(e.x - w / 2), y = Math.round(e.y - h + 4), left = (b.until - t) / 1000;
      ctx.save();
      ctx.globalAlpha = Math.min(1, left * 4) * 0.85;
      ctx.fillStyle = '#134a60'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = 'rgba(98,210,234,.55)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(191,243,255,.85)'; ctx.fillRect(x + 2, y + 2, w - 4, 3); ctx.fillRect(x + 2, y + 2, 3, h - 6);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 4, y + 6, 2, 2); ctx.fillRect(x + w - 7, y + h - 9, 2, 2);
      ctx.restore();
    } });
    return out;
  }

  /** Cada fotograma, con tu Pokémon. */
  function update(dt, pl) {
    if (pl && !pl.dead && pl.hasItem('fishrod')) fishTick(dt, pl);
    if (fishLive.size || (pl && pl.fishes && pl.fishes.length) || G.Game.everyone().some(p => p.net && p.net.fc)) fishUpdate(dt, pl);
    // Fantasma de Hielo: escarcha alrededor.
    if (pl && !pl.dead && pl.hasItem('iceghost') && Math.random() < dt * 8) G.FX.px(pl.x + G.U.rand(-pl.r, pl.r), pl.y - G.U.rand(4, pl.bodyH), Math.random() < 0.5 ? '#bff3ff' : '#ffffff', { vy: -18, life: 0.5 });
    for (const s of steps) s.t += dt;
    if (steps.length && steps[0].t >= A().quicksilver.stepLife) steps = steps.filter(s => s.t < A().quicksilver.stepLife);
    if (!pl || pl.dead || !pl.hasItem('quicksilver')) return;
    if (pl.walking) {
      stepAcc += pl.spd * dt;
      if (stepAcc >= 15) {
        stepAcc = 0; stepSide ^= 1;
        const a = pl.moveAngle, off = stepSide ? 4 : -4;
        steps.push({ x: pl.x - Math.sin(a) * off, y: pl.y + Math.cos(a) * off * 0.6, t: 0, ang: a, side: stepSide });
      }
    }
    if (!steps.length || (G.PvP && G.PvP.on)) return;
    // Daño: los enemigos (que no vuelan) que pisan una huella; cada uno, como mucho cada 0,5 s.
    const now = G.Game.st.time, q = A().quicksilver, dmg = q.stepDmg * pl.atk;
    const far = steps[0];
    const R = Math.hypot(far.x - pl.x, far.y - pl.y) + 40;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) {
      if (e.dead || e.flying) continue;
      if (now - (stepHit.get(e.id) ?? -9) < q.stepEvery) continue;
      const rr = (e.r + 9) * (e.r + 9);
      if (!steps.some(s => G.U.dist2(s.x, s.y, e.x, e.y) < rr)) continue;
      stepHit.set(e.id, now);
      e.hurt(dmg, '#bfe8ff', e.x - pl.x, e.y - pl.y, 0);
      pl.dmgDealt += dmg;
      pl.onDealt(dmg);
      if (G.Camera.sees(e.x, e.y, 20)) G.FX.burst(e.x, e.y - 4, '#d8f4ff', 3, 60);
    }
    if (stepHit.size > 400) for (const [k, t] of stepHit) if (now - t > 2) stepHit.delete(k);
  }

  /** Huellas plateadas en el suelo (debajo de los Pokémon). */
  function draw(ctx) {
    if (!steps.length) return;
    const life = A().quicksilver.stepLife;
    for (const s of steps) {
      if (!G.Camera.sees(s.x, s.y, 20)) continue;
      const a = 1 - s.t / life;
      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.rotate(s.ang + Math.PI / 2);
      ctx.scale(1.6, 1.6);
      // Pie pixelado: planta, talón y tres dedos; borde azul y brillo blanco.
      ctx.globalAlpha = 0.9 * a;
      ctx.fillStyle = '#2a6fb0';
      ctx.fillRect(-3, -4, 6, 9);
      ctx.fillStyle = '#9fe0ff';
      ctx.fillRect(-2, -3, 4, 3); ctx.fillRect(-2, 2, 4, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -3, 2, 1);
      ctx.fillStyle = '#9fe0ff';
      ctx.fillRect(-3, -7, 2, 2); ctx.fillRect(-1, -8, 2, 2); ctx.fillRect(1, -7, 2, 2);
      ctx.restore();
    }
  }

  /** Has lanzado un ataque (combat.js tickMove). */
  function onAttack(pl, m) {
    if (pl.remote || !pl.hasItem('elderwand')) return;
    const w = A().elderwand, cap = Math.round(w.max / w.per);
    if ((pl.wandN || 0) < cap) pl.wandN = (pl.wandN || 0) + 1;
  }

  /** Tope de acumulaciones de un movimiento de mejora con el artefacto que toca. */
  function buffCap(pl, m, base) {
    const id = m.id;
    if (id === 'agility' && pl.hasItem('quicksilver')) return Math.max(base, A().quicksilver.cap);
    if (id === 'swords-dance' && pl.hasItem('arsenal')) return Math.max(base, A().arsenal.cap);
    if (id === 'harden' && pl.hasItem('liver')) return Math.max(base, A().liver.cap);
    return base;
  }

  /** Dados del Doble o Nada: multiplicador de este golpe (0 marca zeroed()). */
  function diceK(pl) {
    if (!pl.hasItem || !pl.hasItem('dice')) return 1;
    if (Math.random() < A().dice.win) return A().dice.mul;
    zero = true;
    return 0;
  }
  function zeroed() { const z = zero; zero = false; return z; }
  function miss(e) {
    if (G.Camera.sees(e.x, e.y, 20)) G.FX.dmgText(e.x, e.y - e.bodyH - 4, '0', '#8f98ab');
  }

  /** Has golpeado a `e` (combat.js hit / disparos). */
  function onHit(pl, e) {
    if (e.dead || !pl.items || !pl.items.length) return;
    if (pl.hasItem('climber')) e.applyBurnFloor(A().climber.stacks);
    if (pl.hasItem('cleaver')) G.Combat.artDot(pl, e, 'cleaver');
    if (pl.hasItem('socks')) G.Combat.artDot(pl, e, 'socks');
  }

  /** Hígado del Ingeniero: un proyectil enemigo te ha dado y no hace nada. */
  function blocked(pl) {
    const t = performance.now();
    if (t - blockT < 350) return;
    blockT = t;
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, G.T('¡Inmune!'), '#ffd23f');
    G.FX.ring(pl.x, pl.y - pl.bodyH * 0.5, pl.r, pl.r * 2, '#ffd23f', 0.25, 2);
  }

  return { reset, update, draw, drawables, onAttack, buffCap, diceK, zeroed, miss, onHit, blocked, frozen, unstick, fishCode, steps: () => steps };
})();
