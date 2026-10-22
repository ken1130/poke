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
  ok(st.hands[1].length === 2 && st.turn === 1 && st.pend === 2 && st.pendK === 'd2', '+2: queda pendiente y le toca al siguiente');
  ok(!T.act(st, 1, { type: 'play', card: id(ELEC, 2) }).ok, 'con +2 pendiente no vale una carta normal');
  ok(T.act(st, 1, { type: 'draw' }).ok && st.hands[1].length === 4 && st.turn === 2 && st.pend === 0, '+2: roba 2 y pierde el turno');
  ok(st.ev.some(e => e.k === 'draw' && e.seat === 1 && e.n === 2 && e.stack === 2), 'suceso de robo acumulado');
}
// --- Acumular +2 / +4 (2026-10-22) ---
{
  const h0 = [id(FIRE, T.DRAW2), id(FIRE, 1)], h1 = [id(WATER, T.DRAW2), id(WATER, 1), id(WATER, 2)], h2 = [W4(), id(ELEC, 5), id(ELEC, 6)], h3 = [id(GRASS, 1), id(GRASS, 2)];
  const st = table([h0, h1, h2, h3], id(FIRE, 8), FIRE);
  T.act(st, 0, { type: 'play', card: id(FIRE, T.DRAW2) });
  ok(T.legal(st, 1).join() === String(id(WATER, T.DRAW2)), '+2 pendiente: sólo vale otro +2 (de cualquier tipo)');
  ok(T.act(st, 1, { type: 'play', card: id(WATER, T.DRAW2) }).ok && st.pend === 4 && st.turn === 2 && st.hands[1].length === 2, '+2 sobre +2: suma 4');
  ok(!T.act(st, 2, { type: 'play', card: W4() }).ok, '+4 acumulado sin tipo no vale');
  ok(T.act(st, 2, { type: 'play', card: W4(), color: GRASS }).ok && st.pend === 8 && st.pendK === 'd4' && st.color === GRASS && st.turn === 3, '+4 sobre +2: suma 8');
  ok(T.act(st, 3, { type: 'draw' }).ok && st.hands[3].length === 10 && st.pend === 0 && st.turn === 0, 'quien no puede acumular roba todo (8) y pierde el turno');
  ok(T.act(st, 0, { type: 'play', card: id(FIRE, 1) }).ok === false && T.act(st, 0, { type: 'draw' }).ok, 'después se sigue con el tipo elegido');
  // +2 sobre +4: NO vale.
  const s2 = table([[W4(), id(FIRE, 1), id(FIRE, 3)], [id(GRASS, T.DRAW2), W4(1), id(WATER, 4)], [id(ELEC, 2), id(ELEC, 3)]], id(FIRE, 8), FIRE);
  T.act(s2, 0, { type: 'play', card: W4(), color: GRASS });
  ok(s2.pend === 4 && s2.pendK === 'd4' && s2.hands[1].length === 3, '+4: queda pendiente');
  const r = T.act(s2, 1, { type: 'play', card: id(GRASS, T.DRAW2) });
  ok(!r.ok && /\+4/.test(r.err), '+2 sobre +4 no vale (' + r.err + ')');
  ok(T.legal(s2, 1).join() === String(W4(1)), '+4 pendiente: sólo otro +4');
  ok(T.act(s2, 1, { type: 'play', card: W4(1), color: WATER }).ok && s2.pend === 8 && s2.turn === 2, '+4 sobre +4: suma 8');
  // Se acaba el tiempo con robo pendiente: roba todo.
  const tm = T.timeoutMove(s2.phase);
  ok(T.act(s2, 2, tm).ok && s2.hands[2].length === 10 && s2.pend === 0 && s2.turn === 0, 'tiempo agotado: roba lo acumulado');
  // CPU: acumula si puede (+2 antes que +4); si no, roba.
  const ctx = { top: id(FIRE, T.DRAW2), color: FIRE, phase: 'play', drawn: -1, nextCount: 6, prevCount: 6, n: 3, pend: 2, pendK: 'd2' };
  ok(T.cpuMove([id(WATER, T.DRAW2), W4(), id(FIRE, 3)], ctx).card === id(WATER, T.DRAW2), 'CPU: +2 sobre +2');
  const m4 = T.cpuMove([W4(), id(FIRE, 3), id(WATER, 3), id(WATER, 4)], ctx);
  ok(m4.card === W4() && m4.color === WATER, 'CPU: +4 sobre +2 (tipo que más tiene)');
  ok(T.cpuMove([id(FIRE, 3), id(FIRE, 5)], ctx).type === 'draw', 'CPU: sin +2/+4 roba lo acumulado');
  ok(T.cpuMove([id(WATER, T.DRAW2), id(FIRE, 3)], Object.assign({}, ctx, { pendK: 'd4', pend: 4 })).type === 'draw', 'CPU: no echa +2 sobre +4');
  // Vista del jugador (legalView) igual que el anfitrión.
  ok(T.legalView([id(WATER, T.DRAW2), W4(), id(FIRE, 3)], { top: id(FIRE, T.DRAW2), color: FIRE, phase: 'play', pend: 2, pendK: 'd2' }, -1).length === 2, 'legalView con +2 pendiente');
}
// --- Avisar antes (2026-10-22): con 2 cartas, también fuera de tu turno ---
{
  const st = table([[id(FIRE, 3), id(FIRE, 4)], [id(FIRE, 1), id(FIRE, 2)], [id(WATER, 3), id(WATER, 4), id(WATER, 5)]], id(FIRE, 8), FIRE, 2);
  ok(T.act(st, 0, { type: 'call' }).ok && st.called[0] && st.lastCall.seat === 0, 'con 2 cartas, fuera de turno: puede avisar');
  ok(!T.act(st, 2, { type: 'call' }).ok, 'con 3 cartas no');
  st.turn = 0;
  ok(T.act(st, 0, { type: 'play', card: id(FIRE, 3) }).ok && st.hands[0].length === 1 && st.called[0] && st.vuln === -1, 'avisó antes: al quedarse con 1 no se le puede pillar');
  ok(!T.act(st, 1, { type: 'catch' }).ok, 'nadie a quien pillar');
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
  ok(T.act(st, 1, { type: 'draw' }).ok && st.hands[1].length === 6 && st.turn === 2 && st.color === WATER, '+4: roba 4, pierde turno, tipo elegido');
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
  let done = 0, maxMoves = 0, bad = 0, pens = 0, penEv = 0, stacks = 0, bigDraw = 0;
  for (let g = 0; g < 400; g++) {
    const rng = rngOf(1000 + g), np = 2 + (g % 3);
    const st = T.newRound(np, rng);
    let guard = 0;
    while (!st.over && guard++ < 5000) {
      const seat = st.turn, nx = T.nextSeat(st, seat), pv = T.nextSeat(st, seat, -1);
      let a = T.cpuMove(st.hands[seat], { top: st.discard[st.discard.length - 1], color: st.color, phase: st.phase, drawn: st.drawn,
        nextCount: st.hands[nx].length, prevCount: st.hands[pv].length, n: st.n, pend: st.pend, pendK: st.pendK });
      if (st.pend > 0 && a.type === 'play') stacks++;
      if (g % 5 === 0 && seat === 0 && a.call) { delete a.call; pens++; }   // el asiento 0 "se olvida" de avisar, para probar el castigo
      const r = T.act(st, seat, a);
      if (!r.ok) { bad++; break; }
      penEv += st.ev.filter(e => e.k === 'pen').length;
      if (st.ev.some(e => e.k === 'draw' && e.stack >= 4)) bigDraw++;
      const total = st.hands.flat().length + st.deck.length + st.discard.length;
      if (total !== 108) { bad++; break; }
    }
    if (st.over) { done++; maxMoves = Math.max(maxMoves, st.moves); const res = T.results(st); if (res[0].seat !== st.winner) bad++; }
  }
  ok(done === 400, 'las 400 partidas de CPU terminan (' + done + ')');
  ok(bad === 0, 'sin jugadas rechazadas ni cartas perdidas (' + bad + ')');
  ok(penEv > 0, 'hubo castigos por no avisar (' + penEv + ')');
  ok(stacks > 20 && bigDraw > 10, 'las CPU acumulan +2/+4 y alguien roba 4 o más acumulados (' + stacks + ' / ' + bigDraw + ')');
  console.log('partidas CPU:', done, '· jugadas máx.', maxMoves, '· olvidos', pens, '· castigos', penEv, '· acumulados', stacks, '· robos ≥4', bigDraw);
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
// ======================= 2 contra 2 (2026-10-17) =======================
const TEAMS = [0, 1, 0, 1];
{
  const st = T.newRound(4, rngOf(5), { teams: TEAMS });
  ok(JSON.stringify(st.teams) === '[0,1,0,1]', '2v2: el estado guarda los equipos');
  ok(T.newRound(4, rngOf(5)).teams === null && T.newRound(3, rngOf(5), { teams: TEAMS }).teams === null, '2v2: sin equipos (o con otro número) = todos contra todos');
  // Gana el equipo: el asiento 2 echa su última carta; puntos = manos de los rivales (1 y 3), para 0 y 2.
  const h1 = [id(WATER, 9), id(GRASS, T.SKIP)], h3 = [W(), id(ELEC, 4)], h0 = [id(GRASS, 7), id(WATER, 2), id(ELEC, 1)];
  const t = table([h0, h1, [id(FIRE, 3)], h3], id(FIRE, 8), FIRE, 2, { teams: TEAMS.slice(), lastCol: [-1, -1, -1, -1] });
  ok(T.act(t, 2, { type: 'play', card: id(FIRE, 3) }).ok && t.over && t.winner === 2 && t.winTeam === 0, '2v2: al quedarse sin cartas gana su equipo');
  const res = T.results(t), opp = 9 + 20 + 50 + 4;
  const r = s => res.find(x => x.seat === s);
  ok(r(0).pts === opp && r(2).pts === opp, '2v2: los dos ganadores se llevan las manos de los rivales (' + r(0).pts + '/' + r(2).pts + ', esperado ' + opp + ')');
  ok(r(1).pts === 0 && r(3).pts === 0, '2v2: los rivales, 0');
  ok(r(0).place === 1 && r(2).place === 1 && r(1).place === 2 && r(3).place === 2, '2v2: puesto 1 el equipo ganador, 2 el otro');
  ok(res[0].seat === 2 && res[1].seat === 0 && res.every(x => x.team === TEAMS[x.seat]) && r(0).win && !r(1).win, '2v2: el que acabó primero, luego su compañero; filas con team/win');
  // La mano del compañero no cuenta.
  ok(r(0).val === T.points(id(GRASS, 7)) + 2 + 1 && r(0).pts === opp, '2v2: la mano del compañero no suma');
}
{
  // No se pilla al compañero.
  const t = table([[id(FIRE, 3), id(FIRE, 4)], [id(FIRE, 1), id(FIRE, 2)], [id(WATER, 3), id(WATER, 4)], [id(GRASS, 3), id(GRASS, 4)]], id(FIRE, 8), FIRE, 1, { teams: TEAMS.slice() });
  T.act(t, 1, { type: 'play', card: id(FIRE, 1) });
  ok(t.vuln === 1, '2v2: el asiento 1 se queda con 1 sin avisar');
  const bad = T.act(t, 3, { type: 'catch' });
  ok(!bad.ok && /compañero/.test(bad.err) && t.hands[1].length === 1, '2v2: el compañero no puede pillar');
  ok(T.act(t, 2, { type: 'catch' }).ok && t.hands[1].length === 3, '2v2: un rival sí puede pillar');
}
{
  // CPU con equipos: la siguiente siempre es rival; con compañero casi sin cartas, prefiere saltar.
  const ctx = { top: id(FIRE, 8), color: FIRE, phase: 'play', drawn: -1, nextCount: 6, prevCount: 6, n: 4 };
  const hand = [id(WATER, 8), id(WATER, 3), id(WATER, 4), id(FIRE, T.SKIP)];
  const solo = T.cpuMove(hand, ctx), duo = T.cpuMove(hand, Object.assign({ duo: true, mateCount: 1, mateColor: -1 }, ctx));
  ok(solo.card === id(WATER, 8) && duo.card === id(FIRE, T.SKIP), '2v2: con el compañero a 1 carta, la CPU salta al rival (' + solo.card + ' / ' + duo.card + ')');
  const d3 = T.cpuMove([id(FIRE, 9), id(FIRE, T.DRAW2), id(WATER, 3), id(GRASS, 4)], Object.assign({}, ctx, { nextCount: 3, duo: true, mateCount: 6 }));
  ok(d3.card === id(FIRE, T.DRAW2), '2v2: rival siguiente con 3 cartas: +2');
  const wc = T.cpuMove([W(), id(WATER, 3), id(GRASS, 4)], Object.assign({}, ctx, { top: id(ELEC, 8), color: ELEC, duo: true, mateCount: 5, mateColor: GRASS }));
  ok(wc.card === W() && wc.color === GRASS, '2v2: comodín casi empatado: el tipo del compañero');
  ok(JSON.stringify(T.teamCtx({ teams: TEAMS, hands: [[1], [2, 3], [4, 5, 6], [7]], lastCol: [0, 1, 2, 3] }, 0)) === '{"duo":true,"mateCount":3,"mateColor":2}', '2v2: teamCtx');
  ok(JSON.stringify(T.teamCtx({ teams: null }, 0)) === '{}', 'sin equipos: teamCtx vacío');
}
{
  // 300+ partidas 2v2 sólo de CPU: terminan, sin cartas perdidas, puntos bien repartidos.
  let done = 0, bad = 0, pens = 0, wins = [0, 0];
  for (let g = 0; g < 360; g++) {
    const rng = rngOf(5000 + g);
    const st = T.newRound(4, rng, { teams: TEAMS });
    let guard = 0;
    while (!st.over && guard++ < 6000) {
      const seat = st.turn, nx = T.nextSeat(st, seat), pv = T.nextSeat(st, seat, -1);
      if (guard === 5999) console.log('2v2 sin acabar', g, st.hands.map(h => h.length).join('/'), 'mazo', st.deck.length, 'desc', st.discard.length);
      if (st.teams[nx] === st.teams[seat] || st.teams[pv] === st.teams[seat]) { bad++; break; }   // compañeros enfrente
      const a = T.cpuMove(st.hands[seat], Object.assign({ top: st.discard[st.discard.length - 1], color: st.color, phase: st.phase, drawn: st.drawn,
        nextCount: st.hands[nx].length, prevCount: st.hands[pv].length, n: st.n, pend: st.pend, pendK: st.pendK }, T.teamCtx(st, seat)));
      if (g % 6 === 0 && seat === 1 && a.call) delete a.call;   // el asiento 1 "se olvida" de avisar
      const r = T.act(st, seat, a);
      if (!r.ok) { bad++; break; }
      // De vez en cuando alguien intenta pillar: el compañero nunca puede.
      if (st.vuln >= 0) {
        const v = st.vuln, mate = (v + 2) % 4, foe = (v + 1) % 4;
        if (T.act(st, mate, { type: 'catch' }).ok) { bad++; break; }
        if (rng() < 0.5 && T.act(st, foe, { type: 'catch' }).ok) pens++;
      }
      if (st.hands.flat().length + st.deck.length + st.discard.length !== 108) { bad++; break; }
    }
    if (!st.over) continue;
    done++;
    wins[st.winTeam]++;
    const res = T.results(st), w = res.filter(x => x.win), l = res.filter(x => !x.win);
    const want = l.reduce((s, x) => s + x.val, 0);
    if (w.length !== 2 || l.length !== 2 || w.some(x => x.pts !== want || x.place !== 1 || x.team !== st.winTeam) || l.some(x => x.pts || x.place !== 2)) bad++;
    if (st.teams[st.winner] !== st.winTeam || st.hands[st.winner].length) bad++;
  }
  ok(done === 360, '2v2: las 360 partidas de CPU terminan (' + done + ')');
  ok(bad === 0, '2v2: sin jugadas rechazadas, cartas perdidas, pillar al compañero ni puntos mal (' + bad + ')');
  // (2026-10-19: antes «> 20»; salen ~20-30 por azar y a veces justo 20: falso fallo. Sólo se mira que las haya.)
  ok(pens > 8 && wins[0] > 60 && wins[1] > 60, '2v2: hay pilladas y ganan los dos equipos (' + pens + ', ' + wins.join('/') + ')');
  console.log('2v2 partidas CPU:', done, '· gana azul/rojo', wins.join('/'), '· pilladas', pens);
}
{
  // Registro de party.js: react no hace pillar al compañero; precheck; hostStart reparte A,B,A,B.
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const noop = () => {};
  const Gx = { TypeCards: T, BigTwo: require('../../js/systems/party/bigtwo.js'), Voltorb: require('../../js/systems/party/voltorb.js'),
               Net: { on: noop, onPeer: noop, send: noop, toHost: noop, broadcast: noop, uid: 'H' }, UI: { toast: noop } };
  const sandbox = { G: Gx, console, setTimeout, clearTimeout, Math, Date, JSON, localStorage: { getItem: () => null, setItem: noop, removeItem: noop } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/systems/party/party.js'), 'utf8'), sandbox);
  const P = Gx.Party, def = P.game('types');
  ok(def.teams === true && P.game('voltorb').teams === true && !P.game('bigtwo').teams, '2v2: registro (types y voltorb sí, Big Two no)');
  const cpus = [{ cpu: true }, { cpu: true }, { cpu: true }, { cpu: true }];
  let mateCatch = 0, foeCatch = 0;
  for (let i = 0; i < 1500; i++) {
    const t = table([[id(FIRE, 3), id(FIRE, 4)], [id(FIRE, 1), id(FIRE, 2)], [id(WATER, 3), id(WATER, 4)], [id(GRASS, 3), id(GRASS, 4)]], id(FIRE, 8), FIRE, 1, { teams: TEAMS.slice() });
    T.act(t, 1, { type: 'play', card: id(FIRE, 1) });
    for (const x of def.react(t, cpus) || []) if (x.a.type === 'catch') { if (x.seat === 3) mateCatch++; else foeCatch++; }
  }
  ok(mateCatch === 0 && foeCatch > 150, '2v2: la CPU nunca pilla a su compañero (' + mateCatch + ' / rivales ' + foeCatch + ')');
  const view = { you: 3, teams: TEAMS, pub: { vuln: 1, turn: 2 }, priv: { hand: [] } };
  ok(!def.precheck(view, { type: 'catch' }).ok && def.precheck(Object.assign({}, view, { you: 0 }), { type: 'catch' }).ok, '2v2: precheck no deja pillar al compañero');
  ok(def.precheck(Object.assign({}, view, { teams: null }), { type: 'catch' }).ok, 'sin equipos: precheck como antes');
  // Reparto: plaza 0 con 1 + mix % 3.
  ok(JSON.stringify(P.teamSlots(0)) === '[0,0,1,1]' && JSON.stringify(P.teamSlots(1)) === '[0,1,0,1]' && JSON.stringify(P.teamSlots(2)) === '[0,1,1,0]', '2v2: teamSlots');
  for (let mix = 0; mix < 3; mix++) {
    const o = P.seatOrder(mix), ts = P.teamSlots(mix);
    ok(o.slice().sort().join() === '0,1,2,3' && o.map(k => ts[k]).join() === '0,1,0,1', '2v2: seatOrder alterna equipos (mix ' + mix + ')');
  }
  const mem = [{ uid: 'H', name: 'Ken', dex: 25 }, { uid: 'A', name: 'Peter', dex: 4 }];
  ok(P.hostStart({ game: 'types', members: mem, cpu: 2, teams: true, mix: 0 }).ok, '2v2: hostStart');
  let S = P._host();
  ok(JSON.stringify(S.teams) === '[0,1,0,1]' && JSON.stringify(S.st.teams) === '[0,1,0,1]', '2v2: la mesa y la ronda tienen equipos');
  ok(S.seats[0].uid === 'H' && S.seats[2].uid === 'A' && S.seats[1].cpu && S.seats[3].cpu, '2v2 mix 0: Ken y Peter enfrente');
  ok(P.view && JSON.stringify(P.view.teams) === '[0,1,0,1]', '2v2: la vista lleva los equipos');
  P.endAll();
  P.hostStart({ game: 'types', members: mem, cpu: 2, teams: true, mix: 1 });
  S = P._host();
  ok(S.seats[0].uid === 'H' && S.seats[1].uid === 'A' && S.seats[2].cpu, '2v2 mix 1: Peter es rival');
  P.endAll();
  P.hostStart({ game: 'types', members: mem, cpu: 1, teams: true, mix: 0 });
  S = P._host();
  ok(S.teams === null && S.st.teams === null && P.view.teams === null && S.seats.map(s => s.uid || 'cpu').join() === 'H,A,cpu', '2v2 con 3 en la mesa: todos contra todos');
  P.endAll();
  P.hostStart({ game: 'bigtwo', members: mem, cpu: 2, teams: true, mix: 1 });
  S = P._host();
  ok(S.teams === null && S.seats.map(s => s.uid || 'cpu').join() === 'H,A,cpu,cpu', 'Big Two no tiene 2v2: orden de siempre');
  P.endAll();
  // Asientos elegidos en la sala (2026-10-19): cada uno donde quiere; 2v2 = asientos 0/2 contra 1/3.
  P.hostStart({ game: 'types', members: mem, cpu: 2, teams: true, mix: 0, seat: { H: 1, A: 3 } });
  S = P._host();
  ok(S.seats.map(s => s.uid || 'cpu').join() === 'cpu,H,cpu,A' && JSON.stringify(S.teams) === '[0,1,0,1]', 'asientos: Ken en el 2 y Peter en el 4, enfrente y del mismo equipo');
  const mv = P.view;
  ok(mv.you === 1 && mv.priv.mate && mv.priv.mate.seat === 3 && mv.priv.mate.hand.join() === S.st.hands[3].join(), '2v2: ves la mano de tu compañero');
  ok(JSON.stringify(mv.pub).indexOf(JSON.stringify(S.st.hands[0])) < 0 || S.st.hands[0].length < 2, '2v2: la vista pública no lleva manos de rivales');
  P.endAll();
  P.hostStart({ game: 'voltorb', members: mem, cpu: 2, teams: true, mix: 0, seat: { H: 0, A: 2 } });
  S = P._host();
  ok(P.view.priv.mate && P.view.priv.mate.seat === 2 && P.view.priv.mate.hand.join() === S.st.hands[2].join(), '2v2 Voltorb: ves la mano de tu compañero');
  P.endAll();
  P.hostStart({ game: 'types', members: mem, cpu: 1, teams: false, seat: { H: 3, A: 0 } });
  S = P._host();
  ok(S.seats.map(s => s.uid || 'cpu').join() === 'A,cpu,H' && !P.view.priv.mate, 'asientos sin equipos (3 en la mesa): sin huecos y sin mano ajena');
  P.endAll();
  P.hostStart({ game: 'types', members: mem, cpu: 2, teams: true, seat: { H: 2, A: 2 } });
  S = P._host();
  ok(S.seats[2].uid === 'H' && S.seats.filter(s => s.uid === 'A').length === 1, 'asiento repetido: el primero se queda, el otro va a uno libre');
  P.endAll();
}
console.log(fails ? `${fails} FALLOS de ${n}` : `OK: ${n} comprobaciones`);
process.exit(fails ? 1 : 0);
