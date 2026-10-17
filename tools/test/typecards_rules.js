// Prueba de las reglas de las Cartas de tipos (寶可夢屬性牌) del modo fiesta: node tools/test/typecards_rules.js
const T = require('../../js/systems/party/typecards.js');
let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FALLO:', msg); } };
const FIRE = 0, WATER = 1, GRASS = 2, ELEC = 3;
// Busca el id de una carta (tipo c, valor v), la k-ésima de esas.
const id = (c, v, k = 0) => { let m = 0; for (let i = 0; i < T.N; i++) if (T.CARDS[i].c === c && T.CARDS[i].v === v && m++ === k) return i; throw new Error('no hay ' + c + '/' + v); };
const W = k => id(4, T.WILD, k), W4 = k => id(4, T.WILD4, k);
// rng con semilla
const rngOf = seed => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
/** Mesa a mano: manos dadas, carta arriba, tipo, turno. El resto de cartas, al mazo. */
function table(hands, top, color, turn = 0, extra = {}) {
  const used = new Set([...hands.flat(), top]);
  const deck = [...Array(T.N).keys()].filter(x => !used.has(x));
  const st = { n: hands.length, hands: hands.map(h => h.slice()), deck, discard: [top], color, dir: 1, turn, phase: 'play', drawn: -1,
               called: hands.map(() => false), vuln: -1, vulnSeq: 0, over: false, winner: -1, moves: 0, tseq: 0, ev: [], start: 0 };
  return Object.assign(st, extra);
}

// --- baraja ---
ok(T.N === 108, 'baraja de 108');
for (let c = 0; c < 4; c++) {
  const of = T.CARDS.filter(x => x.c === c);
  ok(of.length === 25, 'tipo ' + c + ': 25 cartas');
  ok(of.filter(x => x.v === 0).length === 1, 'un 0');
  for (let v = 1; v <= 12; v++) ok(of.filter(x => x.v === v).length === 2, 'dos de ' + v);
}
ok(T.CARDS.filter(x => x.v === T.WILD).length === 4 && T.CARDS.filter(x => x.v === T.WILD4).length === 4, '4 Ditto y 4 Mewtwo');
ok(T.points(id(FIRE, 7)) === 7 && T.points(id(WATER, T.SKIP)) === 20 && T.points(W()) === 50 && T.points(W4()) === 50, 'puntos');

// --- reparto ---
{
  const st = T.newRound(4, rngOf(7));
  ok(st.hands.every(h => h.length === 7), '7 cartas por jugador');
  const all = [...st.hands.flat(), ...st.deck, ...st.discard];
  ok(all.length === 108 && new Set(all).size === 108, 'todas las cartas una vez');
  ok(T.CARDS[st.discard[0]].v !== T.WILD4, 'la primera no es +4');
}

// --- emparejar ---
ok(T.playable(id(FIRE, 3), id(FIRE, 8), FIRE), 'mismo tipo');
ok(T.playable(id(WATER, 8), id(FIRE, 8), FIRE), 'mismo número');
ok(!T.playable(id(WATER, 3), id(FIRE, 8), FIRE), 'ni tipo ni número');
ok(T.playable(id(WATER, T.SKIP), id(FIRE, T.SKIP), FIRE), 'mismo símbolo');
ok(T.playable(W(), id(FIRE, 8), FIRE) && T.playable(W4(), id(FIRE, 8), FIRE), 'comodines siempre');
ok(T.playable(id(GRASS, 5), W(), GRASS) && !T.playable(id(WATER, 5), W(), GRASS), 'sobre comodín cuenta el tipo elegido');

