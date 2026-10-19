/* ============ bigtwo.js — Big Two (大老二, reglas de Taiwán) para el modo fiesta ============
 * Sólo reglas y lógica (sin DOM): la usan el anfitrión (que manda), cada jugador (para
 * validar antes de enviar y para el botón "Pista") y la prueba de Node
 * (tools/test/bigtwo_rules.js).
 *
 * Cartas: un número 0..51 = rango * 4 + palo.
 *   rango 0..12 = 3 4 5 6 7 8 9 10 J Q K A 2   (el 2 es la más alta)
 *   palo  0..3  = ♣ ♦ ♥ ♠                      (picas la más alta)
 *   Así, comparar dos cartas sueltas es comparar sus números.
 *
 * Jugadas (2026-10-19, reglas del dueño): suelta, pareja y de 5 cartas: escalera, full, póker
 *   (鐵支, 4 iguales + 1) y escalera de color (同花順). NO valen el trío ni el color (同花).
 *   Escaleras: rangos seguidos dentro de 3..A (3-4-5-6-7 ... 10-J-Q-K-A) y además dos
 *   especiales con el 2: A-2-3-4-5 (la más baja) y 2-3-4-5-6 (la segunda más baja).
 *   No valen J-Q-K-A-2, Q-K-A-2-3 ni K-A-2-3-4 (el 2 no puede ir en medio).
 *   Entre escaleras: la de orden más alto gana; si empatan, el palo de la carta de arriba
 *   (en A-2-3-4-5 la de arriba es el 5; en 2-3-4-5-6, el 6).
 *   Full: el rango del trío. Póker: el rango de las cuatro.
 *   Cada jugada sólo gana a otra DEL MISMO TIPO (escalera a escalera, full a full, pareja a
 *   pareja...). Excepto las "bombas": el póker y la escalera de color ganan a cualquier
 *   jugada que no sea bomba (sueltas y parejas incluidas); entre bombas, la escalera de color
 *   gana al póker y, si son del mismo tipo, la más alta.
 *
 * Partida: 13 cartas por jugador (con 2 o 3 jugadores, las que sobran no se usan).
 * Empieza quien tiene el 3♣ y su primera jugada debe llevarlo (si no se repartió, quien
 * tenga la carta más baja, y debe llevar esa). Se juega en orden; hay que echar el mismo
 * tipo de jugada que la de la mesa y ganarle (o echar una bomba), o pasar (quien abre no puede pasar).
 * Pasar no te deja fuera de la baza. Si todos los demás pasan seguidos, quien jugó la
 * última abre libre. El primero que se queda sin cartas gana la ronda; puntos de
 * castigo = cartas que te quedan (menos es mejor).
 */
