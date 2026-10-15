/* ============ companion.js — huevo Pokémon y compañero (2026-10-15) ============
 * Hacia el minuto 6 aparece un huevo cerca de cada jugador (es SUYO: sólo él lo ve y
 * lo coge, como los discos de movimientos de loot.js). Al cogerlo, se incuba con los
 * enemigos derrotados (KILLS) y eclosiona: sale un Pokémon bebé (1/20 shiny) que te
 * sigue y dispara de su tipo al enemigo más cercano.
 *
 * Cooperativo: el huevo lo pone el anfitrión; al cogerlo le llega al dueño ('egg').
 * El compañero sólo hace daño en el ordenador de su dueño; los demás lo ven seguir a
 * su Pokémon (myState lleva su número de Pokédex y si es shiny).
 */
G.Companion = (() => {
  const EGG_AT = 360;               // s de run en que aparece el huevo
  const KILLS = 120;                // derrotados para que eclosione
  const RANGE = 260, RATE = 0.9;    // alcance y cadencia de sus disparos
  const BABIES = [172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 447];

  let spawned = false;
  const live = new Map();           // jugador -> { dex, shiny, x, y, anim, shotT }

  function reset() { spawned = false; live.clear(); }

  /** Anfitrión o solitario: pone los huevos. */
  function tick(dt, time, players) {
    // En una fase de la Aventura, al 35 % de lo que dura (si no, al minuto 6).
    const len = G.Stages.runLength && G.Stages.runLength();
    const at = len ? Math.max(30, Math.round(len * 0.35)) : EGG_AT;
    if (spawned || time < at || G.PvP.on || G.Rift.inArena || (G.Dungeon && G.Dungeon.inRoom) || G.Modes.run === 'legend') return;
    spawned = true;
    let n = 0;
    for (const p of players) if (!p.dead && !p.buddy && spawnEgg(p)) n++;
    if (n) {
      const msg = '¡Ha aparecido un huevo Pokémon cerca! Búscalo en el minimapa';
      G.Spawner.say(msg, 3.5, true);
      if (G.Coop.active) G.Coop.say(msg, 3.5);
    }
  }
  function spawnEgg(p) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.2832, d = G.U.rand(300, 520);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (G.World.isFree(x, y, 16)) { G.Pickups.drop('egg', x, y, G.Loot.ownerKey(p)); return true; }
    }
    return false;
  }

  /** Has cogido tu huevo: se incuba con los derrotados a partir de ahora. */
  function gotEgg(pl) {
    if (!pl || pl.egg || pl.buddy) return;
    pl.egg = { from: pl.kills || 0 };
    G.Spawner.say(G.I18n.f('¡Tienes un huevo! Eclosionará tras {x} derrotados', KILLS), 3, true);
    G.FX.ring(pl.x, pl.y, 6, 80, '#fff3c8', 0.5, 4);
  }
  /** 0..1 (o null si no llevas huevo). */
  function eggProgress(pl) { return pl && pl.egg ? G.U.clamp(((pl.kills || 0) - pl.egg.from) / KILLS, 0, 1) : null; }

  /*
   * Qué puede salir del huevo (2026-10-16): cualquier Pokémon en su primera forma (que no
   * venga de otro), con sprite, que no sea legendario ni singular (rareza 5). Los comunes
   * salen más a menudo: rareza 1 ×8, 2 ×5, 3 ×3, 4 ×1.
   */
  let pool = null;
  function hatchPool() {
    if (pool) return pool;
    const from = new Set();
    for (const k in G.EVOS) for (const d of G.EVOS[k]) from.add(d);
    const W = { 1: 8, 2: 5, 3: 3, 4: 1 };
    pool = G.DEX.filter(p => !from.has(p.dex) && G.SPRITE_META[p.dex] && W[p.rarity]).map(p => [p.dex, W[p.rarity]]);
    if (!pool.length) pool = BABIES.map(d => [d, 1]);
    return pool;
  }
  function rollHatch() {
    const list = hatchPool();
    let r = Math.random() * list.reduce((a, [, w]) => a + w, 0);
    for (const [d, w] of list) if ((r -= w) <= 0) return d;
    return list[0][0];
  }

  // El compañero sube de nivel con lo que derrotas (1 nivel cada 25) y evoluciona a los Nv. 10 y 20.
  const PER_LEVEL = 25, EVO_LV = [10, 20], MAX_LV = 50;
  const buddyLevel = pl => Math.min(MAX_LV, 1 + Math.floor(((pl.kills || 0) - (pl.buddy.k0 || 0)) / PER_LEVEL));
  function grow(pl) {
    const b = pl.buddy, lv = buddyLevel(pl);
    if (lv <= (b.lvl || 1)) return;
    b.lvl = lv;
    // Evoluciona al pasar cada umbral (aunque suba varios niveles de golpe).
    const want = EVO_LV.filter(x => lv >= x).length;
    if ((b.stage || 0) < want && !b.final) {
      const opts = (G.EVOS[b.dex] || []).filter(d => G.DEX_BY[d] && G.SPRITE_META[d]);
      if (!opts.length) { b.final = true; return; }
      const old = G.T(G.DEX_BY[b.dex].name);
      b.dex = G.U.pick(opts); b.stage = (b.stage || 0) + 1;
      G.Sprites.preload([b.dex], 8000, b.shiny);
      G.Spawner.say(G.I18n.f('¡{x} ha evolucionado en {x}!', old, G.T(G.DEX_BY[b.dex].name)), 3.5, true);
      G.FX.burst(pl.x, pl.y - 20, '#ffe14d', 40, 260);
      G.Audio.sfx('legend');
      return;
    }
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, G.I18n.f('Compañero Nv. {x}', lv), '#9fe0b0');
  }

  function hatch(pl) {
    const dex = rollHatch();
    const shiny = G.Sprites.hasShiny(dex) && Math.random() < 1 / 20;
    pl.egg = null;
    pl.buddy = { dex, shiny, lvl: 1, stage: 0, k0: pl.kills || 0 };
    if (pl === G.Game.player) G.Progress.event('hatch', { shiny });
    G.Sprites.preload([dex], 8000, shiny);
    const name = G.T(G.DEX_BY[dex].name);
    G.Spawner.say(G.I18n.f('¡El huevo ha eclosionado! ¡{x} se une a ti!', name) + (shiny ? ' ✨' : ''), 3.5, true);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#fff3c8', 34, 240);
    G.FX.ring(pl.x, pl.y, 8, 120, shiny ? '#9ae6ff' : '#ffd23f', 0.7, 5);
    G.Audio.sfx(shiny ? 'shiny' : 'legend');
  }

  /** Cada fotograma (todos los ordenadores): tu huevo, y mover/animar los compañeros. */
  function update(dt, pl) {
    if (pl && !pl.dead && pl.egg && eggProgress(pl) >= 1) hatch(pl);
    if (pl && pl.buddy) grow(pl);
    const players = G.Game.everyone();
    for (const p of players) {
      const info = p === pl ? p.buddy : (p.net && p.net.bd ? { dex: p.net.bd, shiny: !!p.net.bs } : null);
      let c = live.get(p);
      if (!info) { if (c) live.delete(p); continue; }
      if (!c || c.dex !== info.dex) {
        c = { dex: info.dex, shiny: info.shiny, x: p.x - 30, y: p.y + 8, shotT: 1, anim: new G.Sprites.Animator(info.dex, 0.8, info.shiny), face: 0 };
        live.set(p, c);
      }
      // Detrás de su entrenador, en diagonal (así no se tapan el uno al otro).
      const b = (p.moveAngle || Math.PI / 2) + Math.PI + 0.75;
      const tx = p.x + Math.cos(b) * (p.r + 30), ty = p.y + Math.sin(b) * (p.r * 0.5 + 22);
      const ox = c.x, oy = c.y;
      c.x = G.U.damp(c.x, tx, 6, dt); c.y = G.U.damp(c.y, ty, 6, dt);
      const moving = Math.abs(c.x - ox) + Math.abs(c.y - oy) > 18 * dt;
      if (moving) c.face = Math.atan2(c.y - oy, c.x - ox);
      c.anim.dir = G.Sprites.dirFromAngle(c.face);
      if (!c.anim.busy()) c.anim.loop(moving ? 'Walk' : 'Idle');
      c.anim.update(dt);
      if (c.shiny && Math.random() < dt * 2) G.FX.twinkle(c.x + G.U.rand(-8, 8), c.y - G.U.rand(4, 20));
      // Sólo el tuyo dispara (en grupo, cada uno el suyo).
      if (p === pl && !pl.dead) shoot(c, pl, dt);
    }
  }

  function shoot(c, pl, dt) {
    if ((c.shotT -= dt) > 0) return;
    const e = G.Projectiles.nearest(G.EnemyMgr.all(), c.x, c.y, RANGE);
    if (!e) { c.shotT = 0.2; return; }
    c.shotT = RATE;
    const mon = G.DEX_BY[c.dex], type = (mon && mon.types[0]) || 'normal';
    const a = Math.atan2(e.y - c.y, e.x - c.x), sp = 330;
    c.face = a;
    c.anim.play('Attack', { speed: 1.6 });
    G.Projectiles.spawn({
      x: c.x + Math.cos(a) * 6, y: c.y + Math.sin(a) * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      // Crece con tu nivel (+6 %), con el suyo (+8 %) y con cada evolución (+25 %).
      dmg: 12 * pl.atk * (1 + 0.06 * Math.max(0, pl.level - 1)) * (1 + 0.08 * ((pl.buddy.lvl || 1) - 1)) * (1 + 0.25 * (pl.buddy.stage || 0)),
      r: 6 + 2 * (pl.buddy.stage || 0), life: RANGE / sp + 0.15,
      pierce: 0, color: G.U.TYPE_COLOR[type], hits: new Set(), vis: G.VFX.forType(type), ghost: false,
      owner: pl, mtype: type
    });
  }

  /** Para ordenarlos por Y con el resto (game.js drawScene). */
  function drawables() {
    const out = [];
    for (const c of live.values()) {
      const own = c === live.get(G.Game.player) && G.Game.player.buddy;
      out.push({ y: c.y, draw(ctx) {
        G.Sprites.drawShadow(ctx, c.dex, c.x, c.y, 0.8);
        c.anim.draw(ctx, c.x, c.y, {});
        if (own) {
          // Su nivel encima (sólo el tuyo).
          ctx.save();
          ctx.font = '800 9px Pixelify,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
          const t = 'Lv.' + (own.lvl || 1);
          ctx.strokeText(t, c.x, c.y - 34); ctx.fillStyle = '#9fe0b0'; ctx.fillText(t, c.x, c.y - 34);
          ctx.restore();
        }
      } });
    }
    return out;
  }

  /** Para myState (cooperativo): [dex, shiny] o [0, 0]. */
  function state(pl) { return pl && pl.buddy ? [pl.buddy.dex, pl.buddy.shiny ? 1 : 0] : [0, 0]; }

  return { reset, tick, update, gotEgg, eggProgress, drawables, state, KILLS };
})();
