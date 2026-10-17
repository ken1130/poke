/* ============ party-voltorb-ui.js — mesa de Voltorb travieso (頑皮雷彈) ============
 * Se engancha a la mesa del modo fiesta (party-game-ui.js) como RENDER.voltorb. Mismo estilo
 * de juego de cartas de móvil que el Big Two y las Cartas de tipos (2026-10-17):
 *   - cada rival: retrato grande + placa + sus cartas boca abajo en abanico y cuántas tiene;
 *     el que explota se queda en gris con la insignia «炸飛了»;
 *   - en el centro: el mazo grande (se puede tocar para robar; brilla más cuanto más peligro),
 *     el descarte con la última carta, cuántos Voltorb quedan, lo que sabes de arriba del mazo
 *     y la barra de la ventana de «看穿» (se encoge; con el botón grande si tienes Detección);
 *   - abajo: tu mano en cartas grandes solapadas; de cada carta se ve la franja izquierda con
 *     su símbolo, el Pokémon impreso y el nombre. Toca para elegir (las parejas se eligen
 *     juntas) y «出牌»; las que van contra alguien preguntan a quién;
 *   - Voltorb robado: pantalla roja que tiembla con la cuenta atrás y «使用絕緣橡膠»; luego,
 *     dónde lo vuelves a meter (botones + barra). La explosión es sólo CSS.
 * Lógica y reglas: js/systems/party/voltorb.js. Estilos: css/party-voltorb.css.
 */
