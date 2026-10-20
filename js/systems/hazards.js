/* ============ hazards.js — ataques con aviso de los enemigos ============
 * Un peligro se dibuja primero en el suelo como AVISO (se va llenando) y, al
 * cumplirse el tiempo, golpea a quien esté dentro:
 *
 *   zone  círculo (zonas de Tierra/Fuego/Veneno, explosiones, caídas de salto)
 *   beam  rayo recto desde el enemigo (Eléctrico, Psíquico, Dragón, Hielo)
 *   blade cuchilla giratoria que sale volando en espiral de muelle (jefes de
 *         Acero, Bicho, Siniestro y Lucha): sin aviso, se esquiva viéndola
 *   thorn franja de aviso y luego un tallo de espinas que sale desde un borde y la
 *         recorre (jefes de Planta, Veneno, Tierra y Roca: muchas a la vez)
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
    } else if (!fromNet && G.Coop.isHost && o.kind === 'thorn') {
      G.Coop.broadcast(['hz', { kind: 'thorn', x: Math.round(o.x), y: Math.round(o.y), angle: o.angle, len: o.len, w: o.w, delay: o.delay,
                                grow: o.grow, stay: o.stay, dmg: Math.round(o.dmg), type: o.type, color: o.color }]);
    } else if (!fromNet && G.Coop.isHost) {
      G.Coop.broadcast(['hz', { kind: o.kind, x: Math.round(o.x), y: Math.round(o.y), r: o.r, angle: o.angle, len: o.len, w: o.w,
                                delay: o.delay, dmg: Math.round(o.dmg), type: o.type, color: o.color, ray: o.ray || 0 }]);
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
  function bladePos(h, t = h.t) {
    const ca = Math.cos(h.angle), sa = Math.sin(h.angle);
    const a = t * h.om;
    const along = h.sp * t + h.R * Math.sin(a), side = h.R * (1 - Math.cos(a));
    return { x: h.x + ca * along - sa * side, y: h.y + sa * along + ca * side, rot: h.angle + t * h.spin };
  }

  /** ¿Toca la hoja (segmento de largo len y ancho w) un círculo en (x, y) de radio r? */
  function bladeHits(h, x, y, r) {
    const p = bladePos(h), cx = Math.cos(p.rot) * h.len / 2, cy = Math.sin(p.rot) * h.len / 2;
    const ax = p.x - cx, ay = p.y - cy, dx = cx * 2, dy = cy * 2;
    const t = G.U.clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return G.U.dist2(ax + dx * t, ay + dy * t, x, y) <= (h.w / 2 + r * 0.7) ** 2;
  }

  /** Largo de un tallo de espinas ahora (crece en `grow` s, se queda `stay` s y se retira). */
  function thornLen(h) {
    const a = h.t - h.delay;
    if (a < 0) return 0;
    if (a < h.grow) return h.len * a / h.grow;
    if (a < h.grow + h.stay) return h.len;
    return h.len * Math.max(0, 1 - (a - h.grow - h.stay) / 0.25);
  }

  function update(dt) {
    const pl = G.Game.player;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      h.t += dt;
      if (h.kind === 'thorn') {
        const len = thornLen(h);
        if (!h.hit && len > 0 && pl && !pl.dead && inside(Object.assign({}, h, { len }), pl.x, pl.y, pl.r)) { h.hit = true; pl.hurt(h.dmg, h.type, 's'); }
        if (h.t >= h.delay + h.grow + h.stay + 0.25) list.splice(i, 1);
        continue;
      }
      if (h.kind === 'blade') {
        if (!h.hit && pl && !pl.dead && bladeHits(h, pl.x, pl.y, pl.r)) { h.hit = true; pl.hurt(h.dmg, h.type, 'p'); }
        if (h.t >= h.life) list.splice(i, 1);
        continue;
      }
      if (!h.hit && h.t >= h.delay) {
        h.hit = true;
        detonate(h);
        if (pl && !pl.dead && inside(h, pl.x, pl.y, pl.r)) {
          // Vuelo Celestial (Arte Sin Forma evolucionado): los rayos de los enemigos no le hacen nada.
          if (h.ray && G.Combat.beamImmune(pl)) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, G.T('¡Inmune!'), '#ffc4e6');
          else { pl.invuln = 0; pl.hurt(h.dmg, h.type, 's'); }
        }
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

  // ---- dibujo en píxeles (2026-10-16): sprites de G.VFX y bloques de PX, nada de trazos lisos ----
  const PX = G.Sprites.PX, snap = v => Math.round(v / PX) * PX;
  const fadeStep = k => k > 0.66 ? 1 : k > 0.33 ? 0.66 : 0.33;

  /** Flechas ">" de píxeles a lo largo de un aviso recto (coordenadas ya rotadas), avanzando. */
  function chevrons(ctx, len, w, now) {
    const gap = 44, off = (now * 140) % gap, s = Math.max(2, Math.min(4, Math.round(w / PX / 5)));
    for (let d = off; d < len - s * PX; d += gap) {
      for (let i = 0; i <= s; i++) {
        ctx.fillRect(Math.round(d + i * PX), -PX / 2 - (s - i) * PX, PX, PX);
        ctx.fillRect(Math.round(d + i * PX), -PX / 2 + (s - i) * PX, PX, PX);
      }
    }
  }

  /** Una cuchilla: sprite de hoja metálica (filo del color del tipo) con imágenes residuales y estela de bloques. */
  function drawBlade(ctx, h) {
    const fade = Math.min(1, (h.life - h.t) * 3, h.t * 8), al = fadeStep(fade), L = G.LIFT * 0.6;
    const P = G.VFX.PAL[h.type] || G.VFX.PAL.steel;
    // Estela: el camino de los últimos 0,5 s (dibuja el muelle) en bloques que se apagan a escalones.
    const N = 16;
    ctx.save();
    for (let k = N; k >= 1; k--) {
      const tt = h.t - 0.5 * k / N;
      if (tt < 0) continue;
      const p = bladePos(h, tt), near = k <= N / 3, sz = near ? PX * 2 : PX;
      ctx.globalAlpha = al * (near ? 0.85 : k <= N * 2 / 3 ? 0.55 : 0.3);
      ctx.fillStyle = near ? P[3] : P[2];
      ctx.fillRect(snap(p.x) - sz / 2, snap(p.y - L) - sz / 2, sz, sz);
    }
    ctx.restore();
    const p = bladePos(h);
    G.VFX.draw(ctx, 'blade', h.type, p.x, p.y - L, { angle: p.rot - 0.8, alpha: al * 0.33 });
    G.VFX.draw(ctx, 'blade', h.type, p.x, p.y - L, { angle: p.rot - 0.4, alpha: al * 0.66 });
    G.VFX.draw(ctx, 'blade', h.type, p.x, p.y - L, { angle: p.rot, alpha: al });
  }

  /** Tira larga de tallo con púas (se hace una vez por paleta, en píxeles de arte). */
  const strips = new Map();
  function thornStrip(pal) {
    let cv = strips.get(pal);
    if (cv) return cv;
    const seg = G.VFX.sprite('thorn', pal);
    cv = document.createElement('canvas');
    cv.width = Math.ceil(1600 / PX); cv.height = seg.height;
    const c = cv.getContext('2d');
    for (let x = 0; x < cv.width; x += seg.width) c.drawImage(seg, x, 0);
    strips.set(pal, cv);
    return cv;
  }

  /** Tallo de espinas: franja de aviso (bordes a trazos que marchan y flechas) y luego el tallo de píxel. */
  function drawThorn(ctx, h, blink, now) {
    ctx.save();
    ctx.translate(snap(h.x), snap(h.y));
    ctx.rotate(h.angle);
    ctx.imageSmoothingEnabled = false;
    if (h.t < h.delay) {
      const k = Math.min(1, h.t / h.delay);
      ctx.fillStyle = h.color;
      ctx.globalAlpha = 0.18; ctx.fillRect(0, -h.w / 2, h.len, h.w);
      ctx.globalAlpha = 0.32; ctx.fillRect(0, -h.w / 2, Math.round(h.len * k / PX) * PX, h.w);
      ctx.globalAlpha = k > 0.75 && blink ? 1 : 0.7;
      G.VFX.dashLine(ctx, 0, h.len, -h.w / 2, Math.floor(now * 12));
      G.VFX.dashLine(ctx, 0, h.len, h.w / 2, Math.floor(now * 12));
      ctx.globalAlpha = k > 0.75 && blink ? 0.95 : 0.5;
      chevrons(ctx, h.len * k, h.w, now);
    } else {
      const len = thornLen(h);
      const strip = thornStrip(h.type || 'grass'), tip = G.VFX.sprite('thornTip', h.type || 'grass');
      const tw = tip.width * PX, hh = strip.height * PX, body = Math.max(0, len - tw);
      const src = Math.min(strip.width, Math.round(body / PX));
      if (src > 0) ctx.drawImage(strip, 0, 0, src, strip.height, 0, -hh / 2, src * PX, hh);
      if (len > 0) ctx.drawImage(tip, Math.round(body / PX) * PX, -hh / 2, tw, hh);
    }
    ctx.restore();
  }

  /** Avisos en el suelo (debajo de los Pokémon): relleno a filas de píxeles y bordes a puntos que marchan. */
  function draw(ctx) {
    const now = performance.now() / 1000, blink = Math.sin(now * 16.7) > 0, march = Math.floor(now * 12);
    for (const h of list) {
      if (h.kind === 'blade') { if (G.Camera.sees(h.x, h.y, 600)) drawBlade(ctx, h); continue; }
      if (h.kind === 'thorn') { drawThorn(ctx, h, blink, now); continue; }
      if (h.hit) continue;
      const k = Math.min(1, h.t / h.delay);
      ctx.save();
      ctx.fillStyle = h.color;
      if (h.kind === 'zone') {
        ctx.globalAlpha = 0.16; G.VFX.oval(ctx, h.x, h.y, h.r, h.r * 0.75);
        ctx.globalAlpha = 0.3;  G.VFX.oval(ctx, h.x, h.y, h.r * k, h.r * 0.75 * k);
        ctx.globalAlpha = k > 0.75 && blink ? 1 : 0.7;
        G.VFX.dashOval(ctx, h.x, h.y, h.r, h.r * 0.75, march, 3, 2);
      } else {
        ctx.translate(snap(h.x), snap(h.y));
        ctx.rotate(h.angle);
        ctx.globalAlpha = 0.14; ctx.fillRect(0, -h.w / 2, h.len, h.w);
        ctx.globalAlpha = 0.3;  ctx.fillRect(0, -snap(h.w / 2 * k), h.len, snap(h.w / 2 * k) * 2);
        ctx.globalAlpha = k > 0.75 && blink ? 1 : 0.7;
        G.VFX.dashLine(ctx, 0, h.len, -h.w / 2, march);
        G.VFX.dashLine(ctx, 0, h.len, h.w / 2, march);
        ctx.globalAlpha = k > 0.75 && blink ? 0.9 : 0.45;
        chevrons(ctx, h.len, h.w, now);
      }
      ctx.restore();
    }
  }

  return { add, clear, update, draw, inside, get all() { return list; }, get count() { return list.length; } };
})();
