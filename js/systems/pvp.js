/* ============ pvp.js — PK en una sala (último en pie gana) ============
 * Va sobre el cooperativo (coop.js): cada uno decide lo que le golpea, así que
 * aquí los ataques "fantasma" de los demás (combat.js) también te hacen daño.
 *   - 15 s de preparación sin daño entre jugadores; salís separados.
 *   - El daño de los movimientos está pensado para Pokémon salvajes con mucha
 *     vida: a un jugador le llega el 30 %.
 *   - Sin revivir. El anfitrión acaba la partida cuando queda uno (game.js).
 *   - Siguen saliendo Pokémon salvajes (a la mitad) para subir de nivel.
 *
 * (2026-10-15) PK con más sensación de pelea:
 *   - Apuntar: en PK los movimientos salen hacia donde apuntas (ratón; en el móvil,
 *     el pulgar derecho en la mitad derecha de la pantalla). Siguen saliendo solos
 *     cuando hay un rival cerca; el que apunta eres tú. (player.js usa manualAim.)
 *   - Golpes que se notan: quien recibe avisa al que pega (['pv', 'h', ...]): el que
 *     pega ve la marca de impacto, el número y oye el golpe; parón de 60 ms, empujón,
 *     y al tumbar a alguien cámara lenta, "¡K.O.!" y aviso arriba a la izquierda.
 *   - Arena (opción de la sala, por defecto sí): sin salvajes, jefes ni eventos. En la
 *     preparación cada uno elige 3 de 5 movimientos de ataque (nivel 3, 1 cambio), sin
 *     mejoras de la tienda, con ×1,5 de vida y ×0,5 de daño entre jugadores (fuera, ×0,3). Bayas en el centro cada 20 s y, desde
 *     el 1:30, la zona segura se cierra (fuera se pierde vida).
 */
