/* ============ party-game-ui.js — la mesa del modo fiesta (#scr-party) ============
 * Pantalla completa encima de todo el menú (no se entra en el mundo). La abre G.Party
 * cuando llega la primera vista de una partida (también al volver tras una recarga).
 * Cada juego pinta su mesa (RENDER[id]); por ahora, Big Two.
 *
 * Big Two: tu mano abajo (toca una carta para subirla, otra vez para bajarla), los demás
 * alrededor (con su Pokémon, cuántas cartas les quedan y "Pasa"), la jugada en el centro,
 * el turno resaltado con su tiempo. Botones: Echar, Pasar, Pista (elige una jugada válida;
 * otra vez, la siguiente) y Ordenar (por número / por palo).
 * Cartas dibujadas con CSS (css/party.css): cada palo es un tipo con su Pokémon.
 */
G.PartyGameUI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let wired = false, tickT = 0;
  /** Nombre que se enseña: el de la persona, o "Eevee (CPU)" en tu idioma para las CPU. */
  const seatName = s => (s.cpu ? G.I18n.f('{x} (jugador CPU)', G.T((G.DEX_BY[s.dex] || {}).name || 'CPU')) : s.name);

  const BG_KEY = 'ps.party.bg';
  const BGS = ['green', 'blue', 'wine', 'wood', 'night', 'center', 'grass'];
  const BG_NAMES = { green: 'Fieltro verde', blue: 'Fieltro azul', wine: 'Fieltro granate', wood: 'Mesa de madera', night: 'Noche estrellada', center: 'Centro Pokémon', grass: 'Pradera' };
  const bgNow = () => { try { const b = localStorage.getItem(BG_KEY); return BGS.includes(b) ? b : 'green'; } catch (e) { return 'green'; } };
  function applyBg() {
    const scr = document.getElementById('scr-party'), b = bgNow();
    BGS.forEach(x => scr.classList.toggle('bg-' + x, x === b));
    const btn = document.getElementById('pt-bg');
    if (btn) btn.textContent = G.I18n.f('Fondo: {x}', G.T(BG_NAMES[b]));
  }
  function wire() {
    if (wired) return;
    wired = true;
    $('pt-rules').onclick = rules;
    // Fondo de la mesa (2026-10-17): se elige aquí y se recuerda en este aparato.
    $('pt-bg').onclick = () => { const i = (BGS.indexOf(bgNow()) + 1) % BGS.length; try { localStorage.setItem(BG_KEY, BGS[i]); } catch (e) { /* nada */ } applyBg(); G.Audio.sfx('select'); };
    applyBg();
    $('pt-leave').onclick = async () => {
      const host = G.Party.isHost, v = G.Party.view;
      const over = v && v.res;
      if (!over) {
        const ok = await G.Dialog.confirm(host ? 'Si sales, la partida termina para todos y volvéis a la sala.' : 'Si sales, la CPU jugará tus cartas. Puedes volver desde la sala.',
          { title: 'Salir de la mesa', ok: 'Salir de la mesa', cancel: 'Seguir jugando', danger: true });
        if (!ok) return;
      }
      G.Party.leave();
    };
    G.Party.on((what, x) => {
      if (what === 'open') open();
      else if (what === 'view') render(x);
      else if (what === 'close') close(x);
      else if (what === 'err') { G.Audio.sfx('error'); flash(G.I18n.f(x.err, x.x)); }
      else if (what === 'busy') G.UI.toast(G.T('En la sala hay una partida de fiesta en marcha: espera a que termine.'), 3200);
      else if (what === 'ended' && G.UI.isOpen('scr-lobby')) G.LobbyUI.open();
    });
  }

  function open() {
    G.UI.show('scr-party');
    G.UI.chrome(false);
    clearInterval(tickT);
    tickT = setInterval(tick, 200);
  }

  function close(why) {
    clearInterval(tickT);
    G.UI.hide('scr-party');
    $('pt-body').innerHTML = '';
    cur = null;
    G.UI.chrome(true);
    const msg = { host: 'Se ha perdido la conexión con el anfitrión: fin de la partida.', closed: 'La sala se ha cerrado', room: '' }[why];
    if (msg) G.UI.toast(G.T(msg), 3000);
    if (G.Social && G.Social.room) G.LobbyUI.open(); else G.MenuUI.open();
  }

  /** Aviso corto encima de la mano (jugada no válida...). */
  let flashT = 0;
  function flash(text) {
    const el = $('pt-flash');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(flashT);
    flashT = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function rules() {
    const v = G.Party.view;
    const id = v ? v.game : 'bigtwo';
    const R = RENDER[id];
    G.Dialog.alertHtml(R ? R.rules() : '', R ? R.rulesTitle : 'Reglas del juego');
  }

  // ---------------- dibujo común ----------------
  let cur = null;   // { sid, game, ...estado del juego en pantalla }

  function render(v) {
    const R = RENDER[v.game];
    if (!R) return;
    const def = G.Party.game(v.game);
    $('pt-title').textContent = G.T(def ? def.name : '');
    $('pt-rules').textContent = G.T('Reglas del juego');
    $('pt-round').textContent = G.I18n.f('Ronda de cartas {x}', String(v.round));
    $('pt-leave').textContent = G.T(v.res ? 'Volver a la sala' : 'Salir de la mesa');
    if (!cur || cur.sid !== v.sid) { cur = { sid: v.sid, game: v.game }; R.build($('pt-body'), v, cur); }
    R.update(v, cur);
  }

  function tick() {
    const v = G.Party.view;
    if (!v || !cur) return;
    const R = RENDER[v.game];
    if (R && R.tick) R.tick(v, cur);
  }

  // ======================= BIG TWO =======================

  const SUIT_MON = [1, 4, 35, 94];                      // ♣ Bulbasaur (planta) ♦ Charmander (fuego) ♥ Clefairy (hada) ♠ Gengar (fantasma)
  const SUIT_TYPE = ['grass', 'fire', 'fairy', 'ghost'];
  const mascots = [null, null, null, null];
  let mascotWait = false;

  /** Retrato quieto del Pokémon de cada palo (una vez; luego es un <img>). */
  function mascot(s) {
    if (mascots[s]) return mascots[s];
    const dex = SUIT_MON[s];
    const sh = G.Sprites.sheet(dex, 'Idle'), m = G.Sprites.animMeta(dex, 'Idle');
    if (!sh || !m) return null;
    if (!sh.ready) {
      if (!mascotWait) { mascotWait = true; setTimeout(() => { mascotWait = false; if (cur && cur.game === 'bigtwo') { cur.handKey = ''; cur.trickKey = ''; const v = G.Party.view; if (v) RENDER.bigtwo.update(v, cur); } }, 400); }
      return null;
    }
    const cv = document.createElement('canvas');
    cv.width = m.w; cv.height = m.h;
    const cx = cv.getContext('2d');
    cx.drawImage(sh.img, 0, 0, m.w, m.h, 0, 0, m.w, m.h);
    // Recorte a lo que tiene dibujo.
    const d = cx.getImageData(0, 0, m.w, m.h).data;
    let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (d[(y * m.w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    mascots[s] = out.toDataURL();
    return mascots[s];
  }

  function cardHTML(c, extra = '') {
    const B = G.BigTwo, r = B.RANKS[B.rankOf(c)], s = B.suitOf(c), src = mascot(s);
    return `<div class="b2c s${s} ${extra}" data-c="${c}" translate="no"><span class="b2i"><b>${r}</b><i>${B.SUITS[s]}</i></span>` +
      (src ? `<img class="b2m" src="${src}" alt="" draggable="false">` : `<span class="b2m b2ms">${B.SUITS[s]}</span>`) +
      `<span class="b2i b2i2"><b>${r}</b><i>${B.SUITS[s]}</i></span></div>`;
  }

  /** Dónde se sienta cada uno (visto desde ti): abajo tú; los demás en orden de turno a la derecha, arriba, izquierda. */
  function places(n) { return n === 2 ? ['top'] : n === 3 ? ['right', 'left'] : ['right', 'top', 'left']; }

  const RB = {
    rulesTitle: 'Reglas del Big Two',
    rules() {
      const L = ['Cada jugador recibe 13 cartas. Gana quien se quede sin cartas el primero.',
        'Orden de las cartas: 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2. Si empatan, por el palo: ♣ < ♦ < ♥ < ♠.',
        'Empieza quien tiene el 3♣ y su primera jugada tiene que llevarlo (con menos de 4 jugadores, si nadie lo tiene, la carta más baja).',
        'Jugadas: suelta, pareja, trío o 5 cartas. Hay que echar el mismo número de cartas que la mesa y ganarle, o pasar.',
        'Jugadas de 5, de menor a mayor: escalera < color < full < póker (4 iguales + 1) < escalera de color.',
        'Escaleras: 5 rangos seguidos de 3 a A; también valen A-2-3-4-5 (la más baja) y 2-3-4-5-6. No valen J-Q-K-A-2 ni las que tienen el 2 en medio.',
        'Pasar no te deja fuera de la baza. Si todos los demás pasan, quien jugó la última abre como quiera.',
        'Al acabar, cada carta que te queda es un punto de castigo. Los puntos se suman ronda tras ronda: menos es mejor.',
        'Tienes 60 segundos por turno; si se acaba el tiempo, pasas (o echas la carta obligada al abrir).'];
      const suits = SUIT_MON.map((d, s) => `<span class="b2-rs s${s}" translate="no">${G.BigTwo.SUITS[s]}</span> ${esc((G.DEX_BY[d] || {}).name || '')}`).join(' · ');
      return `<ul class="b2-rules">${L.map(t => `<li>${esc(G.T(t))}</li>`).join('')}</ul><p class="b2-rules-s">${G.T('Palos')}: ${suits}</p>`;
    },

    build(root, v, c) {
      c.sel = new Set();
      c.bySuit = (() => { try { return localStorage.getItem('ps.b2.sort') === 'suit'; } catch (e) { return false; } })();
      c.hint = null; c.hintI = -1; c.lastSeq = 0; c.handKey = ''; c.trickKey = ''; c.turnWas = -2; c.resKey = '';
      const n = v.seats.length, pl = places(n);
      let opp = '';
      for (let k = 1; k < n; k++) {
        const j = (v.you + k) % n;
        opp += `<div class="b2-opp pos-${pl[k - 1]}" data-seat="${j}">
          <div class="b2-av"></div>
          <div class="b2-info"><b class="b2-name" translate="no"></b>
            <span class="b2-cnt"><span class="b2-fan"></span><span translate="no"></span></span>
            <span class="b2-tag"></span></div>
          <div class="b2-bub hidden">${G.T('Ha pasado')}</div>
          <div class="b2-tm"><i></i></div>
        </div>`;
      }
      root.innerHTML = `<div class="b2-table n${n}">
        ${opp}
        <div class="b2-mid"><div class="b2-cap"></div><div class="b2-trick"></div></div>
        <div class="b2-me">
          <div class="b2-mebar"><b class="b2-mename" translate="no"></b><span class="b2-meinfo"></span><span class="b2-bub me hidden">${G.T('Ha pasado')}</span><div class="b2-tm me"><i></i></div></div>
          <div class="b2-handwrap"><div class="b2-hand"></div></div>
          <div class="b2-acts">
            <button class="btn small" data-b2="sort"></button>
            <button class="btn small" data-b2="hint">${G.T('Pista de jugada')}</button>
            <button class="btn small ghost" data-b2="pass">${G.T('Pasar turno')}</button>
            <button class="btn small gold" data-b2="play">${G.T('Echar cartas')}</button>
          </div>
          <div id="pt-flash" class="b2-flash hidden"></div>
        </div>
        <div class="b2-hints hidden"><div class="b2-hh"><b>${G.T('Jugadas posibles')}</b><button class="btn small ghost" data-hx>✕</button></div><div class="b2-hl"></div></div>
        <div class="b2-res hidden"></div>
      </div>`;
      // Avatares (sprites animados): una vez por partida.
      root.querySelectorAll('.b2-opp').forEach(el => {
        const s = v.seats[+el.dataset.seat];
        el.querySelector('.b2-av').appendChild(G.UI.spriteCanvas(s.dex, 64, 56, { scale: 2, hero: true, shiny: !!s.shiny }));
      });
      const hand = root.querySelector('.b2-hand');
      hand.onclick = e => {
        const el = e.target.closest('.b2c');
        if (!el) return;
        const id = +el.dataset.c;
        if (c.sel.has(id)) c.sel.delete(id); else c.sel.add(id);
        el.classList.toggle('up', c.sel.has(id));
        c.hintI = -1;
        G.Audio.sfx('select');
        RB.buttons(G.Party.view, c);
      };
      root.querySelector('.b2-acts').onclick = e => {
        const b = e.target.closest('[data-b2]');
        if (!b || b.disabled) return;
        const v2 = G.Party.view;
        const k = b.dataset.b2;
        if (k === 'sort') {
          c.bySuit = !c.bySuit;
          try { localStorage.setItem('ps.b2.sort', c.bySuit ? 'suit' : 'rank'); } catch (x) { /* nada */ }
          c.handKey = ''; RB.update(v2, c);
        } else if (k === 'hint') RB.hintNext(v2, c);
        else if (k === 'pass') RB.send(v2, c, { type: 'pass' });
        else if (k === 'play') {
          if (!c.sel.size) { G.Audio.sfx('error'); flash(G.T('Elige alguna carta.')); return; }
          RB.send(v2, c, { type: 'play', cards: [...c.sel] });
        }
      };
      root.querySelector('.b2-hints').onclick = e => {
        if (e.target.closest('[data-hx]')) { RB.hideHints(); return; }
        const it = e.target.closest('[data-hi]');
        if (!it || !c.hint) return;
        c.sel = new Set(c.hint[+it.dataset.hi]);
        G.Audio.sfx('select');
        RB.hideHints();
        c.handKey = ''; RB.update(G.Party.view, c);
      };
      window.addEventListener('resize', () => RB.layoutHand(c));
    },
    hideHints() { const h = document.querySelector('#scr-party .b2-hints'); if (h) h.classList.add('hidden'); },

    send(v, c, a) {
      const r = G.Party.act(a);
      if (!r.ok) { G.Audio.sfx('error'); flash(G.I18n.f(r.err, r.x)); return; }
      if (a.type === 'play') c.sel.clear();
      c.hintI = -1;
    },

    hintNext(v, c) {
      const p = v.pub, hand = v.priv.hand;
      if (p.turn !== v.you) { flash(G.T('No es tu turno.')); return; }
      const hs = v.round * 10000 + (p.last ? p.last.seq : 0);
      if (!c.hint || c.hintSeq !== hs) {
        let list = G.BigTwo.legalPlays(hand, p.lead, p.first ? p.must : -1).map(x => x.cards);
        if (!p.lead) {
          // Al abrir, primero lo que haría la CPU (suelta la carta más baja en la jugada más larga).
          const opp = v.seats.map((s, j) => (j === v.you ? 99 : p.counts[j]));
          const best = G.BigTwo.cpuMove(hand, { lead: null, must: p.first ? p.must : -1, oppMin: Math.min(...opp), mine: hand.length });
          if (best.cards) list = [best.cards].concat(list.filter(x => x.join() !== best.cards.join()));
        }
        c.hint = list; c.hintSeq = hs; c.hintI = -1;
      }
      if (!c.hint.length) { flash(G.T('No tienes ninguna jugada que gane: pasa.')); G.Audio.sfx('error'); return; }
      // (2026-10-17, pedido del dueño) Todas las jugadas posibles, por tipo: tocas una y se elige.
      const B = G.BigTwo, ORDER = ['single', 'pair', 'triple', 'straight', 'flush', 'full', 'four', 'sflush'], MAX = 12;
      const groups = {};
      c.hint.forEach((cards, i) => { const t = B.classify(cards); if (t) (groups[t.type] = groups[t.type] || []).push(i); });
      const card = id => `<span class="b2-hc s${B.suitOf(id)}">${B.label(id)}</span>`;
      let html = '';
      if (!p.lead) html += `<div class="b2-hg"><i>${G.T('Recomendada')}</i><button class="b2-hi rec" data-hi="0">${c.hint[0].map(card).join('')}</button></div>`;
      for (const t of ORDER) {
        const ids = groups[t];
        if (!ids) continue;
        html += `<div class="b2-hg"><i>${G.T(B.TYPE_NAMES[t])} · ${ids.length}</i>` +
          ids.slice(0, MAX).map(i => `<button class="b2-hi" data-hi="${i}">${c.hint[i].map(card).join('')}</button>`).join('') +
          (ids.length > MAX ? `<span class="b2-hmore">${G.I18n.f('y {x} más', ids.length - MAX)}</span>` : '') + '</div>';
      }
      const panel = document.querySelector('#scr-party .b2-hints');
      panel.querySelector('.b2-hl').innerHTML = html;
      panel.classList.remove('hidden');
      G.Audio.sfx('select');
    },

    /** Coloca las cartas de la mano: se solapan lo justo para que quepan sin barra. */
    layoutHand(c) {
      const wrap = document.querySelector('#scr-party .b2-handwrap'), hand = wrap && wrap.querySelector('.b2-hand');
      if (!hand) return;
      const cards = hand.children.length;
      if (!cards) return;
      const cw = hand.firstElementChild.getBoundingClientRect().width || 46;
      const room = wrap.clientWidth - 8;
      const step = cards > 1 ? Math.max(cw * 0.42, Math.min(cw + 4, (room - cw) / (cards - 1))) : cw;
      hand.style.setProperty('--step', (step - cw) + 'px');
    },

    buttons(v, c) {
      const root = $('pt-body'), p = v.pub, mine = p.turn === v.you && !v.res;
      const q = k => root.querySelector(`[data-b2="${k}"]`);
      if (!q('play')) return;
      q('play').disabled = !mine;
      q('pass').disabled = !mine || !p.lead;
      q('hint').disabled = !mine;
      q('sort').textContent = G.T(c.bySuit ? 'Ordenar por palo' : 'Ordenar por número');
    },

    update(v, c) {
      const root = $('pt-body'), p = v.pub, B = G.BigTwo, n = v.seats.length;
      if (!root.querySelector('.b2-table')) return;
      const name = j => seatName(v.seats[j]);
      // Sonidos y animación de la última jugada.
      const seq = v.round * 10000 + (p.last ? p.last.seq : 0);
      const newMove = seq !== c.lastSeq;
      if (newMove && c.lastSeq && p.last) {
        if (p.last.kind === 'play') G.Audio.sfx(p.last.seat === v.you ? 'confirm' : 'click');
        else G.Audio.sfx('back');
      }
      c.lastSeq = seq;
      // Rivales
      root.querySelectorAll('.b2-opp').forEach(el => {
        const j = +el.dataset.seat, s = v.seats[j];
        el.querySelector('.b2-name').textContent = seatName(s);
        // Sus cartas boca abajo, de verdad (2026-10-17, pedido del dueño), y el número al lado.
        const fan = el.querySelector('.b2-fan'), nC = p.counts[j];
        if (fan.childElementCount !== nC) fan.innerHTML = '<i class="b2-back fan"></i>'.repeat(nC);
        el.querySelector('.b2-cnt > span[translate]').textContent = nC;
        el.classList.toggle('few', p.counts[j] <= 2 && !v.res);
        el.querySelector('.b2-tag').textContent = !s.cpu && (s.gone || s.afk) ? G.T('Juega la CPU') : G.I18n.f('Castigo: {x}', String(s.total));
        el.querySelector('.b2-tag').classList.toggle('away', !s.cpu && (s.gone || s.afk));
        el.classList.toggle('on', p.turn === j);
        el.querySelector('.b2-bub').classList.toggle('hidden', !p.passed[j] || !p.lead);
      });
      const me = v.seats[v.you];
      root.querySelector('.b2-mename').textContent = me.name;
      root.querySelector('.b2-meinfo').textContent = G.I18n.f('Castigo: {x}', String(me.total)) + ((me.afk || me.gone) ? ' · ' + G.T('Juega la CPU') : '');
      root.querySelector('.b2-bub.me').classList.toggle('hidden', !p.passed[v.you] || !p.lead);
      root.querySelector('.b2-me').classList.toggle('on', p.turn === v.you);
      // Mesa
      const cap = root.querySelector('.b2-cap');
      let capT;
      if (v.res) capT = G.I18n.f('¡{x} se queda sin cartas y gana!', name(p.winner));
      else if (p.lead) capT = name(p.lead.seat) + ' · ' + G.T(B.TYPE_NAMES[p.lead.type]);
      else if (p.first && p.must >= 0) capT = p.turn === v.you ? G.I18n.f('Abres tú: tu jugada tiene que llevar el {x}.', B.label(p.must)) : G.I18n.f('Abre la mesa {x} (con el {x})', name(p.turn), B.label(p.must));
      else capT = p.turn === v.you ? G.T('Abres tú: echa lo que quieras.') : G.I18n.f('Abre la mesa {x}', name(p.turn));
      cap.textContent = capT;
      const tKey = p.lead ? p.lead.cards.join(',') + '/' + seq : 'none';
      if (tKey !== c.trickKey) {
        c.trickKey = tKey;
        const from = p.lead ? (p.lead.seat === v.you ? 'bottom' : places(n)[(p.lead.seat - v.you + n) % n - 1]) : '';
        root.querySelector('.b2-trick').innerHTML = p.lead ? p.lead.cards.map(x => cardHTML(x, newMove ? 'in from-' + from : '')).join('') : '';
      }
      // Mano
      const hand = B.sortHand(v.priv.hand, c.bySuit);
      for (const x of [...c.sel]) if (!hand.includes(x)) c.sel.delete(x);
      const hKey = hand.join(',') + '|' + [...c.sel].join(',');
      if (hKey !== c.handKey) {
        c.handKey = hKey;
        root.querySelector('.b2-hand').innerHTML = hand.map(x => cardHTML(x, c.sel.has(x) ? 'up' : '')).join('');
        requestAnimationFrame(() => RB.layoutHand(c));
      }
      if (newMove) { c.hint = null; c.hintI = -1; RB.hideHints(); }
      // Te toca
      if (p.turn === v.you && c.turnWas !== v.you && !v.res) { G.Audio.sfx('shake'); }
      c.turnWas = p.turn;
      RB.buttons(v, c);
      RB.results(v, c);
      RB.tick(v, c);
    },

    tick(v, c) {
      const root = $('pt-body'), p = v.pub;
      if (!root.querySelector('.b2-table')) return;
      const left = Math.max(0, v.left - (Date.now() - v.at));
      const frac = v.turnMs ? left / v.turnMs : 0;
      root.querySelectorAll('.b2-tm').forEach(el => {
        const j = el.classList.contains('me') ? v.you : +el.parentElement.dataset.seat;
        const on = p.turn === j && v.left > 0 && !v.res;
        el.classList.toggle('hidden', !on);
        if (on) { el.firstElementChild.style.width = (frac * 100).toFixed(1) + '%'; el.classList.toggle('urgent', left < 6000); }
      });
      const mi = root.querySelector('.b2-meinfo');
      if (mi && p.turn === v.you && v.left > 0 && !v.res) mi.dataset.sec = Math.ceil(left / 1000) + 's';
      else if (mi) delete mi.dataset.sec;
    },

    results(v, c) {
      const box = $('pt-body').querySelector('.b2-res');
      if (!v.res) { box.classList.add('hidden'); c.resKey = ''; return; }
      const key = v.sid + ':' + v.round + ':' + (G.Party.isHost ? 1 : 0);
      if (key === c.resKey) return;
      c.resKey = key;
      const won = v.pub.winner === v.you;
      G.Audio.sfx(won ? 'levelup' : 'gameover');
      const rows = v.res.map(r => {
        const s = v.seats[r.seat];
        return `<tr class="${r.seat === v.you ? 'me' : ''}"><td>${r.place}</td><td class="nm" translate="no">${esc(seatName(s))}</td>
          <td>${r.left}</td><td>${r.pts ? '+' + r.pts : '0'}</td><td><b>${s.total}</b></td></tr>`;
      }).join('');
      const host = G.Party.isHost;
      box.innerHTML = `<div class="box b2-resbox">
        <h3>${esc(won ? G.T('¡Has ganado la ronda!') : G.I18n.f('¡{x} se queda sin cartas y gana!', seatName(v.seats[v.pub.winner])))}</h3>
        <table class="b2-rt"><thead><tr><th>#</th><th>${G.T('Jugador')}</th><th>${G.T('Cartas que quedan')}</th><th>${G.T('Esta ronda')}</th><th>${G.T('Puntos totales')}</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="sub" style="margin:6px 0">${G.T('Cada carta que queda es un punto de castigo: menos es mejor.')}</p>
        <div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap">
          ${host ? `<button class="btn gold" data-r="again">${G.T('Otra ronda')}</button>` : `<span class="sub" style="margin:0">${G.T('Esperando al anfitrión…')}</span>`}
          <button class="btn ghost" data-r="room">${G.T('Volver a la sala')}</button>
        </div></div>`;
      box.classList.remove('hidden');
      box.querySelectorAll('[data-r]').forEach(b => {
        b.onclick = () => { if (b.dataset.r === 'again') G.Party.again(); else G.Party.leave(); };
      });
    }
  };

  const RENDER = { bigtwo: RB };

  // Se engancha al cargar (G.Party ya existe: se carga antes).
  wire();

  return { open, close, flash, rules, RENDER };
})();
