/* ============ combat.js — ejecución de movimientos y colisiones ============
 * Sólo se ejecuta el movimiento ACTIVO del jugador. Cada `kind` tiene aquí su
 * implementación. Todos los ataques dañan también los objetos destructibles
 * del escenario (rocas, cofres, hierba alta).
 *
 * Todo ocurre en el plano del suelo: (x, y) son pies / sombra.
 *
 * Cooperativo: cada ordenador ejecuta los ataques de SU jugador. Los de los
 * compañeros llegan por la red y se repiten como "fantasma" (ghostCast): se
 * ven igual, pero no hacen daño aquí (ya lo hizo su dueño).
 *
 * Lo que se queda en el mapa un rato (minas, meteoros que caen, torretas,
 * charcos del rastro) vive en `fields` y se actualiza/dibuja aquí.
 */
G.Combat = (() => {
  let ghost = false;
  /*
   * PK (2026-10-15): los rivales también son blancos de TUS ataques. Se juzga en la pantalla de
   * quien ataca (lo que ves es lo que pega) y el daño va a pvp.js (deal), que avisa al rival.
   * Antes lo juzgaba quien recibía, con retraso, y los ataques que buscan enemigos (Puño Lee,
   * rayos, flechas, cadena, árboles, meteoros, mordisco...) nunca encontraban a otro jugador.
   */
  const isFoe = e => e instanceof G.Player;
  const FIELD_R = 28;      // Shaq: el campo llega a pl.r + 28 (player.js lo dibuja igual)
  function enemiesIn(x, y, r) {
    const l = G.EnemyMgr.queryCircle(x, y, r);
    if (!G.PvP.on) return l;
    // Tus ataques: los rivales. El ataque repetido de un rival (fantasma): tú, sólo para que
    // se VEA dónde cae (el rayo, el puñetazo, el árbol...); el daño lo decide él (deal).
    return l.concat(ghost ? G.PvP.meFor(ghostOwner, x, y, r) : G.PvP.foesIn(x, y, r));
  }
  let ghostOwner = null;
  const alive = e => isFoe(e) || !!G.EnemyMgr.get(e.id);
  let fields = [];

  // ---------------- ejecutar el movimiento activo ----------------

  function tick(dt, pl, now) {
    if (pl.dead) return;
    // Dentro de la tienda o de una sala sin enemigos: no se ataca (sólo los de apoyo).
    // (2026-10-15: en la tienda de Kecleon los ataques salían solos sin nadie a quien pegar.)
    if (G.Dungeon.inRoom && !G.EnemyMgr.all().some(e => !e.dead)) {
      for (const m of pl.moves) if (m.kind === 'support') tickMove(dt, pl, m, now);
      G.Projectiles.clearOrbs(pl);
      return;
    }
    // Vínculos: todos los movimientos del hueco activo, cada uno con su recarga.
    const group = pl.activeGroup();
    // Durmiendo (Descanso) no se ataca; los de apoyo y pasivos siguen.
    // (2026-10-15: con Descanso dentro del vínculo activo no se despertaba nunca: sus apoyos y pasivos sí siguen.)
    for (const m of group) if (!(pl.sleepT > 0) || G.Moves.isPassive(m)) tickMove(dt, pl, m, now);
    // Pasivos (Escudo de Llamas, Colmillo Vampiro evolucionado): siempre, aunque no estén activos.
    for (const m of pl.moves) if (!group.includes(m) && G.Moves.isPassive(m)) tickMove(dt, pl, m, now);
  }

  function tickMove(dt, pl, m, now) {
    if (m.kind === 'orbit') { orbit(pl, m, dt, now); return; }
    if (m.kind === 'support') { support(dt, pl, m); return; }

    m.t -= dt;
    if (m.t > 0) return;
    // Los ataques que necesitan blanco esperan a tenerlo (no gastes animación al aire).
    if (needsTarget(m) && !(pl.target && G.U.dist(pl.x, pl.y, pl.target.x, pl.target.y) <= reach(m))
        && !(ENEMY_ONLY.has(m.kind) && propNear(pl, m))          // (un cofre o una roca a mano también vale)
        && !(G.PvP.on && G.PvP.foe(pl, reach(m) + (G.PvP.aiming ? 160 : 0)))) {   // apuntando: dispara si hay un rival cerca
      m.t = 0.05;
      return;
    }
    const row = G.Moves.stat(m);
    m.t = Math.max(0.05, ((row && row.cd) || m.cd) * pl.cdK * (m.mega ? G.MegaAb.cdK(m) : 1));
    // Los pasivos no hacen animación ni se mandan a los demás (sólo cuenta su efecto).
    if (!G.Moves.isPassive(m)) {
      G.Arts.onAttack(pl, m);           // Varita de Saúco: cada ataque, un poco menos de recarga
      // Turbo Fantasma sale cada 0,3 s: sin animación de ataque (parecía que no paraba de atacar; las sombras ya se ven).
      if (m.kind !== 'afterimage') pl.cast(m);
      if (G.Coop.active) G.Coop.cast(pl, m);
    }
    // Vínculo: su icono destella en el HUD al lanzarse (uno que explota pegado al
    // enemigo, como Ascuas tras Ataque Rápido, casi no se ve).
    m.castAt = performance.now();

    run(pl, m);
  }

  /*
   * (2026-10-16, «los ataques no rompen los cofres») Los movimientos de la tabla buscan sólo
   * enemigos (enemiesIn): sin ninguno cerca, el blanco del jugador es la roca o el cofre más
   * cercano (player.js) y no le pasaba nada. Ahora, si no hay enemigos a su alcance, golpean
   * ese objeto con su daño.
   */
  const ENEMY_ONLY = new Set(['flameshield', 'lightning', 'drain', 'psyarrow', 'acidrain', 'fist', 'spear', 'treefall', 'hearts',
                              'tornado', 'bladestorm', 'dbeam', 'foampunch', 'scare', 'afterimage', 'pounce', 'whip', 'question', 'pan',
                              'clay', 'rockfist', 'windwall', 'icebolt']);
  /** El objeto rompible más cercano a su alcance si no hay enemigos (cofres y rocas antes que la hierba). */
  function propNear(pl, m) {
    const R = reach(m);
    if (enemiesIn(pl.x, pl.y, R).some(e => !e.dead)) return null;
    let tg = null, bd = Infinity;
    for (const q of G.World.propsInCircle(pl.x, pl.y, R)) {
      if (!q.destructible || q.hp <= 0) continue;
      const d = G.U.dist2(pl.x, pl.y, q.x, q.y) + (q.type === 'grass' ? 1e6 : 0);
      if (d < bd) { bd = d; tg = q; }
    }
    return tg;
  }
  /** El blanco del jugador si es un objeto (sin enemigos, player.js apunta a la roca o el cofre más cercano). */
  const propTarget = pl => { const t = pl.target; return t && t.tx !== undefined && t.destructible && t.hp > 0 ? t : null; };
  function propFallback(pl, m) {
    const row = G.Moves.stat(m), tg = propNear(pl, m);
    if (!tg) return;
    const per = row ? (row.dmg || row.bdmg || row.sdps || 10) * (row.n || 1) : (m.dmg || 10);
    const col = G.U.TYPE_COLOR[m.type] || '#ffffff';
    G.FX.sp('impact', G.VFX.PAL[m.type] ? m.type : 'normal', tg.x, tg.y - 10, { life: 0.16, scale: 1.4, frameRate: 14 });
    G.FX.burst(tg.x, tg.y - 8, col, 6, 100);
    if (!ghost) G.World.damageProp(tg, per * pl.atk, col);
  }

  function run(pl, m) {
    if (ENEMY_ONLY.has(m.kind) && m.kind !== 'flameshield') propFallback(pl, m);
    switch (m.kind) {
      case 'projectile': fireProjectiles(pl, m); break;
      case 'melee':      melee(pl, m); break;
      case 'beam':       beam(pl, m); break;
      case 'nova':       nova(pl, m); break;
      case 'aura':       aura(pl, m); break;
      case 'buff':       buff(pl, m); break;
      case 'boomerang':  boomerang(pl, m); break;
      case 'chain':      chain(pl, m); break;
      case 'mine':       mines(pl, m); break;
      case 'meteor':     meteors(pl, m); break;
      case 'turret':     turret(pl, m); break;
      case 'dash':       dash(pl, m); break;
      case 'trail':      trailPatch(pl, m); break;
      case 'cone':       cone(pl, m); break;
      case 'flameshield': flameShield(pl, m); break;
      case 'lightning':  lightning(pl, m); break;
      case 'drain':      drain(pl, m); break;
      case 'psyarrow':   psyArrows(pl, m); break;
      case 'acidrain':   acidRain(pl, m); break;
      case 'fist':       fist(pl, m); break;
      case 'bulk':       bulk(pl, m); break;
      case 'spear':      spears(pl, m); break;
      case 'treefall':   trees(pl, m); break;
      case 'hearts':     hearts(pl, m); break;
      case 'tornado':    tornados(pl, m); break;
      case 'bladestorm': bladeStorm(pl, m); break;
      case 'dbeam':      dBeams(pl, m); break;
      // 2026-10-16: exclusivos de los personajes originales
      case 'foampunch':  foamPunch(pl, m); break;
      case 'scare':      scare(pl, m); break;
      case 'afterimage': afterimage(pl, m); break;
      case 'pounce':     pounce(pl, m); break;
      case 'pan':        pan(pl, m); break;
      case 'whip':       whips(pl, m); break;
      case 'question':   questions(pl, m); break;
      case 'roll':       potatoRoll(pl, m); break;
      // 2026-10-16 (V3.1): los 5 de la hoja del dueño
      case 'clay':       clays(pl, m); break;
      case 'rockfist':   rockFists(pl, m); break;
      case 'windwall':   windWall(pl, m); break;
      case 'icebolt':    iceArts(pl, m); break;
      case 'dragonorb':  dragonOrbs(pl, m); break;
    }
    if (!ghost && (m.boostCh || m.recoil || m.confuseEvery)) afterCast(pl, m);
  }

  // ---------------- movimientos de esta versión ----------------
  const TILE = 32;

  /**
   * Escudo de Llamas (pasivo, cada 0,5 s): los enemigos a menos de `r` casillas
   * quedan "en llamas" `dur` s (se renueva mientras sigan cerca) y pierden `dps`
   * por segundo. Evolucionado: además reciben +vuln de daño de todo.
   */
  function flameShield(pl, m) {
    if (ghost) return;
    const row = G.Moves.stat(m), R = row.r * TILE, now = G.Game.st.time;
    const col = G.U.TYPE_COLOR.fire;
    const map = pl.fsMap || (pl.fsMap = new Map());
    for (const e of enemiesIn(pl.x, pl.y, R)) if (!e.dead) map.set(e, now + row.dur);
    for (const [e, until] of map) {
      if (e.dead || until < now || !alive(e)) { map.delete(e); continue; }
      if (row.vuln) e.vulnUntil = now + 0.6;
      hit(pl, e, row.dps * 0.5 * pl.atk, col, 0, 0, 0, m);
      if (Math.random() < 0.5 && G.Camera.sees(e.x, e.y, 20)) G.FX.burst(e.x, e.y - e.bodyH * 0.6, '#ff8a3d', 2, 40);
    }
    // (El aro de llamas de píxeles lo dibuja player.js, siguiéndote: antes era un círculo liso.)
  }

  /** Un rayo que cae del cielo en (x, y). */
  // (2026-10-16: antes un rayo recto genérico y un círculo; ahora rayo de píxeles en zigzag con
  // ramas, chispas en estrella y una quemadura en el suelo que dura un momento.)
  function boltFx(x, y, vis) {
    G.FX.bolt(x, y, { h: 320 });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.2832 + G.U.rand(-0.2, 0.2), sp = G.U.rand(90, 170);
      G.FX.px(x, y - 4, i % 2 ? '#fffbe6' : '#ffd23f', { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 40, life: G.U.rand(0.18, 0.32), size: 2 });
    }
    G.FX.sp('pow', 'electric', x, y - 6, { life: 0.16, scale: 1.2 });
    // Quemadura: cruz oscura en el suelo que se apaga.
    for (const [dx, dy] of [[0, 0], [-6, 0], [6, 0], [0, -3], [0, 3], [-10, 2], [10, -2]])
      G.FX.px(x + dx, y + dy, '#2a2238', { life: 0.9, size: 2, grav: 0 });
  }

  /**
   * Caída de Rayo: `n` rayos sobre enemigos al azar a menos de `r` casillas (cada
   * uno salpica 0,75 casillas). Evolucionado: descargas entre un rayo y el siguiente
   * durante 1 s que hacen `link` de daño por segundo a lo que crucen.
   */
  function lightning(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE, vis = G.VFX.forMove(m), col = G.U.TYPE_COLOR.electric;
    const pool = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead);
    if (!pool.length) return;
    const pts = [];
    for (let i = 0; i < row.n; i++) {
      // Sin repetir mientras haya enemigos distintos; si hay menos que rayos, repiten.
      const k = i < pool.length ? i + Math.floor(Math.random() * (pool.length - i)) : Math.floor(Math.random() * pool.length);
      if (i < pool.length) [pool[i], pool[k]] = [pool[k], pool[i]];
      const t = pool[i < pool.length ? i : k];
      pts.push({ x: t.x, y: t.y });
      boltFx(t.x, t.y, vis);
      if (!ghost) for (const e of enemiesIn(t.x, t.y, TILE * 0.75)) if (!e.dead) hit(pl, e, row.dmg * pl.atk, col, 0, 0, 0, m);
    }
    if (G.Camera.sees(pl.x, pl.y, 0)) G.Audio.sfx('shot', { kind: 'beam', type: 'electric' });
    if (row.link && pts.length > 1) fields.push({ kind: 'link', owner: pl, ghost, m, col, vis, pts, t: 0, life: 1.0, tick: 0,
                                                  x: pts[0].x, y: pts[0].y, dmg: row.link * 0.2 * pl.atk });
  }

  /**
   * Flecha Psíquica: `n` flechas, cada una a un enemigo distinto (de los más cercanos,
   * a menos de `r` casillas). Al dar, salta al siguiente más cercano sin golpear
   * (evolucionado: también a uno ya golpeado, salvo el de ahora) hasta `pierce` saltos.
   * El vuelo lo mueve updateFields ('arrow').
   */
  const ARROW_HOP = 8 * TILE;   // hasta dónde busca al siguiente
  function psyArrows(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const near = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead)
      .sort((a, b) => G.U.dist2(a.x, a.y, pl.x, pl.y) - G.U.dist2(b.x, b.y, pl.x, pl.y));
    if (!near.length) return;
    for (let i = 0; i < row.n; i++) {
      const target = near[i % near.length];
      fields.push({ kind: 'arrow', owner: pl, ghost, m, col: '#ff4f9a', x: pl.x, y: pl.y - G.LIFT * 0.5, t: 0, life: 6,
                    target, hops: row.pierce, hit: new Set(), first: true, d1: row.d1, d2: row.d2, repeat: !!row.repeat,
                    ang: Math.atan2(target.y - pl.y, target.x - pl.x), trail: [] });
    }
  }

  /** Mueve una flecha; al llegar golpea y elige el siguiente. Devuelve false cuando acaba. */
  function arrowStep(f, dt) {
    const SPEED = 620;
    let e = f.target;
    if (!e || e.dead || !alive(e)) { e = f.target = nextArrowTarget(f, f.x, f.y, null); if (!e) return false; }
    const tx = e.x, ty = e.y - e.bodyH * 0.5;
    const d = Math.hypot(tx - f.x, ty - f.y);
    f.ang = Math.atan2(ty - f.y, tx - f.x);
    f.trail.push([f.x, f.y]); if (f.trail.length > 6) f.trail.shift();
    if (d > SPEED * dt + e.r * 0.5) { f.x += Math.cos(f.ang) * SPEED * dt; f.y += Math.sin(f.ang) * SPEED * dt; return true; }
    // Llega: golpea y salta.
    f.x = tx; f.y = ty;
    if (!f.ghost) hit(f.owner, e, (f.first ? f.d1 : f.d2) * f.owner.atk, f.col, Math.cos(f.ang), Math.sin(f.ang), 0, f.m);
    G.FX.burst(tx, ty, f.col, 6, 90);
    if (G.Camera.sees(tx, ty, 20)) G.FX.sp('impact', 'psychic', tx, ty, { life: 0.14, scale: 1.3 });
    f.hit.add(e.id); f.first = false;
    if (f.hops-- <= 0) return false;
    f.target = nextArrowTarget(f, e.x, e.y, e);
    return !!f.target;
  }

  function nextArrowTarget(f, x, y, cur) {
    let best = null, bd = ARROW_HOP * ARROW_HOP;
    for (const e of enemiesIn(x, y, ARROW_HOP)) {
      if (e.dead || e === cur || (!f.repeat && f.hit.has(e.id))) continue;
      const d = G.U.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /**
   * Colmillo Vampiro: muerde a los `n` enemigos más cercanos a menos de `r` casillas
   * y te cura `heal` en total (no por cada uno).
   */
  function drain(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE, col = '#c47bff';
    const list = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead)
      .sort((a, b) => G.U.dist2(a.x, a.y, pl.x, pl.y) - G.U.dist2(b.x, b.y, pl.x, pl.y)).slice(0, row.n);
    if (!list.length) return;
    for (const e of list) {
      // Un mordisco en cada uno (2026-10-16, feedback: antes era una línea hasta ti).
      if (G.Camera.sees(e.x, e.y, 20)) {
        const y = e.y - e.bodyH * 0.55;
        G.FX.sp('jaws', 'poison', e.x, y, { life: 0.28, scale: 1.6, frameRate: 9, fade: false });
        G.FX.burst(e.x, y + 4, '#e0303a', 3, 70);
      }
      if (!ghost) hit(pl, e, row.dmg * pl.atk, col, 0, 0, 0, m);
    }
    if (!ghost) pl.heal(row.heal);
    G.FX.ring(pl.x, pl.y, pl.r, pl.r * 2.5, '#7dffb0', 0.3, 2);
  }

  // ---------------- movimientos de 2026-10-15 ----------------
  const byDist = pl => (a, b) => G.U.dist2(a.x, a.y, pl.x, pl.y) - G.U.dist2(b.x, b.y, pl.x, pl.y);
  const NOCRIT = { crit: false };

  /*
   * Estados que dejan los movimientos y siguen haciendo daño: el veneno de Lluvia
   * Corrosiva (con su frenado), el sangrado de Puño Lee y los "charcos andantes"
   * (quien pisa un charco va dejando más). Enemigo -> { owner, pm, pUntil, pDps, slow,
   * bm, bleed, drip, prow }. Se cuentan cada 0,5 s en tickDots.
   */
  let dots = new Map(), dotT = 0;
  function dotOf(pl, e) {
    let d = dots.get(e);
    if (!d) { d = { owner: pl, pUntil: 0, pDps: 0, slow: 0, bleed: 0, drip: 0 }; dots.set(e, d); }
    d.owner = pl;
    return d;
  }
  /** Artefactos que dejan daño en el tiempo al golpear (G.Arts.onHit): 'cleaver' sangrado, 'socks' veneno. */
  const ART_MOVE = { type: 'none', kind: 'artifact', id: 'artifact' };      // (sin tipo: ni eficaz ni inmune)
  function artDot(pl, e, kind) {
    if (e.dead || isFoe(e)) return;
    const d = dotOf(pl, e), A = G.Items.ART;
    d.km = ART_MOVE;
    if (kind === 'cleaver') d.kb = A.cleaver.bleed;
    else if (kind === 'socks') { d.sk = A.socks.dps; d.skSlow = A.socks.slow; d.skUntil = G.Game.st.time + A.socks.dur; }
  }
  function poisonWith(pl, e, row, m) {
    const d = dotOf(pl, e), now = G.Game.st.time;
    d.pm = m; d.pUntil = Math.max(d.pUntil, now + row.dur); d.pDps = row.dps; d.slow = row.slow;
  }
  function tickDots(dt) {
    dotT -= dt;
    if (dotT > 0 || !dots.size) return;
    dotT = 0.5;
    const now = G.Game.st.time;
    for (const [e, d] of dots) {
      if (e.dead || !d.owner || !alive(e)) { dots.delete(e); continue; }
      const pl = d.owner;
      let keep = false;
      if (d.pUntil > now) {
        keep = true;
        hit(pl, e, d.pDps * 0.5 * pl.atk, '#c46cf0', 0, 0, 0, d.pm, NOCRIT);
        e.stPoison = performance.now() + 700;          // icono de estado (enemy.js drawStatus)
        if (!e.dead && d.slow) e.applySlow(d.slow, 0.7);
      }
      if (d.bleed && d.bleedUntil && d.bleedUntil < now) d.bleed = 0;       // (Cruzada: sangrado de 3 s; Puño Lee: hasta que caiga)
      if (d.bleed && !e.dead) {
        keep = true;
        hit(pl, e, d.bleed * 0.5 * pl.atk, '#e0303a', 0, 0, 0, d.bm, NOCRIT);
        e.stBleed = performance.now() + 700;           // icono de estado (enemy.js drawStatus)
        // Gotas de sangre en píxeles que caen (en vez de una nube de puntos).
        if (G.Camera.sees(e.x, e.y, 20)) for (let k = 0; k < 3; k++) {
          G.FX.px(e.x + G.U.rand(-e.r, e.r) * 0.5, e.y - e.bodyH * G.U.rand(0.4, 0.7), k ? '#8a0f18' : '#ff4a4a',
                  { vx: G.U.rand(-25, 25), vy: G.U.rand(-50, -15), grav: 420, drag: 0.97, life: G.U.rand(0.35, 0.55), size: k === 2 ? 2 : 1 });
        }
      }
      // Artefactos (2026-10-17): Cuchillo de Matanza (sangrado aparte, se suma) y Calcetines de Otis (veneno aparte).
      if (d.kb && !e.dead) {
        keep = true;
        hit(pl, e, d.kb * 0.5 * pl.atk, '#e0303a', 0, 0, 0, d.km, NOCRIT);
        if (G.Camera.sees(e.x, e.y, 20)) G.FX.px(e.x + G.U.rand(-e.r, e.r) * 0.4, e.y - e.bodyH * 0.6, '#c0101c', { vy: -30, grav: 420, life: 0.4, size: 2 });
      }
      if (d.skUntil > now && !e.dead) {
        keep = true;
        hit(pl, e, d.sk * 0.5 * pl.atk, '#8fd14a', 0, 0, 0, d.km, NOCRIT);
        if (!e.dead && !(d.pUntil > now)) e.applySlow(d.skSlow, 0.7);      // con otro veneno, sólo se suma el daño
        if (G.Camera.sees(e.x, e.y, 20)) G.FX.px(e.x + G.U.rand(-e.r, e.r) * 0.4, e.y - e.bodyH, '#a8e05a', { vy: -26, life: 0.5, size: 2 });
      }
      if (d.drip > now && !e.dead) {
        keep = true;
        if (!d.lx || G.U.dist2(d.lx, d.ly, e.x, e.y) > 26 * 26) { d.lx = e.x; d.ly = e.y; addPuddle(pl, d.pm, d.prow, e.x, e.y, 3, false); }
      }
      if (!keep) dots.delete(e);
    }
  }

  /**
   * Lluvia Corrosiva: llueve en un círculo de `r` casillas a tu alrededor; los enemigos
   * quedan envenenados y frenados `dur` s (aunque salgan). Con `pud`, deja charcos
   * (1: frenan; 2: también envenenan). Con `spread`, quien pisa un charco va dejando
   * charcos por donde pasa durante `spread` s. Evolucionado (`over`): la lluvia cae
   * sobre cada enemigo y los charcos, debajo de ellos.
   */
  function acidRain(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const list = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead);
    fields.push({ kind: 'rain', owner: pl, ghost, m, col: '#a043d0', x: pl.x, y: pl.y, t: 0, life: 0.9, r: R,
                  spots: row.over ? list.slice(0, 30).map(e => [e.x, e.y]) : null });
    if (!ghost) for (const e of list) poisonWith(pl, e, row, m);
    if (row.pud) {
      const n = row.over ? 8 : 3;
      for (let i = 0; i < n; i++) {
        const e = list.length ? list[Math.floor(Math.random() * list.length)] : null;
        const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * R * 0.8;
        addPuddle(pl, m, row, e ? e.x : pl.x + Math.cos(a) * d, e ? e.y : pl.y + Math.sin(a) * d * 0.8, 6, true);
      }
    }
    if (G.Camera.sees(pl.x, pl.y, 0)) G.Audio.sfx('shot', { kind: 'aura', type: 'poison' });
  }
  /** Charco de Lluvia Corrosiva (como mucho 40 por jugador: los más viejos se secan). */
  function addPuddle(pl, m, row, x, y, life, big) {
    fields.push({ kind: 'puddle', owner: pl, ghost, m, row, col: '#a043d0', x, y, t: 0, life, r: TILE * (big ? 1.2 : 0.8), tick: 0 });
    const mine = fields.filter(f => f.kind === 'puddle' && f.owner === pl && !f.gone);
    for (const f of mine.slice(0, Math.max(0, mine.length - 40))) f.gone = true;
  }

  /**
   * Puño Lee: puñetazo al más cercano a `r` casillas (evolucionado: a los `n` más cercanos).
   * Crítico con probabilidad `crit` (más la tuya) y seguro cada `every` puñetazos; los
   * críticos hacen ×1,5 (evolucionado ×`cmul`) y, con `bleed`, sangran hasta que caen.
   */
  function fist(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE, col = G.U.TYPE_COLOR.fighting;
    const list = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl)).slice(0, row.n || 1);
    if (!list.length) return;
    m.punches = (m.punches || 0) + 1;
    const sure = m.punches % row.every === 0;
    const P = G.VFX.PAL.fighting;
    for (const e of list) {
      const a = Math.atan2(e.y - pl.y, e.x - pl.x), ca = Math.cos(a), sa = Math.sin(a);
      const crit = !ghost && (sure || Math.random() < row.crit + (pl.critChance || 0));
      if (G.Camera.sees(e.x, e.y, 20)) {
        // Guante de píxel que llega disparado al objetivo + estallido (crítico: estrella amarilla).
        const ex = e.x, ey = e.y - e.bodyH * 0.5, back = row.n ? 30 : 20, big = sure || crit;
        G.FX.sp('fist', 'fighting', ex - ca * back, ey - sa * back,
                { vx: ca * back * 7, vy: sa * back * 7, life: 0.13, angle: a, fade: false, scale: 1.5 });
        if (row.n) for (let k = 1; k <= 3; k++) {          // estela del puñetazo a distancia
          G.FX.px(ex - ca * (back + k * 10), ey - sa * (back + k * 10), P[k === 1 ? 4 : 3], { life: 0.1 + k * 0.03 });
        }
        G.FX.sp(big ? 'pow' : 'impact', big ? 'electric' : 'fighting', ex + ca * 4, ey + sa * 4,
                { life: big ? 0.22 : 0.16, scale: 1.5, frameRate: 14, fade: !big });
        G.FX.spark(ex, ey, big ? '#fff36a' : P[3], ca, sa, big ? 7 : 3);
      }
      if (ghost) continue;
      hit(pl, e, row.dmg * pl.atk, col, Math.cos(a), Math.sin(a), row.knock || 0, m, { crit, cmul: row.cmul });
      if (crit && row.bleed && !e.dead) { const d = dotOf(pl, e); d.bleed = row.bleed; d.bm = m; }
    }
    if (sure && !ghost) G.Camera.kick(0.06);
  }

  /**
   * Peso Pesado (pasivo): armadura (menos daño al chocar con enemigos) y reducción de
   * todo el daño, según el tamaño del Pokémon (del más pequeño ×0,4 a Rayquaza ×1), y
   * vida extra. Evolucionado (Shaq): campo de fuerza, ver resolve().
   */
  function bulk(pl, m) {
    if (ghost) return;
    const row = G.Moves.stat(m);
    const k = 0.4 + 0.6 * G.U.clamp((pl.r - 10) / 42, 0, 1);
    pl.bulkArmor = row.armor * k;
    pl.bulkRed = row.red * k;
    pl.bulkField = !!row.field;
    const add = row.hp - (pl.bulkHp || 0);
    if (add > 0) { pl.maxHp += add; pl.hp = Math.min(pl.maxHp, pl.hp + add); pl.bulkHp = row.hp; }
  }

  /**
   * Lanza Espectral: `n` lanzas hacia el enemigo que perforan `pierce`. Evolucionado
   * (Lanza Sombría): 8 lanzas en todas direcciones; cada vez que una perfora salen 2
   * lanzas pequeñas (que golpean a 2 como mucho y ya no se parten).
   */
  const SPEAR_SPEED = 460;
  function spearProj(pl, x, y, a, o) {
    return G.Projectiles.spawn(Object.assign({
      x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4, vx: Math.cos(a) * SPEAR_SPEED, vy: Math.sin(a) * SPEAR_SPEED,
      color: G.U.TYPE_COLOR.ghost, mtype: 'ghost', owner: pl, hits: new Set()
    }, o));
  }
  function spears(pl, m) {
    const row = G.Moves.stat(m), vis = G.VFX.forMove(m);
    const o = { dmg: row.dmg * pl.atk, r: 8 * row.size, scale: 1, life: row.r * TILE / SPEAR_SPEED,
                pierce: row.pierce, vis, ghost, split: row.split || 0, sdmg: (row.sdmg || 0) * pl.atk };
    if (row.radial) {
      const rot = Math.random() * 0.785;
      for (let i = 0; i < 8; i++) spearProj(pl, pl.x, pl.y, rot + i * 0.785, o);
    } else {
      for (let i = 0; i < row.n; i++) spearProj(pl, pl.x, pl.y, pl.aim + (i - (row.n - 1) / 2) * 0.16, o);
    }
  }
  function splitSpear(p, e) {
    const a = Math.atan2(p.vy, p.vx);
    for (const s of [-0.5, 0.5]) {
      spearProj(p.owner, e.x, e.y, a + s, { dmg: p.sdmg, r: 6, scale: 1, life: 0.55, pierce: 1,
                                            vis: p.svis || (p.svis = Object.assign({}, p.vis, { proj: 'spearS' })),
                                            ghost: p.ghost, hits: new Set([e.id]) });
    }
  }

  /**
   * Bautismo Natural: `n` árboles caen en diagonal sobre enemigos cercanos (a menos de
   * `r` casillas) y aplastan en un círculo de 54 × `size`. Con `zone`, deja 3 s una zona
   * que frena. Evolucionado (¡Árbol Va!): un árbol por enemigo (los `n` más cercanos),
   * pinchos que golpean otra vez (`spikes`) y enredaderas que inmovilizan `root` s.
   */
  function trees(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE, vis = G.VFX.forMove(m);
    const list = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl));
    let pick;
    if (row.n >= 12) pick = list.slice(0, row.n);
    else {
      pick = list.slice(0, 8);
      for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
      pick = pick.slice(0, row.n);
    }
    pick.forEach((e, i) => fields.push({ kind: 'tree', owner: pl, ghost, m, row, col: G.U.TYPE_COLOR.grass, vis,
      x: e.x, y: e.y, t: -i * 0.07, fall: 0.55, r: 54 * row.size, dmg: row.dmg * pl.atk }));
  }


  // ---------------- movimientos de 2026-10-16 ----------------
  const LOCAL_NOW = () => performance.now() / 1000;

  /**
   * Arte Sin Forma: `n` corazones que vuelan (teledirigidos) a los enemigos más cercanos a
   * menos de `r` casillas. Al dar: frenan al enemigo y te dan +15 % de velocidad 2 s. Con
   * `bounce`, saltan al siguiente más cercano (a 6 casillas) sin repetir; el PRIMER rebote
   * hace ×`bmul`. Evolucionado (Vuelo Celestial): además inmune a los rayos (beamImmune).
   */
  const HEART_SPEED = 470, HEART_HOP = 6 * TILE;
  function hearts(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const near = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl));
    if (!near.length) return;
    for (let i = 0; i < row.n; i++) {
      const target = near[i % near.length];
      // Salen en abanico y se curvan hacia su blanco.
      const a = Math.atan2(target.y - pl.y, target.x - pl.x) + (i - (row.n - 1) / 2) * 0.55;
      fields.push({ kind: 'heart', owner: pl, ghost, m, row, x: pl.x, y: pl.y - G.LIFT * 0.6, t: 0, life: 4,
                    vx: Math.cos(a) * HEART_SPEED, vy: Math.sin(a) * HEART_SPEED, target, hops: row.bounce, bounced: 0,
                    hit: new Set(), dmg: row.dmg * pl.atk });
    }
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.6, '#ffc4e6', 6, 90);
  }
  function heartStep(f, dt) {
    let e = f.target;
    if (!e || e.dead || !alive(e)) { e = f.target = nextHeart(f, f.x, f.y); if (!e) return false; }
    const tx = e.x, ty = e.y - e.bodyH * 0.5;
    const d = Math.hypot(tx - f.x, ty - f.y);
    const [nx, ny] = G.U.norm(tx - f.x, ty - f.y);
    // Se curva hacia su blanco; cerca (o tras un rato) va directo, para no quedarse dando vueltas.
    const turn = d < 70 || f.t > 1.2 ? 60 : 9;
    f.vx = G.U.damp(f.vx, nx * HEART_SPEED, turn, dt); f.vy = G.U.damp(f.vy, ny * HEART_SPEED, turn, dt);
    const sp = Math.hypot(f.vx, f.vy) || 1;
    f.vx *= HEART_SPEED / sp; f.vy *= HEART_SPEED / sp;
    if (Math.random() < 0.6 && G.Camera.sees(f.x, f.y, 10)) G.FX.px(f.x + G.U.rand(-3, 3), f.y + G.U.rand(-3, 3), Math.random() < 0.5 ? '#ff8acb' : '#ffe4f3', { vy: -20, life: 0.3 });
    if (d > HEART_SPEED * dt + e.r * 0.6 + 4) { f.x += f.vx * dt; f.y += f.vy * dt; return true; }
    // Da: daño (el primer rebote, ×bmul), frena al enemigo y a ti te acelera.
    f.x = tx; f.y = ty;
    const k = f.bounced === 1 ? f.row.bmul : 1;
    if (!f.ghost) {
      hit(f.owner, e, f.dmg * k, '#ff8acb', f.vx, f.vy, 0, f.m);
      if (!e.dead) e.applySlow(0.35, 1.5);
      f.owner.hasteT = 2; f.owner.hasteK = 0.15;
    }
    G.FX.sp('heart', 'fairy', tx, ty - 4, { vy: -40, life: 0.45, scale: k > 1 ? 1.8 : 1.2 });
    G.FX.burst(tx, ty, '#ff8acb', k > 1 ? 10 : 6, 100);
    f.hit.add(e.id);
    if (f.hops-- <= 0) return false;
    f.bounced++;
    f.target = nextHeart(f, e.x, e.y);
    if (!f.target) return false;
    // Rebota: sale disparado hacia el siguiente.
    const [bx, by] = G.U.norm(f.target.x - f.x, f.target.y - f.target.bodyH * 0.5 - f.y);
    f.vx = bx * HEART_SPEED; f.vy = by * HEART_SPEED;
    return true;
  }
  function nextHeart(f, x, y) {
    let best = null, bd = HEART_HOP * HEART_HOP;
    for (const e of enemiesIn(x, y, HEART_HOP)) {
      if (e.dead || f.hit.has(e.id)) continue;
      const d = G.U.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** Vuelo Celestial (Arte Sin Forma evolucionado): los rayos de los enemigos (y de los rivales en PK) no te hacen nada. */
  function beamImmune(pl) {
    return !!(pl && pl.moves && pl.moves.some(m => m.id === 'formless-art' && m.evolved));
  }

  /**
   * Tornado Furioso: `n` tornados de agua hacia los enemigos (a `r` casillas). Sin `pierce`, el
   * tornado se deshace al primer enemigo; con `pierce`, atraviesa (a cada uno le pega una vez).
   * Con `launch`, los lanza por los aires (inmovilizados `launch` s; los jefes sólo frenan).
   * Evolucionado (Perro Loco): `dot` daño/s todo el rato en el aire y, al caer, una mano azul
   * les da una bofetada (`slap`). Lo de estar en el aire vive en `lifts` (también en los
   * fantasmas, sólo para verlo).
   */
  const TORNADO_SPEED = 190;
  let lifts = new Map();
  function tornados(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const near = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl));
    if (!near.length) return;
    for (let i = 0; i < row.n; i++) {
      const target = near[i % near.length];
      const a = Math.atan2(target.y - pl.y, target.x - pl.x) + (i >= near.length ? (i - (row.n - 1) / 2) * 0.5 : 0);
      fields.push({ kind: 'tornado', owner: pl, ghost, m, row, x: pl.x + Math.cos(a) * 10, y: pl.y + Math.sin(a) * 10, t: 0,
                    life: R / TORNADO_SPEED + 0.4, target, ang: a, r: 16 * row.size, hit: new Set(), dmg: row.dmg * pl.atk });
    }
    G.FX.ring(pl.x, pl.y, 6, 34, '#8ccaff', 0.3, 2);
  }
  function tornadoStep(f, dt) {
    // Gira un poco hacia su blanco mientras vive (no lo persigue del todo: se puede esquivar).
    const e0 = f.target;
    if (e0 && !e0.dead && alive(e0)) {
      const want = Math.atan2(e0.y - f.y, e0.x - f.x);
      let da = ((want - f.ang + Math.PI * 3) % 6.2832) - Math.PI;
      f.ang += G.U.clamp(da, -2.2 * dt, 2.2 * dt);
    }
    f.x += Math.cos(f.ang) * TORNADO_SPEED * dt;
    f.y += Math.sin(f.ang) * TORNADO_SPEED * dt;
    if (Math.random() < dt * 14 && G.Camera.sees(f.x, f.y, 10)) G.FX.px(f.x + G.U.rand(-f.r, f.r), f.y - 2, '#bfe6ff', { vx: G.U.rand(-40, 40), vy: -30, life: 0.35 });
    for (const e of enemiesIn(f.x, f.y, f.r + 10)) {
      if (e.dead || f.hit.has(e.id)) continue;
      if (G.U.dist2(f.x, f.y, e.x, e.y) > (f.r + e.r) ** 2) continue;
      f.hit.add(e.id);
      if (!f.ghost) hit(f.owner, e, f.dmg, '#3d8bff', Math.cos(f.ang), Math.sin(f.ang), f.row.launch ? 0 : 60, f.m);
      G.FX.sp('impact', 'water', e.x, e.y - e.bodyH * 0.5, { life: 0.14, scale: 1.2 });
      if (f.row.launch && !e.dead) launch(f, e);
      if (!f.row.pierce) {
        G.FX.burst(f.x, f.y - 10, '#8ccaff', 10, 120);
        return false;
      }
    }
    return true;
  }
  function launch(f, e) {
    const row = f.row, dur = row.launch;
    if (!f.ghost) {
      if (e.boss || isFoe(e)) e.applySlow(0.5, dur); else e.applyRoot(dur + 0.05);
    }
    if (lifts.has(e)) return;      // ya está en el aire: cae a su hora (si no, con varios tornados nunca bajaba ni recibía la bofetada)
    lifts.set(e, { owner: f.owner, ghost: f.ghost, m: f.m, row, t: 0, dur, tick: 0.5, boss: !!e.boss || isFoe(e) });
  }
  function updateLifts(dt) {
    for (const [e, L] of lifts) {
      L.t += dt;
      if (e.dead || !alive(e) || !L.owner) { if (!isFoe(e)) e.jumpLift = 0; lifts.delete(e); continue; }
      const k = G.U.clamp(L.t / L.dur, 0, 1);
      // Sube rápido, flota girando y cae de golpe (los jefes no se levantan: sólo el remolino).
      if (!L.boss && !e.jump) e.jumpLift = L.row.hops ? Math.abs(Math.sin(k * L.row.hops * Math.PI)) * 54      // Puño de Piedra: botes (más alto que el puño)
                                          : (k < 0.2 ? Math.sin(k / 0.2 * Math.PI / 2) : k > 0.85 ? Math.cos((k - 0.85) / 0.15 * Math.PI / 2) : 1) * 46
                                            + Math.sin(L.t * 9) * 2;
      if (L.row.dot) {
        L.tick -= dt;
        if (L.tick <= 0) { L.tick = 0.5; if (!L.ghost) hit(L.owner, e, L.row.dot * 0.5 * L.owner.atk, '#3d8bff', 0, 0, 0, L.m, NOCRIT); }
      }
      if (L.t >= L.dur) {
        if (!L.boss && !e.jump) e.jumpLift = 0;
        lifts.delete(e);
        if (G.Camera.sees(e.x, e.y, 30)) G.FX.burst(e.x, e.y - 2, '#8ccaff', 8, 110);
        // Maestro del Puño de Piedra: al caer, empujón lejos y aturdido (gira sin atacar).
        if (L.row.endKnock && !e.dead) {
          if (!L.ghost) {
            hit(L.owner, e, L.row.dmg * 0.3 * L.owner.atk, G.U.TYPE_COLOR.ground, e.x - L.owner.x, e.y - L.owner.y, L.row.endKnock, L.m);
            if (!e.dead && !L.boss && L.row.stun) e.applyConfuse(L.row.stun);
          }
          if (G.Camera.sees(e.x, e.y, 30)) G.FX.sp('impact', 'ground', e.x, e.y - e.bodyH * 0.5, { life: 0.18, scale: 1.6, frameRate: 14 });
        }
        if (L.row.slap && !e.dead) {
          fields.push({ kind: 'hand', owner: L.owner, ghost: true, m: L.m, x: e.x, y: e.y - e.bodyH * 0.5, t: 0, life: 0.5, flip: Math.random() < 0.5 });
          if (!L.ghost) hit(L.owner, e, L.row.slap * L.owner.atk, '#3d8bff', 0, 1, 0, L.m);
          if (G.Camera.sees(e.x, e.y, 30)) { G.Audio.sfx('hit'); G.FX.dmgText(e.x, e.y - e.bodyH - 16, '¡PAF!', '#8ccaff', true); }
        }
      }
    }
  }

  /**
   * Tormenta de Cuchillas: cada `cd` (0,5 s) la tormenta de esquirlas daña a todo lo que hay a
   * `sr` casillas (sdps daño/s) y, cada `bcd` s, sale(n) `bn` cuchilla(s) contra los enemigos más
   * cercanos a `r` casillas. Evolucionado (Cruzada): la tormenta empuja y hace sangrar 3 s; las
   * cuchillas salen en 8 direcciones y, al atravesar al primer enemigo, se parten en dos a ±90°.
   * (La recarga de las cuchillas va en el jugador: así el fantasma del compañero también la lleva.)
   */
  const BLADE_SPEED = 430;
  function bladeStorm(pl, m) {
    const row = G.Moves.stat(m), R = row.sr * TILE, col = G.U.TYPE_COLOR.steel;
    for (const f of fields) if (f.kind === 'storm' && f.owner === pl) f.gone = true;
    fields.push({ kind: 'storm', owner: pl, ghost, m, row, x: pl.x, y: pl.y, t: 0, life: 0.6 + m.cd, r: R, seed: Math.random() * 6.28 });
    if (!ghost) {
      const per = row.sdps * ((row.cd || m.cd));
      for (const e of enemiesIn(pl.x, pl.y, R)) {
        if (e.dead) continue;
        hit(pl, e, per * pl.atk, col, e.x - pl.x, e.y - pl.y, row.knock || 0, m);
        if (row.bleed && !e.dead && !isFoe(e)) { const d = dotOf(pl, e); d.bleed = row.bleed; d.bm = m; d.bleedUntil = G.Game.st.time + 3; }
      }
      for (const p of G.World.propsInCircle(pl.x, pl.y, R)) G.World.damageProp(p, per * pl.atk, col);
    }
    const now = LOCAL_NOW();
    if ((pl.bsNext || 0) > now) return;
    pl.bsNext = now + row.bcd * (pl.cdK || pl.cdMul || 1) - 0.05;   // (cdK: también el Bastón de Saúco)
    const vis = G.VFX.forMove(m);
    const o = { dmg: row.bdmg * pl.atk, r: 8 * row.bsize, scale: row.bsize, life: row.r * TILE / BLADE_SPEED,
                pierce: row.bpierce, vis, ghost, split90: row.split ? 2 : 0 };     // 2: la cuchilla y sus dos hijas se parten
    if (row.radial) {
      // Una de las 8 apunta al enemigo más cercano (las demás, cada 45°).
      const e = enemiesIn(pl.x, pl.y, row.r * TILE).filter(q => !q.dead).sort(byDist(pl))[0];
      const base = e ? Math.atan2(e.y - pl.y, e.x - pl.x) : (pl.aim || 0);
      for (let i = 0; i < 8; i++) bladeProj(pl, pl.x, pl.y, base + i * 0.7854, o);
    } else {
      const near = enemiesIn(pl.x, pl.y, row.r * TILE).filter(e => !e.dead).sort(byDist(pl));
      for (let i = 0; i < row.bn; i++) {
        const e = near[i];
        const a = e ? Math.atan2(e.y - pl.y, e.x - pl.x) : (pl.aim || 0) + (i - (row.bn - 1) / 2) * 0.3;
        bladeProj(pl, pl.x, pl.y, a, o);
      }
    }
  }
  function bladeProj(pl, x, y, a, o) {
    return G.Projectiles.spawn(Object.assign({
      x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(a) * BLADE_SPEED, vy: Math.sin(a) * BLADE_SPEED,
      color: G.U.TYPE_COLOR.steel, mtype: 'steel', owner: pl, hits: new Set()
    }, o));
  }
  /**
   * Cruzada: la cuchilla que atraviesa a su primer enemigo suelta dos más a ±90°; esas dos se
   * vuelven a partir una vez (2026-10-16, feedback) y las nietas ya no. `left` = las que quedan.
   */
  function splitBlade(p, e, left = 0) {
    const a = Math.atan2(p.vy, p.vx);
    for (const s of [-Math.PI / 2, Math.PI / 2]) {
      bladeProj(p.owner, e.x, e.y, a + s, { dmg: p.dmg, r: p.r, scale: p.scale, life: p.life * 0.6, pierce: 1, vis: p.vis,
                                            ghost: p.ghost, split90: left, hits: new Set([e.id]) });
    }
    G.FX.sp('impact', 'steel', e.x, e.y - e.bodyH * 0.5, { life: 0.16, scale: 1.8 });
  }

  /**
   * Rayo Destructor: `n` rayos desde ti hasta los enemigos más cercanos (a `r` casillas) que
   * dañan a todo lo que tocan (crítico extra `crit`). Con `back`, cada rayo que acierta suelta
   * otro hacia atrás. Evolucionado (Poder Púrpura): sale cada 0,2 s mientras haya enemigos
   * (rayo continuo, `dps`), frena, y lo que mata tiene `hole` de probabilidad de dejar un
   * agujero negro que atrae `holeR` casillas durante 4 s y estalla (`holeDmg`).
   */
  function dBeams(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const near = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl));
    if (!near.length) return;
    const vis = row.dps ? { pal: 'void', beam: 'star' } : G.VFX.forMove(m);
    const per = row.dps ? row.dps * row.cd : row.dmg;
    for (let i = 0; i < row.n; i++) {
      const e = near[i % near.length];
      // Si hay menos enemigos que rayos, los que sobran salen en abanico (±0,35, ±0,7 rad) y no repiten blanco.
      const k = i - near.length + 1, a = Math.atan2(e.y - pl.y, e.x - pl.x) + (k > 0 ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35 : 0);
      const n = ray(pl, m, row, a, R, per, vis);
      if (row.back && n) ray(pl, m, row, a + Math.PI, R, per, vis);
    }
    if (!ghost && !row.dps) G.Camera.kick(0.06);
  }
  /** Un rayo: devuelve a cuántos ha tocado. */
  function ray(pl, m, row, a, R, per, vis) {
    const ca = Math.cos(a), sa = Math.sin(a), w = row.w;
    let len = R;
    for (let d = 8; d < R; d += 8) if (G.World.isWall(pl.x + ca * d, pl.y + sa * d)) { len = d; break; }
    G.FX.beam(pl.x, pl.y - G.LIFT, a, len, w, row.dps ? '#8a3ce0' : '#ff8f2e', vis);
    const mx = pl.x + ca * len / 2, my = pl.y + sa * len / 2;
    const onRay = (x, y, r) => {
      const px = x - pl.x, py = y - pl.y, along = px * ca + py * sa;
      return along >= -r && along <= len + r && Math.abs(-px * sa + py * ca) <= w / 2 + r;
    };
    let n = 0;
    const col = row.dps ? '#c890ff' : '#ffb35a';
    for (const e of enemiesIn(mx, my, len / 2 + w)) {
      if (e.dead || !onRay(e.x, e.y, e.r)) continue;
      n++;
      if (ghost) continue;
      const crit = Math.random() < (row.crit || 0) + (pl.critChance || 0);
      hit(pl, e, per * pl.atk, col, ca, sa, 0, m, { crit });
      if (isFoe(e)) continue;
      if (row.slow && !e.dead) e.applySlow(row.slow, 0.5);
      // ¿Lo ha matado? (en una copia del anfitrión se queda a 1 de vida hasta que él decide)
      if (row.hole && (e.dead || (e.remote && e.hp <= 1)) && !e.holed && Math.random() < row.hole) { e.holed = true; addHole(pl, e.x, e.y, row, false); }
    }
    if (!ghost) for (const p of G.World.propsInCircle(mx, my, len / 2 + w)) if (onRay(p.x, p.y, p.r)) G.World.damageProp(p, per * pl.atk, col);
    return n;
  }
  /** Agujero negro (como mucho 3 por jugador). `isGhost`: el de un compañero, sólo atrae (si los monstruos son tuyos) y se ve. */
  function addHole(pl, x, y, row, isGhost) {
    const mine = fields.filter(f => f.kind === 'hole' && f.owner === pl && !f.gone);
    if (mine.length >= 3) return;
    fields.push({ kind: 'hole', owner: pl, ghost: isGhost, m: { type: 'normal', kind: 'dbeam', id: 'destruction-beam' }, x, y, t: 0, life: 4,
                  r: (row ? row.holeR : 7) * TILE, er: 4 * TILE, dmg: (row ? row.holeDmg : 80) * (pl.atk || 1), col: '#8a3ce0', tick: 0 });
    if (!isGhost && G.Coop.active) {
      const ev = ['mfx', 'hole', Math.round(x), Math.round(y)];
      if (G.Coop.isHost) G.Coop.broadcast(ev); else G.Coop.toHost(ev);
    }
  }
  /** Cooperativo: efecto de un compañero que no sale de repetir su ataque (el agujero negro). */
  function netFx(ev) {
    const pl = G.Game.player;
    if (!pl) return;
    if (ev[1] === 'conf') { confBlast(pl, ev[2], ev[3], ev[4] || 4, 0, true); return; }      // (V3.1) Esfera Dragón: sólo se ve
    if (ev[1] === 'max') { G.MaxMoves.netFx(ev); return; }                                    // Gigamax: el «Maxi» de un compañero (maxmoves.js)
    if (ev[1] !== 'hole') return;
    addHole(pl, ev[2], ev[3], null, true);
  }
  function holeStep(f, dt) {
    // Atrae: los monstruos los mueve quien los tiene (tú en solitario; el anfitrión en grupo,
    // también los del agujero de un invitado). Los jefes no se mueven: se frenan.
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
      if (e.dead || e.remote) continue;
      if (e.boss) { if (!f.ghost) e.applySlow(0.4, 0.3); continue; }
      const dx = f.x - e.x, dy = f.y - e.y, d = Math.hypot(dx, dy);
      if (d < 8) continue;
      const step = Math.min(d - 6, (90 + (1 - d / f.r) * 160) * dt);
      const nx = e.x + dx / d * step, ny = e.y + dy / d * step;
      if (!G.World.isWall(nx, ny)) { e.x = nx; e.y = ny; }
    }
    if (Math.random() < dt * 30 && G.Camera.sees(f.x, f.y, f.r)) {
      const a = Math.random() * 6.2832, r = f.r * G.U.rand(0.4, 0.9);
      G.FX.px(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.6, Math.random() < 0.5 ? '#c890ff' : '#43127a',
              { vx: -Math.cos(a) * r * 1.4, vy: -Math.sin(a) * r * 0.85, life: 0.6, drag: 1, size: Math.random() < 0.3 ? 2 : 1 });
    }
    if (f.t < f.life) return true;
    // Estalla.
    G.FX.ring(f.x, f.y, 6, f.er, '#c890ff', 0.4, 5);
    G.FX.ring(f.x, f.y, 4, f.er * 0.6, '#43127a', 0.3, 4);
    G.FX.burst(f.x, f.y - 6, '#8a3ce0', 22, 220);
    if (G.Camera.sees(f.x, f.y, 60)) { G.Audio.sfx('break'); G.Camera.kick(0.15); }
    if (!f.ghost) {
      for (const e of enemiesIn(f.x, f.y, f.er)) if (!e.dead) hit(f.owner, e, f.dmg, f.col, e.x - f.x, e.y - f.y, 200, f.m);
    }
    return false;
  }

  // ---------------- apoyo (2026-10-15): curar y defender ----------------
  /*
   * Funcionan solos (como los pasivos), cada uno con su recarga (TABLE en moves.js).
   * Lo que dura (pantalla, protección, sueño, concentración) se guarda en el jugador y
   * player.js lo usa (hurt, atk, reduction, movimiento) y lo dibuja.
   */
  const BAD_POTIONS = ['toxic', 'heavy', 'reverse'];
  function cleanse(pl) {
    pl.slowT = 0;
    if (pl.potion && BAD_POTIONS.includes(pl.potion.id)) pl.endPotion();
  }
  function healText(pl, n, col = '#5fe08a') {
    if (n >= 1) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 8, '+' + Math.round(n), col);
  }
  /** Cura en grupo (Deseo, Rocío Vital): a ti y, en cooperativo, a los compañeros cerca. */
  function groupHeal(pl, frac, r, col) {
    const before = pl.hp;
    pl.heal(pl.maxHp * frac);
    healText(pl, pl.hp - before, col);
    G.FX.ring(pl.x, pl.y, 8, r, col, 0.6, 3);
    if (G.Coop.active) {
      // ('shl': antes 'sh', que en el invitado ya era "shiny capturado" y nunca llegaba a curar.)
      const ev = ['shl', Math.round(pl.x), Math.round(pl.y), frac, r, pl.team == null ? -1 : pl.team];
      if (G.Coop.isHost) G.Coop.broadcast(ev); else G.Coop.toHost(ev);
    }
  }
  /** Cooperativo: un compañero ha curado en (x, y): si estás cerca, te cura a ti. */
  function supportHeal(x, y, frac, r, team) {
    const pl = G.Game.player;
    if (!pl || pl.dead || G.U.dist2(pl.x, pl.y, x, y) > r * r) return;
    // PK: no se cura al rival (2026-10-15). Por equipos, sólo a los tuyos.
    if (G.PvP.on && (!G.PvP.teams || team == null || team !== pl.team)) return;
    const before = pl.hp;
    pl.heal(pl.maxHp * frac);
    healText(pl, pl.hp - before, '#9fe0ff');
  }

  function support(dt, pl, m) {
    if (ghost || pl.dead) return;
    const row = G.Moves.stat(m);
    m.cd = row.cd;                                   // (la barra de recarga del HUD)
    if (m.t > 0) m.t -= dt;
    const ready = m.t <= 0, cd = row.cd * (pl.cdK || pl.cdMul);
    switch (m.id) {
      case 'recover':
        if (ready && pl.hp < pl.maxHp) {
          m.t = cd;
          const b = pl.hp; pl.heal(pl.maxHp * row.heal); healText(pl, pl.hp - b);
          if (row.cleanse) cleanse(pl);
          G.FX.ring(pl.x, pl.y, 6, 60, '#7dffb0', 0.5, 3);
          G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#b8ffd0', 12, 90);
        }
        break;
      case 'light-screen':
        if (pl.screenT > 0) pl.screenT -= dt;
        if (ready) { m.t = cd; pl.screenT = row.dur; pl.screenCut = row.cut; G.Audio.sfx('select'); G.FX.ring(pl.x, pl.y, 10, pl.r * 3, '#ffe9a0', 0.4, 3); }
        break;
      case 'protect': {
        if (pl.protectT > 0) pl.protectT -= dt;
        if (!ready) break;
        let near = 0;
        for (const e of enemiesIn(pl.x, pl.y, 90)) if (!e.dead) near++;
        if (near >= row.n || pl.hp < pl.maxHp * 0.4) {
          m.t = cd; pl.protectT = row.dur; pl.invuln = Math.max(pl.invuln || 0, row.dur);
          G.Audio.sfx('select');
          G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, G.T('¡Protección!'), '#7dffb0', true);
          if (row.blast) {
            G.FX.ring(pl.x, pl.y, 10, 200, '#7dffb0', 0.5, 5);
            for (const e of enemiesIn(pl.x, pl.y, 200)) if (!e.dead && !e.boss) e.hurt(1, '#7dffb0', e.x - pl.x, e.y - pl.y, 520);
          }
        }
        break;
      }
      case 'wish':
        if (m.wishT > 0) {
          m.wishT -= dt;
          if (Math.random() < dt * 6) G.FX.twinkle(pl.x + G.U.rand(-14, 14), pl.y - pl.bodyH - G.U.rand(10, 40));
          if (m.wishT <= 0) groupHeal(pl, row.heal, row.r, '#ffe14d');
        }
        if (ready) { m.t = cd; m.wishT = 2; G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, G.T('Deseo…'), '#ffe14d'); }
        break;
      case 'calm-mind':
        if (pl.calmT > 0) { pl.calmT -= dt; if (pl.calmT <= 0) pl.calmN = 0; }
        if (ready) {
          m.t = cd; pl.calmN = Math.min(row.max, (pl.calmN || 0) + 1); pl.calmAmt = row.amt; pl.calmT = row.dur;
          G.FX.ring(pl.x, pl.y, 6, pl.r * 2.6, '#ff8ad8', 0.5, 3);
        }
        break;
      case 'life-dew':
        if (ready) { m.t = cd; groupHeal(pl, row.heal, row.r, '#7fe0ff'); G.FX.burst(pl.x, pl.y - pl.bodyH, '#9fd8ff', 14, 80); }
        break;
      case 'rest':
        if (pl.sleepT > 0) {
          pl.sleepT -= dt;
          if (pl.restGuard) pl.invuln = Math.max(pl.invuln || 0, 0.1);
          if (pl.sleepT <= 0) {
            const b = pl.hp; pl.heal(pl.maxHp); healText(pl, pl.hp - b);
            pl.restGuard = false;
            G.FX.ring(pl.x, pl.y, 6, 80, '#7dffb0', 0.6, 4);
          }
        } else if (ready && pl.hp < pl.maxHp * 0.3) {
          m.t = cd; pl.sleepT = row.sleep; pl.restGuard = !!row.guard;
          G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, G.T('¡A dormir!'), '#bfe8ff', true);
        }
        break;
      case 'safeguard':
        pl.supRed = row.red || 0;
        // Los estados malos no le hacen nada.
        if (pl.slowT > 0) pl.slowT = 0;
        if (pl.potion && BAD_POTIONS.includes(pl.potion.id)) pl.endPotion();
        if (ready) { m.t = cd; cleanse(pl); G.FX.ring(pl.x, pl.y, 6, pl.r * 2.8, '#ffc4e6', 0.5, 3); }
        break;
    }
  }

  const TARGETED = ['melee', 'beam', 'projectile', 'boomerang', 'chain', 'meteor', 'dash', 'cone', 'lightning', 'drain', 'psyarrow',
                    'acidrain', 'fist', 'spear', 'treefall', 'hearts', 'tornado', 'bladestorm', 'dbeam', 'foampunch', 'pounce', 'whip', 'question', 'roll', 'pan',
                    'clay', 'rockfist', 'icebolt', 'dragonorb'];
  function needsTarget(m) { return TARGETED.includes(m.kind); }
  function reach(m) {
    if (m.kind === 'melee') return m.radius + 30;
    if (m.kind === 'beam') return m.radius + 20;
    if (m.kind === 'boomerang') return m.radius + 40;
    if (m.kind === 'chain') return 280;
    if (m.kind === 'meteor') return 340;
    if (m.kind === 'dash') return m.radius + 60;
    if (['lightning', 'drain', 'psyarrow', 'acidrain', 'fist', 'spear', 'treefall', 'hearts', 'tornado', 'bladestorm', 'dbeam',
         'foampunch', 'scare', 'pounce', 'whip', 'question', 'roll', 'pan',
         'clay', 'rockfist', 'windwall', 'icebolt', 'dragonorb'].includes(m.kind)) return G.Moves.stat(m).r * 32;
    if (m.kind === 'cone') return m.speed * m.life + 30;
    return 520;
  }

  function payload(m) {
    return { burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, mtype: m.type,
             rootCh: m.rootCh || 0, rootT: m.rootT || 0, weakCh: m.weakCh || 0, src: m };   // src: el movimiento (Mega y Gigamax)
  }

  // ---------------- efectos de los 19 movimientos nuevos (2026-10-15) ----------------
  /** Parálisis / retroceso (inmoviliza un rato) y bajada de ataque, por probabilidad. */
  function extraFx(e, rootCh, rootT, weakCh) {
    if (e.dead) return;
    if (rootCh && !e.boss && Math.random() < rootCh) {
      e.applyRoot(rootT || 0.6);
      if (G.Camera.sees(e.x, e.y, 20)) G.FX.dmgText(e.x, e.y - e.bodyH - 10, '⚡', '#ffe14d');
    }
    if (weakCh && !e.weakened && Math.random() < weakCh) {
      e.weakened = true; e.dmg *= 0.7;
      if (G.Camera.sees(e.x, e.y, 20)) G.FX.dmgText(e.x, e.y - e.bodyH - 10, 'ATK↓', '#ff9ec4');
    }
  }
  /** Tras lanzar (no en los fantasmas): subir stats, retroceso propio, confusión. */
  function afterCast(pl, m) {
    if (m.boostCh && Math.random() < m.boostCh) {
      if (m.boost === 'all') { pl.addBuff('atk', 0.12, 6, 3); pl.addBuff('spd', 0.08, 6, 3); pl.addBuff('def', 0.06, 6, 3); }
      else pl.addBuff('def', 0.1, 5, 3);
      G.FX.ring(pl.x, pl.y, pl.r, pl.r * 3, G.U.TYPE_COLOR[m.type], 0.4, 3);
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 12, m.boost === 'all' ? '▲▲▲' : 'DEF▲', '#ffd23f');
    }
    if (m.recoil && !pl.god && !pl.safe) pl.hp = Math.max(1, pl.hp - pl.maxHp * m.recoil);
    if (m.confuseEvery) {
      m.casts = (m.casts || 0) + 1;
      if (m.casts % m.confuseEvery === 0) { pl.confuseT = 1.2; G.FX.dmgText(pl.x, pl.y - pl.bodyH - 12, '?!', '#ff8ad8', true); }
    }
  }

  /** Tabla de tipos × clima para un ataque de tipo `type` contra `e`. */
  function typeK(type, e) { return G.Types.mult(type, e.types) * G.Weather.mult(type); }

  function fireProjectiles(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    const vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0);
    const spread = m.spread || 0;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * n;
      const a = pl.aim + off + G.U.rand(-0.03, 0.03);
      G.Projectiles.spawn(Object.assign({
        x: pl.x + Math.cos(a) * 3, y: pl.y + Math.sin(a) * 3,
        vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        dmg: m.dmg * pl.atk, r: m.size, life: m.life,
        pierce: m.pierce | 0, color: col, homing: m.homing || 0,
        hits: new Set(), vis, ghost, owner: pl
      }, payload(m)));
    }
    G.FX.spark(pl.x + Math.cos(pl.aim) * pl.r, pl.y - G.LIFT + Math.sin(pl.aim) * pl.r,
               col, Math.cos(pl.aim), Math.sin(pl.aim), 3);
  }

  function nova(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    const vis = G.VFX.forMove(m);
    const n = Math.max(3, m.count | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + G.U.rand(-0.06, 0.06);
      G.Projectiles.spawn(Object.assign({
        x: pl.x + Math.cos(a) * 3, y: pl.y + Math.sin(a) * 3,
        vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        dmg: m.dmg * pl.atk, r: m.size, life: m.life,
        pierce: m.pierce | 0, color: col, homing: m.homing || 0,
        hits: new Set(), vis, ghost, owner: pl
      }, payload(m)));
    }
    G.FX.ring(pl.x, pl.y, pl.r, pl.r * 4, col, 0.3, 3);
  }

  function inArc(px, py, x, y, aim, half) {
    const a = Math.atan2(y - py, x - px);
    return Math.abs(((a - aim + Math.PI * 3) % 6.2832) - Math.PI) <= half;
  }

  function melee(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    const half = Math.min(m.arc, 6.2832) / 2;
    G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, pl.aim, m.radius, m.arc, col, G.VFX.forMove(m));
    if (ghost) { G.PvP.arc(pl, pl.x, pl.y, m.radius, pl.aim, half, m.dmg * pl.atk, m.type); return; }

    for (const e of enemiesIn(pl.x, pl.y, m.radius)) {
      if (!inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) continue;
      hit(pl, e, m.dmg * pl.atk, col, e.x - pl.x, e.y - pl.y, m.knock || 0, m);
    }
    for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) {
      if (inArc(pl.x, pl.y, p.x, p.y, pl.aim, half)) G.World.damageProp(p, m.dmg * pl.atk, col);
    }
  }

  function beam(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    const w = m.width;
    const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);

    // El rayo se corta en la primera pared.
    let len = m.radius;
    for (let d = 8; d < m.radius; d += 8) {
      if (G.World.isWall(pl.x + ca * d, pl.y + sa * d)) { len = d; break; }
    }
    G.FX.beam(pl.x, pl.y - G.LIFT, pl.aim, len, w, col, G.VFX.forMove(m));
    if (ghost) { G.PvP.seg(pl, pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, w, m.dmg * pl.atk, m.type); return; }
    G.Camera.kick(0.08);

    const mx = pl.x + ca * len / 2, my = pl.y + sa * len / 2;
    const onBeam = (x, y, r) => {
      const px = x - pl.x, py = y - pl.y;
      const along = px * ca + py * sa;
      if (along < -r || along > len + r) return false;
      return Math.abs(-px * sa + py * ca) <= w / 2 + r;
    };
    for (const e of enemiesIn(mx, my, len / 2 + w)) {
      if (onBeam(e.x, e.y, e.r)) hit(pl, e, m.dmg * pl.atk, col, ca, sa, 0, m);
    }
    for (const p of G.World.propsInCircle(mx, my, len / 2 + w)) {
      if (onBeam(p.x, p.y, p.r)) G.World.damageProp(p, m.dmg * pl.atk, col);
    }
  }

  function aura(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    G.FX.ring(pl.x, pl.y, m.radius * 0.5, m.radius, col, 0.28, 2);
    const vis = G.VFX.forMove(m);
    if (vis.aura) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * 6.2832, r = m.radius * G.U.rand(0.45, 1);
        const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r * 0.8 - G.LIFT * 0.5;
        // Hierba Lazo tira hacia ti; veneno y sombras suben; el resto gira.
        const v = vis.inward ? [-Math.cos(a) * r * 2.2, -Math.sin(a) * r * 1.8]
                : vis.rise ? [G.U.rand(-10, 10), -55]
                : [-Math.sin(a) * 70, Math.cos(a) * 55];
        G.FX.sp(vis.aura, vis.pal, x, y, { vx: v[0], vy: v[1], life: 0.42,
          spin: G.VFX.spins(vis.aura) ? G.U.rand(-6, 6) : 0 });
      }
    }
    if (ghost) { G.PvP.circle(pl, pl.x, pl.y, m.radius, m.dmg * pl.atk, m.type); return; }
    let healed = 0;
    for (const e of enemiesIn(pl.x, pl.y, m.radius)) {
      hit(pl, e, m.dmg * pl.atk, col, e.x - pl.x, e.y - pl.y, 0, m);
      if (m.drain) healed += m.drain;
    }
    for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, m.dmg * pl.atk, col);
    if (healed > 0) pl.heal(Math.min(healed, 6));
  }

  function buff(pl, m) {
    pl.addBuff(m.stat, m.amount, m.dur, G.Arts.buffCap(pl, m, m.stacks | 0));
    const col = G.U.TYPE_COLOR[m.type];
    G.FX.ring(pl.x, pl.y, pl.r * 2.4, pl.r * 1.1, col, 0.35, 2.5);
    const vis = G.VFX.forMove(m);
    for (let i = 0; i < 3; i++) {
      G.FX.sp(vis.buff || 'arrow', vis.pal, pl.x + G.U.rand(-pl.r * 1.4, pl.r * 1.4),
              pl.y - G.U.rand(0, pl.bodyH * 0.8), { vy: -70, life: 0.6 });
    }
  }

  // ---------------- familias nuevas (2026-10-10) ----------------

  /** Bumerán: sale hacia el enemigo, se para y vuelve a ti golpeando a la ida y a la vuelta. */
  function boomerang(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0), spread = (m.spread || 0.5) * (propTarget(pl) ? 0.2 : 1);   // a un cofre: casi juntos (si no, pasan por los lados)
    const out = m.radius / m.speed;                       // segundos de ida
    for (let i = 0; i < n; i++) {
      const a = pl.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * Math.min(n, 3));
      G.Projectiles.spawn(Object.assign({
        x: pl.x, y: pl.y, vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        dmg: m.dmg * pl.atk, r: m.size, life: out * 4 + 1.5, pierce: 999, color: col,
        hits: new Set(), vis, ghost, owner: pl, boom: out, bsp: m.speed * 1.1
      }, payload(m)));
    }
  }

  /** Cadena: golpea a un enemigo y salta a los siguientes más cercanos (cada salto, algo menos). */
  function chain(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    let cur = pl.target && !pl.target.dead && pl.target.hurt ? pl.target : G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, reach(m));
    if (!cur && G.PvP.on) cur = ghost ? G.PvP.meFor(pl, pl.x, pl.y, reach(m))[0] : G.PvP.foe(pl, reach(m));
    if (!cur) {
      // Sin enemigos: el rayo va al cofre o la roca más cercana.
      const tp = propNear(pl, m);
      if (tp) {
        G.FX.beam(pl.x, pl.y - G.LIFT, Math.atan2(tp.y - 10 - pl.y + G.LIFT, tp.x - pl.x), Math.hypot(tp.x - pl.x, tp.y - 10 - pl.y + G.LIFT), 10, col, vis);
        if (!ghost) G.World.damageProp(tp, m.dmg * pl.atk, col);
      }
      return;
    }
    let fx = pl.x, fy = pl.y - G.LIFT, k = 1;
    const done = new Set();
    const n = Math.max(1, m.count | 0);
    for (let i = 0; i < n && cur; i++) {
      done.add(cur.id);
      const tx = cur.x, ty = cur.y - cur.bodyH * 0.5;
      G.FX.beam(fx, fy, Math.atan2(ty - fy, tx - fx), Math.hypot(tx - fx, ty - fy), 10, col, vis);
      if (!ghost) {
        // Infortunio: más daño a quien ya sufre un estado.
        const hex = m.hex && (cur.burn > 0 || cur.poison > 0 || cur.slow > 0) ? m.hex : 1;
        hit(pl, cur, m.dmg * pl.atk * k * hex, col, tx - fx, ty - fy, 0, m);
      }
      k *= 0.85;
      fx = tx; fy = ty;
      let best = null, bd = m.radius * m.radius;
      for (const e of enemiesIn(cur.x, cur.y, m.radius)) {
        if (done.has(e.id)) continue;
        const d = G.U.dist2(cur.x, cur.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      cur = best;
    }
    if (!ghost) G.Camera.kick(0.05);
  }

  /** Minas: se quedan en el suelo y estallan cuando un enemigo las pisa. */
  function mines(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0);
    // Sin enemigos y con un cofre o una roca de blanco: la mina cae sobre él y estalla al armarse.
    const tp = propTarget(pl);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, d = n === 1 ? 0 : G.U.rand(18, 46);
      const ox = tp && i === 0 ? tp.x : pl.x, oy = tp && i === 0 ? tp.y : pl.y, dd = tp && i === 0 ? 0 : d;
      fields.push({ kind: 'mine', owner: pl, ghost, m, col, vis, x: ox + Math.cos(a) * dd, y: oy + Math.sin(a) * dd * 0.8,
                    t: 0, arm: 0.35, life: m.dur || 7, r: m.radius, dmg: m.dmg * pl.atk, prop: tp && i === 0 ? tp : null });
    }
    // Como mucho unas pocas por jugador: las más viejas se van.
    const mine = fields.filter(f => f.kind === 'mine' && f.owner === pl);
    for (const f of mine.slice(0, Math.max(0, mine.length - (4 + n * 2)))) f.gone = true;
  }

  /** Meteoros: caen del cielo sobre enemigos cercanos (la sombra avisa dónde). */
  function meteors(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0);
    const near = enemiesIn(pl.x, pl.y, reach(m)).filter(e => !e.dead);
    G.U.shuffle ? G.U.shuffle(near) : near.sort(() => Math.random() - 0.5);
    const tp = !near.length && propTarget(pl);          // sin enemigos: el primero, al cofre o la roca
    for (let i = 0; i < n; i++) {
      const e = near[i] || (i === 0 && tp) || null;
      const x = e ? e.x + G.U.rand(-8, 8) : pl.x + G.U.rand(-140, 140);
      const y = e ? e.y + G.U.rand(-6, 6) : pl.y + G.U.rand(-110, 110);
      fields.push({ kind: 'meteor', owner: pl, ghost, m, col, vis, x, y, t: -i * 0.09, fall: 0.5, r: m.radius, dmg: m.dmg * pl.atk });
    }
  }

  /** Torreta: deja algo en el suelo que dispara solo un rato. */
  function turret(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const a = pl.aim + Math.PI + G.U.rand(-0.6, 0.6);
    fields.push({ kind: 'turret', owner: pl, ghost, m, col, vis, x: pl.x + Math.cos(a) * 26, y: pl.y + Math.sin(a) * 20,
                  t: 0, life: m.dur || 6, shotT: 0.3, dmg: m.dmg * pl.atk });
    const mine = fields.filter(f => f.kind === 'turret' && f.owner === pl && !f.gone);
    for (const f of mine.slice(0, Math.max(0, mine.length - Math.max(1, m.count | 0)))) f.gone = true;
    G.FX.ring(pl.x, pl.y, 4, 30, col, 0.3, 2);
  }

  /** Embestida: cruzas como un rayo hacia el enemigo y golpeas a todo lo del camino. */
  function dash(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
    const sx = pl.x, sy = pl.y;
    let len = 0;
    for (let d = 8; d <= m.radius; d += 8) {
      if (!G.World.isFree(sx + ca * d, sy + sa * d, pl.r * 0.8, true)) break;
      len = d;
    }
    // Estela: varias copias del golpe a lo largo del recorrido.
    for (let d = 0; d <= len; d += 22) G.FX.sp(vis.proj || 'streak', vis.pal, sx + ca * d, sy + sa * d - G.LIFT * 0.6, { life: 0.22, angle: pl.aim });
    G.FX.slash(sx + ca * len, sy + sa * len - G.LIFT * 0.5, pl.aim, 34, 2.2, col, vis);
    if (ghost) { G.PvP.seg(pl, sx, sy, sx + ca * len, sy + sa * len, m.width || 34, m.dmg * pl.atk, m.type); return; }
    pl.x = sx + ca * len; pl.y = sy + sa * len;
    G.World.collide(pl);
    pl.invuln = Math.max(pl.invuln || 0, 0.3);
    const w = m.width || 34;
    const mx = sx + ca * len / 2, my = sy + sa * len / 2;
    for (const e of enemiesIn(mx, my, len / 2 + w)) {
      if (segDist2(sx, sy, pl.x, pl.y, e.x, e.y) <= (w / 2 + e.r) ** 2) hit(pl, e, m.dmg * pl.atk, col, ca, sa, m.knock || 0, m);
    }
    for (const p of G.World.propsInCircle(mx, my, len / 2 + w)) {
      if (segDist2(sx, sy, pl.x, pl.y, p.x, p.y) <= (w / 2 + p.r) ** 2) G.World.damageProp(p, m.dmg * pl.atk, col);
    }
    G.Camera.kick(0.12);
  }

  /** Rastro: vas dejando charcos que dañan a lo que pasa por encima. */
  function trailPatch(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    // Parado no deja uno nuevo encima del anterior (sólo de vez en cuando).
    const last = pl.lastPatch;
    if (last && G.U.dist2(last.x, last.y, pl.x, pl.y) < (m.radius * 0.9) ** 2 && last.t < 1) return;
    const f = { kind: 'patch', owner: pl, ghost, m, col, vis, x: pl.x, y: pl.y, t: 0, life: m.dur || 3, r: m.radius,
                tick: 0, dmg: m.dmg * pl.atk };
    fields.push(f);
    pl.lastPatch = f;
    const mine = fields.filter(o => o.kind === 'patch' && o.owner === pl && !o.gone);
    for (const o of mine.slice(0, Math.max(0, mine.length - 18))) o.gone = true;
  }

  /** Abanico corto: muchos disparos rápidos que no llegan lejos (aliento, chorro...). */
  function cone(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(2, m.count | 0), arc = m.arc || 0.9;
    for (let i = 0; i < n; i++) {
      const a = pl.aim + (i / (n - 1) - 0.5) * arc + G.U.rand(-0.05, 0.05);
      const sp = m.speed * G.U.rand(0.85, 1.1);
      G.Projectiles.spawn(Object.assign({
        x: pl.x + Math.cos(a) * 4, y: pl.y + Math.sin(a) * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        dmg: m.dmg * pl.atk, r: m.size, life: m.life * G.U.rand(0.85, 1.05), pierce: m.pierce | 0, color: col,
        hits: new Set(), vis, ghost, owner: pl
      }, payload(m)));
    }
    G.FX.spark(pl.x + Math.cos(pl.aim) * pl.r, pl.y - G.LIFT + Math.sin(pl.aim) * pl.r, col, Math.cos(pl.aim), Math.sin(pl.aim), 5);
  }

  /** Daño de un campo (mina, meteoro, charco) a todo lo que hay en su círculo. */
  function blast(f, r, k = 1) {
    if (f.ghost) { G.PvP.circle(f.owner, f.x, f.y, r, f.dmg * k, f.m.type); return; }
    const pl = f.owner, m = f.m;
    for (const e of enemiesIn(f.x, f.y, r)) hit(pl, e, f.dmg * k, f.col, e.x - f.x, e.y - f.y, m.knock || 0, m);
    for (const p of G.World.propsInCircle(f.x, f.y, r)) G.World.damageProp(p, f.dmg * k, f.col);
  }

  // ---------------- 2026-10-16: exclusivos de los personajes originales ----------------
  // (data/custom.js `start`, data/moves.js `only`). En grupo se repiten como fantasma: sólo se ven.

  /** Didi · Puño Espuma: puñetazo a los `n` más cercanos; estalla en espuma alrededor del golpe. */
  function foamPunch(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE, SR = row.sr * TILE;
    const list = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl)).slice(0, row.n);
    if (!list.length) return;
    for (const e of list) {
      const a = Math.atan2(e.y - pl.y, e.x - pl.x), ca = Math.cos(a), sa = Math.sin(a);
      const ex = e.x, ey = e.y - e.bodyH * 0.5;
      if (G.Camera.sees(ex, ey, SR)) G.ExVFX.foam(e, a, SR, !!m.evolved);   // dibujo: vfx-exclusive.js
      if (ghost) continue;
      hit(pl, e, row.dmg * pl.atk, G.U.TYPE_COLOR.water, ca, sa, row.knock ? row.knock * 0.5 : 30, m);
      // Salpicadura: a los de alrededor del golpeado (no a él otra vez).
      for (const o of enemiesIn(e.x, e.y, SR)) {
        if (o === e || o.dead) continue;
        hit(pl, o, row.sdmg * pl.atk, G.U.TYPE_COLOR.water, o.x - e.x, o.y - e.y, row.knock || 0, m);
        if (row.slow && !o.dead) o.applySlow(row.slow, 1.2);
      }
    }
  }

  /** Héroe · Pelos de Punta: onda alrededor; más daño cuantos más enemigos tenga cerca. */
  function scare(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const near = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead);
    if (!near.length) return;
    const dmg = (row.dmg + row.per * Math.min(row.cap, near.length)) * pl.atk;
    // Pelos de punta, el «¡¡!!» del susto y la onda que aparta (dibujo: vfx-exclusive.js).
    G.ExVFX.scare(pl, R, !!m.evolved);
    if (ghost) return;
    for (const e of near) {
      hit(pl, e, dmg, G.U.TYPE_COLOR.normal, e.x - pl.x, e.y - pl.y, row.knock, m);
      if (row.root && !e.dead && !e.boss && !isFoe(e)) e.applyRoot(row.root);
    }
    if (row.inv) pl.invuln = Math.max(pl.invuln || 0, row.inv);
    G.Camera.kick(0.08);
  }

  /**
   * Turbo Abuela · Turbo Fantasma: deja una sombra suya donde está y golpea todo lo que hay en el
   * tramo desde la sombra anterior (va tan rápida que lo atraviesa). Parada, suelta una onda
   * fantasma alrededor (×0,6). Más velocidad mientras lo lleva.
   * (2026-10-16, «el de la abuela es flojo»: antes sólo dañaban las sombras, y quieta casi nada.)
   */
  function afterimage(pl, m) {
    const row = G.Moves.stat(m), R = row.ir * TILE;
    pl.hasteT = Math.max(pl.hasteT || 0, 0.5); pl.hasteK = Math.max(pl.hasteK || 0, row.haste);
    const px = pl._aiX == null ? pl.x : pl._aiX, py = pl._aiY == null ? pl.y : pl._aiY;
    const moved = G.U.dist2(px, py, pl.x, pl.y) > 14 * 14;
    pl._aiX = pl.x; pl._aiY = pl.y;
    if (!moved) {
      // Onda fantasma alrededor.
      G.ExVFX.ghostWave(pl, R * 1.3, !!m.evolved);
      if (!ghost) for (const e of enemiesIn(pl.x, pl.y, R * 1.3)) if (!e.dead) hit(pl, e, row.dmg * 0.6 * pl.atk, G.U.TYPE_COLOR.ghost, e.x - pl.x, e.y - pl.y, 30, m);
      return;
    }
    // El tramo recorrido: un rastro violeta y daño a lo que pilla.
    G.ExVFX.dashTrail(px, py, pl.x, pl.y);
    if (!ghost) {
      const mx = (px + pl.x) / 2, my = (py + pl.y) / 2, half = Math.hypot(pl.x - px, pl.y - py) / 2;
      for (const e of enemiesIn(mx, my, half + R)) {
        if (e.dead || segDist2(px, py, pl.x, pl.y, e.x, e.y) > (R * 0.7 + e.r) ** 2) continue;
        hit(pl, e, row.dmg * 0.6 * pl.atk, G.U.TYPE_COLOR.ghost, e.x - pl.x, e.y - pl.y, 20, m);   // el tramo, a ×0,6
      }
    }
    fields.push({ kind: 'shade', owner: pl, ghost, m, row, x: pl.x, y: pl.y, t: 0, life: row.life, tick: 0,
                  dir: pl.anim ? pl.anim.dir : 0, r: R });
  }
  function shadeStep(f, dt) {
    if ((f.tick -= dt) > 0) return;
    f.tick = 0.3;
    if (f.ghost) return;
    for (const e of enemiesIn(f.x, f.y, f.r)) if (!e.dead) hit(f.owner, e, f.row.dmg * f.owner.atk, G.U.TYPE_COLOR.ghost, 0, 0, 0, f.m);
  }
  function shadeEnd(f) {
    if (!f.row.boom) return;
    G.ExVFX.shadeBoom(f);
    if (f.ghost) return;
    for (const e of enemiesIn(f.x, f.y, f.r * 1.4)) if (!e.dead) hit(f.owner, e, f.row.boom * f.owner.atk, G.U.TYPE_COLOR.ghost, e.x - f.x, e.y - f.y, 40, f.m);
  }

  /** Tom · Caza Ratones: `n` zarpazos al más cercano; si lo derriba, salta al siguiente (`chain`). */
  function pounce(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    let e = enemiesIn(pl.x, pl.y, R).filter(o => !o.dead).sort(byDist(pl))[0];
    if (!e) return;
    let hops = row.chain, fx = pl.x, fy = pl.y;
    const done = new Set();
    while (e) {
      done.add(e);
      const a = Math.atan2(e.y - fy, e.x - fx), ex = e.x, ey = e.y - e.bodyH * 0.5;
      if (G.Camera.sees(ex, ey, 30)) G.ExVFX.pounce(e, a, row.n, !!m.evolved);   // zarpazos (vfx-exclusive.js)
      if (!ghost) {
        for (let k = 0; k < row.n && !e.dead; k++) hit(pl, e, row.dmg * pl.atk, G.U.TYPE_COLOR.dark, Math.cos(a), Math.sin(a), k === row.n - 1 ? 40 : 0, m);
        if (row.bleed && !e.dead && !isFoe(e)) { const d = dotOf(pl, e); d.bleed = row.bleed; d.bm = m; }
      }
      // En el fantasma no se sabe si lo derribó: sólo se dibuja el primero.
      if (ghost || !e.dead || hops-- <= 0) break;
      fx = e.x; fy = e.y;
      const nx = enemiesIn(fx, fy, R * 0.8).filter(o => !o.dead && !done.has(o)).sort((p, q) => G.U.dist2(p.x, p.y, fx, fy) - G.U.dist2(q.x, q.y, fx, fy))[0];
      if (nx) G.ExVFX.pounceHop(fx, fy, nx);
      e = nx;
    }
  }

  /**
   * Jerry · Sartenazo: un sartenazo (`hits` seguidos) a los `n` enemigos más cercanos; con `stun`
   * de probabilidad los deja aturdidos `st` s (a los jefes sólo los frena). Evolucionado (Sartén
   * Furiosa): siempre aturde y salpica la mitad a los que están a `splash` casillas.
   */
  function pan(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const list = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl)).slice(0, row.n);
    if (!list.length) return;
    for (const e of list) {
      const a = Math.atan2(e.y - pl.y, e.x - pl.x), ex = e.x, ey = e.y - e.bodyH * 0.6;
      const seen = G.Camera.sees(ex, ey, 30);
      if (seen) G.ExVFX.pan(e, a, row.hits, !!m.evolved);   // la sartén cae y «¡PAM!» (vfx-exclusive.js)
      if (ghost) continue;
      for (let k = 0; k < row.hits && !e.dead; k++) hit(pl, e, row.dmg * pl.atk, '#d8d8e0', Math.cos(a), Math.sin(a), k === row.hits - 1 ? 30 : 0, m);
      if (!e.dead && !isFoe(e) && Math.random() < row.stun) {
        if (e.boss) e.applySlow(0.5, row.st * 2); else e.applyRoot(row.st);
        if (seen) G.ExVFX.stunStars(e, e.boss ? row.st * 2 : row.st);
      }
      if (row.splash) {
        if (seen) G.ExVFX.panSplash(e, row.splash * TILE);
        for (const o of enemiesIn(e.x, e.y, row.splash * TILE)) if (o !== e && !o.dead) hit(pl, o, row.dmg * 0.5 * pl.atk, '#d8d8e0', o.x - e.x, o.y - e.y, 20, m);
      }
    }
    if (G.Camera.sees(pl.x, pl.y, 0)) G.Audio.sfx('break');
  }

  /** Lika · Lengüetazo Látigo: una lengua (dos, evolucionado) hasta un enemigo; daña y envenena todo lo del camino. */
  function whips(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const near = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl));
    if (!near.length) return;
    for (let i = 0; i < row.n; i++) {
      const tg = near[Math.min(i * 2, near.length - 1)];
      const a = Math.atan2(tg.y - pl.y, tg.x - pl.x) + (i ? 0.35 : 0);
      const len = Math.min(R, Math.hypot(tg.x - pl.x, tg.y - pl.y) + 24);
      fields.push({ kind: 'tongue', owner: pl, ghost, m, row, x: pl.x, y: pl.y, t: 0, life: 0.3, a, len });
      G.ExVFX.tongueDrool(pl.x, pl.y, a, len, row.n > 1);
      if (ghost) continue;
      const cx = Math.cos(a), cy = Math.sin(a);
      for (const e of enemiesIn(pl.x + cx * len / 2, pl.y + cy * len / 2, len / 2 + row.w)) {
        if (e.dead) continue;
        // Distancia del enemigo a la lengua (segmento desde ti).
        const px = e.x - pl.x, py = e.y - pl.y, along = px * cx + py * cy;
        if (along < 0 || along > len || Math.abs(px * cy - py * cx) > row.w + e.r) continue;
        hit(pl, e, row.dmg * pl.atk, G.U.TYPE_COLOR.poison, row.pull ? -cx : cx, row.pull ? -cy : cy, row.pull || 20, m);
        if (!e.dead && !isFoe(e)) e.applyPoison(row.poison);
      }
    }
    if (G.Camera.sees(pl.x, pl.y, R)) G.Audio.sfx('hit');
  }

  /** Panda · Pregunta Curiosa: «?» a los `n` más cercanos (evolucionado: a todos los del radio); se quedan pensando `stun` s. */
  function questions(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const list = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl)).slice(0, row.all ? 999 : row.n);
    if (!list.length) return;
    // «?» volando y bocadillo de «pensando» (dibujo: vfx-exclusive.js).
    G.ExVFX.question(pl, list, R, row.stun, !!row.all);
    for (const e of list) {
      if (ghost) continue;
      hit(pl, e, row.dmg * pl.atk, G.U.TYPE_COLOR.normal, e.x - pl.x, e.y - pl.y, 0, m);
      if (!e.dead && !isFoe(e)) { if (e.boss) e.applySlow(0.5, row.stun * 2); else e.applyRoot(row.stun); }
    }
  }

  /** Boniato · Boniato Rodante: bolas electrizadas que ruedan y atraviesan (evolucionado: descargan a los de alrededor). */
  function potatoRoll(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE, sp = 280;
    const tg = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl))[0];
    const a0 = tg ? Math.atan2(tg.y - pl.y, tg.x - pl.x) : pl.aim || 0;
    for (let i = 0; i < row.n; i++) {
      const a = a0 + (i - (row.n - 1) / 2) * 0.32;
      G.Projectiles.spawn(Object.assign({
        x: pl.x + Math.cos(a) * 8, y: pl.y + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        dmg: row.dmg * pl.atk, r: 7 * row.size, life: R / sp + 0.2, pierce: row.pierce, color: G.U.TYPE_COLOR.electric,
        hits: new Set(), vis: G.ExVFX.SPUD, scale: row.zap ? 2 : 1.5, ghost, owner: pl, zap: row.zap || 0
      }, payload(m)));
    }
    G.ExVFX.rollStart(pl, a0, !!row.zap);
  }
  /** Descarga del Boniato evolucionado: a los de alrededor del golpeado. */
  function zapAround(p, e, pl) {
    const near = [];
    for (const o of enemiesIn(e.x, e.y, 70)) {
      if (o === e || o.dead) continue;
      near.push(o);
      hit(pl, o, p.zap * pl.atk, G.U.TYPE_COLOR.electric, o.x - e.x, o.y - e.y, 0, { type: 'electric' });
    }
    G.ExVFX.zap(e, near.slice(0, 6));                         // estallido y rayos de píxel (vfx-exclusive.js)
  }

  // ---------------- 2026-10-16 (V3.1): los 5 de la hoja del dueño ----------------
  // Estados nuevos de los enemigos (enemy.js): confundido (applyConfuse), congelado (applyFreeze) y
  // atrapado (e.grab, sólo los que mueve este ordenador). Los jefes nunca: se frenan.
  const nearestN = (pl, R, n) => enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl)).slice(0, n);

  /**
   * Elemento Inestable: arcilla a los `n` más cercanos (a `r` casillas): daño al pegar y explosión
   * (`boom`, radio `br`) a los 2,5 s, también si el pegado muere antes. Evolucionado (Bomba Pegajosa
   * Letal): salta a `bounce` enemigos a 2 casillas y los pega a la misma bomba; con 3 pegados explota
   * al momento y además frena y quema.
   */
  const CLAY_FUSE = 2.5;
  function clays(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE, col = G.U.TYPE_COLOR.rock;
    const list = nearestN(pl, R, row.n);
    if (!list.length) return;
    const taken = new Set();
    for (const e of list) {
      if (taken.has(e)) continue;
      G.FX.sp('clay', 'rock', pl.x, pl.y - pl.bodyH * 0.6, { vx: (e.x - pl.x) * 4.5, vy: (e.y - e.bodyH * 0.5 - pl.y + pl.bodyH * 0.6) * 4.5, life: 0.22 });
      if (!ghost) hit(pl, e, row.dmg * pl.atk, col, e.x - pl.x, e.y - pl.y, 0, m);
      const f = { kind: 'clay', owner: pl, ghost, m, row, x: e.x, y: e.y, t: 0, life: 9e9, fuse: CLAY_FUSE, stuck: [e] };
      taken.add(e);
      for (let k = 0, cur = e; k < (row.bounce || 0); k++) {
        const nx = enemiesIn(cur.x, cur.y, 2 * TILE).filter(o => !o.dead && !taken.has(o) && !isFoe(o))
          .sort((a, b) => G.U.dist2(a.x, a.y, cur.x, cur.y) - G.U.dist2(b.x, b.y, cur.x, cur.y))[0];
        if (!nx) break;
        taken.add(nx); f.stuck.push(nx);
        G.FX.sp('clay', 'rock', (cur.x + nx.x) / 2, (cur.y + nx.y) / 2 - 16, { life: 0.15 });
        if (!ghost) hit(pl, nx, row.dmg * pl.atk, col, nx.x - cur.x, nx.y - cur.y, 0, m);
        cur = nx;
      }
      if (row.combo && f.stuck.length >= 3) f.fuse = 0.15;          // tres pegados: explota ya
      fields.push(f);
    }
  }
  function clayStep(f) {
    const e = f.stuck.find(o => !o.dead && alive(o));
    if (e) { f.x = e.x; f.y = e.y; }
    if (f.t < f.fuse) return true;
    const R = f.row.br * TILE, combo = f.row.combo && f.stuck.length >= 3;
    const centers = f.stuck.filter(o => !o.dead && alive(o)).map(o => [o.x, o.y]);
    if (!centers.length) centers.push([f.x, f.y]);
    const done = new Set();
    for (const [x, y] of centers) {
      if (G.Camera.sees(x, y, R)) {
        G.FX.sp('pow', 'fire', x, y - 14, { life: 0.24, scale: 1.5, frameRate: 14, fade: false });
        G.FX.burst(x, y - 8, '#c6b08a', 10, 170);
        G.FX.ring(x, y, 6, R, combo ? '#ff6a1f' : '#ff9a4d', 0.3, 3);
      }
      if (f.ghost) continue;
      for (const o of enemiesIn(x, y, R)) {
        if (o.dead || done.has(o)) continue;
        done.add(o);
        hit(f.owner, o, f.row.boom * f.owner.atk, '#ff9a4d', o.x - x, o.y - y, 60, f.m);
        if (combo && !o.dead && !isFoe(o)) { o.applySlow(0.45, 2); o.applyBurn(3); }
      }
      for (const q of G.World.propsInCircle(x, y, R)) G.World.damageProp(q, f.row.boom * f.owner.atk, '#ff9a4d');
    }
    if (G.Camera.sees(f.x, f.y, 80)) { G.Audio.sfx('break'); G.Camera.kick(0.08); }
    return false;
  }

  /**
   * Puño de Piedra: un puño de roca sale del suelo bajo los `n` más cercanos (a `r` casillas), les
   * pega y los lanza por los aires `hops` veces seguidas (en `lifts`, como el tornado). Evolucionado
   * (Maestro del Puño de Piedra): al acabar, empujón (`endKnock`) y aturdidos `stun` s.
   */
  function rockFists(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    for (const e of nearestN(pl, R, row.n)) fields.push({ kind: 'pillar', owner: pl, ghost, m, row, x: e.x, y: e.y + 2, t: 0, life: 0.55, struck: false });
  }
  function pillarStep(f) {
    if (f.struck || f.t < 0.08) return true;
    f.struck = true;
    if (G.Camera.sees(f.x, f.y, 60)) {
      G.FX.burst(f.x, f.y - 4, '#aa7c3c', 12, 160);
      for (let k = 0; k < 5; k++) G.FX.sp('rock', 'ground', f.x + G.U.rand(-14, 14), f.y - 6, { vx: G.U.rand(-90, 90), vy: G.U.rand(-160, -60), life: 0.35, scale: 1 });
      G.Audio.sfx('break');
    }
    for (const e of enemiesIn(f.x, f.y, 26 + 30)) {
      if (e.dead || G.U.dist2(e.x, e.y, f.x, f.y) > (26 + e.r) ** 2) continue;
      if (!f.ghost) hit(f.owner, e, f.row.dmg * f.owner.atk, G.U.TYPE_COLOR.ground, 0, -1, 0, f.m);
      if (!e.dead) hop(f, e);
    }
    if (!f.ghost) for (const q of G.World.propsInCircle(f.x, f.y, 26)) G.World.damageProp(q, f.row.dmg * f.owner.atk, G.U.TYPE_COLOR.ground);
    return true;
  }
  function hop(f, e) {
    const row = f.row, dur = 0.38 * row.hops;
    if (!f.ghost) { if (e.boss || isFoe(e)) e.applySlow(0.5, dur); else e.applyRoot(dur + 0.05); }
    if (lifts.has(e)) return;
    lifts.set(e, { owner: f.owner, ghost: f.ghost, m: f.m, row: { hops: row.hops, endKnock: row.endKnock, stun: row.stun, dmg: row.dmg },
                   t: 0, dur, tick: 0.5, boss: !!e.boss || isFoe(e) });
  }

  /**
   * Viento Planetario: muro de viento de `wr` casillas a tu alrededor mientras lo llevas (deshace
   * los proyectiles enemigos que entran: ver resolve) y golpes invisibles a los `n` más cercanos a
   * `r` casillas. Con `push`, el muro aparta a los enemigos. Evolucionado (Dominio del Viento): muro
   * de 6 casillas sin golpe invisible; atrapa a los que tocan el borde (hasta `grab`), giran a tu
   * alrededor sin atacar y, en cada lanzamiento, uno sale disparado contra otro enemigo a `r`
   * casillas (`throw` de daño; el lanzado pierde `cut` de su vida). Atrapar sólo puede quien mueve a
   * los monstruos (solo o anfitrión); en un invitado el borde del muro golpea y frena.
   */
  function windWall(pl, m) {
    const row = G.Moves.stat(m), WR = row.wr * TILE, cd = (row.cd || m.cd) * (pl.cdK || 1);
    if (!ghost) { pl.windUntil = G.Game.st.time + cd + 0.4; pl.windR = WR; }
    let f = fields.find(o => o.kind === 'wind' && o.owner === pl && !o.gone);
    if (!f) { f = { kind: 'wind', owner: pl, ghost, m, row, x: pl.x, y: pl.y, t: 0, life: 9e9, held: [], hitT: new Map() }; fields.push(f); }
    f.row = row; f.m = m; f.r = WR; f.end = f.t + cd + 0.4;
    if (!row.grab) {
      for (const e of nearestN(pl, row.r * TILE, row.n)) {
        if (G.Camera.sees(e.x, e.y, 30)) {
          G.FX.sp('crescent', 'flying', e.x, e.y - e.bodyH * 0.5, { life: 0.16, scale: 1.5, angle: Math.random() * 6.28 });
          for (let k = 0; k < 3; k++) G.FX.px(e.x + G.U.rand(-8, 8), e.y - e.bodyH * 0.5 + G.U.rand(-8, 8), '#d2e2ff', { vx: G.U.rand(-60, 60), vy: G.U.rand(-60, 20), life: 0.25 });
        }
        if (!ghost) hit(pl, e, row.dmg * pl.atk, G.U.TYPE_COLOR.flying, e.x - pl.x, e.y - pl.y, 0, m);
      }
      return;
    }
    if (ghost) return;
    // Lanza (de `toss` en `toss`) a los que lleven más rato atrapados contra los enemigos más cercanos.
    const ready = f.held.filter(e => !e.dead && e.grab && !e.grab.toss && e.grab.t > 0.8).sort((a, b) => b.grab.t - a.grab.t).slice(0, row.toss || 1);
    const tgs = enemiesIn(pl.x, pl.y, row.r * TILE).filter(o => !o.dead && !o.grab && !isFoe(o)).sort(byDist(pl));
    ready.forEach((e, i) => {
      const tg = tgs[i] || tgs[0];
      if (!tg && e.grab.t < 4) return;
      e.grab.toss = true;
      const tx = tg ? tg.x : e.x + (e.x - pl.x), ty = tg ? tg.y : e.y + (e.y - pl.y);
      fields.push({ kind: 'toss', owner: pl, ghost: false, m, row, e, x: e.x, y: e.y, x0: e.x, y0: e.y, tx, ty, target: tg, t: 0, life: 9e9, dur: 0.32 });
    });
    // Muñecos (sala de entrenamiento) y Magikarp: no se pueden atrapar (no se mueven), así que en
    // cada lanzamiento `toss` de los que están dentro del muro reciben el golpe de un enemigo lanzado
    // (2026-10-19: «sólo se levantan un poco y no hay daño»: en la sala no había nadie a quien atrapar).
    const dums = enemiesIn(pl.x, pl.y, f.r + 40).filter(o => o.dummy && !o.dead && G.U.dist(o.x, o.y, pl.x, pl.y) <= f.r + o.r);
    if (dums.length) {
      f.dumI = (f.dumI || 0);
      for (let k = 0; k < Math.min(row.toss || 1, dums.length); k++) {
        const d = dums[(f.dumI++) % dums.length];
        hit(pl, d, row.throw * pl.atk, G.U.TYPE_COLOR.flying, d.x - pl.x, d.y - pl.y, 0, m);
        if (G.Camera.sees(d.x, d.y, 60)) {
          G.FX.burst(d.x, d.y - 8, '#d2e2ff', 14, 170);
          G.FX.ring(d.x, d.y, 6, 1.2 * TILE, '#93b2ff', 0.3, 3);
          G.Audio.sfx('break');
        }
      }
    }
  }
  function windStep(f, dt) {
    const pl = f.owner;
    if (f.t > f.end || !pl || pl.dead) { for (const e of f.held) if (e.grab && e.grab.f === f && !e.grab.toss) e.grab = null; return false; }
    f.x = pl.x; f.y = pl.y;
    if (f.ghost) return true;
    const row = f.row, R = f.r;
    if (row.push) {
      for (const e of enemiesIn(pl.x, pl.y, R)) {
        if (e.dead || e.boss || e.remote || e.dummy || isFoe(e) || e.grab) continue;
        const dx = e.x - pl.x, dy = e.y - pl.y, d = Math.max(1, Math.hypot(dx, dy)), min = R + e.r * 0.5;
        if (d >= min) continue;
        const x = pl.x + dx / d * min, y = pl.y + dy / d * min;
        if (!G.World.isWall(x, y)) { e.x = x; e.y = y; }
        e.kx += dx / d * 90; e.ky += dy / d * 90;
      }
    }
    if (!row.grab) return true;
    f.held = f.held.filter(e => !e.dead && e.grab && e.grab.f === f);
    // Atrapa a todo el que esté dentro del muro (antes sólo en una franja fina del borde: los rápidos,
    // los que saltan o los que aparecían dentro la cruzaban sin quedar atrapados), los más cercanos antes.
    const near = enemiesIn(pl.x, pl.y, R + 30).sort(byDist(pl));
    for (const e of near) {
      if (e.dead || e.boss || e.dummy || isFoe(e) || e.grab || e.windFree > f.t) continue;
      const d = Math.hypot(e.x - pl.x, e.y - pl.y);
      if (d > R + e.r) continue;
      if (e.remote) {
        // Invitado: los monstruos los mueve el anfitrión; el borde golpea y frena (una vez por segundo).
        const last = f.hitT.get(e.id);
        if (last != null && f.t - last < 1) continue;
        f.hitT.set(e.id, f.t);
        hit(pl, e, row.throw * 0.5 * pl.atk, G.U.TYPE_COLOR.flying, e.x - pl.x, e.y - pl.y, 0, f.m);
        e.applySlow(0.5, 1);
        continue;
      }
      if (f.held.length >= row.grab) continue;
      e.grab = { f, a: Math.atan2(e.y - pl.y, e.x - pl.x), t: 0 };
      f.held.push(e);
      G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#d2e2ff', 6, 90);
    }
    // Los atrapados giran a tu alrededor (más cerca que el muro) sin poder hacer nada.
    const rr = Math.min(R * 0.55, 3.2 * TILE);
    for (const e of f.held) {
      if (e.grab.toss) continue;
      e.grab.t += dt; e.grab.a += dt * 2.6;
      e.x = G.U.damp(e.x, pl.x + Math.cos(e.grab.a) * rr, 10, dt);
      e.y = G.U.damp(e.y, pl.y + Math.sin(e.grab.a) * rr * 0.8, 10, dt);
      e.kx = 0; e.ky = 0; e.rootT = Math.max(e.rootT, 0.2);
      // Sube poco a poco (sin saltar de golpe a 10 px) y mira hacia donde gira.
      e.jumpLift = Math.min(1, e.grab.t * 4) * (10 + Math.sin(e.grab.t * 6) * 4);
      e.anim.dir = G.Sprites.dirFromAngle(e.grab.a + Math.PI / 2);
    }
    return true;
  }
  function tossStep(f) {
    const e = f.e, k = Math.min(1, f.t / f.dur);
    if (!e.dead) {
      e.x = f.x0 + (f.tx - f.x0) * k; e.y = f.y0 + (f.ty - f.y0) * k;
      e.jumpLift = Math.sin(k * Math.PI) * 50;
      if (Math.random() < 0.5) G.FX.px(e.x + G.U.rand(-6, 6), e.y - e.jumpLift - 6, '#d2e2ff', { life: 0.25 });
    }
    if (k < 1) return true;
    e.jumpLift = 0; e.grab = null;
    const w = fields.find(o => o.kind === 'wind' && o.owner === f.owner);
    if (w) e.windFree = w.t + 0.6;                  // recién lanzado: un momento antes de poder atraparlo otra vez
    G.FX.burst(f.tx, f.ty - 8, '#d2e2ff', 14, 170);
    G.FX.ring(f.tx, f.ty, 6, 1.2 * TILE, '#93b2ff', 0.3, 3);
    if (G.Camera.sees(f.tx, f.ty, 60)) { G.Audio.sfx('break'); G.Camera.kick(0.1); }
    const pl = f.owner, row = f.row;
    for (const o of enemiesIn(f.tx, f.ty, 1.2 * TILE)) {
      if (o === e || o.dead || isFoe(o)) continue;
      hit(pl, o, row.throw * pl.atk, G.U.TYPE_COLOR.flying, o.x - f.tx, o.y - f.ty, 80, f.m);
    }
    if (!e.dead) e.hurt(e.hp * row.cut, G.U.TYPE_COLOR.flying, e.x - pl.x, e.y - pl.y, 60);
    return false;
  }

  /**
   * Arte Gélido: hielo a los `n` más cercanos (a `r` casillas): daño y frena; con `sr`, salpica
   * (mitad de daño) a los de alrededor. Evolucionado (Agonía de Escarcha): no frena: los congela
   * `freeze` s en un bloque de hielo (enemy.js) que al romperse suelta 4 esquirlas: a los de `shatter`
   * casillas, daño (`shard`) y también congelados (una vez: las esquirlas de éstos ya no congelan).
   */
  function iceArts(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE, col = G.U.TYPE_COLOR.ice;
    for (const e of nearestN(pl, R, row.n)) {
      const a = Math.atan2(e.y - pl.y, e.x - pl.x), d = Math.hypot(e.x - pl.x, e.y - pl.y);
      if (G.Camera.sees(e.x, e.y, R)) {
        G.FX.sp('shard', 'ice', pl.x + Math.cos(a) * 10, pl.y - pl.bodyH * 0.5 + Math.sin(a) * 10,
                { vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, life: Math.max(0.05, d / 560), angle: a, scale: 1.5, fade: false });
        G.FX.sp('impact', 'ice', e.x, e.y - e.bodyH * 0.5, { life: 0.16, scale: 1.4, frameRate: 14 });
      }
      if (ghost) continue;
      hit(pl, e, row.dmg * pl.atk, col, Math.cos(a), Math.sin(a), 0, m);
      if (!e.dead && !isFoe(e)) { if (row.freeze) freezeOn(pl, e, m, row, 0); else e.applySlow(row.slow, 1.5); }
      if (row.sr) {
        G.FX.ring(e.x, e.y, 4, row.sr * TILE, '#bff3ff', 0.25, 3);
        for (const o of enemiesIn(e.x, e.y, row.sr * TILE)) {
          if (o === e || o.dead) continue;
          hit(pl, o, row.dmg * 0.35 * pl.atk, col, o.x - e.x, o.y - e.y, 0, m);
          if (!o.dead && !isFoe(o)) o.applySlow(row.slow, 1.5);
        }
      }
    }
  }
  function freezeOn(pl, e, m, row, depth) {
    if (e.boss) { e.applySlow(0.6, row.freeze); return; }
    if (fields.some(f => f.kind === 'frost' && f.e === e)) return;       // ya está congelado
    e.applyFreeze(row.freeze);
    fields.push({ kind: 'frost', owner: pl, ghost: false, m, row, e, x: e.x, y: e.y, t: 0, life: 9e9, dur: row.freeze, depth });
  }
  function frostStep(f) {
    const e = f.e;
    if (!e.dead && alive(e)) { f.x = e.x; f.y = e.y; }
    if (f.t < f.dur && !e.dead) return true;
    // Se rompe: 4 esquirlas en diagonal.
    if (G.Camera.sees(f.x, f.y, 80)) {
      for (let k = 0; k < 4; k++) {
        const a = 0.785 + k * 1.571;
        G.FX.sp('shard', 'ice', f.x, f.y - 14, { vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, life: 0.26, angle: a, scale: 1.5 });
      }
      G.FX.burst(f.x, f.y - 12, '#bff3ff', 10, 150);
      G.Audio.sfx('break');
    }
    const R = f.row.shatter * TILE;
    for (const o of enemiesIn(f.x, f.y, R)) {
      if (o === e || o.dead || isFoe(o)) continue;
      hit(f.owner, o, f.row.shard * f.owner.atk, G.U.TYPE_COLOR.ice, o.x - f.x, o.y - f.y, 0, f.m);
      if (!o.dead && f.depth < 1) freezeOn(f.owner, o, f.m, f.row, f.depth + 1);
    }
    return false;
  }

  /**
   * Esfera Dragón: `n` esferas contra los más cercanos (a `r` casillas) que los atraviesan; frenan
   * (`slow`) y empujan (`knock`). Evolucionado (Esfera Dragón de Ocho Escamas): crecen al atravesar
   * (hasta `grow` veces, ×1,25 de daño cada vez) y lo que mata la más grande explota y confunde
   * (`conf` s) a los de `confR` casillas (ver resolve: dragonHit).
   */
  const ORB_SPEED = 320;
  function dragonOrbs(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE;
    const near = enemiesIn(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl));
    for (let i = 0; i < row.n; i++) {
      const e = near[i];
      const a = e ? Math.atan2(e.y - pl.y, e.x - pl.x) : (pl.aim || 0) + (i - (row.n - 1) / 2) * 0.25;
      G.Projectiles.spawn(Object.assign(payload(m), {
        x: pl.x + Math.cos(a) * 8, y: pl.y + Math.sin(a) * 8, vx: Math.cos(a) * ORB_SPEED, vy: Math.sin(a) * ORB_SPEED,
        dmg: row.dmg * pl.atk, r: 7, scale: 1, life: R / ORB_SPEED + 0.15, pierce: row.pierce || 2, color: G.U.TYPE_COLOR.dragon,
        hits: new Set(), vis: { proj: 'ball', pal: 'dragon' }, ghost, owner: pl,
        slow: row.slow || 0, knock: row.knock || 0, grow: row.grow || 0, grown: 0, conf: row.conf || 0, confR: row.confR || 0
      }));
    }
  }
  /** Una esfera dragón ha atravesado a `e` (mató: `killed`): confusión si era la grande, y crece. */
  function dragonHit(p, e, killed) {
    if (p.conf && killed && p.grown >= p.grow && !p.ghost) confBlast(p.owner, e.x, e.y, p.confR, p.conf);
    if (p.grow && p.grown < p.grow) {
      p.grown++;
      p.scale = p.grown >= 2 ? 2 : 1.5; p.r = 7 * p.scale; p.dmg *= 1.25;
      G.FX.ring(p.x, p.y, 4, 16 * p.scale, '#a490ff', 0.2, 2);
    }
  }
  function confBlast(pl, x, y, rTiles, dur, fromNet) {
    const R = rTiles * TILE;
    if (G.Camera.sees(x, y, R)) {
      G.FX.ring(x, y, 8, R, '#a490ff', 0.45, 4);
      G.FX.burst(x, y - 10, '#c47bff', 16, 200);
      for (let k = 0; k < 6; k++) G.FX.sp('star', 'psychic', x, y - 12, { vx: Math.cos(k * 1.05) * 160, vy: Math.sin(k * 1.05) * 110, life: 0.4 });
    }
    if (fromNet) return;
    for (const o of enemiesIn(x, y, R)) if (!o.dead && !isFoe(o)) o.applyConfuse(dur);
    if (G.Coop.active) { const ev = ['mfx', 'conf', Math.round(x), Math.round(y), rTiles]; if (G.Coop.isHost) G.Coop.broadcast(ev); else G.Coop.toHost(ev); }
  }

  function updateFields(dt) {
    tickDots(dt);
    if (lifts.size) updateLifts(dt);
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      f.t += dt;
      if (f.gone || !f.owner || (f.life && f.t >= f.life && f.kind !== 'mine' && f.kind !== 'hole')) { fields.splice(i, 1); continue; }
      if (f.kind === 'mine') {
        const armed = f.t >= f.arm;
        const trig = armed && (enemiesIn(f.x, f.y, 14).length > 0 || (f.prop && f.prop.hp > 0));
        if (trig || f.t >= f.life) {
          G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.3, 4);
          G.FX.burst(f.x, f.y - 6, f.col, 10, 150);
          if (G.Camera.sees(f.x, f.y, 40)) G.Audio.sfx('break');
          blast(f, f.r, trig ? 1 : 0.5);
          fields.splice(i, 1);
        }
      } else if (f.kind === 'meteor') {
        if (f.t >= f.fall) {
          G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.35, 4);
          G.FX.burst(f.x, f.y - 6, f.col, 12, 170);
          if (G.Camera.sees(f.x, f.y, 40)) { G.Audio.sfx('break'); G.Camera.kick(0.12); }
          blast(f, f.r);
          fields.splice(i, 1);
        }
      } else if (f.kind === 'turret') {
        f.shotT -= dt;
        if (f.shotT <= 0) {
          const m = f.m;
          const tg = G.Projectiles.nearest(G.EnemyMgr.all(), f.x, f.y, m.range || 300) || (G.PvP.on && !f.ghost ? G.PvP.foeNear(f.x, f.y, m.range || 300) : null)
                  || G.World.nearestBreakable(f.x, f.y, 200);        // sin enemigos: a la roca o el cofre más cercano
          f.shotT = tg ? m.rate || 0.6 : 0.15;
          if (tg) {
            const a = Math.atan2(tg.y - f.y, tg.x - f.x);
            G.Projectiles.spawn(Object.assign({
              x: f.x, y: f.y, vx: Math.cos(a) * (m.speed || 300), vy: Math.sin(a) * (m.speed || 300),
              dmg: f.dmg, r: m.size || 6, life: 1.4, pierce: m.pierce | 0, color: f.col,
              hits: new Set(), vis: f.vis, ghost: f.ghost, owner: f.owner
            }, payload(m)));
            f.kick = 0.12;
          }
        }
        if (f.kick > 0) f.kick -= dt;
      } else if (f.kind === 'arrow') {
        if (!arrowStep(f, dt)) fields.splice(i, 1);
      } else if (f.kind === 'heart') {
        if (!heartStep(f, dt)) fields.splice(i, 1);
      } else if (f.kind === 'clay') {
        if (!clayStep(f)) fields.splice(i, 1);
      } else if (f.kind === 'pillar') {
        pillarStep(f);
      } else if (f.kind === 'wind') {
        if (!windStep(f, dt)) fields.splice(i, 1);
      } else if (f.kind === 'toss') {
        if (!tossStep(f)) fields.splice(i, 1);
      } else if (f.kind === 'frost') {
        if (!frostStep(f)) fields.splice(i, 1);
      } else if (f.kind === 'shade') {
        shadeStep(f, dt);
        if (f.t >= f.life - dt) shadeEnd(f);
      } else if (f.kind === 'tornado') {
        if (!tornadoStep(f, dt)) fields.splice(i, 1);
      } else if (f.kind === 'hole') {
        if (!holeStep(f, dt)) fields.splice(i, 1);
      } else if (f.kind === 'storm') {
        // Sigue a su dueño (la tormenta va contigo).
        f.x = f.owner.x; f.y = f.owner.y;
      } else if (f.kind === 'link') {
        // Descargas entre los rayos (Tormenta Eléctrica): cada 0,2 s, a lo que esté en la línea.
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.2;
          for (let k = 1; k < f.pts.length; k++) {
            const a = f.pts[k - 1], b = f.pts[k];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            if (G.Camera.sees(a.x, a.y, len)) G.FX.arc(a.x, a.y - 8, b.x, b.y - 8, { life: 0.2 });
            if (f.ghost) continue;
            for (const e of enemiesIn((a.x + b.x) / 2, (a.y + b.y) / 2, len / 2 + 16)) {
              if (!e.dead && segDist2(a.x, a.y, b.x, b.y, e.x, e.y) <= (14 + e.r) ** 2) hit(f.owner, e, f.dmg, f.col, 0, 0, 0, f.m);
            }
          }
        }
      } else if (f.kind === 'puddle') {
        // Charco de Lluvia Corrosiva: cada 0,5 s, a lo que lo pise.
        f.tick -= dt;
        if (f.tick <= 0 && !f.ghost) {
          f.tick = 0.5;
          for (const e of enemiesIn(f.x, f.y, f.r)) {
            if (e.dead) continue;
            if (f.row.pud >= 2) poisonWith(f.owner, e, f.row, f.m); else e.applySlow(f.row.slow, 0.7);
            if (f.row.spread && !e.boss) { const d = dotOf(f.owner, e); d.drip = G.Game.st.time + f.row.spread; d.prow = f.row; d.pm = f.m; }
          }
        }
      } else if (f.kind === 'tree') {
        if (f.t >= f.fall) {
          G.FX.ring(f.x, f.y, 4, f.r, '#97e36c', 0.35, 4);
          if (G.Camera.sees(f.x, f.y, 40)) {
            G.Audio.sfx('break'); G.Camera.kick(0.1);
            // Hojas que salen volando, astillas y polvo (sprites de píxel).
            for (let k = 0; k < 9; k++) {
              const a = Math.random() * 6.2832, sp = G.U.rand(50, 130);
              G.FX.sp('leaf', 'grass', f.x + Math.cos(a) * 10, f.y - 14 + Math.sin(a) * 8,
                      { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 70, grav: 170, spin: G.U.rand(-9, 9), life: G.U.rand(0.5, 0.8) });
            }
            for (let k = 0; k < 7; k++) {
              G.FX.px(f.x + G.U.rand(-8, 8), f.y - 6, k & 1 ? '#6b4220' : '#c08a4a',
                      { vx: G.U.rand(-110, 110), vy: G.U.rand(-170, -60), grav: 480, drag: 0.98, life: 0.5, size: 2 });
            }
            for (const s of [-1, 1]) G.FX.sp('puff', 'ground', f.x + s * f.r * 0.45, f.y - 4, { vx: s * 40, life: 0.42, frameRate: 7 });
          }
          blast(f, f.r);
          const row = f.row;
          if (row.zone) fields.push({ kind: 'grove', owner: f.owner, ghost: f.ghost, m: f.m, row, col: f.col, x: f.x, y: f.y,
                                      t: 0, life: 3, r: f.r, tick: 0, rooted: new Set() });
          if (row.spikes) fields.push({ kind: 'spikes', owner: f.owner, ghost: f.ghost, m: f.m, col: '#8a5a2b', x: f.x, y: f.y,
                                        t: 0, fall: 0.3, r: f.r * 0.8, dmg: row.spikes * f.owner.atk });
          fields.splice(i, 1);
        }
      } else if (f.kind === 'spikes') {
        // (2026-10-15: pegaban pero apenas se veían: ahora las púas salen del suelo y se quedan un momento.)
        if (!f.done && f.t >= f.fall) {
          f.done = true;
          for (let k = 0; k < 6; k++) {
            const a = Math.random() * 6.2832, d = Math.random() * f.r * 0.8;
            G.FX.px(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6, k & 1 ? '#6e4c1e' : '#dcb66c',
                    { vx: G.U.rand(-40, 40), vy: G.U.rand(-120, -60), grav: 420, drag: 0.98, life: 0.4, size: 1 + (k & 1) });
          }
          blast(f, f.r);
        }
        if (f.t >= f.fall + 0.6) fields.splice(i, 1);
      } else if (f.kind === 'grove') {
        // Zona del árbol caído: frena (evolucionado: enredaderas que inmovilizan una vez a cada uno).
        f.tick -= dt;
        if (f.tick <= 0 && !f.ghost) {
          f.tick = 0.5;
          for (const e of enemiesIn(f.x, f.y, f.r)) {
            if (e.dead) continue;
            if (f.row.root && !f.rooted.has(e.id)) {
              f.rooted.add(e.id);
              if (e.boss) e.applySlow(0.5, 1); else e.applyRoot(f.row.root);
            } else e.applySlow(0.4, 0.7);
          }
        }
      } else if (f.kind === 'patch') {
        f.tick -= dt;
        if (f.tick <= 0) { f.tick = 0.5; blast(f, f.r); }
        if (f.vis.aura && Math.random() < dt * 3 && G.Camera.sees(f.x, f.y, 20)) {
          G.FX.sp(f.vis.aura, f.vis.pal, f.x + G.U.rand(-f.r, f.r) * 0.6, f.y - 4, { vy: -40, life: 0.4 });
        }
      }
    }
  }

  /** Lo de los campos que va en el suelo (debajo de los Pokémon). */
  function drawGroundFields(ctx) {
    const now = performance.now() / 1000;
    for (const f of fields) {
      if (f.kind === 'wind' && G.Camera.sees(f.x, f.y, f.r)) {
        // Borde del muro de viento en el suelo (puntos que giran).
        ctx.save();
        ctx.globalAlpha = 0.33; ctx.fillStyle = '#d2e2ff';
        G.VFX.dashOval(ctx, f.x, f.y, f.r, f.r * 0.6, Math.floor(now * 8), 2, 3);
        ctx.restore();
        continue;
      }
      if (!G.Camera.sees(f.x, f.y, 60)) continue;
      ctx.save();
      if (f.kind === 'patch') {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 6);
        ctx.globalAlpha = 0.32 * a;
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.5 * a;
        ctx.strokeStyle = f.col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.8, f.r * 0.5, 0, 0, 6.2832); ctx.stroke();
      } else if (f.kind === 'puddle') {
        // Charco de veneno en píxeles (borde oscuro, tramado, burbujas que revientan).
        const a = Math.min(1, (f.life - f.t) * 1.5, f.t * 6);
        G.VFX.draw(ctx, f.r > 30 ? 'puddleL' : 'puddleS', 'poison', f.x, f.y,
                   { frame: Math.floor(now * 4 + f.x * 0.37), alpha: a > 0.66 ? 0.92 : a > 0.33 ? 0.6 : 0.3 });
      } else if (f.kind === 'grove') {
        // Zona del árbol: hierba oscura a píxeles, borde a puntos y enredaderas que salen del suelo.
        const a = Math.min(1, (f.life - f.t) * 1.5, f.t * 6), st = a > 0.66 ? 1 : a > 0.33 ? 0.66 : 0.33;
        ctx.globalAlpha = 0.26 * st; ctx.fillStyle = f.row.root ? '#14400f' : '#24721e';
        G.VFX.oval(ctx, f.x, f.y, f.r, f.r * 0.6);
        ctx.globalAlpha = 0.7 * st; ctx.fillStyle = '#97e36c';
        G.VFX.dashOval(ctx, f.x, f.y, f.r, f.r * 0.6, Math.floor(now * 6), 2, 3);
        const n = f.row.root ? 9 : 6, grow = Math.min(1, f.t / 0.25);
        for (let k = 0; k < n; k++) {
          const ang = k * 2.399 + f.x * 0.013, d = f.r * (0.25 + 0.6 * ((k * 0.618 + 0.3) % 1));
          G.VFX.draw(ctx, 'vine', 'grass', f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d * 0.6 + (1 - grow) * 8,
                     { pivot: [6, 11], frame: Math.floor(now * 3 + k) % 2, alpha: st * (grow < 1 ? 0.66 : 1) });
        }
      } else if (f.kind === 'tree') {
        // Sombra que crece a píxeles y círculo de aviso a puntos que marchan.
        const k = G.U.clamp(f.t / f.fall, 0, 1), s = 0.3 + k * 0.7;
        ctx.globalAlpha = 0.15 + k * 0.25; ctx.fillStyle = '#000';
        G.VFX.oval(ctx, f.x, f.y, f.r * s, f.r * 0.6 * s);
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#97e36c';
        G.VFX.dashOval(ctx, f.x, f.y, f.r, f.r * 0.6, Math.floor(now * 10), 3, 2);
      } else if (f.kind === 'spikes') {
        // Púas de madera (sprite) que salen del suelo, con grietas de tierra en la base.
        const k = G.U.clamp(f.t / f.fall, 0, 1);
        const out = k * (f.t > f.fall + 0.4 ? Math.max(0, 1 - (f.t - f.fall - 0.4) / 0.2) : 1);
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#3a250c';
        G.VFX.oval(ctx, f.x, f.y, f.r * (0.3 + k * 0.7), f.r * 0.6 * (0.3 + k * 0.7));
        ctx.globalAlpha = 1;
        const cv = G.VFX.sprite('stake', 'ground'), PXs = G.Sprites.PX;
        ctx.imageSmoothingEnabled = false;
        for (let s = 0; s < 9; s++) {
          const a = s * 2.399, d = f.r * (0.2 + 0.7 * ((s * 0.618) % 1)), sc = s % 3 ? 1 : 1.5, q = PXs * sc;
          const x = Math.round(f.x + Math.cos(a) * d), y = Math.round(f.y + Math.sin(a) * d * 0.6);
          const vis = Math.round((cv.height - 1) * out);            // cuánto ha salido (en píxeles de arte)
          if (vis <= 0) continue;
          ctx.fillStyle = '#3a250c';
          ctx.fillRect(x - q * 3, y - PXs, q * 6, PXs);             // grieta
          ctx.drawImage(cv, 0, 0, cv.width, vis, x - cv.width * q / 2, y - vis * q, cv.width * q, vis * q);
        }
      } else if (f.kind === 'mine') {
        const armed = f.t >= f.arm, blink = armed && Math.sin(now * 8 + f.x) > 0.3;
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.45, f.r * 0.28, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        G.VFX.draw(ctx, f.vis.proj, f.vis.pal, f.x, f.y - 4, { scale: 1, alpha: blink ? 1 : 0.75, frame: 0 });
      } else if (f.kind === 'meteor') {
        const k = G.U.clamp(f.t / f.fall, 0, 1);
        ctx.globalAlpha = 0.2 + k * 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.3 + k * 0.7), f.r * 0.6 * (0.3 + k * 0.7), 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = f.col; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.stroke();
      } else if (f.kind === 'turret') {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 11, 4.5, 0, 0, 6.2832); ctx.fill();
      } else if (f.kind === 'tornado') {
        ctx.globalAlpha = 0.28; ctx.fillStyle = '#0f2f78';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 1.1, f.r * 0.45, 0, 0, 6.2832); ctx.fill();
      } else if (f.kind === 'hole') {
        // Agujero negro: zona que atrae (aro de puntos) y el remolino en el centro.
        const grow = Math.min(1, f.t * 3), end = f.life - f.t < 0.5 ? 1 + (0.5 - (f.life - f.t)) * 0.8 : 1;
        ctx.globalAlpha = 0.18 * grow; ctx.fillStyle = '#14042a';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.5 * grow; ctx.fillStyle = '#8a3ce0';
        const n = 40, PXs = G.Sprites.PX;
        for (let k = 0; k < n; k++) {
          const a = k / n * 6.2832 + now * 0.8;
          ctx.fillRect(Math.round(f.x + Math.cos(a) * f.r), Math.round(f.y + Math.sin(a) * f.r * 0.6), PXs, PXs);
        }
        ctx.globalAlpha = 1;
        G.VFX.draw(ctx, 'hole', 'hole', f.x, f.y - 6, { scale: 2.2 * grow * end, frame: Math.floor(now * 10) });
      }
      ctx.restore();
    }
  }

  /** Lo de los campos que va por encima (meteoros cayendo, torretas). */
  function drawAirFields(ctx) {
    const now = performance.now() / 1000;
    for (const f of fields) {
      if (!G.Camera.sees(f.x, f.y, 200)) continue;
      if (f.kind === 'arrow') {
        // Flecha de píxeles con estela de cuadraditos (2026-10-17: antes, líneas lisas).
        ctx.save();
        f.trail.forEach(([x, y], k) => {
          const s = 2 + Math.round(k / 2) * 2;
          ctx.globalAlpha = 0.15 + 0.55 * (k / f.trail.length);
          ctx.fillStyle = k % 2 ? '#ff9fcf' : f.col;
          ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
        });
        ctx.restore();
        G.VFX.draw(ctx, 'psyarrow', 'psychic', f.x, f.y, { angle: f.ang, scale: 1.2 });
        continue;
      }
      if (f.kind === 'clay') {
        // Arcilla pegada (y en la evolucionada, el hilo de barro entre los pegados); parpadea antes de explotar.
        const vivos = f.stuck.filter(o => !o.dead);
        for (let k = 1; k < vivos.length; k++) {
          const a = vivos[k - 1], b = vivos[k], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.floor(d / 8));
          ctx.fillStyle = '#8e7a5a';
          for (let j = 1; j < n; j++) ctx.fillRect(Math.round(a.x + (b.x - a.x) * j / n) - 2, Math.round(a.y - a.bodyH * 0.5 + (b.y - b.bodyH * 0.5 - a.y + a.bodyH * 0.5) * j / n) - 2, 4, 4);
        }
        const left = f.fuse - f.t, blink = left < 0.9 && Math.floor(f.t * 14) % 2 === 0;
        for (const o of vivos) {
          const y = o.y - o.bodyH * 0.6 - (o.jumpLift || 0);
          G.VFX.draw(ctx, 'clay', 'rock', o.x, y, { scale: 1.5 });
          if (blink) { ctx.fillStyle = '#ff3a2a'; ctx.fillRect(Math.round(o.x) - 3, Math.round(y) - 14, 6, 6); }
        }
        continue;
      }
      if (f.kind === 'pillar') {
        // Puño de roca que sale del suelo (0,1 s), pega y se hunde enseguida (si se quedaba arriba
        // tapaba al que salía volando y parecía que el puño pegaba y el Pokémon no se movía).
        const k = f.t < 0.1 ? f.t / 0.1 : f.t > 0.3 ? Math.max(0, 1 - (f.t - 0.3) / 0.2) : 1;
        const H = 16 * G.Sprites.PX * 1.5;
        ctx.save();
        ctx.beginPath(); ctx.rect(f.x - 60, f.y - H - 10, 120, H + 12); ctx.clip();
        G.VFX.draw(ctx, 'pillar', 'ground', f.x, f.y + 2 + (1 - k) * H, { scale: 1.5, pivot: [8, 16] });
        ctx.restore();
        continue;
      }
      if (f.kind === 'wind') {
        // Muro de viento: remolinos de píxeles girando alrededor (más claros delante).
        for (let k = 0; k < 10; k++) {
          const a = k / 10 * 6.2832 + now * 1.6, x = f.x + Math.cos(a) * f.r, y = f.y - 10 + Math.sin(a) * f.r * 0.6;
          G.VFX.draw(ctx, 'wind', 'flying', x, y, { frame: (k + Math.floor(now * 8)) % 2, alpha: Math.sin(a) > 0 ? 0.66 : 0.33 });
        }
        continue;
      }
      if (f.kind === 'shade') {
        // Sombra de la Turbo Abuela (2026-10-20: dibujo en vfx-exclusive.js).
        G.ExVFX.drawShade(ctx, f, now);
        continue;
      }
      if (f.kind === 'tongue') {
        // Lengua de Lika: sale y vuelve (0,3 s) (2026-10-20: dibujo en vfx-exclusive.js).
        G.ExVFX.drawTongue(ctx, f, now);
        continue;
      }
      if (f.kind === 'heart') {
        const big = f.bounced === 1 && f.row.bmul > 1;
        G.VFX.draw(ctx, 'heart', 'fairy', f.x, f.y + Math.sin(f.t * 18) * 1.5, { scale: big ? 1.7 : 1.2 });
        continue;
      }
      if (f.kind === 'tornado') {
        const fade = Math.min(1, (f.life - f.t) * 4, f.t * 8);
        G.VFX.draw(ctx, 'tornado', 'water', f.x, f.y - 19 * f.row.size, { scale: f.row.size, frame: Math.floor(now * 14), alpha: fade });
        continue;
      }
      if (f.kind === 'storm') {
        // Esquirlas que giran alrededor de su dueño (dos anillos, a distinta velocidad).
        const fade = Math.min(1, (f.life - f.t) * 5, f.t * 10), evo = !!f.row.radial;
        const n = Math.round(8 + f.r / 16);
        for (let k = 0; k < n; k++) {
          const ring = k % 2, rr = f.r * (ring ? 0.55 : 0.9), dir = ring ? -1 : 1;
          const a = f.seed + k / n * 6.2832 + now * (ring ? 3.2 : 2.2) * dir;
          const x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr * 0.62 - 12 - Math.sin(a * 3 + now * 4) * 3;
          G.VFX.draw(ctx, 'mshard', evo && k % 3 === 0 ? 'fighting' : 'steel', x, y, { scale: 1.3, angle: a + now * 10, alpha: fade });
        }
        continue;
      }
      if (f.kind === 'hand') {
        // Mano azul que baja de golpe y se queda un momento.
        const k = G.U.clamp(f.t / 0.12, 0, 1);
        ctx.save();
        ctx.translate(f.x, f.y - (1 - k) * 40);
        if (f.flip) ctx.scale(-1, 1);
        G.VFX.draw(ctx, 'hand', 'water', 0, 0, { scale: 2, alpha: f.t > 0.35 ? 0.66 : 1, angle: k < 1 ? -0.39 : 0.0001 });
        ctx.restore();
        continue;
      }
      if (f.kind === 'rain') {
        // Lluvia (2026-10-16, en píxeles): nubes tóxicas encima y gotas-sprite que caen y
        // salpican al llegar al suelo (sobre el círculo, o sobre cada enemigo si evolucionó).
        const fade = Math.min(1, (f.life - f.t) * 3, f.t * 8), al = fade > 0.66 ? 1 : fade > 0.33 ? 0.66 : 0.33;
        const clouds = f.spots ? f.spots.slice(0, 8) : null;
        const nC = clouds ? clouds.length : Math.min(9, Math.max(3, Math.round(f.r / 32)));
        for (let c = 0; c < nC; c++) {
          const cx = clouds ? clouds[c][0] : f.x + (c - (nC - 1) / 2) * f.r * 1.6 / nC;
          const cy = (clouds ? clouds[c][1] : f.y - (c & 1) * 10) - 104;
          G.VFX.draw(ctx, 'cloud', 'poison', cx, cy - (1 - fade) * 10, { frame: Math.floor(now * 3 + c), alpha: al * 0.95 });
        }
        const n = f.spots ? f.spots.length * 2 : 46;
        for (let k = 0; k < n; k++) {
          const h = (Math.sin(k * 12.9898 + f.x) * 43758.5453) % 1, h2 = (Math.sin(k * 78.233 + f.y) * 12543.13) % 1;
          let x, y;
          if (f.spots) { const sp = f.spots[k >> 1]; x = sp[0] + h * 18; y = sp[1] + h2 * 10; }
          else { const a = h * 6.2832, d = Math.sqrt(Math.abs(h2)) * f.r; x = f.x + Math.cos(a) * d; y = f.y + Math.sin(a) * d * 0.7; }
          const ph = (f.t * 2.6 + Math.abs(h)) % 1;
          if (ph < 0.8) G.VFX.draw(ctx, 'acidrop', 'poison', x, y - 92 + ph / 0.8 * 88, { alpha: al });
          else G.VFX.draw(ctx, 'splash', 'poison', x, y - 2, { frame: Math.floor((ph - 0.8) / 0.2 * 3), alpha: al });
        }
        continue;
      }
      if (f.kind === 'tree' && f.t > 0) {
        // Árbol de píxel (sprite) que cae del cielo en diagonal girando hasta estrellarse.
        const k = G.U.clamp(f.t / f.fall, 0, 1), e = k * k;
        G.VFX.draw(ctx, 'tree', 'grass', f.x - (1 - e) * 150, f.y - (1 - e) * 150 - 18,
                   { pivot: [13, 13], angle: -1.1 + e * 1.5, step: Math.PI / 16, scale: f.r > 60 ? 1.5 : 1 });
        continue;
      }
      if (f.kind === 'meteor' && f.t > 0) {
        const k = G.U.clamp(f.t / f.fall, 0, 1);
        G.VFX.draw(ctx, f.vis.proj, f.vis.pal, f.x + (1 - k) * 40, f.y - (1 - k) * 170 - 6,
                   { scale: 1.5, angle: Math.atan2(170, -40), frame: Math.floor(now * 12) });
      } else if (f.kind === 'turret') {
        const fade = Math.min(1, (f.life - f.t) * 2, f.t * 5);
        const bob = Math.sin(now * 4 + f.x) * 2 - (f.kick > 0 ? 2 : 0);
        G.VFX.draw(ctx, f.vis.proj, f.vis.pal, f.x, f.y - 16 + bob, { scale: 1.5, alpha: fade, frame: Math.floor(now * 8) });
      }
    }
  }

  function clearFields(owner) {
    fields = owner ? fields.filter(f => f.owner !== owner) : [];
    for (const [e, L] of lifts) if (!owner || L.owner === owner) { if (!isFoe(e)) e.jumpLift = 0; lifts.delete(e); }
    if (owner) { for (const [e, d] of dots) if (d.owner === owner) dots.delete(e); } else dots = new Map();
  }

  function orbit(pl, m, dt, now, isGhost = false) {
    const col = G.U.TYPE_COLOR[m.type];
    const want = Math.max(1, m.count | 0);
    // Cada movimiento de órbita tiene sus orbes (puede haber dos en un vínculo).
    const mine = p => p.orb && p.owner === pl && p.mid === m.id;
    const orbs = G.Projectiles.all().filter(mine);
    // Si cambia el número de orbes (al mejorar el movimiento), se reparten
    // todos por igual a partir de donde va el primero, sin saltos.
    const relayout = orbs.length !== want;
    const base = orbs.length ? orbs[0].oa : now * m.speed;
    if (orbs.length > want) for (const p of orbs.slice(want)) G.Projectiles.remove(p);

    for (let i = orbs.length; i < want; i++) {
      G.Projectiles.spawnOrb({
        owner: pl, ghost: isGhost, mid: m.id,
        x: pl.x, y: pl.y, r: m.size, color: col, vis: G.VFX.forMove(m),
        dmg: m.dmg * pl.atk,
        oa: (i / want) * 6.2832, orad: m.radius, ospeed: m.speed,
        rehit: Math.max(0.12, m.cd),
        knock: m.knock || 0, burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, mtype: m.type
      });
    }
    const live = G.Projectiles.all().filter(mine);
    live.forEach((p, i) => {
      p.dmg = m.dmg * pl.atk;
      p.orad = m.radius;
      p.ospeed = m.speed;
      p.r = m.size;
      if (relayout) p.oa = base + (i / live.length) * 6.2832;
    });

    // Animación de concentración de vez en cuando, para que se note vivo.
    pl.orbCastT = (pl.orbCastT || 0) - dt;
    if (pl.orbCastT <= 0) { pl.orbCastT = 1.6; pl.cast({ kind: 'orbit', cd: 1.6 }); }
  }

  /** Repite el ataque de un compañero sólo para verlo (sin daño). */
  function ghostCast(pl, id, lvl, aim, evolved) {
    const def = G.Moves.BY_ID[id];
    if (!def || def.kind === 'orbit') return;
    const m = G.Moves.instance(id, lvl);
    if (evolved) G.Moves.evolve(m);
    pl.aim = aim;
    ghost = true; ghostOwner = pl;
    try {
      pl.cast(m);
      run(pl, m);
    } finally { ghost = false; ghostOwner = null; }
  }

  /** Orbes de un compañero que tiene activo un movimiento de órbita (sólo visual). */
  function ghostOrbit(pl, dt, now) {
    const m = pl.activeMove();
    if (m && m.kind === 'orbit' && !pl.dead) orbit(pl, m, dt, now, true);
    else if (G.Projectiles.all().some(p => p.orb && p.owner === pl)) G.Projectiles.clearOrbs(pl);
  }

  // Golpe crítico (Mejoras → Golpe Crítico): x1,5 de daño, número naranja y grande.
  const CRIT_MUL = 1.5;
  const isCrit = pl => !ghost && pl.critChance > 0 && Math.random() < pl.critChance;

  /** @param opt  { crit: forzar sí/no, cmul: multiplicador del crítico } (Puño Lee y los estados) */
  function hit(pl, e, dmg, col, dx, dy, knock, m, opt) {
    const dmg0 = dmg;
    if (isFoe(e)) {
      if (ghost) return;
      const crit = opt && opt.crit != null ? opt.crit : isCrit(pl);
      G.PvP.deal(pl, e, dmg * (crit ? (opt && opt.cmul) || pl.critMul || CRIT_MUL : 1), m.type, crit, m.kind);
      return;
    }
    let k = typeK(m.type, e);
    if (m.superVs && e.types.includes(m.superVs)) k = Math.max(1, k) * 2;     // Liofilización contra Agua
    const crit = !ghost && (opt && opt.crit != null ? opt.crit
      : m.critBonus ? Math.random() < (pl.critChance || 0) + m.critBonus : isCrit(pl));
    dmg *= k * (crit ? (opt && opt.cmul) || pl.critMul || CRIT_MUL : 1) * itemK(pl, m.type, e);
    if (pl.megaAb || m.mega) dmg *= G.MegaAb.dmgK(pl, m);
    if (pl.k6) dmg *= G.Stats6.atkK(pl, m);                       // físico / especial (stats6.js)
    dmg *= G.Stats6.foeK(e, m);                                   // y la Defensa / Defensa Esp. del enemigo         // Megaevolución: habilidad y movimiento despertado (megaability.js)
    if (G.Arts.zeroed()) { G.Arts.miss(e); return; }          // Dados del Doble o Nada: este golpe no hace nada
    e.hurt(dmg, col, dx, dy, knock, crit ? 'crit' : G.Types.label(G.Types.mult(m.type, e.types)));
    if (!ghost) pl.onDealt(dmg);
    pl.dmgDealt += dmg;
    if (m.burn) e.applyBurn(m.burn);
    if (m.poison) e.applyPoison(m.poison);
    if (m.slow) e.applySlow(m.slow);
    if (!ghost && (m.rootCh || m.weakCh)) extraFx(e, m.rootCh, m.rootT, m.weakCh);
    if (!ghost) G.Arts.onHit(pl, e);               // Equipo de Shixin: quema
    if (!ghost && pl.gmaxT > 0) G.MaxMoves.onHit(pl, e, m);   // Gigamax: su «Maxi» del tipo (maxmoves.js)
    // Amor Filial (Mega Kangaskhan): a veces pega otra vez, a la mitad.
    if (!ghost && pl.megaAb && !m.maxFx && !(opt && opt.again) && !e.dead && G.MegaAb.again(pl)) hit(pl, e, dmg0 * 0.5, col, dx, dy, 0, m, { again: true });
  }

  /**
   * Objetos que tocan cada golpe (2026-10-15): Cinta Experto (+30 % si es muy eficaz) y
   * Roca del Rey (10 %: el enemigo normal retrocede, inmovilizado 0,6 s).
   */
  function itemK(pl, type, e) {
    if (ghost) return 1;
    // Reliquia Frasco de Ponzoña (torre): +15 % a los quemados o envenenados.
    const venom = pl.relicVenom && (e.burn > 0 || e.poison > 0) ? 1.15 : 1;
    if (!pl.items || !pl.items.length) return venom;
    if (pl.hasItem('kingsrock') && !e.boss && Math.random() < 0.1) {
      e.applyRoot(0.6);
      if (G.Camera.sees(e.x, e.y, 20)) G.FX.ring(e.x, e.y, 4, 22, '#9aa6b5', 0.3, 2);
    }
    return venom * G.Arts.diceK(pl) * (pl.hasItem('expertbelt') && type && G.Types.mult(type, e.types) > 1 ? 1.3 : 1);
  }

  // ---------------- colisiones ----------------

  /** Distancia² del punto (cx, cy) al segmento (ax, ay)-(bx, by). */
  function segDist2(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - cx, qy = ay + dy * t - cy;
    return qx * qx + qy * qy;
  }

  // Tus disparos atraviesan los cofres (2026-10-15: "el cofre tapa los ataques"; el grande con
  // candado no se rompe y se tragaba todo). Al pequeño se le sigue haciendo daño al pasar.
  // Andando siguen siendo sólidos, y los disparos enemigos siguen chocando (sirven de cobertura).
  const SHOOT_THROUGH = new Set(['chest', 'bigchest']);
  function resolve(dt, pl, now) {
    const projectiles = G.Projectiles.all();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];

      // --- disparos enemigos: paredes y objetos sólidos dan cobertura ---
      if (!p.friendly) {
        // Viento Planetario (V3.1): los proyectiles que entran en el muro se deshacen.
        if (pl.windUntil > G.Game.st.time && !pl.dead && G.U.dist2(p.x, p.y, pl.x, pl.y) < pl.windR * pl.windR) {
          G.FX.sp('wind', 'flying', p.x, p.y - G.LIFT, { life: 0.2 });
          projectiles.splice(i, 1);
          continue;
        }
        if (G.World.projectileBlock(p.x, p.y, p.r)) {
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 70);
          projectiles.splice(i, 1);
          continue;
        }
        if (G.U.dist2(p.x, p.y, pl.x, pl.y) < (p.r + pl.r) * (p.r + pl.r)) {
          // Hígado del Ingeniero (artefacto): los proyectiles no te hacen nada.
          if (pl.hasItem('liver') && !pl.dead) G.Arts.blocked(pl);
          else pl.hurt(p.dmg, p.mtype, 's');                   // disparo: Defensa Esp.
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 7, 110);
          projectiles.splice(i, 1);
        }
        continue;
      }

      // --- disparos de jugadores ---
      // Orbes de un compañero: sólo se ven (en PK, te golpean).
      if (p.orb && p.ghost) continue;
      // PK: el disparo de otro jugador que llega hasta ti se deshace (el daño lo decide quien dispara).
      if (p.ghost && !p.orb && G.PvP.on && G.PvP.touchesMe(p)) {
        G.FX.burst(p.x, p.y - G.LIFT, p.color, 6, 90);
        projectiles.splice(i, 1);
        continue;
      }
      if (!p.orb) {
        const block = G.World.projectileBlock(p.x, p.y, p.r);
        if (block === 'wall' || (block && !block.destructible && !SHOOT_THROUGH.has(block.type))) {
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
          projectiles.splice(i, 1);
          continue;
        }
      }

      // Objetos del escenario (rocas, cofres, hierba).
      let consumed = false;
      for (const prop of G.World.propsInCircle(p.x, p.y, p.r)) {
        if (p.orb) {
          const k = 'p' + prop.id, last = p.hitLog.get(k) || -99;
          if (now - last < p.rehit) continue;
          p.hitLog.set(k, now);
          G.World.damageProp(prop, p.dmg, p.color);
          continue;
        }
        if (p.phits.has(prop.id)) continue;
        p.phits.add(prop.id);
        if (!p.ghost) G.World.damageProp(prop, p.dmg, p.color);
        // La hierba no frena; lo sólido sí gasta perforación (los cofres, no: ver SHOOT_THROUGH).
        if (prop.solid && !SHOOT_THROUGH.has(prop.type)) {
          if (p.pierce > 0) p.pierce--;
          else { consumed = true; break; }
        }
      }
      if (consumed) {
        G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
        projectiles.splice(i, 1);
        continue;
      }

      // Enemigos. Colisión BARRIDA: se comprueba todo el tramo recorrido en este
      // fotograma, no sólo el punto final. Un Impactrueno avanza 8 unidades por
      // fotograma: sin esto atravesaba a los enemigos pegados al jugador, que
      // eran inmunes a todos los movimientos de proyectil.
      const sx = p.orb || p.px == null ? p.x : p.px, sy = p.orb || p.py == null ? p.y : p.py;
      const half = Math.hypot(p.x - sx, p.y - sy) / 2;
      for (const e of enemiesIn((sx + p.x) / 2, (sy + p.y) / 2, half + p.r)) {
        if (segDist2(sx, sy, p.x, p.y, e.x, e.y) > (p.r + e.r) * (p.r + e.r)) continue;
        // PK: un disparo nunca choca con quien lo lanzó, y uno repetido (fantasma) no choca con
        // otros jugadores (si no, el del rival se deshacía nada más salir y no se veía).
        if (isFoe(e) && (e === p.owner || p.ghost)) continue;
        if (p.orb) {
          const last = p.hitLog.get(e.id) || -99;
          if (now - last < p.rehit) continue;
          p.hitLog.set(e.id, now);
          // Las órbitas duran toda la partida: se olvidan los golpes viejos.
          if (p.hitLog.size > 300) for (const [k, t] of p.hitLog) if (now - t > p.rehit) p.hitLog.delete(k);
        } else {
          if (p.hits.has(e.id)) continue;
          p.hits.add(e.id);
        }

        // Disparo fantasma de un compañero: choca y se ve, pero no daña.
        if (p.ghost) {
          G.FX.sp('impact', p.vis ? p.vis.pal : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.12, scale: 1 });
          if (p.split && p.pierce > 0) splitSpear(p, e);
          if (p.split90) { const left = p.split90 - 1; p.split90 = 0; splitBlade(p, e, left); }
          if (p.grow) dragonHit(p, e, false);                    // (se ve crecer también en el fantasma)
          if (p.pierce > 0) { p.pierce--; continue; }
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
          projectiles.splice(i, 1);
          break;
        }

        if (isFoe(e)) {
          const crit = isCrit(pl);
          G.PvP.deal(pl, e, p.dmg * (crit ? pl.critMul || CRIT_MUL : 1), p.mtype, crit);
          if (!p.orb) {
            if (p.pierce > 0) { p.pierce--; continue; }
            G.FX.burst(p.x, p.y - G.LIFT, p.color, 6, 90);
            projectiles.splice(i, 1);
            break;
          }
          continue;
        }
        const crit = isCrit(pl);
        // El movimiento que lo lanzó (los de órbita sólo llevan `mid`): para la Megaevolución y el Gigamax,
        // que antes sólo miraban Combat.hit y los disparos se los saltaban (2026-10-19).
        const src = p.src || (p.mid && pl.moves.find(x => x.id === p.mid)) || null;
        const k = (p.mtype ? typeK(p.mtype, e) : 1) * (crit ? pl.critMul || CRIT_MUL : 1) * itemK(pl, p.mtype, e)
                * (src && (pl.megaAb || src.mega) ? G.MegaAb.dmgK(pl, src) : 1)
                * (src && pl.k6 ? G.Stats6.atkK(pl, src) : 1)             // físico / especial (stats6.js)
                * (src ? G.Stats6.foeK(e, src) : 1);                       // y la defensa del enemigo
        if (G.Arts.zeroed()) G.Arts.miss(e);                   // Dados: el disparo no hace nada (pero choca igual)
        else {
          e.hurt(p.dmg * k, p.color, p.vx || (e.x - pl.x), p.vy || (e.y - pl.y), p.knock,
                 crit ? 'crit' : p.mtype ? G.Types.label(G.Types.mult(p.mtype, e.types)) : null);
          if (Math.random() < 0.5) G.FX.sp('impact', p.vis ? p.vis.pal : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.12, scale: 1 });
          pl.dmgDealt += p.dmg * k;
          pl.onDealt(p.dmg * k);
          if (p.burn) e.applyBurn(p.burn);
          if (p.poison) e.applyPoison(p.poison);
          if (p.slow) e.applySlow(p.slow);
          if (p.rootCh || p.weakCh) extraFx(e, p.rootCh, p.rootT, p.weakCh);
          G.Arts.onHit(pl, e);
          if (p.zap && !p.ghost) zapAround(p, e, pl);          // Boniato evolucionado
          if (p.grow || p.conf) dragonHit(p, e, e.dead);          // Esfera Dragón de Ocho Escamas (V3.1)
          if (src && pl.gmaxT > 0) G.MaxMoves.onHit(pl, e, src);              // Gigamax (maxmoves.js)
          if (src && pl.megaAb && !e.dead && G.MegaAb.again(pl)) {                       // Amor Filial
            e.hurt(p.dmg * k * 0.5, p.color, p.vx || (e.x - pl.x), p.vy || (e.y - pl.y), 0, null);
            pl.dmgDealt += p.dmg * k * 0.5; pl.onDealt(p.dmg * k * 0.5);
          }
        }

        if (!p.orb) {
          if (p.split && p.pierce > 0) splitSpear(p, e);   // Lanza Sombría: se parte al perforar
          if (p.split90) { const left = p.split90 - 1; p.split90 = 0; splitBlade(p, e, left); }   // Cruzada: se parte a ±90° en el primero
          if (p.pierce > 0) { p.pierce--; }
          else {
            G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
            projectiles.splice(i, 1);
            break;
          }
        }
      }
    }

    // --- contacto enemigo <-> jugador ---
    if (pl.dead) return;
    for (const e of enemiesIn(pl.x, pl.y, pl.r + 40)) {
      if (isFoe(e)) continue;      // PK: el rival no tiene daño por contacto (antes: e.strike no existe y fallaba cada fotograma)
      if (e.disabled) continue;    // confundido, congelado o atrapado (V3.1): no pega
      // Fantasma de Hielo (artefacto, 2026-10-17): lo atraviesas sin daño y se queda congelado (el jefe, frenado).
      if (pl.hasItem('iceghost')) {
        if (e.touchCd > 0 || e.dmg <= 0 || G.U.dist2(e.x, e.y, pl.x, pl.y) > (e.r + pl.r) * (e.r + pl.r)) continue;
        const ig = G.Items.ART.iceghost;
        e.touchCd = ig.cd;
        if (e.boss) e.applySlow(0.5, ig.freeze); else e.applyRoot(ig.freeze);
        G.Arts.frozen(e, ig.freeze);
        continue;
      }
      // Shaq (Peso Pesado evolucionado): los enemigos normales no pueden tocarte: se quedan
      // fuera del campo (el anillo que se dibuja en player.js) y rebotan. Los jefes y los disparos sí.
      // (2026-10-15: antes sólo los apartaba hasta tocarte el cuerpo y parecía que no hacía nada.)
      if (pl.bulkField && !e.boss) {
        const dx = e.x - pl.x, dy = e.y - pl.y, d = Math.max(1, Math.hypot(dx, dy)), min = pl.r + FIELD_R + e.r;
        if (d < min && !e.remote) {
          const x = pl.x + dx / d * min, y = pl.y + dy / d * min;
          if (!G.World.isWall(x, y)) { e.x = x; e.y = y; }
          e.kx += dx / d * 120; e.ky += dy / d * 120;
        }
        continue;
      }
      if (G.U.dist2(e.x, e.y, pl.x, pl.y) > (e.r + pl.r) * (e.r + pl.r)) continue;
      if (e.touchCd > 0 || e.behavior === 'thief' || e.dmg <= 0) continue;     // (los Magikarp de la migración no pegan)
      e.touchCd = 0.55;
      e.strike(pl);
      // Peso Pesado: la armadura quita parte del daño de los choques.
      pl.hurt(e.dmg * (1 - (pl.bulkArmor || 0)), e.atkType, 'p');   // contacto: Defensa
      // Poción de gigante: aplastas a los que te tocan (y salen despedidos).
      if (pl.giant && !e.boss) e.hurt((20 + pl.level * 4) * pl.atk / Math.max(1, pl.baseAtk), '#ff7b3d', e.x - pl.x, e.y - pl.y, 320);
      // Casco Dentado: crece con tu ataque (antes se quedaba corto al final de la run).
      if (pl.hasItem('rockyhelmet')) e.hurt((15 + pl.level * 4) * pl.atk / Math.max(1, pl.baseAtk), '#9aa6b5', e.x - pl.x, e.y - pl.y, 80);
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      e.kx += nx * 150; e.ky += ny * 150;
    }
  }

  /** Golpe de un efecto de fuera (maxmoves.js), con el tipo, objetos y críticos de siempre. */
  const hitBy = (pl, e, dmg, m, knock = 0, fx = pl.x, fy = pl.y) => hit(pl, e, dmg, G.U.TYPE_COLOR[m.type], e.x - fx, e.y - fy, knock, m);

  return { hitBy, artDot, supportHeal, beamImmune, netFx, tick, resolve, ghostCast, ghostOrbit, updateFields, drawGroundFields, drawAirFields, clearFields,
           get fieldCount() { return fields.length; } };
})();