G.PvP = (() => {
  // Arena: más daño por golpe y algo más de vida (sin cartas ni mejoras, con K = 0,3 un
  // combate duraba minutos: unos 2 de daño por golpe contra 170 de vida).
  const GRACE = 15, K = 0.3, K_ARENA = 0.5;
  // Equipos (PK por equipos 2 contra 2): 0 = rojo, 1 = azul. Los del mismo equipo no se hacen daño.
  const TEAM_NAMES = ['Equipo rojo', 'Equipo azul'], TEAM_COLORS = ['#ff5f6d', '#5fc8ff'];
  let on = false, saidGo = false, winner, teams = false, myTeam = null, arena = false;

  function begin(cfg) {
    on = !!(cfg && cfg.pvp); saidGo = false; winner = undefined; teams = !!(on && cfg.teams); myTeam = null;
    arena = !!(on && cfg.arena);
    feed = []; hitMark = 0; stopT = 0; slowT = 0; berryT = GRACE + 5; zoneT = 0; picked = false;
    G.PvPX.begin(cfg, on);            // extras del PK (pvp-extra.js): rondas, tesoro, trampas, fantasmas...
    if (on) G.Spawner.say(arena ? '¡PK en la arena! Elige tus movimientos: tenéis 15 s…' : '¡PK! Gana el último en pie. Tenéis 15 s para prepararos…', 4, true);
  }

  // (Entre rondas, pvp-extra.js, nadie hace daño a nadie.)
  const armed = () => on && G.Game.st.time >= GRACE && !G.PvPX.inBreak;
  /** Tu Pokémon, si se le puede golpear ahora. (Ya no se usa para el daño: lo decide quien ataca, ver deal.) */
  function mine(owner) {
    const pl = G.Coop.local;
    if (teams && owner && owner.team === (pl && pl.team)) return null;       // compañero de equipo
    return armed() && pl && !pl.dead && !pl.god && owner && owner !== pl ? pl : null;
  }
  /** Te dan: daño, empujón y aviso al que te ha dado (para su marca de impacto). */
  function hurt(pl, dmg, type, owner, crit) {
    const before = pl.hp;
    // Protegido de verdad (Protección, estrella, eligiendo cartas...): no entra, y el que pega lo ve.
    if (pl.protectT > 0 || pl.star || pl.safe || pl.god || pl.picking) {
      if (owner) send(['pv', 'm', owner.uid, pl.uid || G.Net.uid, 'b']);
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, G.T('¡Bloqueado!'), '#bff3ff');
      return true;
    }
    // Entre jugadores no vale la invulnerabilidad larga tras un golpe (0,45 s): si no, la mitad
    // de los golpes "acertados" no hacían nada. Un respiro corto (0,1 s) sí.
    pl.invuln = 0;
    const shake = G.Camera.shake;
    pl.hurt(dmg * (arena ? K_ARENA : K), type);
    G.Camera.shake = shake;               // (Player.hurt sacude la cámara: en PK, no)
    pl.invuln = Math.min(pl.invuln, 0.1);
    const d = before - pl.hp;
    if (d <= 0) return true;
    if (owner && !G.PvPX.hidden(owner)) hitDirs.push({ a: Math.atan2(owner.y - pl.y, owner.x - pl.x), t: 0.9 });   // de dónde vino (drawWorld)
    // Lo que notas al recibir (2026-10-15, a petición del dueño): sin destellos de pantalla (le
    // dolían los ojos), sin sacudidas (mareaban) y sin parones (con golpes seguidos eran como un
    // aturdimiento). Queda: tu Pokémon destella (Player.hurt), un empujón corto, el sonido y el número.
    if (owner) {
      const a = Math.atan2(pl.y - owner.y, pl.x - owner.x);
      for (let step = crit ? 20 : 14; step > 0; step -= 4) {
        const nx = pl.x + Math.cos(a) * step, ny = pl.y + Math.sin(a) * step;
        if (G.World.isFree(nx, ny, pl.r * 0.6)) { pl.x = nx; pl.y = ny; break; }
      }
    }
    const ko = pl.dead || pl.hp <= 0;
    const ev = ['pv', 'h', pl.uid || G.Net.uid, owner ? owner.uid : null, Math.round(d), ko ? 1 : 0];
    // Anfitrión: a todos. Invitado: al anfitrión, que lo reparte (broadcast no sale de un invitado).
    if (G.Coop.isHost) G.Coop.broadcast(ev); else if (G.Coop.active) G.Coop.request(ev);
    onNet(ev);
    return true;
  }

  function tick() {
    if (teams && G.Coop.local) myTeam = G.Coop.local.team;   // se recuerda: al acabar ya no hay sala
    if (on && !saidGo && armed()) { saidGo = true; G.Spawner.say('¡A luchar!', 2.4, true); G.Audio.sfx('boss'); }
  }

  // Juicio antiguo (lo hacía quien recibía): ya no hace daño. Se dejan para no tocar combat.js.
  const target = () => null;
  /** Un disparo de otro jugador que llega hasta ti: sólo se deshace (el daño ya lo ha decidido él). */
  function touchesMe(p) {
    const pl = mine(p.owner);
    return !!pl && G.U.dist2(p.x, p.y, pl.x, pl.y) <= (p.r + pl.r) ** 2;
  }

  // ================= quien ataca decide (2026-10-15) =================
  /** combat.js: rivales vivos (a tiro) dentro del círculo, como si fueran enemigos. */
  function foesIn(x, y, r) {
    const me = G.Coop.local;
    if (!armed() || !me) return [];
    const out = [];
    for (const p of G.Coop.puppets()) {
      if (p.dead || (teams && p.team === me.team)) continue;
      // Invisible (tesoro, pvp-extra.js): los círculos grandes son "buscar a quién apuntar" y no
      // lo encuentran; los pequeños (explosión, aura, golpe de un proyectil) sí le dan.
      if (r >= G.PvPX.SEEK_R && G.PvPX.hidden(p)) continue;
      if (G.U.dist2(x, y, p.x, p.y) > (r + p.r) ** 2) continue;
      if (p.id == null) p.id = 'pv:' + p.uid;
      if (!p.applySlow) { p.applySlow = (k, t) => status(p, t || 1); p.applyRoot = t => status(p, t || 0.6); p.applyBurn = () => {}; p.applyPoison = () => {}; }
      out.push(p);
    }
    return out;
  }
  /** combat.js, al repetir el ataque de `owner` en tu pantalla: tú, si eres su rival y estás en el círculo. */
  function meFor(owner, x, y, r) {
    const me = G.Coop.local;
    if (!armed() || !me || me.dead || !owner || owner === me || (teams && owner.team === me.team)) return [];
    if (G.U.dist2(x, y, me.x, me.y) > (r + me.r) ** 2) return [];
    if (me.id == null) me.id = 'pv:me';
    return [me];
  }
  /** El rival más cercano a un punto (torretas). */
  function foeNear(x, y, r) {
    let best = null, bd = r * r;
    for (const p of foesIn(x, y, r)) { const d = G.U.dist2(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  const DODGE = 95;               // px de margen por el retraso de la red (~0,1 s de interpolación + ping)
  const lastHit = new Map();      // uid del rival -> último golpe tuyo (ms): como mucho uno cada 70 ms
  const send = ev => { if (G.Coop.isHost) G.Coop.broadcast(ev); else if (G.Coop.active) G.Coop.request(ev); };
  /** Le has dado a un rival (en TU pantalla): se nota al momento y se le avisa para que pierda vida. */
  const MELEE_K = 1.3;            // cuerpo a cuerpo: hay que arriesgarse a pegarse (y te pueden alejar)
  const pending = new Map();      // uid del rival -> golpes de los últimos 70 ms (se mandan sumados)
  function deal(attacker, foe, dmg, type, crit, kind) {
    if (attacker !== G.Coop.local || !foe || foe.dead || !armed()) return;
    dmg *= G.PvPX.atkK();                // tesoro: ataque ×2
    if (kind === 'melee' || kind === 'dash' || kind === 'fist') dmg *= MELEE_K;
    // Lo que ves tú al acertar (al momento): marca de impacto, destello del rival, chispas y golpe.
    // El número sale cuando él confirma cuánto le ha quitado (['pv','h']), así nunca miente.
    hitMark = 0.25;
    foe.flash = 0.14;
    G.FX.sp('impact', type || 'normal', foe.x, foe.y - foe.bodyH * 0.5, { life: 0.16, scale: crit ? 2.4 : 1.7 });
    G.FX.burst(foe.x, foe.y - foe.bodyH * 0.5, '#ffffff', crit ? 14 : 8, 160);
    G.Audio.sfx(crit ? 'break' : 'hit');
    // Varios golpes casi a la vez (Lanzallamas, Hoja Afilada...): se suman en un solo aviso.
    const now = performance.now(), last = lastHit.get(foe.uid) || 0;
    const p = pending.get(foe.uid);
    // Rayos (familia beam y Rayo Destructor): quien tenga Vuelo Celestial no los recibe (lo mira él, ev[9]).
    const ray = kind === 'beam' || kind === 'dbeam';
    if (p) { p.dmg += dmg; p.crit = p.crit || crit; p.ray = p.ray && ray; return; }
    if (now - last < 70) {
      pending.set(foe.uid, { dmg, type, crit, ray });
      setTimeout(() => {
        const q = pending.get(foe.uid); pending.delete(foe.uid);
        if (q && !foe.dead) { lastHit.set(foe.uid, performance.now()); sendHit(foe, q.dmg, q.type, q.crit, q.ray); }
      }, 70 - (now - last));
      return;
    }
    lastHit.set(foe.uid, now);
    sendHit(foe, dmg, type, crit, ray);
  }
  function sendHit(foe, dmg, type, crit, ray) {
    send(['pv', 'd', foe.uid, G.Net.uid, +(dmg).toFixed(1), type || null, crit ? 1 : 0, Math.round(foe.x), Math.round(foe.y), ray ? 1 : 0]);
  }
  /** Frenar a un rival (Grava, charcos...): se le pide a él. */
  function status(foe, t) { if (foe && foe.uid) send(['pv', 's', foe.uid, +t.toFixed(2)]); }

  /** Círculo (aura, explosión, charco, golpe de un proyectil). */
  function circle(owner, x, y, r, dmg, type) {
    const pl = target(owner);
    return pl && G.U.dist2(x, y, pl.x, pl.y) <= (r + pl.r) ** 2 ? hurt(pl, dmg, type, owner) : false;
  }
  /** Abanico (cuerpo a cuerpo). */
  function arc(owner, x, y, r, aim, half, dmg, type) {
    const pl = target(owner);
    if (!pl || G.U.dist2(x, y, pl.x, pl.y) > (r + pl.r) ** 2) return false;
    const a = Math.atan2(pl.y - y, pl.x - x);
    return Math.abs(((a - aim + Math.PI * 3) % 6.2832) - Math.PI) <= half ? hurt(pl, dmg, type, owner) : false;
  }
  /** Tramo con anchura (rayo, embestida). */
  function seg(owner, sx, sy, ex, ey, w, dmg, type) {
    const pl = target(owner);
    if (!pl) return false;
    const dx = ex - sx, dy = ey - sy, l2 = dx * dx + dy * dy || 1;
    const t = G.U.clamp(((pl.x - sx) * dx + (pl.y - sy) * dy) / l2, 0, 1);
    return G.U.dist2(sx + dx * t, sy + dy * t, pl.x, pl.y) <= (w / 2 + pl.r) ** 2 ? hurt(pl, dmg, type, owner) : false;
  }
  /** Proyectil fantasma de otro jugador. Devuelve true si te ha dado (se gasta). */
  function projectile(p) { return circle(p.owner, p.x, p.y, p.r, p.dmg, p.mtype); }
  /** Órbita de otro jugador: te golpea como mucho cada `rehit` s. */
  function orb(p, now) {
    const pl = target(p.owner);
    if (!pl) return;
    const last = p.hitLog.get('pvp') || -99;
    if (now - last < p.rehit) return;
    if (G.U.dist2(p.x, p.y, pl.x, pl.y) <= (p.r + pl.r) ** 2) { p.hitLog.set('pvp', now); hurt(pl, p.dmg, p.mtype, p.owner); }
  }

  /** El rival vivo más cercano a `pl` dentro de `range` (para apuntar y atacar), ya pasada la preparación. */
  function foe(pl, range) {
    if (!armed() || !G.Coop.active) return null;
    let best = null, bd = range * range;
    for (const p of G.Coop.puppets()) {
      if (p.dead || (teams && p.team === pl.team) || G.PvPX.hidden(p)) continue;     // (invisible: no se le apunta)
      const d = G.U.dist2(pl.x, pl.y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** ¿Has ganado tú el PK que acaba de terminar? (por equipos: si ha ganado el tuyo) */
  function wonByMe() {
    if (winner == null) return false;
    if (teams) return myTeam != null && winner === 'T' + myTeam;
    return !!G.Social.me && winner === G.Social.me.name;
  }
  /** Por equipos: 'T0'/'T1' del equipo que queda en pie, null si nadie, undefined si quedan varios. */
  function teamWinner(alive) {
    const ts = new Set(alive.map(p => p.team));
    if (ts.size > 1) return undefined;
    return ts.size ? 'T' + [...ts][0] : null;
  }

  /** Lo pone el anfitrión al acabar (o llega en el 'ov'): nombre del ganador, o null si nadie. */
  function setWinner(name) { winner = name; }

  /** Tras el resumen de la run: quién ha ganado. */
  function afterRun() {
    if (!on && winner === undefined) return;
    const box = document.getElementById('over-stats');
    if (box && winner !== undefined) {
      const sc = G.PvPX.scoreLine();      // al mejor de 3: el marcador final
      if (sc) box.insertAdjacentHTML('afterbegin', `<div style="grid-column:1/-1;text-align:center" class="panel"><span translate="no">${sc.replace(/[&<>"']/g, '')}</span></div>`);
      const me = G.Social.me && G.Social.me.name;
      const mine = teams ? wonByMe() : winner === me;
      const txt = winner == null ? G.T('¡Empate!') : mine ? G.T(teams ? '¡Tu equipo ha ganado!' : '¡Has ganado el PK!') : G.I18n.f('¡{x} ha ganado el PK!', teams ? G.T(TEAM_NAMES[+String(winner).slice(1)] || '') : winner);
      // El título de siempre ("Has caído…") no vale en PK: victoria, derrota o empate.
      const title = document.getElementById('over-title');
      if (title) title.textContent = G.T(winner == null ? '¡Empate!' : mine ? '¡Victoria!' : 'Derrota…');
      box.insertAdjacentHTML('afterbegin', `<div style="grid-column:1/-1;text-align:center" class="panel"><b class="gold" style="font-size:22px">🏆 ${txt}</b></div>`);
    }
    on = false; winner = undefined; teams = false; myTeam = null; arena = false;
    G.PvPX.reset();
  }

  // ================= golpes que se notan =================
  let feed = [], hitMark = 0, stopT = 0, slowT = 0, hitDirs = [];
  const nameOf = uid => {
    if (!uid) return '?';
    if (uid === G.Net.uid) return (G.Social.me && G.Social.me.name) || G.T('Tú');
    const m = G.Coop.mate(uid);
    return m ? m.name : '?';
  };
  /** Todos: alguien ha recibido un golpe de otro jugador. ['pv','h', víctima, atacante, daño, ko] */
  function onNet(ev) {
    const me = G.Net.uid;
    if (G.PvPX.onNet(ev)) return;       // rondas, tesoro, trampas, piedritas, duelo final (pvp-extra.js)
    // ['pv','d', víctima, atacante, daño, tipo, crítico]: te han dado en SU pantalla.
    if (ev[1] === 'd') {
      if (ev[2] !== me) return;
      const pl = G.Game.player, at = G.Coop.mate(ev[3]);
      const owner = at && at.pl;
      if (!pl || pl.dead || !armed() || (teams && owner && owner.team === pl.team)) return;
      // Donde te vio él (con el retraso de la red) y donde estás tú: si ya te habías ido lejos,
      // lo has esquivado (si no, recibías golpes "de la nada" corriendo).
      if (ev[7] != null && G.U.dist2(ev[7], ev[8], pl.x, pl.y) > DODGE * DODGE) {
        G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, G.T('¡Esquivado!'), '#bff3ff');
        send(['pv', 'm', ev[3], me, 'd']);
        return;
      }
      // Vuelo Celestial: inmune a los rayos del rival (se le avisa como bloqueado).
      if (ev[9] && G.Combat.beamImmune(pl)) {
        G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, G.T('¡Inmune!'), '#ffc4e6');
        send(['pv', 'm', ev[3], me, 'b']);
        return;
      }
      hurt(pl, ev[4], ev[5], owner, !!ev[6]);
      return;
    }
    // ['pv','s', víctima, segundos]: te frenan.
    if (ev[1] === 's') { if (ev[2] === me && G.Game.player) G.Game.player.slowT = Math.max(G.Game.player.slowT || 0, ev[3]); return; }
    // ['pv','m', atacante, víctima, 'b'|'d']: tu golpe no entró (bloqueado o esquivado).
    if (ev[1] === 'm') {
      if (ev[2] !== me) return;
      const v = G.Coop.mate(ev[3]), p = v && v.pl;
      if (p) G.FX.dmgText(p.x, p.y - p.bodyH - 6, G.T(ev[4] === 'b' ? '¡Bloqueado!' : '¡Esquivado!'), '#bff3ff');
      return;
    }
    if (ev[1] !== 'h') return;
    const [, , vic, atk, d, ko, why] = ev;
    // Tu golpe confirmado: el número que de verdad le has quitado.
    if (atk && atk === me && vic !== me) {
      const v = G.Coop.mate(vic), p = v && v.pl;
      if (p) G.FX.dmgText(p.x + G.U.rand(-8, 8), p.y - p.bodyH - 6, String(d), ko ? '#ff5f6d' : '#ffe14d', true);
    }
    if (ko) {
      feed.unshift({ text: atk ? G.I18n.f('{x} ha tumbado a {x}', nameOf(atk), nameOf(vic)) : why === 't' ? G.I18n.f('{x} ha caído en una trampa', nameOf(vic)) : G.I18n.f('{x} ha quedado fuera de la zona', nameOf(vic)), t: 5, mine: atk === me || vic === me });
      feed = feed.slice(0, 4);
      if (atk === me) { G.FX.dmgText(G.Game.player.x, G.Game.player.y - 70, G.T('¡K.O.!'), '#ffd23f', true); G.Audio.sfx('bossDown'); }
      else G.Audio.sfx('faint');
      G.PvPX.onKo(atk, vic);             // rachas de K.O.
    }
  }
  /** game.js: el reloj del juego va más despacio un instante (parón al golpear, cámara lenta al tumbar). */
  // (sin parones ni cámara lenta al golpear: quitaban el control; sólo 0,6 s al empezar el duelo final)
  function timeScale() { return G.PvPX.timeScale(); }

  // ================= apuntar =================
  const aiming = () => on && G.Coop.active && G.Game.state === 'playing';
  /** player.js: hacia dónde apunta tu Pokémon (radianes) o null si no se apunta a mano. */
  function manualAim(pl) {
    if (!aiming() || pl.remote || pl.dead) return null;
    // Móvil: mientras arrastras, apuntas tú; al soltar, vuelve a apuntar solo al rival más cercano
    // (antes se quedaba mirando a donde soltaste y fallaba todo).
    if (G.Touch.active) { const v = G.Touch.aimVector(); return v ? Math.atan2(v[1], v[0]) : null; }
    const w = mouseWorld();
    return w ? Math.atan2(w[1] - pl.y, w[0] - pl.x) : null;
  }
  function mouseWorld() {
    const m = G.Input.mouse();
    if (!m || (!m.x && !m.y)) return null;
    return [G.Camera.left() + m.x / G.Camera.scale, G.Camera.top() + m.y / G.Camera.scale];
  }

  // ================= arena =================
  // Arena: se cierra de 1:30 a 2:30. Campo abierto (2026-10-15): de 4:00 a 7:00 y desde más lejos,
  // para que nadie pueda esconderse para siempre.
  const ZONE = { arena: [90, 150, 820, 240], wild: [240, 420, 1800, 300] };
  const zp = () => ZONE[arena ? 'arena' : 'wild'];
  let ZONE_FROM = 90, ZONE_TO = 150, ZONE_R0 = 820, ZONE_R1 = 240;
  let berryT = 0, zoneT = 0, picked = false;
  function zoneR(t = G.Game.st.time) {
    const base = t <= ZONE_FROM ? ZONE_R0 : ZONE_R0 + (ZONE_R1 - ZONE_R0) * Math.min(1, (t - ZONE_FROM) / (ZONE_TO - ZONE_FROM));
    const cap = G.PvPX.zoneCap(t);         // duelo final: se cierra deprisa hasta 260
    return cap == null ? base : Math.min(base, cap);
  }
  /** Hasta dónde se cerrará (la línea blanca): en el duelo final, 260. */
  const finalR = () => G.PvPX.zoneCap(G.Game.st.time) != null ? Math.min(ZONE_R1, G.PvPX.DUEL_R) : ZONE_R1;
  /** ¿Ya hace daño estar fuera? (desde que empieza a cerrarse, o en el duelo final) */
  const zoneLive = t => (t > ZONE_FROM || G.PvPX.zoneCap(t) != null) && !G.PvPX.inBreak;
  /** Cada fotograma (todos): zona segura y bayas (anfitrión). */
  function arenaTick(dt, pl) {
    if (!on || !G.Coop.active) return;
    [ZONE_FROM, ZONE_TO, ZONE_R0, ZONE_R1] = zp();
    for (const h of hitDirs) h.t -= dt;
    hitDirs = hitDirs.filter(h => h.t > 0);
    const t = G.Game.st.time;
    if (t >= ZONE_FROM && t - dt < ZONE_FROM) { G.Spawner.say(G.T('¡La zona empieza a cerrarse! Ve hacia el centro'), 3.5, true); G.Audio.sfx('boss'); }
    for (const f of feed) f.t -= dt;
    feed = feed.filter(f => f.t > 0);
    if (hitMark > 0) hitMark -= dt;
    // Fuera de la zona: se pierde vida.
    if (pl && !pl.dead && zoneLive(t) && Math.hypot(pl.x, pl.y) > zoneR(t)) {
      zoneT -= dt;
      if (zoneT <= 0) {
        zoneT = 0.5; pl.invuln = 0; const sh = G.Camera.shake; pl.hurt(pl.maxHp * 0.04); G.Camera.shake = sh;
        if (pl.dead) { const ev = ['pv', 'h', pl.uid || G.Net.uid, null, 0, 1]; send(ev); onNet(ev); }
      }
    }
    if (arena && G.Coop.isHost && t >= berryT) {
      berryT = t + 20;
      if (G.Pickups.all().filter(p => p.kind === 'heal').length < 2) {
        const r = Math.min(160, zoneR(t) * 0.4);
        for (let k = 0; k < 20; k++) {
          const a = Math.random() * 6.2832, d = Math.random() * r, x = Math.cos(a) * d, y = Math.sin(a) * d;
          if (G.World.isFree(x, y, 14)) { G.Pickups.drop('heal', x, y, 1); break; }
        }
      }
    }
  }

  // --- elegir 3 de 5 ---
  const PICK_N = 3, OFFER_N = 5, PICK_LVL = 3;
  let offers = [], chosen = [], rerolls = 1, pickTimer = 0;
  const attackDef = d => d && !['buff', 'bulk', 'flameshield', 'support'].includes(d.kind);
  // Cuerpo a cuerpo o muy corto: con muchos de éstos te tienen a distancia todo el combate.
  const SHORT = ['melee', 'dash', 'aura', 'flameshield', 'orbit', 'trail', 'mine'];
  const isShort = id => SHORT.includes(G.Moves.BY_ID[id].kind);
  /** 5 movimientos: al menos 3 de distancia y como mucho 2 cortos (2026-10-15: salían todos cuerpo a cuerpo). */
  function rollOffers(pl) {
    const own = G.Moves.poolFor(pl.mon).filter(id => attackDef(G.Moves.BY_ID[id]));
    const any = G.Moves.ALL.filter(attackDef).map(d => d.id);
    const pick = (list, n, ok) => G.U.pickN(list.filter(id => ok(id)), n);
    const out = [];
    const add = ids => { for (const id of ids) if (out.length < OFFER_N && !out.includes(id)) out.push(id); };
    // Distancia: primero los de su tipo, luego cualquiera.
    add(pick(own, 3, id => !isShort(id)));
    add(pick(any, 3 - out.length, id => !isShort(id) && !out.includes(id)));
    // El resto, de su tipo si puede (como mucho 2 cortos).
    const fill = list => { for (const id of G.U.pickN(list, list.length)) {
      if (out.length >= OFFER_N || out.includes(id)) continue;
      if (isShort(id) && out.filter(isShort).length >= 2) continue;
      out.push(id);
    } };
    fill(own); fill(any);
    return G.U.pickN(out, out.length);      // mezclados
  }
  /** game.js, al empezar: la arena prepara a tu Pokémon y abre la elección. */
  function arenaStart(pl) {
    if (!arena || !on || !pl) return;
    pl.maxHp = pl.hp = Math.round(pl.maxHp * 1.5);
    offers = rollOffers(pl); chosen = []; rerolls = 1; pickTimer = GRACE - 1.5; picked = false; rerollMode = false;
    renderPick();
    G.UI.show('scr-pkpick');
  }
  /**
   * Al mejor de 3 (pvp-extra.js): el que ha perdido la ronda puede cambiar sus movimientos una vez
   * (3 de 5 nuevos, sin "Cambiar opciones"). Es opcional: "Quedarme con los míos" o dejar pasar el
   * tiempo sin elegir 3 deja los que tenía. La vida no cambia (arenaStart ya la subió al empezar).
   */
  let rerollMode = false;
  function reroll(secs) {
    const pl = G.Game.player;
    if (!arena || !on || !pl) return;
    offers = rollOffers(pl); chosen = []; rerolls = 0; pickTimer = secs; picked = false; rerollMode = true;
    renderPick();
    G.UI.show('scr-pkpick');
  }
  function keepMine() {
    if (picked) return;
    picked = true; rerollMode = false;
    G.UI.hide('scr-pkpick');
    G.Audio.sfx('confirm');
  }
  const pickSub = () => rerollMode
    ? G.I18n.f('Revancha: elige {x} de {x} nuevos o quédate con los tuyos · quedan {x} s', PICK_N, OFFER_N, Math.max(0, Math.ceil(pickTimer)))
    : G.I18n.f('Elige {x} de {x} · quedan {x} s', PICK_N, OFFER_N, Math.max(0, Math.ceil(pickTimer)));
  /** Nueva ronda (pvp-extra.js): la preparación, las bayas y la zona vuelven a empezar. */
  function roundReset(t0) {
    saidGo = false; berryT = t0 + 5; zoneT = 0; hitDirs = []; hitMark = 0; stopT = 0; slowT = 0;
    pending.clear();
  }
  function renderPick() {
    const box = document.getElementById('pk-cards');
    if (!box) return;
    box.innerHTML = '';
    offers.forEach((id, i) => {
      const m = G.Moves.instance(id, PICK_LVL), col = G.U.TYPE_COLOR[m.type], sel = chosen.includes(id);
      const el = document.createElement('div');
      el.className = 'card' + (sel ? ' pk-sel' : '');
      el.innerHTML = `<div class="ico" style="background:${col}33">${G.Icons.html('move:' + id, 32)}</div>
        <div class="txt"><div class="nm">${G.T(m.name)} <span class="tag-chip" style="background:${col}">Lv.${PICK_LVL}</span></div><div class="ds">${G.T(m.desc || '')}</div></div>
        <div class="key">${sel ? '✔' : i + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => toggle(i);
      box.appendChild(el);
    });
    document.getElementById('pk-sub').textContent = pickSub();
    const ok = document.getElementById('pk-ok');
    ok.disabled = chosen.length !== PICK_N;
    ok.textContent = G.I18n.f('¡A luchar! ({x}/{x})', chosen.length, PICK_N);
    ok.onclick = confirmPick;
    const rr = document.getElementById('pk-reroll');
    if (rerollMode) { rr.disabled = false; rr.textContent = G.T('Quedarme con mis movimientos'); rr.onclick = keepMine; return; }
    rr.disabled = rerolls <= 0;
    rr.textContent = G.I18n.f('Cambiar opciones ({x})', rerolls);
    rr.onclick = () => { if (rerolls > 0) { rerolls--; offers = rollOffers(G.Game.player); chosen = []; G.Audio.sfx('select'); renderPick(); } };
  }
  function toggle(i) {
    const id = offers[i];
    if (!id || picked) return;
    if (chosen.includes(id)) chosen = chosen.filter(x => x !== id);
    else if (chosen.length < PICK_N) chosen.push(id);
    else return G.Audio.sfx('error');
    G.Audio.sfx('select');
    renderPick();
  }
  function confirmPick() {
    if (picked) return;
    const pl = G.Game.player;
    for (const id of G.U.pickN(offers.filter(x => !chosen.includes(x)), PICK_N - chosen.length)) chosen.push(id);
    picked = true;
    G.UI.hide('scr-pkpick');
    // Fuera lo que traías: sólo los 3 elegidos, a nivel 3.
    pl.moves = []; pl.slots = []; pl.active = 0;
    for (const id of chosen) pl.addMove(id);
    const up = new Map(pl.moves.map(m => [m, G.Moves.instance(m.id, PICK_LVL)]));
    pl.moves = pl.moves.map(m => up.get(m));
    pl.slots = pl.slots.map(g => g.map(m => up.get(m)));
    pl.setActive(0);
    G.Audio.sfx('confirm');
    G.Spawner.say(G.T('¡Listo! Cambia de movimiento con 1-3 (o tocando su icono)'), 3, true);
    rerollMode = false;
  }
  /** Cada fotograma: cuenta atrás de la elección. */
  function pickTick(dt) {
    if (!arena || picked || !G.UI.isOpen('scr-pkpick')) return;
    const before = Math.ceil(pickTimer);
    pickTimer -= dt;
    // (Revancha: si no ha elegido 3, se queda con los suyos.)
    if (pickTimer <= 0) { if (rerollMode && chosen.length < PICK_N) keepMine(); else confirmPick(); }
    else if (Math.ceil(pickTimer) !== before) document.getElementById('pk-sub').textContent = pickSub();   // sólo el texto: rehacer las cartas se comía clics
  }
  /** Teclas 1-5 mientras se elige (game.js). */
  function pickKey(n) { if (arena && !picked && G.UI.isOpen('scr-pkpick')) { if (n >= 1 && n <= OFFER_N) toggle(n - 1); return true; } return false; }

  // ================= dibujo =================
  /** Mundo: zona segura, línea de tiro y punto de mira. */
  function drawWorld(ctx) {
    if (!on || !G.Coop.active) return;
    const cam = G.Camera, pl = G.Game.player;
    // Zona segura (2026-10-16: antes sólo se dibujaba 10 s antes de cerrarse y, como al principio
    // es más grande que la pantalla, no se sabía dónde estaba): el borde siempre, el exterior en
    // rojo desde 10 s antes y, mientras no ha acabado de cerrarse, el círculo final en blanco.
    {
      const t = G.Game.st.time, R = zoneR(), live = t > ZONE_FROM - 10 || zoneLive(t);
      ctx.save();
      if (live) {
        ctx.beginPath();
        ctx.rect(cam.left() - 80, cam.top() - 80, cam.w + 160, cam.h + 160);
        ctx.arc(0, 0, R, 0, 6.2832, true);
        ctx.fillStyle = 'rgba(150,20,50,0.28)';
        ctx.fill('evenodd');
      }
      ctx.setLineDash([14, 10]);
      ctx.lineWidth = 4; ctx.strokeStyle = live ? '#ff5f6d' : 'rgba(255,95,109,.55)';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.stroke();
      const R1 = finalR();
      if (t < ZONE_TO || R > R1 + 1) {
        ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.beginPath(); ctx.arc(0, 0, R1, 0, 6.2832); ctx.stroke();
      }
      ctx.restore();
    }
    G.PvPX.drawWorld(ctx);             // piedritas de los fantasmas
    // Vida de los rivales encima de su cabeza (antes había que mirar la lista de arriba).
    const me = G.Coop.local;
    for (const p of G.Coop.puppets()) {
      if (p.dead || (teams && me && p.team === me.team) || !G.Camera.sees(p.x, p.y, 40) || G.PvPX.hidden(p)) continue;
      const f = Math.max(0, Math.min(1, p.hp / (p.maxHp || 1))), bw = 40, bx = Math.round(p.x - bw / 2), by = Math.round(p.y - p.bodyH - 30);
      ctx.fillStyle = 'rgba(10,12,24,.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
      ctx.fillStyle = f > 0.5 ? '#5fe08a' : f > 0.25 ? '#ffd23f' : '#ff5f6d'; ctx.fillRect(bx, by, Math.round(bw * f), 5);
    }
    // De dónde te han dado: flechita roja junto a tu Pokémon, que se apaga sola (sin destellos).
    if (pl && !pl.dead) for (const hd of hitDirs) {
      const r = 46, x = pl.x + Math.cos(hd.a) * r, y = pl.y - 14 + Math.sin(hd.a) * r * 0.8;
      ctx.save(); ctx.globalAlpha = Math.min(1, hd.t / 0.4) * 0.85;
      ctx.translate(x, y); ctx.rotate(hd.a);
      ctx.fillStyle = '#1a1220'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff6b7a'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-4, -5.5); ctx.lineTo(-4, 5.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (!pl || pl.dead || !aiming()) return;
    let tx, ty;
    if (G.Touch.active) {
      if (!G.Touch.aimVector()) return;
      tx = pl.x + Math.cos(pl.aim) * 150; ty = pl.y + Math.sin(pl.aim) * 150;
    } else {
      const w = mouseWorld();
      if (!w) return;
      const d = Math.min(300, Math.hypot(w[0] - pl.x, w[1] - pl.y));
      tx = pl.x + Math.cos(pl.aim) * d; ty = pl.y + Math.sin(pl.aim) * d;
    }
    const sy = pl.y - G.LIFT;
    ctx.save();
    // Línea de tiro punteada.
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
    const vx = tx - pl.x, vy = ty - sy, len = Math.hypot(vx, vy) || 1;
    for (let d = 26; d < len - 14; d += 14) ctx.fillRect(Math.round(pl.x + vx / len * d) - 1, Math.round(sy + vy / len * d) - 1, 3, 3);
    ctx.globalAlpha = 1;
    // Punto de mira en píxeles (rojo y en X al acertar).
    const hit = hitMark > 0, c = hit ? '#ff5f6d' : '#ffd23f', x = Math.round(tx), y = Math.round(ty);
    ctx.fillStyle = '#1a1220';
    if (hit) {
      for (let i = 3; i <= 9; i++) for (const [sx, sy2] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ctx.fillRect(x + sx * i - 2, y + sy2 * i - 2, 4, 4);
      ctx.fillStyle = '#ffffff';
      for (let i = 3; i <= 9; i++) for (const [sx, sy2] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ctx.fillRect(x + sx * i - 1, y + sy2 * i - 1, 2, 2);
    } else {
      ctx.fillRect(x - 12, y - 2, 8, 4); ctx.fillRect(x + 4, y - 2, 8, 4); ctx.fillRect(x - 2, y - 12, 4, 8); ctx.fillRect(x - 2, y + 4, 4, 8);
      ctx.fillStyle = c;
      ctx.fillRect(x - 11, y - 1, 6, 2); ctx.fillRect(x + 5, y - 1, 6, 2); ctx.fillRect(x - 1, y - 11, 2, 6); ctx.fillRect(x - 1, y + 5, 2, 6);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.restore();
  }
  /** Pantalla: avisos de K.O. (arriba a la izquierda) y la zona. */
  function drawHud(ctx, w, h) {
    if (!on || !G.Coop.active) return;
    const F = s => `800 ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
    ctx.save();
    // A la izquierda, bajo las barras del grupo (a la derecha está el minimapa y su lista).
    ctx.textAlign = 'left'; ctx.font = F(13);
    // (Móvil: debajo de donde acaba de verdad la lista del grupo, que va escalada, y fuera de la muesca.)
    const touch = G.Touch.active, sl = touch ? G.HUD.SL : 0;
    const top = touch ? G.HUD.leftBottom + 22 : 84 + G.Coop.puppets().length * 18;
    feed.forEach((f, i) => {
      const y = top + i * 24, tw = ctx.measureText(f.text).width;
      ctx.globalAlpha = Math.min(1, f.t);
      ctx.fillStyle = 'rgba(10,14,32,.78)'; ctx.fillRect(12 + sl, y - 15, tw + 16, 21);
      ctx.fillStyle = f.mine ? '#ffd23f' : '#ffffff'; ctx.fillText(f.text, 20 + sl, y);
    });
    ctx.globalAlpha = 1;
    const pl = G.Game.player, t = G.Game.st.time;
    if (pl && !pl.dead) {
      let msg = null, col = '#ffd23f';
      const out = zoneLive(t) && Math.hypot(pl.x, pl.y) > zoneR(t);
      if (out) {
        // Fuera: borde de la pantalla en rojo, latiendo, y cuánto falta para volver.
        const beat = 0.5 + Math.sin(performance.now() / 160) * 0.5;
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
        g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,40,60,${0.25 + beat * 0.25})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const m = Math.max(1, Math.ceil((Math.hypot(pl.x, pl.y) - zoneR(t)) / 32));
        msg = G.I18n.f('¡Fuera de la zona! Pierdes un 8 % de vida por segundo: vuelve {x} m hacia la flecha', m); col = '#ff5f6d';
      }
      else if (G.PvPX.inBreak) msg = null;
      else if (t > ZONE_FROM - 30 && t < ZONE_FROM) msg = G.I18n.f('La zona se cierra en {x} s: la línea blanca es hasta dónde', Math.ceil(ZONE_FROM - t));
      else if (t >= ZONE_FROM && t < ZONE_TO) msg = G.T('La zona se está cerrando: quédate dentro de la línea roja');
      if (msg) {
        ctx.textAlign = 'center'; ctx.font = F(15);
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(msg, w / 2, 96);
        ctx.fillStyle = col; ctx.fillText(msg, w / 2, 96);
      }
    }
    ctx.restore();
    G.PvPX.drawHud(ctx, w, h);
  }

  return { foesIn, foeNear, meFor, deal, touchesMe, TEAM_NAMES, TEAM_COLORS, teamWinner, get teams() { return on && teams && G.Coop.active; },
           begin, tick, foe, wonByMe, circle, arc, seg, projectile, orb, setWinner, afterRun, K, GRACE,
           onNet, timeScale, manualAim, arenaTick, arenaStart, pickTick, pickKey, drawWorld, drawHud, zoneR,
           /** Zona segura para el minimapa y la flecha (hud.js); null si no hay PK. */
           zoneInfo() { return on && G.Coop.active ? { R: zoneR(), R1: finalR(), from: ZONE_FROM, to: G.PvPX.zoneCap(G.Game.st.time) != null ? Infinity : ZONE_TO, t: G.Game.st.time } : null; },
           reroll, roundReset, mouseWorld, get grace() { return GRACE; },
           get aiming() { return aiming(); }, get arena() { return on && arena && G.Coop.active; },
           _roll: rollOffers,   // pruebas
           get _dbg() { return { hitMark, feed, chosen, offers, picked, hitDirs }; },   // pruebas
           get on() { return on && G.Coop.active; } };
})();
