// Prueba de las reglas de Voltorb travieso (頑皮雷彈) del modo fiesta: node tools/test/voltorb_rules.js
const V = require('../../js/systems/party/voltorb.js');
let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FALLO:', msg); } };
const rngOf = seed => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ids = k => [...Array(V.N).keys()].filter(i => V.kind(i) === k);
const pairIds = p => [...Array(V.N).keys()].filter(i => V.kind(i) === 'pair' && V.CARDS[i].p === p);
const W = V.WIN;
const ATT = ids('attack'), SKP = ids('skip'), SHF = ids('shuffle'), FUT = ids('future'), FAV = ids('favor'), NOP = ids('nope'), DEF = V.DEFUSES, BMB = V.BOMBS;
const allCards = st => [...st.hands.flat(), ...st.deck, ...st.discard, ...(st.bomb ? [st.bomb.card] : [])];   // el Voltorb recién robado está en st.bomb

/** Mesa a mano: manos y mazo dados (deck[0] = arriba). */
function table(hands, deck, turn = 0, extra = {}) {
  const st = V.newRound(hands.length, rngOf(1), { start: turn });
  st.hands = hands.map(h => h.slice()); st.deck = deck.slice(); st.discard = [];
  st.know = hands.map(() => []); st.notes = hands.map(() => []); st.ev = []; st.log = [];
  return Object.assign(st, extra);
}
/** Echa y deja pasar la ventana (nadie anula). */
function playThrough(st, seat, a, t = 1000) {
  const r = V.act(st, seat, Object.assign({ type: 'play' }, a), t);
  if (!r.ok) return r;
  return V.act(st, seat, { type: 'resolve' }, t + W);
}

// --- composición del mazo ---
ok(V.N === 56, '56 cartas en la tabla');
ok(ids('bomb').length === 3 && ids('defuse').length === 7, '3 Voltorb y 7 gomas en la tabla');
ok(ATT.length === 4 && SKP.length === 4 && SHF.length === 4 && FUT.length === 5 && FAV.length === 4 && NOP.length === 5, 'cantidades de acciones');
for (let p = 0; p < V.PAIRS; p++) ok(pairIds(p).length === 4, 'pareja ' + p + ': 4 cartas');
ok(V.CARDS.filter(c => c.k === 'bomb' && c.alt).length === 1, 'un Electrode (mismo efecto)');
for (const np of [2, 3, 4]) {
  for (let s = 1; s <= 5; s++) {
    const st = V.newRound(np, rngOf(s * 13 + np));
    const all = allCards(st);
    const want = V.deckFor(np);
    ok(all.length === want.total && new Set(all).size === all.length, np + 'j: cada carta una vez (' + all.length + ')');
    ok(st.hands.every(h => h.length === 8 && h.filter(id => V.kind(id) === 'defuse').length >= 1), np + 'j: 8 cartas (1 goma + 7)');
    ok(st.hands.every(h => !h.some(V.isBomb)), np + 'j: nadie empieza con Voltorb');
    ok(st.deck.filter(V.isBomb).length === np - 1, np + 'j: bombas = jugadores - 1');
    ok(all.filter(id => V.kind(id) === 'defuse').length === np + (np >= 4 ? 3 : 2), np + 'j: gomas');
    ok(st.deck.filter(id => V.kind(id) === 'defuse').length === (np >= 4 ? 3 : 2), np + 'j: gomas de más en el mazo');
    ok(st.hands.every(h => h.filter(id => V.kind(id) === 'defuse').length === 1), np + 'j: una goma cada uno');
  }
}

ok(V.actionsFor(2).length === 28 && V.actionsFor(3).length === 46 && V.actionsFor(4).length === 46, 'a 2 jugadores, 28 cartas de acción; a 3-4, 46');
ok(['attack', 'skip', 'shuffle', 'future', 'favor', 'nope', 'pair'].every(k => V.actionsFor(2).some(id => V.kind(id) === k)), 'a 2 jugadores siguen todas las clases de carta');
for (let p = 0; p < V.PAIRS; p++) ok(V.actionsFor(2).filter(id => V.kind(id) === 'pair' && V.CARDS[id].p === p).length === 2, 'a 2: pareja ' + p + ' con 2 cartas');

