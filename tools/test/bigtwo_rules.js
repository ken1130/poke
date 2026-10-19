// Prueba de las reglas del Big Two (大老二) del modo fiesta: node tools/test/bigtwo_rules.js
const B = require('../../js/systems/party/bigtwo.js');
let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FALLO:', msg); } };
const R = { 3: 0, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5, 9: 6, 10: 7, J: 8, Q: 9, K: 10, A: 11, 2: 12 };
const S = { c: 0, d: 1, h: 2, s: 3 };
// 'Ks' -> carta; '10h' -> carta
const C = t => { const m = /^(10|[2-9JQKA])([cdhs])$/.exec(t); if (!m) throw new Error(t); return R[m[1]] * 4 + S[m[2]]; };
const H = s => s.split(' ').map(C);
const cl = s => B.classify(H(s));
const type = s => (cl(s) || {}).type || null;
const beats = (a, b) => B.beats(cl(a), cl(b));

// --- tipos ---
ok(type('3c') === 'single', 'suelta');
ok(type('3c 3s') === 'pair', 'pareja');
ok(type('3c 4c') === null, 'pareja mala');
ok(type('Kc Kd Kh') === null, 'trío: ya no vale (reglas del dueño 2026-10-19)');
ok(type('Kc Kd Ah') === null, 'trío malo');
ok(type('3c 4d 5h 6s 7c') === 'straight', 'escalera 34567');
ok(type('10c Jd Qh Ks Ac') === 'straight', 'escalera 10JQKA');
ok(type('Ac 2d 3h 4s 5c') === 'straight', 'escalera A2345');
ok(type('2c 3d 4h 5s 6c') === 'straight', 'escalera 23456');
ok(type('Jc Qd Kh As 2c') === null, 'JQKA2 no vale');
ok(type('Qc Kd Ah 2s 3c') === null, 'QKA23 no vale');
ok(type('Kc Ad 2h 3s 4c') === null, 'KA234 no vale');
ok(type('3h 7h 9h Jh Kh') === null, 'color: ya no vale (reglas del dueño 2026-10-19)');
ok(type('3h 3c 3d 9h 9s') === 'full', 'full');
ok(type('9c 9d 9h 9s 3c') === 'four', 'póker');
ok(type('5s 6s 7s 8s 9s') === 'sflush', 'escalera de color');
ok(type('As 2s 3s 4s 5s') === 'sflush', 'escalera de color A2345');
ok(type('3c 4c 5c 6c') === null, '4 cartas no vale');
ok(type('3c 3d 4c 4d') === null, 'dobles parejas no vale');
ok(type('3c 3d 4c 4d 5h') === null, '5 cartas sin jugada');
ok(B.classify([1, 1]) === null, 'cartas repetidas');
ok(B.classify([52]) === null, 'carta fuera de rango');

