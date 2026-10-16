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
  // Aspecto (2026-10-16): mesa de casino, sólo dos verdes oscuros alternos y oro (antes
  // granate/crema/oro: demasiados colores, quedaba barato). El color va en el texto:
  // ×0 apagado, ×2 o más en oro; sólo la casilla del ×5 lleva fondo dorado oscuro.
  const PAL = { a: '#14302a', b: '#1b3d34', jack: '#4d3b10', rim: '#0c1411', rimL: '#1f2b26',
                gold: '#c9a54e', goldL: '#f0d68c', cream: '#ece3cb', mute: '#7d8a84' };
  const slotCol = i => (SLOTS[i] >= 5 ? PAL.jack : i % 2 ? PAL.b : PAL.a);
  const slotInk = i => { const k = SLOTS[i]; return k === 0 ? PAL.mute : k >= 2 ? PAL.goldL : PAL.cream; };
  const SPINS = 3, MIN_COINS = 10;
  const label = k => (k === 0 ? '×0' : '×' + String(k).replace('.', ','));

  let cur = null;         // { site, done, angle, anim }
  let watchR = null;      // tirada de otro que estás viendo (watch)

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
    // Todos ven girar la ruleta de la tienda (2026-10-16: antes sólo quien tiraba).
    const shown = name || (G.Coop.active ? G.DB.user || '' : '');
    if (G.Coop.active) G.Coop.broadcast(['dg', 'rspin', idx, shown, delta]);
    watch(idx, shown, delta);
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

  // ---------------- dibujo ----------------
  /** La rueda en (cx, cy) de radio R girada `angle`, con la flecha arriba. Sirve para la ventana y la tienda. */
  function drawWheel(ctx, cx, cy, R, angle) {
    const n = SLOTS.length, slot = 6.2832 / n, rIn = R * 0.84;
    ctx.save();
    ctx.translate(cx, cy);
    // Sombra y aro exterior (metal oscuro con filete de oro).
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(0, R * 0.04, R * 1.02, 0, 6.2832); ctx.fill();
    const rim = ctx.createRadialGradient(0, 0, rIn, 0, 0, R);
    rim.addColorStop(0, PAL.rimL); rim.addColorStop(1, PAL.rim);
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = Math.max(1, R * 0.018);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.985, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, rIn, 0, 6.2832); ctx.stroke();
    // Bombillas del aro (una por casilla, quietas; brillan alternas).
    const blink = Math.floor(performance.now() / 400) % 2;
    for (let i = 0; i < n; i++) {
      const a = i * slot - Math.PI / 2;
      ctx.fillStyle = (i + blink) % 2 ? PAL.goldL : 'rgba(240,214,140,.35)';
      ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, Math.max(1, R * 0.025), 0, 6.2832); ctx.fill();
    }
    // Casillas.
    for (let i = 0; i < n; i++) {
      const a0 = angle + i * slot;
      ctx.fillStyle = slotCol(i);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rIn, a0, a0 + slot); ctx.closePath(); ctx.fill();
    }
    // Filetes de oro entre casillas.
    ctx.strokeStyle = 'rgba(201,165,78,.55)'; ctx.lineWidth = Math.max(0.6, R * 0.008);
    for (let i = 0; i < n; i++) {
      const a = angle + i * slot;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2); ctx.lineTo(Math.cos(a) * rIn, Math.sin(a) * rIn); ctx.stroke();
    }
    // Brillo suave encima (da volumen sin más colores).
    const gl = ctx.createRadialGradient(-R * 0.3, -R * 0.35, 0, 0, 0, rIn);
    gl.addColorStop(0, 'rgba(255,255,255,.10)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, rIn, 0, 6.2832); ctx.fill();
    // Rótulos.
    if (R >= 40) {
      ctx.font = `700 ${Math.round(R * 0.11)}px Pixelify,"Segoe UI",system-ui,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        ctx.save(); ctx.rotate(angle + (i + 0.5) * slot); ctx.translate(rIn * 0.72, 0); ctx.rotate(Math.PI / 2);
        ctx.fillStyle = slotInk(i); ctx.fillText(label(SLOTS[i]), 0, 0);
        ctx.restore();
      }
    }
    // Buje dorado.
    const hub = ctx.createRadialGradient(-R * 0.04, -R * 0.05, 0, 0, 0, R * 0.17);
    hub.addColorStop(0, PAL.goldL); hub.addColorStop(0.7, PAL.gold); hub.addColorStop(1, '#6e5520');
    ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, 6.2832); ctx.fill();
    ctx.fillStyle = PAL.rim; ctx.beginPath(); ctx.arc(0, 0, R * 0.05, 0, 6.2832); ctx.fill();
    // Flecha arriba.
    const w = R * 0.09;
    ctx.fillStyle = PAL.goldL; ctx.strokeStyle = PAL.rim; ctx.lineWidth = Math.max(1, R * 0.02); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-w, -R * 1.04); ctx.lineTo(w, -R * 1.04); ctx.lineTo(0, -R * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** La ventana: lienzo nítido según la pantalla (devicePixelRatio). */
  function draw() {
    const cv = $('roul-wheel');
    if (!cv || !cur) return;
    const css = 240, k = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    if (cv.width !== css * k) { cv.width = cv.height = css * k; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, css, css);
    drawWheel(ctx, css / 2, css / 2 + 6, css / 2 - 12, cur.angle);
  }

  // ---------------- lo que ven los demás (2026-10-16) ----------------
  /*
   * Cuando alguien gira, a los demás les sale la misma ruleta girando arriba en el centro
   * de la pantalla (con quién gira y el resultado). No tapa nada ni se puede tocar: se sigue
   * jugando. Quien gira ya la ve en su ventana.
   */
  const WATCH_DUR = 3.2, WATCH_HOLD = 2.6;
  function watch(idx, who, delta) {
    if (cur) return;                                  // eres tú quien gira: ya tienes la ventana
    const slot = 6.2832 / SLOTS.length;
    const target = -Math.PI / 2 - (idx + 0.5) * slot;
    const w = watchR = { idx, who, delta, t0: performance.now(), to: ((target % 6.2832) + 6.2832) % 6.2832 + 6.2832 * 6, tick: 0 };
    let el = $('roul-watch');
    if (!el) {
      el = document.createElement('div');
      el.id = 'roul-watch';
      el.innerHTML = '<p class="who"></p><canvas width="200" height="200"></canvas><p class="res"></p>';
      document.body.appendChild(el);
    }
    el.classList.remove('hidden');
    const cv = el.querySelector('canvas'), css = 200, k = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    if (cv.width !== css * k) cv.width = cv.height = css * k;
    el.querySelector('.who').textContent = who ? G.I18n.f('{x} gira la ruleta…', who) : G.T('Girando la ruleta…');
    const res = el.querySelector('.res'); res.textContent = ''; res.className = 'res';
    G.Audio.sfx('select');
    const slotA = 6.2832 / SLOTS.length;
    const step = () => {
      if (watchR !== w) return;
      const t = (performance.now() - w.t0) / 1000;
      if (t > WATCH_DUR + WATCH_HOLD || !G.Dungeon.inRoom) { watchR = null; el.classList.add('hidden'); return; }
      const e = 1 - Math.pow(1 - Math.min(1, t / WATCH_DUR), 3), ang = w.to * e;
      const cell = Math.floor(ang / slotA);
      if (cell !== w.tick && t < WATCH_DUR - 0.05) { w.tick = cell; G.Audio.sfx('xp'); }
      const ctx = cv.getContext('2d');
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, css, css);
      drawWheel(ctx, css / 2, css / 2 + 5, css / 2 - 10, ang);
      if (t >= WATCH_DUR && !res.textContent) {
        const m = SLOTS[w.idx];
        res.textContent = label(m) + '  ' + (w.delta >= 0 ? '+' : '') + w.delta + ' ' + G.T('monedas');
        res.className = 'res ' + (m === 0 ? 'lose' : m >= 2 ? 'win' : '');
        G.Audio.sfx(m === 0 ? 'hurt' : m >= 2 ? 'shiny' : 'coin');
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Para el autoelegir a los 25 s del grupo. */
  function forceClose() { if (cur && !cur.anim) close(); }

  return { open, hostSpin, onSpun, forceClose, watch, drawWheel, PAL, SLOTS, get busy() { return !!cur; } };
})();
