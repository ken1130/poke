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

  function reset() { steps = []; stepHit.clear(); stepAcc = 0; zero = false; }

  /** Cada fotograma, con tu Pokémon. */
  function update(dt, pl) {
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
    if (!pl.hasItem('climber') || e.dead) return;
    e.applyBurnFloor(A().climber.stacks);
  }

  /** Hígado del Ingeniero: un proyectil enemigo te ha dado y no hace nada. */
  function blocked(pl) {
    const t = performance.now();
    if (t - blockT < 350) return;
    blockT = t;
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, G.T('¡Inmune!'), '#ffd23f');
    G.FX.ring(pl.x, pl.y - pl.bodyH * 0.5, pl.r, pl.r * 2, '#ffd23f', 0.25, 2);
  }

  return { reset, update, draw, onAttack, buffCap, diceK, zeroed, miss, onHit, blocked, steps: () => steps };
})();
