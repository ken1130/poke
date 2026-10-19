/* ============ encounters.js — encuentros en el mapa (2026-10-16) ============
 * Como el Snorlax de funny.js: de vez en cuando aparece un Pokémon con algo que hacer.
 * Sólo en la mazmorra normal (G.Modes.run 'normal'): ni PvP, ni grieta, ni interiores,
 * ni sala de entrenamiento. Uno cada vez: el primero hacia el minuto 3 y luego cada
 * 2,5–4 min, al azar y sin repetir el anterior.
 *
 *   moon   Altar lunar de Clefairy: quédate a su lado 5 s → todos curan el 50 % y 3 s
 *          de invulnerabilidad.
 *   karp   La revancha de Magikarp (junto al agua): pégale 30 veces (no cae ni ataca) →
 *          evoluciona en Gyarados, que lucha a vuestro lado 20 s (Hidrobomba cada 1,5 s a
 *          los 5 más cercanos) y se va.
 *   ditto  Un cofre en el mapa: al tocarlo es un Ditto con el aspecto de quien lo toca,
 *          minijefe (60 % de la vida de un jefe de ese momento). Derrotado: lo de un jefe
 *          y además un disco de movimientos para cada uno o un objeto.
 *   fish   Slowpoke pesca junto al agua: quédate a su lado 8 s → monedas (40 %), objeto
 *          (30 %), un huevo para quien no tenga compañero (15 %) o… un élite (15 %).
 *   nurse  Chansey pasea despacio: tócala → Huevo Suerte: todos con la vida llena y los
 *          caídos se levantan. Se va.
 *   mew    Huellas brillantes de ~30 m: al final está Mew; quien lo toca recibe una mejora
 *          de movimiento al azar (como la «Mejora» de la tienda).
 *   thief  Electrode roba el 15 % de las monedas de la run y huye 20 s: derrotado, las
 *          devuelve +50 %; si escapa (tiempo o fuera del minimapa), se pierden.
 *
 * Cooperativo: decide el anfitrión. Red ['dg', 'en', ...]:
 *   's' kind x y data  empieza · 'p' n  progreso (golpes a Magikarp) · 'ph' fase x y eid
 *   'mv' x y tx ty     Chansey cambia de rumbo · 'gy' x1 y1 x2 y2…  Hidrobomba de Gyarados
 *   'e' how arg        se acaba (cada uno se cura / recibe lo suyo; el anfitrión suelta el botín)
 * Magikarp, Ditto y Electrode son enemigos normales (se copian solos).
 * Prueba: G.Encounters.force('moon' | 'karp' | 'ditto' | 'fish' | 'nurse' | 'mew' | 'thief').
 */
