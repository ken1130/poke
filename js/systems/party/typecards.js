/* ============ typecards.js — "Cartas de tipos" (小精靈屬性牌) para el modo fiesta ============
 * Juego de descartes por tipos/números. Sólo reglas y lógica (sin DOM): la usan el anfitrión
 * (que manda), cada jugador (para validar antes de enviar y para la "Pista") y la prueba de
 * Node (tools/test/typecards_rules.js).
 *
 * Baraja (108 cartas), un número 0..107 = índice en CARDS:
 *   4 tipos (= colores): 0 Fuego (rojo, Charmander), 1 Agua (azul, Squirtle),
 *                        2 Planta (verde, Bulbasaur), 3 Eléctrico (amarillo, Pikachu).
 *   Por tipo: un 0, dos de cada 1..9 y dos de cada carta de efecto:
 *     v=10 Somnífero  (salta al siguiente)
 *     v=11 Ida y vuelta (cambia el sentido; con 2 jugadores, salta como Somnífero)
 *     v=12 Doble golpe (el siguiente roba 2 y pierde el turno)
 *   Comodines (c=4): 4 × v=13 Ditto (eliges el tipo) y 4 × v=14 Poder de Mewtwo
 *     (eliges el tipo; el siguiente roba 4 y pierde el turno).
 *
 * Reglas:
 *   - 7 cartas por jugador (2-4 jugadores). Se da la vuelta a la primera del mazo:
 *     Poder de Mewtwo -> vuelve al mazo y se saca otra; Ditto -> el primero elige el tipo;
 *     Somnífero / Doble golpe / Ida y vuelta se aplican al primer jugador (ver newRound).
 *   - En tu turno echas una carta del tipo actual, o con el mismo número/símbolo, o un
 *     comodín. Si no, robas 1; si la que robas vale, puedes echarla ya (o quedártela).
 *   - No se acumulan los +2/+4 (reglas oficiales): quien los recibe roba y pierde el turno.
 *   - El Poder de Mewtwo se puede echar siempre (sin la regla del "desafío").
 *   - "¡Última carta!": al quedarte con 1 carta tienes que avisar (también antes, en tu turno
 *     con 2 cartas). En cuanto te quedas con 1 sin avisar (st.vuln), cualquier otro puede pulsar
 *     "¡Te pillé!" hasta que el siguiente juegue o robe; vale lo primero que llegue al anfitrión
 *     (avisar o pillar). Si te pillan, o el siguiente hace su jugada sin que hayas avisado,
 *     robas 2. Cada aviso deja st.lastCall = { seat, seq } (la voz suena una vez en cada pantalla).
 *     Las CPU avisan/pillan con retraso desde el registro (party.js, react).
 *   - Gana la ronda quien se queda sin cartas. Puntos para el ganador = las cartas de los
 *     demás (número = su valor, efecto = 20, comodín = 50). Se suman ronda tras ronda.
 *   - 2 contra 2 (opts.teams = [0,1,0,1], compañeros enfrente; 2026-10-17): en cuanto alguien se
 *     queda sin cartas gana su EQUIPO; los dos se llevan los mismos puntos = lo que suman las manos
 *     de los dos rivales (la mano del compañero no cuenta). No se puede pillar al compañero.
 *
 * Estado (sólo lo tiene el anfitrión): { n, hands, deck, discard, color, dir, turn, phase,
 *   drawn, called[], vuln, over, winner, moves, tseq, ev[], start }.
 *   phase: 'play' (normal) | 'drawn' (has robado una que vale: echarla o quedártela) |
 *          'pick' (la primera carta era Ditto: el primero elige el tipo).
 *   moves: sube con cada acción; tseq: sube sólo cuando cambia el turno (para el reloj).
 */
