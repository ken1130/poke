/* ============ voltorb.js — "Voltorb travieso" (頑皮雷彈) para el modo fiesta ============
 * Juego de robar cartas: el que roba un Voltorb y no tiene Goma aislante, explota y queda fuera.
 * El último que queda gana. Sólo reglas y lógica (sin DOM): la usan el anfitrión (que manda),
 * cada jugador (para validar antes de enviar) y la prueba de Node (tools/test/voltorb_rules.js).
 *
 * Cartas (un número 0..55 = índice en CARDS; en cada ronda sólo se usan algunas bombas y gomas):
 *   bomb    Voltorb (雷電球): 3 (se usan jugadores − 1; la nº 0 se dibuja como Electrode, mismo efecto)
 *   defuse  Goma aislante (絕緣橡膠, Diglett): 7 (1 por jugador + 2 en el mazo; con 4 jugadores, 3)
 *   attack  Berrinche de Mankey (大鬧一番) ×4: acabas sin robar y el siguiente juega 2 turnos
 *           (si a ti te habían atacado, el siguiente juega los turnos que te quedaban + 2)
 *   skip    Siesta de Snorlax (呼呼大睡) ×4: acabas un turno sin robar
 *   shuffle Teletransporte de Abra (瞬間移動) ×4: baraja el mazo
 *   future  Premonición de Natu (預知未來) ×5: ves (sólo tú) las 3 de arriba
 *   favor   Encanto de Clefairy (撒嬌) ×4: eliges a alguien y te da una carta que elige él
 *           (si no elige en 15 s, una al azar)
 *   nope    Detección de Wobbuffet (看穿) ×5: anula la última carta de acción; la puede echar
 *           cualquiera (no sólo quien juega) mientras está abierta la ventana de 3 s; se puede
 *           anular un «看穿» con otro (la ventana vuelve a empezar con cada uno)
 *   pair    5 Pokémon sin efecto (Pikachu, Psyduck, Jigglypuff, Meowth, Magikarp) ×4: dos iguales
 *           = robas una carta al azar a quien elijas
 *
 * Reparto: 7 cartas de acción + 1 goma a cada uno; al mazo, el resto + las gomas de más +
 * las bombas, y se baraja. Mazo: deck[0] es la de arriba.
 *
 * Turno: echas las cartas de acción que quieras (una a una; cada una abre la ventana para
 * «看穿» y no hace efecto hasta que se cierra) y acabas robando 1. Si robas un Voltorb: con
 * goma, la usas y lo vuelves a meter donde quieras (en secreto); sin goma, explotas (tu mano
 * se descarta). Puntos por ronda según el puesto (PTS).
 *
 * Estado (sólo lo tiene el anfitrión): { n, hands, deck, discard, alive, out, turn, left,
 *   attacked, phase, pend, favor, bomb, know, notes, tacts, moves, tseq, seq, ev, log, over, winner }.
 *   phase: 'play' | 'bomb' (acaba de robar un Voltorb) | 'insert' (ha usado la goma: dónde lo mete)
 *          | 'favor' (favor.to tiene que dar una carta a favor.from).
 *   pend: carta de acción en la ventana de «看穿» { seq, seat, kind, cards, target, nopes, last, until }.
 *   know[seat]: lo que ese jugador sabe de arriba del mazo (ids o -1), por Premonición o por
 *   meter él el Voltorb. Sólo se le manda a él (priv). El orden del mazo nunca sale del anfitrión.
 *   notes[seat]: últimas cosas privadas (qué has robado, qué te han dado o quitado).
 *   El tiempo (ventana, favores) va con `now` (ms): act(st, seat, a, now).
 */
