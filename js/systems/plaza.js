/* ============ plaza.js — Zona de fiesta (2026-10-19, hoja «Bug fix, improve» V3.1) ============
 * Un espacio grande por el que todos se mueven (G.Modes.run === 'plaza'), sin enemigos ni
 * premios, con cuatro rincones:
 *   tenis    pista con red; 1 contra 1 o 2 contra 2 (las CPU rellenan); gana quien llegue a WIN.
 *   voleibol igual, pero la pelota va por el aire (bombeada) y es punto si cae en tu campo.
 *   patata   «Patata caliente» (燙手山芋): una bomba con mecha de 5-10 s (al azar, no se sabe
 *            cuánto queda: la mecha chisporrotea y parpadea cada vez más deprisa). Se pasa
 *            tocando a otro o se lanza (F / botón). Al explotar queda fuera quien la tenga (o
 *            quien la lanzó, si está en el suelo). Gana el último que quede.
 *   casita   la caseta de cartas: el anfitrión entra y elige una mesa (Big Two, Cartas de
 *            tipos, Voltorb travieso): se vuelve a la sala y empieza la fiesta de mesa (party.js).
 * Se entra desde la sala (Fiesta → «Zona de fiesta» o «Patata caliente», que empieza ya en la
 * patata) o, en solitario, desde «Reglas a medida» (junto a la sala de entrenamiento).
 *
 * Grupo: manda el ANFITRIÓN (como en el cooperativo). Él mueve la pelota, la bomba y las CPU,
 * decide los puntos y quién queda fuera, y lo manda a todos (eventos 'plz' por el canal fiable,
 * coop.js). Cada uno mueve su propio Pokémon (sus posiciones ya van por el canal rápido).
 *   anfitrión -> todos  ['plz','start', zona, {parts, ...}]  empieza un juego (y dónde va cada uno)
 *                       ['plz','st', zona, foto]             estado (12 por segundo)
 *                       ['plz','fx', tipo, x, y]             golpe, bote, explosión (sonido y efecto)
 *                       ['plz','end', zona, texto]           se acabó (quién gana)
 *                       ['plz','close', mesa?]               todos de vuelta a la sala (mesa: la de cartas)
 *   invitado -> anfitrión ['plz','go', zona, modo]           empezar un juego desde su rincón
 *                       ['plz','throw', ángulo]              lanzar la bomba (si la lleva)
 */
