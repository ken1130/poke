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
  let fields = [];

  // ---------------- ejecutar el movimiento activo ----------------

  function tick(dt, pl, now) {
    if (pl.dead) return;
    // Vínculos: todos los movimientos del hueco activo, cada uno con su recarga.
    const group = pl.activeGroup();
    // Durmiendo (Descanso) no se ataca; los de apoyo y pasivos siguen.
    if (!(pl.sleepT > 0)) for (const m of group) tickMove(dt, pl, m, now);
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
        && !(G.PvP.on && G.PvP.foe(pl, reach(m) + (G.PvP.aiming ? 160 : 0)))) {   // apuntando: dispara si hay un rival cerca
      m.t = 0.05;
      return;
    }
    const row = G.Moves.stat(m);
    m.t = Math.max(0.05, ((row && row.cd) || m.cd) * pl.cdMul);
    // Los pasivos no hacen animación ni se mandan a los demás (sólo cuenta su efecto).
    if (!G.Moves.isPassive(m)) {
      pl.cast(m);
      if (G.Coop.active) G.Coop.cast(pl, m);
    }
    // Vínculo: su icono destella en el HUD al lanzarse (uno que explota pegado al
    // enemigo, como Ascuas tras Ataque Rápido, casi no se ve).
    m.castAt = performance.now();

    run(pl, m);
  }

  function run(pl, m) {
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
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) if (!e.dead) map.set(e, now + row.dur);
    for (const [e, until] of map) {
      if (e.dead || until < now || !G.EnemyMgr.get(e.id)) { map.delete(e); continue; }
      if (row.vuln) e.vulnUntil = now + 0.6;
      hit(pl, e, row.dps * 0.5 * pl.atk, col, 0, 0, 0, m);
      if (Math.random() < 0.5 && G.Camera.sees(e.x, e.y, 20)) G.FX.burst(e.x, e.y - e.bodyH * 0.6, '#ff8a3d', 2, 40);
    }
    // El aro de fuego a tu alrededor, de vez en cuando.
    pl.fsRing = (pl.fsRing || 0) + 1;
    if (pl.fsRing % 3 === 0) G.FX.ring(pl.x, pl.y, R * 0.55, R, col, 0.4, 2);
  }

  /** Un rayo que cae del cielo en (x, y). */
  function boltFx(x, y, vis) {
    G.FX.beam(x, y - 300, Math.PI / 2, 300, 7, '#ffe14d', vis);
    G.FX.burst(x, y - 6, '#fff3a0', 10, 140);
    G.FX.ring(x, y, 4, 26, '#ffe14d', 0.25, 3);
  }

  /**
   * Caída de Rayo: `n` rayos sobre enemigos al azar a menos de `r` casillas (cada
   * uno salpica 0,75 casillas). Evolucionado: descargas entre un rayo y el siguiente
   * durante 1 s que hacen `link` de daño por segundo a lo que crucen.
   */
  function lightning(pl, m) {
    const row = G.Moves.stat(m), R = row.r * TILE, vis = G.VFX.forMove(m), col = G.U.TYPE_COLOR.electric;
    const pool = G.EnemyMgr.queryCircle(pl.x, pl.y, R).filter(e => !e.dead);
    if (!pool.length) return;
    const pts = [];
    for (let i = 0; i < row.n; i++) {
      // Sin repetir mientras haya enemigos distintos; si hay menos que rayos, repiten.
      const k = i < pool.length ? i + Math.floor(Math.random() * (pool.length - i)) : Math.floor(Math.random() * pool.length);
      if (i < pool.length) [pool[i], pool[k]] = [pool[k], pool[i]];
      const t = pool[i < pool.length ? i : k];
      pts.push({ x: t.x, y: t.y });
      boltFx(t.x, t.y, vis);
      if (!ghost) for (const e of G.EnemyMgr.queryCircle(t.x, t.y, TILE * 0.75)) if (!e.dead) hit(pl, e, row.dmg * pl.atk, col, 0, 0, 0, m);
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
    const near = G.EnemyMgr.queryCircle(pl.x, pl.y, R).filter(e => !e.dead)
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
    if (!e || e.dead || !G.EnemyMgr.get(e.id)) { e = f.target = nextArrowTarget(f, f.x, f.y, null); if (!e) return false; }
    const tx = e.x, ty = e.y - e.bodyH * 0.5;
    const d = Math.hypot(tx - f.x, ty - f.y);
    f.ang = Math.atan2(ty - f.y, tx - f.x);
    f.trail.push([f.x, f.y]); if (f.trail.length > 6) f.trail.shift();
    if (d > SPEED * dt + e.r * 0.5) { f.x += Math.cos(f.ang) * SPEED * dt; f.y += Math.sin(f.ang) * SPEED * dt; return true; }
    // Llega: golpea y salta.
    f.x = tx; f.y = ty;
    if (!f.ghost) hit(f.owner, e, (f.first ? f.d1 : f.d2) * f.owner.atk, f.col, Math.cos(f.ang), Math.sin(f.ang), 0, f.m);
    G.FX.burst(tx, ty, f.col, 6, 90);
    f.hit.add(e.id); f.first = false;
    if (f.hops-- <= 0) return false;
    f.target = nextArrowTarget(f, e.x, e.y, e);
    return !!f.target;
  }

  function nextArrowTarget(f, x, y, cur) {
    let best = null, bd = ARROW_HOP * ARROW_HOP;
    for (const e of G.EnemyMgr.queryCircle(x, y, ARROW_HOP)) {
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
    const row = G.Moves.stat(m), R = row.r * TILE, vis = G.VFX.forMove(m), col = '#c47bff';
    const list = G.EnemyMgr.queryCircle(pl.x, pl.y, R).filter(e => !e.dead)
      .sort((a, b) => G.U.dist2(a.x, a.y, pl.x, pl.y) - G.U.dist2(b.x, b.y, pl.x, pl.y)).slice(0, row.n);
    if (!list.length) return;
    for (const e of list) {
      const a = Math.atan2(pl.y - e.y, pl.x - e.x), d = Math.hypot(pl.x - e.x, pl.y - e.y);
      if (G.Camera.sees(e.x, e.y, 20)) G.FX.beam(e.x, e.y - e.bodyH * 0.5, a, d, 3, col, vis);
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
      if (e.dead || !d.owner || !G.EnemyMgr.get(e.id)) { dots.delete(e); continue; }
      const pl = d.owner;
      let alive = false;
      if (d.pUntil > now) {
        alive = true;
        hit(pl, e, d.pDps * 0.5 * pl.atk, '#c46cf0', 0, 0, 0, d.pm, NOCRIT);
        if (!e.dead && d.slow) e.applySlow(d.slow, 0.7);
      }
      if (d.bleed && !e.dead) {
        alive = true;
        hit(pl, e, d.bleed * 0.5 * pl.atk, '#e0303a', 0, 0, 0, d.bm, NOCRIT);
        if (Math.random() < 0.5 && G.Camera.sees(e.x, e.y, 20)) G.FX.burst(e.x, e.y - e.bodyH * 0.6, '#e0303a', 2, 40);
      }
      if (d.drip > now && !e.dead) {
        alive = true;
        if (!d.lx || G.U.dist2(d.lx, d.ly, e.x, e.y) > 26 * 26) { d.lx = e.x; d.ly = e.y; addPuddle(pl, d.pm, d.prow, e.x, e.y, 3, false); }
      }
      if (!alive) dots.delete(e);
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
    const list = G.EnemyMgr.queryCircle(pl.x, pl.y, R).filter(e => !e.dead);
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
    const list = G.EnemyMgr.queryCircle(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl)).slice(0, row.n || 1);
    if (!list.length) return;
    m.punches = (m.punches || 0) + 1;
    const sure = m.punches % row.every === 0;
    for (const e of list) {
      const a = Math.atan2(e.y - pl.y, e.x - pl.x);
      if (G.Camera.sees(e.x, e.y, 20)) {
        G.FX.sp('impact', 'fighting', e.x, e.y - e.bodyH * 0.5, { life: 0.16, scale: sure ? 2.2 : 1.4 });
        if (row.n) G.FX.beam(pl.x, pl.y - G.LIFT * 0.5, a, Math.hypot(e.x - pl.x, e.y - pl.y), 2, col, G.VFX.forMove(m));
      }
      if (ghost) continue;
      const crit = sure || Math.random() < row.crit + (pl.critChance || 0);
      hit(pl, e, row.dmg * pl.atk, col, Math.cos(a), Math.sin(a), row.knock || 0, m, { crit, cmul: row.cmul });
      if (crit && row.bleed && !e.dead) { const d = dotOf(pl, e); d.bleed = row.bleed; d.bm = m; }
    }
    if (!row.n) G.FX.spark(pl.x, pl.y - G.LIFT * 0.5, col, Math.cos(pl.aim), Math.sin(pl.aim), 3);
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
    if (row.field) {
      pl.fieldFx = (pl.fieldFx || 0) + 1;
      if (pl.fieldFx % 3 === 0) G.FX.ring(pl.x, pl.y, pl.r + 10, pl.r + 22, '#ffe9a0', 0.5, 2);
    }
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
    const o = { dmg: row.dmg * pl.atk, r: 8 * row.size, scale: 1.6 * row.size, life: row.r * TILE / SPEAR_SPEED,
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
      spearProj(p.owner, e.x, e.y, a + s, { dmg: p.sdmg, r: 6, scale: 1.1, life: 0.55, pierce: 1, vis: p.vis,
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
    const list = G.EnemyMgr.queryCircle(pl.x, pl.y, R).filter(e => !e.dead).sort(byDist(pl));
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
      const ev = ['sh', Math.round(pl.x), Math.round(pl.y), frac, r];
      if (G.Coop.isHost) G.Coop.broadcast(ev); else G.Coop.toHost(ev);
    }
  }
  /** Cooperativo: un compañero ha curado en (x, y): si estás cerca, te cura a ti. */
  function supportHeal(x, y, frac, r) {
    const pl = G.Game.player;
    if (!pl || pl.dead || G.U.dist2(pl.x, pl.y, x, y) > r * r) return;
    const before = pl.hp;
    pl.heal(pl.maxHp * frac);
    healText(pl, pl.hp - before, '#9fe0ff');
  }

  function support(dt, pl, m) {
    if (ghost || pl.dead) return;
    const row = G.Moves.stat(m);
    m.cd = row.cd;                                   // (la barra de recarga del HUD)
    if (m.t > 0) m.t -= dt;
    const ready = m.t <= 0, cd = row.cd * pl.cdMul;
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
        for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 90)) if (!e.dead) near++;
        if (near >= row.n || pl.hp < pl.maxHp * 0.4) {
          m.t = cd; pl.protectT = row.dur; pl.invuln = Math.max(pl.invuln || 0, row.dur);
          G.Audio.sfx('select');
          G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, G.T('¡Protección!'), '#7dffb0', true);
          if (row.blast) {
            G.FX.ring(pl.x, pl.y, 10, 200, '#7dffb0', 0.5, 5);
            for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 200)) if (!e.dead && !e.boss) e.hurt(1, '#7dffb0', e.x - pl.x, e.y - pl.y, 520);
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
                    'acidrain', 'fist', 'spear', 'treefall'];
  function needsTarget(m) { return TARGETED.includes(m.kind); }
  function reach(m) {
    if (m.kind === 'melee') return m.radius + 30;
    if (m.kind === 'beam') return m.radius + 20;
    if (m.kind === 'boomerang') return m.radius + 40;
    if (m.kind === 'chain') return 280;
    if (m.kind === 'meteor') return 340;
    if (m.kind === 'dash') return m.radius + 60;
    if (['lightning', 'drain', 'psyarrow', 'acidrain', 'fist', 'spear', 'treefall'].includes(m.kind)) return G.Moves.stat(m).r * 32;
    if (m.kind === 'cone') return m.speed * m.life + 30;
    return 520;
  }

  function payload(m) {
    return { burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, mtype: m.type,
             rootCh: m.rootCh || 0, rootT: m.rootT || 0, weakCh: m.weakCh || 0 };
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

    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
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
    for (const e of G.EnemyMgr.queryCircle(mx, my, len / 2 + w)) {
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
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
      hit(pl, e, m.dmg * pl.atk, col, e.x - pl.x, e.y - pl.y, 0, m);
      if (m.drain) healed += m.drain;
    }
    for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, m.dmg * pl.atk, col);
    if (healed > 0) pl.heal(Math.min(healed, 6));
  }

  function buff(pl, m) {
    pl.addBuff(m.stat, m.amount, m.dur, m.stacks | 0);
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
    const n = Math.max(1, m.count | 0), spread = m.spread || 0.5;
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
    if (!cur) return;
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
      for (const e of G.EnemyMgr.queryCircle(cur.x, cur.y, m.radius)) {
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
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, d = n === 1 ? 0 : G.U.rand(18, 46);
      fields.push({ kind: 'mine', owner: pl, ghost, m, col, vis, x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d * 0.8,
                    t: 0, arm: 0.35, life: m.dur || 7, r: m.radius, dmg: m.dmg * pl.atk });
    }
    // Como mucho unas pocas por jugador: las más viejas se van.
    const mine = fields.filter(f => f.kind === 'mine' && f.owner === pl);
    for (const f of mine.slice(0, Math.max(0, mine.length - (4 + n * 2)))) f.gone = true;
  }

  /** Meteoros: caen del cielo sobre enemigos cercanos (la sombra avisa dónde). */
  function meteors(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0);
    const near = G.EnemyMgr.queryCircle(pl.x, pl.y, reach(m)).filter(e => !e.dead);
    G.U.shuffle ? G.U.shuffle(near) : near.sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const e = near[i];
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
    for (const e of G.EnemyMgr.queryCircle(mx, my, len / 2 + w)) {
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
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, r)) hit(pl, e, f.dmg * k, f.col, e.x - f.x, e.y - f.y, m.knock || 0, m);
    for (const p of G.World.propsInCircle(f.x, f.y, r)) G.World.damageProp(p, f.dmg * k, f.col);
  }

  function updateFields(dt) {
    tickDots(dt);
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      f.t += dt;
      if (f.gone || !f.owner || (f.life && f.t >= f.life && f.kind !== 'mine')) { fields.splice(i, 1); continue; }
      if (f.kind === 'mine') {
        const armed = f.t >= f.arm;
        const trig = armed && G.EnemyMgr.queryCircle(f.x, f.y, 14).length > 0;
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
          const tg = G.Projectiles.nearest(G.EnemyMgr.all(), f.x, f.y, m.range || 300);
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
      } else if (f.kind === 'link') {
        // Descargas entre los rayos (Tormenta Eléctrica): cada 0,2 s, a lo que esté en la línea.
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.2;
          for (let k = 1; k < f.pts.length; k++) {
            const a = f.pts[k - 1], b = f.pts[k];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            if (G.Camera.sees(a.x, a.y, len)) G.FX.beam(a.x, a.y - 8, Math.atan2(b.y - a.y, b.x - a.x), len, 3, '#bfe8ff', f.vis);
            if (f.ghost) continue;
            for (const e of G.EnemyMgr.queryCircle((a.x + b.x) / 2, (a.y + b.y) / 2, len / 2 + 16)) {
              if (!e.dead && segDist2(a.x, a.y, b.x, b.y, e.x, e.y) <= (14 + e.r) ** 2) hit(f.owner, e, f.dmg, f.col, 0, 0, 0, f.m);
            }
          }
        }
      } else if (f.kind === 'puddle') {
        // Charco de Lluvia Corrosiva: cada 0,5 s, a lo que lo pise.
        f.tick -= dt;
        if (f.tick <= 0 && !f.ghost) {
          f.tick = 0.5;
          for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
            if (e.dead) continue;
            if (f.row.pud >= 2) poisonWith(f.owner, e, f.row, f.m); else e.applySlow(f.row.slow, 0.7);
            if (f.row.spread && !e.boss) { const d = dotOf(f.owner, e); d.drip = G.Game.st.time + f.row.spread; d.prow = f.row; d.pm = f.m; }
          }
        }
      } else if (f.kind === 'tree') {
        if (f.t >= f.fall) {
          G.FX.ring(f.x, f.y, 4, f.r, '#97e36c', 0.35, 4);
          G.FX.burst(f.x, f.y - 6, '#45b23c', 14, 170);
          G.FX.burst(f.x, f.y - 4, '#8a5a2b', 6, 120);
          if (G.Camera.sees(f.x, f.y, 40)) { G.Audio.sfx('break'); G.Camera.kick(0.1); }
          blast(f, f.r);
          const row = f.row;
          if (row.zone) fields.push({ kind: 'grove', owner: f.owner, ghost: f.ghost, m: f.m, row, col: f.col, x: f.x, y: f.y,
                                      t: 0, life: 3, r: f.r, tick: 0, rooted: new Set() });
          if (row.spikes) fields.push({ kind: 'spikes', owner: f.owner, ghost: f.ghost, m: f.m, col: '#8a5a2b', x: f.x, y: f.y,
                                        t: 0, fall: 0.3, r: f.r * 0.8, dmg: row.spikes * f.owner.atk });
          fields.splice(i, 1);
        }
      } else if (f.kind === 'spikes') {
        if (f.t >= f.fall) {
          for (let k = 0; k < 6; k++) {
            const a = Math.random() * 6.2832, d = Math.random() * f.r * 0.8;
            G.FX.spark(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6, '#c89a5a', 0, -1, 2);
          }
          blast(f, f.r);
          fields.splice(i, 1);
        }
      } else if (f.kind === 'grove') {
        // Zona del árbol caído: frena (evolucionado: enredaderas que inmovilizan una vez a cada uno).
        f.tick -= dt;
        if (f.tick <= 0 && !f.ghost) {
          f.tick = 0.5;
          for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
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
      } else if (f.kind === 'puddle' || f.kind === 'grove') {
        const a = Math.min(1, (f.life - f.t) * 1.5, f.t * 6);
        const vine = f.kind === 'grove';
        ctx.globalAlpha = (vine ? 0.28 : 0.38) * a;
        ctx.fillStyle = vine ? (f.row.root ? '#2f7a28' : '#5fae3a') : '#7a2fa0';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.55 * a;
        ctx.strokeStyle = vine ? '#97e36c' : '#d995f2'; ctx.lineWidth = 1.5;
        if (vine) {
          // Enredaderas: unas curvas que salen del centro.
          for (let k = 0; k < 5; k++) {
            const ang = k * 1.2566 + f.x * 0.01;
            ctx.beginPath(); ctx.moveTo(f.x, f.y);
            ctx.quadraticCurveTo(f.x + Math.cos(ang + 0.6) * f.r * 0.5, f.y + Math.sin(ang + 0.6) * f.r * 0.3,
                                 f.x + Math.cos(ang) * f.r * 0.9, f.y + Math.sin(ang) * f.r * 0.55);
            ctx.stroke();
          }
        } else {
          const w = Math.sin(now * 3 + f.x) * 0.08 + 0.7;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * w, f.r * w * 0.6, 0, 0, 6.2832); ctx.stroke();
        }
      } else if (f.kind === 'tree' || f.kind === 'spikes') {
        const k = G.U.clamp(f.t / f.fall, 0, 1);
        ctx.globalAlpha = f.kind === 'tree' ? 0.15 + k * 0.3 : 0.3;
        ctx.fillStyle = f.kind === 'tree' ? '#000' : '#5a3a1a';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.3 + k * 0.7), f.r * 0.6 * (0.3 + k * 0.7), 0, 0, 6.2832); ctx.fill();
        if (f.kind === 'tree') {
          ctx.globalAlpha = 0.6;
          ctx.strokeStyle = '#97e36c'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.stroke();
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
        // Flecha rosa con estela.
        ctx.save();
        ctx.strokeStyle = f.col; ctx.lineCap = 'round';
        f.trail.forEach(([x, y], k) => {
          const [nx, ny] = f.trail[k + 1] || [f.x, f.y];
          ctx.globalAlpha = 0.15 + 0.6 * (k / f.trail.length); ctx.lineWidth = 2 + k * 0.5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        });
        ctx.globalAlpha = 1;
        ctx.translate(f.x, f.y); ctx.rotate(f.ang);
        ctx.fillStyle = '#ffe8f3'; ctx.strokeStyle = f.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -6); ctx.lineTo(-4, 0); ctx.lineTo(-8, 6); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
        continue;
      }
      if (f.kind === 'rain') {
        // Lluvia: rayitas moradas que caen (sobre el círculo, o sobre cada enemigo si evolucionó).
        const fade = Math.min(1, (f.life - f.t) * 3, f.t * 8);
        ctx.save();
        ctx.strokeStyle = '#c46cf0'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7 * fade;
        const n = f.spots ? f.spots.length * 2 : 46;
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const h = (Math.sin(k * 12.9898 + f.x) * 43758.5453) % 1, h2 = (Math.sin(k * 78.233 + f.y) * 12543.13) % 1;
          let x, y;
          if (f.spots) { const s = f.spots[k >> 1]; x = s[0] + h * 18; y = s[1] + h2 * 10; }
          else { const a = h * 6.2832, d = Math.sqrt(Math.abs(h2)) * f.r; x = f.x + Math.cos(a) * d; y = f.y + Math.sin(a) * d * 0.7; }
          const fall = ((f.t * 3 + Math.abs(h)) % 1) * 90;
          ctx.moveTo(x + 6 - fall * 0.06, y - 96 + fall); ctx.lineTo(x + 4 - fall * 0.06, y - 84 + fall);
        }
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (f.kind === 'tree' && f.t > 0) {
        // Árbol que cae del cielo en diagonal (45°), girando hasta quedar tumbado.
        const k = G.U.clamp(f.t / f.fall, 0, 1), s = f.r / 54;
        ctx.save();
        ctx.translate(f.x - (1 - k) * 150, f.y - (1 - k) * 150 - 10);
        ctx.rotate(-0.785 + k * 0.785 + 0.6);
        ctx.scale(s, s);
        ctx.fillStyle = '#6b4220'; ctx.strokeStyle = '#3a220c'; ctx.lineWidth = 2;
        ctx.fillRect(-6, -8, 12, 46); ctx.strokeRect(-6, -8, 12, 46);
        for (const [cx, cy, rr, c] of [[0, -26, 26, '#24721e'], [-12, -14, 16, '#2f8a28'], [12, -16, 17, '#2f8a28'], [0, -34, 15, '#45b23c']]) {
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.2832); ctx.fill();
        }
        ctx.strokeStyle = '#14400f'; ctx.beginPath(); ctx.arc(0, -26, 26, 0, 6.2832); ctx.stroke();
        ctx.restore();
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
    ghost = true;
    try {
      pl.cast(m);
      run(pl, m);
    } finally { ghost = false; }
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
    let k = typeK(m.type, e);
    if (m.superVs && e.types.includes(m.superVs)) k = Math.max(1, k) * 2;     // Liofilización contra Agua
    const crit = !ghost && (opt && opt.crit != null ? opt.crit
      : m.critBonus ? Math.random() < (pl.critChance || 0) + m.critBonus : isCrit(pl));
    dmg *= k * (crit ? (opt && opt.cmul) || pl.critMul || CRIT_MUL : 1) * itemK(pl, m.type, e);
    e.hurt(dmg, col, dx, dy, knock, crit ? 'crit' : G.Types.label(G.Types.mult(m.type, e.types)));
    if (!ghost) pl.onDealt(dmg);
    pl.dmgDealt += dmg;
    if (m.burn) e.applyBurn(m.burn);
    if (m.poison) e.applyPoison(m.poison);
    if (m.slow) e.applySlow(m.slow);
    if (!ghost && (m.rootCh || m.weakCh)) extraFx(e, m.rootCh, m.rootT, m.weakCh);
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
    return venom * (pl.hasItem('expertbelt') && type && G.Types.mult(type, e.types) > 1 ? 1.3 : 1);
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

  function resolve(dt, pl, now) {
    const projectiles = G.Projectiles.all();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];

      // --- disparos enemigos: paredes y objetos sólidos dan cobertura ---
      if (!p.friendly) {
        if (G.World.projectileBlock(p.x, p.y, p.r)) {
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 70);
          projectiles.splice(i, 1);
          continue;
        }
        if (G.U.dist2(p.x, p.y, pl.x, pl.y) < (p.r + pl.r) * (p.r + pl.r)) {
          pl.hurt(p.dmg, p.mtype);
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 7, 110);
          projectiles.splice(i, 1);
        }
        continue;
      }

      // --- disparos de jugadores ---
      // Orbes de un compañero: sólo se ven (en PK, te golpean).
      if (p.orb && p.ghost) { if (G.PvP.on) G.PvP.orb(p, now); continue; }
      // PK: el disparo de otro jugador te da a ti.
      if (p.ghost && !p.orb && G.PvP.on && G.PvP.projectile(p)) {
        G.FX.burst(p.x, p.y - G.LIFT, p.color, 6, 90);
        projectiles.splice(i, 1);
        continue;
      }
      if (!p.orb) {
        const block = G.World.projectileBlock(p.x, p.y, p.r);
        if (block === 'wall' || (block && !block.destructible)) {
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
        // La hierba no frena; lo sólido sí gasta perforación.
        if (prop.solid) {
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
      for (const e of G.EnemyMgr.queryCircle((sx + p.x) / 2, (sy + p.y) / 2, half + p.r)) {
        if (segDist2(sx, sy, p.x, p.y, e.x, e.y) > (p.r + e.r) * (p.r + e.r)) continue;
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
          if (p.pierce > 0) { p.pierce--; continue; }
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
          projectiles.splice(i, 1);
          break;
        }

        const crit = isCrit(pl);
        const k = (p.mtype ? typeK(p.mtype, e) : 1) * (crit ? pl.critMul || CRIT_MUL : 1) * itemK(pl, p.mtype, e);
        e.hurt(p.dmg * k, p.color, p.vx || (e.x - pl.x), p.vy || (e.y - pl.y), p.knock,
               crit ? 'crit' : p.mtype ? G.Types.label(G.Types.mult(p.mtype, e.types)) : null);
        if (Math.random() < 0.5) G.FX.sp('impact', p.vis ? p.vis.pal : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.12, scale: 1 });
        pl.dmgDealt += p.dmg * k;
        pl.onDealt(p.dmg * k);
        if (p.burn) e.applyBurn(p.burn);
        if (p.poison) e.applyPoison(p.poison);
        if (p.slow) e.applySlow(p.slow);
        if (p.rootCh || p.weakCh) extraFx(e, p.rootCh, p.rootT, p.weakCh);

        if (!p.orb) {
          if (p.split && p.pierce > 0) splitSpear(p, e);   // Lanza Sombría: se parte al perforar
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
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, pl.r + 40)) {
      // Shaq (Peso Pesado evolucionado): los enemigos normales no pueden tocarte (se quedan
      // en el borde del campo). Los jefes y los disparos sí.
      if (pl.bulkField && !e.boss) {
        const d = Math.max(1, G.U.dist(e.x, e.y, pl.x, pl.y)), min = pl.r + e.r + 4;
        if (d < min && !e.remote) {
          const x = pl.x + (e.x - pl.x) / d * min, y = pl.y + (e.y - pl.y) / d * min;
          if (!G.World.isWall(x, y)) { e.x = x; e.y = y; }
        }
        continue;
      }
      if (G.U.dist2(e.x, e.y, pl.x, pl.y) > (e.r + pl.r) * (e.r + pl.r)) continue;
      if (e.touchCd > 0 || e.behavior === 'thief' || e.dmg <= 0) continue;     // (los Magikarp de la migración no pegan)
      e.touchCd = 0.55;
      e.strike(pl);
      // Peso Pesado: la armadura quita parte del daño de los choques.
      pl.hurt(e.dmg * (1 - (pl.bulkArmor || 0)), e.atkType);
      // Poción de gigante: aplastas a los que te tocan (y salen despedidos).
      if (pl.giant && !e.boss) e.hurt((20 + pl.level * 4) * pl.atk / Math.max(1, pl.baseAtk), '#ff7b3d', e.x - pl.x, e.y - pl.y, 320);
      // Casco Dentado: crece con tu ataque (antes se quedaba corto al final de la run).
      if (pl.hasItem('rockyhelmet')) e.hurt((15 + pl.level * 4) * pl.atk / Math.max(1, pl.baseAtk), '#9aa6b5', e.x - pl.x, e.y - pl.y, 80);
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      e.kx += nx * 150; e.ky += ny * 150;
    }
  }

  return { supportHeal, tick, resolve, ghostCast, ghostOrbit, updateFields, drawGroundFields, drawAirFields, clearFields,
           get fieldCount() { return fields.length; } };
})();