(function (root) {
  const KINDS = ['bomb', 'defuse', 'attack', 'skip', 'shuffle', 'future', 'favor', 'nope', 'pair'];
  const PAIRS = 5;
  const CARDS = [];
  for (let i = 0; i < 3; i++) CARDS.push({ k: 'bomb', alt: i === 0 });
  for (let i = 0; i < 7; i++) CARDS.push({ k: 'defuse' });
  const COUNTS = { attack: 4, skip: 4, shuffle: 4, future: 5, favor: 4, nope: 5 };
  for (const k of Object.keys(COUNTS)) for (let i = 0; i < COUNTS[k]; i++) CARDS.push({ k });
  for (let p = 0; p < PAIRS; p++) for (let i = 0; i < 4; i++) CARDS.push({ k: 'pair', p });
  const N = CARDS.length;   // 56
  const BOMBS = [0, 1, 2], DEFUSES = [3, 4, 5, 6, 7, 8, 9];
  const ACTION_IDS = [...Array(N).keys()].filter(i => i >= 10);
  /** Mazo más corto a 2 (2026-10-17, pedido del dueño: con las 46 la partida se alargaba): de cada acción
   *  se quitan 1-2 y de cada pareja 2 → 28 cartas de acción. Con 3-4 jugadores, todas. */
  const DROP2 = { attack: 1, skip: 1, shuffle: 1, future: 2, favor: 1, nope: 2, pair: 2 };
  function actionsFor(n) {
    if (n > 2) return ACTION_IDS;
    const seen = {};
    return ACTION_IDS.filter(id => { const c = CARDS[id], k = c.k === 'pair' ? 'p' + c.p : c.k; seen[k] = (seen[k] || 0) + 1; return seen[k] > DROP2[c.k]; });
  }
  const WIN = 3000;        // ventana para «看穿» (ms)
  const FAVOR_MS = 15000;  // para elegir qué carta das
  const BOMB_MS = 12000;   // para pulsar «usar la goma» (si no, se usa sola)
  const BOOM_MS = 2600;    // sin goma: lo que dura el susto antes de explotar
  const INSERT_MS = 15000; // para elegir dónde vuelve el Voltorb
  const HAND0 = 7;
  /** Puntos de la ronda por puesto (1º, 2º...). */
  const PTS = { 2: [3, 0], 3: [3, 1, 0], 4: [3, 2, 1, 0] };
  /** Cartas de acción que se echan en tu turno (abren la ventana de «看穿»). */
  const PLAYABLE = ['attack', 'skip', 'shuffle', 'future', 'favor', 'pair'];
  const TARGETED = ['favor', 'pair'];

  const card = id => CARDS[id];
  const kind = id => (CARDS[id] ? CARDS[id].k : '');
  const isBomb = id => kind(id) === 'bomb';
  const valid = id => Number.isInteger(id) && id >= 0 && id < N;
  const extraDefuses = n => (n >= 4 ? 3 : 2);

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const rngOf = st => st.rng || Math.random;

  /** Orden para enseñar la mano: goma, acciones, parejas juntas. */
  const ORDER = { defuse: 0, nope: 1, attack: 2, skip: 3, shuffle: 4, future: 5, favor: 6, pair: 7, bomb: 8 };
  function sortHand(h) { return h.slice().sort((a, b) => (ORDER[kind(a)] - ORDER[kind(b)]) || ((CARDS[a].p || 0) - (CARDS[b].p || 0)) || (a - b)); }

  /** Cartas que hay en juego en una ronda de n jugadores (para la prueba y la regla). */
  function deckFor(n) {
    const a = actionsFor(n).length;
    return { bombs: n - 1, defuses: n + extraDefuses(n), actions: a, total: a + n + extraDefuses(n) + n - 1 };
  }

  function nextAlive(st, from) {
    for (let k = 1; k <= st.n; k++) { const j = (from + k) % st.n; if (st.alive[j]) return j; }
    return from;
  }
  const aliveCount = st => st.alive.filter(Boolean).length;
  const bombsIn = st => st.deck.filter(isBomb).length;

  /**
   * Nueva ronda para n jugadores. rng: función 0..1 (Math.random por defecto).
   * opts.start: quién empieza (si no, al azar).
   */
  function newRound(n, rng = Math.random, opts = {}) {
    const acts = shuffle(actionsFor(n).slice(), rng);
    const hands = Array.from({ length: n }, (x, i) => [DEFUSES[i], ...acts.splice(0, HAND0)]);
    const deck = shuffle([...acts, ...DEFUSES.slice(n, n + extraDefuses(n)), ...BOMBS.slice(0, n - 1)], rng);
    const start = opts.start != null ? opts.start : Math.floor(rng() * n);
    const st = { n, hands, deck, discard: [], alive: Array(n).fill(true), out: [], turn: start, left: 1, attacked: false,
                 phase: 'play', pend: null, favor: null, bomb: null, know: hands.map(() => []), notes: hands.map(() => []),
                 tacts: 0, moves: 0, tseq: 0, seq: 0, ev: [{ k: 'start', seat: start }], log: [], over: false, winner: -1 };
    Object.defineProperty(st, 'rng', { value: rng, enumerable: false, writable: true });
    return st;
  }

  function logEv(st, e) { st.ev.push(e); st.log.push(Object.assign({ seq: ++st.seq }, e)); if (st.log.length > 8) st.log.shift(); }
  /** Algo privado para un jugador (las 4 últimas). */
  function note(st, seat, x) { const a = st.notes[seat]; a.push(Object.assign({ seq: ++st.seq }, x)); if (a.length > 4) a.shift(); }

  /** Lo que se sabe del mazo cuando cambia: se roba la de arriba / se baraja / alguien mete el Voltorb. */
  const knowDraw = st => st.know.forEach(k => k.shift());
  const knowClear = st => st.know.forEach((k, i) => { st.know[i] = []; });

  /** Acaba un turno (el que juegas): si te quedaban más (te atacaron), sigues tú. */
  function endTurn(st) {
    st.left--;
    st.tacts = 0;
    if (st.left <= 0) { st.turn = nextAlive(st, st.turn); st.left = 1; st.attacked = false; }
    st.tseq++;
  }

  /** Quita de la mano la primera carta de ese tipo y la echa al descarte. */
  function spend(st, seat, k) {
    const h = st.hands[seat], i = h.findIndex(id => kind(id) === k);
    if (i < 0) return -1;
    const id = h.splice(i, 1)[0];
    st.discard.push(id);
    return id;
  }

  /** Qué jugadores pueden ser objetivo de seat (vivos, otros, con cartas). */
  const targets = (st, seat) => st.hands.map((h, j) => j).filter(j => j !== seat && st.alive[j] && st.hands[j].length > 0);

  /**
   * Comprueba una jugada de «echar cartas» (también desde la vista del jugador).
   * hand: su mano; cards: ids; target; ctx: { alive, counts, seat }.
   */
  function checkPlay(hand, cards, target, ctx) {
    if (!Array.isArray(cards) || !cards.length || cards.length > 2) return { ok: false, err: 'Elige una carta de acción (o dos Pokémon iguales).' };
    if (!cards.every(valid) || new Set(cards).size !== cards.length || !cards.every(id => hand.includes(id))) return { ok: false, err: 'Esa carta no es tuya.' };
    const k = kind(cards[0]);
    if (cards.length === 2) {
      if (kind(cards[1]) !== 'pair' || k !== 'pair' || CARDS[cards[0]].p !== CARDS[cards[1]].p) return { ok: false, err: 'Para robar hace falta una pareja: dos cartas del mismo Pokémon.' };
    } else {
      if (k === 'pair') return { ok: false, err: 'Una carta de Pokémon sola no hace nada: echa dos iguales.' };
      if (k === 'nope') return { ok: false, err: 'Detección sólo se usa para anular la carta que acaban de echar.' };
      if (k === 'defuse') return { ok: false, err: 'La goma aislante sólo se usa al robar un Voltorb.' };
      if (!PLAYABLE.includes(k)) return { ok: false, err: 'Esa carta no se puede echar.' };
    }
    if (TARGETED.includes(k)) {
      const t = target;
      if (!Number.isInteger(t) || t < 0 || t >= ctx.alive.length || t === ctx.seat || !ctx.alive[t]) return { ok: false, err: 'Elige a quién se la echas.' };
      if (!(ctx.counts[t] > 0)) return { ok: false, err: 'Ese jugador no tiene cartas.' };
    }
    return { ok: true, kind: k };
  }

  /**
   * Jugada de un asiento. Devuelve { ok, err?, x? } (textos en español).
   * a = { type:'play', cards:[id] | [id,id], target? } | { type:'nope', at? } | { type:'resolve' }
   *   | { type:'draw' } | { type:'defuse' } | { type:'explode' } | { type:'insert', pos }
   *   | { type:'give', card } | { type:'give', random:true }
   * now: ms (Date.now() por defecto).
   */
  function act(st, seat, a, now = Date.now()) {
    if (st.over) return { ok: false, err: 'La ronda ya ha terminado.' };
    if (!a || typeof a.type !== 'string') return { ok: false, err: 'Jugada desconocida.' };
    if (!(seat >= 0 && seat < st.n)) return { ok: false, err: 'Jugada desconocida.' };
    const t = a.type, rng = rngOf(st);
    if (!st.alive[seat]) return { ok: false, err: 'Ya has explotado: esta ronda sólo miras.' };

    // --- «看穿»: cualquiera, mientras la ventana está abierta ---
    if (t === 'nope') {
      const p = st.pend;
      if (!p || now > p.until + 200) return { ok: false, err: 'Ahora no hay nada que anular.' };
      if (p.last === seat) return { ok: false, err: 'No puedes anular tu propia carta.' };
      if (a.at != null && a.at !== p.nopes) return { ok: false, err: 'Alguien se te ha adelantado con otra Detección.' };
      if (spend(st, seat, 'nope') < 0) return { ok: false, err: 'No tienes ninguna Detección.' };
      st.ev = [];
      p.nopes++; p.last = seat; p.until = now + WIN;
      logEv(st, { k: 'nope', seat, on: p.seat, kind: p.kind, n: p.nopes });
      st.moves++;
      return { ok: true };
    }
    if (t === 'resolve') {
      const p = st.pend;
      if (!p) return { ok: false, err: 'Ahora no hay nada que anular.' };
      if (now < p.until - 100) return { ok: false, err: 'Todavía se puede anular.' };
      st.ev = [];
      st.pend = null;
      st.moves++;
      if (p.nopes % 2) { logEv(st, { k: 'cancel', seat: p.seat, kind: p.kind }); return { ok: true }; }
      resolve(st, p, now);
      return { ok: true };
    }
    // --- Favor: el que tiene que dar ---
    if (t === 'give') {
      const f = st.favor;
      if (st.phase !== 'favor' || !f || f.to !== seat) return { ok: false, err: 'Ahora no tienes que dar ninguna carta.' };
      const h = st.hands[seat];
      let id = Number(a.card);
      if (a.random || !h.includes(id)) {
        if (!a.random) return { ok: false, err: 'Esa carta no es tuya.' };
        id = h[Math.floor(rng() * h.length)];
      }
      st.ev = [];
      h.splice(h.indexOf(id), 1);
      st.hands[f.from].push(id);
      note(st, f.from, { k: 'got', card: id, from: seat, how: 'favor' });
      note(st, seat, { k: 'gave', card: id, to: f.from, how: 'favor' });
      logEv(st, { k: 'give', seat, to: f.from, rand: !!a.random });
      st.favor = null; st.phase = 'play';
      st.moves++;
      return { ok: true };
    }
    // --- el resto, sólo quien juega ---
    if (seat !== st.turn) return { ok: false, err: 'No es tu turno.' };
    const hand = st.hands[seat];
    if (t === 'defuse') {
      if (st.phase !== 'bomb') return { ok: false, err: 'Ahora no hay ningún Voltorb que desactivar.' };
      if (spend(st, seat, 'defuse') < 0) return { ok: false, err: 'No tienes ninguna goma aislante.' };
      st.ev = [];
      st.phase = 'insert';
      st.bomb.ins = now;
      logEv(st, { k: 'defuse', seat, card: st.bomb.card });
      st.moves++;
      return { ok: true };
    }
    if (t === 'explode') {
      if (st.phase !== 'bomb') return { ok: false, err: 'Ahora no hay ningún Voltorb que desactivar.' };
      if (hand.some(id => kind(id) === 'defuse')) return { ok: false, err: 'Tienes una goma aislante: úsala.' };
      st.ev = [];
      explode(st, seat);
      st.moves++;
      return { ok: true };
    }
    if (t === 'insert') {
      if (st.phase !== 'insert') return { ok: false, err: 'Primero usa la goma aislante.' };
      const len = st.deck.length;
      let pos = a.pos === 'random' || a.pos == null || a.pos === -1 ? Math.floor(rng() * (len + 1)) : Number(a.pos);
      if (!Number.isInteger(pos) || pos < 0 || pos > len) return { ok: false, err: 'Elige dónde vuelves a meter el Voltorb.' };
      st.ev = [];
      const b = st.bomb.card;
      st.deck.splice(pos, 0, b);
      // Los demás ya no saben dónde está nada; tú sí (sabes dónde lo has metido).
      const mine = st.know[seat].map(x => (x === b ? -1 : x));
      knowClear(st);
      while (mine.length < pos) mine.push(-1);
      mine.splice(pos, 0, b);
      st.know[seat] = mine.slice(0, Math.max(pos + 1, 3));
      note(st, seat, { k: 'ins', pos, len: len + 1 });
      logEv(st, { k: 'insert', seat });
      st.bomb = null; st.phase = 'play';
      st.moves++;
      endTurn(st);
      return { ok: true };
    }
    if (st.phase === 'bomb') return { ok: false, err: 'Has robado un Voltorb: usa la goma aislante.' };
    if (st.phase === 'insert') return { ok: false, err: 'Elige dónde vuelves a meter el Voltorb.' };
    if (st.phase === 'favor') return { ok: false, err: 'Espera a que te den la carta.' };
    if (st.pend) return { ok: false, err: 'Espera: aún se puede anular la última carta.' };
    if (t === 'draw') {
      st.ev = [];
      const id = st.deck.shift();
      knowDraw(st);
      st.moves++;
      if (isBomb(id)) {
        st.phase = 'bomb';
        st.bomb = { seat, card: id, seq: ++st.seq, at: now };
        logEv(st, { k: 'bomb', seat, card: id, def: hand.some(x => kind(x) === 'defuse') });
        return { ok: true, bomb: true };
      }
      hand.push(id);
      note(st, seat, { k: 'drew', card: id });
      logEv(st, { k: 'draw', seat });
      endTurn(st);
      return { ok: true };
    }
    if (t !== 'play') return { ok: false, err: 'Jugada desconocida.' };
    const cards = Array.isArray(a.cards) ? a.cards.map(Number) : [];
    const chk = checkPlay(hand, cards, a.target, { alive: st.alive, counts: st.hands.map(h => h.length), seat });
    if (!chk.ok) return chk;
    st.ev = [];
    for (const id of cards) { hand.splice(hand.indexOf(id), 1); st.discard.push(id); }
    const k = chk.kind;
    st.pend = { seq: ++st.seq, seat, kind: k, cards, target: TARGETED.includes(k) ? a.target : (k === 'attack' ? nextAlive(st, seat) : -1), nopes: 0, last: seat, until: now + WIN };
    st.tacts++;
    logEv(st, { k: 'play', seat, kind: k, cards, target: st.pend.target });
    st.moves++;
    return { ok: true };
  }

  /** La carta no la han anulado: hace su efecto. */
  function resolve(st, p, now) {
    const rng = rngOf(st), seat = p.seat;
    switch (p.kind) {
      case 'attack': {
        const to = nextAlive(st, seat);
        const turns = (st.attacked ? st.left : 0) + 2;
        logEv(st, { k: 'attack', seat, to, turns });
        st.turn = to; st.left = turns; st.attacked = true; st.tacts = 0; st.tseq++;
        break;
      }
      case 'skip':
        logEv(st, { k: 'skip', seat });
        endTurn(st);
        break;
      case 'shuffle':
        shuffle(st.deck, rng);
        knowClear(st);
        logEv(st, { k: 'shuffle', seat });
        break;
      case 'future': {
        const top = st.deck.slice(0, 3);
        st.know[seat] = top.slice();
        note(st, seat, { k: 'peek', cards: top });
        logEv(st, { k: 'future', seat });
        break;
      }
      case 'favor': {
        const to = p.target;
        if (!st.alive[to] || !st.hands[to].length) { logEv(st, { k: 'nothing', seat, to }); break; }
        st.phase = 'favor';
        st.favor = { from: seat, to, until: now + FAVOR_MS, seq: ++st.seq };
        logEv(st, { k: 'favor', seat, to });
        break;
      }
      case 'pair': {
        const to = p.target, h = st.hands[to];
        if (!st.alive[to] || !h.length) { logEv(st, { k: 'nothing', seat, to }); break; }
        const id = h.splice(Math.floor(rng() * h.length), 1)[0];
        st.hands[seat].push(id);
        note(st, seat, { k: 'got', card: id, from: to, how: 'steal' });
        note(st, to, { k: 'gave', card: id, to: seat, how: 'steal' });
        logEv(st, { k: 'steal', seat, to });
        break;
      }
    }
  }

  function explode(st, seat) {
    const b = st.bomb ? st.bomb.card : -1;
    st.alive[seat] = false;
    st.out.push(seat);
    if (b >= 0) st.discard.push(b);
    st.discard.push(...st.hands[seat]);
    st.hands[seat] = [];
    st.know[seat] = [];
    st.bomb = null; st.phase = 'play';
    logEv(st, { k: 'boom', seat, card: b });
    if (aliveCount(st) <= 1) {
      st.over = true; st.winner = st.alive.indexOf(true); st.turn = -1; st.tseq++;
      logEv(st, { k: 'win', seat: st.winner });
      return;
    }
    st.turn = nextAlive(st, seat); st.left = 1; st.attacked = false; st.tacts = 0; st.tseq++;
  }

  /** Quién tiene que hacer algo ahora (para el reloj y las CPU). */
  function turnOf(st) {
    if (st.over) return -1;
    if (st.phase === 'favor' && st.favor) return st.favor.to;
    return st.turn;
  }

  /** Resultado: puesto (el último en pie gana; luego, al revés de como explotaron) y puntos. */
  function results(st) {
    const order = [];
    if (st.winner >= 0) order.push(st.winner);
    for (let i = st.out.length - 1; i >= 0; i--) order.push(st.out[i]);
    for (let j = 0; j < st.n; j++) if (!order.includes(j)) order.push(j);
    const pts = PTS[st.n] || PTS[4];
    return order.map((seat, i) => ({ seat, place: i + 1, pts: pts[i] || 0, left: st.hands[seat].length, alive: !!st.alive[seat] }));
  }

  // ---------------- CPU ----------------
  const has = (h, k) => h.some(id => kind(id) === k);
  const pick = (h, k) => h.find(id => kind(id) === k);
  /** Una pareja de la mano (dos del mismo Pokémon), o null. */
  function pairOf(h) {
    const by = {};
    for (const id of h) if (kind(id) === 'pair') { const p = CARDS[id].p; (by[p] = by[p] || []).push(id); if (by[p].length === 2) return by[p]; }
    return null;
  }

  /** La CPU en su turno (fase 'play', sin ventana abierta). Sólo usa lo que sabe: su mano, lo público y su `know`. */
  function cpuMove(st, seat) {
    const rng = rngOf(st);
    if (st.phase === 'favor') return { type: 'give', card: worstCard(st.hands[seat]) };
    if (st.pend) return { type: 'resolve' };
    const h = st.hands[seat];
    if (st.phase === 'bomb') return has(h, 'defuse') ? { type: 'defuse' } : { type: 'explode' };
    if (st.phase === 'insert') return { type: 'insert', pos: cpuInsert(st, seat) };
    if (st.tacts >= 3) return { type: 'draw' };
    const know = st.know[seat] || [];
    const top = know.length ? know[0] : -1;
    const topBomb = top >= 0 && isBomb(top), topSafe = top >= 0 && !isBomb(top);
    const risk = bombsIn(st) / Math.max(1, st.deck.length);
    const defuse = has(h, 'defuse');
    const play = (k, extra) => Object.assign({ type: 'play', cards: [pick(h, k)] }, extra || {});
    const tg = targets(st, seat);
    const richest = () => tg.slice().sort((a, b) => st.hands[b].length - st.hands[a].length)[0];
    if (topBomb) {
      if (has(h, 'attack') && (rng() < 0.7 || !has(h, 'skip'))) return play('attack');
      if (has(h, 'skip')) return play('skip');
      if (has(h, 'shuffle')) return play('shuffle');
      return { type: 'draw' };
    }
    // Robar cartas a los demás antes de acabar.
    const pr = pairOf(h);
    if (pr && tg.length && rng() < 0.7) return { type: 'play', cards: pr, target: richest() };
    if (has(h, 'favor') && tg.length && rng() < (defuse ? 0.3 : 0.5)) return play('favor', { target: richest() });
    if (topSafe) return { type: 'draw' };
    if (has(h, 'future') && (risk > 0.1 || rng() < 0.3) && !know.length) return play('future');
    const scared = defuse ? risk > 0.4 : risk > 0.18;
    if (scared || (st.left > 1 && risk > 0.12)) {
      if (has(h, 'attack') && rng() < 0.8) return play('attack');
      if (has(h, 'skip') && rng() < 0.8) return play('skip');
    }
    return { type: 'draw' };
  }

  /** Dónde mete la CPU el Voltorb: arriba si el siguiente lo va a robar; abajo si le toca a ella otra vez. */
  function cpuInsert(st, seat) {
    const rng = rngOf(st), len = st.deck.length;
    if (st.left > 1) return len - Math.floor(rng() * Math.min(3, len + 1));   // aún te quedan turnos: lejos
    const nx = nextAlive(st, seat);
    const weak = st.hands[nx].length <= 3;
    const r = rng();
    if (weak || r < 0.45) return 0;
    if (r < 0.7) return Math.min(len, 1 + Math.floor(rng() * 2));
    return Math.floor(rng() * (len + 1));
  }

  /** La carta que menos le importa dar (Pokémon sueltos primero; la goma, lo último). */
  const KEEP = { pair: 1, future: 2, shuffle: 3, favor: 4, skip: 5, attack: 6, nope: 7, defuse: 9, bomb: 9 };
  function worstCard(h) {
    if (!h.length) return -1;
    const cnt = {};
    for (const id of h) if (kind(id) === 'pair') cnt[CARDS[id].p] = (cnt[CARDS[id].p] || 0) + 1;
    const val = id => KEEP[kind(id)] - (kind(id) === 'pair' && cnt[CARDS[id].p] === 1 ? 1 : 0);
    return h.slice().sort((a, b) => val(a) - val(b) || a - b)[0];
  }

  /**
   * ¿La CPU echa Detección a la carta de la ventana? (probabilidad; se decide una vez por nivel).
   * Anula sobre todo lo que va contra ella (ataque al siguiente, favor o robo), y a veces responde
   * cuando le anulan su carta.
   */
  function cpuNopeChance(st, seat) {
    const p = st.pend;
    if (!p || !st.alive[seat] || p.last === seat || !has(st.hands[seat], 'nope')) return 0;
    const active = p.nopes % 2 === 0;   // la carta va a hacer efecto si nadie hace nada
    if (active) {
      if (p.seat === seat) return 0;
      if (p.kind === 'attack' && p.target === seat) return 0.6;
      if ((p.kind === 'favor' || p.kind === 'pair') && p.target === seat) return 0.7;
      return p.kind === 'skip' || p.kind === 'future' ? 0.08 : 0.12;
    }
    // Han anulado algo: si era mío, a veces lo recupero.
    if (p.seat === seat) return 0.55;
    if (p.target === seat) return 0;
    return 0.05;
  }

  /** Se acabó el tiempo: robar (o lo que toque en cada fase). */
  function timeoutMove(st, seat) {
    if (st.phase === 'favor') return { type: 'give', random: true };
    if (st.pend) return { type: 'resolve' };
    if (st.phase === 'bomb') return has(st.hands[seat], 'defuse') ? { type: 'defuse' } : { type: 'explode' };
    if (st.phase === 'insert') return { type: 'insert', pos: -1 };
    return { type: 'draw' };
  }

  // ---------------- vistas ----------------
  function priv(st, seat) {
    return { hand: st.hands[seat].slice(), know: (st.know[seat] || []).slice(0, 3), notes: st.notes[seat].map(x => Object.assign({}, x, x.cards ? { cards: x.cards.slice() } : {})) };
  }
  function pub(st, now = Date.now()) {
    const p = st.pend, f = st.favor, b = st.bomb;
    return {
      counts: st.hands.map(h => h.length), alive: st.alive.slice(), out: st.out.slice(), turn: st.over ? -1 : st.turn, left: st.left, attacked: st.attacked,
      phase: st.phase, deck: st.deck.length, bombs: bombsIn(st) + (st.bomb ? 1 : 0), top: st.discard.length ? st.discard[st.discard.length - 1] : -1,
      under: st.discard.slice(-4, -1),
      pend: p ? { seq: p.seq, seat: p.seat, kind: p.kind, cards: p.cards.slice(), target: p.target, nopes: p.nopes, last: p.last, left: Math.max(0, p.until - now), win: WIN } : null,
      favor: f ? { from: f.from, to: f.to, seq: f.seq, left: Math.max(0, f.until - now), total: FAVOR_MS } : null,
      bomb: b ? { seat: b.seat, card: b.card, seq: b.seq, def: st.hands[b.seat].some(id => kind(id) === 'defuse'),
                  left: Math.max(0, b.at + (st.phase === 'insert' ? 0 : BOMB_MS) - now), boom: Math.max(0, b.at + BOOM_MS - now),
                  ileft: b.ins != null ? Math.max(0, b.ins + INSERT_MS - now) : 0 } : null,
      ev: st.ev.map(e => Object.assign({}, e)), log: st.log.map(e => Object.assign({}, e)), moves: st.moves, tseq: st.tseq, over: st.over, winner: st.winner
    };
  }

  const VB = { KINDS, CARDS, N, PAIRS, BOMBS, DEFUSES, ACTION_IDS, actionsFor, COUNTS, WIN, FAVOR_MS, BOMB_MS, BOOM_MS, INSERT_MS, PTS, PLAYABLE, TARGETED,
               card, kind, isBomb, sortHand, deckFor, extraDefuses, newRound, act, checkPlay, turnOf, results, nextAlive, targets, pairOf,
               cpuMove, cpuInsert, cpuNopeChance, worstCard, timeoutMove, priv, pub, bombsIn };
  if (typeof module !== 'undefined' && module.exports) module.exports = VB;
  if (root && root.G) root.G.Voltorb = VB;
})(typeof window !== 'undefined' ? window : globalThis);