// --- comparaciones ---
ok(beats('2s', 'Ah'), '2 gana a A');
ok(beats('3s', '3h'), 'picas gana a corazones');
ok(!beats('3h', '3s'), 'corazones no gana a picas');
ok(beats('3d', '3c'), 'diamantes gana a tréboles');
ok(beats('5c 5s', '5d 5h'), 'pareja con picas gana');
ok(!beats('5c 5h', '5d 5s'), 'pareja de 5 sin picas pierde');
ok(beats('6c 6d', '5h 5s'), 'pareja de 6 gana a la de 5');
ok(!beats('4c 4d', '3c'), 'distinto tipo: pareja no gana a suelta');
ok(beats('3c 4d 5h 6s 8c 8d 8h'.split(' ').slice(0, 1).join(' '), '3c') === false, 'misma carta no gana');
// 5 cartas: cada tipo sólo gana a su tipo; las bombas (póker, escalera de color) a todo
ok(!beats('3h 3c 3d 9h 9s', '10c Jd Qh Ks As'), 'full NO gana a escalera (tipos distintos)');
ok(!beats('10c Jd Qh Ks As', '3h 3c 3d 9h 9s'), 'escalera NO gana a full');
ok(beats('3c 3d 3h 3s 4c', 'Ac Ad Ah 2c 2d'), 'póker (bomba) gana a full');
ok(beats('3c 3d 3h 3s 4c', '10c Jd Qh Ks As'), 'póker (bomba) gana a escalera');
ok(beats('3c 3d 3h 3s 4c', '2s'), 'póker (bomba) gana a una suelta');
ok(beats('3c 3d 3h 3s 4c', '2h 2s'), 'póker (bomba) gana a una pareja');
ok(beats('3c 4c 5c 6c 7c', '2c 2d 2h 2s 3d'), 'escalera de color gana a póker');
ok(beats('3c 4c 5c 6c 7c', 'Ad'), 'escalera de color (bomba) gana a una suelta');
ok(!beats('2s', '3c 3d 3h 3s 4c'), 'una suelta no gana a una bomba');
ok(!beats('10c Jd Qh Ks As', '3c 3d 3h 3s 4c'), 'escalera no gana a póker');
ok(!beats('2c 2d 2h 2s 3d', '3c 4c 5c 6c 7c'), 'póker no gana a escalera de color');
// escaleras entre sí
ok(beats('3c 4d 5h 6s 7c', '2c 3d 4h 5s 6h'), '34567 gana a 23456');
ok(beats('2c 3d 4h 5s 6c', 'Ac 2d 3h 4s 5s'), '23456 gana a A2345');
ok(beats('10c Jd Qh Ks Ac', '9c 10d Jh Qs Ks'), '10JQKA la más alta');
ok(beats('3c 4d 5h 6s 7s', '3d 4c 5h 6s 7h'), 'misma escalera: palo de la de arriba');
ok(!beats('3s 4s 5s 6s 7h', '3c 4c 5c 6c 7s'), 'misma escalera: la de arriba con picas gana');
// full y póker
ok(beats('4c 4d 4h 3c 3d', '3h 3s 3d 2c 2d'.replace('3d', '3c')), 'full por el trío');
ok(beats('5c 5d 5h 5s 3c', '4c 4d 4h 4s 2s'), 'póker por las cuatro');
ok(beats('4s 5s 6s 7s 8s', '3h 4h 5h 6h 7h'), 'escalera de color más alta');

// --- jugadas válidas / check ---
const hand = H('3c 3d 4h 5s 6c 7d 9h 9s Js Qh Kc Ad 2s');
ok(B.check(hand, H('3c'), null, C('3c')).ok, 'primera con 3♣');
ok(!B.check(hand, H('3d'), null, C('3c')).ok, 'primera sin 3♣ no vale');
ok(B.check(hand, H('3c 4h 5s 6c 7d'), null, C('3c')).ok, 'primera escalera con 3♣');
ok(!B.check(hand, H('3c 4h'), null, -1).ok, 'pareja mala');
ok(!B.check(hand, H('Kh'), null, -1).ok, 'carta que no es tuya');
ok(!B.check(hand, H('9h 9s'), { cards: H('5c') }, -1).ok, 'distinto tipo que la mesa');
{
  const h2 = H('5c 5d 5h 5s 9c 3d 4h 6s 7c 8d Jh Qs Kc');
  ok(B.check(h2, H('5c 5d 5h 5s 9c'), { cards: H('2s') }, -1).ok, 'bomba (póker) sobre una suelta');
  ok(B.check(h2, H('5c 5d 5h 5s 9c'), { cards: H('Ah As') }, -1).ok, 'bomba (póker) sobre una pareja');
  ok(!B.check(h2, H('3d 4h 5c 6s 7c'), { cards: H('4c 4d 4h 9h 9s') }, -1).ok, 'escalera sobre full: no');
  ok(!B.check(h2, H('Kc'), { cards: H('3c 3d 3h 3s 4c') }, -1).ok, 'suelta sobre bomba: no');
  ok(B.legalPlays(h2, { cards: H('2s') }, -1).some(p => p.c.type === 'four'), 'jugadas legales sobre una suelta incluyen la bomba');
  ok(B.allPlays(h2).every(p => p.c.type !== 'triple' && p.c.type !== 'flush'), 'ni tríos ni colores entre las jugadas');
}
ok(!B.check(hand, H('9h'), { cards: H('10c') }, -1).ok, 'no gana a la mesa');
ok(B.check(hand, H('2s'), { cards: H('Ac') }, -1).ok, 'gana a la mesa');
const lp = B.legalPlays(hand, { cards: H('9c 9d') }, -1);
ok(lp.length === 1 && lp[0].cards.join() === H('9h 9s').join(), 'parejas que ganan a 9♣9♦: sólo 9♥9♠');
ok(B.legalPlays(hand, null, C('3c')).every(p => p.cards.includes(C('3c'))), 'abrir: todas llevan 3♣');

