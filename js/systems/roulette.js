/* ============ roulette.js — la ruleta de Kecleon (2026-10-15) ============
 * En la tienda de Kecleon hay una ruleta: apuestas parte de las monedas de la run
 * (25 %, 50 % o todo) y la ruleta decide: perderlo todo, la mitad, quedarte igual,
 * ×1,5, ×2, ×3 o ¡×5! Tres tiradas por tienda.
 *
 * 20 casillas (probabilidad = casillas / 20): ×0 7 · ×0,5 3 · ×1 4 · ×1,5 2 · ×2 2 · ×3 1 · ×5 1.
 * Valor esperado ≈ 1,03: casi justo, pero con mucha emoción.
 *
 * Cooperativo: las monedas son del grupo (las lleva el anfitrión). El invitado pide la
 * tirada (['dg', 'spin', tienda, parte]) y el anfitrión decide la casilla y le contesta
 * (['dg', 'spun', casilla, diferencia, quedan]); todos ven el aviso.
 */
G.Roulette = (() => {
  const $ = id => document.getElementById(id);
  const SLOTS = [0, 1, 0.5, 1.5, 0, 2, 1, 0, 0.5, 3, 0, 1, 1.5, 0, 2, 0.5, 0, 1, 5, 0];
  // Colores sobrios (2026-10-15: antes uno por premio y quedaba muy chillón): casillas
  // alternas granate / crema como una ruleta de verdad, ×0 en oscuro y sólo ×3 y ×5 en oro.
  const slotCol = i => { const k = SLOTS[i]; return k === 0 ? '#2b2433' : k >= 3 ? '#e0a92e' : i % 2 ? '#e9dcb8' : '#8c2f35'; };
  const slotInk = i => { const c = slotCol(i); return c === '#e9dcb8' || c === '#e0a92e' ? '#3a2410' : '#ffffff'; };
  const SPINS = 3, MIN_COINS = 10;
  const label = k => (k === 0 ? '×0' : '×' + String(k).replace('.', ','));

  let cur = null;         // { site, done, angle, anim }
  let buf = null;         // lienzo pequeño (pixel art) de la rueda

  // ---------------- anfitrión: decide ----------------
  /** Anfitrión: tirada de `who` (null = tú). Devuelve { idx, delta, left } o null. */
  function hostSpin(site, frac, who) {
    if (!site || site.type !== 'shop' || (site.state !== 'open' && site.state !== 'free')) return null;
    site.spins = site.spins == null ? SPINS : site.spins;
    if (site.spins <= 0) return null;
    const host = G.Game.player, coins = Math.floor(host.coins || 0);
    if (coins < MIN_COINS) return null;
    const bet = Math.max(1, Math.floor(coins * frac));
    const idx = Math.floor(Math.random() * SLOTS.length);
    const win = Math.floor(bet * SLOTS[idx]);
    const delta = win - bet;
    host.coins = coins + delta;
    site.spins--;
    const name = who ? ((G.Game.everyone().find(p => p.uid === who) || {}).tag || '') : '';
    const k = SLOTS[idx];
    const msg = k === 0 ? '¡La ruleta se lo ha llevado todo! Kecleon se ríe' : k >= 2 ? '¡Premio en la ruleta! ' + label(k) : 'Ruleta: ' + label(k);
    if (G.Coop.active) G.Coop.broadcast(['dg', 'say', (name ? name + ': ' : '') + msg, 3]);
    return { idx, delta, left: site.spins, msg };
  }

  // ---------------- ventana ----------------
  /** Se abre desde el menú de la tienda (en el refugio: el juego no se para). */
  function open(site, onClose) {
    if (cur || !site) return;
    {
      const done = onClose || (() => {});
      cur = { site, done, angle: 0, anim: null, left: site.spins == null ? SPINS : site.spins };
      $('roul-res').textContent = '';
      $('roul-res').className = 'roul-res';
      render();
      for (const b of document.querySelectorAll('#scr-roul [data-frac]')) b.onclick = () => spin(+b.dataset.frac);
      $('roul-leave').onclick = close;
      $('scr-roul').classList.remove('hidden');     // (sin G.UI.show: no cierra las cartas u objetos abiertos)
      G.Audio.sfx('select');
      draw();
    }
  }
  function close() {
    if (!cur || cur.anim) return;
    G.UI.hide('scr-roul');
    const d = cur.done; cur = null;
    d();
  }
  function render() {
    const pl = G.Game.player, coins = Math.floor(pl.coins || 0);
    $('roul-sub').textContent = G.I18n.f('Monedas de esta run: {x} · Tiradas: {x}', coins, cur.left);
    const can = !cur.anim && cur.left > 0 && coins >= MIN_COINS;
    for (const b of document.querySelectorAll('#scr-roul [data-frac]')) {
      b.disabled = !can;
      const bet = Math.max(1, Math.floor(coins * +b.dataset.frac));
      b.querySelector('small').textContent = coins >= MIN_COINS ? bet + ' ' + G.T('monedas') : '';
    }
    $('roul-leave').disabled = !!cur.anim;
    if (coins < MIN_COINS && !cur.anim) $('roul-res').textContent = G.I18n.f('Necesitas al menos {x} monedas', MIN_COINS);
  }

  function spin(frac) {
    if (!cur || cur.anim) return;
    if (G.Coop.active && !G.Coop.isHost) { cur.anim = { wait: true }; render(); G.Coop.request(['dg', 'spin', cur.site.id, frac]); return; }
    const r = hostSpin(cur.site, frac, null);
    if (r) animate(r);
  }
  /** Invitado: llega la respuesta del anfitrión. */
  function onSpun(idx, delta, left) {
    if (!cur) return;
    if (idx < 0) { cur.anim = null; $('roul-res').textContent = G.T('No se puede girar ahora'); render(); return; }
    animate({ idx, delta, left });
  }

  function animate(r) {
    cur.left = r.left;
    // La casilla elegida acaba arriba (bajo la flecha), tras varias vueltas.
    const slot = 6.2832 / SLOTS.length;
    const target = -Math.PI / 2 - (r.idx + 0.5) * slot;
    const from = cur.angle % 6.2832;
    cur.anim = { t: 0, dur: 3.2, from, to: from + ((target - from) % 6.2832 + 6.2832) % 6.2832 + 6.2832 * 6, r, tick: 0 };
    $('roul-res').textContent = '';
    render();
    G.Audio.sfx('select');
    let last = performance.now();
    const step = now => {
      if (!cur || !cur.anim) return;
      const a = cur.anim, dt = (now - last) / 1000; last = now;
      a.t = Math.min(a.dur, a.t + dt);
      const k = 1 - Math.pow(1 - a.t / a.dur, 3);
      const ang = a.from + (a.to - a.from) * k;
      // Un "clic" cada casilla que pasa por la flecha.
      const cell = Math.floor(ang / slot);
      if (cell !== a.tick) { a.tick = cell; if (a.t < a.dur - 0.05) G.Audio.sfx('xp'); }
      cur.angle = ang;
      draw();
      if (a.t < a.dur) requestAnimationFrame(step);
      else finish(r);
    };
    requestAnimationFrame(step);
  }
  function finish(r) {
    const k = SLOTS[r.idx], pl = G.Game.player;
    cur.anim = null;
    const el = $('roul-res');
    el.className = 'roul-res ' + (k === 0 ? 'lose' : k >= 2 ? 'win' : '');
    el.textContent = label(k) + '  ' + (r.delta >= 0 ? '+' : '') + r.delta + ' ' + G.T('monedas') + (k === 0 ? '  ' + G.T('Kecleon se ríe…') : k >= 5 ? '  ' + G.T('¡¡PREMIO GORDO!!') : '');
    // Encima de tu Pokémon: +/- monedas, bien grande (verde si ganas, rojo si pierdes).
    if (pl) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 24, (r.delta >= 0 ? '+' : '') + r.delta + ' ' + G.T('monedas'), r.delta > 0 ? '#5fe08a' : r.delta < 0 ? '#ff5f6d' : '#ffe14d', true);
    if (k === 0) G.Audio.sfx('hurt');
    else if (k >= 2) { G.Audio.sfx(k >= 5 ? 'legend' : 'shiny'); if (pl) G.FX.burst(pl.x, pl.y - pl.bodyH, '#ffd23f', k >= 5 ? 50 : 24, 240); }
    else G.Audio.sfx('coin');
    if (r.msg) G.Spawner.say(G.T(r.msg), 3, true);
    render();
  }

  // ---------------- dibujo (pixel art: rueda pequeña escalada sin suavizar) ----------------
  function draw() {
    const cv = $('roul-wheel');
    if (!cv || !cur) return;
    const ctx = cv.getContext('2d'), W = cv.width, R = W / 2;
    const N = 64, s = W / N;               // la rueda se pinta en 64×64 y se escala ×(W/64)
    if (!buf) { buf = document.createElement('canvas'); buf.width = buf.height = N; }
    const b = buf.getContext('2d'), img = b.createImageData(N, N), px = new Uint32Array(img.data.buffer);
    const pack = h => { const n = parseInt(h.slice(1), 16); return (255 << 24 | (n & 255) << 16 | ((n >> 8) & 255) << 8 | (n >> 16)) >>> 0; };
    const slot = 6.2832 / SLOTS.length, c = N / 2 - 0.5;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      if (d > 31) continue;
      let col;
      if (d > 29) col = '#2a1a08';                                   // borde
      else if (d > 27) col = '#f2c443';                              // aro dorado
      else if (d < 4) col = d < 2.5 ? '#ffe9a0' : '#8a5a2b';         // centro
      else {
        let a = Math.atan2(dy, dx) - cur.angle; a = ((a % 6.2832) + 6.2832) % 6.2832;
        const i = Math.floor(a / slot), f = (a / slot) % 1;
        col = f < 0.06 ? '#5a3a18' : slotCol(i);                    // línea entre casillas
      }
      px[y * N + x] = pack(col);
    }
    b.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W, W);
    // Rótulos de las casillas.
    ctx.save();
    ctx.translate(R, R);
    ctx.font = '800 13px Pixelify,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    SLOTS.forEach((k, i) => {
      const a = cur.angle + (i + 0.5) * slot;
      ctx.save(); ctx.rotate(a); ctx.translate(R * 0.66, 0); ctx.rotate(Math.PI / 2);
      const ink = slotInk(i);
      if (ink === '#ffffff') { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(label(k), 0, 0); }
      ctx.fillStyle = ink; ctx.fillText(label(k), 0, 0);
      ctx.restore();
    });
    ctx.restore();
    // Flecha arriba (pixel).
    ctx.fillStyle = '#2a1a08';
    for (let r = 0; r < 6; r++) ctx.fillRect(R - (6 - r) * s * 0.5 - s * 0.5, r * s * 0.6, (6 - r) * s + s, s * 0.6);
    ctx.fillStyle = '#ff5f6d';
    for (let r = 0; r < 5; r++) ctx.fillRect(R - (5 - r) * s * 0.5, r * s * 0.6, (5 - r) * s, s * 0.6);
  }

  /** Para el autoelegir a los 25 s del grupo. */
  function forceClose() { if (cur && !cur.anim) close(); }

  return { open, hostSpin, onSpun, forceClose, SLOTS, get busy() { return !!cur; } };
})();
