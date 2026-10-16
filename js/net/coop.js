/* ============ coop.js — partida cooperativa (hasta 4 jugadores) ============
 *
 * Quién manda en qué:
 *   ANFITRIÓN   enemigos (aparición, IA, vida, muerte), objetos del suelo,
 *               experiencia y nivel del equipo, reloj, fin de la partida.
 *   CADA UNO    su propio Pokémon: posición, vida, ataques y lo que le golpea.
 *               Sus golpes a enemigos se mandan al anfitrión, que los aplica.
 *
 * Los invitados ven COPIAS de los enemigos del anfitrión (enemy.remote) y los
 * ataques de los compañeros como "fantasmas" que no hacen daño (ver combat.js).
 *
 * Mensajes (por net.js, unas 15 veces por segundo; 5 si va por el relé):
 *   invitado -> anfitrión  { k:'f', p:[estado], ev:[eventos] }
 *   anfitrión -> invitado  { k:'f', t, lv, xp, xn, ki, bo, co, p:{uid:[estado]},
 *                            e:[[id,x,y,vida,anim,dir,estados]], ev:[eventos] }
 *   anfitrión -> todos     { k:'start', seed, host, members:[{uid,name,dex,shiny}] }
 */
G.Coop = (() => {
  const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];
  const COLORS = ['#ffcb3d', '#5fc8ff', '#7ee07a', '#ff8ad8'];
  // Mensajes por segundo: 20 directo, 12 por el TURN y 6 por el relé de la Realtime
  // Database (en esta versión, plan gratis sin facturación: si se pasa del cupo, se para;
  // no cobra). Entre mensaje y mensaje, los demás se predicen (Player.netUpdate).
  // (2026-10-16: TURN de 4 a 12. Con 4 el que iba por el TURN veía todo a saltos —"uno iba
  // un poco a tirones" en una partida de tres—. El TURN tiene 1.000 GB gratis al mes y el
  // Worker deja de dar claves a los 900 GB, así que nunca cobra; ~1-2 KB por mensaje.)
  const RATE_FAST = 1 / 20, RATE_TURN = 1 / 12, RATE_SLOW = 1 / 6;
  const rateFor = u => (G.Net.slow(u) ? RATE_SLOW : G.Net.viaTurn(u) ? RATE_TURN : RATE_FAST);
  const NEAR = 950;                     // radio de enemigos que se mandan a cada uno

  let active = false, host = false, me = null, hostUid = null;
  let local = null;                     // tu Player
  const mates = new Map();              // uid -> { uid, name, color, pl, connected, q:[], flushT, xpMul }
  let outEv = [];                       // invitado: eventos para el anfitrión
  let flushT = 0;
  let hitFrom = null;                   // invitado cuyo golpe se está aplicando (no repetirle el número)
  let api = {};                         // callbacks del juego (game.js)
  let waiting = new Set();              // subida de nivel: quién falta por elegir
  let holds = new Map();                // uid -> 1 eligiendo / 2 en pausa (la partida se para para todos)
  // El anfitrión mueve a los enemigos: si cambia de pestaña (o se le congela),
  // todo se para para todos. Antes los enemigos se quedaban quietos y los demás
  // seguían jugando con una ventaja enorme.
  let hostAway = false, stalled = false, lastHostAt = 0;
  let rtInfo = {};                      // invitado: uid -> [ms, directo] (lo mide el anfitrión)
  let pingT = 0;                        // anfitrión: cada 2 s mide la latencia de cada uno
  const lastTs = new Map();             // uid -> reloj (ts) del último mensaje suyo con posiciones
  const STALL_MS = 2500;
  let members = [];
  // MVP (esta versión): quién derriba (último golpe, en el anfitrión) y quién levanta a quién.
  const kills = new Map(), revives = new Map();

  // ---------------- escalado de dificultad ----------------

  // Solo (n = 1): todo ×1, la dificultad normal. Por cada jugador más (2026-10-16):
  //   rate  +60 % de enemigos (antes +75 %)
  //   hp    +30 % de vida; en los otros modos (aventura, retos diario y semanal, torre sin fin,
  //         desafío legendario) +40 %: con
  //         revivir y concentrar el fuego se hacían demasiado fáciles en grupo
  //   dmg   +10 % de daño (se reparten entre más gente)
  //   cap   +30 % de enemigos a la vez (antes el tope era fijo: en grupo se llenaba enseguida
  //         y todo lo que salía era élite; a los 9 min en la mazmorra no había quien pudiera)
  const more = n => Math.max(0, n - 1);
  const scaleRate = n => 1 + 0.6 * more(n);
  const scaleHp = n => 1 + (G.Modes.run === 'normal' ? 0.3 : 0.4) * more(n);
  const scaleDmg = n => 1 + 0.1 * more(n);
  const scaleCap = n => 1 + 0.3 * more(n);

  // ---------------- arranque / fin ----------------

  /**
   * @param cfg   { seed, host, members }
   * @param pl    tu Player (ya creado)
   * @param cb    { levelStart(lv), resume(), waiting(names), over(data), lost(msg), team(t), shiny(dex) }
   */
  function begin(cfg, pl, cb) {
    active = true;
    me = G.Net.uid; hostUid = cfg.host;
    host = me === hostUid;
    local = pl;
    api = cb;
    members = cfg.members;
    mates.clear();
    outEv = []; flushT = 0; waiting = new Set(); holds = new Map(); holdKey = ''; gotHolds = '';
    lastTs.clear();
    kills.clear(); revives.clear();
    hostAway = false; stalled = false; lastHostAt = performance.now();
    rtInfo = {}; pingT = 0; for (const k in hostClk) delete hostClk[k];
    G.PvP.begin(cfg);
    cfg.members.forEach((m, i) => {
      // PK: repartidos en un círculo, lejos unos de otros. Equipo: juntos.
      const ang = (i / cfg.members.length) * 6.2832;
      // (2026-10-15: un poco más lejos que antes, 260×180: al acabar la preparación ya estabais pegados.)
      const x = cfg.pvp ? Math.round(Math.cos(ang) * 420) : (i - (cfg.members.length - 1) / 2) * 34;
      const y = cfg.pvp ? Math.round(Math.sin(ang) * 300) : 0;
      const team = cfg.teams ? (m.team | 0) : null;
      const tagCol = cfg.teams ? G.PvP.TEAM_COLORS[team] : COLORS[i];
      if (m.uid === me) { pl.x = x; pl.y = y; pl.uid = me; pl.coopHost = host; pl.tagColor = tagCol; pl.team = team; return; }
      const mon = G.DEX_BY[m.dex] || G.DEX_BY[25];
      const p = new G.Player(mon, {}, !!m.shiny);
      p.remote = true; p.uid = m.uid; p.tag = m.name; p.tagColor = tagCol; p.team = team; p.revLabel = 'Quédate a su lado';
      p.x = x; p.y = y;
      p.net = { x, y, ang: Math.PI / 2, walk: 0, hp: p.maxHp, maxHp: p.maxHp, dead: 0, mv: G.startMoveOf(mon.dex), ml: 1, mag: 78, aim: Math.PI / 2, rev: 0 };
      G.Sprites.preload([mon.dex], 8000, p.shiny);
      mates.set(m.uid, { uid: m.uid, name: m.name, color: COLORS[i], pl: p, connected: true, q: [], flushT: 0, xpMul: 1 });
    });
  }

  function end() {
    active = false; host = false; local = null;
    mates.clear(); outEv = []; waiting = new Set(); holds = new Map();
  }

  /** Te vas de la partida (los demás siguen). */
  function leave() {
    if (!active) return;
    if (host) {
      // Si se va el anfitrión, la partida termina para todos.
      emit(['ov', Object.assign(api.summary ? api.summary() : {}, { why: 'host' })]);
      flushAll();
    } else {
      outEv.push(['bye']);
      flushClient(true);
    }
    end();
  }

  // ---------------- lista de jugadores ----------------

  function players() {
    const out = [local];
    for (const m of mates.values()) if (m.connected) out.push(m.pl);
    return out;
  }
  function puppets() { const out = []; for (const m of mates.values()) if (m.connected) out.push(m.pl); return out; }

  /**
   * Experiencia en grupo (2026-10-14): cada uno tiene SU nivel y su barra. Toda la
   * experiencia que se recoge le llega a todos ('xg'), repartida según cuántos sois
   * (si no se subiría de nivel el triple de rápido que en solitario), y cada uno le
   * aplica SU bonus (Mejoras, objetos): el tuyo ya no lo disfrutan los demás.
   */
  function xpFactor() {
    let n = 1;
    for (const m of mates.values()) if (m.connected) n++;
    return 1 / (1 + 0.6 * (n - 1));
  }
  /** Anfitrión: se ha recogido experiencia (para todos). */
  function xpShare(v) { emit(['xg', Math.round(v * 10) / 10]); }

  // ---------------- estado de un jugador ----------------

  const r1 = v => Math.round(v), r2 = v => Math.round(v * 100) / 100;
  /** Reloj de quien manda (s): las velocidades se calculan con él, no con la hora de llegada (que baila). */
  const clock = () => Math.round(performance.now()) / 1000;

  function myState() {
    // Con un vínculo se manda la órbita si la hay (es lo único que los demás no ven por los 'c').
    const g = local.activeGroup();
    const m = g.find(x => x.kind === 'orbit') || g[0];
    return [r1(local.x), r1(local.y), r2(local.moveAngle), local.walking ? 1 : 0, r1(local.hp), r1(local.maxHp),
            local.dead ? 1 : 0, m ? m.id : '', m ? m.lvl : 1, r1(local.magnet), r2(local.aim), r2(local.xpMul),
            r2(local.reviveT || 0), r1(local.dmgDealt || 0), local.dex, api.choosing && api.choosing() ? 1 : api.paused && api.paused() ? 2 : 0,
            clock(), local.sizeK && local.sizeK !== 1 ? local.sizeK : 0, ...G.Companion.state(local),
            local.bulkField ? 1 : 0,      // [20] campo de Shaq: el anfitrión aparta a los enemigos (game.js fieldPush)
            G.Companion.skillCount(local),    // [21] usos de la habilidad del compañero (2026-10-16: los demás ven el efecto)
            G.Cosmetic.code()];           // [22] aspecto de los logros (cosmetic.js; 0 = nada, y lo que falta en versiones viejas)
  }

  function readState(a) {
    return { x: a[0], y: a[1], ang: a[2], walk: a[3], hp: a[4], maxHp: a[5], dead: a[6], mv: a[7], ml: a[8],
             mag: a[9], aim: a[10], xpMul: a[11], rev: a[12], dmg: a[13] || 0, dex: a[14] || 0, ch: a[15] || 0, t: a[16] || 0, sz: a[17] || 0, bd: a[18] || 0, bs: a[19] || 0, bf: a[20] || 0,
             pk: a[21] || 0, cs: a[22] || 0 };
  }

  // ---------------- envío ----------------

  /** Anfitrión: evento para todos los invitados (menos `except`). */
  function emit(ev, except) {
    if (!host) return;
    for (const m of mates.values()) if (m.connected && m.uid !== except) m.q.push(ev);
  }

  /** Anfitrión: evento sólo para los que están cerca (números de daño). */
  function emitNear(ev, x, y, except) {
    for (const m of mates.values()) {
      if (!m.connected || m.uid === except) continue;
      if (G.U.dist2(m.pl.x, m.pl.y, x, y) > 700 * 700) continue;
      if (m.q.length > 400) continue;
      m.q.push(ev);
    }
  }

  function enemyList(near) {
    const out = [];
    const r2n = NEAR * NEAR;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || G.U.dist2(e.x, e.y, near.x, near.y) > r2n) continue;
      const a = ANIMS.indexOf(e.anim.cur);
      out.push([e.id, r1(e.x), r1(e.y), Math.ceil(e.hp), a < 0 ? 0 : a, e.anim.dir,
                (e.burn > 0 ? 1 : 0) | (e.poison > 0 ? 2 : 0) | (e.shield > 0 ? 4 : 0) | (e.raging ? 8 : 0)]);
    }
    return out;
  }

  // ---------------- enemigos: sólo lo que cambia (2026-10-16) ----------------
  /*
   * Antes cada mensaje llevaba TODOS los enemigos cercanos ([id, x, y, vida, anim, dir,
   * estados]); con muchos pasaba de un paquete y, por el canal rápido, se perdía entero
   * en cuanto se perdía un trozo. Ahora, para cada invitado, se recuerda lo último que se
   * le mandó de cada enemigo y sólo va lo que ha cambiado:
   *   ef  [dId, qx, qy, vida, anim, dir, est]...  nuevo, otra animación o estado, o cada ~1 s
   *   em  [dId, qx, qy]...                         sólo se ha movido (≥ 3 px); los lejanos, 1 de cada 4 veces
   *   eh  [dId, vida]...                           sólo ha cambiado la vida
   * Listas planas; dId = id − el id anterior de la lista (van ordenados); qx, qy =
   * (posición − eo) / 2, con eo = la posición del invitado redondeada. Un enemigo que
   * no sale es que no ha cambiado (NO se borra: eso va con los eventos 'ed' / 'eg').
   */
  const Q = 2, REFRESH = 1.0, NEAR_FAST = 520;     // (520: toda la pantalla, cada vez)
  function enemyDelta(m) {
    const now = clock(), sent = m.sent || (m.sent = new Map());
    m.frameN = (m.frameN || 0) + 1;
    const ox = Math.round(m.pl.x / 8) * 8, oy = Math.round(m.pl.y / 8) * 8;
    const r2n = NEAR * NEAR, rf2 = NEAR_FAST * NEAR_FAST;
    const full = [], move = [], hps = [], seen = new Set();
    let refreshes = 6;                // como mucho tantas "repeticiones de seguridad" por mensaje (no todas a la vez)
    for (const e of G.EnemyMgr.all()) {
      if (e.dead) continue;
      const d2 = G.U.dist2(e.x, e.y, m.pl.x, m.pl.y);
      if (d2 > r2n) continue;
      seen.add(e.id);
      const a = Math.max(0, ANIMS.indexOf(e.anim.cur)), dir = e.anim.dir;
      const st = (e.burn > 0 ? 1 : 0) | (e.poison > 0 ? 2 : 0) | (e.shield > 0 ? 4 : 0) | (e.raging ? 8 : 0);
      const h = Math.ceil(e.hp), qx = Math.round((e.x - ox) / Q), qy = Math.round((e.y - oy) / Q);
      const s = sent.get(e.id);
      // Repetición cada ~1 s, repartida entre enemigos (cada uno con su desfase) y con tope.
      const stale = s && now - s.t > REFRESH + (e.id % 10) * 0.05 && refreshes > 0;
      // (La dirección no obliga a mandarlo entero: el invitado la saca de cómo se mueve.)
      if (!s || s.a !== a || s.st !== st || stale) {
        if (s && stale && s.a === a && s.st === st) refreshes--;
        full.push([e.id, qx, qy, h, a, dir, st]);
        sent.set(e.id, { x: e.x, y: e.y, h, a, d: dir, st, t: now });
        continue;
      }
      if (h !== s.h) { hps.push([e.id, h]); s.h = h; }
      const moved = Math.abs(e.x - s.x) >= 3 || Math.abs(e.y - s.y) >= 3;
      if (moved && (d2 <= rf2 || (m.frameN + e.id) % 4 === 0)) { move.push([e.id, qx, qy]); s.x = e.x; s.y = e.y; }
    }
    // Los que ya no están (o se han ido lejos) se olvidan: si vuelven, irán completos.
    if (m.frameN % 20 === 0) for (const id of sent.keys()) if (!seen.has(id)) sent.delete(id);
    const out = { eo: [ox, oy] };
    if (full.length) out.ef = flat(full);
    if (move.length) out.em = flat(move);
    if (hps.length) out.eh = flat(hps);
    return out;
  }
  /** [[id, ...], ...] -> [dId, ..., dId, ...] (ordenados por id). */
  function flat(rows) {
    rows.sort((a, b) => a[0] - b[0]);
    const out = [];
    let prev = 0;
    for (const r of rows) { out.push(r[0] - prev); prev = r[0]; for (let i = 1; i < r.length; i++) out.push(r[i]); }
    return out;
  }

  // ---------------- interpolación (invitado) ----------------
  /*
   * Lo de los demás (enemigos, compañeros) se dibuja un poco "en el pasado", entre las
   * dos posiciones recibidas que lo rodean, con el reloj de quien las manda: así se
   * mueve suave aunque los mensajes lleguen a saltos. Cuánto en el pasado se adapta a
   * la red: lo que tardan en llegar los mensajes más lentos (jit) más lo que hay entre
   * uno y otro (gap), entre 0,06 y 0,3 s. Si se acaban las posiciones, se sigue la
   * última velocidad como mucho 0,2 s y luego se queda quieto.
   */
  const DELAY = 0.1;
  /**
   * Reloj de quien manda (o = { off, jit, gap, last }): desfase con el nuestro (el más
   * pequeño visto = el mensaje que menos tardó, bajando despacio si la red empeora),
   * retraso de los que llegan tarde y separación entre mensajes.
   */
  function clockTrack(o, tsec) {
    const off = tsec - performance.now() / 1000;
    o.off = o.off == null || off > o.off ? off : o.off + (off - o.off) * 0.02;
    o.jit = Math.max(o.off - off, (o.jit || 0) * 0.97);
    if (o.last != null && tsec > o.last) o.gap = (o.gap == null ? 0.05 : o.gap) * 0.9 + Math.min(0.5, tsec - o.last) * 0.1;
    if (o.last == null || tsec > o.last) o.last = tsec;
  }
  /** Instante (en el reloj de quien manda) que toca dibujar. */
  function clockRender(o) {
    const delay = G.U.clamp((o.gap == null ? 0.05 : o.gap) + (o.jit || 0) + 0.02, 0.06, 0.3);
    return performance.now() / 1000 + (o.off || 0) - delay;
  }
  const hostClk = {};
  /** Guarda una posición (t = reloj de quien la manda, en s). */
  function pushSnap(buf, t, x, y) {
    const last = buf[buf.length - 1];
    if (last && t <= last.t) { if (t === last.t) { last.x = x; last.y = y; } return; }
    buf.push({ t, x, y });
    if (buf.length > 8) buf.shift();
  }
  /** Posición en el instante rt (o null si no hay nada guardado). */
  function interp(buf, rt) {
    const n = buf.length;
    if (!n) return null;
    if (rt <= buf[0].t) return [buf[0].x, buf[0].y];
    for (let i = n - 1; i > 0; i--) {
      const a = buf[i - 1], b = buf[i];
      if (rt >= a.t && rt <= b.t) { const k = (rt - a.t) / ((b.t - a.t) || 1); return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k]; }
    }
    const b = buf[n - 1], a = buf[n - 2];
    if (!a || b.t - a.t <= 0 || b.t - a.t > 1) return [b.x, b.y];
    const k = Math.min(0.2, rt - b.t) / (b.t - a.t);
    return [b.x + (b.x - a.x) * k, b.y + (b.y - a.y) * k];
  }
  /** Invitado: instante (reloj del anfitrión) en que se dibujan los enemigos. */
  function renderClock() { return clockRender(hostClk); }

  /** Latencia con alguien: { ms, direct } (o null si aún no se sabe). */
  function netInfo(u) {
    if (host) { const m = mates.get(u); return m && m.rtt != null ? { ms: m.rtt, direct: G.Net.mode(u) === 'direct' } : null; }
    const r = rtInfo[u];
    return r ? { ms: r[0], direct: !!r[1] } : null;
  }

  /** Quién para la partida ahora: [[uid, nombre, 1 eligiendo | 2 en pausa], ...]. */
  function holdList() { return [...holds].map(([u, k]) => [u, nameOf(u), k]); }

  function hostFrame(m) {
    const st = api.team();
    const p = { [me]: myState() };
    for (const o of mates.values()) {
      if (o.connected && o.uid !== m.uid && o.state) p[o.uid] = o.state;
    }
    const ev = m.q; m.q = [];
    const f = Object.assign({ k: 'f', ts: clock(), t: r2(st.time), lv: st.level, xp: r2(st.xp), xn: st.xpNext, ki: st.kills, bo: st.bosses, co: st.coins, tk: [st.t1, st.t10],
                              p, ev, h: holdList() }, enemyDelta(m));
    // Latencias (cada ~1 s): la suya conmigo va con mi uid; las de los demás, con el suyo.
    if (m.frameN % 20 === 1) {
      const rt = { [me]: [m.rtt || 0, G.Net.mode(m.uid) === 'direct' ? 1 : 0] };
      for (const o of mates.values()) if (o.connected && o !== m && o.rtt != null) rt[o.uid] = [o.rtt, G.Net.mode(o.uid) === 'direct' ? 1 : 0];
      f.rt = rt;
    }
    return f;
  }

  function flushAll() { for (const m of mates.values()) if (m.connected) G.Net.send(m.uid, hostFrame(m)); }

  /**
   * Las posiciones van SIEMPRE por el canal rápido; los eventos, aparte, por el fiable.
   * (2026-10-16: antes, si un mensaje llevaba algún evento —en combate casi todos—, iba
   * entero por el canal fiable y ordenado: con perder un solo paquete, todas las posiciones
   * siguientes esperaban a que se reenviara (0,2-1 s). Por eso un compañero "iba a tirones"
   * aun con conexión directa y buenos ordenadores.) El de sólo eventos lleva x:1 y no lleva
   * ts, para no marcar como viejo al de posiciones que sale a la vez.
   */
  function sendFrame(to, f) {
    if (f.ev && f.ev.length) { G.Net.send(to, { k: 'f', x: 1, ev: f.ev }); f.ev = []; }
    G.Net.sendFast(to, f);
  }

  function flushClient(force) {
    if (!force && !outEv.length && flushT > 0) return;
    G.Net.toHost({ k: 'f', ts: clock(), p: myState(), ev: outEv });
    outEv = [];
  }

  /** Cada fotograma (también en la pantalla de subida de nivel). */
  function tick(dt) {
    if (!active) return;
    if (host) {
      syncHolds();
      if ((pingT -= dt) <= 0) { pingT = 2; for (const m of mates.values()) if (m.connected) m.q.push(['pi', clock()]); }
      for (const m of mates.values()) {
        if (!m.connected) continue;
        m.flushT -= dt;
        if (m.flushT > 0) continue;
        m.flushT = rateFor(m.uid);
        sendFrame(m.uid, hostFrame(m));
      }
    } else {
      if (!stalled && performance.now() - lastHostAt > STALL_MS) { stalled = true; updateAway(); }
      flushT -= dt;
      if (flushT <= 0) {
        flushT = rateFor(hostUid);
        if (hostUid) sendFrame(hostUid, { k: 'f', ts: clock(), p: myState(), ev: outEv });
        outEv = [];
      }
    }
  }

  // ---------------- recepción ----------------

  G.Net.on((from, msg) => {
    if (!msg) return;
    if (msg.k === 'start') { if (G.Flow.startCoop) G.Flow.startCoop(msg); return; }
    if (!active || msg.k !== 'f') return;
    // Por el canal rápido pueden llegar desordenados: las posiciones de un mensaje más
    // viejo que el último se ignoran (sus eventos, si los lleva, sí cuentan).
    const last = lastTs.get(from) || 0;
    msg.fresh = !msg.ts || msg.ts > last || last - msg.ts > 5;     // (reloj que vuelve atrás: recargó la página)
    if (msg.fresh && msg.ts) lastTs.set(from, msg.ts);
    if (host) onClientFrame(from, msg); else if (from === hostUid) onHostFrame(msg);
  });

  G.Net.onPeer((u, mode) => {
    if (!active || (mode !== 'closed' && mode !== 'failed')) return;
    if (host) mateGone(u);
    else if (u === hostUid) { const cb = api.lost; end(); if (cb) cb('Se ha perdido la conexión con el anfitrión.'); }
  });

  function mateGone(u) {
    const m = mates.get(u);
    if (!m || !m.connected) return;
    m.connected = false;
    G.Projectiles.clearOrbs(m.pl);
    G.Spawner.say(m.name + ' ha dejado la partida', 2.6);
    if (waiting.has(u)) picked(u);
    if (holds.has(u)) holdOff(u);
    if (api.mateLeft) api.mateLeft(m);
  }

  // --- en el anfitrión ---

  function onClientFrame(from, msg) {
    const m = mates.get(from);
    if (!m || !m.connected) return;
    if (msg.p && msg.fresh) { m.state = msg.p; m.pl.net = readState(msg.p); m.xpMul = m.pl.net.xpMul || 1; }
    for (const ev of msg.ev || []) {
      switch (ev[0]) {
        case 'h': {
          const e = G.EnemyMgr.get(ev[1]);
          if (!e || e.dead || e.remote) break;
          hitFrom = from;
          e.hurt(ev[2], ev[3], ev[4], ev[5], ev[6]);
          hitFrom = null;
          break;
        }
        case 's': {
          const e = G.EnemyMgr.get(ev[1]);
          if (!e || e.dead) break;
          if (ev[2] === 'b') e.applyBurn(ev[3]);
          else if (ev[2] === 'B') e.applyBurnFloor(ev[3]);           // artefacto Equipo de Shixin
          else if (ev[2] === 'p') e.applyPoison(ev[3]);
          else if (ev[2] === 's') e.applySlow(ev[3]);
          else if (ev[2] === 'r') e.applyRoot(ev[3]);
          break;
        }
        case 'c':
          G.Combat.ghostCast(m.pl, ev[1], ev[2], ev[3], ev[4]);
          emit(['c', from, ev[1], ev[2], ev[3], ev[4]], from);
          break;
        case 'pb':
          G.World.breakAt(ev[1], ev[2]);
          emit(['pb', ev[1], ev[2]], from);
          break;
        case 'lp': picked(from); break;
        case 'hs': holdOn(from); break;
        case 'he': holdOff(from); break;
        case 're': G.Rift.enterRequest(); break;
        case 'bye': mateGone(from); break;
        case 'qc': G.Chat.show(from, ev[1]); emit(['qc', from, ev[1]], from); break;   // mensaje rápido
        case 'po': m.rtt = Math.max(1, Math.round((clock() - ev[1]) * 1000)); break;       // latencia
        case 'rv': creditRevive(ev[1]); break;                                         // `from` fue levantado por ev[1]
        case 'dg': G.Dungeon.onClient(from, ev); break;
        case 'shl': G.Combat.supportHeal(ev[1], ev[2], ev[3], ev[4], ev[5]); emit(ev, from); break;   // Deseo / Rocío Vital
        case 'mfx': G.Combat.netFx(ev); emit(ev, from); break;   // agujero negro de un compañero (combat.js)
        case 'cb': G.Floors.comboFx(ev[1], ev[2], ev[3], ev[4]); emit(ev, from); break;   // ataque combinado (floors.js)
        case 'pv': G.PvP.onNet(ev); emit(ev, from); break;                                 // PK: golpe entre jugadores
        case 'rgc': if (local) local.coins = (local.coins || 0) + G.U.clamp(ev[1] | 0, 0, 100); break;   // reto de la run de un invitado (rungoals.js): monedas del grupo
      }
    }
  }

  // --- en el invitado ---

  /** Invitado: se para (o sigue) según si el anfitrión está. */
  function updateAway() { if (api.away) api.away(hostAway || stalled ? nameOf(hostUid) : null); }

  // Anfitrión: al irse de la pestaña avisa a todos al momento (después ya no
  // podrá mandar nada) y al volver, que sigue.
  document.addEventListener('visibilitychange', () => {
    if (!active || !host) return;
    emit(['ha', document.hidden ? 1 : 0]);
    flushAll();
  });

  /** Invitado: lista de quién elige que manda el anfitrión (sólo si cambia). */
  let gotHolds = '';
  function applyHolds(list) {
    if (!Array.isArray(list)) return;
    const k = list.map(x => (Array.isArray(x) ? x[0] + ':' + (x[2] || 1) : x)).sort().join(',');
    if (k === gotHolds) return;
    gotHolds = k;
    api.hold && api.hold(list);
  }

  function onHostFrame(msg) {
    lastHostAt = performance.now();
    if (stalled) { stalled = false; updateAway(); }
    if (msg.x) { for (const ev of msg.ev || []) applyHostEvent(ev); return; }   // sólo eventos (sendFrame)
    if (msg.h && msg.fresh) applyHolds(msg.h);
    for (const ev of msg.ev || []) applyHostEvent(ev);
    if (!msg.fresh) return;
    api.syncTeam({ time: msg.t, level: msg.lv, xp: msg.xp, xpNext: msg.xn, kills: msg.ki, bosses: msg.bo, coins: msg.co,
                   t1: (msg.tk || [])[0], t10: (msg.tk || [])[1] });
    for (const u in msg.p || {}) {
      const m = mates.get(u);
      if (m) m.pl.net = readState(msg.p[u]);
    }
    if (msg.rt) rtInfo = msg.rt;
    // Reloj del anfitrión: el desfase más pequeño visto (= el mensaje que menos tardó),
    // bajando poco a poco si la red se vuelve más lenta.
    const tsec = msg.ts || performance.now() / 1000;
    if (msg.ts) clockTrack(hostClk, tsec);
    if (msg.eo) {
      const ox = msg.eo[0], oy = msg.eo[1];
      const each = (arr, n, fn) => {
        if (!arr) return;
        let id = 0;
        for (let i = 0; i + n <= arr.length; i += n) { id += arr[i]; const e = G.EnemyMgr.get(id); if (e && e.remote && !e.dead) fn(e, arr, i); }
      };
      const at = (e, x, y) => { const nn = e.net; nn.buf = nn.buf || []; pushSnap(nn.buf, tsec, x, y); nn.x = x; nn.y = y; nn.age = 0; };
      each(msg.ef, 7, (e, a, i) => {
        at(e, ox + a[i + 1] * Q, oy + a[i + 2] * Q);
        e.hp = Math.min(e.maxHp, a[i + 3]); e.net.anim = a[i + 4]; e.net.dir = a[i + 5]; e.net.st = a[i + 6];
      });
      each(msg.em, 3, (e, a, i) => at(e, ox + a[i + 1] * Q, oy + a[i + 2] * Q));
      each(msg.eh, 2, (e, a, i) => { e.hp = Math.min(e.maxHp, a[i + 1]); });
    }
    // (Formato antiguo: todos los enemigos cada vez.)
    // Velocidad con el reloj del anfitrión (ts) si lo manda: la hora de llegada baila con la red.
    const now = msg.ts ? msg.ts * 1000 : performance.now();
    for (const a of msg.e || []) {
      const e = G.EnemyMgr.get(a[0]);
      if (!e || !e.remote || e.dead) continue;
      const n = e.net;
      const dts = (now - (n.last || now)) / 1000;
      if (dts > 0.02 && dts < 1) {
        n.vx = G.U.clamp((a[1] - n.x) / dts, -600, 600);
        n.vy = G.U.clamp((a[2] - n.y) / dts, -600, 600);
      } else { n.vx = 0; n.vy = 0; }
      n.x = a[1]; n.y = a[2]; n.age = 0; n.last = now;
      e.hp = Math.min(e.maxHp, a[3]);
      n.anim = a[4]; n.dir = a[5]; n.st = a[6];
    }
  }

  function applyHostEvent(ev) {
    switch (ev[0]) {
      case 'ne':
        G.EnemyMgr.addRemote({ id: ev[1], dex: ev[2], x: ev[3], y: ev[4], boss: !!ev[5], raid: ev[5] === 2, shiny: !!ev[6], hp: ev[7], dmg: ev[8], beh: ev[9], elite: ev[10] || null, small: !!ev[11] });
        break;
      // Se ha hecho élite después de salir (casa de monstruos): afijos y vida nueva (2026-10-16).
      case 'ee': { const e = G.EnemyMgr.get(ev[1]); if (e && e.remote && !e.elite) { e.makeElite(ev[2], true); e.maxHp = ev[3]; } break; }
      case 'ed': G.EnemyMgr.removeRemote(ev[1], true); break;
      case 'eg': G.EnemyMgr.removeRemote(ev[1], false); break;
      case 'hn': { const e = G.EnemyMgr.get(ev[1]); if (e && !e.dead) e.showHurt(ev[2], ev[3]); break; }
      case 'es':
        G.Projectiles.spawn({ x: ev[1], y: ev[2], vx: ev[3], vy: ev[4], dmg: ev[5], r: ev[6], life: ev[7],
                              friendly: false, color: '#ff7a9e', vis: G.VFX.forType(ev[8]), mtype: ev[8] });
        break;
      case 'c': { const m = mates.get(ev[1]); if (m) G.Combat.ghostCast(m.pl, ev[2], ev[3], ev[4], ev[5]); break; }
      case 'item': api.item(ev[1]); break;
      case 'st': case 'fl': case 'cb': G.Floors.onNet(ev); break;   // escaleras, piso nuevo, ataque combinado
      case 'st2': case 'fbs': case 'fclr': case 'fcn': G.Floors.onNet(ev); break;   // dos escaleras, jefe del piso, mazmorra superada, seguir (floors.js)
      // Piso del tesoro (2026-10-16): faltaba aquí y el invitado se quedaba en el mapa viejo con sus enemigos.
      case 'ftr': G.Floors.onNet(ev); break;
      case 'sbox': api.sbox && api.sbox(); break;
      case 'fbox': api.fbox && api.fbox(); break;
      case 'ms': api.milestone && api.milestone(ev[1]); break;            // hito de tiempo (boons.js)
      case 'egg': G.Companion.gotEgg(local); break;
      case 'potion': api.potion && api.potion(ev[1]); break;
      case 'pk': G.Pickups.addRemote(ev[1], ev[2], ev[3], ev[4], ev[5]); break;
      case 'pc': G.Pickups.removeId(ev[1]); break;
      case 'mag': G.Pickups.pullAll(); G.FX.ring(local.x, local.y, 10, 420, '#ff9ed8', 0.6, 4); break;
      case 'bomb':
        G.FX.ring(ev[1], ev[2], 20, G.Camera.outerRadius(), '#ff7b3d', 0.5, 6);
        if (G.U.dist2(ev[1], ev[2], local.x, local.y) < 500 * 500) G.Camera.kick(0.8);
        G.Audio.sfx('break');
        break;
      case 'pb': G.World.breakAt(ev[1], ev[2]); break;
      case 'say': G.Spawner.say(ev[1], ev[2]); break;
      case 'heal': if (!local.dead) { local.heal(local.maxHp * ev[1]); G.FX.ring(local.x, local.y, 6, 60, '#5fe08a', 0.4, 3); } break;
      case 'lu': api.levelStart(ev[1]); break;
      case 'xg': api.gainXp && api.gainXp(ev[1]); break;
      case 'lw': api.waiting(ev[1]); break;
      case 'lr': api.resume(); break;
      case 'hp': applyHolds(ev[1]); break;
      case 'ha': hostAway = !!ev[1]; updateAway(); break;
      case 'sh': api.shiny(ev[1]); break;
      case 'ov': { const cb = api.over; const d = ev[1]; end(); cb(d); break; }
      case 'rift': case 'riftx': case 'arena': case 'aw': case 'al': G.Rift.onEvent(ev); break;
      case 'wx': G.Weather.onEvent(ev); break;
      case 'ev': G.Events.onNet(ev); break;
      case 'hz': G.Hazards.add(ev[1], true); break;
      case 'fxr': G.FX.ring(ev[1], ev[2], 8, ev[3], ev[4], 0.5, 3); break;
      case 'qc': G.Chat.show(ev[1], ev[2]); break;
      case 'rdt': case 'rdw': G.Raid.onEvent(ev); break;
      case 'stg': G.Stages.onNet(ev); break;
      case 'twr': G.Challenges.onNet(ev); break;
      case 'pi': outEv.push(['po', ev[1]]); flushClient(true); break;            // latencia: se devuelve al momento
      case 'dg': G.Dungeon.onNet(ev); break;
      case 'pv': G.PvP.onNet(ev); break;
      case 'shl': G.Combat.supportHeal(ev[1], ev[2], ev[3], ev[4], ev[5]); break;      // Deseo / Rocío Vital de un compañero
      case 'mfx': G.Combat.netFx(ev); break;                                           // agujero negro de un compañero
    }
  }

  // ---------------- ganchos que llaman los módulos del juego ----------------

  /** Tu ataque: los demás lo repiten como fantasma. */
  function cast(pl, m) {
    if (!active || pl !== local) return;
    if (host) emit(['c', me, m.id, m.lvl, r2(pl.aim), m.evolved ? 1 : 0]);
    else outEv.push(['c', m.id, m.lvl, r2(pl.aim), m.evolved ? 1 : 0]);
  }

  // invitado
  function hit(e, d, color, dx, dy, knock) { outEv.push(['h', e.id, d, color, r1(dx), r1(dy), knock || 0]); }
  function status(e, kind, val) { outEv.push(['s', e.id, kind, val]); }

  // anfitrión
  function hurtShown(e, d, color) { emitNear(['hn', e.id, d, color], e.x, e.y, hitFrom); }
  function enemyAdded(e) {
    emit(['ne', e.id, e.dex, r1(e.x), r1(e.y), e.boss ? (e.raid ? 2 : 1) : 0, e.shiny ? 1 : 0, Math.ceil(e.maxHp), r2(e.dmg), e.behavior, e.affixes ? e.affixes.join('+') : e.elite || 0, e.small ? 1 : 0]);
  }
  function enemyGone(e, died) { emit([died ? 'ed' : 'eg', e.id]); }
  function enemyShot(p, type) { emit(['es', r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), r2(p.dmg), p.r, p.life, type]); }
  function pickupAdded(o) { emit(['pk', o.id, o.kind, r1(o.x), r1(o.y), o.value]); }
  function pickupGone(id) { emit(['pc', id]); }
  function say(text, secs) { emit(['say', text, secs]); }

  function propBroken(p) {
    if (host) emit(['pb', p.tx, p.ty]);
    else outEv.push(['pb', p.tx, p.ty]);
  }

  /** Anfitrión: alguien ha cogido un objeto. Devuelve true si es para ti. */
  function collected(p, who) {
    emit(['pc', p.id]);
    if (p.kind === 'magnet') emit(['mag']);
    if (p.kind === 'bomb') emit(['bomb', r1(who.x), r1(who.y)]);
    if ((p.kind === 'heal' || p.kind === 'item') && who !== local) {
      const m = mates.get(who.uid);
      if (m) m.q.push(p.kind === 'heal' ? ['heal', 0.3] : ['item', p.value]);
    }
    // Cofre de movimientos y poción (loot.js): al que lo ha cogido.
    if ((p.kind === 'sbox' || p.kind === 'fbox' || p.kind === 'potion' || p.kind === 'egg') && who !== local) {
      const m = mates.get(who.uid);
      if (m) m.q.push(p.kind === 'potion' ? ['potion', p.eff] : [p.kind]);
    }
    if (p.kind === 'potion' && p.eff === 'magnet') emit(['mag']);
  }

  function shinyCaught(e) { emit(['sh', e.dex]); }

  // ---------------- subida de nivel compartida ----------------

  /**
   * Subida de nivel del equipo: cada uno elige sus cartas sin esperar a los demás
   * (esta versión). La partida sigue; mientras eliges, tu Pokémon se queda quieto
   * e invulnerable (game.js).
   */
  function levelStart(level) {
    emit(['lu', level]);
    flushAll();
    api.levelStart(level);
  }

  function nameOf(u) { return u === me ? (G.Social.me ? G.Social.me.name : 'Tú') : (mates.get(u) || {}).name || '?'; }

  function sendWaiting() {
    const names = [...waiting].map(nameOf);
    emit(['lw', names]);
    api.waiting(names);
  }

  /** Alguien ha elegido carta (anfitrión). */
  function picked(u) {
    if (!waiting.delete(u)) return;
    if (waiting.size) { sendWaiting(); return; }
    emit(['lr']);
    flushAll();
    api.resume();
  }

  // ---------------- elegir: pausa para todos ----------------
  // Mientras alguien elige (cartas de nivel, vínculo de un legendario, objeto), la
  // partida se para para todos. Cada uno dice en su estado si está eligiendo (índice 15)
  // y el anfitrión lo recalcula cada fotograma y lo manda en cada mensaje ('h'): si se
  // pierde o se cruza un aviso, al siguiente mensaje se arregla solo (antes, con avisos
  // sueltos de empezar/terminar, a veces se quedaba "X está eligiendo…" para siempre).

  let holdKey = '';
  /** Anfitrión: quién está eligiendo según el último estado de cada uno. */
  function syncHolds() {
    const now = new Map();
    // Sólo la pausa (2) para la partida para todos. Elegir cartas (1) ya no (2026-10-15:
    // esperar a cada uno era muy lento): quien elige se queda quieto y protegido (game.js).
    if (api.paused && api.paused()) now.set(me, 2);
    for (const m of mates.values()) if (m.connected && m.pl && m.pl.net && m.pl.net.ch === 2) now.set(m.uid, 2);
    const key = [...now].map(([u, k]) => u + ':' + k).sort().join(',');
    if (key === holdKey) return;
    holdKey = key; holds = now;
    emit(['hp', holdList()]); flushAll();
    api.hold && api.hold(holdList());
  }
  function holdOn(u) { if (host) syncHolds(); }
  function holdOff(u) { holds.delete(u); if (host) syncHolds(); }

  /** Tú empiezas / terminas de elegir: que lo sepan ya (no esperar al siguiente mensaje). */
  function holdStart() { if (host) syncHolds(); else flushClient(true); }
  function holdEnd() { if (host) syncHolds(); else flushClient(true); }

  /** Has elegido tu carta. */
  function localPicked() {
    if (host) picked(me);
    else { outEv.push(['lp']); flushClient(true); }
  }

  // ---------------- MVP ----------------

  /** Quién da el golpe que se está aplicando (anfitrión): un invitado ('h') o él mismo. */
  function hitter() { return hitFrom || me; }
  function creditKill(u) { if (active && host && u) kills.set(u, (kills.get(u) || 0) + 1); }
  /** `helper` ha levantado a alguien. Lo apunta el anfitrión. */
  function creditRevive(helper) {
    if (!active || !helper) return;
    if (host) revives.set(helper, (revives.get(helper) || 0) + 1);
    else { outEv.push(['rv', helper]); flushClient(true); }
  }
  /** Anfitrión: estadísticas de cada uno para el resumen. */
  function teamStats() {
    const row = (uid, name, dmg) => ({ uid, name, kills: kills.get(uid) || 0, dmg: Math.round(dmg || 0), revives: revives.get(uid) || 0 });
    const out = [row(me, nameOf(me), local ? local.dmgDealt : 0)];
    for (const m of mates.values()) out.push(row(m.uid, m.name, m.pl.net ? m.pl.net.dmg : 0));
    return out;
  }

  /** Anfitrión: se acabó para todos. */
  function over(data) {
    emit(['ov', data]);
    flushAll();
    end();
  }

  return {
    ANIMS, COLORS, begin, end, leave, tick, players, puppets, xpFactor, xpShare, scaleRate, scaleHp, scaleDmg, scaleCap,
    hitter, creditKill, creditRevive, teamStats,
    cast, hit, status, hurtShown, enemyAdded, enemyGone, enemyShot, pickupAdded, pickupGone, say,
    propBroken, collected, shinyCaught, levelStart, localPicked, over, holdStart, holdEnd,
    /** Anfitrión: evento para todos. Invitado: evento para el anfitrión. */
    broadcast(ev) { emit(ev); },
    toHost(ev) { if (active && !host) { outEv.push(ev); flushClient(true); } },
    /** Invitado: pide algo al anfitrión (dungeon.js: comprar en la tienda). */
    request(ev) { if (active && !host) { outEv.push(ev); flushClient(true); } },
    /** Anfitrión: evento sólo para un invitado. */
    sendTo(u, ev) { const m = mates.get(u); if (host && m && m.connected) m.q.push(ev); },
    mate(u) { return mates.get(u); },
    get mates() { return [...mates.values()]; },
    pushSnap, interp, renderClock, netInfo, DELAY, clockTrack, clockRender,
    /** Pruebas: tamaño de lo que se manda de enemigos a un invitado, formato antiguo y nuevo. */
    _frameSizes(u) { const m = mates.get(u); if (!m) return null; return { old: JSON.stringify(enemyList(m.pl)).length, delta: JSON.stringify(enemyDelta(m)).length }; },
    get members() { return members; },
    get active() { return active; },
    get isHost() { return active && host; },
    get local() { return local; }
  };
})();