G.Encounters = (() => {
  const T = () => G.Game.st.time;
  const KINDS = ['moon', 'karp', 'ditto', 'fish', 'nurse', 'mew', 'thief'];
  const DEX = { moon: 35, karp: 129, gyara: 130, ditto: 132, fish: 79, nurse: 113, mew: 151, thief: 101 };
  const LIFE = { moon: 75, karp: 80, ditto: 120, fish: 90, nurse: 60, mew: 100, thief: 20 };
  const MOON_T = 5, FISH_T = 8, NEAR_R = 90, KARP_HITS = 30, GYARA_T = 20, STEAL = 0.15, BACK = 1.5;
  const MM_R = 1300;                  // radio del minimapa (hud.js): Electrode más lejos, escapa

  let cur = null;                     // el encuentro que hay
  let gone = [];                      // Pokémon que se marchan (se desvanecen / Mew sale volando)
  let nextT = 180, last = null, lastPlayers = [], bossWait = 0;

  function reset() { cur = null; gone = []; nextT = 180 + Math.random() * 30; last = null; lastPlayers = []; bossWait = 0; }
  /** Piso nuevo (floors.js → dungeon.js clearSites): se acaba sin más. */
  function clear() { cur = null; gone = []; if (G.Game.st) nextT = Math.max(nextT, T() + 60); }

  const authority = () => !G.Coop.active || G.Coop.isHost;
  const allowed = () => G.Modes.run === 'normal' && !G.PvP.on && !G.Rift.inArena && !(G.Dungeon && G.Dungeon.inRoom);
  const d2 = (a, x, y) => G.U.dist2(a.x, a.y, x, y);
  const key = p => G.Loot.ownerKey(p);

  /** Anfitrión: a todos (y a sí mismo). */
  function emit(ev) { if (G.Coop.active && G.Coop.isHost) G.Coop.broadcast(ev); onNet(ev); }
  function say(text, secs = 3.2) { G.Spawner.say(G.T(text), secs, true); }

  // ---------------- dónde salen ----------------

  function spot(p, r0, r1, clearR = 40) {
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * 6.2832, d = G.U.rand(r0, r1);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (G.World.isFree(x, y, clearR)) return [x, y];
    }
    return null;
  }
  /** Junto al agua si la hay cerca (tierra firme con agua a 40–80 px); si no, donde sea. */
  function waterSpot(p, r0, r1) {
    const lk = G.World.liquidKind();
    if (lk === 'water' || lk === 'swamp' || lk === 'ice') {
      for (let k = 0; k < 160; k++) {
        const a = Math.random() * 6.2832, d = G.U.rand(r0, r1 + 200);
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (!G.World.isFree(x, y, 22)) continue;
        for (let j = 0; j < 8; j++) {
          const b = j * 0.785, r = 46 + (k % 3) * 16;
          if (G.World.isLiquid(x + Math.cos(b) * r, y + Math.sin(b) * r)) return [x, y, b];
        }
      }
    }
    const at = spot(p, r0, r1, 30);
    return at ? [at[0], at[1], Math.random() * 6.2832] : null;
  }

  // ---------------- Magikarp (enemigo que no cae) ----------------

  let Karp = null;
  function karpClass() {
    if (Karp) return Karp;
    Karp = class extends G.Enemy {
      constructor(x, y) {
        super({ dex: DEX.karp, name: 'Magikarp', hp: 999999, spd: 0, dmg: 0, xp: 0, behavior: 'karp' }, x, y, { hp: 1, spd: 1, dmg: 1 });
        this.dummy = true;            // no se recoloca como los rezagados
        this.hx = x; this.hy = y; this.ox = 0; this.oy = 0; this.hop = 0; this.hopT = 0.6;
      }
      hurt(amount, color, dirX, dirY, knock, eff) {
        if (this.dead) return;
        super.hurt(amount, color, dirX, dirY, 0, eff);
        this.hp = this.maxHp; this.dead = false;      // nunca cae
        karpHit(this);
      }
      die() { /* no cae */ }
      update(dt, pl) {
        this.anim.update(dt);
        if (this.flash > 0) this.flash -= dt;
        this.bob += dt * 6;
        // Congelado / confundido (V3.1) se pasan solos, como en Enemy.update; nunca se queda atrapado.
        if (this.rootT > 0) this.rootT -= dt;
        if (this.confT > 0) this.confT -= dt;
        if (this.freezeT > 0) this.freezeT -= dt;
        this.grab = null;
        // Chapotea: saltitos en el sitio (a un lado y a otro).
        if ((this.hopT -= dt) <= 0) {
          this.hopT = G.U.rand(0.5, 1.1);
          this.hop = 0.45;
          this.ox = G.U.clamp(this.ox + G.U.rand(-18, 18), -26, 26); this.oy = G.U.clamp(this.oy + G.U.rand(-10, 10), -14, 14);
          if (G.Camera.sees(this.x, this.y, 0) && Math.random() < 0.5) G.FX.burst(this.x, this.y, '#9fd8ff', 4, 60);
        }
        if (this.hop > 0) this.hop -= dt;
        const tx = this.hx + this.ox, ty = this.hy + this.oy;
        this.x += (tx - this.x) * Math.min(1, dt * 6); this.y += (ty - this.y) * Math.min(1, dt * 6);
        this.kx = this.ky = 0; this.jump = null;
        this.jumpLift = this.hop > 0 ? Math.sin(this.hop / 0.45 * Math.PI) * 16 : 0;
        if (pl) this.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - this.y, pl.x - this.x));
        this.anim.loop('Walk', 1.6);
      }
    };
    return Karp;
  }
  function karpHit(e) {
    if (!cur || cur.kind !== 'karp' || cur.phase !== 'karp' || cur.enemy !== e || cur.prog >= KARP_HITS) return;
    emit(['dg', 'en', 'p', cur.prog + 1]);
    if (cur.prog >= KARP_HITS) cur.evolve = true;      // (en el tick: no se toca la lista de enemigos en mitad de un golpe)
  }

  // ---------------- empezar ----------------

  /** Anfitrión o solitario. */
  function start(kind, p, players) {
    const t = T();
    if (kind === 'moon' || kind === 'nurse') {
      const at = spot(p, 300, 520, 40);
      if (!at) return false;
      emit(['dg', 'en', 's', kind, Math.round(at[0]), Math.round(at[1]), null]);
    } else if (kind === 'fish' || kind === 'karp') {
      const at = waterSpot(p, 320, 600);
      if (!at) return false;
      const x = Math.round(at[0]), y = Math.round(at[1]);
      if (kind === 'fish') emit(['dg', 'en', 's', kind, x, y, { a: Math.round(at[2] * 100) / 100 }]);
      else {
        G.Sprites.preload([DEX.karp, DEX.gyara]);
        const e = G.EnemyMgr.add(new (karpClass())(x, y));
        emit(['dg', 'en', 's', kind, x, y, { eid: e.id }]);
        cur.enemy = e;
      }
    } else if (kind === 'ditto') {
      const at = spot(p, 340, 560, 30);
      if (!at) return false;
      emit(['dg', 'en', 's', kind, Math.round(at[0]), Math.round(at[1]), null]);
    } else if (kind === 'mew') {
      // Huellas: de cerca de alguien hacia fuera, ~30 m en curva; Mew al final.
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * 6.2832, d0 = G.U.rand(150, 230), L = G.U.rand(850, 1000);
        const sx = p.x + Math.cos(a) * d0, sy = p.y + Math.sin(a) * d0;
        const ex = sx + Math.cos(a) * L, ey = sy + Math.sin(a) * L;
        if (!G.World.isFree(sx, sy, 16) || !G.World.isFree(ex, ey, 30)) continue;
        const bend = G.U.rand(-0.45, 0.45) * L, mx = (sx + ex) / 2 - Math.sin(a) * bend, my = (sy + ey) / 2 + Math.cos(a) * bend;
        emit(['dg', 'en', 's', kind, Math.round(ex), Math.round(ey), { sx: Math.round(sx), sy: Math.round(sy), cx: Math.round(mx), cy: Math.round(my) }]);
        return true;
      }
      return false;
    } else if (kind === 'thief') {
      const host = G.Game.player, amt = Math.floor((host.coins || 0) * STEAL);
      const at = spot(p, 120, 170, 16);
      if (!at || amt < 1) return false;
      G.Sprites.preload([DEX.thief]);
      const def = { dex: DEX.thief, name: 'Electrode', behavior: 'thief', hp: Math.round(70 * (1 + t / 95)), spd: 100, dmg: 0, xp: 15 };
      const e = new G.Enemy(def, at[0], at[1], { hp: G.Coop.scaleHp(players.length), spd: 1, dmg: 1 });
      e.life = LIFE.thief; e.noLoot = true;           // (las monedas las devuelve este archivo)
      e.dummy = true;                                 // no lo recoloca delante el de los rezagados: si se aleja, escapa
      G.EnemyMgr.add(e);
      host.coins -= amt;
      emit(['dg', 'en', 's', kind, Math.round(at[0]), Math.round(at[1]), { eid: e.id, amt }]);
      cur.enemy = e;
    } else return false;
    return true;
  }

  /** Todos: lo que se ve al empezar. */
  function begin(kind, x, y, data) {
    data = data || {};
    const dex = DEX[kind];
    G.Sprites.preload([dex]);
    cur = { kind, phase: kind === 'ditto' ? 'chest' : kind, x, y, hx: x, hy: y, tx: x, ty: y, data, eid: data.eid || 0,
            left: LIFE[kind], prog: 0, t: 0, fx: 0, anim: new G.Sprites.Animator(dex, 1), near: false };
    if (kind === 'mew') {
      // Las huellas (curva de Bézier cuadrática), una cada ~36 px, alternando pie izquierdo y derecho.
      const P = [], sx = data.sx, sy = data.sy, cx = data.cx, cy = data.cy;
      let px = sx, py = sy, acc = 0, side = 1;
      for (let i = 1; i <= 400; i++) {
        const u = i / 400, v = 1 - u;
        const qx = v * v * sx + 2 * v * u * cx + u * u * x, qy = v * v * sy + 2 * v * u * cy + u * u * y;
        acc += Math.hypot(qx - px, qy - py);
        if (acc >= 36) {
          acc = 0; side = -side;
          const a = Math.atan2(qy - py, qx - px);
          P.push({ x: qx - Math.sin(a) * 6 * side, y: qy + Math.cos(a) * 6 * side, a });
        }
        px = qx; py = qy;
      }
      cur.prints = P; cur.reach = 0;
    }
    if (kind === 'fish') cur.rodA = data.a || 0;
    const MSG = {
      moon: '¡Un altar lunar! Quédate junto a Clefairy 5 s: curación y protección para todos',
      karp: 'Un Magikarp chapotea junto al agua… ¡pégale 30 veces!',
      ditto: 'Ha aparecido un cofre en el mapa… ¿o no?',
      fish: 'Slowpoke está pescando junto al agua. Quédate a su lado 8 s',
      nurse: '¡Chansey ha venido de visita! Tócala: curación y reanimación para todos',
      mew: 'Unas huellas brillantes… ¡síguelas!'
    };
    if (kind === 'thief') say(G.I18n.f('¡Un Electrode os ha robado {x} monedas! Derrótalo en 20 s', data.amt), 3.5);
    else say(MSG[kind], 3.5);
    G.Audio.sfx(kind === 'thief' ? 'shiny' : 'surge');
    if (kind === 'thief') {
      const pl = G.Game.player;
      if (pl) { G.FX.dmgText(pl.x, pl.y - 40, '-' + data.amt, '#ffd23f', true); G.FX.burst(x, y - 10, '#ffd23f', 16, 160); }
    } else G.FX.ring(x, y, 6, 60, '#ffe9a0', 0.5, 3);
  }

  /** Todos: cambio de fase (Magikarp → Gyarados, cofre → Ditto). */
  function phase(ph, x, y, eid) {
    if (!cur) return;
    if (ph === 'gyara') {
      cur.phase = 'gyara'; cur.x = x; cur.y = y; cur.left = GYARA_T; cur.atkT = 1; cur.side = 1;
      cur.anim = new G.Sprites.Animator(DEX.gyara, 1);
      G.FX.ring(x, y, 10, 160, '#4b9bff', 0.7, 6); G.FX.burst(x, y - 30, '#bfe8ff', 40, 260);
      G.Camera.kick(1); G.Audio.sfx('boss');
      say('¡Magikarp ha evolucionado en Gyarados! Lucha a vuestro lado 20 s', 3.2);
    } else if (ph === 'fight') {
      cur.phase = 'fight'; cur.eid = eid; cur.left = 180;
      G.FX.burst(cur.x, cur.y - 14, '#c99cff', 30, 220); G.FX.ring(cur.x, cur.y, 6, 90, '#c99cff', 0.5, 4);
      say('¡Era un Ditto disfrazado!', 3);
    }
  }

  // ---------------- cada fotograma ----------------

  /** Anfitrión o solitario: programa y decide. */
  function tick(dt, players) {
    lastPlayers = players;
    if (!allowed()) return;
    const live = players.filter(p => !p.dead);
    if (!live.length) return;
    const t = T();
    if (cur) { hostTick(dt, live, players); return; }
    if (t < nextT) return;
    // Con un jefe vivo se espera (como mucho 45 s; después sale igual, pero nunca el minijefe Ditto).
    const boss = G.EnemyMgr.bossAlive();
    if (G.Floors.inGrace || (boss && (bossWait += 10) <= 45)) { nextT = t + 10; return; }
    bossWait = 0;
    nextT = t + G.U.rand(150, 240);
    const pool = KINDS.filter(k => k !== last && (k !== 'thief' || (G.Game.player.coins || 0) >= 20) && (k !== 'ditto' || !boss));
    const kind = G.U.pick(pool);
    if (start(kind, G.U.pick(live), players)) last = kind;
    else nextT = t + 15;
  }

  function hostTick(dt, live, players) {
    const c = cur;
    if (c.kind === 'moon' || c.kind === 'fish') {
      const near = live.some(p => d2(p, c.x, c.y) < NEAR_R * NEAR_R);
      c.prog = near ? c.prog + dt : Math.max(0, c.prog - dt * 0.5);
      if (c.kind === 'moon' && c.prog >= MOON_T) return emit(['dg', 'en', 'e', 'ok', null]);
      if (c.kind === 'fish' && c.prog >= FISH_T) return emit(['dg', 'en', 'e', 'ok', fishRoll(players)]);
    } else if (c.kind === 'karp') {
      if (c.phase === 'karp') {
        if (c.evolve) {
          c.evolve = false;
          const e = c.enemy, x = Math.round(e ? e.x : c.x), y = Math.round(e ? e.y : c.y);
          if (e) G.EnemyMgr.remove(e);
          c.enemy = null;
          return emit(['dg', 'en', 'ph', 'gyara', x, y, 0]);
        }
        if (c.enemy && G.EnemyMgr.get(c.enemy.id) !== c.enemy) { c.enemy = null; return emit(['dg', 'en', 'e', 'gone', null]); }
      } else if (c.phase === 'gyara') {
        if ((c.atkT -= dt) <= 0) {
          c.atkT = 1.5;
          const tg = G.EnemyMgr.queryCircle(c.x, c.y, 320).filter(e => !e.dead && !e.remote && !(e instanceof (karpClass())))
            .sort((a, b) => d2(a, c.x, c.y) - d2(b, c.x, c.y)).slice(0, 5);
          if (tg.length) {
            const ev = ['dg', 'en', 'gy'];
            for (const e of tg) ev.push(Math.round(e.x), Math.round(e.y - e.bodyH * 0.5));
            emit(ev);
            for (const e of tg) {
              const dmg = e.boss ? e.maxHp * 0.03 : e.elite ? e.maxHp * 0.12 : e.maxHp * 0.5 + 20;
              e.hurt(dmg, '#4b9bff', e.x - c.x, e.y - c.y, 220);
            }
          }
        }
      }
    } else if (c.kind === 'ditto') {
      if (c.phase === 'chest') {
        const who = live.find(p => d2(p, c.x, c.y) < 36 * 36);
        if (who) {
          const t = T(), x = c.x, y = c.y;
          const def = Object.assign({}, G.Enemies.bossAt(t), { dex: who.dex || DEX.ditto, name: 'Ditto' });
          const e = G.Spawner.spawnBossNow(who, t, def, b => {
            b.x = x; b.y = y; b.name = 'Ditto';
            b.maxHp = b.hp = Math.round(b.maxHp * 0.6); b.dmg *= 0.8;
          });
          c.enemy = e;
          return emit(['dg', 'en', 'ph', 'fight', x, y, e ? e.id : 0]);
        }
      } else if (c.enemy) {
        if (c.enemy.dead) return emit(['dg', 'en', 'e', 'ok', null]);
        if (G.EnemyMgr.get(c.enemy.id) !== c.enemy) return emit(['dg', 'en', 'e', 'gone', null]);
      } else return emit(['dg', 'en', 'e', 'gone', null]);
    } else if (c.kind === 'nurse') {
      if ((c.wanderT = (c.wanderT || 0) - dt) <= 0) {
        c.wanderT = G.U.rand(2.5, 4);
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * 6.2832, r = G.U.rand(40, 160);
          const tx = c.hx + Math.cos(a) * r, ty = c.hy + Math.sin(a) * r;
          if (G.World.isFree(tx, ty, 16)) { emit(['dg', 'en', 'mv', Math.round(c.x), Math.round(c.y), Math.round(tx), Math.round(ty)]); break; }
        }
      }
      if (live.some(p => d2(p, c.x, c.y) < 38 * 38)) return emit(['dg', 'en', 'e', 'ok', null]);
    } else if (c.kind === 'mew') {
      const who = live.find(p => d2(p, c.x, c.y - 10) < 42 * 42);
      if (who) return emit(['dg', 'en', 'e', 'ok', key(who)]);
    } else if (c.kind === 'thief') {
      const e = c.enemy;
      if (!e) return emit(['dg', 'en', 'e', 'gone', null]);
      if (e.dead) return emit(['dg', 'en', 'e', 'ok', null]);
      if (G.EnemyMgr.get(e.id) !== e) return emit(['dg', 'en', 'e', 'gone', null]);
      if (players.every(p => d2(p, e.x, e.y) > MM_R * MM_R)) { G.EnemyMgr.remove(e); return emit(['dg', 'en', 'e', 'gone', null]); }
    }
    if (c.left <= 0) {
      if (c.enemy && !c.enemy.dead && G.EnemyMgr.get(c.enemy.id) === c.enemy) G.EnemyMgr.remove(c.enemy);
      emit(['dg', 'en', 'e', c.phase === 'gyara' ? 'bye' : 'gone', null]);
    }
  }

  /** Qué pesca Slowpoke (el anfitrión). */
  function fishRoll(players) {
    const lacking = players.some(p => p.remote ? !(p.net && p.net.bd) : !(p.buddy || p.egg));
    const opts = [['coins', 40], ['item', 30], ['mon', 15]];
    if (lacking) opts.push(['egg', 15]);
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0);
    for (const o of opts) { if ((r -= o[1]) < 0) return o[0]; }
    return 'coins';
  }

  /** Cada ordenador. */
  function update(dt, pl) {
    for (const g of gone) g.t -= dt;
    gone = gone.filter(g => g.t > 0);
    if (!cur || !allowed()) return;
    const c = cur;
    c.left -= dt; c.t += dt;
    c.anim.update(dt);
    const mine = pl && !pl.dead;
    if (c.kind === 'moon' || c.kind === 'fish') {
      c.near = mine && d2(pl, c.x, c.y) < NEAR_R * NEAR_R;
      // Invitado: la barra la lleva con su propio Pokémon (lo decide el anfitrión, como Snorlax).
      if (!authority()) c.prog = c.near ? Math.min(c.kind === 'moon' ? MOON_T : FISH_T, c.prog + dt) : Math.max(0, c.prog - dt * 0.5);
      c.anim.loop('Idle');
      if (c.kind === 'moon' && (c.fx -= dt) <= 0) { c.fx = 0.25; if (G.Camera.sees(c.x, c.y, 40)) G.FX.twinkle(c.x + G.U.rand(-60, 60), c.y - G.U.rand(0, 70)); }
      if (c.kind === 'fish') {
        c.anim.dir = G.Sprites.dirFromAngle(c.rodA);
        if ((c.fx -= dt) <= 0) { c.fx = 1.4; const [bx, by] = bobber(c); if (G.Camera.sees(bx, by, 20)) G.FX.ring(bx, by, 2, 14, '#bfe8ff', 0.5, 1); }
      }
    } else if (c.kind === 'nurse') {
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      if (d > 2) {
        const s = Math.min(d, 34 * dt);
        c.x += dx / d * s; c.y += dy / d * s;
        c.anim.dir = G.Sprites.dirFromAngle(Math.atan2(dy, dx));
        c.anim.loop('Walk', 0.7);
      } else c.anim.loop('Idle');
      if ((c.fx -= dt) <= 0) { c.fx = 0.5; if (G.Camera.sees(c.x, c.y, 20)) G.FX.px(c.x + G.U.rand(-10, 10), c.y - 30, '#ffb3d9', { vy: -30, life: 0.8 }); }
    } else if (c.kind === 'karp' && c.phase === 'gyara') {
      // Gyarados va junto al jugador vivo más cercano (cada ordenador lo calcula igual).
      const mates = G.Game.everyone().filter(p => p && !p.dead);
      let best = null, bd = Infinity;
      for (const p of mates) { const q = d2(p, c.x, c.y); if (q < bd) { bd = q; best = p; } }
      if (best) {
        const tx = best.x + 70 * c.side, ty = best.y - 16;
        const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
        if (d > 8) { const s = Math.min(d, Math.max(120, d * 2.5) * dt); c.x += dx / d * s; c.y += dy / d * s; }
        if (d < 30 && Math.random() < dt * 0.3) c.side = -c.side;
        c.anim.dir = G.Sprites.dirFromAngle(Math.atan2(best.y - c.y, best.x - c.x));
      }
      c.anim.loop('Idle');
    } else if (c.kind === 'mew') {
      c.anim.loop('Idle');
      if (mine && c.prints) {
        for (let i = c.prints.length - 1; i >= c.reach; i--) if (d2(pl, c.prints[i].x, c.prints[i].y) < 120 * 120) { c.reach = i + 1; break; }
      }
      if ((c.fx -= dt) <= 0) { c.fx = 0.3; if (G.Camera.sees(c.x, c.y, 40)) G.FX.px(c.x + G.U.rand(-14, 14), c.y - 30 - G.U.rand(0, 20), '#ffb3e6', { vy: -20, life: 0.7 }); }
    } else c.anim.loop('Idle');
  }

  /** Dónde está el flotador de la caña de Slowpoke. */
  function bobber(c) { return [c.x + Math.cos(c.rodA) * 54, c.y + Math.sin(c.rodA) * 40 + Math.sin(c.t * 3) * 2]; }

  // ---------------- final ----------------

  function finish(how, arg) {
    const c = cur;
    if (!c) return;
    cur = null;
    if (authority() && G.Game.st) nextT = Math.max(nextT, T() + 60);
    const pl = G.Game.player, host = authority(), x = c.x, y = c.y;
    const leave = (dex, rise = 0) => gone.push({ dex, x, y, anim: c.anim, t: 1, rise });
    switch (c.kind) {
      case 'moon':
        if (how === 'ok') {
          G.FX.ring(x, y, 10, 260, '#fff6c8', 0.8, 6); G.FX.burst(x, y - 40, '#fff6c8', 40, 240);
          for (let i = 0; i < 14; i++) G.FX.twinkle(x + G.U.rand(-90, 90), y - G.U.rand(0, 110));
          G.Audio.sfx('heal');
          if (pl && !pl.dead) {
            pl.heal(pl.maxHp * 0.5); pl.invuln = Math.max(pl.invuln || 0, 3);
            G.FX.ring(pl.x, pl.y, 6, 80, '#fff6c8', 0.6, 4);
          }
          say('¡Luz de luna! Todos curados y protegidos 3 s', 3);
        } else say('Clefairy se ha ido…', 2.4);
        leave(DEX.moon, 1);
        break;
      case 'karp':
        if (how === 'bye') { say('Gyarados se marcha. ¡Gracias!', 2.6); G.FX.burst(x, y - 30, '#bfe8ff', 24, 200); leave(DEX.gyara); }
        else { say('Magikarp se ha ido nadando…', 2.4); }
        break;
      case 'ditto':
        if (how === 'ok') {
          say('¡Ditto derrotado!', 2.6);
          const e = c.enemy;
          if (host && e) {
            const ex = e.x, ey = e.y;
            if (Math.random() < 0.5) {
              for (const p of lastPlayers) { const at = spot({ x: ex, y: ey }, 30, 90, 14) || [ex, ey]; G.Pickups.drop('sbox', at[0], at[1], key(p)); }
            } else G.Pickups.drop('item', ex + 24, ey + 6, G.Items.roll());
          }
        } else say(c.phase === 'chest' ? 'El cofre ha desaparecido…' : 'Ditto se ha ido…', 2.4);
        break;
      case 'fish':
        if (how === 'ok') {
          G.FX.burst(x, y - 10, '#bfe8ff', 20, 180); G.Audio.sfx('coin');
          const TXT = { coins: '¡Slowpoke ha pescado monedas!', item: '¡Slowpoke ha pescado un objeto!', egg: '¡Slowpoke ha pescado un huevo!', mon: '¡Slowpoke ha pescado… un monstruo!' };
          say(TXT[arg] || TXT.coins, 3);
          if (host) {
            const [bx, by] = bobber(c), dx = () => x + G.U.rand(-40, 40), dy = () => y + G.U.rand(-26, 26);
            if (arg === 'item') G.Pickups.drop('item', x + 26, y + 4, G.Items.roll());
            else if (arg === 'egg') {
              for (const p of lastPlayers) {
                if (p.remote ? (p.net && p.net.bd) : (p.buddy || p.egg)) continue;
                const at = spot({ x, y }, 30, 80, 16) || [x, y];
                G.Pickups.drop('egg', at[0], at[1], key(p));
              }
            } else if (arg === 'mon') {
              const at = G.World.isFree(bx, by, 12) ? [bx, by] : (spot({ x, y }, 40, 90, 14) || [x + 40, y]);
              const e = G.Spawner.spawnAt(at[0], at[1], T());
              if (e && !e.elite) e.makeElite(G.Enemy.rollAffixes(T()));
              for (let i = 0; i < 3; i++) G.Pickups.drop('coin', dx(), dy(), 4);
            } else for (let i = 0; i < 10; i++) G.Pickups.drop('coin', dx(), dy(), 4);
          }
        } else say('Slowpoke se ha aburrido y se ha ido', 2.4);
        leave(DEX.fish);
        break;
      case 'nurse':
        if (how === 'ok') {
          G.FX.ring(x, y, 10, 220, '#ff9ed8', 0.7, 5); G.FX.burst(x, y - 30, '#ffd9ec', 30, 220);
          G.Audio.sfx('heal');
          if (pl) {
            if (pl.dead) pl.revive(1);
            else { pl.hp = pl.maxHp; G.FX.ring(pl.x, pl.y, 6, 80, '#ff9ed8', 0.6, 4); G.FX.dmgText(pl.x, pl.y - 40, G.T('¡Vida llena!'), '#ff9ed8', true); }
          }
          say('¡Huevo Suerte! Todos curados (y reanimados)', 3);
        } else say('Chansey se ha ido', 2.4);
        leave(DEX.nurse);
        break;
      case 'mew':
        if (how === 'ok') {
          G.FX.ring(x, y, 6, 140, '#ffb3e6', 0.7, 5); G.FX.burst(x, y - 30, '#ffd6f2', 40, 240);
          G.Audio.sfx('shinyGet');
          if (pl && key(pl) === arg) {
            const list = G.LevelUp.offer(pl, 8);
            const up = list.find(o => o.type === 'up') || list.find(o => o.type === 'new') || list.find(o => o.type !== 'stat') || list[0];
            if (up) { up.apply(pl); say(G.T('Mew te ha regalado') + ': ' + G.T(up.title), 3.2); }
          } else say('¡Mew ha hecho un regalo y se ha ido volando!', 2.8);
        } else say('Mew se ha ido volando…', 2.4);
        leave(DEX.mew, 1);
        break;
      case 'thief': {
        const amt = (c.data && c.data.amt) || 0, back = Math.round(amt * BACK);
        if (how === 'ok') {
          say(G.I18n.f('¡Monedas recuperadas! +{x}', back), 3);
          G.Audio.sfx('coin');
          const e = c.enemy || G.EnemyMgr.get(c.eid);
          const ex = e ? e.x : x, ey = e ? e.y : y;
          G.FX.burst(ex, ey - 10, '#ffd23f', 30, 220); G.FX.dmgText(ex, ey - 40, '+' + back, '#ffd23f', true);
          if (host) { G.Game.player.coins = (G.Game.player.coins || 0) + back; G.Pickups.dropXp(ex, ey, 15); }
        } else say(G.I18n.f('Electrode se ha escapado con {x} monedas…', amt), 3);
        break;
      }
    }
  }

  function gyFx(pts) {
    const c = cur;
    if (!c || c.phase !== 'gyara') return;
    const ox = c.x, oy = c.y - 50;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const tx = pts[i], ty = pts[i + 1];
      G.FX.beam(ox, oy, Math.atan2(ty - oy, tx - ox), Math.hypot(tx - ox, ty - oy), 9, '#4b9bff', { pal: 'water' });
      G.FX.ring(tx, ty, 4, 34, '#9fd8ff', 0.35, 3);
    }
    c.anim.play('Attack');
    if (G.Camera.sees(c.x, c.y, 60)) G.Audio.sfx('shot');
  }

  function onNet(ev) {
    const s = ev[2];
    if (s === 's') { begin(ev[3], ev[4], ev[5], ev[6]); return; }
    if (!cur) return;
    if (s === 'p') cur.prog = ev[3];
    else if (s === 'ph') phase(ev[3], ev[4], ev[5], ev[6]);
    else if (s === 'mv') {
      // (si el invitado se ha desviado mucho, se pone donde está en el anfitrión)
      if (G.U.dist2(cur.x, cur.y, ev[3], ev[4]) > 40 * 40) { cur.x = ev[3]; cur.y = ev[4]; }
      cur.tx = ev[5]; cur.ty = ev[6];
    } else if (s === 'gy') gyFx(ev.slice(3));
    else if (s === 'e') finish(ev[3], ev[4]);
  }

  // ---------------- dibujo ----------------

  /** Lo que tiene pies, ordenado por Y con los Pokémon (game.js drawScene). */
  function drawables() {
    const out = [];
    for (const g of gone) {
      if (!G.Camera.sees(g.x, g.y, 120)) continue;
      out.push({ y: g.y, draw: ctx => g.anim.draw(ctx, g.x, g.y - (1 - g.t) * 120 * g.rise, { alpha: g.t }) });
    }
    const c = cur;
    if (!c || !allowed()) return out;
    const now = performance.now() / 1000;
    // En el suelo (por debajo de todo): el círculo del altar / de pesca y las huellas de Mew.
    if ((c.kind === 'moon' || c.kind === 'fish') && G.Camera.sees(c.x, c.y, 120)) {
      out.push({ y: -1e9, draw: ctx => {
        ctx.save();
        const col = c.kind === 'moon' ? '255,240,180' : '160,215,255';
        ctx.globalAlpha = 0.16 + (c.near ? 0.1 : 0) + Math.sin(now * 3) * 0.04;
        ctx.fillStyle = `rgb(${col})`;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, NEAR_R, NEAR_R * 0.55, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.7; ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.ellipse(c.x, c.y, NEAR_R, NEAR_R * 0.55, 0, 0, 6.2832); ctx.stroke();
        ctx.restore();
      } });
    }
    if (c.kind === 'mew' && c.prints) {
      out.push({ y: -1e9, draw: ctx => {
        const n = c.prints.length;
        for (let i = 0; i < n; i++) {
          const p = c.prints[i];
          if (!G.Camera.sees(p.x, p.y, 20)) continue;
          // Brillo que recorre el rastro hacia Mew.
          const wave = 0.5 + 0.5 * Math.sin(now * 4 - i * 0.5);
          ctx.save();
          ctx.globalAlpha = 0.35 + wave * 0.5;
          ctx.translate(p.x, p.y); ctx.rotate(p.a + Math.PI / 2);
          ctx.fillStyle = 'rgba(255,150,220,.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 11, 0, 0, 6.2832); ctx.fill();
          ctx.fillStyle = '#ffb3e6';
          ctx.beginPath(); ctx.ellipse(0, 1, 4, 5, 0, 0, 6.2832); ctx.fill();
          for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(k * 3.6, -5.5 + Math.abs(k), 1.8, 0, 6.2832); ctx.fill(); }
          ctx.restore();
        }
      } });
    }
    if (!G.Camera.sees(c.x, c.y, 120)) return out;
    const dex = c.phase === 'gyara' ? DEX.gyara : DEX[c.kind];
    if (c.kind === 'ditto' && c.phase === 'chest') {
      out.push({ y: c.y, draw: ctx => {
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 22, 7, 0, 0, 6.2832); ctx.fill(); ctx.restore();
        // De vez en cuando el cofre se mueve solo…
        const wob = Math.sin(now * 2.2) > 0.85 ? Math.sin(now * 40) * 1.5 : 0;
        G.Pickups.sprite(ctx, 'chest', 0, c.x + wob, c.y - 16, 1.7);
      } });
    } else if (c.kind === 'karp' && c.phase === 'gyara') {
      out.push({ y: c.y, draw: ctx => {
        const lift = 8 + Math.sin(now * 2.4) * 4;
        G.Sprites.drawShadow(ctx, dex, c.x, c.y, 1);
        c.anim.draw(ctx, c.x, c.y - lift, {});
      } });
    } else if (c.kind === 'moon' || c.kind === 'fish' || c.kind === 'nurse' || c.kind === 'mew') {
      out.push({ y: c.y, draw: ctx => {
        const pl = G.Game.player;
        let alpha = 1, lift = 0;
        if (c.kind === 'mew') { lift = 14 + Math.sin(now * 2) * 5; alpha = pl && d2(pl, c.x, c.y) < 380 * 380 ? 1 : 0.4; }
        G.Sprites.drawShadow(ctx, dex, c.x, c.y, 1);
        if (c.kind === 'fish') {
          // Caña de pescar: sedal hasta el flotador.
          const [bx, by] = bobber(c);
          ctx.save();
          ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2;
          const rx = c.x + Math.cos(c.rodA) * 20, ry = c.y - 22 + Math.sin(c.rodA) * 10;
          ctx.beginPath(); ctx.moveTo(c.x + Math.cos(c.rodA) * 6, c.y - 10); ctx.lineTo(rx, ry - 14); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(rx, ry - 14); ctx.quadraticCurveTo((rx + bx) / 2, ry, bx, by); ctx.stroke();
          ctx.fillStyle = '#ff4a4a'; ctx.fillRect(Math.round(bx) - 2, Math.round(by) - 3, 4, 3);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(bx) - 2, Math.round(by), 4, 2);
          ctx.restore();
        }
        if (c.kind === 'moon') {
          // Rayo de luna sobre Clefairy.
          ctx.save();
          const g = ctx.createLinearGradient(0, c.y - 160, 0, c.y);
          g.addColorStop(0, 'rgba(255,246,200,0)'); g.addColorStop(1, `rgba(255,246,200,${0.18 + c.prog / MOON_T * 0.3})`);
          ctx.fillStyle = g; ctx.fillRect(c.x - 22, c.y - 160, 44, 160);
          ctx.restore();
        }
        c.anim.draw(ctx, c.x, c.y - lift, { alpha });
      } });
    }
    return out;
  }

  function bar(ctx, x, y, frac, col, w = 60) {
    const bx = Math.round(x - w / 2), by = Math.round(y);
    ctx.fillStyle = '#1a1a2a'; ctx.fillRect(bx - 2, by - 2, w + 4, 10);
    ctx.fillStyle = col; ctx.fillRect(bx, by, Math.round(w * G.U.clamp(frac, 0, 1)), 6);
  }
  function timer(ctx, x, y, left, col = '#ffffff') {
    ctx.save();
    ctx.font = '800 10px Pixelify,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center';
    const s = Math.max(0, Math.ceil(left)) + ' s';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
    ctx.restore();
  }

  /** Bocadillos, barras y tiempos (encima de todo). */
  function drawAir(ctx) {
    const c = cur;
    if (!c || !allowed()) return;
    const pl = G.Game.player, B = G.Funny.bubble;
    const close = (x, y, r = 340) => pl && G.U.dist2(pl.x, pl.y, x, y) < r * r;
    const top = (dex, x, y, extra = 0) => y - G.Sprites.bodyHeight(dex, 1) - 14 - extra;
    if (c.kind === 'moon' || c.kind === 'fish') {
      if (!G.Camera.sees(c.x, c.y, 120)) return;
      const need = c.kind === 'moon' ? MOON_T : FISH_T, ty = top(DEX[c.kind], c.x, c.y);
      if (c.prog > 0) bar(ctx, c.x, ty - 6, c.prog / need, c.kind === 'moon' ? '#fff0a0' : '#7fd0ff');
      else if (close(c.x, c.y)) B(ctx, c.x, ty, G.T(c.kind === 'moon' ? 'Quédate a mi lado bajo la luna…' : 'Quédate a mi lado y pescaré algo…'));
      timer(ctx, c.x, c.y + 28, c.left);
    } else if (c.kind === 'karp') {
      if (c.phase === 'karp') {
        const e = G.EnemyMgr.get(c.eid), x = e ? e.x : c.x, y = e ? e.y : c.y;
        if (!G.Camera.sees(x, y, 120)) return;
        const ty = top(DEX.karp, x, y, 4);
        if (close(x, y)) B(ctx, x, ty - 14, G.I18n.f('¡Pégame! {x}/30', Math.min(KARP_HITS, c.prog)));
        bar(ctx, x, ty + 2, c.prog / KARP_HITS, '#ff9a5a', 50);
        timer(ctx, x, y + 28, c.left);
      } else {
        if (!G.Camera.sees(c.x, c.y, 160)) return;
        const ty = top(DEX.gyara, c.x, c.y, 10);
        if (c.left > GYARA_T - 3) B(ctx, c.x, ty - 10, G.T('¡Gyarados lucha a tu lado!'), '#1d4fa0');
        bar(ctx, c.x, ty, c.left / GYARA_T, '#4b9bff', 60);
      }
    } else if (c.kind === 'ditto') {
      if (c.phase === 'chest') {
        if (!G.Camera.sees(c.x, c.y, 120)) return;
        if (close(c.x, c.y)) B(ctx, c.x, c.y - 48, G.T('¿Un cofre? Tócalo para abrirlo'));
        timer(ctx, c.x, c.y + 28, c.left);
      } else {
        const e = G.EnemyMgr.get(c.eid);
        if (e && !e.dead && G.Camera.sees(e.x, e.y, 120)) B(ctx, e.x, e.y - e.bodyH - 34, G.T('¡Era Ditto!'), '#7a3fc0');
      }
    } else if (c.kind === 'nurse') {
      if (!G.Camera.sees(c.x, c.y, 120)) return;
      if (close(c.x, c.y)) B(ctx, c.x, top(DEX.nurse, c.x, c.y), G.T('¡Tócame! Huevo Suerte para todos'), '#c8287a');
      timer(ctx, c.x, c.y + 28, c.left);
    } else if (c.kind === 'mew') {
      if (c.prints && c.prints.length && c.reach < 3) {
        const p0 = c.prints[0];
        if (G.Camera.sees(p0.x, p0.y, 60)) B(ctx, p0.x, p0.y - 18, G.T('Sigue las huellas…'), '#c8287a');
      }
      if (G.Camera.sees(c.x, c.y, 120) && close(c.x, c.y, 380)) {
        B(ctx, c.x, top(DEX.mew, c.x, c.y, 18), G.T('¡Tócame! ♪'), '#c8287a');
        timer(ctx, c.x, c.y + 28, c.left);
      }
    } else if (c.kind === 'thief') {
      const e = G.EnemyMgr.get(c.eid);
      if (!e || e.dead || !G.Camera.sees(e.x, e.y, 80)) return;
      const ty = e.y - e.bodyH - 18;
      B(ctx, e.x, ty - 10, G.I18n.f('¡{x} monedas robadas!', (c.data && c.data.amt) || 0), '#c8282a');
      bar(ctx, e.x, ty - 2, c.left / LIFE.thief, '#ffd23f', 50);
    }
  }

  /** Para el minimapa y la flecha del borde (hud.js). */
  function marker() {
    const c = cur;
    if (!c || !allowed()) return null;
    switch (c.kind) {
      case 'moon': return { x: c.x, y: c.y, name: 'Altar lunar', col: '#fff0a0' };
      case 'fish': return { x: c.x, y: c.y, name: 'Slowpoke', col: '#9fd8ff' };
      case 'nurse': return { x: c.x, y: c.y, name: 'Chansey', col: '#ffb3d9' };
      case 'karp': {
        if (c.phase !== 'karp') return null;
        const e = G.EnemyMgr.get(c.eid);
        return { x: e ? e.x : c.x, y: e ? e.y : c.y, name: 'Magikarp', col: '#ffb08a' };
      }
      case 'ditto': return c.phase === 'chest' ? { x: c.x, y: c.y, name: 'Cofre', col: '#d9b0ff' } : null;
      case 'mew': {
        // La siguiente huella por delante de ti (si ya casi has llegado, Mew).
        const P = c.prints || [], i = Math.min(P.length - 1, c.reach + 3);
        const p = i >= P.length - 4 || i < 0 ? c : P[i];
        return { x: p.x, y: p.y, name: p === c ? 'Mew' : 'Huellas de Mew', col: '#ffb3e6' };
      }
      case 'thief': {
        const e = G.EnemyMgr.get(c.eid);
        return e && !e.dead ? { x: e.x, y: e.y, name: 'Electrode', col: '#ffd23f', noArrow: true } : null;     // (la flecha ya la pone events.js, como a los duendes)
      }
    }
    return null;
  }

  /** Prueba: G.Encounters.force('mew'). Sólo anfitrión o solitario. */
  function force(kind) {
    if (!authority() || !KINDS.includes(kind) || !G.Game.player) return false;
    if (cur) { if (cur.enemy && G.EnemyMgr.get(cur.enemy.id) === cur.enemy) G.EnemyMgr.remove(cur.enemy); cur = null; }
    if (kind === 'thief' && (G.Game.player.coins || 0) < 10) G.Game.player.coins = 100;
    const ok = start(kind, G.Game.player, G.Game.everyone());
    if (ok) last = kind;
    return ok;
  }

  return { reset, clear, tick, update, onNet, drawables, drawAir, marker, force, KINDS,
           get cur() { return cur; }, get nextT() { return nextT; } };
})();
