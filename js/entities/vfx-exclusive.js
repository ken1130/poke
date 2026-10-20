/* ============ vfx-exclusive.js — cómo se ven los exclusivos de los personajes originales ============
 * 2026-10-20 (el dueño: «los movimientos exclusivos no se notan y los efectos parecen sin acabar»).
 * Sólo dibujo: combat.js decide a quién se golpea y cuánto, y llama aquí para pintarlo. Todo en
 * píxel (sprites de G.VFX y bloques de G.Sprites.PX), escalas 1 / 1,5 / 2 (3 sólo la sartén furiosa),
 * y el evolucionado siempre más grande y con un detalle más que el Lv1.
 * En grupo combat.js repite los movimientos de los demás como «fantasma», así que estas llamadas
 * también salen en las pantallas de los invitados.
 */
G.ExVFX = (() => {
  const PX = G.Sprites.PX;
  const snap = v => Math.round(v / PX) * PX;
  const step = k => k > 0.66 ? 1 : k > 0.33 ? 0.66 : 0.33;
  const sees = (x, y, m) => G.Camera.sees(x, y, m);
  const headY = o => o.y - (o.bodyH || 20) - (o.jumpLift || 0);

  // ---------------- Panda · Pregunta Curiosa ----------------
  /** «?» que vuela a cada uno y un bocadillo de «pensando» encima mientras se queda quieto. */
  function question(pl, list, R, stun, evo) {
    const sx = pl.x, sy = headY(pl) + 4, sc = evo ? 2 : 1.5;
    if (evo && sees(pl.x, pl.y, R)) {
      // Evolucionado: corona de interrogaciones que sale de ti hasta el borde del radio.
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * 6.2832;
        G.FX.sp('qmark', 'electric', pl.x + Math.cos(a) * 12, pl.y - 10 + Math.sin(a) * 8,
                { vx: Math.cos(a) * R * 2.6, vy: Math.sin(a) * R * 1.6, life: 0.36, scale: 1 });
      }
      G.FX.ring(pl.x, pl.y, 8, R, '#fff36a', 0.35, 4);
    }
    list.forEach((e, i) => {
      const ex = e.x, ey = headY(e) - 10;
      if (!sees(ex, ey, 30)) return;
      if (i < 12) {
        const T = 0.16;
        G.FX.sp('qmark', 'electric', sx, sy, { vx: (ex - sx) / T, vy: (ey - sy) / T, life: T, scale: sc, spin: 9, fade: false });
        G.FX.sp('impact', 'electric', ex, ey + 6, { life: 0.16, scale: 1.5, frameRate: 12, delay: T });
      }
      G.FX.sp('thinkbub', 'normal', ex, ey, { follow: e, oy: -24, life: Math.max(0.6, stun), scale: sc, bob: 1, delay: 0.14 });
    });
  }

  // ---------------- Boniato · Boniato Rodante ----------------
  /** Cómo se ve la bola (combat.js la pasa como `vis` y `scale` del proyectil). */
  const SPUD = { proj: 'spud', pal: 'spud', trail: 'zap' };
  function rollStart(pl, a, evo) {
    if (!sees(pl.x, pl.y, 40)) return;
    G.FX.sp('impact', 'electric', pl.x + Math.cos(a) * 14, pl.y - 8 + Math.sin(a) * 10, { life: 0.14, scale: evo ? 2 : 1.5 });
  }
  /** Descarga del evolucionado: estallido en el golpeado y rayos de píxel a los de alrededor. */
  function zap(e, others) {
    const ex = e.x, ey = e.y - e.bodyH * 0.5;
    if (!sees(ex, ey, 80)) return;
    G.FX.sp('pow', 'electric', ex, ey, { life: 0.16, scale: 1.5, frameRate: 14, fade: false });
    for (const o of others) G.FX.arc(ex, ey, o.x, o.y - o.bodyH * 0.5, { life: 0.14 });
  }

  // ---------------- Didi · Puño Espuma ----------------
  function foam(e, a, SR, evo) {
    const ca = Math.cos(a), sa = Math.sin(a), ex = e.x, ey = e.y - e.bodyH * 0.5, T = 0.1;
    G.FX.sp('fist', 'water', ex - ca * 34, ey - sa * 34, { vx: ca * 300, vy: sa * 300, life: T + 0.03, angle: a, fade: false, scale: 2 });
    G.FX.sp('foamburst', 'water', ex, ey, { life: 0.27, scale: evo ? 2 : 1.5, frameRate: 11, fade: false, delay: T });
    G.FX.sp('impact', 'water', ex + ca * 6, ey + sa * 6, { life: 0.12, scale: 1.5, delay: T });
    G.FX.ring(e.x, e.y, 6, SR, '#eaf7ff', 0.3, 4);
    const n = evo ? 9 : 6;
    for (let k = 0; k < n; k++) {
      const b = k / n * 6.2832 + Math.random() * 0.5, s = SR * G.U.rand(1.6, 2.4);
      G.FX.sp('suds', 'water', ex, ey, { vx: Math.cos(b) * s, vy: Math.sin(b) * s * 0.6 - 90, grav: 320,
                                         life: 0.5, scale: Math.random() < 0.4 ? 1.5 : 1, delay: T });
    }
    for (let k = 0; k < 3; k++) {
      G.FX.sp('bubble', 'water', e.x + G.U.rand(-SR, SR) * 0.6, e.y - 6 + G.U.rand(-6, 6),
              { vy: -40, life: 0.6, frameRate: 6, delay: T + 0.1 });
    }
  }

  // ---------------- Héroe · Pelos de Punta ----------------
  function scare(pl, R, evo) {
    const hx = pl.x, hy = pl.y - 8;
    G.FX.sp('exclaim', 'electric', pl.x, pl.y, { follow: pl, oy: -14, life: 0.55, scale: 2, bob: 1, fade: false });
    [-0.5, 0, 0.5].forEach((a, i) => {
      G.FX.sp('hairspike', 'normal', pl.x, pl.y, { follow: pl, ox: (i - 1) * 14, oy: 14 - (i === 1 ? 4 : 0), angle: a, life: 0.45, scale: 2, fade: false });
    });
    if (!sees(hx, hy, R)) return;
    // Onda: medias lunas que salen hacia fuera (empujan), y polvo a ras de suelo.
    const waves = evo ? [['ice', 0, 2], ['electric', 0.09, 1.5]] : [['ice', 0, 1.5]];
    for (const [pal, delay, sc] of waves) {
      const n = evo ? 16 : 12;
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.2832;
        G.FX.sp('crescent', pal, hx + Math.cos(a) * 12, hy + Math.sin(a) * 9,
                { vx: Math.cos(a) * R * 3.4, vy: Math.sin(a) * R * 2.4, angle: a, life: 0.28, scale: sc, delay, fade: false });
      }
    }
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * 6.2832 + 0.4;
      G.FX.sp('puff', 'normal', hx + Math.cos(a) * 16, pl.y + Math.sin(a) * 8, { vx: Math.cos(a) * 110, vy: Math.sin(a) * 60, life: 0.32, frameRate: 9 });
    }
    G.FX.ring(pl.x, pl.y, 8, R, '#fff3c0', 0.32, 5);
    if (evo) G.FX.ring(pl.x, pl.y, 4, R * 0.7, '#fff36a', 0.26, 4);
  }

  // ---------------- Turbo Abuela · Turbo Fantasma ----------------
  /** Parada: anillo de fuegos fantasma que se abre hasta el radio. */
  function ghostWave(pl, R, evo) {
    if (!sees(pl.x, pl.y, R)) return;
    const n = evo ? 12 : 9;
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.2832;
      G.FX.sp('flame', 'spirit', pl.x + Math.cos(a) * R * 0.55, pl.y - 8 + Math.sin(a) * R * 0.35,
              { vx: Math.cos(a) * R * 1.8, vy: Math.sin(a) * R * 1.1, life: 0.3, scale: evo ? 1.5 : 1, frameRate: 12 });
    }
    G.FX.ring(pl.x, pl.y, 6, R, '#d2c4ff', 0.28, 4);
  }
  /** En marcha: rayas de velocidad violetas por el tramo que ha atravesado. */
  function dashTrail(px, py, x, y) {
    if (!sees(x, y, 200)) return;
    const a = Math.atan2(y - py, x - px);
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      G.FX.sp('streak', 'spirit', px + (x - px) * t, py + (y - py) * t - 12 + G.U.rand(-8, 8), { angle: a, life: 0.24, scale: 1.5 });
    }
  }
  const GHOST_TINT = 'grayscale(1) sepia(1) hue-rotate(205deg) saturate(3.2) brightness(1.15)';
  /** La sombra: su sprite teñido de violeta, fuegos fantasma en los pies y el borde de su zona a puntos. */
  function drawShade(ctx, f, now) {
    const k = Math.max(0, 1 - f.t / f.life), st = step(k), evo = !!f.row.boom;
    const an = f.owner.anim;
    ctx.fillStyle = '#9a7cff';
    ctx.globalAlpha = 0.7 * st;
    G.VFX.dashOval(ctx, f.x, f.y, f.r, f.r * 0.55, Math.floor(now * 8), 2, 2);
    ctx.globalAlpha = 1;
    // Evolucionado: parpadea en blanco justo antes de estallar.
    const blink = evo && f.life - f.t < 0.3 && Math.floor(now * 16) % 2 === 0;
    if (an) { const d = an.dir; an.dir = f.dir; an.draw(ctx, f.x, f.y, { alpha: 0.66 * st, tint: GHOST_TINT, flash: blink, softFlash: true }); an.dir = d; }
    for (let i = 0; i < (evo ? 4 : 3); i++) {
      const b = i / (evo ? 4 : 3) * 6.2832 + now * 2.5;
      G.VFX.draw(ctx, 'flame', 'spirit', f.x + Math.cos(b) * f.r * 0.6, f.y - 6 + Math.sin(b) * f.r * 0.3,
                 { frame: Math.floor(now * 10) + i, alpha: st * (Math.sin(b) > 0 ? 1 : 0.66), scale: evo ? 1.5 : 1 });
    }
  }
  function shadeBoom(f) {
    if (!sees(f.x, f.y, f.r * 1.4)) return;
    G.FX.sp('pow', 'spirit', f.x, f.y - 14, { life: 0.22, scale: 2, frameRate: 12, fade: false });
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * 6.2832;
      G.FX.sp('flame', 'spirit', f.x, f.y - 10, { vx: Math.cos(a) * f.r * 3.5, vy: Math.sin(a) * f.r * 2.2, life: 0.3, scale: 1.5, frameRate: 12 });
    }
    G.FX.ring(f.x, f.y, 4, f.r * 1.4, '#d2c4ff', 0.25, 4);
  }

  // ---------------- Tom · Caza Ratones ----------------
  function pounce(e, a, n, evo) {
    const ex = e.x, ey = e.y - e.bodyH * 0.5, sc = evo ? 2 : 1.5;
    for (let k = 0; k < n; k++) {
      // Zarpazos uno tras otro, cada uno en el sentido contrario al anterior (se cruzan en X).
      const d = k * 0.08;
      G.FX.sp('scratch', 'scratch', ex + G.U.rand(-4, 4), ey + G.U.rand(-4, 4),
              { life: 0.2, scale: sc, angle: a - Math.PI / 4 + (k % 2 ? Math.PI / 2 : 0), frameRate: 15, fade: false, delay: d });
      G.FX.sp('impact', 'scratch', ex + G.U.rand(-6, 6), ey + G.U.rand(-6, 6), { life: 0.12, scale: 1.5, delay: d + 0.05 });
    }
    // Evolucionado: el último cruza en X, más grande.
    if (evo) G.FX.sp('scratch', 'scratch', ex, ey, { life: 0.3, scale: 2, angle: a, frameRate: 10, fade: false, delay: n * 0.08 });
    G.FX.spark(ex, ey, '#e8b0ff', Math.cos(a), Math.sin(a), 6);
  }
  function pounceHop(fx, fy, nx) {
    G.FX.sp('streak', 'scratch', (fx + nx.x) / 2, (fy + nx.y) / 2 - 10, { life: 0.18, angle: Math.atan2(nx.y - fy, nx.x - fx), scale: 2 });
  }

  // ---------------- Lika · Lengüetazo Látigo ----------------
  /** Babas venenosas que gotean por donde pasa la lengua. */
  function tongueDrool(x, y, a, len, evo) {
    if (!sees(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2, len)) return;
    const P = G.VFX.PAL.poison, n = evo ? 9 : 6;
    for (let k = 1; k <= n; k++) {
      const d = len * k / (n + 1);
      G.FX.px(x + Math.cos(a) * d, y - 12 + Math.sin(a) * d, k % 2 ? P[3] : P[2], { vy: 20, grav: 320, life: 0.45, size: k % 3 ? 1 : 2 });
    }
    G.FX.sp('bubble', 'poison', x + Math.cos(a) * len, y - 12 + Math.sin(a) * len, { vy: -30, life: 0.5, frameRate: 6, delay: 0.12, scale: evo ? 1.5 : 1 });
  }
  /** La lengua: sale y vuelve (0,3 s), gruesa, con contorno, brillo arriba y la punta como sprite. */
  function drawTongue(ctx, f, now) {
    const k = f.t < 0.12 ? f.t / 0.12 : Math.max(0, 1 - (f.t - 0.12) / 0.18);
    const L = f.len * k, cx = Math.cos(f.a), cy = Math.sin(f.a), evo = f.row.n > 1;
    const ox = f.owner.x, oy = f.owner.y - (f.owner.bodyH || 20) * 0.55;
    const P = G.VFX.PAL.tongue, half = evo ? 4 : 3;               // medio grosor en píxeles de arte
    const wave = Math.sin(now * 30) * 4;
    let lx = ox, ly = oy;
    const pts = [];
    for (let d = 0; d < L; d += PX * 2) {
      const w = Math.sin(d / 18 + now * 20) * wave * (d / (L + 1));
      pts.push(snap(ox + cx * d - cy * w), snap(oy + cy * d + cx * w));
    }
    // Tres pasadas (contorno, cuerpo, brillo) para que el contorno no tape el cuerpo del tramo anterior.
    const layers = [[P[0], half + 1, 0], [P[2], half, 0], [P[3], 1, -half + 1]];
    for (const [col, h, off] of layers) {
      ctx.fillStyle = col;
      const s = h * 2 * PX;
      for (let i = 0; i < pts.length; i += 2) {
        lx = pts[i]; ly = pts[i + 1] + off * PX;
        ctx.fillRect(lx - s / 2, ly - s / 2, s, s);
      }
    }
    if (pts.length) G.VFX.draw(ctx, 'ttip', 'tongue', ox + cx * L, oy + cy * L, { angle: f.a || 0.0001, scale: evo ? 2 : 1.5 });
  }

  // ---------------- Jerry · Sartenazo ----------------
  function pan(e, a, hits, evo) {
    const ex = e.x, ey = e.y - e.bodyH * 0.6, sc = evo ? 3 : 2;
    for (let k = 0; k < hits; k++) {
      const d = k * 0.12;
      // La sartén cae girando sobre la cabeza y, al tocar, «¡PAM!» amarillo.
      G.FX.sp('pan', 'steel', ex - Math.cos(a) * 10, ey - 30, { vy: 160, life: 0.14, scale: sc, angle: a - 1.3 + k * 0.3, spin: 9, fade: false, delay: d });
      G.FX.sp('pow', 'electric', ex, ey - 8, { life: 0.16, scale: evo ? 2 : 1.5, frameRate: 14, fade: false, delay: d + 0.13 });
      G.FX.sp('impact', 'steel', ex + G.U.rand(-6, 6), ey + G.U.rand(-6, 6), { life: 0.14, scale: 1.5, delay: d + 0.13 });
    }
  }
  /** Aturdido: estrellas amarillas que giran sobre la cabeza mientras dura. */
  function stunStars(e, t) {
    for (let k = 0; k < 3; k++) {
      G.FX.sp('star', 'electric', e.x, e.y, { follow: e, oy: -6, orbit: 14, phase: k * 2.094, life: Math.max(0.5, t), spin: 4, delay: 0.2 });
    }
  }
  function panSplash(e, r) {
    G.FX.ring(e.x, e.y, 8, r, '#ffffff', 0.25, 4);
  }

  return { question, SPUD, rollStart, zap, foam, scare, ghostWave, dashTrail, drawShade, shadeBoom,
           pounce, pounceHop, tongueDrool, drawTongue, pan, stunStars, panSplash };
})();