G.Plaza = (() => {
  const TS = () => G.Tiles.T * G.Sprites.PX;
  const TX = 7000, TY = 7000;            // centro de la zona (en casillas): lejos de todo lo demás
  const RW = 22, RH = 14;                 // medio ancho / medio alto de la sala (casillas)
  const WIN = 5;                          // puntos para ganar (tenis y voleibol)
  const SNAP = 1 / 12;                    // fotos del estado por segundo
  const CPU_DEX = [25, 133, 39, 52, 54, 143, 7, 175, 172, 197, 196, 470];
  const FUSE_MIN = 5, FUSE_MAX = 10;
  const THROW_SPEED = 380, THROW_T = 0.55;
  // Pelotas (2026-10-19, «la pelota es un cuadrado y el tenis no parece tenis»): gravedad y botes de verdad.
  const GRAV = 620;                        // px/s² (la altura z es en píxeles de pantalla)
  const T_HIT_Z = 16, T_BOUNCE = 0.55;     // tenis: altura del golpe y lo que conserva al botar
  const T_REACH_Z = 46;                    // tenis: más alta que esto, no llegas
  const V_REACH_Z = 56;                    // voleibol
  const CPU_MISS = 0.08;                   // las CPU la mandan fuera de vez en cuando
  const SIDE_COL = ['#4fb4ff', '#ff6fa8'];

  let opts = null;                        // { zone, cpu } de la sala o del modo solitario
  let games = {};                         // zona -> juego (anfitrión: el estado de verdad; invitado: la foto)
  let views = {};                         // zona -> lo que se dibuja (CPU suavizadas, pelota, bomba)
  let hud = null, hudT = 0, snapT = 0, hutTold = 0;
  let lastKey = '';

  const on = () => G.Modes.run === 'plaza';
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const now = () => G.Game.st.time;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------- geometría ----------------

  function center() { const ts = TS(); return [TX * ts + ts / 2, TY * ts + ts / 2]; }
  /** Rectángulo / círculo de cada rincón (en píxeles del mundo). */
  function zone(kind) {
    const ts = TS(), [cx, cy] = center();
    if (kind === 'tennis') return { kind, cx: cx - 11 * ts, cy: cy - 6 * ts, hw: 7 * ts, hh: 3.6 * ts };
    if (kind === 'volley') return { kind, cx: cx - 11 * ts, cy: cy + 6 * ts, hw: 6.5 * ts, hh: 3.6 * ts };
    if (kind === 'potato') return { kind, cx: cx + 10 * ts, cy: cy - 5.5 * ts, r: 6 * ts };
    return { kind: 'hut', cx: cx + 12 * ts, cy: cy + 7.5 * ts };
  }
  /** Donde se pulsa para empezar (el cartel). */
  function padOf(kind) {
    const z = zone(kind), ts = TS();
    if (kind === 'potato') return [z.cx, z.cy + z.r + ts * 1.4];
    if (kind === 'hut') return [z.cx, z.cy + ts * 0.6];
    return [z.cx, z.cy + z.hh + ts * 1.4];
  }
  const PAD_R = 70;

  // ---------------- jugadores ----------------

  const meId = () => (G.Coop.active ? G.Net.uid : 'me');
  const idOf = p => (p === G.Game.player ? meId() : p.uid);
  function humanById(id) { return G.Game.everyone().find(p => idOf(p) === id) || null; }
  /** Nombre para los demás (el de la sala; nunca «Tú», que los demás verían traducido como suyo). */
  function nameOf(p) {
    const id = idOf(p), m = G.Coop.active && G.Coop.members && G.Coop.members.find(x => x.uid === id);
    if (m && m.name) return m.name;
    if (p === G.Game.player) return (G.Social.me && G.Social.me.name) || (G.DB.save && G.DB.save.name) || 'Trainer';
    return p.tag || p.name || '?';
  }
  /** Posición de un participante (persona o CPU). */
  function posOf(g, id) {
    const c = g.cpus && g.cpus[id];
    if (c) return c;
    const p = humanById(id);
    return p && !p.gone ? p : null;
  }
  const radius = p => Math.max(10, (p && p.r) || 14);

  // ---------------- empezar / acabar la zona ----------------

  /** Solitario: desde «Reglas a medida». */
  function soloStart(z = 'plaza', cpu = 3) {
    opts = { zone: z, cpu };
    G.Modes.start('plaza');
  }

  /** Al empezar la run (game.js startRun). */
  function begin(pl, coop) {
    const mods = coop ? coop.mods || {} : opts || {};
    opts = { zone: mods.plaza || 'plaza', cpu: mods.cpu | 0 };
    games = {}; views = {}; snapT = 0; hutTold = 0; lastKey = '';
    pl.god = true;
    const [cx, cy] = center();
    G.World.setArena({ tx: TX, ty: TY, room: true, rw: RW, rh: RH, type: 'normal' });
    G.World.setBiome(G.Tiles.arenaBiome('normal'), true);
    // Cada uno en su sitio, en fila en el centro (los demás ven tu posición por la red).
    const list = coop ? coop.members : [{ uid: 'me' }];
    const i = Math.max(0, list.findIndex(m => m.uid === (coop ? G.Net.uid : 'me')));
    pl.x = cx + (i - (list.length - 1) / 2) * 40; pl.y = cy + 20;
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    showHud();
    G.Spawner.say(G.T(opts.zone === 'potato' ? 'Patata caliente' : 'Zona de fiesta'), 2.6, true);
    // «Patata caliente» desde la sala: empieza en cuanto todos están dentro.
    if (opts.zone === 'potato' && authority()) setTimeout(() => { if (on()) startGame('potato', 0, true); }, 1500);
  }

  function end() {
    if (hud) { hud.remove(); hud = null; }
    games = {}; views = {}; opts = null;
  }

  /** Anfitrión: todos de vuelta a la sala (mesa = juego de cartas que empezar después). */
  function closeAll(table) {
    if (G.Coop.active && G.Coop.isHost) G.Coop.broadcast(['plz', 'close', table || '']);
  }

  // ---------------- red ----------------

  function emit(ev) { if (G.Coop.active && G.Coop.isHost) G.Coop.broadcast(ev); }
  /** Pide algo al anfitrión (o lo hace, si mandas tú). */
  function ask(ev) {
    if (authority()) onClient(meId(), ev);
    else G.Coop.request(ev);
  }

  /** Anfitrión: lo que pide un invitado. */
  function onClient(from, ev) {
    if (!on() || !authority()) return;
    if (ev[1] === 'go') startGame(ev[2], ev[3] | 0, false, from);
    else if (ev[1] === 'throw') throwBomb(from, +ev[2] || 0);
    else if (ev[1] === 'leave') leaveGame(ev[2], from);
  }

  /** Invitado: lo que manda el anfitrión. */
  function onNet(ev) {
    if (!on()) return;
    const k = ev[1];
    if (k === 'start') applyStart(ev[2], ev[3]);
    else if (k === 'st') { const g = games[ev[2]]; if (g) Object.assign(g, ev[3]); }
    else if (k === 'fx') fx(ev[2], ev[3], ev[4], ev[5]);
    else if (k === 'end') applyEnd(ev[2], ev[3]);
    else if (k === 'close') {
      const t = ev[2];
      G.Spawner.say(G.T(t ? 'Vamos a la mesa de cartas…' : 'El anfitrión ha cerrado la zona de fiesta'), 2.4, true);
      setTimeout(() => { if (on()) G.Game.quit(); }, 400);
    }
  }

  // ---------------- juegos: empezar ----------------

  /**
   * Anfitrión: empieza el juego del rincón `kind`. Juegan las personas que están en el rincón
   * (o en su cartel); las CPU rellenan. mode: 1 = 1 contra 1, 2 = 2 contra 2 (pistas).
   */
  function startGame(kind, mode, auto, by) {
    if (!authority() || !['tennis', 'volley', 'potato'].includes(kind)) return;
    if (games[kind] && games[kind].phase !== 'over') return;
    const z = zone(kind), [px, py] = padOf(kind);
    const inZone = p => {
      if (G.U.dist2(p.x, p.y, px, py) < (PAD_R + 20) ** 2) return true;
      if (kind === 'potato') return G.U.dist2(p.x, p.y, z.cx, z.cy) < (z.r + 30) ** 2;
      return Math.abs(p.x - z.cx) < z.hw + 40 && Math.abs(p.y - z.cy) < z.hh + 40;
    };
    // (Quien ya juega en otro rincón no entra en éste.)
    const busy = id => Object.keys(games).some(k => k !== kind && games[k].phase !== 'over' && games[k].parts.some(q => q.id === id));
    let humans = G.Game.everyone().filter(p => !p.gone && !busy(idOf(p)) && (auto || inZone(p)));
    if (by && !busy(by) && !humans.some(p => idOf(p) === by)) { const p = humanById(by); if (p) humans.push(p); }
    humans.sort((a, b) => G.U.dist2(a.x, a.y, px, py) - G.U.dist2(b.x, b.y, px, py));
    const parts = [];
    let cpuN = 0;
    const cpu = side => { cpuN++; parts.push({ id: 'cpu' + kind[0] + cpuN, cpu: true, dex: G.U.pick(CPU_DEX), name: 'CPU ' + cpuN, side }); };
    if (kind === 'potato') {
      humans.slice(0, 8).forEach(p => parts.push({ id: idOf(p), cpu: false, dex: p.dex, name: nameOf(p), side: 0 }));
      // Desde la sala: las CPU que puso el anfitrión; en la zona libre, hasta ser 4 (al menos 3).
      const want = auto ? Math.max(parts.length + (opts.cpu | 0), 3) : Math.max(parts.length, 4);
      while (parts.length < want) cpu(0);
    } else {
      const n = mode === 2 ? 2 : 1;
      humans.slice(0, n * 2).forEach((p, i) => parts.push({ id: idOf(p), cpu: false, dex: p.dex, name: nameOf(p), side: i % 2 }));
      for (const s of [0, 1]) while (parts.filter(q => q.side === s).length < n) cpu(s);
    }
    const g = newGame(kind, parts);
    games[kind] = g;
    const meta = { parts, homes: g.homes };
    emit(['plz', 'start', kind, meta]);
    applyStart(kind, meta, g);
    G.Audio.sfx('confirm');
  }

  /** Estado nuevo de un juego (anfitrión). */
  function newGame(kind, parts) {
    const z = zone(kind), g = { kind, parts, phase: 'ready', t: 1.6, cpus: {}, homes: {} };
    const ts = TS();
    if (kind === 'potato') {
      parts.forEach((p, i) => {
        const a = i / parts.length * Math.PI * 2;
        g.homes[p.id] = [Math.round(z.cx + Math.cos(a) * z.r * 0.6), Math.round(z.cy + Math.sin(a) * z.r * 0.6)];
      });
      g.alive = parts.map(p => p.id); g.out = [];
      g.holder = null; g.bomb = null; g.fuse = 0; g.fuseT = 0; g.f = 0; g.passT = -9; g.lastFrom = null; g.round = 0;
    } else {
      for (const s of [0, 1]) {
        const mine = parts.filter(p => p.side === s);
        mine.forEach((p, i) => {
          const hx = z.cx + (s ? 1 : -1) * z.hw * 0.62, hy = z.cy + (mine.length > 1 ? (i ? 1 : -1) * z.hh * 0.45 : 0);
          g.homes[p.id] = [Math.round(hx), Math.round(hy)];
        });
      }
      g.score = [0, 0]; g.server = Math.random() < 0.5 ? 0 : 1; g.rally = 0;
      g.ball = { x: z.cx, y: z.cy, z: 0, vx: 0, vy: 0, p: 0, fl: 1, tx: z.cx, ty: z.cy, from: -1, bounced: false };
    }
    for (const p of parts) if (p.cpu) { const [x, y] = g.homes[p.id]; g.cpus[p.id] = { x, y, ang: 0, mv: 0, think: 0, tx: x, ty: y }; }
    return g;
  }

  /** En todos: empieza un juego (el invitado crea su copia; cada uno se coloca en su sitio). */
  function applyStart(kind, meta, hostGame) {
    const g = hostGame || Object.assign({ kind, parts: meta.parts, homes: meta.homes, cpus: {}, phase: 'ready' }, games[kind] && games[kind].phase !== 'over' ? {} : {});
    if (!hostGame) {
      for (const p of meta.parts) if (p.cpu) { const [x, y] = meta.homes[p.id]; g.cpus[p.id] = { x, y, ang: 0, mv: 0 }; }
      games[kind] = g;
    }
    views[kind] = { anims: {}, cpus: {}, ball: null, bomb: null };
    G.Sprites.preload(meta.parts.map(p => p.dex));
    const me = meta.parts.find(p => p.id === meId());
    if (me) {
      const pl = G.Game.player, [x, y] = meta.homes[me.id];
      pl.x = x; pl.y = y;
      G.Spawner.say(G.T(kind === 'potato' ? '¡Patata caliente! Pásala antes de que explote' : kind === 'tennis' ? '¡Tenis! Devuelve la pelota a la otra pista' : '¡Voleibol! Que no caiga en tu campo'), 2.8, true);
    }
    const z = zone(kind);
    G.FX.ring(z.cx, z.cy, 10, kind === 'potato' ? z.r : z.hw, '#ffe14d', 0.6, 4);
    lastKey = '';
  }

  function applyEnd(kind, text) {
    const g = games[kind];
    if (g) g.phase = 'over';
    const z = zone(kind);
    G.Spawner.say(G.T(text) || text, 3.4, true);
    G.Audio.sfx('legend');
    G.FX.burst(z.cx, z.cy - 20, '#ffe14d', 40, 260);
    G.FX.burst(z.cx, z.cy - 20, '#7dffb0', 30, 220);
    setTimeout(() => { if (games[kind] === g) { delete games[kind]; delete views[kind]; } }, 3500);
    lastKey = '';
  }

  /** Efectos (en todos). */
  function fx(kind, x, y, who) {
    if (kind === 'hit' || kind === 'spike') {
      G.Audio.sfx('hit');
      G.FX.sp(kind === 'spike' ? 'pow' : 'impact', kind === 'spike' ? 'electric' : 'normal', x, y - 12, { life: 0.16, scale: kind === 'spike' ? 1.4 : 1.1, frameRate: 14 });
      if (who) swings[who] = performance.now();          // la raqueta / los brazos de quien golpea
      if (kind === 'spike') G.FX.dmgText(x, y - 40, G.T('¡Remate!'), '#fff36a', true);
    }
    else if (kind === 'bounce') { G.FX.burst(x, y, '#e8dcc0', 5, 60); G.FX.ring(x, y, 2, 14, '#ffffff', 0.25, 2); }
    else if (kind === 'point') { G.Audio.sfx('coin'); G.FX.ring(x, y, 6, 70, '#ffe14d', 0.4, 3); }
    else if (kind === 'out') { G.Audio.sfx('error'); G.FX.dmgText(x, y - 20, G.T('¡Fuera!'), '#ff8a95', true); G.FX.ring(x, y, 4, 40, '#ff5f6d', 0.35, 3); }
    else if (kind === 'pass') { G.Audio.sfx('select'); G.FX.ring(x, y, 4, 40, '#ff9a3d', 0.3, 3); }
    else if (kind === 'boom') {
      G.Audio.sfx('break'); G.Camera.kick(0.5);
      G.FX.ring(x, y, 8, 120, '#ff7b3d', 0.5, 6); G.FX.ring(x, y, 4, 70, '#ffe14d', 0.35, 4);
      G.FX.burst(x, y - 10, '#ff7b3d', 40, 280); G.FX.burst(x, y - 10, '#3a3a3a', 20, 160);
    }
  }
  function hostFx(kind, x, y, who) { x = Math.round(x); y = Math.round(y); fx(kind, x, y, who); emit(['plz', 'fx', kind, x, y, who || '']); }
  const swings = {};                         // id -> cuándo golpeó (para animar la raqueta)

  /**
   * Salir del juego en el que estás (2026-10-19, el dueño: «salir de un minijuego sin volver al
   * menú»). Pistas: se acaba el partido. Patata: quedas fuera y los demás siguen. Sigues en la zona.
   */
  function leaveGame(kind, who) {
    const g = games[kind];
    if (!g || g.phase === 'over' || !g.parts.some(p => p.id === who)) return;
    const name = (g.parts.find(p => p.id === who) || {}).name || '';
    if (kind === 'potato') {
      if (!g.alive.includes(who)) return;
      g.alive = g.alive.filter(id => id !== who); g.out.push(who);
      if (g.holder === who) { g.holder = g.alive[Math.floor(Math.random() * g.alive.length)] || null; }
      emit(['plz', 'st', kind, snapshot(g)]);
      if (g.alive.length <= 1) potatoOver(g);
      return;
    }
    g.phase = 'over';
    emit(['plz', 'st', kind, snapshot(g)]);
    const text = G.I18n.f('{x} ha dejado el partido', name);
    emit(['plz', 'end', kind, text]); applyEnd(kind, text);
  }

  // ---------------- tenis y voleibol (anfitrión) ----------------

  const sideOfX = (z, x) => (x < z.cx ? 0 : 1);

  /**
   * Saca o devuelve la pelota desde el lado `s` hacia un punto del otro campo. Tenis: parábola
   * que cae en el blanco (luego bota); voleibol: bombeada. `cpu`: a veces la manda fuera.
   * `aim`: inclinación (−1..1) de quien golpea al moverse arriba/abajo.
   */
  function launch(g, z, s, from, cpu, aim = 0) {
    const b = g.ball;
    let tx = z.cx + (s ? -1 : 1) * z.hw * (0.3 + Math.random() * 0.55);
    let ty = z.cy + G.U.clamp((Math.random() * 2 - 1) * 0.7 + aim * 0.5, -0.92, 0.92) * z.hh;
    if (cpu && Math.random() < CPU_MISS) {                 // fuera: larga o por un lado
      if (Math.random() < 0.5) tx = z.cx + (s ? -1 : 1) * (z.hw + 30 + Math.random() * 30);
      else ty = z.cy + (Math.random() < 0.5 ? -1 : 1) * (z.hh + 24 + Math.random() * 24);
    }
    b.x = from.x; b.y = from.y; b.from = s; b.bounced = false; b.tx = tx; b.ty = ty; b.hops = 0;
    if (g.kind === 'tennis') {
      const sp = Math.min(520, 250 + 16 * g.rally), d = Math.hypot(tx - b.x, ty - b.y) || 1, T = d / sp;
      b.vx = (tx - b.x) / d * sp; b.vy = (ty - b.y) / d * sp;
      b.z = T_HIT_Z; b.vz = GRAV * T / 2 - T_HIT_Z / T;       // llega a z=0 justo en el blanco
    } else {
      const d = Math.hypot(tx - b.x, ty - b.y);
      b.fl = G.U.clamp(d / 240, 0.95, 1.5) * Math.pow(0.97, g.rally); b.p = 0;
      b.vx = (tx - b.x) / b.fl; b.vy = (ty - b.y) / b.fl; b.sx = b.x; b.sy = b.y;
    }
  }
  const inCourt = (z, x, y) => Math.abs(x - z.cx) <= z.hw + 4 && Math.abs(y - z.cy) <= z.hh + 4;

  function point(g, z, winner, why) {
    g.score[winner]++;
    g.rally = 0;
    hostFx(why === 'out' ? 'out' : 'point', g.ball.x, g.ball.y);
    if (g.score[winner] >= WIN) {
      g.phase = 'over';
      const names = g.parts.filter(p => p.side === winner).map(p => p.name).join(' / ');
      emit(['plz', 'st', g.kind, snapshot(g)]);
      const text = G.I18n.f('¡Gana {x}! ({x})', names, g.score[winner] + ' : ' + g.score[1 - winner]);
      emit(['plz', 'end', g.kind, text]); applyEnd(g.kind, text);
      return;
    }
    g.server = 1 - winner;       // saca el que ha perdido el punto
    g.phase = 'ready'; g.t = 1.2;
  }

  function courtStep(g, dt) {
    const z = zone(g.kind), b = g.ball;
    if (g.phase === 'ready') {
      // La pelota espera delante del que saca (botando un poco en la mano).
      const srv = g.parts.find(p => p.side === g.server), sp = srv && posOf(g, srv.id);
      if (sp) { b.x = sp.x + (g.server ? -22 : 22); b.y = sp.y; b.z = (g.kind === 'volley' ? 26 : 12) + Math.abs(Math.sin(now() * 5)) * 8; b.vx = b.vy = 0; }
      if ((g.t -= dt) <= 0) { g.phase = 'play'; launch(g, z, g.server, b, srv && srv.cpu); hostFx('hit', b.x, b.y, srv ? srv.id : ''); }
      return;
    }
    if (g.phase !== 'play') return;
    if (g.kind === 'tennis') {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vz -= GRAV * dt; b.z += b.vz * dt;
      if (b.z <= 0) {
        b.z = 0;
        const recv = 1 - b.from;
        if (!b.bounced) {
          // Primer bote: fuera de la pista o en el campo de quien la golpeó → punto para el otro.
          if (!inCourt(z, b.x, b.y) || sideOfX(z, b.x) !== recv) { point(g, z, recv, 'out'); return; }
          b.bounced = true; b.vz = Math.abs(b.vz) * T_BOUNCE; b.vx *= 0.92; b.vy *= 0.92;
          hostFx('bounce', b.x, b.y);
        } else { point(g, z, b.from, 'twice'); return; }   // segundo bote sin devolverla
      }
      if (b.x < z.cx - z.hw - 120 || b.x > z.cx + z.hw + 120 || b.y < z.cy - z.hh - 120 || b.y > z.cy + z.hh + 120) { point(g, z, b.from, 'twice'); return; }
    } else {
      b.p += dt / b.fl;
      b.x = b.sx + (b.tx - b.sx) * Math.min(1, b.p); b.y = b.sy + (b.ty - b.sy) * Math.min(1, b.p);
      b.z = 4 * 72 * Math.min(1, b.p) * (1 - Math.min(1, b.p));
      if (b.p >= 1) {
        hostFx('bounce', b.x, b.y);
        // En la pista del otro: punto para quien la mandó; fuera: para el otro.
        if (!inCourt(z, b.x, b.y)) point(g, z, 1 - b.from, 'out');
        else point(g, z, 1 - sideOfX(z, b.x));
        return;
      }
    }
    // ¿Alguien del campo donde está la pelota la devuelve?
    const s = sideOfX(z, b.x);
    if (s !== b.from) {
      for (const p of g.parts) {
        if (p.side !== s) continue;
        const q = posOf(g, p.id);
        if (!q) continue;
        const reach = radius(q) + (g.kind === 'volley' ? 26 : 20);
        if (b.z > (g.kind === 'volley' ? V_REACH_Z : T_REACH_Z)) continue;
        if (G.U.dist2(q.x, q.y, b.x, b.y) > reach * reach) continue;
        g.rally++;
        // Personas: si te mueves arriba/abajo al golpear, la pelota sale hacia ese lado.
        const pl = !p.cpu && humanById(p.id);
        const aim = pl && pl.walking ? Math.sin(pl.moveAngle || 0) : 0;
        const spike = g.kind === 'volley' && b.z > 30;
        launch(g, z, s, b, p.cpu, aim);
        hostFx(spike ? 'spike' : 'hit', b.x, b.y, p.id);
        break;
      }
    }
  }

  /** CPU de las pistas: va a donde va a llegar la pelota (con algo de error); si no, a su sitio. */
  function courtCpu(g, dt) {
    const z = zone(g.kind), b = g.ball;
    for (const p of g.parts) {
      if (!p.cpu) continue;
      const c = g.cpus[p.id], [hx, hy] = g.homes[p.id];
      let tx = hx, ty = hy;
      const coming = g.phase === 'play' && b.from !== p.side;
      if (coming) {
        const mates = g.parts.filter(q => q.side === p.side);
        if (g.kind === 'volley') { tx = b.tx; ty = b.ty; }
        else {
          // Dónde cruzará la línea de su sitio.
          const k = b.vx ? (hx - b.x) / b.vx : 0;
          tx = hx; ty = b.y + b.vy * Math.max(0, k);
          if (ty < z.cy - z.hh || ty > z.cy + z.hh) ty = G.U.clamp(ty, z.cy - z.hh, z.cy + z.hh);
        }
        // 2 contra 2: cada uno cubre su mitad (arriba / abajo).
        if (mates.length > 1) {
          const top = mates.indexOf(p) === 0;
          if ((top && ty > z.cy + 10) || (!top && ty < z.cy - 10)) { tx = hx; ty = hy; }
        }
        if ((c.think -= dt) <= 0) { c.think = 0.25; c.err = (Math.random() * 2 - 1) * 18; }
        ty += c.err || 0;
      }
      const sp = (g.kind === 'volley' ? 175 : 190) * dt, dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
      if (d > 2) { c.x += dx / d * Math.min(d, sp); c.y += dy / d * Math.min(d, sp); c.ang = Math.atan2(dy, dx); c.mv = 1; } else c.mv = 0;
      // Cada uno en su campo.
      const minX = p.side ? z.cx + 14 : z.cx - z.hw - 30, maxX = p.side ? z.cx + z.hw + 30 : z.cx - 14;
      c.x = G.U.clamp(c.x, minX, maxX); c.y = G.U.clamp(c.y, z.cy - z.hh - 30, z.cy + z.hh + 30);
    }
  }

  // ---------------- patata caliente (anfitrión) ----------------

  function potatoRound(g) {
    g.round++;
    g.holder = G.U.pick(g.alive);
    g.bomb = null;
    g.fuse = FUSE_MIN + Math.random() * (FUSE_MAX - FUSE_MIN);
    g.fuseT = 0; g.passT = now(); g.lastFrom = null;
    g.phase = 'play';
  }

  function throwBomb(id, ang) {
    const g = games.potato;
    if (!g || g.phase !== 'play' || g.holder !== id || g.bomb) return;
    const q = posOf(g, id);
    if (!q) return;
    g.bomb = { x: q.x + Math.cos(ang) * 16, y: q.y + Math.sin(ang) * 16, vx: Math.cos(ang) * THROW_SPEED, vy: Math.sin(ang) * THROW_SPEED, ft: THROW_T, from: id, at: now() };
    g.holder = null;
    hostFx('pass', q.x, q.y);
  }

  function give(g, to, from) {
    g.holder = to; g.bomb = null; g.lastFrom = from; g.passT = now();
    const q = posOf(g, to);
    if (q) hostFx('pass', q.x, q.y);
  }

  function potatoStep(g, dt) {
    const z = zone('potato');
    if (g.phase === 'ready') { if ((g.t -= dt) <= 0) potatoRound(g); return; }
    if (g.phase === 'boom') { if ((g.t -= dt) <= 0) potatoRound(g); return; }
    if (g.phase !== 'play') return;
    // Quien se ha ido de la partida queda fuera.
    for (const id of g.alive.slice()) if (!posOf(g, id)) { g.alive = g.alive.filter(x => x !== id); g.out.push(id); if (g.holder === id) g.holder = G.U.pick(g.alive); }
    if (g.alive.length <= 1) return potatoOver(g);
    g.fuseT += dt;
    g.f = Math.round(Math.min(1, g.fuseT / g.fuse) * 100) / 100;
    const alive = g.alive.map(id => [id, posOf(g, id)]).filter(x => x[1]);
    if (g.bomb) {
      const bm = g.bomb;
      if (bm.ft > 0) { bm.x += bm.vx * dt; bm.y += bm.vy * dt; bm.ft -= dt; if (bm.ft <= 0) { bm.vx = bm.vy = 0; hostFx('bounce', bm.x, bm.y); } }
      // Que no salga del círculo.
      const d = Math.hypot(bm.x - z.cx, bm.y - z.cy);
      if (d > z.r - 8) { bm.x = z.cx + (bm.x - z.cx) / d * (z.r - 8); bm.y = z.cy + (bm.y - z.cy) / d * (z.r - 8); bm.vx = -bm.vx * 0.4; bm.vy = -bm.vy * 0.4; }
      for (const [id, q] of alive) {
        if (id === bm.from && now() - bm.at < 0.35) continue;
        if (G.U.dist2(q.x, q.y, bm.x, bm.y) < (radius(q) + 12) ** 2) { give(g, id, bm.from); break; }
      }
    } else if (g.holder) {
      const h = posOf(g, g.holder);
      if (h) for (const [id, q] of alive) {
        if (id === g.holder) continue;
        if (now() - g.passT < 0.6) break;
        if (id === g.lastFrom && now() - g.passT < 1.5) continue;
        if (G.U.dist2(q.x, q.y, h.x, h.y) < (radius(q) + radius(h) + 6) ** 2) { give(g, id, g.holder); break; }
      }
    }
    if (g.fuseT >= g.fuse) {
      // ¡Bum! Fuera quien la lleva (o quien la lanzó, si estaba en el suelo / en el aire).
      const victim = g.holder || (g.bomb && g.bomb.from);
      const q = victim && posOf(g, victim), b = g.bomb;
      hostFx('boom', q ? q.x : b ? b.x : z.cx, q ? q.y : b ? b.y : z.cy);
      if (victim) { g.alive = g.alive.filter(x => x !== victim); g.out.push(victim); }
      g.holder = null; g.bomb = null; g.f = 0;
      if (g.alive.length <= 1) return potatoOver(g);
      g.phase = 'boom'; g.t = 2;
    }
  }

  function potatoOver(g) {
    g.phase = 'over';
    const w = g.parts.find(p => p.id === g.alive[0]);
    emit(['plz', 'st', 'potato', snapshot(g)]);
    const text = w ? G.I18n.f('¡{x} sobrevive a la patata caliente!', w.name) : G.T('¡Nadie se libra de la patata caliente!');
    emit(['plz', 'end', 'potato', text]); applyEnd('potato', text);
  }

  /** CPU de la patata: con la bomba, a por el más cercano (y a veces la lanza); sin ella, lejos de la bomba. */
  function potatoCpu(g, dt) {
    const z = zone('potato');
    const bombAt = g.bomb ? g.bomb : g.holder ? posOf(g, g.holder) : null;
    for (const p of g.parts) {
      if (!p.cpu) continue;
      const c = g.cpus[p.id];
      if (!g.alive.includes(p.id)) { c.mv = 0; continue; }
      let tx = c.x, ty = c.y, sp = 165;
      if (g.phase === 'play' && g.holder === p.id) {
        let best = null, bd = Infinity;
        for (const id of g.alive) { if (id === p.id) continue; const q = posOf(g, id); if (!q) continue; const d = G.U.dist2(q.x, q.y, c.x, c.y); if (d < bd) { bd = d; best = q; } }
        if (best) {
          tx = best.x; ty = best.y; sp = 190;
          if (bd < 150 * 150 && Math.random() < dt * 1.1) throwBomb(p.id, Math.atan2(best.y - c.y, best.x - c.x));
        }
      } else if (g.phase === 'play' && g.bomb && g.bomb.ft <= 0 && G.U.dist2(g.bomb.x, g.bomb.y, c.x, c.y) < 90 * 90 && g.bomb.from !== p.id) {
        // La bomba en el suelo y cerca: que la coja otro… salvo que quede poca mecha para el que la tiró.
        tx = c.x + (c.x - g.bomb.x); ty = c.y + (c.y - g.bomb.y);
      } else if (bombAt) {
        if ((c.think -= dt) <= 0) { c.think = 0.5 + Math.random() * 0.4; c.jit = (Math.random() * 2 - 1) * 1.2; }
        const a = Math.atan2(c.y - bombAt.y, c.x - bombAt.x) + (c.jit || 0);
        tx = c.x + Math.cos(a) * 60; ty = c.y + Math.sin(a) * 60;
      }
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
      if (d > 3) { c.x += dx / d * Math.min(d, sp * dt); c.y += dy / d * Math.min(d, sp * dt); c.ang = Math.atan2(dy, dx); c.mv = 1; } else c.mv = 0;
      const r = Math.hypot(c.x - z.cx, c.y - z.cy), max = z.r - 14;
      if (r > max) { c.x = z.cx + (c.x - z.cx) / r * max; c.y = z.cy + (c.y - z.cy) / r * max; }
    }
  }

  /** Lo que se manda a los invitados. */
  function snapshot(g) {
    const cpus = {};
    for (const id in g.cpus) { const c = g.cpus[id]; cpus[id] = { x: Math.round(c.x), y: Math.round(c.y), ang: Math.round(c.ang * 100) / 100, mv: c.mv }; }
    const s = { phase: g.phase, cpus };
    // (Sin null: por la red se pierden los campos null y el invitado se quedaba con el valor viejo.)
    if (g.kind === 'potato') Object.assign(s, { alive: g.alive, out: g.out, holder: g.holder || '', f: g.f, round: g.round,
      bomb: g.bomb ? { x: Math.round(g.bomb.x), y: Math.round(g.bomb.y), vx: Math.round(g.bomb.vx), vy: Math.round(g.bomb.vy), ft: g.bomb.ft, from: g.bomb.from } : 0 });
    else { const b = g.ball; Object.assign(s, { score: g.score, server: g.server, ball: { x: Math.round(b.x), y: Math.round(b.y), z: Math.round(b.z), vz: Math.round(b.vz || 0), vx: Math.round(b.vx), vy: Math.round(b.vy), p: b.p, fl: b.fl, sx: b.sx, sy: b.sy, tx: b.tx, ty: b.ty, from: b.from } }); }
    return s;
  }

  // ---------------- cada fotograma ----------------

  function update(dt, pl) {
    if (!on()) return;
    const host = authority();
    if (host) {
      for (const k in games) {
        const g = games[k];
        if (g.phase === 'over') continue;
        if (k === 'potato') { potatoCpu(g, dt); potatoStep(g, dt); } else { courtCpu(g, dt); courtStep(g, dt); }
      }
      if (G.Coop.active && (snapT -= dt) <= 0) {
        snapT = SNAP;
        for (const k in games) if (games[k].phase !== 'over') emit(['plz', 'st', k, snapshot(games[k])]);
      }
    } else {
      // Invitado: la pelota y la bomba siguen su camino entre foto y foto.
      for (const k in games) {
        const g = games[k];
        if (g.ball && g.phase === 'play') {
          const b = g.ball;
          if (k === 'tennis') {
            b.x += b.vx * dt; b.y += b.vy * dt; b.vz = (b.vz || 0) - GRAV * dt; b.z = (b.z || 0) + b.vz * dt;
            if (b.z < 0) { b.z = 0; b.vz = Math.abs(b.vz) * T_BOUNCE; }
          }
          else { b.p = Math.min(1, (b.p || 0) + dt / (b.fl || 1)); b.x = b.sx + (b.tx - b.sx) * b.p; b.y = b.sy + (b.ty - b.sy) * b.p; b.z = 4 * 72 * b.p * (1 - b.p); }
        }
        if (g.bomb && g.bomb.ft > 0) { g.bomb.x += g.bomb.vx * dt; g.bomb.y += g.bomb.vy * dt; g.bomb.ft -= dt; }
      }
    }
    // Tu Pokémon: en tu campo o dentro del círculo mientras juegas.
    keepInside(pl);
    // Lanzar la bomba (F o el botón).
    const pg = games.potato;
    if (pg && pg.phase === 'play' && pg.holder === meId() && G.Input.tap('keyf')) throwMine();
    smooth(dt);
    if ((hudT -= dt) <= 0) { hudT = 0.15; drawHud(); }
    if (hud) hud.style.display = G.UI.isOpen('scr-pause') ? 'none' : '';
    hutCheck(pl);
  }

  function throwMine() {
    const pl = G.Game.player;
    const a = pl.walking ? pl.moveAngle : (pl.aim != null ? pl.aim : pl.moveAngle || 0);
    ask(['plz', 'throw', Math.round(a * 1000) / 1000]);
  }

  function keepInside(pl) {
    const me = meId();
    for (const k in games) {
      const g = games[k];
      if (g.phase === 'over') continue;
      const p = g.parts.find(q => q.id === me);
      if (!p) continue;
      const z = zone(k);
      if (k === 'potato') {
        if (!g.alive || !g.alive.includes(me)) continue;
        const r = Math.hypot(pl.x - z.cx, pl.y - z.cy), max = z.r - 14;
        if (r > max) { pl.x = z.cx + (pl.x - z.cx) / r * max; pl.y = z.cy + (pl.y - z.cy) / r * max; }
      } else {
        const minX = p.side ? z.cx + 14 : z.cx - z.hw - 30, maxX = p.side ? z.cx + z.hw + 30 : z.cx - 14;
        pl.x = G.U.clamp(pl.x, minX, maxX); pl.y = G.U.clamp(pl.y, z.cy - z.hh - 30, z.cy + z.hh + 30);
      }
    }
  }

  /** Lo que se dibuja: las CPU van suaves hacia donde dice el anfitrión. */
  function smooth(dt) {
    for (const k in games) {
      const g = games[k], v = views[k] || (views[k] = { anims: {}, cpus: {} });
      for (const p of g.parts) {
        if (!p.cpu) continue;
        const c = g.cpus[p.id];
        if (!c) continue;
        let s = v.cpus[p.id];
        if (!s) s = v.cpus[p.id] = { x: c.x, y: c.y };
        if (authority()) { s.x = c.x; s.y = c.y; } else { s.x = G.U.damp(s.x, c.x, 14, dt); s.y = G.U.damp(s.y, c.y, 14, dt); }
        let an = v.anims[p.id];
        if (!an) an = v.anims[p.id] = new G.Sprites.Animator(p.dex, 1, false);
        an.dir = G.Sprites.dirFromAngle(c.ang || 0);
        if (!an.busy()) an.loop(c.mv ? 'Walk' : 'Idle');
        an.update(dt);
      }
    }
  }

  // ---------------- la caseta de cartas ----------------

  function hutCheck(pl) {
    const [hx, hy] = padOf('hut');
    const inside = G.U.dist2(pl.x, pl.y, hx, hy) < 46 * 46;
    if (inside && performance.now() - hutTold > 4000) {
      hutTold = performance.now();
      if (!G.Social.room) G.Spawner.say(G.T('Las mesas de cartas se juegan en una sala: entra en «Jugar con amigos».'), 3.2, true);
      else if (!(G.Social.room && G.Social.room.isHost)) G.Spawner.say(G.T('Cuando el anfitrión entre en la caseta, elegirá la mesa.'), 3, true);
    }
  }

  /** Anfitrión en la caseta: elige mesa → todos a la sala → empieza la fiesta de mesa. */
  function goTable(game) {
    const room = G.Social.room;
    if (!room || !room.isHost) return;
    closeAll(game);
    G.Spawner.say(G.T('Vamos a la mesa de cartas…'), 2, true);
    setTimeout(() => {
      if (on()) G.Game.quit();
      setTimeout(() => { if (G.LobbyUI.startParty) G.LobbyUI.startParty(game); }, 900);
    }, 400);
  }

  // ---------------- HUD (botones) ----------------

  function showHud() {
    if (hud) hud.remove();
    hud = document.createElement('div');
    hud.id = 'plaza-hud';
    document.body.appendChild(hud);
    lastKey = '';
    drawHud();
  }

  /** Qué rincón tienes delante (cartel) o en el que juegas. */
  function hereOf(pl) {
    for (const k of ['tennis', 'volley', 'potato', 'hut']) {
      const [x, y] = padOf(k);
      if (G.U.dist2(pl.x, pl.y, x, y) < PAD_R * PAD_R) return k;
    }
    return null;
  }

  function drawHud() {
    if (!hud) return;
    const pl = G.Game.player;
    if (!pl) return;
    const me = meId(), host = authority(), room = G.Social.room;
    const playing = Object.keys(games).find(k => games[k].phase !== 'over' && games[k].parts.some(p => p.id === me));
    const here = hereOf(pl);
    let key = 'x', html = '';
    const top = `<div class="pz-top"><b>${G.T('Zona de fiesta')}</b>
      <button class="btn small ghost" data-pz="quit">${G.T(G.Coop.active && host ? 'Cerrar la zona' : 'Salir de la zona')}</button></div>`;
    if (playing) {
      const g = games[playing];
      if (playing === 'potato') {
        const out = !g.alive || !g.alive.includes(me);
        const mine = g.holder === me && g.phase === 'play';
        key = 'pot:' + out + mine + (g.alive || []).length + g.phase;
        html = `<div class="pz-card">${out ? G.T('Estás fuera: mira cómo acaba.') : mine ? `<b class="pz-hot">${G.T('¡Tienes la bomba!')}</b> <span class="pz-tip">${G.T('Toca a alguien o lánzala')}</span>`
          : G.T('¡Huye de quien lleve la bomba!')}
          <span class="pz-sub">${G.I18n.f('Quedan {x}', (g.alive || []).length)}</span>
          ${mine ? `<button class="btn gold pz-big" data-pz="throw">${G.T('Lanzar la bomba')} <kbd>F</kbd></button>` : ''}
          ${out || g.phase === 'over' ? '' : `<button class="btn small ghost" data-pz="leave:potato">${G.T('Dejar el partido')}</button>`}</div>`;
      } else {
        const p = g.parts.find(q => q.id === me), sc = g.score || [0, 0];
        key = 'court:' + playing + sc.join('-') + g.phase;
        html = `<div class="pz-card"><b>${G.T(playing === 'tennis' ? 'Tenis' : 'Voleibol')}</b>
          <span class="pz-score">${sc[0]} : ${sc[1]}</span>
          <span class="pz-sub">${G.T(p && p.side ? 'Juegas en el campo de la derecha' : 'Juegas en el campo de la izquierda')} · ${G.I18n.f('Gana quien llegue a {x}', WIN)}</span>
          ${g.phase === 'over' ? '' : `<button class="btn small ghost" data-pz="leave:${playing}">${G.T('Dejar el partido')}</button>`}</div>`;
      }
    } else if (here === 'tennis' || here === 'volley') {
      const busy = games[here] && games[here].phase !== 'over';
      key = 'pad:' + here + busy;
      html = `<div class="pz-card"><b>${G.T(here === 'tennis' ? 'Pista de tenis' : 'Pista de voleibol')}</b>
        <span class="pz-sub">${G.T(busy ? 'Ya están jugando: espera a que acaben.' : 'Juegan los que estén en la pista o en el cartel; las CPU completan.')}</span>
        ${busy ? '' : `<div class="pz-row"><button class="btn gold" data-pz="go:${here}:1">${G.T('1 contra 1')}</button>
          <button class="btn gold" data-pz="go:${here}:2">${G.T('2 contra 2')}</button></div>`}</div>`;
    } else if (here === 'potato') {
      const busy = games.potato && games.potato.phase !== 'over';
      key = 'pad:potato' + busy;
      html = `<div class="pz-card"><b>${G.T('Patata caliente')}</b>
        <span class="pz-sub">${G.T(busy ? 'Ya están jugando: espera a que acaben.' : 'Pasa la bomba tocando a alguien o lánzala. Explota entre 5 y 10 s: el que la tenga, fuera.')}</span>
        ${busy ? '' : `<button class="btn gold" data-pz="go:potato:0">${G.T('Empezar la patata caliente')}</button>`}</div>`;
    } else if (here === 'hut') {
      const can = room && room.isHost;
      key = 'hut' + can;
      html = `<div class="pz-card"><b>${G.T('Caseta de cartas')}</b>
        <span class="pz-sub">${G.T(!room ? 'Las mesas de cartas se juegan en una sala: entra en «Jugar con amigos».' : can ? 'Elige una mesa: todos volvéis a la sala y empieza la partida.' : 'Cuando el anfitrión entre en la caseta, elegirá la mesa.')}</span>
        ${can ? `<div class="pz-row">${G.Party.games().filter(d => !d.world && !d.soon).map(d => `<button class="btn gold" data-pz="table:${d.id}">${G.T(d.name)}</button>`).join('')}</div>` : ''}</div>`;
    } else {
      key = 'free';
      html = `<div class="pz-card pz-hint">${G.T('Acércate a un cartel: tenis, voleibol, patata caliente o la caseta de cartas.')}</div>`;
    }
    key += '|' + G.I18n.lang;
    if (key === lastKey) return;
    lastKey = key;
    hud.innerHTML = top + html;
    hud.querySelectorAll('[data-pz]').forEach(b => {
      b.onclick = e => {
        e.currentTarget.blur();
        const [what, a, c] = b.dataset.pz.split(':');
        if (what === 'quit') { if (G.Coop.active && authority()) { closeAll(''); setTimeout(() => G.Game.quit(), 300); } else G.Game.quit(); }
        else if (what === 'go') { G.Audio.sfx('click'); ask(['plz', 'go', a, +c || 0]); }
        else if (what === 'throw') throwMine();
        else if (what === 'leave') { G.Audio.sfx('back'); ask(['plz', 'leave', a]); }
        else if (what === 'table') goTable(a);
      };
    });
  }

  // ---------------- dibujo ----------------

  const R = Math.round;
  /** Disco de píxeles (bandas de `st` px). */
  function disc(ctx, cx, cy, r, col, st = 4) {
    ctx.fillStyle = col;
    for (let dy = -r; dy < r; dy += st) {
      const yy = dy + st / 2, half = Math.sqrt(Math.max(0, r * r - yy * yy));
      ctx.fillRect(R(cx - half), R(cy + dy), R(half * 2), st);
    }
  }
  /** Aro de píxeles. */
  function ringPx(ctx, cx, cy, r, col, st = 4) {
    ctx.fillStyle = col;
    const n = Math.max(24, Math.round(r * 2 * Math.PI / st));
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ctx.fillRect(R(cx + Math.cos(a) * r - st / 2), R(cy + Math.sin(a) * r - st / 2), st, st); }
  }
  function label(ctx, txt, x, y, col, size = 12) {
    ctx.font = `800 ${size}px Pixelify,"Segoe UI",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
  }
  /** Cartel de madera de píxeles con su texto. */
  function sign(ctx, x, y, txt, col) {
    ctx.font = '800 12px Pixelify,"Segoe UI",system-ui,sans-serif';
    const w = Math.max(70, ctx.measureText(txt).width + 18), h = 22;
    ctx.fillStyle = '#4a2c14'; ctx.fillRect(R(x - 3), R(y), 6, 26);
    ctx.fillStyle = '#2a1608'; ctx.fillRect(R(x - w / 2 - 2), R(y - h - 2), R(w + 4), h + 4);
    ctx.fillStyle = '#9a6630'; ctx.fillRect(R(x - w / 2), R(y - h), R(w), h);
    ctx.fillStyle = '#c08a4a'; ctx.fillRect(R(x - w / 2), R(y - h), R(w), 3);
    label(ctx, txt, x, y - 6, col, 12);
  }

  /** Ruido fijo por posición (granos de arena, motas): siempre igual en el mismo sitio. */
  const hash = (x, y) => { const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return h - Math.floor(h); };

  function court(ctx, kind, t) {
    const z = zone(kind), x0 = R(z.cx - z.hw), y0 = R(z.cy - z.hh), w = R(z.hw * 2), h = R(z.hh * 2);
    const tennis = kind === 'tennis';
    if (tennis) {
      // Pista dura: azul dentro, verde fuera, con un borde oscuro.
      ctx.fillStyle = '#1f4a34'; ctx.fillRect(x0 - 34, y0 - 34, w + 68, h + 68);
      ctx.fillStyle = '#3a7d52'; ctx.fillRect(x0 - 30, y0 - 30, w + 60, h + 60);
      ctx.fillStyle = '#2f5f9a'; ctx.fillRect(x0, y0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      for (let yy = y0; yy < y0 + h; yy += 4) for (let xx = x0; xx < x0 + w; xx += 4) if (hash(xx, yy) > 0.86) ctx.fillRect(xx, yy, 2, 2);
      // Líneas: dobles, individuales, saque, central y marcas del fondo.
      const L = (x, y, ww, hh) => ctx.fillRect(R(x), R(y), R(ww), R(hh));
      ctx.fillStyle = '#f4f8ff';
      L(x0, y0, w, 3); L(x0, y0 + h - 3, w, 3); L(x0, y0, 3, h); L(x0 + w - 3, y0, 3, h);
      const alley = h * 0.12;
      L(x0, y0 + alley, w, 2); L(x0, y0 + h - alley - 2, w, 2);
      const sv = z.hw * 0.52;
      L(z.cx - sv, y0 + alley, 2, h - alley * 2); L(z.cx + sv - 2, y0 + alley, 2, h - alley * 2);
      L(z.cx - sv, z.cy - 1, sv * 2, 2);
      L(x0, z.cy - 1, 8, 2); L(x0 + w - 8, z.cy - 1, 8, 2);
    } else {
      // Arena de playa con granos, y una cinta azul de borde.
      ctx.fillStyle = '#b8924e'; ctx.fillRect(x0 - 32, y0 - 32, w + 64, h + 64);
      ctx.fillStyle = '#e2c07e'; ctx.fillRect(x0 - 28, y0 - 28, w + 56, h + 56);
      for (let yy = y0 - 28; yy < y0 + h + 28; yy += 4) for (let xx = x0 - 28; xx < x0 + w + 28; xx += 4) {
        const k = hash(xx, yy);
        if (k > 0.9) { ctx.fillStyle = '#f2d89a'; ctx.fillRect(xx, yy, 2, 2); }
        else if (k < 0.07) { ctx.fillStyle = '#c49a58'; ctx.fillRect(xx, yy, 2, 2); }
      }
      ctx.fillStyle = '#2f6fc0';
      ctx.fillRect(x0, y0, w, 4); ctx.fillRect(x0, y0 + h - 4, w, 4); ctx.fillRect(x0, y0, 4, h); ctx.fillRect(x0 + w - 4, y0, 4, h);
      ctx.fillStyle = '#9fd0ff';
      ctx.fillRect(x0, y0, w, 1); ctx.fillRect(x0, y0 + h - 4, w, 1);
      // Líneas de ataque (discontinuas).
      ctx.fillStyle = 'rgba(47,111,192,.75)';
      for (const ax of [z.cx - z.hw * 0.34, z.cx + z.hw * 0.34]) for (let yy = y0 + 6; yy < y0 + h - 6; yy += 10) ctx.fillRect(R(ax - 1), yy, 3, 6);
    }
    // Red: sombra, malla, cinta blanca y postes (la de voleibol, más alta y con antenas).
    const nx = R(z.cx), top = y0 - (tennis ? 12 : 22), bot = y0 + h + (tennis ? 12 : 22);
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(nx + 3, top + 6, 6, bot - top);
    ctx.fillStyle = 'rgba(20,24,34,.55)'; ctx.fillRect(nx - 3, top, 6, bot - top);
    ctx.fillStyle = '#dfe6f2';
    for (let yy = top; yy < bot; yy += 4) { ctx.fillRect(nx - 3, yy, 6, 1); }
    for (let yy = top; yy < bot; yy += 2) { ctx.fillRect(nx - 3 + ((yy >> 1) % 3) * 2, yy, 1, 1); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(nx - 4, top, 2, bot - top);
    const post = (y) => {
      ctx.fillStyle = '#1a1c26'; ctx.fillRect(nx - 6, y - 6, 12, 12);
      ctx.fillStyle = tennis ? '#5a6478' : '#c8cfdc'; ctx.fillRect(nx - 4, y - 4, 8, 8);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(nx - 4, y - 4, 3, 3);
    };
    post(top - 4); post(bot + 4);
    if (!tennis) for (const yy of [y0 - 2, y0 + h - 22]) for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#ffffff' : '#e8323a'; ctx.fillRect(nx - 2, yy + k * 4, 4, 4); }
    const [px, py] = padOf(kind);
    pad(ctx, px, py, t);
    sign(ctx, px, py - 26, G.T(tennis ? 'Pista de tenis' : 'Pista de voleibol'), tennis ? '#c8ff7a' : '#ffe08a');
  }

  function pad(ctx, x, y, t) {
    const k = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.globalAlpha = 0.35 + 0.3 * k;
    ringPx(ctx, x, y, PAD_R - 12, '#ffe14d', 4);
    ctx.globalAlpha = 1;
  }

  function potatoGround(ctx, t) {
    const z = zone('potato');
    disc(ctx, z.cx, z.cy, z.r + 10, '#5a2e1e', 4);
    disc(ctx, z.cx, z.cy, z.r, '#8a4a2a', 4);
    disc(ctx, z.cx, z.cy, z.r - 18, '#9a5a32', 4);
    ringPx(ctx, z.cx, z.cy, z.r - 2, '#ffb03a', 4);
    // Marcas de explosiones viejas (decorado).
    ctx.fillStyle = 'rgba(30,20,20,.35)';
    for (let i = 0; i < 5; i++) { const a = i * 2.4, d = z.r * (0.25 + (i % 3) * 0.2); ctx.fillRect(R(z.cx + Math.cos(a) * d - 6), R(z.cy + Math.sin(a) * d - 3), 12, 6); }
    const [px, py] = padOf('potato');
    pad(ctx, px, py, t);
    sign(ctx, px, py - 26, G.T('Patata caliente'), '#ffb06a');
  }

  function drawGround(ctx) {
    if (!on()) return;
    const t = performance.now() / 1000;
    ctx.save();
    court(ctx, 'tennis', t);
    court(ctx, 'volley', t);
    potatoGround(ctx, t);
    // Camino de baldosas entre los rincones (para que se vea que es una plaza).
    const [cx, cy] = center();
    ctx.fillStyle = 'rgba(230,220,190,.18)';
    for (let i = -18; i <= 18; i++) ctx.fillRect(R(cx + i * 22 - 8), R(cy - 6), 16, 12);
    for (let i = -10; i <= 10; i++) ctx.fillRect(R(cx - 6), R(cy + i * 22 - 8), 12, 16);
    const [hx, hy] = padOf('hut');
    pad(ctx, hx, hy, t);
    ctx.restore();
  }

  /** Lo que tiene pies y va ordenado por Y: la caseta y las CPU. */
  function drawables() {
    if (!on()) return [];
    const out = [];
    const hz = zone('hut');
    out.push({ y: hz.cy, draw(ctx) {
      G.Pickups.sprite(ctx, 'shopdoor', 0, hz.cx, hz.cy - 36, 2);
      label(ctx, G.T('Caseta de cartas'), hz.cx, hz.cy - 92, '#9fe0b0', 12);
    } });
    for (const k in games) {
      const g = games[k], v = views[k];
      if (!v) continue;
      for (const p of g.parts) {
        if (!p.cpu) continue;
        const s = v.cpus[p.id], an = v.anims[p.id];
        if (!s || !an) continue;
        const outP = k === 'potato' && g.out && g.out.includes(p.id);
        out.push({ y: s.y, draw(ctx) {
          G.Sprites.drawShadow(ctx, p.dex, s.x, s.y, 1);
          an.draw(ctx, s.x, s.y, { alpha: outP ? 0.4 : 1 });
          label(ctx, p.name, s.x, s.y - 40, '#cfd8ea', 9);
        } });
      }
    }
    return out;
  }

  /** Pelota redonda de píxeles: tenis amarilla-verde con la costura blanca; voleibol blanca con gajos azules y amarillos. */
  function ballPx(ctx, x, y, kind, spin) {
    const tennis = kind === 'tennis', r = tennis ? 5 : 7;
    disc(ctx, x, y, r + 1, tennis ? '#2e3a0c' : '#1e2a4a', 1);
    disc(ctx, x, y, r, tennis ? '#c8f04a' : '#f4f8ff', 1);
    const a = spin || 0;
    if (tennis) {
      // Costura: un arco blanco que gira.
      ctx.fillStyle = '#ffffff';
      for (let k = -3; k <= 3; k++) { const q = a + k * 0.32; ctx.fillRect(R(x + Math.cos(q) * (r - 2)), R(y + Math.sin(q) * (r - 2) * 0.6 - 1), 1, 1); }
      ctx.fillStyle = '#eaff9a'; ctx.fillRect(R(x - 3), R(y - 3), 2, 2);
    } else {
      // Gajos de color que giran.
      for (let k = 0; k < 3; k++) {
        const q = a + k * 2.09;
        ctx.fillStyle = k === 1 ? '#ffd23f' : '#3a7bd5';
        for (let d = 2; d < r; d++) ctx.fillRect(R(x + Math.cos(q) * d), R(y + Math.sin(q) * d), 2, 2);
      }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(R(x - 4), R(y - 4), 2, 2);
    }
  }
  /** Raqueta de píxeles en la mano (de frente; al golpear, gira). col: el color de su equipo. */
  function racket(ctx, x, y, side, col, swing) {
    const dir = side ? -1 : 1, k = swing == null ? 0 : Math.min(1, swing / 0.2);
    const ang = swing == null ? -0.5 : -1.6 + 3.0 * k;
    ctx.save();
    ctx.translate(R(x + dir * 10), R(y));
    ctx.rotate(ang * dir); ctx.scale(dir, 1);
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-1, 0, 3, 7);
    ctx.fillStyle = '#1b1528'; ctx.fillRect(-4, -12, 9, 12);
    ctx.fillStyle = col; ctx.fillRect(-3, -11, 7, 10);
    ctx.fillStyle = 'rgba(240,244,255,.85)'; ctx.fillRect(-2, -10, 5, 8);
    ctx.fillStyle = col; for (let i = -9; i < -2; i += 2) ctx.fillRect(-2, i, 5, 1);
    ctx.restore();
    if (swing != null && swing < 0.18) {                  // estela del golpe
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < 5; i++) { const q = -1.2 + i * 0.5; ctx.fillRect(R(x + dir * (10 + Math.cos(q) * 14)), R(y - 6 + Math.sin(q) * 12), 2, 2); }
    }
  }
  /** Marcador de la pista: tablero oscuro con los dos equipos (su color) y quién saca. */
  function scoreboard(ctx, g, z) {
    const sc = g.score || [0, 0], side = s => g.parts.filter(p => p.side === s).map(p => p.name).join(' / ');
    // Debajo de la pista, a la izquierda del cartel (arriba lo tapaba el panel de la zona).
    const W = 260, H = 34, cx = R(z.cx - z.hw + W / 2 - 20), y = R(z.cy + z.hh + 40);
    ctx.fillStyle = '#0f0c16'; ctx.fillRect(cx - W / 2 - 3, y - 3, W + 6, H + 6);
    ctx.fillStyle = '#2a2438'; ctx.fillRect(cx - W / 2, y, W, H);
    ctx.fillStyle = SIDE_COL[0]; ctx.fillRect(cx - W / 2, y, 4, H);
    ctx.fillStyle = SIDE_COL[1]; ctx.fillRect(cx + W / 2 - 4, y, 4, H);
    ctx.fillStyle = '#3a3350'; ctx.fillRect(cx - 34, y + 3, 68, H - 6);
    label(ctx, `${sc[0]} : ${sc[1]}`, cx, y + 24, '#ffe14d', 18);
    ctx.font = '800 10px Pixelify,"Segoe UI",system-ui,sans-serif';
    const nm = (t, x, col, al) => { ctx.textAlign = al; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(t, x, y + 21); ctx.fillStyle = col; ctx.fillText(t, x, y + 21); };
    nm(side(0).slice(0, 18), cx - 42, '#cfe8ff', 'right');
    nm(side(1).slice(0, 18), cx + 42, '#ffd0e4', 'left');
    if (g.phase === 'ready') {                            // pelotita junto a quien saca
      const sx = g.server ? cx + W / 2 - 14 : cx - W / 2 + 14;
      disc(ctx, sx, y + 17, 3, '#ffe14d', 1);
    }
  }

  /** Bomba de píxeles: cuerpo, brillo, mecha y chispa; parpadea en rojo cada vez más deprisa. */
  function bombPx(ctx, x, y, f, t) {
    const hz = 2 + 14 * f * f, red = Math.sin(t * hz * Math.PI * 2) > 0.2;
    ctx.fillStyle = '#0f0c16'; disc(ctx, x, y, 9, '#0f0c16', 2);
    disc(ctx, x, y, 7, red ? '#c8282a' : '#3a3a4a', 2);
    ctx.fillStyle = red ? '#ff8a95' : '#8a8aa0'; ctx.fillRect(R(x - 4), R(y - 4), 3, 3);
    ctx.fillStyle = '#6b4220'; ctx.fillRect(R(x + 3), R(y - 11), 2, 4); ctx.fillRect(R(x + 5), R(y - 13), 2, 2);
    const sp = Math.floor(t * 20) % 2;
    ctx.fillStyle = sp ? '#ffe14d' : '#ff9a3d'; ctx.fillRect(R(x + 5 + sp), R(y - 16 - sp), 3, 3);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(R(x + 6), R(y - 15), 1, 1);
  }

  function drawAir(ctx) {
    if (!on()) return;
    const t = performance.now() / 1000;
    ctx.save();
    for (const k in games) {
      const g = games[k], z = zone(k);
      if (k !== 'potato') {
        const b = g.ball, v = views[k] || (views[k] = { anims: {}, cpus: {} });
        // Raquetas (tenis) en la mano de cada uno, del color de su equipo; giran al golpear.
        if (k === 'tennis') for (const p of g.parts) {
          const s2 = p.cpu ? v.cpus[p.id] : posOf(g, p.id);
          if (!s2) continue;
          const sw = swings[p.id] ? (performance.now() - swings[p.id]) / 1000 : null;
          racket(ctx, s2.x, s2.y - 18, p.side, SIDE_COL[p.side], sw != null && sw < 0.3 ? sw : null);
        }
        if (b && g.phase !== 'over') {
          const zz = Math.max(0, b.z || 0);
          // Sombra: más pequeña y clara cuanto más alta va la pelota.
          const sk = Math.max(0.35, 1 - zz / 90);
          ctx.fillStyle = `rgba(0,0,0,${0.35 * sk})`; ctx.fillRect(R(b.x - 6 * sk), R(b.y - 2), R(12 * sk), 4);
          // Estela.
          const tr = v.trail || (v.trail = []);
          tr.push([b.x, b.y - zz]); if (tr.length > 6) tr.shift();
          tr.forEach(([tx, ty], i) => { ctx.fillStyle = `rgba(255,255,255,${0.08 + i * 0.05})`; ctx.fillRect(R(tx - 2), R(ty - 2), 4, 4); });
          v.spin = (v.spin || 0) + Math.hypot(b.vx || 0, b.vy || 0) / 1500;
          ballPx(ctx, b.x, b.y - zz, k, v.spin);
        } else if (v.trail) v.trail.length = 0;
        scoreboard(ctx, g, z);
      } else {
        const f = g.f || 0;
        let bx = null, by = null;
        if (g.bomb) { bx = g.bomb.x; by = g.bomb.y - (g.bomb.ft > 0 ? 18 : 6); }
        else if (g.holder && g.phase === 'play') { const q = posOf(g, g.holder), s = views.potato && views.potato.cpus[g.holder]; const h = s || q; if (h) { bx = h.x; by = h.y - (q && q.bodyH ? q.bodyH : 34) - 16; } }
        if (bx != null) bombPx(ctx, bx, by, f, t);
        // Los que han quedado fuera: una X roja encima.
        for (const id of g.out || []) {
          const s = views.potato && views.potato.cpus[id], q = s || posOf(g, id);
          if (!q) continue;
          label(ctx, '✕', q.x, q.y - 44, '#ff5f6d', 14);
        }
        if (g.phase === 'ready' || g.phase === 'boom') label(ctx, G.T(g.phase === 'boom' ? '¡BUM!' : 'Preparados…'), z.cx, z.cy - z.r - 20, '#ffb06a', 16);
        label(ctx, G.I18n.f('Quedan {x}', (g.alive || []).length), z.cx, z.cy + z.r + 2, '#ffe0b0', 11);
      }
    }
    ctx.restore();
  }

  // ---------------- registro en la Fiesta de la sala ----------------
  // world: no es de mesa; social-ui.js empieza una partida en el mundo (G.Modes.run 'plaza').
  function register() {
    if (!G.Party || !G.Party.register) return;
    G.Party.register({ id: 'plaza', name: 'Zona de fiesta', world: true, minPlayers: 1, maxPlayers: 4,
      desc: 'Un patio para todos: tenis, voleibol, patata caliente y la caseta de las mesas de cartas.' });
    G.Party.register({ id: 'potato', name: 'Patata caliente', world: true, minPlayers: 1, maxPlayers: 4,
      desc: 'Pasa la bomba (tocando a otro o lanzándola) antes de que explote. Gana el último que quede.' });
  }
  register();

  return { soloStart, begin, end, update, closeAll, onClient, onNet, drawGround, drawables, drawAir, startGame, throwBomb,
           zone, padOf, get games() { return games; }, get opts() { return opts; } };
})();