(function (root) {
  const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  const SUITS = ['♣', '♦', '♥', '♠'];
  const T5 = { straight: 1, full: 3, four: 4, sflush: 5 };
  /** Bombas (鐵支 y 同花順): ganan a cualquier jugada que no sea bomba. */
  const isBomb = c => !!c && (c.type === 'four' || c.type === 'sflush');
  const rankOf = c => c >> 2, suitOf = c => c & 3;
  const label = c => RANKS[rankOf(c)] + SUITS[suitOf(c)];

  /**
   * Qué jugada es (o null si no vale).
   * @returns {{type, n, tier, key}}  tier: 0 en las de 1-3 cartas; 1..5 en las de 5
   */
  function classify(cards) {
    if (!Array.isArray(cards)) return null;
    const c = cards.slice().sort((a, b) => a - b);
    const n = c.length;
    if (new Set(c).size !== n || c.some(x => !(x >= 0 && x < 52 && x === (x | 0)))) return null;
    if (n === 1) return { type: 'single', n, tier: 0, key: c[0] };
    if (n === 2) return rankOf(c[0]) === rankOf(c[1]) ? { type: 'pair', n, tier: 0, key: c[1] } : null;
    if (n !== 5) return null;            // (sin tríos: reglas del dueño)
    const r = c.map(rankOf), cnt = new Map();
    for (const x of r) cnt.set(x, (cnt.get(x) || 0) + 1);
    const flush = c.every(x => suitOf(x) === suitOf(c[0]));
    const st = straightOf(c);
    if (st && flush) return { type: 'sflush', n, tier: T5.sflush, key: st.order * 4 + suitOf(st.top) };
    const counts = [...cnt.values()].sort((a, b) => b - a);
    if (counts[0] === 4) return { type: 'four', n, tier: T5.four, key: [...cnt].find(e => e[1] === 4)[0] };
    if (counts[0] === 3 && counts[1] === 2) return { type: 'full', n, tier: T5.full, key: [...cnt].find(e => e[1] === 3)[0] };
    if (st) return { type: 'straight', n, tier: T5.straight, key: st.order * 4 + suitOf(st.top) };
    return null;
  }

  /** Escalera: { order, top } (order 0 = A-2-3-4-5, 1 = 2-3-4-5-6, 2 = 3-4-5-6-7 ... 9 = 10-J-Q-K-A). */
  function straightOf(c) {
    const r = c.map(rankOf).sort((a, b) => a - b);
    if (new Set(r).size !== 5) return null;
    const byRank = x => c.find(y => rankOf(y) === x);
    if (r[4] <= 11 && r[4] - r[0] === 4) return { order: r[0] + 2, top: byRank(r[4]) };
    const k = r.join(',');
    if (k === '0,1,2,11,12') return { order: 0, top: byRank(2) };      // A-2-3-4-5: arriba el 5
    if (k === '0,1,2,3,12') return { order: 1, top: byRank(3) };       // 2-3-4-5-6: arriba el 6
    return null;
  }

  /** ¿La jugada a (clasificada) gana a la b? Mismo tipo, o una bomba (mayor que la bomba de la mesa). */
  function beats(a, b) {
    if (!a || !b) return false;
    if (isBomb(a)) return !isBomb(b) || (a.tier !== b.tier ? a.tier > b.tier : a.key > b.key);
    if (isBomb(b) || a.type !== b.type) return false;
    return a.key > b.key;
  }

  // ---------------- reparto ----------------

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  /** 13 cartas para cada uno (2-4 jugadores), ordenadas. */
  function deal(n, rng = Math.random) {
    const deck = shuffle([...Array(52).keys()], rng);
    return Array.from({ length: n }, (_, i) => deck.slice(i * 13, i * 13 + 13).sort((a, b) => a - b));
  }

  // ---------------- todas las jugadas de una mano ----------------

  function combos(arr, k, out = [], start = 0, cur = []) {
    if (cur.length === k) { out.push(cur.slice()); return out; }
    for (let i = start; i <= arr.length - (k - cur.length); i++) { cur.push(arr[i]); combos(arr, k, out, i + 1, cur); cur.pop(); }
    return out;
  }
  /** Todas las jugadas válidas con esas cartas: [{ cards, c }]. */
  function allPlays(hand) {
    const h = hand.slice().sort((a, b) => a - b), out = [];
    const add = cards => { const c = classify(cards); if (c) out.push({ cards, c }); };
    for (const x of h) add([x]);
    const byR = new Map();
    for (const x of h) { const r = rankOf(x); if (!byR.has(r)) byR.set(r, []); byR.get(r).push(x); }
    for (const g of byR.values()) if (g.length >= 2) for (const p of combos(g, 2)) add(p);
    if (h.length >= 5) for (const p of combos(h, 5)) add(p);
    return out;
  }

  /** Orden "de más flojo a más fuerte" entre jugadas del mismo tamaño. */
  const weaker = (a, b) => (a.c.tier - b.c.tier) || (a.c.key - b.c.key);

  /**
   * Jugadas que se pueden echar ahora, de la más floja a la más fuerte.
   * @param lead  la jugada en mesa ({ cards }) o null si abres
   * @param must  carta que tiene que ir en la jugada (la primera de la ronda) o -1
   */
  function legalPlays(hand, lead, must = -1) {
    let ps = allPlays(hand);
    if (must >= 0) ps = ps.filter(p => p.cards.includes(must));
    if (lead) {
      const lc = classify(lead.cards);
      ps = ps.filter(p => beats(p.c, lc));
    }
    return ps.sort((a, b) => (a.c.n - b.c.n) || weaker(a, b));
  }

  /**
   * ¿Se puede echar esa jugada? { ok } o { ok:false, err } (texto en español).
   */
  function check(hand, cards, lead, must = -1) {
    if (!cards || !cards.length) return { ok: false, err: 'Elige alguna carta.' };
    if (cards.some(x => !hand.includes(x))) return { ok: false, err: 'Esa carta no es tuya.' };
    const c = classify(cards);
    if (!c) return { ok: false, err: 'Esa combinación no es una jugada válida.' };
    if (must >= 0 && !cards.includes(must)) return { ok: false, err: 'La primera jugada tiene que llevar el {x}.', x: label(must) };
    if (lead) {
      const lc = classify(lead.cards);
      if (!isBomb(c) && c.type !== lc.type) {
        // (Sólo una escalera gana a una escalera, sólo un full a un full...; las bombas, a todo.)
        if (isBomb(lc)) return { ok: false, err: 'En la mesa hay una bomba: sólo la gana una bomba más alta.' };
        return { ok: false, err: 'Tiene que ser una jugada del mismo tipo ({x}) o una bomba.', x: TYPE_NAMES[lc.type] || '' };
      }
      if (!beats(c, lc)) return { ok: false, err: 'Tiene que ganar a la jugada de la mesa.' };
    }
    return { ok: true, c };
  }

  // ---------------- partida ----------------

  /**
   * Nueva ronda para n jugadores. rng: función 0..1 (Math.random por defecto).
   * Estado (sólo lo tiene el anfitrión): hands, turn, lead, lastSeat, passes, passed[], must, over, winner.
   */
  function newRound(n, rng = Math.random) {
    const hands = deal(n, rng);
    let low = 99, seat = 0;
    hands.forEach((h, i) => { if (h[0] < low) { low = h[0]; seat = i; } });
    return { n, hands, turn: seat, lead: null, lastSeat: -1, passes: 0, passed: Array(n).fill(false),
             must: low, first: true, over: false, winner: -1, moves: 0, last: null };
  }

  /** Jugada de un asiento. a = { type:'play', cards } | { type:'pass' }. Devuelve { ok, err? }. */
  function act(st, seat, a) {
    if (st.over) return { ok: false, err: 'La ronda ya ha terminado.' };
    if (seat !== st.turn) return { ok: false, err: 'No es tu turno.' };
    if (!a || (a.type !== 'play' && a.type !== 'pass')) return { ok: false, err: 'Jugada desconocida.' };
    if (a.type === 'pass') {
      if (!st.lead) return { ok: false, err: 'Abres tú: no puedes pasar.' };
      st.passed[seat] = true;
      st.passes++;
      st.last = { seat, kind: 'pass', seq: ++st.moves };
      next(st);
      if (st.passes >= st.n - 1) {           // todos los demás han pasado: abre libre quien jugó la última
        st.turn = st.lastSeat;
        st.lead = null;
        st.passes = 0;
        st.passed.fill(false);
        st.last.clear = true;
      }
      return { ok: true };
    }
    const hand = st.hands[seat];
    const cards = (a.cards || []).map(Number);
    const r = check(hand, cards, st.lead, st.first ? st.must : -1);
    if (!r.ok) return r;
    st.hands[seat] = hand.filter(x => !cards.includes(x));
    st.lead = { cards: cards.slice().sort((x, y) => x - y), seat, type: r.c.type };
    st.lastSeat = seat;
    st.passes = 0;
    st.passed.fill(false);
    st.first = false;
    st.last = { seat, kind: 'play', cards: st.lead.cards, type: r.c.type, seq: ++st.moves };
    if (!st.hands[seat].length) { st.over = true; st.winner = seat; st.turn = -1; return { ok: true, win: true }; }
    next(st);
    return { ok: true };
  }
  function next(st) { st.turn = (st.turn + 1) % st.n; }

  /** Resultado: puesto, cartas que quedan y puntos de castigo (= cartas que quedan). */
  function results(st) {
    const rows = st.hands.map((h, seat) => ({ seat, left: h.length, pts: h.length }));
    rows.sort((a, b) => (a.left - b.left) || ((a.seat === st.winner) ? -1 : (b.seat === st.winner) ? 1 : 0));
    let place = 0, prev = -1;
    rows.forEach((r, i) => { if (r.left !== prev) { place = i + 1; prev = r.left; } r.place = place; });
    return rows;
  }

  // ---------------- CPU ----------------

  /**
   * La CPU elige (sólo ve su mano y lo público). Devuelve { type:'play', cards } o { type:'pass' }.
   * ctx: { lead, must, oppMin (cartas del rival que menos tiene), mine (cuántas tengo) }
   */
  function cpuMove(hand, ctx) {
    const lead = ctx.lead, must = ctx.must == null ? -1 : ctx.must;
    const ps = legalPlays(hand, lead, must);
    if (!ps.length) return { type: 'pass' };
    const cntR = new Map();
    for (const x of hand) cntR.set(rankOf(x), (cntR.get(rankOf(x)) || 0) + 1);
    const twos = p => p.cards.filter(x => rankOf(x) === 12).length;
    // ¿Rompe una pareja / trío / póker que tenía? (las sueltas y parejas)
    const breaks = p => {
      if (p.c.n >= 5) return 0;
      const r = rankOf(p.cards[0]), have = cntR.get(r);
      return have > p.c.n ? 1 : 0;
    };
    const danger = (ctx.oppMin || 13) <= 2;
    if (!lead) {
      // Abre: la carta más baja (o la obligada) en la jugada que suelte más cartas sin gastar doses.
      const low = must >= 0 ? must : Math.min(...hand);
      let cand = ps.filter(p => p.cards.includes(low));
      if (!cand.length) cand = ps;
      const no2 = cand.filter(p => !twos(p) || hand.length <= 5);
      if (no2.length) cand = no2;
      const noBomb = cand.filter(p => !isBomb(p.c) || p.cards.length === hand.length);   // las bombas se guardan
      if (noBomb.length) cand = noBomb;
      if (danger) {                           // al rival le quedan 1-2 cartas: nada de sueltas flojas
        const big = cand.filter(p => p.c.n > (ctx.oppMin || 1));
        if (big.length) cand = big;
        else if (cand.every(p => p.c.n === 1)) {
          const singles = ps.filter(p => p.c.n === 1 && (must < 0 || p.cards.includes(must)));
          return { type: 'play', cards: singles[singles.length - 1].cards };
        }
      }
      cand.sort((a, b) => (b.c.n - a.c.n) || (breaks(a) - breaks(b)) || weaker(a, b));
      return { type: 'play', cards: cand[0].cards };
    }
    // Sigue: la jugada más floja que gana, sin romper grupos ni gastar doses si se puede.
    const cost = p => breaks(p) * 30 + twos(p) * 60 + (p.c.n === 5 && p.c.tier >= 4 ? 80 : 0) + p.c.tier * 10 + (p.c.n < 5 ? rankOf(p.cards[0]) : 0);
    const sorted = ps.slice().sort((a, b) => (cost(a) - cost(b)) || weaker(a, b));
    if (danger && lead.cards.length === 1) {     // rival a punto de ganar: la suelta más alta (si no, una bomba)
      const singles = ps.filter(p => p.c.n === 1);
      return { type: 'play', cards: (singles.length ? singles[singles.length - 1] : ps[ps.length - 1]).cards };
    }
    const best = sorted[0];
    const pricey = twos(best) > 0 || (best.c.n === 5 && best.c.tier >= 4) || breaks(best);
    if (pricey && !danger && hand.length > 6 && (ctx.oppMin || 13) > 4) return { type: 'pass' };
    return { type: 'play', cards: best.cards };
  }

  /** Se acabó el tiempo: pasa; si abre, la carta obligada o la más baja. */
  function timeoutMove(hand, lead, must = -1) {
    if (lead) return { type: 'pass' };
    return { type: 'play', cards: [must >= 0 ? must : Math.min(...hand)] };
  }

  /** Orden para enseñar la mano: por número (por defecto) o por palo. */
  function sortHand(hand, bySuit) {
    return hand.slice().sort(bySuit ? (a, b) => (suitOf(a) - suitOf(b)) || (a - b) : (a, b) => a - b);
  }

  // (Textos propios, no 'Color' o 'Pareja' a secas: el diccionario es de todo el juego, KNOWN-FAILURES 28.)
  const TYPE_NAMES = { single: 'Una carta', pair: 'Pareja de cartas', straight: 'Escalera de cartas',
                       full: 'Full de cartas', four: 'Póker de cartas', sflush: 'Escalera de color' };

  const BigTwo = { RANKS, SUITS, TYPE_NAMES, isBomb, rankOf, suitOf, label, classify, beats, deal, allPlays, legalPlays, check,
                   newRound, act, results, cpuMove, timeoutMove, sortHand };
  if (typeof module !== 'undefined' && module.exports) module.exports = BigTwo;
  if (root && root.G) root.G.BigTwo = BigTwo;
})(typeof window !== 'undefined' ? window : globalThis);
