/* ============ chat-ui.js — mensajes rápidos en grupo (equipo y PK) ============
 * PC: T abre el menú; 1-6 (o clic) elige; T o Esc lo cierra.
 * Móvil: botón 💬 junto a la pausa.
 * El mensaje sale en un bocadillo encima del Pokémon durante 3 s, para todos
 * (por coop.js: el invitado lo manda al anfitrión con 'qc' y él lo reparte).
 */
G.Chat = (() => {
  const MSGS = ['¡Por aquí!', '¡Ayuda!', '¡Bien hecho!', '¡Corre!', '¡Gracias!', '¡Vamos!'];
  const SHOW = 3;
  let menu = null;

  function isOpen() { return !!menu; }
  function close() { if (menu) { menu.remove(); menu = null; } }

  function open() {
    if (menu || !G.Coop.active) return;
    menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:45;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:min(560px,94vw)';
    menu.innerHTML = MSGS.map((t, i) => `<button class="btn small" data-i="${i}" data-sfx="none"><b style="opacity:.6">${i + 1}</b> ${t}</button>`).join('');
    menu.querySelectorAll('[data-i]').forEach(b => { b.onclick = e => { e.stopPropagation(); send(+b.dataset.i); }; });
    document.body.appendChild(menu);
  }
  function toggle() { if (menu) close(); else open(); }

  function send(i) {
    close();
    if (!G.Coop.active || !MSGS[i]) return;
    show(G.Net.uid, i);
    if (G.Coop.isHost) G.Coop.broadcast(['qc', G.Net.uid, i]);
    else G.Coop.toHost(['qc', i]);
    G.Audio.sfx('select');
  }

  /** Bocadillo encima del Pokémon de `uid` (tú o un compañero). */
  function show(uid, i) {
    const p = uid === G.Net.uid ? G.Coop.local : (G.Coop.mate(uid) || {}).pl;
    if (p && MSGS[i]) p.chat = { text: G.T(MSGS[i]), until: performance.now() / 1000 + SHOW };
  }

  /** Lo pinta hud.js para cada jugador con mensaje. */
  function draw(ctx, p, sx, sy, scale, F) {
    if (!p.chat || performance.now() / 1000 > p.chat.until) return;
    ctx.save();
    ctx.font = F(800, 12);
    const tw = ctx.measureText(p.chat.text).width + 16, th = 22;
    const x = sx - tw / 2, y = sy - (p.bodyH + 52) * scale - th;
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, tw, th, 8) : ctx.rect(x, y, tw, th); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx - 6, y + th); ctx.lineTo(sx + 6, y + th); ctx.lineTo(sx, y + th + 7); ctx.fill();
    ctx.fillStyle = '#1a2440'; ctx.textAlign = 'center';
    ctx.fillText(p.chat.text, sx, y + 15);
    ctx.restore();
  }

  return { MSGS, open, close, toggle, isOpen, send, show, draw };
})();