(() => {
  const UI = G.PartyGameUI;
  if (!UI || !UI.RENDER) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VB = () => G.Voltorb;
  const seatName = s => (s.cpu ? G.I18n.f('{x} (jugador CPU)', G.T((G.DEX_BY[s.dex] || {}).name || 'CPU')) : s.name);
  const body = () => $('pt-body');
  const q = s => body().querySelector(s);

  // Cartas: nombre, símbolo de la esquina, Pokémon y qué hacen.
  const NAMES = { bomb: 'Carta bomba Voltorb', defuse: 'Carta Goma aislante', attack: 'Carta Berrinche de Mankey', skip: 'Carta Siesta de Snorlax',
    shuffle: 'Carta Teletransporte de Abra', future: 'Carta Premonición de Natu', favor: 'Carta Encanto de Clefairy', nope: 'Carta Detección de Wobbuffet' };
  const PAIR_NAMES = ['Carta de pareja Pikachu', 'Carta de pareja Psyduck', 'Carta de pareja Jigglypuff', 'Carta de pareja Meowth', 'Carta de pareja Magikarp'];
  const DEX = { bomb: 100, defuse: 50, attack: 56, skip: 143, shuffle: 63, future: 177, favor: 35, nope: 202 };
  const PAIR_DEX = [25, 54, 39, 52, 129];
  const SYM = { bomb: '!', defuse: '✚', attack: '×2', skip: 'zz', shuffle: '⇄', future: '◎', favor: '♥', nope: '⊘', pair: '★' };
  const DESC = {
    bomb: 'Voltorb: si lo robas sin goma aislante, explotas y quedas fuera.',
    defuse: 'Goma aislante: al robar un Voltorb lo desactivas y lo vuelves a meter en el mazo donde quieras.',
    attack: 'Berrinche: acabas tu turno sin robar y el siguiente juega 2 turnos.',
    skip: 'Siesta: acabas un turno sin robar.',
    shuffle: 'Teletransporte: baraja el mazo.',
    future: 'Premonición: mira en secreto las 3 cartas de arriba del mazo.',
    favor: 'Encanto: elige a alguien; tiene que darte una carta (la que él elija).',
    nope: 'Detección: anula la carta que alguien acaba de echar. Se usa en cualquier momento, también fuera de tu turno.',
    pair: 'Sin efecto sola. Dos del mismo Pokémon: robas una carta al azar a quien elijas.'
  };
  const nameOf = id => { const d = VB().card(id); return d.k === 'pair' ? PAIR_NAMES[d.p] : d.k === 'bomb' && d.alt ? 'Carta bomba Electrode' : NAMES[d.k]; };
  const label = id => G.T(nameOf(id));
  const dexOf = id => { const d = VB().card(id); return d.k === 'pair' ? PAIR_DEX[d.p] : d.k === 'bomb' && d.alt ? 101 : DEX[d.k]; };

  // ---------------- retratos (una vez por Pokémon; luego es un <img>) ----------------
  const portraits = new Map();
  let portraitWait = false;
  function portrait(dex) {
    if (portraits.has(dex)) return portraits.get(dex);
    const sh = G.Sprites.sheet(dex, 'Idle'), m = G.Sprites.animMeta(dex, 'Idle');
    if (!sh || !m) return null;
    if (!sh.ready) {
      if (!portraitWait) {
        portraitWait = true;
        setTimeout(() => { portraitWait = false; const c = cur(); if (c) { c.handKey = ''; c.discKey = ''; const v = G.Party.view; if (v && v.game === 'voltorb') R.update(v, c); } }, 400);
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

  /** Carta de cara: símbolo, Pokémon impreso a la izquierda (se ve aunque se solapen), nombre y marca de agua. */
  function cardHTML(id, extra = '') {
    const d = VB().card(id), src = portrait(dexOf(id));
    const cls = 'k-' + d.k + (d.k === 'pair' ? ' p' + d.p : '') + (d.alt ? ' alt' : '');
    return `<div class="vbc ${cls} ${extra}" data-c="${id}"><span class="vbi">${SYM[d.k]}</span>` +
      (src ? `<img class="vbm" src="${src}" alt="" draggable="false">` : '<span class="vbm"></span>') +
      `<b class="vbn">${esc(label(id))}</b><i class="vbw">${SYM[d.k]}</i></div>`;
  }
  const backHTML = (extra = '') => `<i class="b2-back vb-back ${extra}"></i>`;
  function fanHTML(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += `<i class="b2-back fan" style="--r:${((i - (n - 1) / 2) * 3.4).toFixed(1)}deg"></i>`;
    return h;
  }
  function whoHTML(me) {
    return `<div class="b2-who vb-who${me ? ' me' : ''}">
      <div class="b2-av"><span class="b2-sec hidden"></span></div>
      <div class="b2-plate"><b class="b2-name" translate="no"></b><span class="b2-tag"></span></div>
      <span class="vb-dead hidden">${esc(G.T('¡Fuera por explosión!'))}</span>
      <span class="vb-turns hidden"></span>
    </div>`;
  }
  const places = n => (n === 2 ? ['top'] : n === 3 ? ['left', 'right'] : ['left', 'top', 'right']);
  const posOf = (v, j) => (j === v.you ? 'me' : places(v.seats.length)[(j - v.you + v.seats.length) % v.seats.length - 1]);

  // ---------------- textos de los sucesos ----------------
  function evText(v, e) {
    const nm = j => (j === v.you ? G.T('Tú (en Voltorb travieso)') : seatName(v.seats[j]));
    switch (e.k) {
      case 'start': return G.I18n.f('Empieza la ronda de Voltorb: sale {x}', nm(e.seat));
      case 'play': {
        const c = label(e.cards[0]);
        return e.target >= 0 && (e.kind === 'favor' || e.kind === 'pair') ? G.I18n.f('{x} echa {x} contra {x}', nm(e.seat), c, nm(e.target)) : G.I18n.f('{x} echa la carta {x} en Voltorb', nm(e.seat), c);
      }
      case 'nope': return e.n % 2 ? G.I18n.f('¡{x} lo ve venir y lo anula con Detección!', nm(e.seat)) : G.I18n.f('¡{x} anula la anulación con otra Detección!', nm(e.seat));
      case 'cancel': return G.I18n.f('La carta de {x} queda anulada', nm(e.seat));
      case 'attack': return G.I18n.f('{x} tendrá que jugar {x} turnos seguidos', nm(e.to), e.turns);
      case 'skip': return G.I18n.f('{x} se echa la siesta y no roba', nm(e.seat));
      case 'shuffle': return G.I18n.f('{x} baraja el mazo con Teletransporte', nm(e.seat));
      case 'future': return G.I18n.f('{x} mira en secreto las 3 cartas de arriba', nm(e.seat));
      case 'favor': return G.I18n.f('{x} tiene que darle una carta a {x}', nm(e.to), nm(e.seat));
      case 'give': return G.I18n.f('{x} le da una carta a {x}', nm(e.seat), nm(e.to));
      case 'steal': return G.I18n.f('{x} le quita una carta al azar a {x}', nm(e.seat), nm(e.to));
      case 'nothing': return G.I18n.f('{x} no tiene cartas: no pasa nada', nm(e.to));
      case 'draw': return G.I18n.f('{x} roba una carta del mazo de Voltorb', nm(e.seat));
      case 'bomb': return G.I18n.f('¡{x} ha robado un Voltorb!', nm(e.seat));
      case 'defuse': return G.I18n.f('¡{x} desactiva el Voltorb con la goma aislante!', nm(e.seat));
      case 'insert': return G.I18n.f('{x} vuelve a meter el Voltorb en el mazo a escondidas', nm(e.seat));
      case 'boom': return G.I18n.f('¡{x} ha explotado!', nm(e.seat));
      case 'win': return G.I18n.f('¡{x} es el último en pie y gana!', nm(e.seat));
      default: return '';
    }
  }

  const R = {
    rulesTitle: 'Reglas de Voltorb travieso',
    rules() {
      const L = ['Cada jugador empieza con 1 goma aislante y 7 cartas. En el mazo hay tantos Voltorb como jugadores menos uno, y 2 gomas más (3 con 4 jugadores).',
        'En tu turno puedes echar todas las cartas de acción que quieras, una a una; para acabar, robas 1 carta del mazo.',
        'Si robas un Voltorb y tienes goma aislante, la usas y vuelves a meter el Voltorb en el mazo donde quieras, sin que nadie lo vea. Si no tienes, explotas: quedas fuera y tus cartas se descartan.',
        'Gana el último que quede sin explotar.',
        'Berrinche ×2: acabas tu turno sin robar y el siguiente juega 2 turnos. Si a ti te habían atacado, el siguiente juega los turnos que te quedaban más 2.',
        'Siesta zz: acabas un turno sin robar.',
        'Teletransporte ⇄: baraja el mazo.',
        'Premonición ◎: mira en secreto las 3 cartas de arriba del mazo.',
        'Encanto ♥: elige a alguien; tiene que darte una carta, la que él quiera (si tarda más de 15 s, una al azar).',
        'Detección ⊘: anula la última carta de acción. Cualquiera puede echarla mientras dura la barra de 3 s, también fuera de su turno; se puede anular una Detección con otra, y cada una vuelve a empezar la barra. No sirve contra la goma ni contra el Voltorb.',
        'Pokémon ★ (Pikachu, Psyduck, Jigglypuff, Meowth, Magikarp): solos no hacen nada; dos iguales roban una carta al azar a quien elijas.',
        'Tienes 30 segundos por turno; si se acaba el tiempo, robas una carta (y si es un Voltorb y tienes goma, se usa sola y se mete en un sitio al azar).',
        'Puntos por ronda según el puesto: con 4 jugadores 3/2/1/0, con 3 jugadores 3/1/0 y con 2 jugadores 3/0. Se acumulan ronda tras ronda.',
        'Con «Juego automático» la CPU juega por ti hasta que lo quites.'];
      const cards = Object.keys(NAMES).map(k => `<b>${esc(G.T(NAMES[k]))}</b>`).join(' · ');
      return `<ul class="b2-rules vb-rules">${L.map(t => `<li>${esc(G.T(t))}</li>`).join('')}</ul><p class="b2-rules-s">${cards}</p>`;
    },

    build(root, v, c) {
      curC = c;
      Object.assign(c, { sel: [], handKey: '', discKey: '', lastKey: 0, noteSeq: -1, resKey: '', turnWas: -2, target: null, peekSeq: 0, boomShown: '', alertKey: '', insPos: null, insSeq: 0, favorPick: -1 });
      const n = v.seats.length, pl = places(n);
      let opp = '';
      for (let k = 1; k < n; k++) {
        const j = (v.you + k) % n;
        opp += `<div class="vb-opp pos-${pl[k - 1]}" data-seat="${j}">${whoHTML(false)}
          <div class="vb-fanw"><div class="b2-fan vb-fan"></div><span class="b2-cnt vb-cnt" translate="no"></span></div></div>`;
      }
      root.innerHTML = `<div class="vb-table n${n}">
        ${opp}
        <div class="vb-mid">
          <div class="vb-center">
            <div class="vb-pilew">
              <button class="vb-pile" data-vb="draw" aria-label="${esc(G.T('Robar carta del mazo de Voltorb'))}">${backHTML('p3')}${backHTML('p2')}${backHTML('p1')}<b class="vb-deckn" translate="no"></b></button>
              <span class="vb-know hidden"></span>
            </div>
            <div class="vb-discw"><div class="vb-disc"></div><span class="vb-stamp hidden">${esc(G.T('¡Detección en Voltorb!'))}</span></div>
            <div class="vb-side">
              <div class="vb-bombs"><i class="vb-vico"></i><span></span></div>
              <div class="vb-left hidden"></div>
            </div>
          </div>
          <div class="vb-nope hidden">
            <div class="vb-nopet"></div>
            <div class="vb-bar"><i></i></div>
            <button class="vb-nopeb" data-vb="nope">${esc(G.T('¡Detección en Voltorb!'))}</button>
          </div>
        </div>
        <div class="vb-cap"></div>
        <div class="vb-log"></div>
        <div class="vb-me" data-seat="${v.you}">
          ${whoHTML(true)}
          <div class="vb-handwrap"><div class="vb-pill hidden"></div><div class="vb-hand"></div>
            <button class="b2-autocover hidden" data-vb="autooff"></button></div>
          <div class="vb-acts">
            <div class="b2-sm"><button class="b2-pill" data-vb="auto">${esc(G.T('Juego automático'))}</button></div>
            <div class="b2-big">
              <button class="b2-rb vb-playb" data-vb="play">${esc(G.T('Echar la carta'))}</button>
              <button class="b2-rb vb-drawb" data-vb="drawbtn">${esc(G.T('Robar carta del mazo de Voltorb'))}</button>
            </div>
          </div>
          <div id="pt-flash" class="b2-flash vb-flash hidden"></div>
        </div>
        <div class="vb-ov vb-target hidden"></div>
        <div class="vb-ov vb-favor hidden"></div>
        <div class="vb-ov vb-peek hidden"></div>
        <div class="vb-alert hidden"></div>
        <div class="vb-ov vb-boom hidden"></div>
        <div class="vb-ov vb-insert hidden"></div>
        <div class="vb-blast hidden"></div>
        <div class="b2-res vb-res hidden"></div>
      </div>`;
      root.querySelectorAll('.vb-table [data-seat]').forEach(el => {
        const s = v.seats[+el.dataset.seat];
        el.querySelector('.b2-av').appendChild(G.UI.spriteCanvas(s.dex, 144, 128, { scale: 4, hero: true, shiny: !!s.shiny }));
      });
      root.querySelector('.vb-hand').onclick = e => { const el = e.target.closest('.vbc'); if (el) R.tapCard(+el.dataset.c); };
      root.querySelector('.vb-table').addEventListener('click', e => {
        const b = e.target.closest('[data-vb]');
        if (!b || b.disabled) return;
        const v2 = G.Party.view, k = b.dataset.vb;
        if (k === 'draw' || k === 'drawbtn') { if (k === 'draw' && !R.mine(v2)) return; R.send({ type: 'draw' }); }
        else if (k === 'play') R.playSel();
        else if (k === 'nope') R.send({ type: 'nope', at: v2.pub.pend ? v2.pub.pend.nopes : 0 }, true);
        else if (k === 'auto' || k === 'autooff') {
          const me = v2.seats[v2.you], on = k === 'auto' && !(me.auto || me.afk);
          G.Party.act({ type: 'auto', on });
          G.Audio.sfx('select');
        }
      });
      window.addEventListener('resize', () => { if (cur()) R.layoutHand(); });
    },

    /** ¿Puedes echar cartas o robar ahora? */
    mine(v) {
      const p = v.pub, me = v.seats[v.you];
      return !v.res && p.turn === v.you && p.alive[v.you] && p.phase === 'play' && !p.pend && !(me.auto || me.afk);
    },

    send(a, quiet) {
      const r = G.Party.act(a);
      if (!r.ok) { G.Audio.sfx('error'); UI.flash(G.I18n.f(r.err, r.x)); return false; }
      if (!quiet) G.Audio.sfx('click');
      const c = cur();
      if (c && a.type === 'play') { c.sel = []; c.handKey = ''; }
      return true;
    },

    /** Tocar una carta: la elige (una pareja se elige junta); otra vez, la echa. */
    tapCard(id) {
      const v = G.Party.view, c = cur();
      if (!v || !c || v.res || !v.pub.alive[v.you]) return;
      if (v.seats[v.you].auto || v.seats[v.you].afk) return;
      const fv = v.pub.favor;
      if (fv && fv.to === v.you) { R.give(id); return; }
      const V = VB(), k = V.kind(id);
      if (c.sel.includes(id)) {
        if (R.mine(v) && R.selOk(v, c)) { R.playSel(); return; }
        c.sel = [];
      } else if (k === 'pair') {
        const mate = v.priv.hand.find(x => x !== id && V.kind(x) === 'pair' && V.card(x).p === V.card(id).p);
        c.sel = mate != null ? [id, mate] : [id];
      } else c.sel = [id];
      G.Audio.sfx('select');
      c.handKey = '';
      R.update(v, c);
    },

    selOk(v, c) {
      if (!c.sel.length) return false;
      const k = VB().kind(c.sel[0]);
      if (!VB().PLAYABLE.includes(k)) return false;
      if (k === 'pair' && c.sel.length !== 2) return false;
      return true;
    },

    playSel() {
      const v = G.Party.view, c = cur();
      if (!v || !c) return;
      if (!c.sel.length) { G.Audio.sfx('error'); UI.flash(G.T('Toca primero una carta de tu mano.')); return; }
      const V = VB(), k = V.kind(c.sel[0]);
      if (k === 'pair' && c.sel.length < 2) { G.Audio.sfx('error'); UI.flash(G.T('Una carta de Pokémon sola no hace nada: echa dos iguales.')); return; }
      if (V.TARGETED.includes(k)) { R.openTarget(c.sel.slice()); return; }
      R.send({ type: 'play', cards: c.sel.slice() });
    },

    /** ¿A quién? (Encanto o pareja). Toca un retrato. */
    openTarget(cards) {
      const v = G.Party.view, c = cur(), box = q('.vb-target');
      if (!v || !c || !box) return;
      const p = v.pub;
      const opts = v.seats.map((s, j) => j).filter(j => j !== v.you && p.alive[j] && p.counts[j] > 0);
      if (!opts.length) { G.Audio.sfx('error'); UI.flash(G.T('Ese jugador no tiene cartas.')); return; }
      c.target = cards;
      const k = VB().kind(cards[0]);
      box.innerHTML = `<div class="vb-ovbox"><h3>${esc(G.T(k === 'favor' ? '¿A quién le pides una carta?' : '¿A quién le robas una carta?'))}</h3>
        <div class="vb-cardrow">${cards.map(x => cardHTML(x)).join('')}</div>
        <div class="vb-tgs">${opts.map(j => `<button class="vb-tg" data-tg="${j}"><span class="vb-tgav"></span><b translate="no">${esc(seatName(v.seats[j]))}</b>
          <small>${esc(G.I18n.f('Le quedan {x} cartas de Voltorb', p.counts[j]))}</small></button>`).join('')}</div>
        <button class="btn ghost vb-btn" data-tx>${esc(G.T('Elegir otra carta'))}</button></div>`;
      box.querySelectorAll('[data-tg]').forEach(b => { const s = v.seats[+b.dataset.tg]; b.querySelector('.vb-tgav').appendChild(G.UI.spriteCanvas(s.dex, 96, 86, { scale: 3, hero: true, shiny: !!s.shiny })); });
      box.classList.remove('hidden');
      box.onclick = e => {
        if (e.target.closest('[data-tx]')) { R.closeTarget(); return; }
        const b = e.target.closest('[data-tg]');
        if (!b) return;
        const t = +b.dataset.tg, cs = c.target;
        R.closeTarget();
        R.send({ type: 'play', cards: cs, target: t });
      };
      G.Audio.sfx('select');
    },
    closeTarget() { const box = q('.vb-target'); if (box) { box.classList.add('hidden'); box.innerHTML = ''; } const c = cur(); if (c) c.target = null; },

    give(id) {
      const c = cur();
      if (c) c.favorPick = id;
      R.send({ type: 'give', card: id });
    },

    /** Cartas solapadas lo justo para que quepan; de cada una se ve la franja izquierda (--vis). */
    layoutHand() {
      const wrap = q('.vb-handwrap'), hand = wrap && wrap.querySelector('.vb-hand');
      if (!hand || !hand.children.length) return;
      const k = hand.children.length;
      const cw = hand.firstElementChild.offsetWidth || 64;
      const room = wrap.clientWidth - 12;
      const min = cw * 0.42;
      let step = k > 1 ? Math.min(cw + 6, (room - cw) / (k - 1)) : cw;
      const scroll = step < min;
      if (scroll) step = min;
      wrap.classList.toggle('scroll', scroll);
      hand.style.setProperty('--step', (step - cw).toFixed(1) + 'px');
      hand.style.setProperty('--vis', Math.max(20, Math.min(cw, step) - 2).toFixed(0) + 'px');
    },

    update(v, c) {
      curC = c;
      const root = body(), p = v.pub, V = VB(), n = v.seats.length;
      if (!root.querySelector('.vb-table')) return;
      const meS = v.seats[v.you], alive = p.alive[v.you];
      const auto = !!(meS.auto || meS.afk);
      const mine = R.mine(v);
      const key = v.round * 1e6 + p.moves;
      const fresh = key !== c.lastKey;
      if (fresh) {
        if (c.lastKey) R.events(v, c);
        c.lastKey = key;
      }
      R.notes(v, c);
      // ---- jugadores ----
      const acting = p.phase === 'favor' && p.favor ? p.favor.to : p.turn;
      root.querySelectorAll('.vb-table [data-seat]').forEach(el => {
        const j = +el.dataset.seat, s = v.seats[j], isMe = j === v.you, nC = p.counts[j], dead = !p.alive[j];
        el.querySelector('.b2-name').textContent = isMe ? s.name : seatName(s);
        const away = !s.cpu && (s.gone || s.afk || s.auto);
        const tag = el.querySelector('.b2-tag');
        tag.textContent = away ? G.T('Juega la CPU') : G.I18n.f('{x} pts de Voltorb', s.total);
        tag.classList.toggle('away', away);
        el.classList.toggle('on', acting === j && !v.res);
        el.classList.toggle('dead', dead);
        el.querySelector('.vb-dead').classList.toggle('hidden', !dead);
        const tb = el.querySelector('.vb-turns'), extra = p.turn === j && p.left > 1 && !v.res && !dead;
        tb.classList.toggle('hidden', !extra);
        if (extra) tb.textContent = G.I18n.f('Turnos de Voltorb: {x}', p.left);
        if (isMe) return;
        const fan = el.querySelector('.vb-fan'), show = Math.min(nC, 12);
        if (fan.childElementCount !== show) fan.innerHTML = fanHTML(show);
        el.querySelector('.vb-cnt').textContent = nC;
        el.querySelector('.vb-cnt').classList.toggle('hidden', dead);
      });
      root.querySelector('[data-vb="auto"]').classList.toggle('on', auto);
      const cover = root.querySelector('[data-vb="autooff"]');
      cover.classList.toggle('hidden', !auto || !!v.res || !alive);
      cover.textContent = G.T('La CPU juega por ti · toca para seguir tú');
      // ---- centro: mazo, descarte, Voltorbs ----
      const tbl = root.querySelector('.vb-table');
      root.querySelector('.vb-deckn').textContent = p.deck;
      const heat = p.deck ? Math.min(1, p.bombs / p.deck * 3) : 0;
      tbl.style.setProperty('--heat', heat.toFixed(2));
      const knowTop = v.priv.know && v.priv.know.length ? v.priv.know[0] : -1;
      tbl.classList.toggle('danger', knowTop >= 0 && V.isBomb(knowTop));
      root.querySelector('.vb-pile').classList.toggle('can', mine);
      root.querySelector('.vb-bombs span').textContent = G.I18n.f('Quedan {x} Voltorb en el mazo', p.bombs);
      const lf = root.querySelector('.vb-left');
      const showLeft = p.turn >= 0 && p.left > 1 && !v.res;
      lf.classList.toggle('hidden', !showLeft);
      if (showLeft) lf.textContent = G.I18n.f('{x}: le quedan {x} turnos', p.turn === v.you ? G.T('Tú (en Voltorb travieso)') : seatName(v.seats[p.turn]), p.left);
      // Lo que sabes de arriba del mazo (sólo tú).
      const kn = root.querySelector('.vb-know'), known = (v.priv.know || []).slice(0, 3);
      const anyK = known.some(x => x >= 0);
      kn.classList.toggle('hidden', !anyK || !alive || !!v.res);
      if (anyK) {
        const kk = known.join(',') + '|' + portraits.size;
        if (kn.dataset.k !== kk) {
          kn.dataset.k = kk;
          kn.innerHTML = `<em>${esc(G.T('Sabes que arriba hay:'))}</em>` + known.map((x, i) => x >= 0 ? `<span class="vb-kn${V.isBomb(x) ? ' bad' : ''}"><b>${i + 1}</b>${cardHTML(x, 'mini')}</span>` : `<span class="vb-kn"><b>${i + 1}</b><i class="vb-q">?</i></span>`).join('');
        }
      }
      const dKey = p.top + '/' + p.under.join(',') + '/' + portraits.size;
      if (dKey !== c.discKey) {
        const playEv = fresh && (p.ev || []).find(e => e.k === 'play' || e.k === 'defuse' || e.k === 'nope');
        const from = playEv ? posOf(v, playEv.seat) : '';
        c.discKey = dKey;
        const rot = [-12, 8, -4];
        root.querySelector('.vb-disc').innerHTML = p.top < 0 ? `<div class="vb-empty">${esc(G.T('Descarte de Voltorb'))}</div>` :
          p.under.map((id, i) => cardHTML(id, 'under" style="--r:' + rot[i % 3] + 'deg')).join('') + cardHTML(p.top, 'top' + (from ? ' in from-' + from : ''));
      }
      // ---- ventana de «看穿» ----
      R.nopeBar(v, c);
      // ---- texto ----
      const cap = root.querySelector('.vb-cap');
      let capT;
      if (v.res) capT = '';
      else if (!alive) capT = G.T('Has explotado: esta ronda miras cómo juegan los demás.');
      else if (p.pend) capT = p.pend.last !== v.you && v.priv.hand.some(id => V.kind(id) === 'nope') ? G.T('¿Lo anulas? Echa una Detección antes de que se acabe la barra.') : G.T('Esperando por si alguien lo anula…');
      else if ((p.phase === 'bomb' || p.phase === 'insert') && p.bomb) capT = p.bomb.seat === v.you ? G.T(p.phase === 'bomb' ? 'Has robado un Voltorb: usa la goma aislante.' : 'Elige dónde vuelves a meter el Voltorb.') : G.I18n.f('¡{x} ha robado un Voltorb!', seatName(v.seats[p.bomb.seat]));
      else if (p.phase === 'favor' && p.favor) capT = p.favor.to === v.you ? G.I18n.f('Elige qué carta le das a {x}', seatName(v.seats[p.favor.from])) : G.I18n.f('Esperando a que {x} dé una carta', seatName(v.seats[p.favor.to]));
      else if (mine) capT = p.left > 1 ? G.I18n.f('Te toca: echa cartas o roba (te quedan {x} turnos).', p.left) : G.T('Te toca: echa las cartas que quieras y acaba robando una.');
      else capT = G.I18n.f('Es el turno de {x} en Voltorb travieso', seatName(v.seats[p.turn]));
      const lastTxt = (p.log || []).length ? evText(v, p.log[p.log.length - 1]) : '';
      cap.innerHTML = `<b>${esc(capT)}</b>${lastTxt && lastTxt !== capT && !v.res ? `<span>${esc(lastTxt)}</span>` : ''}`;
      cap.classList.toggle('mine', mine);
      cap.classList.toggle('hidden', !!v.res);
      const logEl = root.querySelector('.vb-log'), lg = (p.log || []).slice(-4, -1).reverse();
      logEl.innerHTML = lg.map(e => `<div>${esc(evText(v, e))}</div>`).join('');
      logEl.classList.toggle('hidden', !!v.res);
      // ---- mano ----
      const hand = V.sortHand(v.priv.hand);
      c.sel = c.sel.filter(x => hand.includes(x));
      const favorMe = p.phase === 'favor' && p.favor && p.favor.to === v.you && !auto;
      const playable = id => V.PLAYABLE.includes(V.kind(id)) && (V.kind(id) !== 'pair' || V.pairOf(hand.filter(x => V.kind(x) === 'pair' && V.card(x).p === V.card(id).p)));
      const newest = c.newCard;
      const hKey = hand.join(',') + '|' + c.sel.join(',') + '|' + mine + '|' + favorMe + '|' + newest + '|' + portraits.size;
      if (hKey !== c.handKey) {
        c.handKey = hKey;
        root.querySelector('.vb-hand').innerHTML = hand.map(x => cardHTML(x, [
          favorMe ? 'give' : mine ? (playable(x) ? 'ok' : 'no') : '', c.sel.includes(x) ? 'sel' : '', x === newest ? 'new' : ''].join(' '))).join('');
        requestAnimationFrame(() => R.layoutHand());
      }
      const pill = root.querySelector('.vb-pill');
      const pk = c.sel.length ? V.kind(c.sel[0]) : '';
      pill.classList.toggle('hidden', !pk || favorMe);
      if (pk) pill.textContent = G.T(DESC[pk]);
      // ---- botones ----
      const pb = root.querySelector('[data-vb="play"]'), db = root.querySelector('[data-vb="drawbtn"]');
      pb.disabled = !mine || !R.selOk(v, c);
      db.disabled = !mine;
      tbl.classList.toggle('myturn', mine);
      root.querySelector('.vb-me').classList.toggle('dead', !alive);
      if (!mine && c.target) R.closeTarget();
      if (mine && c.turnWas !== v.you) G.Audio.sfx('shake');
      c.turnWas = p.turn;
      R.overlays(v, c);
      R.results(v, c);
      R.tick(v, c);
    },

    /** Barra de la ventana de «看穿»: qué se ha echado, cuánto queda y el botón si tienes Detección. */
    nopeBar(v, c) {
      const p = v.pub, box = q('.vb-nope');
      const pd = p.pend;
      box.classList.toggle('hidden', !pd || !!v.res);
      if (!pd) return;
      const nm = j => (j === v.you ? G.T('Tú (en Voltorb travieso)') : seatName(v.seats[j]));
      const what = label(pd.cards[0]) + (pd.cards.length > 1 ? ' ×2' : '');
      let t = pd.target >= 0 && pd.kind !== 'attack' ? G.I18n.f('{x} echa {x} contra {x}', nm(pd.seat), what, nm(pd.target)) : G.I18n.f('{x} echa la carta {x} en Voltorb', nm(pd.seat), what);
      if (pd.nopes) t += ' · ' + G.T(pd.nopes % 2 ? '¡ANULADA con Detección!' : '¡Vuelve a valer!');
      const pk = pd.seq + ':' + pd.nopes;
      if (box.dataset.k !== pk) {
        box.dataset.k = pk;
        box.querySelector('.vb-nopet').textContent = t;
        box.classList.toggle('noped', pd.nopes % 2 === 1);
        const bar = box.querySelector('.vb-bar i');
        bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
      }
      const canNope = !v.res && p.alive[v.you] && pd.last !== v.you && v.priv.hand.some(id => VB().kind(id) === 'nope');
      box.querySelector('.vb-nopeb').classList.toggle('hidden', !canNope);
    },

    /** Animaciones y sonidos de lo que acaba de pasar (clases CSS que se quitan solas). */
    events(v, c) {
      const p = v.pub;
      for (const e of p.ev || []) {
        if (e.k === 'play') { G.Audio.sfx(e.seat === v.you ? 'confirm' : 'click'); R.badge(v, e.seat, label(e.cards[0]), 'play'); }
        else if (e.k === 'nope') { G.Audio.sfx('break'); R.badge(v, e.seat, G.T('¡Detección en Voltorb!'), 'nope'); R.stamp(); }
        else if (e.k === 'cancel') R.badge(v, e.seat, G.T('¡Carta anulada!'), 'bad');
        else if (e.k === 'attack') { G.Audio.sfx('hurt'); R.badge(v, e.to, G.I18n.f('¡{x} turnos!', e.turns), 'bad'); }
        else if (e.k === 'skip') R.badge(v, e.seat, 'zz', 'skip');
        else if (e.k === 'shuffle') { G.Audio.sfx('surge'); R.kick('.vb-pile', 'shuf'); }
        else if (e.k === 'future') R.badge(v, e.seat, '◎', 'skip');
        else if (e.k === 'give' || e.k === 'steal') { R.fly(v, e.k === 'give' ? e.seat : e.to, e.k === 'give' ? e.to : e.seat); G.Audio.sfx('select'); }
        else if (e.k === 'draw') R.fly(v, 'pile', e.seat);
        else if (e.k === 'bomb') { G.Audio.sfx('boss'); if (e.seat !== v.you) R.alert(v, e); }
        else if (e.k === 'defuse') { G.Audio.sfx('heal'); if (e.seat !== v.you) R.alert(v, e); }
        else if (e.k === 'insert') { G.Audio.sfx('ball'); R.fly(v, e.seat, 'pile'); if (e.seat !== v.you) R.alert(v, e); }
        else if (e.k === 'boom') { G.Audio.sfx('bossDown'); R.blast(v, e.seat); }
      }
    },

    /** Cosas privadas (lo que has robado, lo que te han dado o quitado, Premonición). */
    notes(v, c) {
      const ns = v.priv.notes || [];
      const max = ns.reduce((m, x) => Math.max(m, x.seq), 0);
      if (c.noteSeq < 0) { c.noteSeq = max; return; }   // al entrar no se repite lo de antes
      for (const x of ns) {
        if (x.seq <= c.noteSeq) continue;
        if (x.k === 'drew') { c.newCard = x.card; c.handKey = ''; }
        else if (x.k === 'got') { c.newCard = x.card; c.handKey = ''; G.UI.toast(G.I18n.f(x.how === 'favor' ? '{x} te da: {x}' : 'Le quitas a {x}: {x}', seatName(v.seats[x.from]), label(x.card)), 2600); }
        else if (x.k === 'gave') G.UI.toast(G.I18n.f(x.how === 'favor' ? 'Le das a {x}: {x}' : '{x} te quita: {x}', seatName(v.seats[x.to]), label(x.card)), 2600);
        else if (x.k === 'peek') R.showPeek(v, c, x);
        else if (x.k === 'ins') G.UI.toast(G.I18n.f('Has metido el Voltorb en la posición {x} de {x}', x.pos + 1, x.len), 2600);
      }
      c.noteSeq = Math.max(c.noteSeq, max);
    },

    showPeek(v, c, x) {
      const box = q('.vb-peek');
      if (!box) return;
      box.innerHTML = `<div class="vb-ovbox"><h3>${esc(G.T('Las 3 cartas de arriba (sólo las ves tú)'))}</h3>
        <div class="vb-cardrow peek">${x.cards.map((id, i) => `<div class="vb-pk"><b>${esc(G.I18n.f('Carta {x} del mazo', i + 1))}</b>${cardHTML(id, VB().isBomb(id) ? 'bad' : '')}</div>`).join('') || esc(G.T('Descarte de Voltorb'))}</div>
        <button class="btn gold vb-btn" data-pk>${esc(G.T('Entendido'))}</button></div>`;
      box.classList.remove('hidden');
      G.Audio.sfx('reveal');
      clearTimeout(c.peekT);
      const close = () => { box.classList.add('hidden'); box.innerHTML = ''; };
      box.onclick = e => { if (e.target.closest('[data-pk]') || e.target === box) close(); };
      c.peekT = setTimeout(close, 8000);
    },

    /** Pantallas encima de la mesa: dar carta (Encanto), Voltorb robado, dónde meterlo. */
    overlays(v, c) {
      const p = v.pub, me = v.you, auto = !!(v.seats[me].auto || v.seats[me].afk);
      // Encanto: te toca dar una carta.
      const fbox = q('.vb-favor');
      const fv = p.phase === 'favor' && p.favor && p.favor.to === me && !v.res && !auto;
      if (fv) {
        const fk = p.favor.seq + ':' + v.priv.hand.join(',') + ':' + portraits.size;
        if (fbox.dataset.k !== fk) {
          fbox.dataset.k = fk;
          fbox.innerHTML = `<div class="vb-ovbox"><h3>${esc(G.I18n.f('{x} te ha echado Encanto: elige qué carta le das', seatName(v.seats[p.favor.from])))}</h3>
            <div class="vb-cardrow give">${VB().sortHand(v.priv.hand).map(id => cardHTML(id)).join('')}</div>
            <div class="vb-bar vb-fbar"><i></i></div><p class="vb-sub">${esc(G.T('Si no eliges a tiempo, se da una al azar.'))}</p></div>`;
          fbox.querySelector('.vb-cardrow').onclick = e => { const el = e.target.closest('.vbc'); if (el) R.give(+el.dataset.c); };
        }
        fbox.classList.remove('hidden');
      } else if (!fbox.classList.contains('hidden')) { fbox.classList.add('hidden'); fbox.innerHTML = ''; fbox.dataset.k = ''; }
      // Voltorb robado (tú).
      const bb = q('.vb-boom');
      const b = p.bomb, bombMe = b && b.seat === me && p.phase === 'bomb' && !v.res;
      if (bombMe) {
        const bk = b.seq + ':' + b.def + ':' + auto;
        if (bb.dataset.k !== bk) {
          bb.dataset.k = bk;
          const src = portrait(b.card === 0 ? 101 : 100);
          bb.innerHTML = `<div class="vb-flashbg"></div><div class="vb-ovbox boom">
            <div class="vb-bigv">${src ? `<img src="${src}" alt="" draggable="false">` : '<i class="vb-vico big"></i>'}</div>
            <h2>${esc(G.T(b.card === 0 ? '¡Has robado un Electrode!' : '¡Has robado un Voltorb!'))}</h2>
            <div class="vb-count" translate="no"></div>
            ${b.def ? `<button class="vb-defb" data-df ${auto ? 'disabled' : ''}>${esc(G.T('Usar la goma aislante'))}</button><p class="vb-sub">${esc(G.T('Si no la usas a tiempo, se usa sola.'))}</p>`
                    : `<p class="vb-sub big">${esc(G.T('No tienes goma aislante…'))}</p>`}</div>`;
          const df = bb.querySelector('[data-df]');
          if (df) df.onclick = () => R.send({ type: 'defuse' }, true);
          G.Audio.sfx('boss');
        }
        bb.classList.remove('hidden');
      } else if (!bb.classList.contains('hidden')) { bb.classList.add('hidden'); bb.innerHTML = ''; bb.dataset.k = ''; }
      // Dónde vuelve el Voltorb.
      const ib = q('.vb-insert');
      const insMe = b && b.seat === me && p.phase === 'insert' && !v.res;
      if (insMe) {
        const len = p.deck;
        if (c.insSeq !== b.seq) { c.insSeq = b.seq; c.insPos = 0; ib.dataset.k = ''; }
        const ik = b.seq + ':' + len + ':' + auto;
        if (ib.dataset.k !== ik) {
          ib.dataset.k = ik;
          const btn = (pos, t) => `<button class="vb-ib" data-ip="${pos}">${esc(t)}</button>`;
          ib.innerHTML = `<div class="vb-ovbox ins"><h3>${esc(G.T('Vuelve a meter el Voltorb en el mazo, a escondidas'))}</h3>
            <div class="vb-ibs">${btn(0, G.T('Meterlo arriba del todo'))}${len >= 1 ? btn(1, G.T('Meterlo de 2ª carta')) : ''}${len >= 2 ? btn(2, G.T('Meterlo de 3ª carta')) : ''}${btn(len, G.T('Meterlo abajo del todo'))}${btn(-1, G.T('Meterlo en un sitio al azar'))}</div>
            <div class="vb-slide"><input type="range" min="0" max="${len}" step="1" value="${Math.min(c.insPos, len)}" aria-label="${esc(G.T('Posición en el mazo'))}"><b class="vb-ipos"></b></div>
            <button class="btn gold vb-btn vb-okb" data-iok ${auto ? 'disabled' : ''}>${esc(G.T('Meterlo ahí'))}</button>
            <div class="vb-bar vb-ibar"><i></i></div><p class="vb-sub">${esc(G.T('Si no eliges a tiempo, va a un sitio al azar.'))}</p></div>`;
          const rng = ib.querySelector('input'), lab = ib.querySelector('.vb-ipos');
          const show = () => {
            c.insPos = +rng.value;
            lab.textContent = c.insPos === -1 ? G.T('Meterlo en un sitio al azar') : G.I18n.f('Carta {x} de {x} en el mazo', c.insPos + 1, len + 1);
            ib.querySelectorAll('[data-ip]').forEach(x => x.classList.toggle('on', +x.dataset.ip === c.insPos));
          };
          rng.oninput = show;
          ib.querySelectorAll('[data-ip]').forEach(x => x.onclick = () => {
            const ps = +x.dataset.ip;
            if (ps < 0) { c.insPos = -1; ib.querySelectorAll('[data-ip]').forEach(y => y.classList.toggle('on', y === x)); lab.textContent = G.T('Meterlo en un sitio al azar'); G.Audio.sfx('select'); return; }
            rng.value = ps; show(); G.Audio.sfx('select');
          });
          ib.querySelector('[data-iok]').onclick = () => R.send({ type: 'insert', pos: c.insPos == null ? 0 : c.insPos }, true);
          show();
        }
        ib.classList.remove('hidden');
      } else if (!ib.classList.contains('hidden')) { ib.classList.add('hidden'); ib.innerHTML = ''; ib.dataset.k = ''; }
      // Aviso de otro jugador: quitarlo cuando ya no toca.
      const al = q('.vb-alert');
      if (!al.classList.contains('hidden') && (!b || b.seat === me) && Date.now() - (c.alertAt || 0) > 2200) al.classList.add('hidden');
    },

    /** Cartel en el centro cuando otro roba un Voltorb (o lo desactiva / lo vuelve a meter). */
    alert(v, e) {
      const c = cur(), al = q('.vb-alert');
      if (!al || !c) return;
      const src = portrait(e.card === 0 ? 101 : 100);
      const big = e.k === 'bomb';
      al.className = 'vb-alert k-' + e.k;
      al.innerHTML = `${big || e.k === 'defuse' ? `<div class="vb-av2 ${big ? 'shake' : ''}">${src ? `<img src="${src}" alt="" draggable="false">` : '<i class="vb-vico big"></i>'}</div>` : ''}
        <b>${esc(evText(v, e))}</b>${big ? `<span>${esc(G.T(e.def ? '¿Tendrá goma aislante…?' : '¡No tiene goma aislante!'))}</span>` : ''}`;
      c.alertAt = Date.now();
      clearTimeout(c.alertT);
      c.alertT = setTimeout(() => { if (Date.now() - c.alertAt >= 2400) al.classList.add('hidden'); }, e.k === 'bomb' ? 3200 : 2500);
    },

    /** Explosión (sólo CSS): destello, onda y chispas sobre el que explota; la mesa tiembla. */
    blast(v, seat) {
      const c = cur(), bl = q('.vb-blast'), tbl = q('.vb-table');
      if (!bl || !tbl) return;
      const el = seat === v.you ? q('.vb-me .b2-who') : R.seatEl(v, seat);
      const o = tbl.getBoundingClientRect(), r = el ? el.getBoundingClientRect() : o;
      bl.style.setProperty('--bx', (r.left - o.left + r.width / 2) + 'px');
      bl.style.setProperty('--by', (r.top - o.top + r.height / 2) + 'px');
      let sp = '';
      for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + Math.random() * 0.3, d = 90 + Math.random() * 120; sp += `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d).toFixed(0)}px;--d:${(Math.random() * 0.12).toFixed(2)}s"></i>`; }
      bl.innerHTML = `<div class="vb-bflash"></div><div class="vb-ring"></div><div class="vb-ring r2"></div><div class="vb-sparks">${sp}</div>
        <b class="vb-btxt">${esc(seat === v.you ? G.T('¡Has explotado!') : G.T('¡Kaboom!'))}</b>`;
      bl.className = 'vb-blast';
      tbl.classList.remove('quake'); void tbl.offsetWidth; tbl.classList.add('quake');
      const al = q('.vb-alert'); if (al) al.classList.add('hidden');
      if (c) { clearTimeout(c.blastT); c.blastT = setTimeout(() => { bl.classList.add('hidden'); bl.innerHTML = ''; tbl.classList.remove('quake'); }, 1900); }
    },

    stamp() { const s = q('.vb-stamp'); if (!s) return; s.classList.remove('hidden', 'go'); void s.offsetWidth; s.classList.add('go'); setTimeout(() => s.classList.add('hidden'), 1100); },
    kick(sel, cls) { const el = q(sel); if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); },

    seatEl(v, j) { return j === v.you ? q('.vb-me .b2-who') : q(`.vb-table .vb-opp[data-seat="${j}"] .b2-who`); },

    badge(v, j, text, cls) {
      const el = R.seatEl(v, j);
      if (!el) return;
      const b = document.createElement('span');
      b.className = 'vb-pop ' + (cls || '');
      b.textContent = text;
      el.appendChild(b);
      setTimeout(() => b.remove(), 1400);
    },

    /** Carta boca abajo que vuela (del mazo a alguien, de uno a otro, de alguien al mazo). */
    fly(v, from, to) {
      const tbl = q('.vb-table'), pile = q('.vb-pile');
      const at = x => (x === 'pile' ? pile : R.seatEl(v, x));
      const a = at(from), b = at(to);
      if (!tbl || !a || !b) return;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), o = tbl.getBoundingClientRect();
      const f = document.createElement('i');
      f.className = 'b2-back vb-fly';
      f.style.left = (ra.left - o.left + ra.width / 2) + 'px';
      f.style.top = (ra.top - o.top + ra.height / 2) + 'px';
      f.style.setProperty('--dx', (rb.left + rb.width / 2 - ra.left - ra.width / 2) + 'px');
      f.style.setProperty('--dy', (rb.top + rb.height / 2 - ra.top - ra.height / 2) + 'px');
      tbl.appendChild(f);
      setTimeout(() => f.remove(), 700);
    },

    /** Aros de tiempo, barras que se encogen y cuentas atrás (cada 200 ms; nada por fotograma). */
    tick(v, c) {
      const root = body(), p = v.pub;
      if (!root.querySelector('.vb-table')) return;
      const el = Date.now() - v.at;
      const acting = p.phase === 'favor' && p.favor ? p.favor.to : p.turn;
      let left = Math.max(0, v.left - el), total = v.turnMs;
      if (p.phase === 'favor' && p.favor) { left = Math.max(0, p.favor.left - el); total = p.favor.total; }
      const frac = total ? left / total : 0;
      root.querySelectorAll('.vb-table [data-seat]').forEach(e => {
        const j = +e.dataset.seat, av = e.querySelector('.b2-av'), sec = e.querySelector('.b2-sec');
        const on = acting === j && left > 0 && !v.res && !p.pend && p.phase !== 'bomb' && p.phase !== 'insert';
        av.classList.toggle('timed', on);
        sec.classList.toggle('hidden', !on);
        if (on) { av.style.setProperty('--p', frac.toFixed(3)); av.classList.toggle('urgent', left < 8000); sec.textContent = Math.ceil(left / 1000); }
      });
      const setBar = (sel, l, t) => { const b = root.querySelector(sel); if (b) b.style.transform = `scaleX(${Math.max(0, Math.min(1, l / t)).toFixed(3)})`; };
      if (p.pend) setBar('.vb-nope .vb-bar i', p.pend.left - el, p.pend.win);
      if (p.favor) setBar('.vb-fbar i', p.favor.left - el, p.favor.total);
      const b = p.bomb;
      if (b && p.phase === 'bomb') {
        const cnt = root.querySelector('.vb-count');
        if (cnt) { const ms = b.def ? b.left - el : b.boom - el; cnt.textContent = Math.max(0, Math.ceil(ms / 1000)); }
      }
      if (b && p.phase === 'insert') setBar('.vb-ibar i', b.ileft - el, VB().INSERT_MS);
    },

    // ---------------- fin de ronda ----------------
    results(v, c) {
      const box = q('.vb-res');
      if (!box) return;
      if (!v.res) { box.classList.add('hidden'); box.innerHTML = ''; c.resKey = ''; clearInterval(c.countT); return; }
      const key = v.sid + ':' + v.round + ':' + (G.Party.isHost ? 1 : 0);
      if (key === c.resKey) return;
      c.resKey = key;
      R.closeTarget();
      ['.vb-favor', '.vb-boom', '.vb-insert', '.vb-peek', '.vb-alert'].forEach(s => { const e = q(s); if (e) { e.classList.add('hidden'); e.innerHTML = ''; e.dataset.k = ''; } });
      const won = v.pub.winner === v.you;
      const mine = v.res.find(r => r.seat === v.you) || { place: 1, pts: 0 };
      const target = mine.pts;
      // Al final de la explosión, no encima.
      const delay = c.blastT ? 900 : 0;
      setTimeout(() => {
        if (c.resKey !== key) return;
        G.Audio.sfx(won ? 'levelup' : 'gameover');
        const Rn = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
        let balls = '', confetti = '', stars = '';
        if (won) {
          for (let i = 0; i < 24; i++) { const a = Math.random() * 6.283, d = 38 + Math.random() * 30; balls += `<i class="${i % 3 ? 'b2-coin' : 'b2-ball'}" style="--x:${(Math.cos(a) * d).toFixed(1)}vw;--y:${(Math.sin(a) * d * 0.7).toFixed(1)}vh;--d:${Rn(0, 0.9)}s"></i>`; }
          const COL = ['#ffd23f', '#ff5a4e', '#4a88ff', '#5fcb6a', '#ff9ed8', '#ffffff'];
          for (let i = 0; i < 36; i++) confetti += `<i class="b2-conf" style="left:${Rn(0, 100)}%;--c:${COL[i % COL.length]};--d:${Rn(0, 1.6)}s;--t:${Rn(2.2, 3.6)}s;--s:${Rn(-1, 1)}"></i>`;
        }
        for (let i = 0; i < 8; i++) stars += `<i class="b2-star" style="left:${Rn(-8, 108)}%;top:${Rn(-10, 100)}%;--d:${Rn(0, 1.4)}s"></i>`;
        const cards = v.res.slice().sort((a, b) => a.place - b.place).map(r => {
          const s = v.seats[r.seat];
          return `<div class="b2-pc p${r.place}${r.seat === v.you ? ' me' : ''}${r.alive ? '' : ' boom'}" data-ps="${r.seat}" style="--i:${r.place}">
            ${r.place === 1 ? '<i class="b2-crown"></i>' : ''}<span class="b2-medal">${r.place}</span><div class="b2-pav"></div>
            <b class="b2-pn" translate="no">${esc(r.seat === v.you ? s.name : seatName(s))}</b>
            <div class="b2-pr"><span>${esc(G.T('Al final de la ronda'))}</span><b class="${r.alive ? 'good' : 'bad'}">${esc(G.T(r.alive ? 'Sigue en pie en Voltorb' : '¡Fuera por explosión!'))}</b></div>
            <div class="b2-pr"><span>${esc(G.T('Esta ronda'))}</span><b class="${r.pts ? 'good' : ''}">${r.pts ? '+' + r.pts : '0'}</b></div>
            <div class="b2-pr"><span>${esc(G.T('Puntos acumulados de Voltorb'))}</span><b>${s.total}</b></div>
          </div>`;
        }).join('');
        const host = G.Party.isHost;
        box.innerHTML = `<div class="b2-rays ${won ? 'win' : 'lose'}"></div><div class="b2-confw">${confetti}</div><div class="b2-fx">${balls}</div>
          <div class="b2-banner ${won ? 'win' : 'lose'}">${stars}
            <div class="b2-btw"><div class="b2-bt">${esc(won ? G.T('¡Victoria!') : G.I18n.f('Puesto {x}', String(mine.place)))}</div></div>
            <div class="b2-rib"><div class="b2-ribbon"><span class="b2-num" translate="no">0</span></div></div>
            <div class="b2-bsub">${esc(won ? G.T('¡Eres el último en pie!') : G.I18n.f('¡{x} es el último en pie y gana!', seatName(v.seats[v.pub.winner])))}</div>
          </div>
          <div class="b2-podium">${cards}</div>
          <div class="b2-rbtns">
            ${host ? `<button class="btn gold" data-r="again">${esc(G.T('Otra ronda'))}</button>` : `<span class="sub" style="margin:0">${esc(G.T('Esperando al anfitrión…'))}</span>`}
            <button class="btn ghost" data-r="room">${esc(G.T('Volver a la sala'))}</button>
          </div>
          <div class="b2-skip">${esc(G.T('Toca para saltar'))}</div>`;
        box.querySelectorAll('.b2-pc').forEach(el => {
          const s = v.seats[+el.dataset.ps];
          el.querySelector('.b2-pav').appendChild(G.UI.spriteCanvas(s.dex, 144, 128, { scale: 4, hero: true, shiny: !!s.shiny }));
        });
        box.className = 'b2-res vb-res';
        const num = box.querySelector('.b2-num');
        const t0 = Date.now(), DUR = 1100;
        const done = () => { clearInterval(c.countT); num.textContent = '+' + target; box.classList.add('done'); };
        clearInterval(c.countT);
        c.countT = setInterval(() => {
          const k = Math.min(1, (Date.now() - t0) / DUR);
          num.textContent = '+' + Math.round(target * (1 - Math.pow(1 - k, 3)));
          if (k >= 1) done();
        }, 60);
        setTimeout(() => { if (c.resKey === key) done(); }, 2200);
        box.onclick = e => {
          const b = e.target.closest('[data-r]');
          if (b && box.classList.contains('done')) { if (b.dataset.r === 'again') G.Party.again(); else G.Party.leave(); return; }
          done();
        };
      }, delay);
    }
  };

  UI.RENDER.voltorb = R;
})();
