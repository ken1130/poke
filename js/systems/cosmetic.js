/* ============ cosmetic.js — aspecto que dan los logros (2026-10-16) ============
 * Dos cosas que te pones (Perfil → «Aspecto»), sólo de adorno:
 *   aura    un aro / chispas de píxeles a tus pies que te siguen
 *   nombre  el color de tu nombre (encima de ti en grupo y arriba a la izquierda del HUD)
 * Cada una se desbloquea con un logro (ach) o con un número de logros (count).
 * Se guarda en save.profile (aura, nameCol). En grupo va en myState [22] como un número
 * (aura + 16 × color; 0 = nada): los que no lo mandan (versión vieja) se ven sin adorno.
 * Todo se pinta con cuadraditos y con posiciones que salen del reloj (sin partículas
 * guardadas): barato también en el móvil.
 */
G.Cosmetic = (() => {
  const AURAS = [
    { id: 'leaf',    name: 'Aura de hojas',     ach: 'boss25',  style: 'leaf',    col: ['#5fe08a', '#2f9a52', '#c8ffd8'] },
    { id: 'gold',    name: 'Aura dorada',       ach: 'clear1',  style: 'ring',    col: ['#ffd23f', '#e08a1e', '#fff3b0'] },
    { id: 'myth',    name: 'Aura mítica',       ach: 'leg10',   style: 'orbit',   col: ['#c47bff', '#7a3fb0', '#f0d8ff'] },
    { id: 'rainbow', name: 'Aura arcoíris',     ach: 'shiny5',  style: 'rainbow', col: ['#ffffff', '#ffffff', '#ffffff'] },
    { id: 'blue',    name: 'Llama azul',        count: 30,      style: 'flame',   col: ['#5fd4ff', '#2a6fb0', '#e6f8ff'] },
    { id: 'stars',   name: 'Polvo de estrellas', count: 60,     style: 'stars',   col: ['#fff3a8', '#9ae6ff', '#ffffff'] }
  ];
  const NAMES = [
    { id: 'red',     name: 'Rojo veterano',     ach: 'kills10k', col: '#ff6b5a' },
    { id: 'ice',     name: 'Azul grieta',       ach: 'rift10',   col: '#7fe0ff' },
    { id: 'pink',    name: 'Rosa compañero',    ach: 'group10',  col: '#ff9ed8' },
    { id: 'gold',    name: 'Oro del laberinto', ach: 'clear5',   col: '#ffd23f' },
    { id: 'rainbow', name: 'Arcoíris',          count: 45,       col: 'rainbow' }
  ];
  const A_BY = {}, N_BY = {};
  AURAS.forEach((a, i) => { A_BY[a.id] = a; a.n = i + 1; });
  NAMES.forEach((c, i) => { N_BY[c.id] = c; c.n = i + 1; });

  const save = () => G.DB.save;
  const achCount = s => Object.keys((s && s.ach) || {}).filter(k => G.AchDefs.BY[k]).length;
  /** Lo que pide y cuánto llevas: { text, v, goal, ok }. */
  function need(o) {
    const s = save();
    if (o.count) { const v = achCount(s); return { text: G.I18n.f('Consigue {x} logros', o.count), v: Math.min(v, o.count), goal: o.count, ok: v >= o.count }; }
    const a = G.AchDefs.BY[o.ach];
    if (!a || !s) return { text: '', v: 0, goal: 1, ok: false };
    const ok = !!(s.ach && s.ach[a.id]);
    return { text: G.I18n.f('Logro «{x}»: {x}', G.T(a.name), G.T(a.desc)), v: ok ? a.goal : Math.min(a.goal, a.value(s)), goal: a.goal, ok };
  }
  const unlocked = o => need(o).ok;

  /** Lo que llevas puesto tú (sólo si sigue desbloqueado). */
  function mine() {
    const P = (save() && save().profile) || {};
    const a = A_BY[P.aura], c = N_BY[P.nameCol];
    return { aura: a && unlocked(a) ? a : null, name: c && unlocked(c) ? c : null };
  }
  /** Para myState: un número (0 = nada). */
  function code() { const m = mine(); return (m.aura ? m.aura.n : 0) + 16 * (m.name ? m.name.n : 0); }
  /** El de un jugador: el tuyo de la partida guardada, el de los demás del número que mandan. */
  function of(p) {
    if (!p) return { aura: null, name: null };
    if (!p.remote) return p === G.Game.player ? mine() : { aura: null, name: null };
    const k = (p.net && p.net.cs) | 0;
    return { aura: AURAS[(k & 15) - 1] || null, name: NAMES[(k >> 4) - 1] || null };
  }
  /** Color del nombre (o null). El arcoíris va cambiando. */
  function colorOf(c) {
    if (!c) return null;
    return c.col === 'rainbow' ? `hsl(${(performance.now() / 6) % 360},95%,68%)` : c.col;
  }
  const nameColor = p => colorOf(of(p).name);

  // ---------------- dibujo (en píxeles) ----------------

  const PX = 2;
  const sq = (ctx, x, y, c, s = PX) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x / PX) * PX, Math.round(y / PX) * PX, s, s); };

  /** Bajo los pies del jugador (antes del sprite). p: { x, y, r, bodyH }. */
  function drawAura(ctx, p, a, t = performance.now() / 1000) {
    if (!a) return;
    const rx = Math.max(16, p.r * 1.7), ry = rx * 0.42, H = p.bodyH || 30;
    const [c0, c1, c2] = a.col;
    ctx.save();
    if (a.style === 'ring' || a.style === 'rainbow') {
      // Aro de cuadraditos que gira; el arcoíris cambia de color por ángulo.
      const n = 18;
      for (let i = 0; i < n; i++) {
        const ang = i / n * 6.2832 + t * 1.2;
        const col = a.style === 'rainbow' ? `hsl(${(i / n * 360 + t * 90) % 360},95%,62%)` : i % 3 === 0 ? c2 : i % 2 ? c0 : c1;
        sq(ctx, p.x + Math.cos(ang) * rx, p.y + Math.sin(ang) * ry, col);
      }
      // Dos destellos que suben.
      for (let k = 0; k < 2; k++) {
        const ph = (t * 0.7 + k * 0.5) % 1, ang = k * 3.1 + t * 0.4;
        G.Icons.twinkle(ctx, p.x + Math.cos(ang) * rx * 0.9, p.y - ph * H, ph, PX);
      }
    } else if (a.style === 'orbit') {
      // Tres orbes que dan vueltas a media altura, con estela.
      for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) {
        const ang = t * 2.4 + k * 2.094 - j * 0.22;
        const x = p.x + Math.cos(ang) * rx * 1.1, y = p.y - H * 0.45 + Math.sin(ang) * ry * 1.2;
        sq(ctx, x, y, j === 0 ? c2 : j === 1 ? c0 : c1, j === 0 ? PX * 2 : PX);
      }
      for (let i = 0; i < 12; i++) { const ang = i / 12 * 6.2832 - t * 0.6; if (i % 2) sq(ctx, p.x + Math.cos(ang) * rx, p.y + Math.sin(ang) * ry, c1); }
    } else if (a.style === 'flame' || a.style === 'leaf') {
      // Llamas (o hojas) que suben desde los pies: cada una sale del reloj, sin guardar nada.
      const n = a.style === 'flame' ? 12 : 8;
      for (let k = 0; k < n; k++) {
        const ph = (t * (a.style === 'flame' ? 0.9 : 0.45) + k / n) % 1;
        const ang = k * 2.39996 + (a.style === 'leaf' ? t * 1.5 : 0);
        const sway = a.style === 'leaf' ? Math.sin(ph * 6.28 + k) * 6 : Math.sin(ph * 9 + k) * 2;
        const x = p.x + Math.cos(ang) * rx * (1 - ph * 0.45) + sway, y = p.y + Math.sin(ang) * ry - ph * H * (a.style === 'flame' ? 0.8 : 1.1);
        sq(ctx, x, y, ph < 0.3 ? c2 : ph < 0.7 ? c0 : c1, ph < 0.5 ? PX * 2 : PX);
      }
      for (let i = 0; i < 14; i++) { const ang = i / 14 * 6.2832 + t * 0.5; if (i % 2 === 0) sq(ctx, p.x + Math.cos(ang) * rx, p.y + Math.sin(ang) * ry, c1); }
    } else if (a.style === 'stars') {
      // Estrellitas que nacen y se apagan alrededor del cuerpo.
      for (let k = 0; k < 5; k++) {
        const ph = (t * 0.55 + k / 5) % 1, ang = k * 1.7 + Math.floor(t * 0.55 + k / 5) * 2.3;
        G.Icons.twinkle(ctx, p.x + Math.cos(ang) * rx * 1.1, p.y - H * 0.5 + Math.sin(ang) * H * 0.55, ph, PX);
      }
      for (let i = 0; i < 16; i++) { const ang = i / 16 * 6.2832 + t * 0.3; if (i % 4 === 0) sq(ctx, p.x + Math.cos(ang) * rx, p.y + Math.sin(ang) * ry, c0); }
    }
    ctx.restore();
  }
  const drawFor = (ctx, p) => { if (!p.dead) drawAura(ctx, p, of(p).aura); };

  // ---------------- desbloqueos (aviso como los logros) ----------------

  /** Tras mirar los logros (progress.js): avisa de lo nuevo. notify(título, sub). */
  function check(notify) {
    const s = save();
    if (!s) return;
    s.cosSeen = s.cosSeen || {};
    const fresh = [...AURAS.map(a => ['a:' + a.id, a]), ...NAMES.map(c => ['n:' + c.id, c])]
      .filter(([k, o]) => !s.cosSeen[k] && unlocked(o));
    if (!fresh.length) return;
    for (const [k] of fresh) s.cosSeen[k] = Date.now();
    if (fresh.length <= 2) for (const [, o] of fresh) notify(G.I18n.f('¡Nuevo aspecto: {x}!', G.T(o.name)), G.T('Póntelo en Perfil → Aspecto'));
    else notify(G.I18n.f('¡{x} aspectos nuevos!', fresh.length), G.T('Póntelos en Perfil → Aspecto'));
  }

  // ---------------- elegir (Perfil) ----------------

  /** La sección «Aspecto» del perfil, dentro de `box`. onSave(): guardar y repintar. */
  function renderPicker(box, onSave) {
    const s = save();
    s.profile = s.profile || { favs: [], title: '' };
    const P = s.profile;
    const name = (G.Social && G.Social.me && G.Social.me.name) || G.DB.user || G.T('Tú');
    box.insertAdjacentHTML('beforeend', `<h3 style="margin-top:14px">${G.T('Aspecto')}</h3>
      <p class="note" style="margin:0 0 6px">${G.T('Se desbloquean con logros. Los demás jugadores también lo ven en grupo.')}</p>`);
    const section = (label, list, key, preview) => {
      box.insertAdjacentHTML('beforeend', `<div class="cos-label">${G.T(label)}</div>`);
      const row = document.createElement('div');
      row.className = 'cos-row';
      const card = (o) => {
        const nd = o ? need(o) : { ok: true };
        const on = (P[key] || '') === (o ? o.id : '');
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cos-card' + (on ? ' on' : '') + (nd.ok ? '' : ' locked');
        el.appendChild(preview(o));
        el.insertAdjacentHTML('beforeend', `<b>${o ? G.T(o.name) : G.T('Ninguno')}</b>` +
          (nd.ok ? (on ? `<small class="gold">${G.T('Puesto')}</small>` : '')
            : `<small>${G.Icons.html('lock', 12)} ${nd.text}</small><div class="bar"><i style="width:${nd.v / nd.goal * 100}%"></i></div><small>${nd.v} / ${nd.goal}</small>`));
        el.onclick = () => {
          if (!nd.ok) { G.Audio.sfx('error'); return; }
          P[key] = o ? o.id : '';
          onSave();                       // (guarda y vuelve a pintar la pestaña)
        };
        row.appendChild(el);
      };
      card(null);
      list.forEach(card);
      box.appendChild(row);
    };
    section('Aura', AURAS, 'aura', o => {
      const cv = document.createElement('canvas');
      cv.width = 72; cv.height = 56; cv.className = 'cos-prev';
      const ctx = cv.getContext('2d');
      const fake = { x: 36, y: 44, r: 12, bodyH: 30 };
      let raf = 0;
      const frame = () => {
        if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
        ctx.clearRect(0, 0, 72, 56);
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(36, 44, 12, 5, 0, 0, 6.2832); ctx.fill();
        if (o) drawAura(ctx, fake, o);
        raf = requestAnimationFrame(frame);
      };
      // (sólo se anima la que tiene el ratón encima o está puesta: el resto, un fotograma)
      if (o) drawAura(ctx, fake, o, 0.6);
      cv.addEventListener('pointerenter', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); });
      if (o && P.aura === o.id) setTimeout(() => { raf = requestAnimationFrame(frame); }, 0);
      return cv;
    });
    section('Color del nombre', NAMES, 'nameCol', o => {
      const sp = document.createElement('span');
      sp.className = 'cos-name';
      sp.textContent = name;
      if (o && o.col === 'rainbow') sp.classList.add('rainbow');
      else if (o) sp.style.color = o.col;
      return sp;
    });
  }

  return { AURAS, NAMES, of, code, mine, nameColor, colorOf, drawAura, drawFor, check, renderPicker, need };
})();