// --- robar normal ---
{
  const st = table([[SKP[0]], [SKP[1]]], [FUT[0], BMB[0], ATT[0]]);
  ok(V.act(st, 1, { type: 'draw' }).ok === false, 'fuera de turno');
  ok(V.act(st, 0, { type: 'draw' }).ok && st.hands[0].includes(FUT[0]) && st.turn === 1 && st.deck.length === 2, 'robar acaba el turno');
  ok(st.notes[0].some(x => x.k === 'drew' && x.card === FUT[0]), 'nota privada de lo robado');
  ok(!JSON.stringify(st.ev).includes('"card":' + FUT[0]), 'lo robado no sale en los sucesos públicos');
}
// --- Siesta (skip) ---
{
  const st = table([[SKP[0]], [SKP[1]], [FUT[1]]], [FUT[0], ATT[0], ATT[1]]);
  ok(V.act(st, 0, { type: 'play', cards: [SKP[0]] }, 0).ok, 'echa siesta');
  ok(st.pend && st.turn === 0, 'en la ventana no hace efecto aún');
  ok(!V.act(st, 0, { type: 'draw' }, 100).ok, 'no puedes robar con la ventana abierta');
  ok(!V.act(st, 0, { type: 'resolve' }, 1000).ok, 'no se cierra antes de tiempo');
  ok(V.act(st, 0, { type: 'resolve' }, W).ok && st.turn === 1 && st.deck.length === 3 && st.hands[0].length === 0, 'siesta: acaba sin robar');
}
// --- Ataque y acumulación ---
{
  const st = table([[ATT[0]], [ATT[1], SKP[0]], [FUT[0]]], [FUT[1], FUT[2], FUT[3], FUT[4], SHF[0], SHF[1], SHF[2]]);
  playThrough(st, 0, { cards: [ATT[0]] });
  ok(st.turn === 1 && st.left === 2 && st.attacked && st.deck.length === 7, 'ataque: el siguiente juega 2 turnos, sin robar');
  ok(st.pend === null, 'ventana cerrada');
  playThrough(st, 1, { cards: [ATT[1]] });
  ok(st.turn === 2 && st.left === 4, 'atacado que ataca: el siguiente juega 2+2');
  V.act(st, 2, { type: 'draw' });
  ok(st.turn === 2 && st.left === 3, 'tras robar, le quedan 3');
  V.act(st, 2, { type: 'draw' }); V.act(st, 2, { type: 'draw' }); V.act(st, 2, { type: 'draw' });
  ok(st.turn === 0 && st.left === 1 && !st.attacked, 'acaba sus 4 turnos');
  // atacado en su 2º turno que ataca: quedan 1 + 2
  const s2 = table([[ATT[0]], [SKP[0], ATT[1]], [FUT[0]]], [FUT[1], FUT[2], FUT[3], FUT[4], SHF[0]]);
  playThrough(s2, 0, { cards: [ATT[0]] });
  playThrough(s2, 1, { cards: [SKP[0]] }, 9000);
  ok(s2.turn === 1 && s2.left === 1, 'siesta gasta un turno del ataque');
  playThrough(s2, 1, { cards: [ATT[1]] }, 20000);
  ok(s2.turn === 2 && s2.left === 3, 'ataque con 1 turno pendiente: 1+2');
}
// --- Teletransporte (shuffle) ---
{
  const deck = [FUT[1], FUT[2], FUT[3], FUT[4], SHF[1], SHF[2], SHF[3], ATT[0], ATT[1], ATT[2]];
  const st = table([[SHF[0], FUT[0]], [SKP[0]]], deck);
  playThrough(st, 0, { cards: [FUT[0]] });
  ok(st.know[0].length === 3 && st.know[0].join() === deck.slice(0, 3).join(), 'premonición: ve las 3 de arriba');
  ok(st.notes[0].some(x => x.k === 'peek' && x.cards.join() === deck.slice(0, 3).join()), 'nota privada con las 3');
  ok(st.turn === 0 && st.deck.length === 10, 'premonición no acaba el turno');
  playThrough(st, 0, { cards: [SHF[0]] }, 9000);
  ok(st.deck.length === 10 && new Set(st.deck).size === 10 && deck.every(x => st.deck.includes(x)), 'baraja: mismas cartas');
  ok(st.know[0].length === 0, 'al barajar se olvida lo visto');
}
// --- Premonición y robar: lo que sabes se corre ---
{
  const st = table([[FUT[0]], [SKP[0]]], [ATT[0], BMB[0], ATT[1], ATT[2]]);
  playThrough(st, 0, { cards: [FUT[0]] });
  V.act(st, 0, { type: 'draw' });
  ok(st.know[0][0] === BMB[0], 'tras robar, sabe que arriba hay un Voltorb');
  ok(V.priv(st, 0).know[0] === BMB[0] && V.priv(st, 1).know.length === 0, 'sólo él lo sabe');
}
// --- Favor ---
{
  const st = table([[FAV[0], FAV[1]], [NOP[0], DEF[1], ATT[0]], [SKP[0]]], [FUT[0], FUT[1]]);
  ok(!V.act(st, 0, { type: 'play', cards: [FAV[0]] }, 0).ok, 'favor sin objetivo');
  ok(!V.act(st, 0, { type: 'play', cards: [FAV[0]], target: 0 }, 0).ok, 'favor a ti mismo');
  playThrough(st, 0, { cards: [FAV[0]], target: 2 });
  ok(st.phase === 'favor' && V.turnOf(st) === 2, 'favor: espera al objetivo');
  ok(!V.act(st, 0, { type: 'draw' }).ok, 'no se roba mientras esperas el favor');
  ok(!V.act(st, 1, { type: 'give', card: NOP[0] }).ok, 'sólo da el objetivo');
  ok(V.act(st, 2, { type: 'give', card: SKP[0] }).ok && st.hands[0].includes(SKP[0]) && st.hands[2].length === 0 && st.phase === 'play' && st.turn === 0, 'da la carta que elige');
  ok(st.notes[0].some(x => x.k === 'got' && x.card === SKP[0]) && st.notes[2].some(x => x.k === 'gave' && x.card === SKP[0]), 'notas privadas del favor');
  ok(!JSON.stringify(V.pub(st, 0)).includes('"card":' + SKP[0]), 'la carta dada no sale en lo público');
  // sin cartas: no se le puede pedir
  ok(!V.act(st, 0, { type: 'play', cards: [FAV[1]], target: 2 }, 0).ok, 'favor a quien no tiene cartas');
  // se acaba el tiempo: una al azar (lo que manda party.js react: { give, random })
  playThrough(st, 0, { cards: [FAV[1]], target: 1 }, 50000);
  ok(st.phase === 'favor' && st.favor.until === 50000 + W + V.FAVOR_MS, 'favor: 15 s para elegir');
  const before = st.hands[1].length;
  ok(V.act(st, 1, { type: 'give', random: true }).ok && st.hands[1].length === before - 1 && st.hands[0].length === 2, 'favor fuera de tiempo: al azar');
  ok(V.timeoutMove(st, 1).type === 'draw', 'timeout tras el favor: robar');
  const fv = table([[FAV[0]], [NOP[0], DEF[1], ATT[0]]], [FUT[0]]);
  playThrough(fv, 0, { cards: [FAV[0]], target: 1 });
  ok(V.timeoutMove(fv, 1).type === 'give' && V.timeoutMove(fv, 1).random, 'timeout del favor: al azar');
  ok(V.cpuMove(fv, 1).card === ATT[0], 'la CPU da la carta que menos le importa (no la goma ni Detección)');
}
// --- Parejas ---
{
  const P0 = pairIds(0), P1 = pairIds(1);
  const st = table([[P0[0], P0[1], P1[0]], [ATT[0]], [SKP[0], SKP[1]]], [FUT[0], FUT[1]]);
  ok(!V.act(st, 0, { type: 'play', cards: [P0[0]], target: 1 }, 0).ok, 'un Pokémon solo no vale');
  ok(!V.act(st, 0, { type: 'play', cards: [P0[0], P1[0]], target: 1 }, 0).ok, 'dos distintos no valen');
  ok(!V.act(st, 0, { type: 'play', cards: [P0[0], P0[0]], target: 1 }, 0).ok, 'la misma carta dos veces no vale');
  ok(V.pairOf(st.hands[0]).length === 2, 'pareja detectada');
  playThrough(st, 0, { cards: [P0[0], P0[1]], target: 2 });
  ok(st.hands[0].length === 2 && st.hands[2].length === 1 && st.discard.includes(P0[0]) && st.discard.includes(P0[1]), 'pareja: roba una al azar');
  ok(st.turn === 0, 'robar con pareja no acaba el turno');
}
// --- Detección (nope), anular la anulación, ventana y carrera ---
{
  const st = table([[ATT[0], NOP[0]], [NOP[1], NOP[2]], [NOP[3]]], [FUT[0], FUT[1], FUT[2]]);
  V.act(st, 0, { type: 'play', cards: [ATT[0]] }, 0);
  ok(!V.act(st, 0, { type: 'nope' }, 100).ok, 'no puedes anular tu propia carta');
  ok(V.act(st, 1, { type: 'nope', at: 0 }, 2000).ok && st.pend.nopes === 1 && st.pend.until === 2000 + W, 'nope: la ventana vuelve a empezar');
  ok(!V.act(st, 2, { type: 'nope', at: 0 }, 2050).ok && st.hands[2].length === 1, 'carrera: el segundo llega tarde y no gasta su carta');
  ok(!V.act(st, 0, { type: 'resolve' }, 3500).ok, 'la ventana sigue abierta tras el nope');
  ok(V.act(st, 0, { type: 'nope', at: 1 }, 4000).ok && st.pend.nopes === 2, 'nope del nope');
  ok(V.act(st, 0, { type: 'resolve' }, 4000 + W).ok && st.turn === 1 && st.left === 2, 'nope-nope: el ataque vale');
  // anulado: no pasa nada
  const s2 = table([[ATT[0]], [NOP[1]], [FUT[3]]], [FUT[0], FUT[1]]);
  V.act(s2, 0, { type: 'play', cards: [ATT[0]] }, 0);
  V.act(s2, 1, { type: 'nope' }, 500);
  ok(V.act(s2, 0, { type: 'resolve' }, 500 + W).ok && s2.turn === 0 && s2.left === 1 && s2.hands[0].length === 0, 'anulado: el ataque no hace nada y la carta se gasta');
  ok(s2.log.some(e => e.k === 'cancel'), 'suceso de anulado');
  ok(!V.act(s2, 1, { type: 'nope' }, 600 + W).ok, 'sin ventana no se anula');
  // fuera de tiempo
  const s3 = table([[SKP[0]], [NOP[1]]], [FUT[0], FUT[1]]);
  V.act(s3, 0, { type: 'play', cards: [SKP[0]] }, 0);
  ok(!V.act(s3, 1, { type: 'nope' }, W + 500).ok, 'nope tarde (pasada la ventana)');
  ok(V.act(s3, 0, { type: 'resolve' }, W).ok && s3.turn === 1, 'se cierra la ventana');
  // nope fuera de turno con favor sobre ti
  const s4 = table([[FAV[0]], [NOP[1], ATT[1]]], [FUT[0]]);
  V.act(s4, 0, { type: 'play', cards: [FAV[0]], target: 1 }, 0);
  ok(V.cpuNopeChance(s4, 1) > 0.5, 'la CPU tiende a anular el favor contra ella');
  V.act(s4, 1, { type: 'nope' }, 100);
  V.act(s4, 0, { type: 'resolve' }, 100 + W);
  ok(s4.phase === 'play' && s4.hands[1].length === 1 && s4.hands[0].length === 0, 'favor anulado');
  ok(V.cpuNopeChance(s4, 1) === 0, 'sin ventana, la CPU no anula');
  // no se anulan gomas ni Voltorbs: no abren ventana
  const s5 = table([[DEF[0]], [NOP[1]]], [BMB[0], FUT[0]]);
  V.act(s5, 0, { type: 'draw' }, 0);
  V.act(s5, 0, { type: 'defuse' }, 10);
  ok(s5.pend === null && !V.act(s5, 1, { type: 'nope' }, 20).ok, 'la goma no se puede anular');
  ok(!V.act(s5, 0, { type: 'play', cards: [NOP[0]] }, 0).ok, 'Detección no se echa como acción');
}
// --- Voltorb, goma y dónde se mete ---
for (const [pos, want] of [[0, 0], [1, 1], [2, 2], ['bottom', 3], [-1, null]]) {
  const st = table([[DEF[0], ATT[0]], [SKP[0]]], [BMB[0], FUT[0], FUT[1], FUT[2]]);
  ok(V.act(st, 0, { type: 'draw' }, 0).bomb && st.phase === 'bomb' && V.turnOf(st) === 0, 'roba Voltorb');
  ok(!V.act(st, 0, { type: 'play', cards: [ATT[0]] }, 0).ok && !V.act(st, 0, { type: 'explode' }, 0).ok, 'con goma: ni acciones ni explotar');
  ok(!V.act(st, 0, { type: 'insert', pos: 0 }, 0).ok, 'primero la goma');
  ok(V.act(st, 0, { type: 'defuse' }, 0).ok && st.phase === 'insert' && st.hands[0].length === 1, 'usa la goma');
  const p = pos === 'bottom' ? st.deck.length : pos;
  ok(!V.act(st, 0, { type: 'insert', pos: 99 }, 0).ok, 'posición imposible');
  ok(V.act(st, 0, { type: 'insert', pos: p }, 0).ok, 'mete el Voltorb (' + pos + ')');
  const at = st.deck.indexOf(BMB[0]);
  if (want != null) ok(at === want, 'Voltorb en la posición ' + want + ' (está en ' + at + ')');
  else ok(at >= 0 && at <= 3, 'al azar: dentro del mazo');
  ok(st.deck.length === 4 && st.turn === 1 && st.phase === 'play', 'tras meterlo, acaba el turno');
  ok(st.know[0][at] === BMB[0] && st.know[1].length === 0, 'el que lo mete sabe dónde está; los demás no');
  ok(!JSON.stringify(V.pub(st, 0)).includes('"pos"'), 'la posición no es pública');
  ok(st.notes[0].some(x => x.k === 'ins' && x.pos === at), 'nota privada con la posición');
}
// --- explotar, eliminado y ganador ---
{
  const st = table([[ATT[0], SKP[1]], [SKP[0]], [DEF[0]]], [BMB[0], BMB[1], FUT[0], FUT[1]]);
  ok(V.act(st, 0, { type: 'draw' }, 0).bomb && st.bomb.seat === 0, 'sin goma roba Voltorb');
  ok(!V.act(st, 0, { type: 'defuse' }, 0).ok, 'sin goma no se desactiva');
  ok(V.act(st, 0, { type: 'explode' }, 100).ok && !st.alive[0] && st.hands[0].length === 0, 'explota y se queda sin mano');
  ok(st.discard.includes(BMB[0]) && st.discard.includes(ATT[0]) && st.discard.includes(SKP[1]), 'su mano y el Voltorb al descarte');
  ok(st.turn === 1 && !st.over, 'sigue el siguiente');
  ok(!V.act(st, 0, { type: 'nope' }, 0).ok, 'el eliminado no juega');
  ok(V.nextAlive(st, 2) === 1, 'se salta al eliminado');
  V.act(st, 1, { type: 'draw' }, 200);
  V.act(st, 1, { type: 'explode' }, 300);
  ok(st.over && st.winner === 2 && st.turn === -1 && V.turnOf(st) === -1, 'el último en pie gana');
  const r = V.results(st);
  ok(r[0].seat === 2 && r[0].place === 1 && r[0].pts === 3, 'ganador: 3 puntos');
  ok(r[1].seat === 1 && r[1].pts === 1 && r[2].seat === 0 && r[2].pts === 0, 'puestos al revés de como explotaron');
  ok(!V.act(st, 2, { type: 'draw' }).ok, 'ronda acabada');
}
{
  const st = table([[], [], [], []], [BMB[0], BMB[1], BMB[2], FUT[0]]);
  V.act(st, 0, { type: 'draw' }); V.act(st, 0, { type: 'explode' });
  V.act(st, 1, { type: 'draw' }); V.act(st, 1, { type: 'explode' });
  V.act(st, 2, { type: 'draw' }); V.act(st, 2, { type: 'explode' });
  const r = V.results(st);
  ok(st.winner === 3 && r.map(x => x.seat).join() === '3,2,1,0' && r.map(x => x.pts).join() === '3,2,1,0', '4 jugadores: 3/2/1/0');
}
// --- timeouts ---
{
  const st = table([[DEF[0]], [SKP[0]]], [BMB[0], FUT[0]]);
  ok(V.timeoutMove(st, 0).type === 'draw', 'timeout: robar');
  V.act(st, 0, V.timeoutMove(st, 0));
  ok(V.timeoutMove(st, 0).type === 'defuse', 'timeout con Voltorb y goma: usarla');
  V.act(st, 0, V.timeoutMove(st, 0));
  const tm = V.timeoutMove(st, 0);
  ok(tm.type === 'insert' && tm.pos === -1, 'timeout al meterlo: al azar');
  ok(V.act(st, 0, tm).ok && st.deck.includes(BMB[0]), 'metido al azar');
  const s2 = table([[SKP[1]], [SKP[0]]], [BMB[0], FUT[0]]);
  V.act(s2, 0, { type: 'draw' });
  ok(V.timeoutMove(s2, 0).type === 'explode', 'timeout sin goma: explota');
  V.act(s2, 0, { type: 'play', cards: [SKP[1]] });
  const s3 = table([[SKP[1]], [SKP[0]]], [FUT[0], FUT[1]]);
  V.act(s3, 0, { type: 'play', cards: [SKP[1]] }, 0);
  ok(V.timeoutMove(s3, 0).type === 'resolve', 'timeout con ventana abierta: cerrarla');
}
// --- vistas: nada del mazo ni de otras manos ---
{
  const st = V.newRound(4, rngOf(99));
  const pubJ = JSON.stringify(V.pub(st, 0));
  ok(!/"deck":\[/.test(pubJ) && !/"hands"/.test(pubJ) && !/"know"/.test(pubJ) && !/"notes"/.test(pubJ), 'público: ni mazo ni manos ni lo sabido');
  ok(V.pub(st, 0).deck === st.deck.length && V.pub(st, 0).bombs === 3, 'público: cuántas quedan y cuántos Voltorb');
  for (let s = 0; s < 4; s++) {
    const pv = V.priv(st, s);
    ok(Object.keys(pv).sort().join() === 'hand,know,notes' && pv.hand.join() === st.hands[s].join(), 'privado ' + s + ': sólo su mano');
    for (let o = 0; o < 4; o++) if (o !== s) ok(!st.hands[o].some(id => pv.hand.includes(id)), 'privado ' + s + ': nada de ' + o);
  }
}
// --- CPU: usa lo que sabe ---
{
  const st = table([[SKP[0], ATT[0]], [FUT[0]]], [BMB[0], FUT[1]]);
  st.know[0] = [BMB[0], FUT[1]];
  const m = V.cpuMove(st, 0);
  ok(m.type === 'play' && (m.cards[0] === SKP[0] || m.cards[0] === ATT[0]), 'la CPU no roba si sabe que arriba hay un Voltorb');
  const s2 = table([[DEF[0]], [FUT[0], FUT[1], FUT[2]]], [BMB[0], FUT[3], FUT[4]]);
  V.act(s2, 0, { type: 'draw' }); V.act(s2, 0, { type: 'defuse' });
  const p = V.cpuInsert(s2, 0);
  ok(p >= 0 && p <= s2.deck.length, 'la CPU mete el Voltorb dentro del mazo');
  const s3 = table([[DEF[0], ATT[0]], [FUT[0]]], [BMB[0], FUT[3], FUT[4], SHF[0], SHF[1]], 0, { left: 2, attacked: true });
  V.act(s3, 0, { type: 'draw' }); V.act(s3, 0, { type: 'defuse' });
  ok(V.cpuInsert(s3, 0) >= s3.deck.length - 2, 'con turnos pendientes, la CPU lo mete abajo');
}

// --- 300+ partidas CPU contra CPU (con anulaciones), conservación de cartas ---
{
  let games = 0, bad = 0, nopes = 0, favors = 0, steals = 0, defused = 0, attacks = 0, maxSteps = 0;
  const winners = [0, 0, 0, 0];
  for (let g = 0; g < 360; g++) {
    const np = 2 + (g % 3);
    const rng = rngOf(1000 + g);
    const st = V.newRound(np, rng);
    const total = V.deckFor(np).total;
    let now = 0, steps = 0;
    while (!st.over && steps < 4000) {
      steps++;
      now += 700;
      if (st.pend) {
        // Cada CPU decide si anula (como party.js react); vale la primera que llegue.
        let did = false;
        for (let s = 0; s < np && !did; s++) {
          if (rng() < V.cpuNopeChance(st, s)) { const r = V.act(st, s, { type: 'nope', at: st.pend.nopes }, now + 600 + rng() * 1400); if (r.ok) { did = true; nopes++; now += 1500; } }
        }
        if (!did) { const r = V.act(st, st.pend.seat, { type: 'resolve' }, st.pend.until); if (!r.ok) { bad++; break; } now = st.pend ? now : now + W; }
        continue;
      }
      const seat = V.turnOf(st);
      const m = V.cpuMove(st, seat);
      const ph = st.phase;
      const r = V.act(st, seat, m, now);
      if (!r.ok) { bad++; console.log('jugada CPU rechazada', JSON.stringify(m), r.err, ph); break; }
      if (m.type === 'defuse') defused++;
      if (m.type === 'play' && V.kind(m.cards[0]) === 'favor') favors++;
      if (m.type === 'play' && m.cards.length === 2) steals++;
      if (m.type === 'play' && V.kind(m.cards[0]) === 'attack') attacks++;
      const all = allCards(st);
      if (all.length !== total || new Set(all).size !== total) { bad++; console.log('cartas perdidas', g, all.length, total); break; }
      if (st.hands.some((h, i) => !st.alive[i] && h.length)) { bad++; console.log('eliminado con cartas'); break; }
      if (st.deck.filter(V.isBomb).length !== st.alive.filter(Boolean).length - 1 + (st.phase === 'bomb' || st.phase === 'insert' ? -1 : 0)) { bad++; console.log('bombas mal', g); break; }
    }
    maxSteps = Math.max(maxSteps, steps);
    if (st.over) {
      games++;
      winners[st.winner]++;
      const r = V.results(st);
      if (r.length !== np || r[0].seat !== st.winner || st.alive.filter(Boolean).length !== 1 || st.out.length !== np - 1) bad++;
      if (r.reduce((s, x) => s + x.pts, 0) !== V.PTS[np].reduce((a, b) => a + b, 0)) bad++;
    }
  }
  ok(games === 360 && bad === 0, '360 partidas CPU terminan bien (' + games + ' acabadas, ' + bad + ' errores, máx ' + maxSteps + ' pasos)');
  ok(nopes > 50 && favors > 50 && steals > 50 && defused > 100 && attacks > 50, 'en las partidas se usa de todo (nope ' + nopes + ', favor ' + favors + ', parejas ' + steals + ', gomas ' + defused + ', ataques ' + attacks + ')');
  console.log('  ganadores por asiento:', winners.join(' / '), '· nope', nopes, '· favor', favors, '· parejas', steals, '· gomas', defused, '· ataques', attacks, '· máx pasos', maxSteps);
}

console.log(fails ? `${fails} FALLOS de ${n}` : `OK: ${n} comprobaciones`);
process.exit(fails ? 1 : 0);
