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
      else if (what === 'err') { G.Audio.sfx('error'); flash(G.I18n.f(x.err, x.x && G.T(x.x))); }
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

  // ---------------- «¡Te toca!» bien visible (2026-10-22, pedido del dueño: «好幾次換到我都不知道») ----------------
  // Lo usan los tres juegos de cartas. Al pasar el turno a ti: cartel grande en el centro, sonido,
  // vibración (móvil) y, si la pestaña está escondida, el título parpadea. Mientras es tu turno: tu
  // zona con borde dorado que late (.pt-mine) y una barra de tiempo grande encima de la mano.
  let titleT = 0, titleWas = '';
  function titleStop() {
    if (!titleT) return;
    clearInterval(titleT); titleT = 0;
    if (titleWas) document.title = titleWas;
  }
  function titleFlash() {
    if (titleT || !document.hidden) return;
    titleWas = document.title;
    let k = 0;
    titleT = setInterval(() => {
      if (!document.hidden) { titleStop(); return; }
      document.title = ++k % 2 ? '▶ ' + G.T('¡Te toca en la mesa de cartas!') : titleWas;
    }, 900);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) titleStop(); });

  /** meSel: selector de tu zona (.b2-me / .tc-me / .vb-me). mine: puedes jugar ahora. */
  function turnCue(v, c, mine, meSel) {
    const root = $('pt-body'), me = root.querySelector(meSel);
    if (me) {
      me.classList.toggle('pt-mine', mine);
      let bar = me.querySelector('.pt-tbar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'pt-tbar hidden';
        bar.innerHTML = '<i></i><b translate="no"></b>';
        me.appendChild(bar);
      }
    }
    const p = v.pub;
    // Sólo cuando el turno PASA a ti (no cada vez que vuelve a ser «jugable» dentro del mismo turno).
    const turnKey = v.round + ':' + p.turn;
    if (p.turn !== v.you || v.res) c.cueKey = '';
    const fresh = mine && c.cueKey !== turnKey;
    if (mine) c.cueKey = turnKey;
    if (!mine) { titleStop(); return; }
    if (!fresh) return;
    G.Audio.sfx('heal');
    try { if (navigator.vibrate) navigator.vibrate([140, 70, 140]); } catch (e) { /* sin vibración */ }
    titleFlash();
    let ban = root.querySelector('.pt-yt');
    if (ban) ban.remove();
    ban = document.createElement('div');
    ban.className = 'pt-yt';
    ban.innerHTML = `<b>${esc(G.T('¡Te toca!'))}</b><span>${esc(G.T('Es tu turno en la mesa: elige tu jugada.'))}</span>`;
    root.appendChild(ban);
    setTimeout(() => ban.remove(), 1700);
  }
  /** Barra de tiempo grande sobre tu mano (cada 200 ms, desde el tick de cada juego). */
  function turnBar(v, mine, meSel) {
    const me = $('pt-body').querySelector(meSel), bar = me && me.querySelector('.pt-tbar');
    if (!bar) return;
    const on = mine && v.left > 0 && v.turnMs > 0 && !v.res;
    bar.classList.toggle('hidden', !on);
    if (!on) return;
    const left = Math.max(0, v.left - (Date.now() - v.at));
    bar.style.setProperty('--p', Math.min(1, left / v.turnMs).toFixed(3));
    bar.classList.toggle('urgent', left < 8000);
    bar.querySelector('b').textContent = G.I18n.f('Te quedan {x} s para jugar', Math.ceil(left / 1000));
  }

  /** Flecha «le toca» encima del cuadro de quien juega (todos los juegos; el tuyo dice «¡Te toca!»). */
  function seatArrows(v) {
    const p = v.pub, root = $('pt-body');
    root.querySelectorAll('[data-seat]').forEach(el => {
      const who = el.querySelector(':scope > .b2-who');
      if (!who) return;
      const j = +el.dataset.seat, on = p.turn === j && !v.res;
      let a = who.querySelector('.pt-arrow');
      if (!on) { if (a) a.remove(); return; }
      if (!a) { a = document.createElement('span'); a.className = 'pt-arrow'; who.appendChild(a); }
      a.classList.toggle('me', j === v.you);
      a.textContent = G.T(j === v.you ? '¡Te toca!' : 'Le toca jugar');
    });
  }

  // ---------------- la última jugada se queda a la vista antes del resultado (2026-10-22) ----------------
  // Pedido del dueño: «剩最後一張要顯示他出甚麼牌，太快跳到結算畫面了». Al acabar la ronda, la mesa sigue
  // ~2,5 s con la jugada final y el cartel «¡出完了！»; luego sale la pantalla de resultados. Si entras
  // con la ronda ya acabada (recarga), sale directa.
  const FIN_MS = 2600;
  /** true = todavía no enseñes los resultados. */
  function holdResults(v, c) {
    const root = $('pt-body');
    if (!v.res) { c.liveRound = v.round; c.finKey = ''; const f = root.querySelector('.pt-fin'); if (f) f.remove(); return false; }
    if (c.liveRound !== v.round) return false;
    const key = v.sid + ':' + v.round;
    if (c.finKey !== key) {
      c.finKey = key; c.finAt = Date.now();
      const yt = root.querySelector('.pt-yt');
      if (yt) yt.remove();      // que no tape la última carta
      const w = v.pub.winner, s = w >= 0 ? v.seats[w] : null;
      const f = document.createElement('div');
      f.className = 'pt-fin';
      f.innerHTML = `<b>${esc(G.T('¡Se acabaron sus cartas!'))}</b>` + (s ? `<span translate="no">${esc(w === v.you ? G.T('¡Has echado tu última carta!') : G.I18n.f('{x} ha echado su última carta', seatName(s)))}</span>` : '');
      root.appendChild(f);
      G.Audio.sfx('confirm');
      setTimeout(() => { if (cur === c && G.Party.view) render(G.Party.view); }, FIN_MS + 40);
    }
    if (Date.now() - c.finAt < FIN_MS) return true;
    const f = root.querySelector('.pt-fin');
    if (f) f.remove();
    return false;
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
    teamBar(v);
    R.update(v, cur);
    decorTeams(v);
    seatArrows(v);
  }

  // ---------------- 2 contra 2 (2026-10-17): lo común a los juegos con equipos ----------------
  // v.teams = equipo de cada asiento (0 azul, 1 rojo) o null. Los compañeros se sientan enfrente
  // (party.js), así que tu compañero sale arriba.
  const TEAM_NAMES = ['Equipo azul', 'Equipo rojo'];
  const teamName = t => G.T(TEAM_NAMES[t] || '');
  const mateOf = (v, a, b) => !!(v.teams && a !== b && v.teams[a] === v.teams[b]);
  /**
   * 2 contra 2 (2026-10-19, pedido del dueño): en el asiento de tu compañero, sus cartas de cara (en
   * pequeño) en vez del abanico boca abajo. v.priv.mate = { seat, hand } (party.js mateHand; sólo os
   * llega a vosotros dos). fan: el abanico de ese asiento; card: (id, extra) => HTML de la carta.
   */
  function mateHand(el, fan, v, j, card) {
    const m = v.priv && v.priv.mate && v.priv.mate.seat === j ? v.priv.mate.hand : null;
    let box = el.querySelector('.pt-mh');
    if (!m) { if (box) box.remove(); fan.classList.remove('hidden'); return; }
    fan.classList.add('hidden');
    if (!box) { box = document.createElement('div'); box.className = 'pt-mh'; fan.parentNode.insertBefore(box, fan); }
    const k = m.join(',');
    if (box.dataset.k === k) return;
    box.dataset.k = k;
    box.innerHTML = `<small>${esc(G.T('Mano de tu compañero'))}</small><div class="pt-mhc">${m.map(id => card(id, 'pt-mini')).join('')}</div>`;
  }

  /** En la barra de arriba: «2 對 2» y tu equipo (con su color). */
  function teamBar(v) {
    let el = $('pt-team');
    if (!el) {
      el = document.createElement('span');
      el.id = 'pt-team';
      $('pt-round').after(el);
    }
    const on = !!v.teams;
    el.classList.toggle('hidden', !on);
    if (!on) return;
    const t = v.teams[v.you];
    el.className = 'pt-team t' + t;
    el.innerHTML = `<b>${esc(G.T('2 contra 2'))}</b><span>${esc(teamName(t))}</span>`;
  }

  /** Color del equipo en el cuadro de cada jugador y la insignia «隊友» / «紅隊» (los demás juegos, nada). */
  function decorTeams(v) {
    const root = $('pt-body');
    root.classList.toggle('pt-duo', !!v.teams);
    if (!v.teams) return;
    root.querySelectorAll('[data-seat]').forEach(el => {
      const j = +el.dataset.seat, t = v.teams[j], who = el.querySelector('.b2-who');
      if (!who || !(t >= 0)) return;
      const mate = mateOf(v, v.you, j);
      who.classList.toggle('tm0', t === 0); who.classList.toggle('tm1', t === 1); who.classList.toggle('mate', mate);
      let b = who.querySelector('.pt-tm');
      if (j === v.you) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); who.appendChild(b); }
      b.className = 'pt-tm t' + t + (mate ? ' mate' : '');
      b.textContent = mate ? G.T('Tu compañero de equipo') : teamName(t);
    });
  }

  /**
   * Final de ronda con equipos: título y subtítulo del cartel y el podio agrupado por equipos
   * (primero el ganador). card(r) = el HTML de la ficha de cada fila. null si no hay equipos.
   */
  function teamResults(v, card) {
    if (!v.teams || !v.res) return null;
    const wt = v.teams[v.pub.winner];
    const won = v.teams[v.you] === wt;
    const group = t => {
      const rows = v.res.filter(r => v.teams[r.seat] === t);
      return `<div class="pt-tg t${t}${t === wt ? ' win' : ''}"><div class="pt-tgh">${esc(teamName(t))}${t === wt ? ' ★' : ''}</div><div class="pt-tgc">${rows.map(card).join('')}</div></div>`;
    };
    return {
      won, team: wt,
      title: G.T(won ? '¡Hemos ganado en equipo!' : 'Esta ronda la ha perdido tu equipo'),
      sub: G.T(wt === 0 ? '¡Victoria del equipo azul!' : '¡Victoria del equipo rojo!'),
      podium: group(wt) + group(1 - wt)
    };
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
      `<i class="b2w">${B.SUITS[s]}</i>` +
      (src ? `<img class="b2m" src="${src}" alt="" draggable="false">` : `<span class="b2m b2ms">${B.SUITS[s]}</span>`) +
      `<span class="b2i b2i2"><b>${r}</b><i>${B.SUITS[s]}</i></span></div>`;
  }

  /** Dónde se sienta cada uno (visto desde ti): abajo tú; los demás en orden de turno a la derecha, arriba, izquierda. */
  function places(n) { return n === 2 ? ['top'] : n === 3 ? ['right', 'left'] : ['right', 'top', 'left']; }

  /*
   * Mesa (2026-10-17, pedido del dueño, estilo de los juegos de cartas del móvil): cada jugador con su
   * cuadro grande (Pokémon + placa con el nombre) y el tiempo como un aro alrededor; los rivales con sus
   * cartas boca abajo en abanico; tu mano grande abajo (lo que puedes echar, iluminado; lo demás, apagado);
   * a la derecha, botones redondos grandes. La pista sube en tu mano las cartas de la jugada (otra vez: la
   * siguiente). "Auto": la CPU juega por ti hasta que lo quites.
   */
  function whoHTML(me) {
    return `<div class="b2-who${me ? ' me' : ''}">
      <div class="b2-av"><span class="b2-sec hidden"></span></div>
      <div class="b2-plate"><b class="b2-name" translate="no"></b><span class="b2-tag"></span></div>
      <div class="b2-bub hidden">${G.T('Ha pasado')}</div>
    </div>`;
  }
  /** Abanico de cartas boca abajo (cada una un poco girada). */
  function fanHTML(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += `<i class="b2-back fan" style="--r:${((i - (n - 1) / 2) * 3.2).toFixed(1)}deg"></i>`;
    return h;
  }

  const RB = {
    rulesTitle: 'Reglas del Big Two',
    rules() {
      const L = ['Cada jugador recibe 13 cartas. Gana quien se quede sin cartas el primero.',
        'Orden de las cartas: 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2. Si empatan, por el palo: ♣ < ♦ < ♥ < ♠.',
        'Empieza quien tiene el 3♣ y su primera jugada tiene que llevarlo (con menos de 4 jugadores, si nadie lo tiene, la carta más baja).',
        // (2026-10-19, reglas del dueño: sin tríos ni colores; cada tipo sólo gana a su tipo; bombas.)
        'Jugadas: suelta, pareja, escalera, full, póker (4 iguales + 1) y escalera de color. No valen el trío ni el color.',
        'Sólo se gana a una jugada del mismo tipo: suelta a suelta, pareja a pareja, escalera a escalera, full a full. O pasas.',
        'Bombas: el póker y la escalera de color ganan a cualquier jugada (también a sueltas y parejas). Entre bombas, la escalera de color gana al póker.',
        'Escaleras: 5 rangos seguidos de 3 a A; también valen A-2-3-4-5 (la más baja) y 2-3-4-5-6. No valen J-Q-K-A-2 ni las que tienen el 2 en medio.',
        'Pasar no te deja fuera de la baza. Si todos los demás pasan, quien jugó la última abre como quiera.',
        'Al acabar, cada carta que te queda es un punto de castigo. Los puntos se suman ronda tras ronda: menos es mejor.',
        'Tienes 30 segundos por turno; si se acaba el tiempo, pasas (o echas la carta obligada al abrir).',
        'Con «Juego automático» la CPU juega por ti hasta que lo quites.'];
      const suits = SUIT_MON.map((d, s) => `<span class="b2-rs s${s}" translate="no">${G.BigTwo.SUITS[s]}</span> ${esc((G.DEX_BY[d] || {}).name || '')}`).join(' · ');
      return `<ul class="b2-rules">${L.map(t => `<li>${esc(G.T(t))}</li>`).join('')}</ul><p class="b2-rules-s">${G.T('Palos')}: ${suits}</p>`;
    },

    build(root, v, c) {
      c.sel = new Set();
      c.bySuit = (() => { try { return localStorage.getItem('ps.b2.sort') === 'suit'; } catch (e) { return false; } })();
      c.hint = null; c.hintI = -1; c.lastSeq = 0; c.handKey = ''; c.trickKey = ''; c.turnWas = -2; c.resKey = ''; c.legalKey = ''; c.legal = null;
      const n = v.seats.length, pl = places(n);
      let opp = '';
      for (let k = 1; k < n; k++) {
        const j = (v.you + k) % n;
        opp += `<div class="b2-opp pos-${pl[k - 1]}" data-seat="${j}">${whoHTML(false)}
          <div class="b2-fanw"><div class="b2-fan"></div><span class="b2-cnt" translate="no"></span></div></div>`;
      }
      root.innerHTML = `<div class="b2-table n${n}">
        ${opp}
        <div class="b2-mid"><div class="b2-cap"></div><div class="b2-trick"></div></div>
        <div class="b2-me" data-seat="${v.you}">
          ${whoHTML(true)}
          <div class="b2-handwrap"><div class="b2-hpill hidden"></div><div class="b2-hand"></div>
            <button class="b2-autocover hidden" data-b2="autooff"></button></div>
          <div class="b2-acts">
            <div class="b2-sm">
              <button class="b2-pill" data-b2="sort"></button>
              <button class="b2-pill" data-b2="auto">${G.T('Juego automático')}</button>
            </div>
            <div class="b2-big">
              <button class="b2-rb hint" data-b2="hint">${G.T('Pista de jugada')}</button>
              <button class="b2-rb pass" data-b2="pass">${G.T('Pasar turno')}</button>
              <button class="b2-rb play" data-b2="play">${G.T('Echar cartas')}</button>
            </div>
          </div>
          <div id="pt-flash" class="b2-flash hidden"></div>
        </div>
        <div class="b2-res hidden"></div>
      </div>`;
      // Avatares (sprites animados): una vez por partida.
      root.querySelectorAll('[data-seat]').forEach(el => {
        const s = v.seats[+el.dataset.seat];
        el.querySelector('.b2-av').appendChild(G.UI.spriteCanvas(s.dex, 144, 128, { scale: 4, hero: true, shiny: !!s.shiny }));
      });
      const hand = root.querySelector('.b2-hand');
      hand.onclick = e => {
        const el = e.target.closest('.b2c');
        if (!el) return;
        const id = +el.dataset.c;
        // (2026-10-19, pedido del dueño) Las que no entran en ninguna jugada (oscurecidas) no se pueden elegir.
        if (el.classList.contains('dim') && !c.sel.has(id)) return;
        if (c.sel.has(id)) c.sel.delete(id); else c.sel.add(id);
        el.classList.toggle('up', c.sel.has(id));
        c.hintI = -1;
        root.querySelector('.b2-hpill').classList.add('hidden');
        G.Audio.sfx('select');
        RB.buttons(G.Party.view, c);
      };
      root.querySelector('.b2-me').onclick = e => {
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
        else if (k === 'auto' || k === 'autooff') {
          const me = v2.seats[v2.you], on = k === 'auto' && !(me.auto || me.afk);
          G.Party.act({ type: 'auto', on });
          G.Audio.sfx('select');
        } else if (k === 'play') {
          if (!c.sel.size) { G.Audio.sfx('error'); flash(G.T('Elige alguna carta.')); return; }
          RB.send(v2, c, { type: 'play', cards: [...c.sel] });
        }
      };
      window.addEventListener('resize', () => RB.layoutHand(c));
    },

    send(v, c, a) {
      const r = G.Party.act(a);
      if (!r.ok) { G.Audio.sfx('error'); flash(G.I18n.f(r.err, r.x && G.T(r.x))); return; }
      if (a.type === 'play') c.sel.clear();
      c.hintI = -1;
    },

    /** Jugadas posibles ahora (la recomendada primero al abrir). */
    plays(v, c) {
      const p = v.pub, hand = v.priv.hand;
      const hs = v.round * 10000 + (p.last ? p.last.seq : 0) + '|' + hand.join();
      if (c.hint && c.hintSeq === hs) return c.hint;
      let list = G.BigTwo.legalPlays(hand, p.lead, p.first ? p.must : -1).map(x => x.cards);
      if (!p.lead) {
        // Al abrir, primero lo que haría la CPU (suelta la carta más baja en la jugada más larga).
        const opp = v.seats.map((s, j) => (j === v.you ? 99 : p.counts[j]));
        const best = G.BigTwo.cpuMove(hand, { lead: null, must: p.first ? p.must : -1, oppMin: Math.min(...opp), mine: hand.length });
        if (best.cards) list = [best.cards].concat(list.filter(x => x.join() !== best.cards.join()));
      } else {
        // Sobre la mesa: primero las más bajas (lo que menos te cuesta).
        const B = G.BigTwo;
        list.sort((a, b) => Math.max(...a.map(B.rankOf)) - Math.max(...b.map(B.rankOf)) || a.length - b.length);
      }
      c.hint = list; c.hintSeq = hs; c.hintI = -1;
      return list;
    },

    /** Pista: sube en tu mano las cartas de una jugada posible; otra vez, la siguiente. */
    hintNext(v, c) {
      const p = v.pub;
      if (p.turn !== v.you) { flash(G.T('No es tu turno.')); return; }
      const list = RB.plays(v, c);
      if (!list.length) { flash(G.T('No tienes ninguna jugada que gane: pasa.')); G.Audio.sfx('error'); return; }
      c.hintI = (c.hintI + 1) % list.length;
      const i = c.hintI, t = G.BigTwo.classify(list[i]);
      c.sel = new Set(list[i]);
      const pill = $('pt-body').querySelector('.b2-hpill');
      pill.textContent = G.I18n.f('Pista {x}/{x}', String(i + 1), String(list.length)) + ' · ' +
        (i === 0 && !p.lead ? G.T('Recomendada') : G.T(t ? G.BigTwo.TYPE_NAMES[t.type] : ''));
      pill.classList.remove('hidden');
      G.Audio.sfx('select');
      c.handKey = ''; RB.update(v, c);
    },

    /** Coloca las cartas de la mano: se solapan lo justo para que quepan sin barra. */
    layoutHand(c) {
      const wrap = document.querySelector('#scr-party .b2-handwrap'), hand = wrap && wrap.querySelector('.b2-hand');
      if (!hand) return;
      const cards = hand.children.length;
      if (!cards) return;
      const cw = hand.firstElementChild.getBoundingClientRect().width || 60;
      const room = wrap.clientWidth - 8;
      // (2026-10-19, «las cartas están demasiado juntas»: antes 50-72 % del ancho; si no caben, barra horizontal.)
      const fit = cards > 1 ? (room - cw) / (cards - 1) : cw;
      const step = cards > 1 ? Math.max(cw * 0.62, Math.min(cw * 0.92, fit)) : cw;
      wrap.classList.toggle('scroll', cards > 1 && fit < cw * 0.62);
      hand.style.setProperty('--step', (step - cw) + 'px');
      // Lo que se ve de cada carta (el Pokémon se encoge a ese ancho para no quedar cortado por la siguiente).
      hand.style.setProperty('--vis', Math.round(step) + 'px');
    },

    buttons(v, c) {
      const root = $('pt-body'), p = v.pub, me = v.seats[v.you], auto = !!(me.auto || me.afk), mine = p.turn === v.you && !v.res && !auto;
      const q = k => root.querySelector(`[data-b2="${k}"]`);
      if (!q('play')) return;
      q('play').disabled = !mine;
      q('pass').disabled = !mine || !p.lead;
      q('hint').disabled = !mine;
      q('sort').textContent = G.T(c.bySuit ? 'Ordenar por palo' : 'Ordenar por número');
      q('auto').classList.toggle('on', auto);
      const cover = q('autooff');
      cover.classList.toggle('hidden', !auto || !!v.res);
      cover.textContent = G.T('La CPU juega por ti · toca para seguir tú');
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
      // Jugadores (rivales y tú)
      root.querySelectorAll('[data-seat]').forEach(el => {
        const j = +el.dataset.seat, s = v.seats[j], isMe = j === v.you;
        el.querySelector('.b2-name').textContent = isMe ? s.name : seatName(s);
        const away = !s.cpu && (s.gone || s.afk || s.auto);
        const tag = el.querySelector('.b2-tag');
        tag.textContent = away ? G.T('Juega la CPU') : G.I18n.f('Castigo: {x}', String(s.total));
        tag.classList.toggle('away', away);
        el.classList.toggle('on', p.turn === j && !v.res);
        el.querySelector('.b2-bub').classList.toggle('hidden', !p.passed[j] || !p.lead);
        if (!isMe) {
          // Sus cartas boca abajo, de verdad, y el número encima.
          const fan = el.querySelector('.b2-fan'), nC = p.counts[j];
          if (fan.childElementCount !== nC) fan.innerHTML = fanHTML(nC);
          el.querySelector('.b2-cnt').textContent = nC;
          el.classList.toggle('few', nC <= 2 && !v.res);
        }
      });
      // Mesa
      const cap = root.querySelector('.b2-cap');
      let capT;
      if (v.res) capT = G.I18n.f('¡{x} se queda sin cartas y gana!', name(p.winner));
      else if (p.lead) capT = name(p.lead.seat) + ' · ' + G.T(B.TYPE_NAMES[p.lead.type]);
      else if (p.first && p.must >= 0) capT = p.turn === v.you ? G.I18n.f('Abres tú: tu jugada tiene que llevar el {x}.', B.label(p.must)) : G.I18n.f('Abre la mesa {x} (con el {x})', name(p.turn), B.label(p.must));
      else capT = p.turn === v.you ? G.T('Abres tú: echa lo que quieras.') : G.I18n.f('Abre la mesa {x}', name(p.turn));
      cap.textContent = capT;
      // Sólo cuando cambian las cartas de la mesa (pasar no las vuelve a animar: 2026-10-17, pedido del dueño).
      const tKey = p.lead ? v.round + '/' + p.lead.seat + '/' + p.lead.cards.join(',') : 'none';
      if (tKey !== c.trickKey) {
        c.trickKey = tKey;
        const from = p.lead ? (p.lead.seat === v.you ? 'bottom' : places(n)[(p.lead.seat - v.you + n) % n - 1]) : '';
        root.querySelector('.b2-trick').innerHTML = p.lead ? p.lead.cards.map(x => cardHTML(x, newMove ? 'in from-' + from : '')).join('') : '';
      }
      if (newMove) { c.hintI = -1; root.querySelector('.b2-hpill').classList.add('hidden'); }
      // Mano: lo que puedes echar, iluminado (si te toca).
      const hand = B.sortHand(v.priv.hand, c.bySuit);
      for (const x of [...c.sel]) if (!hand.includes(x)) c.sel.delete(x);
      const me = v.seats[v.you], myTurn = p.turn === v.you && !v.res && !(me.auto || me.afk);
      let legal = null;
      if (myTurn) { legal = new Set(); for (const pl of RB.plays(v, c)) for (const x of pl) legal.add(x); }
      const hKey = hand.join(',') + '|' + [...c.sel].join(',') + '|' + (legal ? [...legal].join(',') : '-');
      if (hKey !== c.handKey) {
        c.handKey = hKey;
        root.querySelector('.b2-hand').innerHTML = hand.map(x => cardHTML(x, (c.sel.has(x) ? 'up ' : '') + (legal && !legal.has(x) ? 'dim' : ''))).join('');
        requestAnimationFrame(() => RB.layoutHand(c));
      }
      root.querySelector('.b2-table').classList.toggle('myturn', myTurn);
      // Te toca (2026-10-22: cartel, sonido, vibración, borde y barra de tiempo; turnCue)
      turnCue(v, c, myTurn, '.b2-me');
      c.turnWas = p.turn;
      RB.buttons(v, c);
      RB.results(v, c);
      RB.tick(v, c);
    },

    /** Aro de tiempo alrededor del cuadro de quien juega y los segundos. */
    tick(v, c) {
      const root = $('pt-body'), p = v.pub;
      if (!root.querySelector('.b2-table')) return;
      const me = v.seats[v.you];
      turnBar(v, p.turn === v.you && !v.res && !(me.auto || me.afk), '.b2-me');
      const left = Math.max(0, v.left - (Date.now() - v.at));
      const frac = v.turnMs ? left / v.turnMs : 0;
      root.querySelectorAll('[data-seat]').forEach(el => {
        const j = +el.dataset.seat, av = el.querySelector('.b2-av'), sec = el.querySelector('.b2-sec');
        const on = p.turn === j && v.left > 0 && !v.res;
        av.classList.toggle('timed', on);
        sec.classList.toggle('hidden', !on);
        if (on) {
          av.style.setProperty('--p', frac.toFixed(3));
          av.classList.toggle('urgent', left < 8000);
          sec.textContent = Math.ceil(left / 1000);
        }
      });
    },

    /*
     * Final de ronda (2026-10-17, estilo de los juegos del móvil): cartel grande con cinta, el número
     * que sube, Poké Balls que vuelan hacia el ganador, y luego cada jugador con su puesto y sus puntos.
     * Tocar salta la animación.
     */
    results(v, c) {
      const box = $('pt-body').querySelector('.b2-res');
      if (!v.res) { holdResults(v, c); box.classList.add('hidden'); box.innerHTML = ''; c.resKey = ''; clearInterval(c.countT); return; }
      if (holdResults(v, c)) return;      // la última jugada, un momento a la vista
      const key = v.sid + ':' + v.round + ':' + (G.Party.isHost ? 1 : 0);
      if (key === c.resKey) return;
      c.resKey = key;
      const won = v.pub.winner === v.you;
      const mine = v.res.find(r => r.seat === v.you) || { place: 1, pts: 0 };
      const others = v.res.reduce((t, r) => t + (r.seat === v.pub.winner ? 0 : r.left), 0);
      const target = won ? others : mine.pts;
      G.Audio.sfx(won ? 'levelup' : 'gameover');
      // Adornos (una vez, con valores al azar fijos): Poké Balls y monedas que vuelan al cartel, confeti y destellos.
      const R = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
      let balls = '', confetti = '', stars = '';
      if (won) {
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * 6.283, d = 38 + Math.random() * 30;
          balls += `<i class="${i % 3 ? 'b2-coin' : 'b2-ball'}" style="--x:${(Math.cos(a) * d).toFixed(1)}vw;--y:${(Math.sin(a) * d * 0.7).toFixed(1)}vh;--d:${R(0, 0.9)}s"></i>`;
        }
        const COL = ['#ffd23f', '#ff5a4e', '#4a88ff', '#5fcb6a', '#ff9ed8', '#ffffff'];
        for (let i = 0; i < 36; i++) confetti += `<i class="b2-conf" style="left:${R(0, 100)}%;--c:${COL[i % COL.length]};--d:${R(0, 1.6)}s;--t:${R(2.2, 3.6)}s;--s:${R(-1, 1)}"></i>`;
      }
      for (let i = 0; i < 8; i++) stars += `<i class="b2-star" style="left:${R(-8, 108)}%;top:${R(-10, 100)}%;--d:${R(0, 1.4)}s"></i>`;
      const cards = v.res.slice().sort((a, b) => a.place - b.place).map(r => {
        const s = v.seats[r.seat];
        return `<div class="b2-pc p${r.place}${r.seat === v.you ? ' me' : ''}" data-ps="${r.seat}" style="--i:${r.place}">
          ${r.place === 1 ? '<i class="b2-crown"></i>' : ''}<span class="b2-medal">${r.place}</span><div class="b2-pav"></div>
          <b class="b2-pn" translate="no">${esc(r.seat === v.you ? s.name : seatName(s))}</b>
          <div class="b2-pr"><span>${G.T('Cartas que quedan')}</span><b>${r.left}</b></div>
          <div class="b2-pr"><span>${G.T('Esta ronda')}</span><b class="${r.pts ? 'bad' : 'good'}">${r.pts ? '+' + r.pts : '0'}</b></div>
          <div class="b2-pr"><span>${G.T('Puntos totales')}</span><b>${s.total}</b></div>
        </div>`;
      }).join('');
      const host = G.Party.isHost;
      box.innerHTML = `<div class="b2-rays ${won ? 'win' : 'lose'}"></div><div class="b2-confw">${confetti}</div><div class="b2-fx">${balls}</div>
        <div class="b2-banner ${won ? 'win' : 'lose'}">${stars}
          <div class="b2-btw"><div class="b2-bt">${esc(won ? G.T('¡Victoria!') : G.I18n.f('Puesto {x}', String(mine.place)))}</div></div>
          <div class="b2-rib"><div class="b2-ribbon"><span class="b2-num" translate="no">0</span></div></div>
          <div class="b2-bsub">${esc(won ? G.T('Cartas de los rivales') : G.T('Puntos de castigo'))}</div>
        </div>
        <div class="b2-podium">${cards}</div>
        <div class="b2-rbtns">
          ${host ? `<button class="btn gold" data-r="again">${G.T('Otra ronda')}</button>` : `<span class="sub" style="margin:0">${G.T('Esperando al anfitrión…')}</span>`}
          <button class="btn ghost" data-r="room">${G.T('Volver a la sala')}</button>
        </div>
        <div class="b2-skip">${G.T('Toca para saltar')}</div>`;
      box.querySelectorAll('.b2-pc').forEach(el => {
        const s = v.seats[+el.dataset.ps];
        el.querySelector('.b2-pav').appendChild(G.UI.spriteCanvas(s.dex, 144, 128, { scale: 4, hero: true, shiny: !!s.shiny }));
      });
      box.className = 'b2-res';
      const num = box.querySelector('.b2-num');
      const t0 = Date.now(), DUR = 1300;
      const done = () => { clearInterval(c.countT); num.textContent = (won ? '' : '+') + target; box.classList.add('done'); };
      clearInterval(c.countT);
      c.countT = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / DUR);
        num.textContent = (won ? '' : '+') + Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k >= 1) done();
      }, 40);
      setTimeout(() => { if (c.resKey === key) done(); }, 2200);
      box.onclick = e => {
        const b = e.target.closest('[data-r]');
        if (b && box.classList.contains('done')) { if (b.dataset.r === 'again') G.Party.again(); else G.Party.leave(); return; }
        done();
      };
    }
  };

  const RENDER = { bigtwo: RB };

  // Se engancha al cargar (G.Party ya existe: se carga antes).
  wire();

  return { open, close, flash, rules, RENDER, teamResults, mateOf, mateHand, teamName, turnCue, turnBar, holdResults };
})();
