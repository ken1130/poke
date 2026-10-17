/* ============ party.js — modo fiesta: juegos por turnos en la sala ============
 * En la sala de "Jugar con amigos" hay un tercer modo (además de Equipo y PK): Fiesta.
 * El anfitrión elige un juego y puede añadir jugadores CPU hasta llenar las plazas.
 * Al empezar NO se entra en el mundo: se abre la mesa (#scr-party, party-game-ui.js).
 *
 * Juegos (registro): { id, name, minPlayers, maxPlayers, soon?, turnMs, newRound, act, turn,
 *   cpu, timeout, priv, pub, results, precheck?, cpuDelay? }. Big Two (bigtwo.js) y
 *   Cartas de tipos (typecards.js); los demás salen en la lista como "Próximamente".
 *   precheck(vista, a): validación en el jugador antes de enviar (el anfitrión vuelve a validar).
 *   cpuDelay(st): milisegundos de más antes de que juegue la CPU (p. ej. para dar tiempo a avisar).
 *
 * Red (los mismos canales que el cooperativo, G.Net; mensajes { k:'pty', t, ... }):
 *   El ANFITRIÓN manda: tiene la baraja y todo el estado, valida cada jugada, mueve a las
 *   CPU y a quien se ha ido, y a cada jugador le manda SÓLO su mano + lo público.
 *   anfitrión -> jugador  { t:'st', sid, you, hand, pub, seats, left, ... }  (su vista)
 *                         { t:'err', err, x }   jugada no válida (sólo a quien la hizo)
 *                         { t:'end', why }      se vuelve a la sala
 *                         { t:'busy' }          hay una partida y no tienes plaza
 *   jugador -> anfitrión  { t:'act', sid, a }   a = { type:'play', cards } | { type:'pass' }
 *                         { t:'hello' }         "estoy aquí": al volver a la sala (recarga,
 *                                               red caída) el anfitrión le devuelve su plaza
 *                         { t:'quit', sid }     deja la mesa (juega la CPU por él)
 *   Lo que difunde el anfitrión también se aplica en su propia pantalla (KNOWN-FAILURES 29).
 *
 * Desconexiones: si un jugador se va (cierra, recarga, pierde la red) su plaza la juega la
 * CPU y sus cartas se le guardan; si vuelve a entrar en la sala con la misma cuenta, el
 * anfitrión se la devuelve (mano + estado completo) y su pantalla salta a la mesa.
 * Si el que se va es el anfitrión, la sala se cierra (como en el cooperativo): la partida
 * termina para todos (no se puede retomar: el estado sólo lo tenía él).
 */
