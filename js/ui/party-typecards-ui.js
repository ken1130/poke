/* ============ party-typecards-ui.js — mesa de las Cartas de tipos (寶可夢屬性牌) ============
 * Se engancha a la mesa del modo fiesta (party-game-ui.js) como RENDER.types. Estilo de
 * juego de cartas de móvil (2026-10-17, pedido del dueño):
 *   - cada rival: retrato grande en un cuadro con su placa de nombre, y sus cartas boca abajo
 *     en un abanico grande al lado; insignia «¡Última carta!»; botón «¡Te pillé!» encima
 *     de quien se ha olvidado de avisar;
 *   - en el centro: la carta de arriba en grande, el mazo ladeado, el arco con flechas del
 *     sentido de juego (color = tipo actual) y la ficha del tipo en mesa;
 *   - abajo: tu mano en cartas grandes solapadas; en tu turno las que valen suben y brillan
 *     y las demás se oscurecen. Toca una para elegirla y otra vez (o «Echar la carta») para
 *     echarla. «Pista» sólo levanta la carta recomendada (sin lista). Botón redondo rojo
 *     «¡Última carta!» abajo a la derecha;
 *   - al acabar, pantalla de victoria (cinta, puntos contando, monedas y Poké Balls que
 *     vuelan; sólo CSS). Tocar salta la animación.
 * Lógica y reglas: js/systems/party/typecards.js. Estilos: css/party-typecards.css.
 */
