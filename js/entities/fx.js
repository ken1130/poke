/* ============ fx.js — partículas, números de daño y efectos (pixel art) ============
 * Todo lo puramente visual vive aquí. Nada de esto afecta al gameplay.
 *
 * Todo se dibuja en la rejilla de píxeles del juego (G.Sprites.PX): las
 * partículas son cuadrados, los anillos son puntos y los golpes y rayos se
 * construyen con bloques y con los sprites de G.VFX, para que los efectos
 * casen con los sprites de Mundo Misterioso.
 */
G.FX = (() => {
  const PX = G.Sprites.PX;
  // Topes según la calidad (Ajustes → Gráficos): bajo, medio, alto.
  const CAP_PARTS = [350, 800, 1400], CAP_SPRITES = [110, 210, 320], CAP_TEXTS = [25, 45, 70], DENS = [0.35, 0.65, 1];
  const q = () => G.Settings.fx;
  let parts = [], sprites = [], texts = [], rings = [], slashes = [], beams = [], bolts = [];

  function clear() { parts = []; sprites = []; texts = []; rings = []; slashes = []; beams = []; bolts = []; }

  const snap = v => Math.round(v / PX) * PX;

  // ---------------- partículas ----------------

  /** Partícula cuadrada. o: { vx, vy, life, size (en píxeles de arte), grav, drag } */
  function px(x, y, color, o = {}) {
    if (parts.length >= CAP_PARTS[q()]) return;
    parts.push({ x, y, vx: o.vx || 0, vy: o.vy || 0, t: 0, life: o.life || 0.4, color,
                 s: (o.size || 1) * PX, grav: o.grav || 0, drag: o.drag == null ? 0.9 : o.drag });
  }

  function burst(x, y, color, n = 8, power = 110) {
    n = Math.max(1, Math.round(n * DENS[q()]));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, s = G.U.rand(power * 0.35, power);
      px(x, y, color, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: G.U.rand(0.22, 0.5), size: Math.random() < 0.35 ? 2 : 1 });
    }
  }

  function spark(x, y, color, dirX, dirY, n = 4) {
    n = Math.max(1, Math.round(n * DENS[q()]));
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = base + G.U.rand(-0.9, 0.9), s = G.U.rand(60, 170);
      px(x, y, color, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: G.U.rand(0.14, 0.32) });
    }
  }

  /**
   * Sprite de efecto suelto. o: { vx, vy, life, scale, angle, spin, grav, frameRate, fade, delay }
   * 2026-10-20: `follow` (un enemigo) lo pega encima de su cabeza (+ ox, oy) mientras viva; `orbit`
   * (radio) lo hace girar alrededor (estrellas de aturdido), `bob` lo hace botar (en píxeles de arte).
   * `delay`: no se ve hasta pasados esos segundos (golpes en cadena del mismo movimiento).
   */
  function sp(shape, pal, x, y, o = {}) {
    if (sprites.length >= CAP_SPRITES[q()]) return;
    sprites.push({ shape, pal, x, y, vx: o.vx || 0, vy: o.vy || 0, t: -(o.delay || 0), life: o.life || 0.4,
                   scale: o.scale || 1, angle: o.angle || 0, spin: o.spin || 0, grav: o.grav || 0,
                   fr: o.frameRate || 10, fade: o.fade !== false,
                   fo: o.follow || null, ox: o.ox || 0, oy: o.oy || 0, orb: o.orbit || 0, ph: o.phase || 0, bob: o.bob || 0 });
  }

  /** Centelleo de shiny (cruz de píxeles que nace y se apaga). */
  function twinkle(x, y) {
    if (sprites.length >= CAP_SPRITES[q()]) return;
    sprites.push({ twinkle: true, x, y, vx: 0, vy: -8, t: 0, life: G.U.rand(0.45, 0.7) });
  }

  /** Partículas de estela de los proyectiles, según el material. */
  function trail(kind, pal, x, y, vx, vy) {
    if (Math.random() > DENS[q()]) return;          // en calidad baja, menos estela
    const P = G.VFX.PAL[pal] || G.VFX.PAL.normal;
    const back = Math.atan2(-vy, -vx);
    const j = () => G.U.rand(-3, 3);
    switch (kind) {
      case 'ember':   px(x + j(), y + j(), P[Math.random() < 0.5 ? 3 : 2], { vx: Math.cos(back) * 30, vy: -40, life: 0.35 }); break;
      case 'drip':    px(x + j(), y + j(), P[3], { vx: Math.cos(back) * 20, vy: 10, grav: 260, life: 0.35 }); break;
      case 'spark':   px(x + j() * 2, y + j() * 2, Math.random() < 0.5 ? P[4] : P[3], { vx: G.U.rand(-60, 60), vy: G.U.rand(-60, 60), life: 0.16 }); break;
      case 'bubbles': px(x + j(), y + j(), P[3], { vy: -35, life: 0.45, size: Math.random() < 0.3 ? 2 : 1 }); break;
      case 'dirt':    px(x + j(), y + j(), P[Math.random() < 0.5 ? 2 : 1], { vx: Math.cos(back) * 25, vy: -20, grav: 300, life: 0.35 }); break;
      case 'wisp':    px(x + j() * 2, y + j() * 2, P[Math.random() < 0.5 ? 1 : 2], { vy: -30, life: 0.5, size: 2 }); break;
      // Boniato Rodante (2026-10-20): chispas amarillas y blancas que saltan, y migas tostadas en el suelo.
      case 'zap':     px(x + j() * 2, y + j() * 2, Math.random() < 0.5 ? '#ffffff' : '#fff36a', { vx: G.U.rand(-90, 90), vy: G.U.rand(-90, 40), life: 0.18, size: Math.random() < 0.3 ? 2 : 1 });
                      if (Math.random() < 0.4) px(x + j(), y + 8, P[1], { vx: Math.cos(back) * 20, life: 0.4 });
                      break;
    }
  }

  function dmgText(x, y, value, color = '#ffffff', big = false) {
    // Con cientos de golpes por segundo no se leen igual: tope de 70 (los
    // grandes, como "¡Muy eficaz!" o los de jefe, siempre entran).
    // Ajustes → "Números de daño": los números se ocultan; los avisos de texto no.
    if ((typeof value === 'number' || /^-\d/.test(value)) && !G.Settings.get('dmgNumbers')) return;
    if (texts.length >= CAP_TEXTS[q()]) { if (!big) return; texts.shift(); }
    texts.push({ x: x + G.U.rand(-6, 6), y, vy: -46, t: 0, life: big ? 0.95 : 0.62, s: value, color, big });
  }

  /** Anillo de onda (puntos de píxel). */
  function ring(x, y, r0, r1, color, life = 0.3, width = 3) {
    rings.push({ x, y, r0, r1, color, life, t: 0, width });
  }

  /** Golpe cuerpo a cuerpo. fx: { pal, melee } (ver G.VFX.forMove). */
  function slash(x, y, angle, radius, arc, color, fx = {}) {
    const pal = fx.pal || 'normal';
    slashes.push({ x, y, angle, radius, arc, pal, t: 0, life: 0.22 });
    const mx = x + Math.cos(angle) * radius * 0.7, my = y + Math.sin(angle) * radius * 0.7;
    switch (fx.melee) {
      case 'impact': sp('impact', pal, mx, my, { life: 0.2, scale: 1.5, frameRate: 12, fade: false }); break;
      case 'jaws':   sp('jaws', pal, mx, my, { life: 0.24, scale: 1.5, frameRate: 9, fade: false }); break;
      case 'claw':   sp('claw', pal, mx, my, { life: 0.2, scale: 1.5, angle: angle - Math.PI / 4 }); break;
      case 'vine':
      case 'feather':
        for (let i = 0; i < 4; i++) {
          const a = angle + G.U.rand(-arc / 2, arc / 2), r = radius * G.U.rand(0.5, 1);
          sp('leaf', fx.melee === 'feather' ? 'flying' : pal, x + Math.cos(a) * r, y + Math.sin(a) * r,
             { vx: Math.cos(a) * 40, vy: Math.sin(a) * 40 + 20, life: 0.45, spin: G.U.rand(-8, 8), grav: 60 });
        }
        break;
    }
  }

  /** Rayo recto. fx: { pal, beam } — beam = forma que viaja por él o 'lightning'. */
  function beam(x, y, angle, len, width, color, fx = {}) {
    beams.push({ x, y, angle, len, width, pal: fx.pal || 'normal', shape: fx.beam || null, t: 0, life: 0.2, seed: Math.random() * 100 });
    sp('impact', fx.pal || 'normal', x + Math.cos(angle) * 10, y + Math.sin(angle) * 10, { life: 0.12, scale: 1 });
    sp('impact', fx.pal || 'normal', x + Math.cos(angle) * len, y + Math.sin(angle) * len, { life: 0.18, scale: 1.5 });
  }

  // ---------------- actualización ----------------

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k; p.vy *= k;
    }
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i];
      s.t += dt;
      if (s.t >= s.life || (s.fo && s.fo.dead)) { sprites.splice(i, 1); continue; }
      if (s.t < 0) continue;                                       // aún esperando (delay)
      if (s.fo) {
        const e = s.fo, a = s.ph + s.t * 7;
        s.x = e.x + s.ox + (s.orb ? Math.cos(a) * s.orb : 0);
        s.y = e.y - (e.bodyH || 20) - (e.jumpLift || 0) + s.oy + (s.orb ? Math.sin(a) * s.orb * 0.35 : 0)
            + (s.bob ? Math.round(Math.sin(s.t * 9)) * s.bob * PX : 0);
        if (s.spin) s.angle += s.spin * dt;
        continue;
      }
      s.vy += (s.grav || 0) * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.spin) s.angle += s.spin * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.t += dt;
      if (t.t >= t.life) { texts.splice(i, 1); continue; }
      t.y += t.vy * dt; t.vy *= 0.94;
    }
    for (const arr of [rings, slashes, beams, bolts]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].t += dt;
        if (arr[i].t >= arr[i].life) arr.splice(i, 1);
      }
    }
  }

  // ---------------- rayos de píxeles (2026-10-16: Caída de Rayo) ----------------

  /** Zigzag de (x1,y1) a (x2,y2): puntos con desvío lateral `jag`, quieto en los extremos. */
  function zig(x1, y1, x2, y2, n, jag) {
    const pts = [], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (let i = 0; i <= n; i++) {
      const t = i / n, o = i === 0 || i === n ? 0 : G.U.rand(-jag, jag);
      pts.push([x1 + dx * t + nx * o, y1 + dy * t + ny * o]);
    }
    return pts;
  }
  /**
   * Rayo que cae del cielo sobre (x, y): zigzag en bloques de píxel (borde oscuro, halo
   * amarillo, núcleo blanco), con 1-2 ramas, que parpadea y se apaga. o: { h, life, pal }
   */
  function bolt(x, y, o = {}) {
    const h = o.h || 300, top = x + G.U.rand(-40, 40);
    const main = zig(top, y - h, x, y, 10, 14);
    const branches = [];
    for (let b = 0; b < 1 + (Math.random() < 0.6 ? 1 : 0); b++) {
      const i = 3 + Math.floor(Math.random() * 5), [bx, by] = main[i], side = Math.random() < 0.5 ? -1 : 1;
      branches.push(zig(bx, by, bx + side * G.U.rand(30, 60), by + G.U.rand(30, 70), 3, 8));
    }
    bolts.push({ lines: [main, ...branches], t: 0, life: o.life || 0.26, pal: o.pal || 'electric', w: 1 });
  }
  /** Descarga corta entre dos puntos (cadenas eléctricas): se redibuja con otra forma cada vez. */
  function arc(x1, y1, x2, y2, o = {}) {
    const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 22));
    bolts.push({ lines: [zig(x1, y1, x2, y2, n, 9)], t: 0, life: o.life || 0.12, pal: o.pal || 'electric', w: 0 });
  }
  /** Trazo grueso a bloques (alineado a la rejilla de píxeles). */
  function blockLine(ctx, a, b, size) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / PX));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      ctx.fillRect(snap(a[0] + (b[0] - a[0]) * t) - size / 2, snap(a[1] + (b[1] - a[1]) * t) - size / 2, size, size);
    }
  }
  function drawBolt(ctx, b) {
    const k = 1 - b.t / b.life;
    // Parpadeo: un fotograma de cada pocos se apaga el núcleo (como un rayo de verdad).
    const flick = Math.floor(b.t * 45) % 4 === 3;
    const P = G.VFX.PAL[b.pal] || G.VFX.PAL.normal;
    const W = b.w ? [PX * 6, PX * 4, PX * 2] : [PX * 4, PX * 2.5, PX];
    ctx.save();
    // Entero casi todo el tiempo; sólo el final se apaga (a medias se veía lavado).
    ctx.globalAlpha = k > 0.35 ? 1 : 0.6;
    const glow = P[2] || '#ffd21a';
    const layers = [['#1a1430', W[0]], [glow, W[1]], [flick ? glow : '#ffffff', W[2]]];
    for (const [col, size] of layers) {
      ctx.fillStyle = col;
      b.lines.forEach((pts, li) => {
        const s = li ? size * 0.66 : size;          // las ramas, más finas
        for (let i = 1; i < pts.length; i++) blockLine(ctx, pts[i - 1], pts[i], Math.max(PX, snap(s)));
      });
    }
    ctx.restore();
  }

  // ---------------- dibujo ----------------

  // La transparencia va a escalones (1 · ,66 · ,33) para que no parezca vectorial.
  const step = k => k > 0.66 ? 1 : k > 0.33 ? 0.66 : 0.33;

  function drawBeam(ctx, b) {
    const k = 1 - b.t / b.life;
    const P = G.VFX.PAL[b.pal] || G.VFX.PAL.normal;
    const a = Math.round(b.angle / (Math.PI / 16)) * (Math.PI / 16);
    ctx.save();
    ctx.translate(snap(b.x), snap(b.y));
    ctx.rotate(a);
    ctx.globalAlpha = step(k);
    const seg = PX * 2, now = performance.now() / 1000;

    if (b.shape === 'lightning') {
      // Zigzag que se redibuja cada fotograma.
      let py = 0;
      for (let d = 0; d < b.len; d += seg) {
        const ny = d + seg >= b.len ? 0 : snap((G.U.hash(d | 0, (now * 30) | 0, b.seed | 0) - 0.5) * b.width);
        const lo = Math.min(py, ny), hi = Math.max(py, ny);
        ctx.fillStyle = P[3]; ctx.fillRect(d - PX, lo - PX * 2, seg + PX * 2, hi - lo + PX * 4);
        ctx.fillStyle = P[4]; ctx.fillRect(d, lo - PX, seg, hi - lo + PX * 2);
        py = ny;
      }
    } else {
      // Cuerpo del rayo a bloques, con el borde vibrando.
      for (let d = 0; d < b.len; d += seg) {
        const wob = 0.7 + 0.3 * Math.sin(d * 0.18 + now * 30 + b.seed);
        const hw = Math.max(PX, snap(b.width / 2 * wob * (0.6 + 0.4 * k)));
        ctx.fillStyle = P[1]; ctx.fillRect(d, -hw - PX, seg, hw * 2 + PX * 2);
        ctx.fillStyle = P[2]; ctx.fillRect(d, -hw, seg, hw * 2);
        ctx.fillStyle = P[3]; ctx.fillRect(d, -snap(hw * 0.55), seg, snap(hw * 0.55) * 2);
        ctx.fillStyle = P[4]; ctx.fillRect(d, -PX, seg, PX * 2);
      }
      // Sprites que viajan por el rayo (llamas, gotas, cristales, ondas).
      if (b.shape) {
        const gap = 26, off = (now * 420) % gap;
        for (let d = off; d < b.len - 6; d += gap) {
          const yo = Math.sin(d * 0.3 + b.seed) * b.width * 0.18;
          G.VFX.draw(ctx, b.shape, b.pal, d, yo, { angle: 0.0001, scale: 1.5, frame: (d / gap + now * 12) | 0 });
        }
      }
    }
    ctx.restore();
  }

  function drawSlash(ctx, s) {
    const k = 1 - s.t / s.life;
    const P = G.VFX.PAL[s.pal] || G.VFX.PAL.normal;
    const half = Math.min(s.arc, 6.2832) / 2;
    const r = s.radius * (0.72 + 0.28 * (1 - k));
    const n = Math.max(8, Math.ceil(r * half * 2 / PX));
    ctx.globalAlpha = step(k);
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = s.angle - half + u * half * 2;
      const thick = Math.round(Math.sin(Math.PI * u) * 3 * k);      // grosor en píxeles de arte
      for (let j = -1; j <= thick; j++) {
        const rr = r - j * PX;
        ctx.fillStyle = j < 0 ? P[1] : j === thick ? P[4] : j > thick / 2 ? P[3] : P[2];
        ctx.fillRect(snap(s.x + Math.cos(a) * rr), snap(s.y + Math.sin(a) * rr), PX, PX);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRing(ctx, r) {
    const k = r.t / r.life;
    const rad = G.U.lerp(r.r0, r.r1, k);
    const n = Math.max(10, Math.ceil(rad * 6.2832 / (PX * 2)));
    const size = r.width >= 4 ? PX * 2 : PX;
    ctx.globalAlpha = step(1 - k);
    ctx.fillStyle = r.color;
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832;
      ctx.fillRect(snap(r.x + Math.cos(a) * rad), snap(r.y + Math.sin(a) * rad * 0.9), size, size);
    }
    ctx.globalAlpha = 1;
  }

  function draw(ctx) {
    for (const b of beams) drawBeam(ctx, b);
    for (const b of bolts) drawBolt(ctx, b);
    for (const s of slashes) drawSlash(ctx, s);
    for (const r of rings) drawRing(ctx, r);

    for (const p of parts) {
      ctx.globalAlpha = step(1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(snap(p.x), snap(p.y), p.s, p.s);
    }
    ctx.globalAlpha = 1;

    for (const s of sprites) {
      if (s.t < 0) continue;
      const k = 1 - s.t / s.life;
      if (s.twinkle) { G.Icons.twinkle(ctx, s.x, s.y, s.t / s.life, PX); continue; }
      G.VFX.draw(ctx, s.shape, s.pal, s.x, s.y, {
        angle: s.angle, scale: s.scale, alpha: s.fade ? step(k) : 1,
        frame: Math.floor(s.t * s.fr)
      });
    }

    // Números de daño.
    for (const t of texts) {
      const k = 1 - t.t / t.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = (t.big ? '700 20px' : '700 13px') + ' Pixelify,"Segoe UI",sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(t.s, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.s, t.x, t.y);
      ctx.restore();
    }
  }

  return { clear, px, burst, spark, sp, twinkle, trail, dmgText, ring, slash, beam, bolt, arc, update, draw,
           get count() { return parts.length + sprites.length + texts.length; } };
})();