G.Party = (() => {
  const games = [];
  const REJOIN = 'ps.party.rejoin', REJOIN_TTL = 20 * 60 * 1000;
  const MAX_SEATS = 4;
  const CPU_DEX = [25, 133, 39, 52, 54, 143, 7, 175, 172, 151, 197, 196, 470, 471];

  function register(def) { if (!games.some(g => g.id === def.id)) games.push(def); }
  const game = id => games.find(g => g.id === id && !g.soon) || null;

  // ---------------- registro de juegos ----------------
  const B = () => G.BigTwo;
  register({
    id: 'bigtwo', name: 'Big Two', minPlayers: 2, maxPlayers: 4, turnMs: 60000,
    desc: 'El clásico de cartas: echa sueltas, parejas o jugadas de 5 y quédate sin cartas el primero.',
    newRound: n => B().newRound(n),
    act: (st, seat, a) => B().act(st, seat, a),
    turn: st => (st.over ? -1 : st.turn),
    over: st => st.over,
    cpu: (st, seat) => {
      const opp = st.hands.filter((h, i) => i !== seat).map(h => h.length);
      return B().cpuMove(st.hands[seat], { lead: st.lead, must: st.first ? st.must : -1, oppMin: Math.min(...opp), mine: st.hands[seat].length });
    },
    timeout: (st, seat) => B().timeoutMove(st.hands[seat], st.lead, st.first ? st.must : -1),
    precheck: (v, a) => {
      const p = v.pub;
      if (p.turn !== v.you) return { ok: false, err: 'No es tu turno.' };
      if (a.type === 'pass') return p.lead ? { ok: true } : { ok: false, err: 'Abres tú: no puedes pasar.' };
      return B().check(v.priv.hand, a.cards, p.lead, p.first ? p.must : -1);
    },
    priv: (st, seat) => ({ hand: st.hands[seat].slice() }),
    pub: st => ({ counts: st.hands.map(h => h.length), turn: st.over ? -1 : st.turn, lead: st.lead, passed: st.passed.slice(),
                  first: st.first, must: st.first ? st.must : -1, last: st.last, over: st.over, winner: st.winner }),
    results: st => B().results(st)
  });
  // Cartas de tipos (寶可夢屬性牌, typecards.js, 2026-10-17).
  const T = () => G.TypeCards;
  register({
    id: 'types', name: 'Cartas de tipos', minPlayers: 2, maxPlayers: 4, turnMs: 30000,
    desc: 'Juega cartas del mismo tipo o número; cartas de efecto para fastidiar al siguiente.',
    newRound: n => T().newRound(n),
    act: (st, seat, a) => T().act(st, seat, a),
    turn: st => (st.over ? -1 : st.turn),
    over: st => st.over,
    cpu: (st, seat) => {
      // A veces la CPU pilla primero a quien no avisó de su última carta (luego juega).
      if (st.vuln >= 0 && st.vuln !== seat && !st.called[st.vuln] && st.hands[st.vuln].length === 1 && Math.random() < 0.5) return { type: 'catch' };
      const nx = T().nextSeat(st, seat), pv = T().nextSeat(st, seat, -1);
      return T().cpuMove(st.hands[seat], { top: st.discard[st.discard.length - 1], color: st.color, phase: st.phase, drawn: st.drawn,
        nextCount: st.hands[nx].length, prevCount: st.hands[pv].length, n: st.n });
    },
    timeout: st => T().timeoutMove(st.phase),
    // Si alguien acaba de quedarse con 1 carta sin avisar, la CPU espera un poco: da tiempo a pulsar "¡Última carta!".
    cpuDelay: st => (st.vuln >= 0 ? 1600 : 0),
    precheck: (v, a) => {
      const p = v.pub;
      if (a.type === 'call' || a.type === 'catch') return { ok: true };
      if (p.turn !== v.you) return { ok: false, err: 'No es tu turno.' };
      if (a.type === 'play') {
        if (p.phase === 'pick') return { ok: false, err: 'Primero elige el tipo de la mesa.' };
        if (!v.priv.hand.includes(a.card)) return { ok: false, err: 'Esa carta no es tuya.' };
        if (p.phase === 'drawn' && a.card !== v.priv.drawn) return { ok: false, err: 'Sólo puedes echar la carta que acabas de robar.' };
        if (!T().playable(a.card, p.top, p.color)) return { ok: false, err: 'Esa carta no vale: tiene que ser del mismo tipo o número.' };
      }
      return { ok: true };
    },
    priv: (st, seat) => ({ hand: st.hands[seat].slice(), drawn: st.turn === seat && st.phase === 'drawn' ? st.drawn : -1, called: !!st.called[seat] }),
    pub: st => ({ counts: st.hands.map(h => h.length), turn: st.over ? -1 : st.turn, top: st.discard[st.discard.length - 1],
                  under: st.discard.slice(-4, -1), color: st.color, dir: st.dir, phase: st.phase, deck: st.deck.length,
                  called: st.called.map((c, i) => c && st.hands[i].length === 1), vuln: st.vuln >= 0 && !st.called[st.vuln] && st.hands[st.vuln].length === 1 ? st.vuln : -1,
                  ev: st.ev, moves: st.moves, over: st.over, winner: st.winner }),
    results: st => T().results(st)
  });
  register({ id: 'voltorb', name: 'Voltorb travieso', minPlayers: 2, maxPlayers: 4, soon: true,
             desc: 'Roba cartas y que no te explote el Voltorb.' });
  register({ id: 'tennis', name: 'Tenis Pokémon', minPlayers: 2, maxPlayers: 4, soon: true,
             desc: 'Partidos de tenis con tu Pokémon.' });

  // ---------------- estado ----------------
  let S = null;            // sesión del anfitrión (sólo en el anfitrión)
  let V = null;            // última vista recibida (todos, también el anfitrión)
  let active = false;      // la mesa está abierta
  let leftSid = null;      // dejaste esa mesa a propósito: no se vuelve sola
  let helloAt = 0;
  const totalsKeep = { room: null, game: null, map: new Map() };   // puntos acumulados mientras la sala sigue junta
  const listeners = new Set();
  const emit = (what, x) => listeners.forEach(fn => { try { fn(what, x); } catch (e) { console.error('[Party]', e); } });
  const myUid = () => G.Net.uid;
  const amHost = () => !!S;
  const send = (to, m) => G.Net.send(to, Object.assign({ k: 'pty' }, m));
  const toHost = m => G.Net.toHost(Object.assign({ k: 'pty' }, m));

  // ---------------- anfitrión ----------------

  /**
   * Empieza una partida (anfitrión).
   * cfg = { game, members:[{uid,name,dex,shiny}], cpu: n, roomId }
   */
  function hostStart(cfg) {
    const def = game(cfg.game);
    if (!def) return { ok: false, error: 'Ese juego aún no está disponible.' };
    const humans = (cfg.members || []).slice(0, MAX_SEATS);
    const nCpu = Math.max(0, Math.min(MAX_SEATS - humans.length, cfg.cpu | 0));
    const n = humans.length + nCpu;
    if (n < def.minPlayers || n > def.maxPlayers) return { ok: false, error: 'Hacen falta entre {x} jugadores.', x: def.minPlayers + '-' + def.maxPlayers };
    stopTimers();
    const used = new Set(humans.map(m => m.dex));
    const seats = humans.map(m => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: !!m.shiny, cpu: false, gone: false, afk: false, afkN: 0 }));
    for (let i = 0; i < nCpu; i++) {
      const dex = CPU_DEX.find(d => !used.has(d) && G.SPRITE_META && G.SPRITE_META[d]) || 25;
      used.add(dex);
      seats.push({ uid: null, name: 'CPU ' + (i + 1), dex, shiny: false, cpu: true, gone: false, afk: false, afkN: 0 });
    }
    // Puntos acumulados: se siguen sumando mientras sea la misma sala y el mismo juego.
    if (totalsKeep.room !== (cfg.roomId || null) || totalsKeep.game !== def.id) { totalsKeep.room = cfg.roomId || null; totalsKeep.game = def.id; totalsKeep.map.clear(); }
    S = { sid: Math.random().toString(36).slice(2, 10), def, seats, st: null, round: 0, timer: 0, deadline: 0, note: null, noteSeq: 0, roomId: cfg.roomId || null };
    leftSid = null;
    newRound();
    return { ok: true };
  }

  const keyOf = (s, i) => s.uid || 'cpu' + i;
  const totalOf = i => totalsKeep.map.get(keyOf(S.seats[i], i)) || 0;

  function newRound() {
    S.round++;
    S.st = S.def.newRound(S.seats.length);
    S.scored = false;
    step();
  }

  function stopTimers() { if (S) { clearTimeout(S.timer); S.timer = 0; } }

  /** Tras cada cambio: programa el siguiente turno y manda las vistas. */
  function step() {
    stopTimers();
    const def = S.def, st = S.st;
    if (def.over(st)) {
      if (!S.scored) {
        S.scored = true;
        for (const r of def.results(st)) { const k = keyOf(S.seats[r.seat], r.seat); totalsKeep.map.set(k, (totalsKeep.map.get(k) || 0) + r.pts); }
      }
      S.deadline = 0;
    } else {
      const seat = def.turn(st), s = S.seats[seat];
      const sid = S.sid, moves = st.moves;
      const still = () => S && S.sid === sid && S.st === st && st.moves === moves;
      if (s.cpu || s.gone || s.afk) {
        S.deadline = 0;
        S.timer = setTimeout(() => { if (still()) apply(seat, def.cpu(st, seat), true); }, 600 + Math.random() * 600 + (def.cpuDelay ? def.cpuDelay(st) : 0));
      } else {
        S.deadline = Date.now() + def.turnMs;
        S.timer = setTimeout(() => {
          if (!still()) return;
          s.afkN++;
          if (s.afkN >= 2 && !s.afk) { s.afk = true; note('{x} no responde: juega la CPU por ahora.', s.name); }
          apply(seat, def.timeout(st, seat), true);
        }, def.turnMs);
      }
    }
    pushAll();
  }

  /** Aplica una jugada del asiento (validada por las reglas). */
  function apply(seat, a, auto) {
    if (!S || S.def.over(S.st)) return { ok: false, err: 'La ronda ya ha terminado.' };
    const r = S.def.act(S.st, seat, a);
    if (!r.ok) return r;
    const s = S.seats[seat];
    if (!auto) { s.afkN = 0; if (s.afk) { s.afk = false; note('{x} ha vuelto a la mesa.', s.name); } }
    step();
    return r;
  }

  function note(txt, x) { if (S) S.note = { txt, x: x || '', seq: ++S.noteSeq }; }

  function viewFor(i) {
    const def = S.def, st = S.st, over = def.over(st);
    return {
      k: 'pty', t: 'st', sid: S.sid, game: def.id, you: i, round: S.round, host: myUid(),
      priv: def.priv(st, i), pub: def.pub(st),
      seats: S.seats.map((s, j) => ({ name: s.name, dex: s.dex, shiny: s.shiny, cpu: s.cpu, gone: s.gone, afk: s.afk, total: totalOf(j), me: j === i })),
      left: S.deadline ? Math.max(0, S.deadline - Date.now()) : 0, turnMs: def.turnMs,
      res: over ? def.results(st) : null, note: S.note
    };
  }

  /** A cada jugador, su vista (con SU mano y nada más); la del anfitrión, aquí mismo. */
  function pushAll() {
    S.seats.forEach((s, i) => {
      if (s.cpu || s.gone || !s.uid) return;
      const v = viewFor(i);
      if (s.uid === myUid()) onView(JSON.parse(JSON.stringify(v)));
      else G.Net.send(s.uid, v);
    });
  }

  const seatOfUid = u => (S ? S.seats.findIndex(s => s.uid === u && !s.cpu) : -1);

  /** Alguien se ha ido de la sala o se ha cortado: su plaza la juega la CPU (se le guardan las cartas). */
  function markGone(u) {
    const i = seatOfUid(u);
    if (i < 0 || S.seats[i].gone || u === myUid()) return;
    S.seats[i].gone = true;
    note('{x} se ha desconectado: juega la CPU por él.', S.seats[i].name);
    step();
  }

  /** Vuelve (o avisa de que sigue aquí): se le devuelve su plaza y todo el estado. */
  function markBack(u) {
    const i = seatOfUid(u);
    if (i < 0) { G.Net.send(u, { k: 'pty', t: 'busy' }); return; }
    const s = S.seats[i];
    if (s.gone || s.afk) note('{x} se ha vuelto a conectar.', s.name);
    s.gone = false; s.afk = false; s.afkN = 0;
    step();
  }

  function onHostMsg(from, m) {
    if (m.t === 'hello') { markBack(from); return; }
    const i = seatOfUid(from);
    if (i < 0 || m.sid !== S.sid) return;
    if (m.t === 'act') {
      const back = S.seats[i].gone;
      if (back) { S.seats[i].gone = false; note('{x} se ha vuelto a conectar.', S.seats[i].name); }
      const r = apply(i, m.a, false);
      if (!r.ok) { G.Net.send(from, { k: 'pty', t: 'err', err: r.err, x: r.x || '' }); if (back) step(); }
    } else if (m.t === 'quit') {
      S.seats[i].gone = true;
      note('{x} ha dejado la mesa: juega la CPU por él.', S.seats[i].name);
      step();
    }
  }

  /** Anfitrión: otra ronda con los mismos (los puntos se acumulan). */
  function again() { if (S && S.def.over(S.st)) newRound(); }

  /** Anfitrión: todos vuelven a la sala. */
  function endAll(why = 'room') {
    if (!S) return;
    stopTimers();
    // A todos los de la sala (también a quien dejó la mesa o no tenía plaza, para que no se quede esperando).
    G.Net.broadcast({ k: 'pty', t: 'end', why, sid: S.sid });
    S = null;
    closeLocal(why);
  }

  // ---------------- todos ----------------

  function onView(v) {
    if (v.sid === leftSid) return;
    const fresh = !V || V.sid !== v.sid;
    const prevNote = V && V.note ? V.note.seq : 0;
    V = v;
    if (v.note && v.note.seq !== prevNote && (!fresh || amHost())) G.UI.toast(G.I18n.f(v.note.txt, v.note.x), 2600);
    V.at = Date.now();
    if (!amHost()) saveRejoin();
    if (!active) { active = true; emit('open', V); }
    emit('view', V);
  }

  function closeLocal(why) {
    const was = active;
    active = false; V = null;
    clearRejoin();
    if (was) emit('close', why);
  }

  /** Jugada del jugador de esta pantalla. Devuelve { ok, err } (también comprueba antes de enviar). */
  function act(a) {
    if (!V) return { ok: false, err: 'No hay partida.' };
    if (amHost()) {
      const r = apply(V.you, a, false);
      return r;
    }
    const def = game(V.game);
    if (def && def.precheck) { const r = def.precheck(V, a); if (!r.ok) return r; }
    toHost({ t: 'act', sid: V.sid, a });
    return { ok: true, sent: true };
  }

  /** Dejar la mesa. El anfitrión termina la partida para todos; un invitado deja su plaza a la CPU. */
  function leave() {
    if (amHost()) { endAll('room'); return; }
    if (V) { toHost({ t: 'quit', sid: V.sid }); leftSid = V.sid; }
    closeLocal('quit');
  }

  /** "Estoy aquí": pide al anfitrión tu plaza (al volver a la sala). */
  function hello(force) {
    if (amHost() || active) return;
    if (!force && Date.now() - helloAt < 3000) return;
    helloAt = Date.now();
    if (force) leftSid = null;
    toHost({ t: 'hello' });
  }

  // Volver solo tras recargar la página (el código de la sala, unos minutos).
  function saveRejoin() {
    const r = G.Social && G.Social.room;
    if (!r) return;
    try { localStorage.setItem(REJOIN, JSON.stringify({ code: r.id, at: Date.now() })); } catch (e) { /* nada */ }
  }
  function clearRejoin() { try { localStorage.removeItem(REJOIN); } catch (e) { /* nada */ } }
  /** Código de la sala donde estabas jugando (si recargaste hace poco), o null. */
  function rejoinCode() {
    try {
      const j = JSON.parse(localStorage.getItem(REJOIN) || 'null');
      if (j && j.code && Date.now() - j.at < REJOIN_TTL) return j.code;
    } catch (e) { /* nada */ }
    return null;
  }

  // ---------------- red ----------------

  G.Net.on((from, m) => {
    if (!m || m.k !== 'pty') return;
    if (amHost()) { onHostMsg(from, m); return; }
    if (from !== G.Net.hostUid) return;
    if (m.t === 'st') onView(m);
    else if (m.t === 'err') emit('err', m);
    else if (m.t === 'end') {
      if (m.sid && m.sid === leftSid) { leftSid = null; emit('ended'); }
      if (V && (!m.sid || m.sid === V.sid)) closeLocal(m.why || 'room');
    }
    else if (m.t === 'busy') { if (!active) emit('busy'); }
  });

  G.Net.onPeer((u, mode) => {
    const lost = mode === 'closed' || mode === 'failed';
    if (amHost()) { if (lost) markGone(u); return; }
    if (u !== G.Net.hostUid) return;
    if (lost && active) closeLocal('host');
    else if (!lost && mode !== 'connecting') autoHello();
  });

  function autoHello() {
    const r = G.Social && G.Social.room;
    if (r && !r.isHost && r.mode === 'party' && !active && !leftSid) hello();
  }

  function initSocial() {
    if (!G.Social || !G.Social.on) return;
    G.Social.on(what => {
      const r = G.Social.room;
      if (what === 'room-closed' || (!r && (active || S))) {
        if (S) { stopTimers(); S = null; }
        if (active) closeLocal('closed');
        return;
      }
      if (!r) return;
      // Anfitrión: quien ya no está en la sala, se ha ido.
      if (S && r.isHost) for (const s of S.seats) if (s.uid && !s.cpu && !s.gone && s.uid !== myUid() && !r.members.some(m => m.uid === s.uid)) markGone(s.uid);
      if (!r.isHost) autoHello();
    });
  }
  // social.js se carga antes; se engancha ya.
  initSocial();

  return {
    register, games: () => games.slice(), game, hostStart, again, endAll, act, leave, hello, rejoinCode,
    on(fn) { listeners.add(fn); }, off(fn) { listeners.delete(fn); },
    get view() { return V; }, get active() { return active; }, get isHost() { return amHost(); },
    get left() { return leftSid; }, MAX_SEATS,
    /** Para pruebas: lo que sabe el anfitrión. */
    _host: () => S
  };
})();