(function (root) {
  const TYPES = ['fire', 'water', 'grass', 'electric'];
  const SKIP = 10, REV = 11, DRAW2 = 12, WILD = 13, WILD4 = 14;
  const CARDS = [];
  for (let c = 0; c < 4; c++) {
    CARDS.push({ c, v: 0 });
    for (let v = 1; v <= 12; v++) { CARDS.push({ c, v }); CARDS.push({ c, v }); }
  }
  for (let i = 0; i < 4; i++) CARDS.push({ c: 4, v: WILD });
  for (let i = 0; i < 4; i++) CARDS.push({ c: 4, v: WILD4 });
  const N = CARDS.length;   // 108

  const card = id => CARDS[id];
  const isWild = id => CARDS[id].v >= WILD;
  const isAction = id => CARDS[id].v >= SKIP && CARDS[id].v <= DRAW2;
  const points = id => { const v = CARDS[id].v; return v >= WILD ? 50 : v >= SKIP ? 20 : v; };
  /** Símbolo de la esquina: número, ⊘ salto, ⇄ sentido, +2, ★ Ditto, +4. */
  const SYM = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '⊘', '⇄', '+2', '★', '+4'];
  const sym = id => SYM[CARDS[id].v];
  const valid = id => Number.isInteger(id) && id >= 0 && id < N;

  /** ¿Se puede echar `id` sobre `top` con el tipo actual `color`? */
  function playable(id, top, color) {
    const a = CARDS[id];
    if (a.v >= WILD) return true;
    if (color >= 0 && a.c === color) return true;
    const t = top >= 0 ? CARDS[top] : null;
    return !!t && t.v < WILD && t.v === a.v;
  }

  // ---------------- baraja ----------------
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  /** Orden para enseñar la mano: por tipo (fuego, agua, planta, eléctrico, comodines) y número. */
  function sortHand(h) { return h.slice().sort((a, b) => (CARDS[a].c - CARDS[b].c) || (CARDS[a].v - CARDS[b].v) || (a - b)); }

  const nextSeat = (st, from, k = 1) => (((from + st.dir * k) % st.n) + st.n) % st.n;

  /** Roba k cartas del mazo (si se acaba, se baraja el descarte menos la de arriba). Devuelve cuántas. */
  function drawTo(st, seat, k, rng) {
    let got = 0;
    for (let i = 0; i < k; i++) {
      if (!st.deck.length) {
        if (st.discard.length <= 1) break;
        const top = st.discard.pop();
        st.deck = shuffle(st.discard, rng || st.rng || Math.random);
        st.discard = [top];
      }
      st.hands[seat].push(st.deck.pop());
      got++;
    }
    if (got) st.called[seat] = false;
    return got;
  }

  /**
   * Nueva ronda para n jugadores. rng: función 0..1 (Math.random por defecto).
   * opts.start: quién empieza (si no, al azar). opts.first: carta que sale primero (pruebas).
   */
  function newRound(n, rng = Math.random, opts = {}) {
    const deck = shuffle([...Array(N).keys()], rng);
    if (opts.first != null) { deck.splice(deck.indexOf(opts.first), 1); }
    const hands = Array.from({ length: n }, () => deck.splice(deck.length - 7, 7));
    const st = { n, hands, deck, discard: [], color: -1, dir: 1, turn: 0, phase: 'play', drawn: -1,
                 called: Array(n).fill(false), vuln: -1, vulnSeq: 0, lastCall: null, callSeq: 0, over: false, winner: -1, moves: 0, tseq: 0, ev: [], start: 0,
                 teams: Array.isArray(opts.teams) && opts.teams.length === n ? opts.teams.slice() : null, lastCol: Array(n).fill(-1) };
    Object.defineProperty(st, 'rng', { value: rng, enumerable: false, writable: true });
    const start = opts.start != null ? opts.start : Math.floor(rng() * n);
    st.start = start;
    // Primera carta: el Poder de Mewtwo vuelve al mazo (en un sitio al azar) y se saca otra.
    let top;
    if (opts.first != null) top = opts.first;
    else {
      for (;;) {
        top = deck.pop();
        if (CARDS[top].v !== WILD4) break;
        deck.splice(Math.floor(rng() * (deck.length + 1)), 0, top);
      }
    }
    st.discard.push(top);
    const t = CARDS[top];
    st.turn = start;
    st.ev = [{ k: 'flip', card: top }];
    if (t.v === WILD) { st.phase = 'pick'; st.color = -1; }
    else {
      st.color = t.c;
      if (t.v === SKIP) { st.ev.push({ k: 'skip', seat: start }); st.turn = nextSeat(st, start); }
      else if (t.v === REV) {
        st.dir = -1;
        // Con 2 jugadores es un salto; con más, el sentido cambia y empieza el de antes.
        st.ev.push({ k: 'rev', dir: -1 });
        st.turn = n === 2 ? nextSeat(st, start) : nextSeat(st, start);
      } else if (t.v === DRAW2) {
        const got = drawTo(st, start, 2, rng);
        st.ev.push({ k: 'draw', seat: start, n: got, why: 'd2' });
        st.turn = nextSeat(st, start);
      }
    }
    return st;
  }

  /** Lo que se puede echar ahora (ids de la mano). */
  function legal(st, seat) {
    if (st.over || seat !== st.turn || st.phase === 'pick') return [];
    const top = st.discard[st.discard.length - 1];
    if (st.phase === 'drawn') return playable(st.drawn, top, st.color) ? [st.drawn] : [];
    return st.hands[seat].filter(id => playable(id, top, st.color));
  }
  /** Lo mismo desde la vista de un jugador (su mano + lo público). */
  function legalView(hand, pub, drawn) {
    if (pub.over || pub.phase === 'pick') return [];
    if (pub.phase === 'drawn') return drawn >= 0 && playable(drawn, pub.top, pub.color) ? [drawn] : [];
    return hand.filter(id => playable(id, pub.top, pub.color));
  }

  /** Castigo por no avisar de la última carta (si está pendiente). */
  function penalize(st, by) {
    const v = st.vuln;
    if (v < 0) return false;
    st.vuln = -1;
    if (st.hands[v].length !== 1 || st.called[v]) return false;
    const got = drawTo(st, v, 2);
    st.ev.push({ k: 'pen', seat: v, n: got, by: by == null ? -1 : by });
    return true;
  }

  /**
   * Jugada de un asiento. Devuelve { ok, err?, x? } (textos en español).
   * a = { type:'play', card, color?, call? } | { type:'draw', pass? } | { type:'keep' }
   *   | { type:'color', color } | { type:'call' } | { type:'catch' }
   */
  function act(st, seat, a) {
    if (st.over) return { ok: false, err: 'La ronda ya ha terminado.' };
    if (!a || typeof a.type !== 'string') return { ok: false, err: 'Jugada desconocida.' };
    if (!(seat >= 0 && seat < st.n)) return { ok: false, err: 'Jugada desconocida.' };
    const t = a.type;
    // --- fuera de turno: avisar y pillar ---
    if (t === 'call') {
      const h = st.hands[seat].length;
      const pre = seat === st.turn && h === 2 && st.phase !== 'pick';
      if (h !== 1 && !pre) return { ok: false, err: 'Sólo puedes avisar con una carta (o con dos, en tu turno).' };
      if (st.called[seat]) return { ok: false, err: 'Ya has avisado de tu última carta.' };
      st.called[seat] = true;
      if (st.vuln === seat) st.vuln = -1;
      st.lastCall = { seat, seq: (st.callSeq = (st.callSeq || 0) + 1) };
      st.ev = [{ k: 'call', seat }];
      st.moves++;
      return { ok: true };
    }
    if (t === 'catch') {
      const v = st.vuln;
      if (v < 0 || v === seat || st.hands[v].length !== 1 || st.called[v]) return { ok: false, err: 'No hay nadie a quien pillar ahora.' };
      if (mates(st, v, seat)) return { ok: false, err: 'No puedes pillar a tu compañero de equipo.' };
      st.ev = [];
      penalize(st, seat);
      st.moves++;
      return { ok: true };
    }
    // --- en tu turno ---
    if (seat !== st.turn) return { ok: false, err: 'No es tu turno.' };
    const hand = st.hands[seat];
    const top = st.discard[st.discard.length - 1];
    if (t === 'color') {
      if (st.phase !== 'pick') return { ok: false, err: 'Ahora no hay que elegir tipo.' };
      const c = a.color | 0;
      if (!(c >= 0 && c < 4) || a.color !== c) return { ok: false, err: 'Elige un tipo de los cuatro.' };
      st.ev = [];
      penalize(st, -1);
      st.color = c; st.phase = 'play';
      st.ev.push({ k: 'pick', seat, color: c });
      st.moves++;
      return { ok: true };
    }
    if (t === 'draw') {
      if (st.phase === 'drawn') return { ok: false, err: 'Ya has robado: echa esa carta o quédatela.' };
      st.ev = [];
      penalize(st, -1);
      if (st.phase === 'pick') { st.color = mostColor(hand); st.phase = 'play'; st.ev.push({ k: 'pick', seat, color: st.color }); }
      const got = drawTo(st, seat, 1);
      st.ev.push({ k: 'draw', seat, n: got });
      st.moves++;
      const id = got ? hand[hand.length - 1] : -1;
      if (got && !a.pass && playable(id, top, st.color)) { st.phase = 'drawn'; st.drawn = id; return { ok: true, drawn: id }; }
      st.ev.push({ k: 'pass', seat });
      endTurn(st, nextSeat(st, seat));
      return { ok: true };
    }
    if (t === 'keep') {
      if (st.phase !== 'drawn') return { ok: false, err: 'Primero roba una carta.' };
      st.ev = [];
      penalize(st, -1);
      st.ev.push({ k: 'pass', seat });
      st.moves++;
      endTurn(st, nextSeat(st, seat));
      return { ok: true };
    }
    if (t !== 'play') return { ok: false, err: 'Jugada desconocida.' };
    if (st.phase === 'pick') return { ok: false, err: 'Primero elige el tipo de la mesa.' };
    const id = Number(a.card);
    if (!valid(id) || !hand.includes(id)) return { ok: false, err: 'Esa carta no es tuya.' };
    if (st.phase === 'drawn' && id !== st.drawn) return { ok: false, err: 'Sólo puedes echar la carta que acabas de robar.' };
    if (!playable(id, top, st.color)) return { ok: false, err: 'Esa carta no vale: tiene que ser del mismo tipo o número.' };
    const cd = CARDS[id];
    let color = cd.c;
    if (cd.v >= WILD) {
      color = a.color;
      if (!(Number.isInteger(color) && color >= 0 && color < 4)) return { ok: false, err: 'Elige un tipo de los cuatro.' };
    }
    st.ev = [];
    penalize(st, -1);
    hand.splice(hand.indexOf(id), 1);
    st.discard.push(id);
    st.color = color;
    st.phase = 'play'; st.drawn = -1;
    st.moves++;
    st.ev.push({ k: 'play', seat, card: id, color });
    if (st.lastCol) st.lastCol[seat] = color;
    if (a.call && hand.length === 1 && !st.called[seat]) { st.called[seat] = true; st.lastCall = { seat, seq: (st.callSeq = (st.callSeq || 0) + 1) }; }
    if (hand.length !== 1) st.called[seat] = false;
    if (hand.length === 1 && !st.called[seat]) { st.vuln = seat; st.vulnSeq++; }
    // Efectos
    let to = nextSeat(st, seat);
    if (cd.v === SKIP) { st.ev.push({ k: 'skip', seat: to }); to = nextSeat(st, to); }
    else if (cd.v === REV) {
      st.dir = -st.dir;
      st.ev.push({ k: 'rev', dir: st.dir });
      if (st.n === 2) { st.ev.push({ k: 'skip', seat: nextSeat(st, seat) }); to = seat; }
      else to = nextSeat(st, seat);
    } else if (cd.v === DRAW2 || cd.v === WILD4) {
      const got = drawTo(st, to, cd.v === DRAW2 ? 2 : 4);
      st.ev.push({ k: 'draw', seat: to, n: got, why: cd.v === DRAW2 ? 'd2' : 'd4' });
      st.ev.push({ k: 'skip', seat: to });
      to = nextSeat(st, to);
    }
    if (!hand.length) {
      st.over = true; st.winner = seat; st.turn = -1; st.vuln = -1; st.tseq++;
      if (st.teams) st.winTeam = st.teams[seat];
      st.ev.push({ k: 'win', seat });
      return { ok: true, win: true };
    }
    endTurn(st, to);
    return { ok: true };
  }

  function endTurn(st, to) { st.turn = to; st.phase = 'play'; st.drawn = -1; st.tseq++; }

  /** El tipo del que más cartas tienes (sin contar comodines); si no tienes ninguno, al azar.
   *  lean: tipo que se prefiere un poco si va casi empatado (2 contra 2: el último que echó tu compañero). */
  function mostColor(hand, rng = Math.random, lean = -1) {
    const cnt = [0, 0, 0, 0];
    for (const id of hand) if (CARDS[id].c < 4) cnt[CARDS[id].c] += 1 + points(id) / 100;
    if (lean >= 0 && lean < 4 && cnt[lean] > 0) cnt[lean] += 0.6;
    const best = Math.max(...cnt);
    if (best <= 0) return Math.floor(rng() * 4);
    return cnt.indexOf(best);
  }

  /** ¿Son del mismo equipo (2 contra 2)? */
  const mates = (st, a, b) => !!(st.teams && a !== b && st.teams[a] === st.teams[b]);

  /** Resultado: puesto, cartas que quedan, puntos (sólo el ganador: lo que suman las cartas de los demás).
   *  2 contra 2: los dos del equipo ganador, puesto 1 y los mismos puntos (las manos de los rivales); los otros, puesto 2. */
  function results(st) {
    const rows = st.hands.map((h, seat) => ({ seat, left: h.length, val: h.reduce((s, id) => s + points(id), 0), pts: 0 }));
    if (st.teams) {
      const wt = st.winner >= 0 ? st.teams[st.winner] : -1;
      const sum = rows.reduce((s, r) => s + (st.teams[r.seat] === wt ? 0 : r.val), 0);
      rows.forEach(r => { r.team = st.teams[r.seat]; r.win = r.team === wt; r.pts = r.win ? sum : 0; r.place = r.win ? 1 : 2; });
      rows.sort((a, b) => (a.place - b.place) || (b.seat === st.winner) - (a.seat === st.winner) || (a.val - b.val) || (a.seat - b.seat));
      return rows;
    }
    const sum = rows.reduce((s, r) => s + (r.seat === st.winner ? 0 : r.val), 0);
    rows.forEach(r => { if (r.seat === st.winner) r.pts = sum; });
    rows.sort((a, b) => (b.pts - a.pts) || (a.val - b.val) || (a.left - b.left));
    let place = 0, prev = null;
    rows.forEach((r, i) => { const k = r.pts + ':' + r.val; if (k !== prev) { place = i + 1; prev = k; } r.place = place; });
    return rows;
  }

  // ---------------- CPU ----------------

  /**
   * La CPU elige (sólo ve su mano y lo público).
   * ctx: { top, color, phase, drawn, nextCount (cartas del siguiente), prevCount, n, minOpp }
   *   2 contra 2 (teamCtx): duo, mateCount (cartas del compañero), mateColor (el último tipo que echó).
   *   Con los compañeros enfrente, el siguiente y el anterior siempre son rivales.
   */
  function cpuMove(hand, ctx) {
    const lean = ctx.duo ? ctx.mateColor : -1;
    if (ctx.phase === 'pick') return { type: 'color', color: mostColor(hand, Math.random, lean) };
    const ok = ctx.phase === 'drawn'
      ? (playable(ctx.drawn, ctx.top, ctx.color) ? [ctx.drawn] : [])
      : hand.filter(id => playable(id, ctx.top, ctx.color));
    if (!ok.length) return ctx.phase === 'drawn' ? { type: 'keep' } : { type: 'draw' };
    const rest = id => hand.filter(x => x !== id);
    const call = hand.length === 2;
    // 2 contra 2: más agresivo con el rival que va justo después (un rival con 3 ya es peligro).
    const danger = (ctx.nextCount || 7) <= (ctx.duo ? 3 : 2);
    const mateNear = ctx.duo && ctx.mateCount > 0 && ctx.mateCount <= 2;
    const score = id => {
      const c = CARDS[id];
      let s = points(id);                                   // soltar lo que más vale
      if (c.c < 4) s += 6 * hand.filter(x => CARDS[x].c === c.c).length;   // seguir con el tipo que más tengo
      if (c.v === WILD) s -= 80;                             // los comodines, para luego
      if (c.v === WILD4) s -= 100;
      if (danger) {
        if (c.v === DRAW2) s += 120;
        if (c.v === WILD4) s += 210;
        if (c.v === SKIP) s += 90;
        if (c.v === REV) s += ctx.n === 2 ? 90 : ((ctx.prevCount || 7) > (ctx.nextCount || 7) ? 70 : 0);
      } else if (c.v >= SKIP && c.v <= DRAW2 && hand.length > 3) s -= 4;   // efectos guardados un poco si no corre prisa
      if (mateNear && c.v === SKIP) s += 60;                  // saltar al rival: le toca antes a mi compañero, que casi gana
      if (mateNear && c.v === DRAW2) s += 40;
      if (hand.length <= 2 && c.v < WILD) s += 15;          // casi gano: lo que no sea comodín primero
      return s;
    };
    const best = ok.slice().sort((a, b) => score(b) - score(a))[0];
    const out = { type: 'play', card: best };
    if (CARDS[best].v >= WILD) out.color = mostColor(rest(best), Math.random, lean);
    if (call) out.call = true;
    return out;
  }

  /** Lo que la CPU (o la pista) sabe de su equipo: { duo, mateCount, mateColor } (vacío si es todos contra todos).
   *  st puede ser el estado o la vista ({ teams, counts, lastCol? }). */
  function teamCtx(st, seat) {
    const t = st.teams;
    if (!t) return {};
    const m = t.findIndex((x, i) => i !== seat && x === t[seat]);
    if (m < 0) return {};
    const cnt = st.hands ? st.hands[m].length : (st.counts || [])[m];
    return { duo: true, mateCount: cnt, mateColor: st.lastCol ? st.lastCol[m] : -1 };
  }

  /** Se acabó el tiempo: con la carta robada, quedársela; si no, robar 1 y pasar. */
  function timeoutMove(phase) { return phase === 'drawn' ? { type: 'keep' } : { type: 'draw', pass: true }; }

  const TC = { TYPES, CARDS, N, SKIP, REV, DRAW2, WILD, WILD4, SYM, card, isWild, isAction, points, sym, playable, sortHand,
               newRound, act, legal, legalView, results, cpuMove, timeoutMove, mostColor, nextSeat, teamCtx, mates };
  if (typeof module !== 'undefined' && module.exports) module.exports = TC;
  if (root && root.G) root.G.TypeCards = TC;
})(typeof window !== 'undefined' ? window : globalThis);