// --- reparto ---
for (const np of [2, 3, 4]) {
  const hs = B.deal(np);
  ok(hs.length === np && hs.every(h => h.length === 13), 'reparto ' + np + ' jugadores: 13 cada uno');
  ok(new Set(hs.flat()).size === np * 13, 'reparto ' + np + ': sin repetir');
}
// Con 2-3 jugadores puede faltar el 3♣: empieza la carta más baja.
let seenNo3 = false;
for (let i = 0; i < 200; i++) {
  const st = B.newRound(2);
  const low = Math.min(...st.hands.flat());
  ok(st.must === low && st.hands[st.turn].includes(low), 'empieza quien tiene la carta más baja');
  if (low !== 0) seenNo3 = true;
}
ok(seenNo3, 'con 2 jugadores a veces no se reparte el 3♣');
for (let i = 0; i < 50; i++) { const st = B.newRound(4); ok(st.must === 0 && st.hands[st.turn][0] === 0, '4 jugadores: empieza el 3♣'); }

// --- turnos, pasar, abrir libre ---
{
  const st = B.newRound(4, (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })());
  const s0 = st.turn;
  ok(!B.act(st, s0, { type: 'pass' }).ok, 'quien abre no puede pasar');
  ok(!B.act(st, (s0 + 1) % 4, { type: 'play', cards: [st.hands[(s0 + 1) % 4][0]] }).ok, 'no es tu turno');
  ok(!B.act(st, s0, { type: 'play', cards: [st.hands[s0][1]] }).ok, 'la primera debe llevar el 3♣');
  ok(B.act(st, s0, { type: 'play', cards: [0] }).ok, 'abre con 3♣');
  ok(st.turn === (s0 + 1) % 4 && st.lead && st.lead.cards[0] === 0, 'pasa el turno al siguiente');
  ok(B.act(st, st.turn, { type: 'pass' }).ok, 'pasa 1');
  ok(B.act(st, st.turn, { type: 'pass' }).ok, 'pasa 2');
  ok(st.lead, 'aún hay jugada en mesa con 2 pases');
  ok(B.act(st, st.turn, { type: 'pass' }).ok, 'pasa 3');
  ok(st.lead === null && st.turn === s0, 'todos pasan: abre libre quien jugó');
  ok(!B.act(st, s0, { type: 'pass' }).ok, 'al abrir libre no se puede pasar');
  // Pasar no te deja fuera: tras pasar se vuelve a jugar en la misma baza.
  const st2 = B.newRound(3);
  const a = st2.turn;
  B.act(st2, a, { type: 'play', cards: [st2.must] });
  const b = st2.turn;
  B.act(st2, b, { type: 'pass' });
  const c = st2.turn;
  const beat = B.legalPlays(st2.hands[c], st2.lead, -1);
  if (beat.length) { B.act(st2, c, { type: 'play', cards: beat[0].cards }); ok(st2.turn === a && st2.passes === 0, 'jugar reinicia los pases'); }
}

// --- partidas completas con la CPU (todas las cartas, sin trampas) ---
for (const np of [2, 3, 4]) {
  for (let g = 0; g < 200; g++) {
    const st = B.newRound(np);
    let guard = 0;
    while (!st.over && guard++ < 2000) {
      const seat = st.turn;
      const opp = st.hands.filter((h, i) => i !== seat).map(h => h.length);
      const mv = B.cpuMove(st.hands[seat], { lead: st.lead, must: st.first ? st.must : -1, oppMin: Math.min(...opp), mine: st.hands[seat].length });
      const r = B.act(st, seat, mv);
      if (!r.ok) { ok(false, 'la CPU hizo una jugada no válida: ' + r.err + ' ' + JSON.stringify(mv)); break; }
    }
    ok(st.over && st.hands[st.winner].length === 0, np + ' jugadores: la partida acaba');
    const res = B.results(st);
    ok(res[0].seat === st.winner && res[0].place === 1 && res[0].pts === 0, 'resultado: el ganador primero con 0 puntos');
    ok(res.every((r, i) => i === 0 || r.left >= res[i - 1].left), 'resultado ordenado por cartas que quedan');
  }
}
// Tiempo agotado
ok(B.timeoutMove(H('3c 5d'), null, C('3c')).cards[0] === C('3c'), 'tiempo: abre con el 3♣');
ok(B.timeoutMove(H('3c 5d'), { cards: H('4c') }).type === 'pass', 'tiempo: pasa si sigue');

console.log(fails ? `${fails} de ${n} comprobaciones FALLAN` : `ok: ${n} comprobaciones`);
process.exit(fails ? 1 : 0);
