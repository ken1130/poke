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
  // Mensajes por segundo: 20 directo, 4 por el TURN y 6 por el relé de la Realtime
  // Database (en esta versión, plan gratis sin facturación: si se pasa del cupo, se para;
  // no cobra). Entre mensaje y mensaje, los demás se predicen (Player.netUpdate).
  const RATE_FAST = 1 / 20, RATE_TURN = 1 / 4, RATE_SLOW = 1 / 6;
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
  const lastTs = new Map();             // uid -> reloj (ts) del último mensaje suyo con posiciones
  const STALL_MS = 2500;
  let members = [];
  // MVP (esta versión): quién derriba (último golpe, en el anfitrión) y quién levanta a quién.
  const kills = new Map(), revives = new Map();

  // ---------------- escalado de dificultad ----------------

  const scaleRate = n => 1 + 0.75 * Math.max(0, n - 1);
  const scaleHp = n => 1 + 0.3 * Math.max(0, n - 1);

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
    G.PvP.begin(cfg);
    cfg.members.forEach((m, i) => {
      // PK: repartidos en un círculo, lejos unos de otros. Equipo: juntos.
      const ang = (i / cfg.members.length) * 6.2832;
      const x = cfg.pvp ? Math.round(Math.cos(ang) * 260) : (i - (cfg.members.length - 1) / 2) * 34;
      const y = cfg.pvp ? Math.round(Math.sin(ang) * 180) : 0;
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
            clock(), local.sizeK && local.sizeK !== 1 ? local.sizeK : 0, ...G.Companion.state(local)];
  }

  function readState(a) {
    return { x: a[0], y: a[1], ang: a[2], walk: a[3], hp: a[4], maxHp: a[5], dead: a[6], mv: a[7], ml: a[8],
             mag: a[9], aim: a[10], xpMul: a[11], rev: a[12], dmg: a[13] || 0, dex: a[14] || 0, ch: a[15] || 0, t: a[16] || 0, sz: a[17] || 0, bd: a[18] || 0, bs: a[19] || 0 };
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
                (e.burn > 0 ? 1 : 0) | (e.poison > 0 ? 2 : 0) | (e.shield > 0 ? 4 : 0)]);
    }
    return out;
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
    return { k: 'f', ts: clock(), t: r2(st.time), lv: st.level, xp: r2(st.xp), xn: st.xpNext, ki: st.kills, bo: st.bosses, co: st.coins, tk: [st.t1, st.t10],
             p, e: enemyList(m.pl), ev, h: holdList() };
  }

  function flushAll() { for (const m of mates.values()) if (m.connected) G.Net.send(m.uid, hostFrame(m)); }

  /** Un mensaje con eventos va por el canal fiable; si sólo lleva posiciones, por el rápido. */
  function sendFrame(to, f) { if (f.ev && f.ev.length) G.Net.send(to, f); else G.Net.sendFast(to, f); }

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
        case 'rv': creditRevive(ev[1]); break;                                         // `from` fue levantado por ev[1]
        case 'dg': G.Dungeon.onClient(from, ev); break;                               // tienda de Kecleon
        case 'cb': G.Floors.comboFx(ev[1], ev[2], ev[3], ev[4]); emit(ev, from); break;   // ataque combinado (floors.js)
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
    if (msg.h && msg.fresh) applyHolds(msg.h);
    if (stalled) { stalled = false; updateAway(); }
    for (const ev of msg.ev || []) applyHostEvent(ev);
    if (!msg.fresh) return;
    api.syncTeam({ time: msg.t, level: msg.lv, xp: msg.xp, xpNext: msg.xn, kills: msg.ki, bosses: msg.bo, coins: msg.co,
                   t1: (msg.tk || [])[0], t10: (msg.tk || [])[1] });
    for (const u in msg.p || {}) {
      const m = mates.get(u);
      if (m) m.pl.net = readState(msg.p[u]);
    }
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
        G.EnemyMgr.addRemote({ id: ev[1], dex: ev[2], x: ev[3], y: ev[4], boss: !!ev[5], raid: ev[5] === 2, shiny: !!ev[6], hp: ev[7], dmg: ev[8], beh: ev[9], elite: ev[10] || null });
        break;
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
      case 'sbox': api.sbox && api.sbox(); break;
      case 'fbox': api.fbox && api.fbox(); break;
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
      case 'dg': G.Dungeon.onNet(ev); break;
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
    emit(['ne', e.id, e.dex, r1(e.x), r1(e.y), e.boss ? (e.raid ? 2 : 1) : 0, e.shiny ? 1 : 0, Math.ceil(e.maxHp), r2(e.dmg), e.behavior, e.elite || 0]);
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
    // Elegir cartas (1) o la pausa (2): las dos paran la partida para todos.
    if (api.choosing && api.choosing()) now.set(me, 1);
    else if (api.paused && api.paused()) now.set(me, 2);
    for (const m of mates.values()) if (m.connected && m.pl && m.pl.net && m.pl.net.ch) now.set(m.uid, m.pl.net.ch);
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
    ANIMS, COLORS, begin, end, leave, tick, players, puppets, xpFactor, xpShare, scaleRate, scaleHp,
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
    get members() { return members; },
    get active() { return active; },
    get isHost() { return active && host; },
    get local() { return local; }
  };
})();