(() => {
  const UI = G.PartyGameUI;
  if (!UI || !UI.RENDER) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TC = () => G.TypeCards;
  const seatName = s => (s.cpu ? G.I18n.f('{x} (jugador CPU)', G.T((G.DEX_BY[s.dex] || {}).name || 'CPU')) : s.name);
  const body = () => $('pt-body');
  const q = s => body().querySelector(s);

  // Tipos: 0 fuego, 1 agua, 2 planta, 3 eléctrico, 4 comodín. Mascotas.
  const TYPE_DEX = [4, 7, 1, 25];
  const WILD_DEX = 132, WILD4_DEX = 150;
  const TYPE_NAMES = ['Tipo de cartas Fuego', 'Tipo de cartas Agua', 'Tipo de cartas Planta', 'Tipo de cartas Eléctrico'];
  const ACT_NAMES = { 10: 'Carta Somnífero', 11: 'Carta Ida y vuelta', 12: 'Carta Doble golpe', 13: 'Carta Ditto', 14: 'Carta Poder de Mewtwo' };
  const typeName = c => G.T(TYPE_NAMES[c] || '');
  /** «火 7», «水 睡眠粉», «百變怪». */
  function label(id) {
    const d = TC().card(id);
    if (d.v >= 13) return G.T(ACT_NAMES[d.v]);
    return typeName(d.c) + ' ' + (d.v >= 10 ? G.T(ACT_NAMES[d.v]) : d.v);
  }

  // ---------------- retratos (una vez por Pokémon) ----------------
  const portraits = new Map();
  let portraitWait = false;
  function portrait(dex) {
    if (portraits.has(dex)) return portraits.get(dex);
    const sh = G.Sprites.sheet(dex, 'Idle'), m = G.Sprites.animMeta(dex, 'Idle');
    if (!sh || !m) return null;
    if (!sh.ready) {
      if (!portraitWait) {
        portraitWait = true;
        setTimeout(() => { portraitWait = false; const c = cur(); if (c) { c.handKey = ''; c.pileKey = ''; const v = G.Party.view; if (v && v.game === 'types') R.update(v, c); } }, 400);
      }
      return null;
    }
    const cv = document.createElement('canvas');
    cv.width = m.w; cv.height = m.h;
    const cx = cv.getContext('2d');
    cx.drawImage(sh.img, 0, 0, m.w, m.h, 0, 0, m.w, m.h);
    const d = cx.getImageData(0, 0, m.w, m.h).data;
    let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (d[(y * m.w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    const url = out.toDataURL();
    portraits.set(dex, url);
    return url;
  }
  let curC = null;
  const cur = () => (curC && G.Party.view && G.Party.view.sid === curC.sid ? curC : null);

  /** Carta de cara. */
  function cardHTML(id, extra = '') {
    const d = TC().card(id), sym = TC().sym(id);
    const dex = d.v === 14 ? WILD4_DEX : d.v === 13 ? WILD_DEX : TYPE_DEX[d.c];
    const src = portrait(dex);
    const nm = d.v >= 10 ? `<span class="tcn">${esc(G.T(ACT_NAMES[d.v]))}</span>` : '';
    const big = d.v >= 10 ? `<span class="tcb">${sym}</span>` : '';
    return `<div class="tcc t${d.c} v${d.v} ${extra}" data-c="${id}"><span class="tci">${sym}</span>${big}` +
      (src ? `<img class="tcm" src="${src}" alt="" draggable="false">` : '<span class="tcm"></span>') + nm +
      `<span class="tci tci2">${sym}</span></div>`;
  }
  const backHTML = (extra = '') => `<i class="tcback ${extra}"></i>`;
  /** Cuadro del jugador (las mismas piezas que el Big Two: retrato, aro de tiempo, placa). */
  function whoHTML(me) {
    return `<div class="b2-who tc-who${me ? ' me' : ''}">
      <div class="b2-av"><span class="b2-sec hidden"></span></div>
      <div class="b2-plate"><b class="b2-name" translate="no"></b><span class="b2-tag"></span></div>
      <span class="tc-last hidden">${esc(G.T('¡Última carta!'))}</span>
    </div>`;
  }
  /** Abanico de cartas boca abajo (cada una un poco girada). */
  function fanHTML(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += `<i class="tcback fan" style="--r:${((i - (n - 1) / 2) * 3.4).toFixed(1)}deg"></i>`;
    return h;
  }

  /** Dónde se sienta cada jugador (visto desde ti): en sentido horario abajo -> izquierda -> arriba -> derecha. */
  const places = n => (n === 2 ? ['top'] : n === 3 ? ['left', 'right'] : ['left', 'top', 'right']);
  const posOf = (v, j) => (j === v.you ? 'me' : places(v.seats.length)[(j - v.you + v.seats.length) % v.seats.length - 1]);

  // Texto de cada suceso (para la línea del centro).
  function evText(v, e) {
    const nm = j => seatName(v.seats[j]);
    switch (e.k) {
      case 'play': return G.I18n.f('{x} ha echado la carta {x}', nm(e.seat), label(e.card)) + (TC().card(e.card).v >= 13 ? ' → ' + typeName(e.color) : '');
      case 'skip': return G.I18n.f('{x} pierde el turno en las cartas de tipos', nm(e.seat));
      case 'rev': return G.T('¡Cambia el sentido de la mesa!');
      case 'draw': return e.why ? G.I18n.f('{x} roba {x} cartas y pierde el turno', nm(e.seat), e.n) : G.I18n.f('{x} roba una carta del mazo de tipos', nm(e.seat));
      case 'pick': return G.I18n.f('{x} elige el tipo de la mesa: {x}', nm(e.seat), typeName(e.color));
      case 'call': return G.I18n.f('¡{x} avisa de su última carta!', nm(e.seat));
      case 'pen': return e.by >= 0 ? G.I18n.f('¡{x} pilla a {x} sin avisar: roba 2 cartas!', nm(e.by), nm(e.seat)) : G.I18n.f('{x} no avisó de su última carta: roba 2 cartas', nm(e.seat));
      case 'win': return G.I18n.f('¡{x} se queda sin cartas y gana!', nm(e.seat));
      case 'flip': return G.I18n.f('Primera carta de la mesa: {x}', label(e.card));
      default: return '';
    }
  }

  const R = {
    rulesTitle: 'Reglas de las cartas de tipos',
    rules() {
      const def = G.Party.game('types'), secs = Math.round((def ? def.turnMs : 30000) / 1000);
      const L = ['Cada jugador recibe 7 cartas. Gana la ronda quien se quede sin cartas el primero.',
        'Hay 108 cartas de cuatro tipos: fuego, agua, planta y eléctrico. De cada tipo: un 0, dos de cada número del 1 al 9 y dos de cada carta de efecto; además, 4 Ditto y 4 Poder de Mewtwo.',
        'En tu turno echa una carta del mismo tipo que la mesa, o con el mismo número o símbolo, o un comodín.',
        'Si no puedes (o no quieres), roba una carta; si la que robas vale, puedes echarla ya o quedártela.',
        'Somnífero ⊘: el siguiente pierde el turno.',
        'Ida y vuelta ⇄: cambia el sentido del juego. Con 2 jugadores funciona como Somnífero.',
        'Doble golpe +2: el siguiente roba 2 cartas y pierde el turno.',
        'Ditto ★: puedes echarlo siempre y eliges el tipo con el que se sigue.',
        'Poder de Mewtwo +4: eliges el tipo, y el siguiente roba 4 cartas y pierde el turno. Se puede echar siempre (sin regla de desafío).',
        'Los +2 y +4 no se acumulan: quien los recibe roba y pierde el turno.',
        'Cuando te quede 1 carta pulsa «¡Última carta!» (o antes, en tu turno con 2 cartas): todos oyen el aviso. Mientras no avises, los demás pueden pulsar «¡Te pillé!» hasta que el siguiente juegue o robe; si te pillan, o si no avisaste a tiempo, robas 2. Gana quien pulse primero.',
        'Las CPU avisan con un poco de retraso y a veces se les olvida: ¡atento para pillarlas!',
        'Con «Juego automático» la CPU juega por ti hasta que lo quites.',
        'Primera carta: si es Poder de Mewtwo vuelve al mazo; si es Ditto, el primero elige el tipo; Somnífero, Ida y vuelta y Doble golpe afectan al primer jugador.',
        'Puntos: el ganador suma las cartas que les quedan a los demás (número = su valor, efecto = 20, comodín = 50). Se acumulan ronda tras ronda: más es mejor.'];
      // 2 contra 2 (2026-10-17).
      const L2 = ['2 contra 2 (con 4 en la mesa): los compañeros se sientan enfrente, así que el siguiente y el anterior siempre son rivales.',
        'En 2 contra 2, en cuanto uno se queda sin cartas gana su equipo, y los dos compañeros se llevan los mismos puntos: lo que suman las manos de los dos rivales.',
        'En 2 contra 2 no puedes pillar a tu compañero, sólo a los rivales.'];
      const types = TYPE_DEX.map((d, c) => `<span class="tc-rs t${c}">${esc(typeName(c))}</span> ${esc(G.T((G.DEX_BY[d] || {}).name || ''))}`).join(' · ');
      return `<ul class="b2-rules tc-rules">${L.map(t => `<li>${esc(G.T(t))}</li>`).join('')}${L2.map(t => `<li class="pt-r2">${esc(G.T(t))}</li>`).join('')}<li>${esc(G.I18n.f('Tienes {x} segundos por turno en las cartas de tipos; si se acaba el tiempo, robas una carta y pasas.', secs))}</li></ul>` +
        `<p class="b2-rules-s">${esc(G.T('Tipos y mascotas'))}: ${types}</p>`;
    },

    build(root, v, c) {
      curC = c;
      c.sel = -1; c.sug = -1; c.lastKey = 0; c.handKey = ''; c.pileKey = ''; c.resKey = ''; c.turnWas = -2; c.pickFor = null; c.dirWas = 0;
      const n = v.seats.length, pl = places(n);
      let opp = '';
      for (let k = 1; k < n; k++) {
        const j = (v.you + k) % n;
        opp += `<div class="tc-opp pos-${pl[k - 1]}" data-seat="${j}">${whoHTML(false)}
          <div class="tc-fanw"><div class="b2-fan tc-fan"></div><span class="b2-cnt tc-cnt" translate="no"></span></div>
          <button class="tc-catch hidden" data-tc="catch">${esc(G.T('¡Te pillé!'))}</button>
        </div>`;
      }
      root.innerHTML = `<div class="tc-table n${n}">
        ${opp}
        <div class="tc-mid">
          <div class="tc-center">
            <button class="tc-pile" data-tc="draw" aria-label="${esc(G.T('Robar una carta'))}">${backHTML('p3')}${backHTML('p2')}${backHTML('p1')}<b class="tc-deckn"></b></button>
            <div class="tc-discwrap">
              <svg class="tc-arc" viewBox="0 0 100 100" aria-hidden="true">
                <path d="M 50 6 A 44 44 0 0 1 94 50" /><path d="M 94 50 l -6 -8 m 6 8 l 7 -7" class="hd" />
                <path d="M 50 94 A 44 44 0 0 1 6 50" /><path d="M 6 50 l 6 8 m -6 -8 l -7 7" class="hd" />
              </svg>
              <div class="tc-disc"></div>
            </div>
            <div class="tc-side">
              <div class="tc-type"></div>
              <div class="tc-dir"></div>
            </div>
          </div>
        </div>
        <div class="tc-cap"></div>
        <div class="tc-me" data-seat="${v.you}">
          ${whoHTML(true)}
          <div class="tc-handwrap"><div class="tc-hand"></div>
            <button class="b2-autocover hidden" data-tc="autooff"></button></div>
          <div class="tc-acts">
            <div class="b2-sm"><button class="b2-pill" data-tc="auto">${esc(G.T('Juego automático'))}</button></div>
            <div class="b2-big">
              <button class="b2-rb hint" data-tc="hint">${esc(G.T('Pista de jugada'))}</button>
              <button class="b2-rb pass tc-drawb" data-tc="drawbtn"></button>
              <button class="b2-rb tc-playb" data-tc="play">${esc(G.T('Echar la carta'))}</button>
              <button class="tc-callb" data-tc="call">${esc(G.T('¡Última carta!'))}</button>
            </div>
          </div>
          <div id="pt-flash" class="b2-flash tc-flash hidden"></div>
        </div>
        <div class="tc-pick hidden"></div>
        <div class="b2-res tc-res hidden"></div>
      </div>`;
      root.querySelectorAll('[data-seat]').forEach(el => {
        const s = v.seats[+el.dataset.seat];
        el.querySelector('.b2-av').appendChild(G.UI.spriteCanvas(s.dex, 144, 128, { scale: 4, hero: true, shiny: !!s.shiny }));
      });
      root.querySelector('.tc-hand').onclick = e => {
        const el = e.target.closest('.tcc');
        if (el) R.tapCard(+el.dataset.c);
      };
      root.querySelector('.tc-table').addEventListener('click', e => {
        const b = e.target.closest('[data-tc]');
        if (!b || b.disabled) return;
        const v2 = G.Party.view, k = b.dataset.tc;
        if (k === 'draw' || k === 'drawbtn') {
          if (v2.pub.phase === 'drawn') R.send({ type: 'keep' });
          else if (k === 'draw' && v2.pub.turn !== v2.you) return;
          else R.send({ type: 'draw' });
        } else if (k === 'play') {
          const id = v2.pub.phase === 'drawn' ? v2.priv.drawn : c.sel;
          if (id < 0) { G.Audio.sfx('error'); UI.flash(G.T('Toca primero una carta de tu mano.')); return; }
          R.playCard(id);
        } else if (k === 'hint') R.hint(v2, c);
        else if (k === 'call') R.send({ type: 'call' }, true);
        else if (k === 'auto' || k === 'autooff') {
          const me = v2.seats[v2.you], on = k === 'auto' && !(me.auto || me.afk);
          G.Party.act({ type: 'auto', on });
          G.Audio.sfx('select');
        }
        else if (k === 'catch') R.send({ type: 'catch' }, true);
      });
      window.addEventListener('resize', () => { if (cur()) R.layoutHand(); });
    },

    send(a, quiet) {
      const r = G.Party.act(a);
      if (!r.ok) { G.Audio.sfx('error'); UI.flash(G.I18n.f(r.err, r.x)); return false; }
      if (!quiet) G.Audio.sfx('click');
      const c = cur();
      if (c && a.type === 'play') { c.sel = -1; c.sug = -1; }
      return true;
    },

    tapCard(id) {
      const v = G.Party.view, c = cur();
      if (!v || !c || v.res) return;
      if (v.seats[v.you].auto || v.seats[v.you].afk) return;
      const p = v.pub;
      if (p.turn !== v.you) { G.Audio.sfx('select'); c.sel = c.sel === id ? -1 : id; c.handKey = ''; R.update(v, c); return; }
      const ok = TC().legalView(v.priv.hand, p, v.priv.drawn);
      // (2026-10-19, pedido del dueño) Las que no se pueden echar (oscurecidas) no responden al tocarlas.
      if (!ok.includes(id)) return;
      if (c.sel === id) { R.playCard(id); return; }
      c.sel = id; c.handKey = '';
      G.Audio.sfx('select');
      R.update(v, c);
    },

    playCard(id) {
      const v = G.Party.view;
      if (!v) return;
      if (TC().isWild(id)) { R.openPick(id); return; }
      R.send({ type: 'play', card: id });
    },

    /** Elegir el tipo: tras echar un comodín (forCard >= 0) o al empezar con Ditto (forCard = -1). */
    openPick(forCard) {
      const c = cur(), box = q('.tc-pick');
      if (!c || !box) return;
      c.pickFor = forCard;
      const btns = [0, 1, 2, 3].map(t => { const src = portrait(TYPE_DEX[t]);
        return `<button class="tc-pt t${t}" data-pt="${t}">${src ? `<img src="${src}" alt="" draggable="false">` : ''}<b>${esc(typeName(t))}</b></button>`; }).join('');
      box.innerHTML = `<div class="tc-pickbox"><h3>${esc(G.T(forCard >= 0 ? 'Elige el tipo con el que se sigue' : 'La primera carta es Ditto: elige el tipo'))}</h3>
        <div class="tc-pts">${btns}</div>${forCard >= 0 ? `<button class="btn ghost tc-btn" data-px>${esc(G.T('Elegir otra carta'))}</button>` : ''}</div>`;
      box.classList.remove('hidden');
      box.onclick = e => {
        if (e.target.closest('[data-px]')) { R.closePick(); return; }
        const b = e.target.closest('[data-pt]');
        if (!b) return;
        const color = +b.dataset.pt, f = c.pickFor;
        R.closePick();
        if (f >= 0) R.send({ type: 'play', card: f, color });
        else R.send({ type: 'color', color });
      };
      G.Audio.sfx('select');
    },
    closePick() { const box = q('.tc-pick'); if (box) box.classList.add('hidden'); const c = cur(); if (c) c.pickFor = null; },

    /** Pista: sube la carta recomendada en la mano (sin lista). */
    hint(v, c) {
      const p = v.pub;
      if (p.turn !== v.you || v.res) { UI.flash(G.T('No es tu turno.')); return; }
      if (p.phase === 'pick') { R.openPick(-1); return; }
      const hand = v.priv.hand, n = v.seats.length;
      const nx = TC().nextSeat({ n, dir: p.dir }, v.you), pv = TC().nextSeat({ n, dir: p.dir }, v.you, -1);
      const m = TC().cpuMove(hand, Object.assign({ top: p.top, color: p.color, phase: p.phase, drawn: v.priv.drawn, nextCount: p.counts[nx], prevCount: p.counts[pv], n },
        TC().teamCtx({ teams: v.teams, counts: p.counts, lastCol: p.lastCol }, v.you)));
      if (m.type !== 'play') {
        G.Audio.sfx('error');
        UI.flash(G.T(p.phase === 'drawn' ? 'La carta robada no te conviene: quédatela.' : 'No tienes ninguna carta que valga: roba una.'));
        const pile = q('.tc-pile');
        if (pile) { pile.classList.remove('nudge'); void pile.offsetWidth; pile.classList.add('nudge'); }
        return;
      }
      c.sug = m.card; c.sel = m.card; c.handKey = '';
      G.Audio.sfx('select');
      R.update(v, c);
      const el = q(`.tc-hand .tcc[data-c="${m.card}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center' });
    },

    /** Cartas solapadas lo justo para que quepan; si no caben, barra horizontal. */
    layoutHand() {
      const wrap = q('.tc-handwrap'), hand = wrap && wrap.querySelector('.tc-hand');
      if (!hand || !hand.children.length) return;
      const k = hand.children.length;
      const cw = hand.firstElementChild.offsetWidth || 64;
      const room = wrap.clientWidth - 12;
      const min = cw * 0.62;          // (2026-10-19: antes 0,4; las cartas iban demasiado juntas)
      let step = k > 1 ? Math.min(cw + 6, (room - cw) / (k - 1)) : cw;
      const scroll = step < min;
      if (scroll) step = min;
      wrap.classList.toggle('scroll', scroll);
      hand.style.setProperty('--step', (step - cw).toFixed(1) + 'px');
    },

    update(v, c) {
      curC = c;
      const root = body(), p = v.pub, T = TC(), n = v.seats.length;
      if (!root.querySelector('.tc-table')) return;
      const meS = v.seats[v.you];
      const mine = p.turn === v.you && !v.res && !(meS.auto || meS.afk);
      const key = v.round * 1e6 + p.moves;
      const fresh = key !== c.lastKey;
      // ---- sucesos de la última acción (animación + sonido + texto) ----
      if (fresh) {
        if (c.lastKey) R.events(v, c);
        else c.evText = (p.ev || []).map(e => evText(v, e)).filter(Boolean).pop() || '';
        c.lastKey = key;
        c.sug = -1;
        if (p.phase !== 'drawn' && c.sel >= 0 && !v.priv.hand.includes(c.sel)) c.sel = -1;
      }
      // ---- voz de «¡Última carta!» (una vez por aviso; al entrar a mitad no suena la de antes) ----
      const lc = p.lastCall, ck = v.round + ':' + (lc ? lc.seq : 0);
      if (c.callKey != null && ck !== c.callKey && lc) { R.voice(v, lc.seat); window.__tcVoice = (window.__tcVoice || 0) + 1; }
      c.callKey = ck;
      // ---- jugadores (rivales y tú) ----
      root.querySelectorAll('.tc-table [data-seat]').forEach(el => {
        const j = +el.dataset.seat, s = v.seats[j], isMe = j === v.you, nC = p.counts[j];
        el.querySelector('.b2-name').textContent = isMe ? s.name : seatName(s);
        const away = !s.cpu && (s.gone || s.afk || s.auto);
        const tag = el.querySelector('.b2-tag');
        tag.textContent = away ? G.T('Juega la CPU') : G.I18n.f('{x} pts de cartas de tipos', s.total);
        tag.classList.toggle('away', away);
        el.classList.toggle('on', p.turn === j && !v.res);
        el.querySelector('.tc-last').classList.toggle('hidden', !p.called[j] || !!v.res);
        if (isMe) return;
        const fan = el.querySelector('.tc-fan'), show = Math.min(nC, 14);
        if (fan.childElementCount !== show) fan.innerHTML = fanHTML(show);
        UI.mateHand(el, fan, v, j, cardHTML);       // 2 contra 2: la mano del compañero, de cara
        el.querySelector('.tc-cnt').textContent = nC;
        el.classList.toggle('few', nC <= 2 && !v.res);
        el.classList.toggle('vuln', p.vuln === j && !v.res);
        el.querySelector('.tc-catch').classList.toggle('hidden', p.vuln !== j || !!v.res || UI.mateOf(v, v.you, j));   // al compañero no se le pilla
      });
      const auto = !!(meS.auto || meS.afk);
      root.querySelector('.tc-me').classList.toggle('mine', mine);
      root.querySelector('[data-tc="auto"]').classList.toggle('on', auto);
      const cover = root.querySelector('[data-tc="autooff"]');
      cover.classList.toggle('hidden', !auto || !!v.res);
      cover.textContent = G.T('La CPU juega por ti · toca para seguir tú');
      // ---- centro ----
      const cap = root.querySelector('.tc-cap');
      let capT;
      if (v.res) capT = G.I18n.f('¡{x} se queda sin cartas y gana!', seatName(v.seats[p.winner]));
      else if (mine) capT = G.T(p.phase === 'pick' ? 'La primera carta es Ditto: elige el tipo' : p.phase === 'drawn' ? 'Has robado una carta que vale: échala o quédatela.' : 'Te toca: echa una carta del mismo tipo o número, o roba una.');
      else capT = G.I18n.f('Es el turno de {x} en las cartas de tipos', seatName(v.seats[p.turn]));
      cap.innerHTML = `<b>${esc(capT)}</b>${c.evText && !v.res ? `<span>${esc(c.evText)}</span>` : ''}`;
      cap.classList.toggle('mine', mine);
      cap.classList.toggle('hidden', !!v.res);
      const pKey = p.top + '/' + p.under.join(',') + '/' + key + '/' + (portraits.size);
      if (pKey !== c.pileKey) {
        const playEv = fresh && c.lastKey && (p.ev || []).find(e => e.k === 'play');
        const from = playEv ? posOf(v, playEv.seat) : '';
        c.pileKey = pKey;
        const rot = [-14, 9, -5];
        root.querySelector('.tc-disc').innerHTML = p.under.map((id, i) => cardHTML(id, 'under" style="--r:' + rot[i % 3] + 'deg')).join('') +
          cardHTML(p.top, 'top' + (from ? ' in from-' + from : ''));
      }
      const table = root.querySelector('.tc-table');
      for (let t = 0; t < 4; t++) table.classList.toggle('col' + t, p.color === t);
      table.classList.toggle('cw', p.dir === 1);
      table.classList.toggle('ccw', p.dir !== 1);
      root.querySelector('.tc-type').innerHTML = p.color >= 0 ? `<i class="tc-dot t${p.color}"></i>${esc(G.I18n.f('Tipo en mesa: {x}', typeName(p.color)))}` : esc(G.T('Tipo por elegir'));
      root.querySelector('.tc-dir').textContent = (p.dir === 1 ? '↻ ' : '↺ ') + G.T(p.dir === 1 ? 'Sentido horario de la mesa' : 'Sentido antihorario de la mesa');
      root.querySelector('.tc-deckn').textContent = p.deck;
      if (c.dirWas && c.dirWas !== p.dir) { const arc = root.querySelector('.tc-arc'); arc.classList.remove('flip'); void arc.offsetWidth; arc.classList.add('flip'); }
      c.dirWas = p.dir;
      // ---- mano ----
      const hand = T.sortHand(v.priv.hand);
      const ok = mine ? T.legalView(hand, p, v.priv.drawn) : [];
      if (c.sel >= 0 && !hand.includes(c.sel)) c.sel = -1;
      if (p.phase === 'drawn' && mine) c.sel = v.priv.drawn;
      const hKey = hand.join(',') + '|' + c.sel + '|' + c.sug + '|' + ok.join(',') + '|' + mine + '|' + portraits.size;
      if (hKey !== c.handKey) {
        c.handKey = hKey;
        root.querySelector('.tc-hand').innerHTML = hand.map(x => cardHTML(x, [
          mine ? (ok.includes(x) ? 'ok' : 'no') : '', x === c.sel ? 'sel' : '', x === c.sug ? 'sug' : '', x === v.priv.drawn && mine ? 'drawn' : ''].join(' '))).join('');
        requestAnimationFrame(() => R.layoutHand());
      }
      // ---- botones ----
      const db = root.querySelector('[data-tc="drawbtn"]'), pb = root.querySelector('[data-tc="play"]');
      db.textContent = G.T(p.phase === 'drawn' && mine ? 'Quedarme la carta' : 'Robar una carta');
      db.disabled = !mine;
      pb.disabled = !mine || p.phase === 'pick' || (p.phase !== 'drawn' && !ok.includes(c.sel));
      root.querySelector('.tc-pile').classList.toggle('can', mine && p.phase !== 'drawn');
      root.querySelector('[data-tc="hint"]').disabled = !mine;
      root.querySelector('.tc-table').classList.toggle('myturn', mine);
      const cnt = v.priv.hand.length;
      const canCall = !v.res && !v.priv.called && (cnt === 1 || (p.turn === v.you && cnt === 2 && p.phase !== 'pick'));
      const callB = root.querySelector('[data-tc="call"]');
      callB.disabled = !canCall;
      callB.classList.toggle('urgent', canCall);
      callB.classList.toggle('done', !!v.priv.called && cnt <= 2 && !v.res);
      callB.textContent = G.T(v.priv.called && cnt <= 2 ? '¡Avisado!' : '¡Última carta!');
      // Ditto de primera: elegir tipo.
      if (mine && p.phase === 'pick' && c.pickFor == null) R.openPick(-1);
      if (c.pickFor != null && (!mine || (c.pickFor < 0 && p.phase !== 'pick'))) R.closePick();
      if (mine && c.turnWas !== v.you) G.Audio.sfx('shake');
      c.turnWas = p.turn;
      R.results(v, c);
      R.tick(v, c);
    },

    /** Animaciones y sonidos de lo que acaba de pasar (baratas: clases CSS que se quitan solas). */
    events(v, c) {
      const p = v.pub, evs = p.ev || [];
      let txt = '';
      for (const e of evs) {
        const t = evText(v, e);
        if (t) txt = t;
        if (e.k === 'play') G.Audio.sfx(e.seat === v.you ? 'confirm' : 'click');
        else if (e.k === 'draw') { R.flyDraw(v, e.seat, e.n); R.badge(v, e.seat, '+' + e.n, e.why ? 'bad' : ''); if (e.why) G.Audio.sfx('hurt'); }
        else if (e.k === 'pen') { R.flyDraw(v, e.seat, e.n); R.badge(v, e.seat, '+' + e.n, 'bad'); G.Audio.sfx('hurt'); G.UI.toast(evText(v, e), 2600); }
        else if (e.k === 'skip') R.badge(v, e.seat, G.T('¡Turno perdido!'), 'skip');
        else if (e.k === 'call') R.badge(v, e.seat, G.T('¡Última carta!'), 'call');
        else if (e.k === 'rev') G.Audio.sfx('select');
      }
      if (txt) c.evText = txt;
    },

    /**
     * «¡Última carta!» en voz alta para todos (2026-10-17, pedido del dueño): una vez por aviso
     * (pub.lastCall.seq), también en el anfitrión. Respeta el silencio y el volumen de efectos.
     */
    voice(v, seat) {
      const set = G.Audio.settings || {};
      if (set.muted || !(set.sfx > 0)) return;
      G.Audio.sfx('legend');
      try {
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
        const L = G.I18n.lang;
        const u = new SpeechSynthesisUtterance(L === 'en' ? 'Last card!' : L === 'es' ? '¡Última carta!' : '最後一張！');
        u.lang = L === 'en' ? 'en-US' : L === 'es' ? 'es-ES' : 'zh-TW';
        u.pitch = 1.3; u.rate = 1.1; u.volume = Math.min(1, set.sfx * 1.3);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (e) { /* sin voz: sólo el efecto */ }
    },

    seatEl(v, j) { return q(`.tc-table [data-seat="${j}"] .b2-who`); },

    /** Burbuja corta encima del jugador (+2, ¡Turno perdido!...). */
    badge(v, j, text, cls) {
      const el = R.seatEl(v, j);
      if (!el) return;
      const b = document.createElement('span');
      b.className = 'tc-pop ' + (cls || '');
      b.textContent = text;
      el.appendChild(b);
      setTimeout(() => b.remove(), 1300);
    },

    /** Cartas boca abajo que vuelan del mazo al jugador (una o dos; se quitan solas). */
    flyDraw(v, j, k) {
      const pile = q('.tc-pile'), to = R.seatEl(v, j), tbl = q('.tc-table');
      if (!pile || !to || !tbl || !k) return;
      const a = pile.getBoundingClientRect(), b = to.getBoundingClientRect(), o = tbl.getBoundingClientRect();
      for (let i = 0; i < Math.min(k, 3); i++) {
        const f = document.createElement('i');
        f.className = 'tcback fly';
        f.style.left = (a.left - o.left + a.width / 2) + 'px';
        f.style.top = (a.top - o.top + a.height / 2) + 'px';
        f.style.setProperty('--dx', (b.left + b.width / 2 - a.left - a.width / 2) + 'px');
        f.style.setProperty('--dy', (b.top + b.height / 2 - a.top - a.height / 2) + 'px');
        f.style.animationDelay = (i * 90) + 'ms';
        tbl.appendChild(f);
        setTimeout(() => f.remove(), 700 + i * 90);
      }
    },

    /** Aro de tiempo alrededor del cuadro de quien juega y los segundos (como el Big Two). */
    tick(v, c) {
      const root = body(), p = v.pub;
      if (!root.querySelector('.tc-table')) return;
      const left = Math.max(0, v.left - (Date.now() - v.at));
      const frac = v.turnMs ? left / v.turnMs : 0;
      root.querySelectorAll('.tc-table [data-seat]').forEach(el => {
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

    // ---------------- fin de ronda: pantalla de victoria ----------------
    results(v, c) {
      const box = q('.tc-res');
      if (!box) return;
      if (!v.res) { box.classList.add('hidden'); box.innerHTML = ''; c.resKey = ''; clearInterval(c.countT); return; }
      const key = v.sid + ':' + v.round + ':' + (G.Party.isHost ? 1 : 0);
      if (key === c.resKey) return;
      c.resKey = key;
      R.closePick();
      const mine = v.res.find(r => r.seat === v.you) || { place: 1, pts: 0, val: 0 };
      const duo = !!v.teams;
      // 2 contra 2: gana (o pierde) el equipo; el número son los puntos de cada ganador.
      const won = duo ? v.teams[v.you] === v.teams[v.pub.winner] : v.pub.winner === v.you;
      const target = duo ? (v.res.find(r => r.win) || { pts: 0 }).pts : won ? mine.pts : mine.val;
      G.Audio.sfx(won ? 'levelup' : 'gameover');
      let fx = '';
      if (won) for (let i = 0; i < 22; i++) {
        const a = Math.random() * 6.283, d = 38 + Math.random() * 30;
        fx += `<i class="${i % 3 ? 'b2-ball tc-coin' : 'b2-ball'}" style="--x:${(Math.cos(a) * d).toFixed(1)}vw;--y:${(Math.sin(a) * d * 0.7).toFixed(1)}vh;--d:${(Math.random() * 0.9).toFixed(2)}s"></i>`;
      }
      const card = r => {
        const s = v.seats[r.seat];
        return `<div class="b2-pc p${r.place}${r.seat === v.you ? ' me' : ''}${duo ? ' tm' + r.team : ''}" data-ps="${r.seat}">
          <span class="b2-medal">${r.place}</span><div class="b2-pav"></div>
          <b class="b2-pn" translate="no">${esc(r.seat === v.you ? s.name : seatName(s))}</b>
          <div class="b2-pr"><span>${esc(G.T('Cartas que quedan'))}</span><b>${r.left}</b></div>
          <div class="b2-pr"><span>${esc(G.T('Esta ronda'))}</span><b class="${r.pts ? 'good' : ''}">${r.pts ? '+' + r.pts : '0'}</b></div>
          <div class="b2-pr"><span>${esc(G.T('Puntos acumulados de cartas de tipos'))}</span><b>${s.total}</b></div>
        </div>`;
      };
      const tr = UI.teamResults(v, card);
      const cards = tr ? tr.podium : v.res.slice().sort((a, b) => a.place - b.place).map(card).join('');
      const title = tr ? tr.title : won ? G.T('¡Victoria!') : G.I18n.f('¡{x} gana esta ronda de cartas de tipos!', seatName(v.seats[v.pub.winner]));
      const sub = tr ? tr.sub + ' · ' + G.T('Puntos para cada uno del equipo ganador') : G.T(won ? 'puntos de la ronda' : 'Puntos que te quedaban en la mano');
      const host = G.Party.isHost;
      box.innerHTML = `<div class="b2-fx">${fx}</div>
        <div class="b2-banner ${won ? 'win' : 'lose'}${duo ? ' duo t' + tr.team : ''}">
          <div class="b2-bt">${esc(title)}</div>
          <div class="b2-ribbon"><span class="b2-num" translate="no">0</span></div>
          <div class="b2-bsub">${esc(sub)}</div>
        </div>
        <div class="b2-podium${duo ? ' duo' : ''}">${cards}</div>
        <p class="tc-rnote">${esc(G.T(duo ? 'En 2 contra 2, los dos del equipo ganador se llevan los puntos de las manos de los rivales. Más es mejor.' : 'El ganador se lleva los puntos de las cartas de los demás. Más es mejor.'))}</p>
        <div class="b2-rbtns">
          ${host ? `<button class="btn gold" data-r="again">${esc(G.T('Otra ronda'))}</button>` : `<span class="sub" style="margin:0">${esc(G.T('Esperando al anfitrión…'))}</span>`}
          <button class="btn ghost" data-r="room">${esc(G.T('Volver a la sala'))}</button>
        </div>
        <div class="b2-skip">${esc(G.T('Toca para saltar'))}</div>`;
      box.querySelectorAll('.b2-pc').forEach(el => {
        const s = v.seats[+el.dataset.ps];
        el.querySelector('.b2-pav').appendChild(G.UI.spriteCanvas(s.dex, 144, 128, { scale: 4, hero: true, shiny: !!s.shiny }));
      });
      box.className = 'b2-res tc-res';
      const num = box.querySelector('.b2-num');
      const t0 = Date.now(), DUR = 1300;
      const done = () => { clearInterval(c.countT); num.textContent = target; box.classList.add('done'); };
      clearInterval(c.countT);
      // El número sube con setInterval (pocos pasos; nada por fotograma).
      c.countT = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / DUR);
        num.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
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

  UI.RENDER.types = R;
})();