// --- jugada normal y errores ---
{
  const st = table([[id(FIRE, 3), id(WATER, 9), id(GRASS, 1)], [id(ELEC, 2), id(ELEC, 4)]], id(FIRE, 8), FIRE);
  ok(!T.act(st, 1, { type: 'play', card: id(ELEC, 2) }).ok, 'fuera de turno');
  ok(!T.act(st, 0, { type: 'play', card: id(WATER, 9) }).ok, 'no vale');
  ok(!T.act(st, 0, { type: 'play', card: id(ELEC, 2) }).ok, 'carta ajena');
  ok(T.act(st, 0, { type: 'play', card: id(FIRE, 3) }).ok && st.turn === 1 && st.color === FIRE, 'echa y pasa el turno');
}
// --- Somnífero ---
{
  const st = table([[id(FIRE, T.SKIP), 1, 2], [id(ELEC, 2), 3], [id(ELEC, 4), 5]], id(FIRE, 8), FIRE);
  T.act(st, 0, { type: 'play', card: id(FIRE, T.SKIP) });
  ok(st.turn === 2, 'salto: juega el 3º');
}
// --- Ida y vuelta (3 y 2 jugadores) ---
{
  const st = table([[id(FIRE, T.REV), id(FIRE, 1), id(FIRE, 2)], [id(ELEC, 2), 3], [id(ELEC, 4), 5]], id(FIRE, 8), FIRE);
  T.act(st, 0, { type: 'play', card: id(FIRE, T.REV) });
  ok(st.dir === -1 && st.turn === 2, 'sentido al revés: le toca al de antes');
  const s2 = table([[id(FIRE, T.REV), id(FIRE, 1), id(FIRE, 2)], [id(ELEC, 2), id(ELEC, 3)]], id(FIRE, 8), FIRE);
  T.act(s2, 0, { type: 'play', card: id(FIRE, T.REV) });
  ok(s2.turn === 0, 'con 2 jugadores es un salto');
}
// --- Doble golpe ---
{
  const st = table([[id(FIRE, T.DRAW2), id(FIRE, 1), id(FIRE, 2)], [id(ELEC, 2), id(ELEC, 3)], [id(ELEC, 4), id(ELEC, 5)]], id(FIRE, 8), FIRE);
  T.act(st, 0, { type: 'play', card: id(FIRE, T.DRAW2) });
  ok(st.hands[1].length === 4 && st.turn === 2, '+2: roba 2 y pierde el turno');
  // No se acumula: el 3º no puede responder con otro +2 sobre el robo (ya no es su turno el del 2º).
  ok(!T.act(st, 1, { type: 'play', card: id(ELEC, 2) }).ok, 'el castigado no juega');
}
// --- Ditto ---
{
  const st = table([[W(), id(FIRE, 1), id(FIRE, 2)], [id(ELEC, 2), id(ELEC, 3)]], id(FIRE, 8), FIRE);
  ok(!T.act(st, 0, { type: 'play', card: W() }).ok, 'comodín sin tipo no vale');
  ok(!T.act(st, 0, { type: 'play', card: W(), color: 7 }).ok, 'tipo raro no vale');
  ok(T.act(st, 0, { type: 'play', card: W(), color: GRASS }).ok && st.color === GRASS && st.turn === 1, 'Ditto elige tipo');
  ok(!T.act(st, 1, { type: 'play', card: id(ELEC, 2) }).ok, 'tras Ditto vale el tipo elegido');
}
// --- Poder de Mewtwo ---
{
  const st = table([[W4(), id(FIRE, 1), id(FIRE, 2)], [id(ELEC, 2), id(ELEC, 3)], [id(WATER, 2), id(WATER, 3)]], id(FIRE, 8), FIRE);
  ok(T.act(st, 0, { type: 'play', card: W4(), color: WATER }).ok, '+4 aunque tengas del tipo (sin desafío)');
  ok(st.hands[1].length === 6 && st.turn === 2 && st.color === WATER, '+4: roba 4, pierde turno, tipo elegido');
}
// --- primera carta ---
{
  const a = T.newRound(3, rngOf(3), { first: id(FIRE, T.SKIP), start: 0 });
  ok(a.turn === 1 && a.color === FIRE, 'primera Somnífero: salta al primero');
  const b = T.newRound(3, rngOf(3), { first: id(FIRE, T.REV), start: 0 });
  ok(b.dir === -1 && b.turn === 2, 'primera Ida y vuelta: sentido al revés');
  const b2 = T.newRound(2, rngOf(3), { first: id(FIRE, T.REV), start: 0 });
  ok(b2.turn === 1, 'primera Ida y vuelta con 2: salto');
  const c = T.newRound(3, rngOf(3), { first: id(WATER, T.DRAW2), start: 0 });
  ok(c.hands[0].length === 9 && c.turn === 1, 'primera +2: el primero roba 2 y pierde el turno');
  const d = T.newRound(3, rngOf(3), { first: W(), start: 0 });
  ok(d.phase === 'pick' && d.turn === 0 && d.color === -1, 'primera Ditto: el primero elige');
  ok(!T.act(d, 0, { type: 'play', card: d.hands[0][0] }).ok, 'hay que elegir antes');
  ok(T.act(d, 0, { type: 'color', color: ELEC }).ok && d.color === ELEC && d.phase === 'play' && d.turn === 0, 'elige y sigue jugando');
  // +4 de primera: se vuelve a sacar
  let saw = 0;
  for (let s = 1; s < 400; s++) { const r = T.newRound(2, rngOf(s)); ok(T.CARDS[r.discard[0]].v !== T.WILD4, 'nunca +4 arriba'); if (r.discard.length === 1 && r.deck.length + 14 + 1 === 108) saw++; }
  ok(saw > 0, 'cuentas de baraja tras repetir');
}
// --- robar y echar ---
{
  const st = table([[id(WATER, 1), id(WATER, 2)], [id(ELEC, 2), id(ELEC, 3)]], id(FIRE, 8), FIRE);
  st.deck.push(id(FIRE, 5));                  // la siguiente que se roba vale
  const r = T.act(st, 0, { type: 'draw' });
  ok(r.ok && st.phase === 'drawn' && st.drawn === id(FIRE, 5) && st.turn === 0, 'robada que vale: decides');
  ok(!T.act(st, 0, { type: 'play', card: id(WATER, 1) }).ok, 'sólo la robada');
  ok(!T.act(st, 0, { type: 'draw' }).ok, 'no se roba dos veces');
  ok(T.act(st, 0, { type: 'play', card: id(FIRE, 5) }).ok && st.turn === 1, 'echa la robada');
  const s2 = table([[id(WATER, 1), id(WATER, 2)], [id(ELEC, 2), id(ELEC, 3)]], id(FIRE, 8), FIRE);
  s2.deck.push(id(FIRE, 5));
  T.act(s2, 0, { type: 'draw' });
  ok(T.act(s2, 0, { type: 'keep' }).ok && s2.turn === 1 && s2.hands[0].length === 3, 'quedársela');
  const s3 = table([[id(WATER, 1), id(WATER, 2)], [id(ELEC, 2), id(ELEC, 3)]], id(FIRE, 8), FIRE);
  s3.deck.push(id(GRASS, 5));
  T.act(s3, 0, { type: 'draw' });
  ok(s3.turn === 1 && s3.phase === 'play', 'robada que no vale: pasa sola');
  const s4 = table([[id(WATER, 1)], [id(ELEC, 2)]], id(FIRE, 8), FIRE);
  s4.deck.push(id(FIRE, 5));
  T.act(s4, 0, T.timeoutMove('play'));
  ok(s4.turn === 1 && s4.hands[0].length === 2, 'tiempo agotado: roba y pasa');
  // mazo vacío: se baraja el descarte
  const s5 = table([[id(WATER, 1)], [id(ELEC, 2)]], id(FIRE, 8), FIRE);
  s5.discard = [...s5.deck, id(FIRE, 8)]; s5.deck = [];
  T.act(s5, 0, { type: 'draw', pass: true });
  ok(s5.hands[0].length === 2 && s5.discard.length === 1 && s5.discard[0] === id(FIRE, 8), 'mazo vacío: se rebaraja el descarte');
}
// --- ¡Última carta! ---
{
  // Sin avisar y el siguiente juega: roba 2.
  const st = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4), id(FIRE, 5)]], id(FIRE, 8), FIRE);
  T.act(st, 0, { type: 'play', card: id(FIRE, 1) });
  ok(st.vuln === 0, 'queda pendiente de avisar');
  T.act(st, 1, { type: 'play', card: id(FIRE, 3) });
  ok(st.hands[0].length === 3 && st.ev.some(e => e.k === 'pen' && e.seat === 0 && e.by === -1), 'sin avisar: roba 2 al jugar el siguiente');
  // Avisa después de echar: a salvo.
  const s2 = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4), id(FIRE, 5)]], id(FIRE, 8), FIRE);
  T.act(s2, 0, { type: 'play', card: id(FIRE, 1) });
  ok(T.act(s2, 0, { type: 'call' }).ok && s2.vuln === -1, 'avisa');
  T.act(s2, 1, { type: 'play', card: id(FIRE, 3) });
  ok(s2.hands[0].length === 1, 'avisado: no roba');
  ok(!T.act(s2, 1, { type: 'catch' }).ok, 'no se puede pillar a quien avisó');
  // Avisa antes (en su turno con 2).
  const s3 = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4), id(FIRE, 5)]], id(FIRE, 8), FIRE);
  ok(T.act(s3, 0, { type: 'call' }).ok, 'aviso anticipado');
  T.act(s3, 0, { type: 'play', card: id(FIRE, 1) });
  ok(s3.vuln === -1 && s3.called[0], 'aviso anticipado: a salvo');
  ok(!T.act(s3, 1, { type: 'call' }).ok, 'no se avisa con 3 cartas');
  // Te pillan.
  const s4 = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4), id(FIRE, 5)], [id(WATER, 1), id(WATER, 2)]], id(FIRE, 8), FIRE);
  T.act(s4, 0, { type: 'play', card: id(FIRE, 1) });
  ok(!T.act(s4, 0, { type: 'catch' }).ok, 'no te pillas a ti mismo');
  ok(T.act(s4, 2, { type: 'catch' }).ok && s4.hands[0].length === 3 && s4.turn === 1, 'pillado fuera de turno: roba 2, el turno sigue igual');
  ok(s4.ev.some(e => e.k === 'pen' && e.by === 2), 'consta quién pilló');
  ok(!T.act(s4, 2, { type: 'catch' }).ok, 'no se pilla dos veces');
  // Carrera: quien pulsa primero. Aviso antes que «¡Te pillé!» -> a salvo; al revés -> roba 2 y ya no puede avisar.
  const r1 = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4), id(FIRE, 5)]], id(FIRE, 8), FIRE);
  T.act(r1, 0, { type: 'play', card: id(FIRE, 1) });
  ok(T.act(r1, 0, { type: 'call' }).ok && !T.act(r1, 1, { type: 'catch' }).ok && r1.hands[0].length === 1, 'carrera: avisa primero');
  ok(r1.lastCall && r1.lastCall.seat === 0 && r1.lastCall.seq === 1, 'aviso con número (para la voz)');
  const r2 = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4), id(FIRE, 5)]], id(FIRE, 8), FIRE);
  T.act(r2, 0, { type: 'play', card: id(FIRE, 1) });
  ok(T.act(r2, 1, { type: 'catch' }).ok && !T.act(r2, 0, { type: 'call' }).ok && r2.hands[0].length === 3, 'carrera: pillado primero');
  // Se puede pillar fuera de turno aunque aún no le haya tocado a nadie (en cuanto se queda con 1).
  const r3 = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4)], [id(WATER, 3), id(WATER, 4)]], id(FIRE, 8), FIRE);
  T.act(r3, 0, { type: 'play', card: id(FIRE, 1) });
  ok(T.act(r3, 2, { type: 'catch' }).ok, 'pilla quien no tiene el turno');
  // La ventana se cierra cuando el siguiente juega o roba: ya no se puede pillar (y se castiga solo).
  const r4 = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4)], [id(WATER, 3), id(WATER, 4)]], id(FIRE, 8), FIRE);
  T.act(r4, 0, { type: 'play', card: id(FIRE, 1) });
  r4.deck.push(id(GRASS, 6));
  T.act(r4, 1, { type: 'draw' });
  ok(r4.vuln === -1 && r4.hands[0].length === 3, 'el siguiente roba: castigo automático');
  ok(!T.act(r4, 2, { type: 'catch' }).ok, 'ventana cerrada: no se pilla otra vez');
  // Tras robar el castigo no se puede avisar con 3 cartas.
  ok(!T.act(r4, 0, { type: 'call' }).ok, 'con 3 cartas no se avisa');
  // Aviso anticipado: también cuenta para la voz (una vez).
  const r5 = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4)]], id(FIRE, 8), FIRE);
  T.act(r5, 0, { type: 'call' });
  T.act(r5, 0, { type: 'play', card: id(FIRE, 1), call: true });
  ok(r5.callSeq === 1, 'aviso anticipado: una sola voz');
  // La CPU siempre avisa.
  const m = T.cpuMove([id(FIRE, 1), id(WATER, 9)], { top: id(FIRE, 8), color: FIRE, phase: 'play', drawn: -1, nextCount: 5, prevCount: 5, n: 2 });
  ok(m.type === 'play' && m.call === true, 'la CPU avisa');
}
// --- puntos ---
{
  const st = table([[id(FIRE, 1)], [id(WATER, 9), id(WATER, T.SKIP), W()], [id(GRASS, 0), W4(1)]], id(FIRE, 8), FIRE);
  st.called[0] = true;
  T.act(st, 0, { type: 'play', card: id(FIRE, 1) });
  ok(st.over && st.winner === 0, 'gana quien se queda sin cartas');
  const res = T.results(st);
  ok(res[0].seat === 0 && res[0].pts === 9 + 20 + 50 + 0 + 50 && res[0].place === 1, 'puntos del ganador = cartas de los demás');
  ok(res.slice(1).every(r => r.pts === 0), 'los demás 0');
  // La última carta +2 también hace robar (cuenta para los puntos).
  const s2 = table([[id(FIRE, T.DRAW2)], [id(WATER, 9)]], id(FIRE, 8), FIRE);
  s2.called[0] = true;
  T.act(s2, 0, { type: 'play', card: id(FIRE, T.DRAW2) });
  ok(s2.over && s2.hands[1].length === 3, 'acabar con +2: el siguiente roba igual');
}
// --- CPU ---
{
  const ctx = { top: id(FIRE, 8), color: FIRE, phase: 'play', drawn: -1, nextCount: 1, prevCount: 5, n: 3 };
  const m = T.cpuMove([id(FIRE, 2), id(FIRE, T.DRAW2), W(), id(WATER, 3)], ctx);
  ok(m.card === id(FIRE, T.DRAW2), 'al siguiente le queda 1: la CPU le echa +2');
  const m2 = T.cpuMove([id(FIRE, 2), W(), id(WATER, 3), id(WATER, 4)], Object.assign({}, ctx, { nextCount: 6 }));
  ok(m2.card === id(FIRE, 2), 'guarda el comodín');
  const m3 = T.cpuMove([W(), id(WATER, 3), id(WATER, 4), id(GRASS, 1)], Object.assign({}, ctx, { nextCount: 6 }));
  ok(m3.card === W() && m3.color === WATER, 'comodín: elige el tipo que más tiene');
  const m4 = T.cpuMove([id(WATER, 3)], Object.assign({}, ctx, { nextCount: 6 }));
  ok(m4.type === 'draw', 'sin jugada: roba');
}
// --- partidas sólo de CPU ---
{
  let done = 0, maxMoves = 0, bad = 0, pens = 0, penEv = 0;
  for (let g = 0; g < 400; g++) {
    const rng = rngOf(1000 + g), np = 2 + (g % 3);
    const st = T.newRound(np, rng);
    let guard = 0;
    while (!st.over && guard++ < 5000) {
      const seat = st.turn, nx = T.nextSeat(st, seat), pv = T.nextSeat(st, seat, -1);
      let a = T.cpuMove(st.hands[seat], { top: st.discard[st.discard.length - 1], color: st.color, phase: st.phase, drawn: st.drawn,
        nextCount: st.hands[nx].length, prevCount: st.hands[pv].length, n: st.n });
      if (g % 5 === 0 && seat === 0 && a.call) { delete a.call; pens++; }   // el asiento 0 "se olvida" de avisar, para probar el castigo
      const r = T.act(st, seat, a);
      if (!r.ok) { bad++; break; }
      penEv += st.ev.filter(e => e.k === 'pen').length;
      const total = st.hands.flat().length + st.deck.length + st.discard.length;
      if (total !== 108) { bad++; break; }
    }
    if (st.over) { done++; maxMoves = Math.max(maxMoves, st.moves); const res = T.results(st); if (res[0].seat !== st.winner) bad++; }
  }
  ok(done === 400, 'las 400 partidas de CPU terminan (' + done + ')');
  ok(bad === 0, 'sin jugadas rechazadas ni cartas perdidas (' + bad + ')');
  ok(penEv > 0, 'hubo castigos por no avisar (' + penEv + ')');
  console.log('partidas CPU:', done, '· jugadas máx.', maxMoves, '· olvidos', pens, '· castigos', penEv);
}
// --- CPU fuera de turno (registro de party.js): avisa con retraso, a veces se olvida, y pilla a los humanos ---
{
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const noop = () => {};
  const Gx = { TypeCards: T, BigTwo: require('../../js/systems/party/bigtwo.js'), Net: { on: noop, onPeer: noop, send: noop, toHost: noop, broadcast: noop, uid: 'H' } };
  const sandbox = { G: Gx, console, setTimeout, clearTimeout, Math, Date, JSON, localStorage: { getItem: () => null, setItem: noop, removeItem: noop } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/systems/party/party.js'), 'utf8'), sandbox);
  const def = Gx.Party.game('types');
  ok(def && !def.soon && def.turnMs === 30000, 'juego activo en el registro (30 s)');
  const seatsCpu = [{ cpu: false }, { cpu: true }, { cpu: true }];
  let calls = 0, catches = 0, forgot = 0, tries = 0, okDelay = true;
  for (let i = 0; i < 2000; i++) {
    // Una CPU (asiento 1) se queda con 1 carta sin avisar.
    const st = table([[id(FIRE, 3), id(FIRE, 4)], [id(FIRE, 1), id(FIRE, 2)], [id(WATER, 3), id(WATER, 4)]], id(FIRE, 8), FIRE, 1);
    T.act(st, 1, { type: 'play', card: id(FIRE, 1) });
    const plan = def.react(st, seatsCpu) || [];
    const c = plan.find(x => x.a.type === 'call'), k = plan.find(x => x.a.type === 'catch');
    if (c) { calls++; if (c.seat !== 1 || c.delay < 600 || c.delay > 2500) okDelay = false; } else forgot++;
    if (k) { catches++; if (k.seat !== 2 || k.delay < 1500 || k.delay > 3500) okDelay = false; }
    ok(def.react(st, seatsCpu) === plan || JSON.stringify(def.react(st, seatsCpu)) === JSON.stringify(plan), 'el plan se decide una vez');
    // Un humano (asiento 0) se queda con 1 carta: alguna CPU intenta pillarlo.
    const s2 = table([[id(FIRE, 1), id(FIRE, 2)], [id(FIRE, 3), id(FIRE, 4)], [id(WATER, 3), id(WATER, 4)]], id(FIRE, 8), FIRE, 0);
    T.act(s2, 0, { type: 'play', card: id(FIRE, 1) });
    const p2 = def.react(s2, seatsCpu) || [];
    if (p2.some(x => x.a.type === 'catch' && x.seat !== 0 && x.delay >= 1500 && x.delay <= 3500)) tries++;
    if (p2.some(x => x.a.type === 'call')) okDelay = false;
  }
  ok(forgot > 250 && forgot < 550, 'la CPU se olvida ~20 % (' + forgot + '/2000)');
  ok(catches === forgot, 'si se olvida, otra CPU intenta pillarla');
  ok(tries === 2000, 'las CPU siempre intentan pillar al humano que no avisó');
  ok(okDelay, 'retrasos dentro de lo pedido (avisar 0,6-2,5 s; pillar 1,5-3,5 s)');
  ok(def.cpu(table([[id(FIRE, 3)], [id(FIRE, 1), id(FIRE, 2)]], id(FIRE, 8), FIRE, 1), 1).call === undefined, 'la CPU no avisa al echar (lo hace después)');
  ok(def.cpuDelay({ vuln: 1 }) >= 2600, 'la siguiente CPU espera mientras la ventana está abierta');
  console.log('CPU con 1 carta: avisa', calls, '· se olvida', forgot);
}
console.log(fails ? `${fails} FALLOS de ${n}` : `OK: ${n} comprobaciones`);
process.exit(fails ? 1 : 0);
