/* ============ hazards.js — ataques con aviso de los enemigos ============
 * Un peligro se dibuja primero en el suelo como AVISO (se va llenando) y, al
 * cumplirse el tiempo, golpea a quien esté dentro:
 *
 *   zone  círculo (zonas de Tierra/Fuego/Veneno, explosiones, caídas de salto)
 *   beam  rayo recto desde el enemigo (Eléctrico, Psíquico, Dragón, Hielo)
 *   blade cuchilla giratoria que sale volando en espiral de muelle (jefes de
 *         Acero, Bicho, Planta, Siniestro y Lucha): sin aviso, se esquiva viéndola
 *
 * Cada ordenador dibuja los peligros y comprueba sólo SU Pokémon. En
 * cooperativo los crea el anfitrión y los manda con 'hz'.
 */
G.Hazards = (() => {
  let list = [];

  /** h: { kind, x, y, r | angle, len, w, delay, dmg, type, color } */
  function add(h, fromNet = false) {
    const o = Object.assign({ t: 0, hit: false, end: 0.3 }, h);
    list.push(o);
    if (!fromNet && G.Coop.isHost && o.kind === 'blade') {
      G.Coop.broadcast(['hz', { kind: 'blade', x: Math.round(o.x), y: Math.round(o.y), angle: o.angle, dmg: Math.round(o.dmg), type: o.type,
                                color: o.color, sp: o.sp, life: o.life, R: o.R, om: o.om, spin: o.spin, w: o.w, len: o.len }]);
    } else if (!fromNet && G.Coop.isHost) {
      G.Coop.broadcast(['hz', { kind: o.kind, x: Math.round(o.x), y: Math.round(o.y), r: o.r, angle: o.angle, len: o.len, w: o.w,
                                delay: o.delay, dmg: Math.round(o.dmg), type: o.type, color: o.color }]);
    }
    return o;
  }

  function clear() { list = []; }

  function inside(h, x, y, r) {
    if (h.kind === 'zone') return G.U.dist2(x, y, h.x, h.y) < (h.r + r * 0.6) ** 2;
    const ca = Math.cos(h.angle), sa = Math.sin(h.angle);
    const px = x - h.x, py = y - h.y;
    const along = px * ca + py * sa;
    if (along < -r || along > h.len + r) return false;
    return Math.abs(-px * sa + py * ca) <= h.w / 2 + r * 0.6;
  }

  /**
   * Cuchilla: avanza en línea recta (sp) mientras da vueltas de radio R a ω = om
   * rad/s alrededor de ese punto. Como R·ω > sp, el camino hace bucles: un muelle
   * visto de lado. La hoja además gira sobre sí misma (spin).
   */
  function bladePos(h) {
    const ca = Math.cos(h.angle), sa = Math.sin(h.angle);
    const a = h.t * h.om;
    const along = h.sp * h.t + h.R * Math.sin(a), side = h.R * (1 - Math.cos(a));
    return { x: h.x + ca * along - sa * side, y: h.y + sa * along + ca * side, rot: h.angle + h.t * h.spin };
  }

  /** ¿Toca la hoja (segmento de largo len y ancho w) un círculo en (x, y) de radio r? */
  function bladeHits(h, x, y, r) {
    const p = bladePos(h), cx = Math.cos(p.rot) * h.len / 2, cy = Math.sin(p.rot) * h.len / 2;
    const ax = p.x - cx, ay = p.y - cy, dx = cx * 2, dy = cy * 2;
    const t = G.U.clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return G.U.dist2(ax + dx * t, ay + dy * t, x, y) <= (h.w / 2 + r * 0.7) ** 2;
  }

  function update(dt) {
    const pl = G.Game.player;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      h.t += dt;
      if (h.kind === 'blade') {
        if (!h.hit && pl && !pl.dead && bladeHits(h, pl.x, pl.y, pl.r)) { h.hit = true; pl.hurt(h.dmg, h.type); }
        if (h.t >= h.life) list.splice(i, 1);
        continue;
      }
      if (!h.hit && h.t >= h.delay) {
        h.hit = true;
        detonate(h);
        if (pl && !pl.dead && inside(h, pl.x, pl.y, pl.r)) { pl.invuln = 0; pl.hurt(h.dmg, h.type); }
      }
      if (h.hit && h.t >= h.delay + h.end) list.splice(i, 1);
    }
  }

  function detonate(h) {
    const near = G.Camera.sees(h.x, h.y, 120);
    if (h.kind === 'zone') {
      G.FX.ring(h.x, h.y, 4, h.r, h.color, 0.35, 5);
      G.FX.burst(h.x, h.y - 6, h.color, Math.round(h.r / 3), 160);
      if (near) { G.Audio.sfx('break'); if (h.r > 60) G.Camera.kick(0.35); }
    } else {
      G.FX.beam(h.x, h.y - G.LIFT, h.angle, h.len, h.w, h.color, G.VFX.forType(h.type || 'normal'));
      if (near) G.Audio.sfx('shot', { kind: 'beam', type: h.type });
    }
  }

  /** Una cuchilla: hoja metálica con el filo del color del tipo y una estela. */
  function drawBlade(ctx, h) {
    const fade = Math.min(1, (h.life - h.t) * 3, h.t * 8);
    // Estela: el camino de los últimos 0,7 s, que dibuja el muelle (los bucles).
    const TRAIL = 0.7, N = 22;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = h.color;
    let prev = null;
    for (let k = N; k >= 0; k--) {
      const tt = h.t - TRAIL * k / N;
      if (tt < 0) continue;
      const p = bladePos(Object.assign({}, h, { t: tt }));
      if (prev) {
        ctx.globalAlpha = fade * 0.55 * (1 - k / N);
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y - G.LIFT * 0.6); ctx.lineTo(p.x, p.y - G.LIFT * 0.6); ctx.stroke();
      }
      prev = p;
    }
    ctx.restore();
    // La hoja: rombo alargado (más ancha en el centro) con el filo del color del tipo.
    const p = bladePos(h);
    ctx.save();
    ctx.translate(p.x, p.y - G.LIFT * 0.6);
    ctx.rotate(p.rot);
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#e6edf5';
    ctx.beginPath();
    ctx.moveTo(-h.len / 2, 0); ctx.lineTo(0, -h.w / 2); ctx.lineTo(h.len / 2, 0); ctx.lineTo(0, h.w / 2); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = h.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#5d6f8c'; ctx.fillRect(-3, -3, 6, 6);          // eje
    ctx.restore();
  }

  /** Avisos en el suelo (debajo de los Pokémon). */
  function draw(ctx) {
    const blink = Math.sin(performance.now() / 60) > 0;
    for (const h of list) {
      if (h.kind === 'blade') { if (G.Camera.sees(h.x, h.y, 600)) drawBlade(ctx, h); continue; }
      if (h.hit) continue;
      const k = Math.min(1, h.t / h.delay);
      ctx.save();
      if (h.kind === 'zone') {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = h.color;
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.75, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.32;
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * k, h.r * 0.75 * k, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = k > 0.75 && blink ? 0.95 : 0.6;
        ctx.strokeStyle = h.color; ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.75, 0, 0, 6.2832); ctx.stroke();
      } else {
        ctx.translate(h.x, h.y);
        ctx.rotate(h.angle);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = h.color;
        ctx.fillRect(0, -h.w / 2, h.len, h.w);
        ctx.globalAlpha = 0.34;
        ctx.fillRect(0, -h.w / 2 * k, h.len, h.w * k);
        ctx.globalAlpha = k > 0.75 && blink ? 0.95 : 0.55;
        ctx.strokeStyle = h.color; ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(0, -h.w / 2, h.len, h.w);
      }
      ctx.restore();
    }
  }

  return { add, clear, update, draw, inside, get all() { return list; }, get count() { return list.length; } };
})();
