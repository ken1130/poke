/* ============ maxmoves.js — Movimientos Dinamax (2026-10-19) ============
 * Mientras dura el Gigamax (gmax.js), cada movimiento de ataque, al pegar, lanza además su
 * «Maxi» del tipo (como en los juegos: Maxignición, Maxichorro...). Uno por movimiento cada CD s,
 * en el primer enemigo que toque. El movimiento normal sigue igual; esto va encima.
 * Daño: (BASE + nivel × PER_LV) × ataque × k de cada tipo. Sólo quien mueve a los monstruos de
 * verdad pega (en un invitado, el golpe va como siempre por hurt → anfitrión).
 * Zonas (fuego, planta, veneno): círculos en el suelo que pegan cada `every` s.
 */
G.MaxMoves = (() => {
  const CD = 1.4, BASE = 16, PER_LV = 2, HEAL_CD = 1, NAME_CD = 0.6;
  // [nombre, qué hace] (español: clave de traducción, lang-v31-maxmoves.js)
  const INFO = {
    normal:   ['Maxiataque',   'Gran golpe en área.'],
    fire:     ['Maxignición',  'Explosión que quema y deja un mar de llamas 3 s.'],
    water:    ['Maxichorro',   'Ola que empuja y frena a los enemigos.'],
    electric: ['Maxitormenta', 'Rayo que salta a 4 enemigos más.'],
    grass:    ['Maxiflora',    'Hierba que inmoviliza 3 s y te cura un poco.'],
    ice:      ['Maxihelada',   'Congela a los de alrededor.'],
    fighting: ['Maxipuño',     'Puñetazo enorme a un enemigo que lo manda lejos.'],
    poison:   ['Maxiácido',    'Charco de ácido que envenena 3 s.'],
    ground:   ['Maxitemblor',  'Terremoto en un área grande.'],
    flying:   ['Maxiciclón',   'Ciclón que aparta a todos lejos.'],
    psychic:  ['Maximente',    'Onda que confunde a los de alrededor.'],
    bug:      ['Maxinsecto',   'Un enjambre pica a 5 enemigos cercanos.'],
    rock:     ['Maxilito',     'Caen 3 rocas alrededor del enemigo.'],
    ghost:    ['Maxiespectro', 'Sombras que asustan: muy lentos 2,5 s.'],
    dragon:   ['Maxidraco',    'Aliento de dragón: mucho daño en área.'],
    dark:     ['Maxisombra',   'Doble daño a los que tienen menos de la mitad de vida.'],
    steel:    ['Maxiacero',    'Ocho púas de acero salen en todas direcciones.'],
    fairy:    ['Maxiestela',   'Lluvia de estrellas que te cura un poco.']
  };
  const COL = t => G.U.TYPE_COLOR[t] || '#ffffff';
  let zones = [], bolts = [], nameT = 0;
  const PM = {};
  const pm = t => PM[t] || (PM[t] = { id: 'max-' + t, name: INFO[t][0], type: t, kind: 'max', maxFx: true });
  const now = () => G.Game.st.time;
  const dmgOf = pl => (BASE + (pl.level || 1) * PER_LV) * pl.atk;
  const near = (x, y, r) => G.EnemyMgr.queryCircle(x, y, r + 40).filter(e => !e.dead && !e.dummy && G.U.dist2(e.x, e.y, x, y) <= (r + e.r) ** 2);
  const hit = (pl, e, k, t, knock = 0, fx = pl.x, fy = pl.y) => G.Combat.hitBy(pl, e, dmgOf(pl) * k, pm(t), knock, fx, fy);

  function reset() { zones = []; bolts = []; nameT = 0; }
  const active = pl => !!pl && pl.gmaxT > 0 && !pl.remote;

  /** Desde Combat.hit: `m` acaba de pegar a `e`. */
  function onHit(pl, e, m) {
    if (!active(pl) || !m || m.maxFx || !INFO[m.type] || G.Moves.isPassive(m)) return;   // (aunque haya caído: sale donde estaba)
    const t = now();
    if (m.maxAt != null && t - m.maxAt < CD) return;
    m.maxAt = t;
    fire(pl, e, m.type);
  }

  function heal(pl, frac) {
    if ((pl.maxHealAt || -9) > now() - HEAL_CD) return;
    pl.maxHealAt = now();
    pl.heal(pl.maxHp * frac);
  }
  function bolt(x0, y0, x1, y1, col) { bolts.push({ x0, y0, x1, y1, col, t: 0, life: 0.22, seed: Math.random() * 99 }); }

  /**
   * Lanza el «Maxi» de `type` sobre `e`: primero el daño (sólo aquí), luego lo que se ve, que
   * también se manda al grupo (['mfx', 'max', ...] → Combat.netFx → netFx): los demás lo ven
   * igual (zonas incluidas, sin daño). `ln`: rayos [x0,y0,x1,y1,...]; `pts`: rocas [x,y,...].
   */
  function fire(pl, e, type) {
    const x = e.x, y = e.y, ln = [], pts = [];
    const line = (x0, y0, x1, y1) => ln.push(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1));
    switch (type) {
      case 'fire':
        for (const o of near(x, y, 70)) { hit(pl, o, 1, type, 0, x, y); if (!o.dead) o.applyBurn(2); }
        zones.push({ type, x, y, r: 60, t: 0, life: 3, every: 0.5, tick: 0.5, pl });
        break;
      case 'water':
        for (const o of near(x, y, 90)) { hit(pl, o, 0.9, type, 140, x, y); if (!o.dead) o.applySlow(0.4, 2); }
        break;
      case 'electric': {
        let cur = e; const done = new Set([e]);
        if (!e.dead) hit(pl, e, 1, type, 0, x, y);
        for (let k = 0; k < 4; k++) {
          const nx = near(cur.x, cur.y, 140).filter(o => !done.has(o)).sort((a, b) => G.U.dist2(a.x, a.y, cur.x, cur.y) - G.U.dist2(b.x, b.y, cur.x, cur.y))[0];
          if (!nx) break;
          line(cur.x, cur.y - cur.bodyH * 0.5, nx.x, nx.y - nx.bodyH * 0.5);
          done.add(nx); hit(pl, nx, 0.8, type, 0, cur.x, cur.y); cur = nx;
        }
        break;
      }
      case 'grass':
        for (const o of near(x, y, 60)) hit(pl, o, 0.7, type, 0, x, y);
        zones.push({ type, x, y, r: 80, t: 0, life: 3, every: 0.5, tick: 0, pl });
        heal(pl, 0.015);
        break;
      case 'ice':
        for (const o of near(x, y, 70)) { hit(pl, o, 0.9, type, 0, x, y); if (!o.dead) o.applyFreeze(1.2); }
        break;
      case 'fighting': {         // (si ya cayó, al más cercano)
        const tg = e.dead ? near(x, y, 60)[0] : e;
        if (tg) hit(pl, tg, 2.2, type, 220);
        break;
      }
      case 'poison':
        for (const o of near(x, y, 80)) { hit(pl, o, 0.6, type, 0, x, y); if (!o.dead) o.applyPoison(3); }
        zones.push({ type, x, y, r: 70, t: 0, life: 3, every: 0.6, tick: 0.6, pl });
        break;
      case 'ground':
        for (const o of near(x, y, 110)) hit(pl, o, 1.1, type, 60, x, y);
        break;
      case 'flying':
        for (const o of near(x, y, 100)) hit(pl, o, 0.8, type, 260, x, y);
        break;
      case 'psychic':
        for (const o of near(x, y, 80)) { hit(pl, o, 0.9, type, 0, x, y); if (!o.dead) o.applyConfuse(1.5); }
        break;
      case 'bug': {
        const list = near(x, y, 160).sort((a, b) => G.U.dist2(a.x, a.y, x, y) - G.U.dist2(b.x, b.y, x, y)).slice(0, 5);
        for (const o of list) { line(x, y - 20, o.x, o.y - o.bodyH * 0.5); hit(pl, o, 0.6, type, 0, x, y); }
        break;
      }
      case 'rock':
        for (let k = 0; k < 3; k++) {
          const a = k * 2.094 + Math.random(), rx = x + Math.cos(a) * 35, ry = y + Math.sin(a) * 25;
          pts.push(Math.round(rx), Math.round(ry));
          for (const o of near(rx, ry, 40)) hit(pl, o, 0.9, type, 40, rx, ry);
        }
        break;
      case 'ghost':
        for (const o of near(x, y, 90)) { hit(pl, o, 0.8, type, 0, x, y); if (!o.dead) o.applySlow(0.5, 2.5); }
        break;
      case 'dragon':
        for (const o of near(x, y, 95)) hit(pl, o, 1.4, type, 80, x, y);
        break;
      case 'dark':
        for (const o of near(x, y, 80)) hit(pl, o, o.hp < o.maxHp * 0.5 ? 1.8 : 0.9, type, 0, x, y);
        break;
      case 'steel':
        for (let k = 0; k < 8; k++) { const a = k * 0.785; line(x, y - 10, x + Math.cos(a) * 100, y - 10 + Math.sin(a) * 70); }
        for (const o of near(x, y, 100)) hit(pl, o, 1, type, 60, x, y);
        break;
      case 'fairy':
        for (const o of near(x, y, 80)) hit(pl, o, 0.9, type, 0, x, y);
        heal(pl, 0.015);
        break;
      default:            // normal
        for (const o of near(x, y, 80)) hit(pl, o, 1.2, type, 60, x, y);
    }
    const bh = Math.round(e.bodyH || 30);
    show(type, Math.round(x), Math.round(y), bh, ln, pts, false);
    if (G.Coop.active) {
      const ev = ['mfx', 'max', type, Math.round(x), Math.round(y), bh, ln, pts];
      if (G.Coop.isHost) G.Coop.broadcast(ev); else G.Coop.toHost(ev);
    }
  }

  /** Lo que se ve de un «Maxi» (el tuyo o el de un compañero: `ghost`, sus zonas no pegan). */
  function show(type, x, y, bh, ln, pts, ghost) {
    const col = COL(type), sees = G.Camera.sees(x, y, 160);
    if (ghost && (type === 'fire' || type === 'grass' || type === 'poison'))
      zones.push({ type, x, y, r: type === 'grass' ? 80 : type === 'fire' ? 60 : 70, t: 0, life: 3, every: 9e9, tick: 9e9, pl: null, ghost: true });
    for (let k = 0; k + 3 < ln.length; k += 4) bolt(ln[k], ln[k + 1], ln[k + 2], ln[k + 3], type === 'steel' ? '#c8d4e0' : col);
    if (!sees) return;
    G.FX.ring(x, y, 8, 90, col, 0.35, 4);
    G.FX.burst(x, y - 10, col, 16, 200);
    if (now() - nameT > NAME_CD) { nameT = now(); G.FX.dmgText(x, y - 46, G.T(INFO[type][0]), col, true); }
    switch (type) {
      case 'electric': G.Audio.sfx('hit'); break;
      case 'fighting': G.FX.sp('impact', 'fighting', x, y - bh * 0.5, { life: 0.2, scale: 2, frameRate: 14 }); G.Camera.kick(0.15); break;
      case 'ground':
        G.Camera.kick(0.25); G.FX.ring(x, y, 20, 120, '#aa7c3c', 0.45, 5);
        for (let k = 0; k < 6; k++) G.FX.sp('rock', 'ground', x + G.U.rand(-60, 60), y + G.U.rand(-30, 30), { vx: G.U.rand(-80, 80), vy: G.U.rand(-170, -70), life: 0.4, scale: 1 });
        break;
      case 'flying': for (let k = 0; k < 3; k++) G.FX.sp('crescent', 'flying', x + G.U.rand(-30, 30), y - 20 + G.U.rand(-20, 20), { life: 0.25, scale: 2, angle: Math.random() * 6.28 }); break;
      case 'rock':
        for (let k = 0; k + 1 < pts.length; k += 2) { G.FX.sp('rock', 'rock', pts[k], pts[k + 1] - 70, { vy: 420, life: 0.16, scale: 2 }); G.FX.burst(pts[k], pts[k + 1], '#b8a038', 8, 140); }
        break;
      case 'fairy': for (let k = 0; k < 8; k++) G.FX.px(x + G.U.rand(-60, 60), y - 80 + G.U.rand(-20, 20), '#ffd6f0', { vy: 220, life: 0.35 }); break;
    }
  }
  /** El «Maxi» de un compañero (Combat.netFx): sólo se ve. */
  function netFx(ev) {
    const [, , type, x, y, bh, ln, pts] = ev;
    if (!INFO[type] || !isFinite(x) || !isFinite(y)) return;
    show(type, x, y, bh || 30, Array.isArray(ln) ? ln.slice(0, 64) : [], Array.isArray(pts) ? pts.slice(0, 12) : [], true);
  }

  /** Cada fotograma: zonas en el suelo y rayos. */
  function update(dt) {
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.t += dt; z.tick -= dt;
      if (z.t >= z.life || (!z.ghost && (!z.pl || z.pl.dead))) { zones.splice(i, 1); continue; }
      if (z.ghost) continue;                       // (la de un compañero: sólo se ve)
      if (z.tick > 0) continue;
      z.tick = z.every;
      for (const o of near(z.x, z.y, z.r)) {
        if (z.type === 'grass') { o.applyRoot(0.6); hit(z.pl, o, 0.15, z.type, 0, z.x, z.y); }
        else if (z.type === 'fire') { hit(z.pl, o, 0.25, z.type, 0, z.x, z.y); if (!o.dead) o.applyBurn(1); }
        else { hit(z.pl, o, 0.15, z.type, 0, z.x, z.y); if (!o.dead) o.applyPoison(1); }
      }
    }
    for (let i = bolts.length - 1; i >= 0; i--) if ((bolts[i].t += dt) >= bolts[i].life) bolts.splice(i, 1);
  }

  /** Suelo: las zonas (píxeles del color del tipo que parpadean) y los rayos. */
  function draw(ctx) {
    const T = performance.now() / 1000;
    for (const z of zones) {
      if (!G.Camera.sees(z.x, z.y, z.r)) continue;
      const fade = Math.min(1, (z.life - z.t) / 0.4, z.t / 0.15), col = COL(z.type);
      ctx.save();
      ctx.globalAlpha = 0.22 * fade;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.75 * fade;
      for (let k = 0; k < 14; k++) {
        const a = k * 2.4 + z.x, rr = z.r * (0.2 + ((k * 37) % 80) / 100);
        const px = z.x + Math.cos(a) * rr, py = z.y + Math.sin(a) * rr * 0.55;
        const hgt = z.type === 'fire' ? 6 + Math.sin(T * 9 + k) * 3 : z.type === 'grass' ? 7 : 3 + Math.sin(T * 5 + k) * 1.5;
        ctx.fillStyle = (k & 1) ? col : '#ffffff';
        ctx.fillRect(Math.round(px), Math.round(py - hgt), 3, Math.round(hgt));
      }
      ctx.restore();
    }
    for (const b of bolts) {
      const a = 1 - b.t / b.life;
      ctx.save();
      ctx.globalAlpha = a; ctx.strokeStyle = b.col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x0, b.y0);
      for (let k = 1; k < 6; k++) {
        const f = k / 6, j = Math.sin(b.seed + k * 7.3) * 9;
        ctx.lineTo(b.x0 + (b.x1 - b.x0) * f + j, b.y0 + (b.y1 - b.y0) * f - j * 0.6);
      }
      ctx.lineTo(b.x1, b.y1); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.restore();
    }
  }

  /** Para el HUD: nombre y qué hace el «Maxi» de un tipo. */
  const info = t => INFO[t] || INFO.normal;

  return { reset, onHit, update, draw, info, netFx, CD };
})();
