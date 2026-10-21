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

  /*
   * Equipo del compañero (2026-10-16): sólo se compra en la tienda de Kecleon (sección
   * «Mascotas», dungeon.js). Cada pieza una vez por run; vale para el huevo que aún no ha
   * eclosionado. Lo lleva el jugador (pl.petGear) y sólo cuenta en su ordenador, como el daño
   * del compañero. tier: mismo rango que los objetos (items.js).
   */
  const GEAR = {
    split:  { name: 'Cargador Doble', desc: '+1 proyectil (sale en abanico).', tier: 3, price: 70, icon: 'pg_split' },
    collar: { name: 'Collar Fuerza', desc: '+35% de daño del compañero.', tier: 2, price: 55, icon: 'pg_collar' },
    motor:  { name: 'Motor Turbo', desc: 'El compañero dispara un 40% más rápido.', tier: 2, price: 55, icon: 'pg_motor' },
    scope:  { name: 'Mira Telescópica', desc: '+50% de alcance y +30% de velocidad de proyectil.', tier: 1, price: 40, icon: 'pg_scope' },
    pierce: { name: 'Punta Perforante', desc: 'Sus proyectiles atraviesan 2 enemigos más.', tier: 2, price: 50, icon: 'pg_pierce' },
    giant:  { name: 'Insignia Gigante', desc: 'Proyectiles un 60% más grandes y +15% de daño.', tier: 1, price: 40, icon: 'pg_giant' },
    bell:   { name: 'Campanilla Suerte', desc: '25% de probabilidad de crítico (daño ×2).', tier: 2, price: 50, icon: 'pg_bell' },
    fork:   { name: 'Diapasón Eco', desc: 'Cada 3 disparos, suelta además una onda de 6 proyectiles alrededor.', tier: 3, price: 75, icon: 'pg_fork' }
  };
  const gear = (pl, id) => !!(pl && pl.petGear && pl.petGear.includes(id));
  /** Compra de la tienda: se lo pones (aunque aún sea un huevo). */
  function addGear(pl, id) {
    if (!pl || !GEAR[id]) return;
    pl.petGear = pl.petGear || [];
    if (pl.petGear.includes(id)) { G.Spawner.say('Tu compañero ya lleva eso', 2, true); return; }
    pl.petGear.push(id);
    G.Spawner.say(G.I18n.f('Equipo de compañero: {x}', G.T(GEAR[id].name)) + (pl.buddy ? '' : ' · ' + G.T('se lo pondrá al eclosionar')), 2.8, true);
    G.FX.ring(pl.x, pl.y, 6, 90, '#9fe0b0', 0.5, 4);
  }
  /** Caramelo / piedra: niveles para el compañero (si aún no hay, se guardan para cuando salga). */
  function addLevels(pl, n) {
    if (!pl) return;
    if (!pl.buddy) { pl.petLv = (pl.petLv || 0) + n; G.Spawner.say(G.I18n.f('Tu compañero empezará con +{x} niveles', n), 2.6, true); return; }
    pl.buddy.k0 = (pl.buddy.k0 || 0) - n * PER_LEVEL;
    G.Spawner.say(G.I18n.f('¡Compañero +{x} niveles!', n), 2.4, true);
  }
  /** Piedra evolutiva: hasta el nivel de su próxima evolución (o +5 si ya no evoluciona). */
  function evoStone(pl) {
    const b = pl && pl.buddy, lv = b ? b.lvl || 1 : 1 + (pl.petLv || 0);   // (huevo: cuenta lo que ya lleva comprado)
    const next = !(b && b.final) ? EVO_LV.find(x => x > lv) : null;
    addLevels(pl, next ? next - lv : 5);
  }

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

  /*
   * Mascota elegida (2026-10-16): en el Pokédex se puede marcar un Pokémon que tengas (o un
   * personaje original) con «Elegir de mascota» (save.petPick). Si la hay, sale ésa del huevo;
   * si no, una al azar como siempre.
   */
  function pickedPet() {
    const s = G.DB.save, d = s && s.petPick;
    if (!d || !G.DEX_BY[d]) return 0;
    if (!(G.CUSTOM_BY && G.CUSTOM_BY[d]) && !(s.owned && s.owned[d])) return 0;      // ya no la tienes
    return G.Sprites.meta ? (G.Sprites.meta(d) ? d : 0) : d;
  }
  function hatch(pl) {
    const dex = (pl === G.Game.player && pickedPet()) || rollHatch();
    const shiny = G.Sprites.hasShiny(dex) && Math.random() < 1 / 20;
    pl.egg = null;
    pl.buddy = { dex, shiny, lvl: 1, stage: 0, k0: (pl.kills || 0) - (pl.petLv || 0) * PER_LEVEL };   // + los caramelos comprados antes
    pl.petLv = 0;
    if (pl === G.Game.player) G.Progress.event('hatch', { shiny });
    G.Sprites.preload([dex], 8000, shiny);
    const name = G.T(G.DEX_BY[dex].name);
    G.Spawner.say(G.I18n.f('¡El huevo ha eclosionado! ¡{x} se une a ti!', name) + (shiny ? ' ✨' : ''), 3.5, true);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#fff3c8', 34, 240);
    G.FX.ring(pl.x, pl.y, 8, 120, shiny ? '#9ae6ff' : '#ffd23f', 0.7, 5);
    G.Audio.sfx(shiny ? 'shiny' : 'legend');
  }

  /*
   * Segunda habilidad del compañero (2026-10-16): desde el Nv. 15, cada SKILL_CD s, un golpe
   * en área según su tipo principal (6 grupos). Desde el Nv. 25, además, +25 % de radio de
   * recogida para su entrenador. El daño sale de la misma base que sus disparos (petBase):
   * ×mul. Sólo hace daño en el ordenador de su dueño; los demás ven el efecto (myState [21]
   * lleva un contador que sube con cada uso).
   */
  const SKILL_LV = 15, MAG_LV = 25, SKILL_CD = 6, MAG_K = 1.25;
  const SKILLS = {
    blaze: { types: ['fire', 'dragon'], name: 'Estallido Ígneo', icon: 'type:fire', color: '#ff7b3d', r: 120, mul: 3,
             desc: 'Cada 6 s, una explosión de fuego alrededor del compañero (×3 de su daño).' },
    wave:  { types: ['water', 'ice'], name: 'Ola Rompiente', icon: 'type:water', color: '#4fb4ff', r: 140, mul: 2, knock: 300,
             desc: 'Cada 6 s, una ola que daña (×2) y aparta a los enemigos.' },
    heal:  { types: ['grass', 'bug'], name: 'Polen Curativo', icon: 'type:grass', color: '#5fe08a', r: 90, mul: 1, heal: 0.05,
             desc: 'Cada 6 s, te cura un 5 % de la vida máxima y daña un poco (×1) a su alrededor.' },
    chain: { types: ['electric', 'steel'], name: 'Cadena Voltio', icon: 'type:electric', color: '#ffd23f', r: 260, mul: 2.5, n: 3,
             desc: 'Cada 6 s, un rayo salta entre los 3 enemigos más cercanos (×2,5 a cada uno).' },
    slow:  { types: ['psychic', 'fairy', 'ghost', 'dark', 'poison'], name: 'Niebla Pesada', icon: 'type:psychic', color: '#c47bff', r: 150, mul: 1, slowK: 0.5, slowT: 3,
             desc: 'Cada 6 s, una niebla que frena a la mitad a los enemigos 3 s y los daña (×1).' },
    shock: { types: ['normal', 'fighting', 'rock', 'ground', 'flying'], name: 'Onda de Choque', icon: 'type:fighting', color: '#e8e8f0', r: 130, mul: 2.2, knock: 180,
             desc: 'Cada 6 s, una onda de choque que daña (×2,2) y empuja.' }
  };
  function skillOf(dex) {
    const mon = G.DEX_BY[dex], t = (mon && mon.types[0]) || 'normal';
    for (const k in SKILLS) if (SKILLS[k].types.includes(t)) return k;
    return 'shock';
  }
  /** Para la tienda (sección Mascotas) y el HUD: qué tiene tu compañero. */
  function skillInfo(pl) {
    const b = pl && pl.buddy;
    if (!b) return null;
    const k = skillOf(b.dex), sk = SKILLS[k], lv = b.lvl || 1;
    return { id: k, name: sk.name, desc: sk.desc, icon: sk.icon, color: sk.color, unlocked: lv >= SKILL_LV, unlockLv: SKILL_LV,
             magnet: lv >= MAG_LV, magnetLv: MAG_LV, magnetDesc: 'Nv. 25: +25 % de radio de recogida para ti.' };
  }
  /** Daño base de un disparo del compañero (también lo usa su habilidad). */
  function petBase(pl) {
    return 12 * pl.atk * (1 + 0.06 * Math.max(0, pl.level - 1)) * (1 + 0.08 * ((pl.buddy.lvl || 1) - 1)) * (1 + 0.25 * (pl.buddy.stage || 0))
      * (gear(pl, 'collar') ? 1.35 : 1) * (gear(pl, 'giant') ? 1.15 : 1);
  }
  /** El efecto (todos los ordenadores); con `pl` (el dueño), también el daño. */
  function skillFx(k, c, pl, targets) {
    const sk = SKILLS[k], x = c.x, y = c.y;
    G.FX.ring(x, y, 8, sk.r, sk.color, 0.45, 4);
    if (k === 'blaze') { G.FX.burst(x, y - 10, '#ff7b3d', 26, 260); G.FX.burst(x, y - 10, '#ffd23f', 14, 180); }
    else if (k === 'wave') { G.FX.ring(x, y, 20, sk.r * 0.8, '#b3defa', 0.6, 3); G.FX.burst(x, y, '#4fb4ff', 18, 240); }
    else if (k === 'heal') { const o = pl || c.owner; if (o) { G.FX.burst(o.x, o.y - o.bodyH * 0.5, '#5fe08a', 18, 120); G.FX.ring(o.x, o.y, 6, 50, '#c8ffd8', 0.5, 3); } }
    else if (k === 'slow') { G.FX.ring(x, y, sk.r * 0.6, sk.r, '#e8c8ff', 0.9, 2); G.FX.burst(x, y, '#c47bff', 14, 140); }
    else if (k === 'shock') { G.FX.ring(x, y, 4, sk.r * 0.7, '#ffffff', 0.3, 5); G.FX.burst(x, y, '#e8e8f0', 16, 220); }
    if (k === 'chain' && targets) {
      let px = c.x, py = c.y - 12;
      for (const e of targets) { G.FX.arc(px, py, e.x, e.y - e.bodyH * 0.5, { life: 0.22 }); px = e.x; py = e.y - e.bodyH * 0.5; }
    }
  }
  function useSkill(c, pl) {
    const k = skillOf(c.dex), sk = SKILLS[k], dmg = petBase(pl) * sk.mul;
    let targets = null;
    if (k === 'chain') {
      targets = G.EnemyMgr.queryCircle(c.x, c.y, sk.r).filter(e => !e.dead)
        .sort((a, b) => G.U.dist2(a.x, a.y, c.x, c.y) - G.U.dist2(b.x, b.y, c.x, c.y)).slice(0, sk.n);
      if (!targets.length) return false;
    } else {
      targets = G.EnemyMgr.queryCircle(c.x, c.y, sk.r).filter(e => !e.dead);
      if (!targets.length && k !== 'heal') return false;       // sin nadie cerca, espera
    }
    for (const e of targets) {
      const before = e.hp;
      e.hurt(dmg, sk.color, e.x - c.x, e.y - c.y, sk.knock || 0);
      if (sk.slowK && !e.dead) e.applySlow(sk.slowK, sk.slowT);
      pl.dmgDealt = (pl.dmgDealt || 0) + Math.max(0, Math.min(before, dmg));
    }
    if (sk.heal) pl.heal(pl.maxHp * sk.heal);
    skillFx(k, c, pl, k === 'chain' ? targets : null);
    pl.buddy.sk = (pl.buddy.sk || 0) + 1;                      // (myState [21]: los demás lo ven)
    return true;
  }
  /** Nv. 25: radio de recogida (una vez por compañero). */
  function magnetPerk(pl) {
    const b = pl.buddy;
    if (!b || b.magOn || (b.lvl || 1) < MAG_LV) return;
    b.magOn = true;
    pl.magnet *= MAG_K;
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 20, G.T('Compañero: +25 % de recogida'), '#9fe0b0');
  }

  /** Cada fotograma (todos los ordenadores): tu huevo, y mover/animar los compañeros. */
  function update(dt, pl) {
    if (pl && !pl.dead && pl.egg && eggProgress(pl) >= 1) hatch(pl);
    if (pl && pl.buddy) { grow(pl); magnetPerk(pl); }
    const players = G.Game.everyone();
    for (const p of players) {
      const info = p === pl ? p.buddy : (p.net && p.net.bd ? { dex: p.net.bd, shiny: !!p.net.bs } : null);
      let c = live.get(p);
      if (!info) { if (c) live.delete(p); continue; }
      if (!c || c.dex !== info.dex) {
        c = { dex: info.dex, shiny: info.shiny, x: p.x - 30, y: p.y + 8, shotT: 1, skT: 2, anim: new G.Sprites.Animator(info.dex, 0.8, info.shiny), face: 0,
              owner: p, sk: p === pl ? (p.buddy.sk || 0) : (p.net && p.net.pk) || 0 };
        live.set(p, c);
      }
      // Habilidad de un compañero ajeno: sólo el efecto, cuando su contador sube.
      if (p !== pl && p.net) {
        const n = p.net.pk || 0;
        if (n > c.sk) { c.sk = n; if (G.Camera.sees(c.x, c.y, 200)) skillFx(skillOf(c.dex), c, null, null); }
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
      if (p === pl && !pl.dead) {
        shoot(c, pl, dt);
        if ((pl.buddy.lvl || 1) >= SKILL_LV && (c.skT -= dt) <= 0) c.skT = useSkill(c, pl) ? SKILL_CD : 0.5;
      }
    }
  }

  function shoot(c, pl, dt) {
    if ((c.shotT -= dt) > 0) return;
    const range = RANGE * (gear(pl, 'scope') ? 1.5 : 1);
    const e = G.Projectiles.nearest(G.EnemyMgr.all(), c.x, c.y, range);
    if (!e) { c.shotT = 0.2; return; }
    c.shotT = RATE / (gear(pl, 'motor') ? 1.4 : 1);
    c.shots = (c.shots || 0) + 1;
    const mon = G.DEX_BY[c.dex], type = (mon && mon.types[0]) || 'normal';
    const a = Math.atan2(e.y - c.y, e.x - c.x), sp = 330 * (gear(pl, 'scope') ? 1.3 : 1);
    c.face = a;
    c.anim.play('Attack', { speed: 1.6 });
    // Crece con tu nivel (+6 %), con el suyo (+8 %) y con cada evolución (+25 %); y con su equipo.
    const base = petBase(pl);
    const r = (6 + 2 * (pl.buddy.stage || 0)) * (gear(pl, 'giant') ? 1.6 : 1);
    const fire = (ang, k = 1) => {
      const crit = gear(pl, 'bell') && Math.random() < 0.25;
      G.Projectiles.spawn({
        x: c.x + Math.cos(ang) * 6, y: c.y + Math.sin(ang) * 6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        dmg: base * k * (crit ? 2 : 1), r: crit ? r * 1.25 : r, life: range / sp + 0.15,
        pierce: gear(pl, 'pierce') ? 2 : 0, color: crit ? '#ffe14d' : G.U.TYPE_COLOR[type], hits: new Set(), vis: G.VFX.forType(type), ghost: false,
        owner: pl, mtype: type
      });
    };
    if (gear(pl, 'split')) { fire(a - 0.16); fire(a + 0.16); } else fire(a);
    // Diapasón: cada 3 disparos, una onda de 6 alrededor (a medio daño).
    if (gear(pl, 'fork') && c.shots % 3 === 0) for (let i = 0; i < 6; i++) fire(a + i * Math.PI / 3, 0.5);
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
          // Su habilidad, ya desbloqueada: el emblema del tipo al lado del nivel.
          if ((own.lvl || 1) >= SKILL_LV) G.Icons.draw(ctx, SKILLS[skillOf(c.dex)].icon, c.x + ctx.measureText(t).width / 2 + 2, c.y - 42, 10);
          ctx.restore();
        }
      } });
    }
    return out;
  }

  /** Para myState (cooperativo): [dex, shiny] o [0, 0]. */
  function state(pl) { return pl && pl.buddy ? [pl.buddy.dex, pl.buddy.shiny ? 1 : 0] : [0, 0]; }
  /** myState [21]: cuántas veces ha usado su habilidad (los demás ven el efecto cuando sube). */
  function skillCount(pl) { return pl && pl.buddy ? pl.buddy.sk || 0 : 0; }

  return { reset, tick, update, gotEgg, eggProgress, drawables, state, KILLS, GEAR, gear, addGear, addLevels, evoStone,
           SKILLS, skillInfo, skillCount, pickedPet };
})();
