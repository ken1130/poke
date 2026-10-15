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
    if (on) G.Spawner.say(arena ? '¡PK en la arena! Elige tus movimientos: tenéis 15 s…' : '¡PK! Gana el último en pie. Tenéis 15 s para prepararos…', 4, true);
  }

  const armed = () => on && G.Game.st.time >= GRACE;
  /** Tu Pokémon, si se le puede golpear ahora. (Ya no se usa para el daño: lo decide quien ataca, ver deal.) */
  function mine(owner) {
    const pl = G.Coop.local;
    if (teams && owner && owner.team === (pl && pl.team)) return null;       // compañero de equipo
    return armed() && pl && !pl.dead && !pl.god && owner && owner !== pl ? pl : null;
  }
  /** Te dan: daño, empujón y aviso al que te ha dado (para su marca de impacto). */
  function hurt(pl, dmg, type, owner, crit) {
    const before = pl.hp;
    // Entre jugadores no vale la invulnerabilidad larga tras un golpe (0,45 s): si no, la mitad
    // de los golpes "acertados" no hacían nada. Un respiro corto (0,1 s) sí.
    pl.invuln = 0;
    const shake = G.Camera.shake;
    pl.hurt(dmg * (arena ? K_ARENA : K), type);
    G.Camera.shake = shake;               // (Player.hurt sacude la cámara: en PK, no)
    pl.invuln = Math.min(pl.invuln, 0.1);
    const d = before - pl.hp;
    if (d <= 0) return true;
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
  function deal(attacker, foe, dmg, type, crit) {
    if (attacker !== G.Coop.local || !foe || foe.dead || !armed()) return;
    const now = performance.now();
    if (now - (lastHit.get(foe.uid) || 0) < 70) return;
    lastHit.set(foe.uid, now);
    const k = (arena ? K_ARENA : K) * G.Types.mult(type, foe.mon.types);
    const shown = Math.max(1, Math.round(dmg * k));
    // Lo que ves tú al acertar: parón, marca de impacto, número grande, destello y golpe.
    hitMark = 0.25;
    foe.flash = 0.14;
    G.FX.dmgText(foe.x + G.U.rand(-8, 8), foe.y - foe.bodyH - 6, crit ? shown + '!' : String(shown), crit ? '#ff5f6d' : '#ffe14d', true);
    G.FX.sp('impact', type || 'normal', foe.x, foe.y - foe.bodyH * 0.5, { life: 0.16, scale: crit ? 2.4 : 1.7 });
    G.FX.burst(foe.x, foe.y - foe.bodyH * 0.5, '#ffffff', crit ? 14 : 8, 160);
    G.Audio.sfx(crit ? 'break' : 'hit');
    send(['pv', 'd', foe.uid, G.Net.uid, +(dmg).toFixed(1), type || null, crit ? 1 : 0, Math.round(foe.x), Math.round(foe.y)]);
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
      if (p.dead || (teams && p.team === pl.team)) continue;
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
      const me = G.Social.me && G.Social.me.name;
      const mine = teams ? wonByMe() : winner === me;
      const txt = winner == null ? G.T('¡Empate!') : mine ? G.T(teams ? '¡Tu equipo ha ganado!' : '¡Has ganado el PK!') : G.I18n.f('¡{x} ha ganado el PK!', teams ? G.T(TEAM_NAMES[+String(winner).slice(1)] || '') : winner);
      // El título de siempre ("Has caído…") no vale en PK: victoria, derrota o empate.
      const title = document.getElementById('over-title');
      if (title) title.textContent = G.T(winner == null ? '¡Empate!' : mine ? '¡Victoria!' : 'Derrota…');
      box.insertAdjacentHTML('afterbegin', `<div style="grid-column:1/-1;text-align:center" class="panel"><b class="gold" style="font-size:22px">🏆 ${txt}</b></div>`);
    }
    on = false; winner = undefined; teams = false; myTeam = null; arena = false;
  }

  // ================= golpes que se notan =================
  let feed = [], hitMark = 0, stopT = 0, slowT = 0;
  const nameOf = uid => {
    if (!uid) return '?';
    if (uid === G.Net.uid) return (G.Social.me && G.Social.me.name) || G.T('Tú');
    const m = G.Coop.mate(uid);
    return m ? m.name : '?';
  };
  /** Todos: alguien ha recibido un golpe de otro jugador. ['pv','h', víctima, atacante, daño, ko] */
  function onNet(ev) {
    const me = G.Net.uid;
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
        return;
      }
      hurt(pl, ev[4], ev[5], owner, !!ev[6]);
      return;
    }
    // ['pv','s', víctima, segundos]: te frenan.
    if (ev[1] === 's') { if (ev[2] === me && G.Game.player) G.Game.player.slowT = Math.max(G.Game.player.slowT || 0, ev[3]); return; }
    if (ev[1] !== 'h') return;
    const [, , vic, atk, d, ko] = ev;
    if (ko) {
      feed.unshift({ text: G.I18n.f('{x} ha tumbado a {x}', nameOf(atk), nameOf(vic)), t: 5, mine: atk === me || vic === me });
      feed = feed.slice(0, 4);
      if (atk === me) { G.FX.dmgText(G.Game.player.x, G.Game.player.y - 70, G.T('¡K.O.!'), '#ffd23f', true); G.Audio.sfx('bossDown'); }
      else G.Audio.sfx('faint');
    }
  }
  /** game.js: el reloj del juego va más despacio un instante (parón al golpear, cámara lenta al tumbar). */
  function timeScale() { return 1; }      // (sin parones ni cámara lenta: quitaban el control)

  // ================= apuntar =================
  const aiming = () => on && G.Coop.active && G.Game.state === 'playing';
  /** player.js: hacia dónde apunta tu Pokémon (radianes) o null si no se apunta a mano. */
  function manualAim(pl) {
    if (!aiming() || pl.remote || pl.dead) return null;
    if (G.Touch.active) { const v = G.Touch.aimVector(); return v ? Math.atan2(v[1], v[0]) : (pl.manualAim != null ? pl.manualAim : null); }
    const w = mouseWorld();
    return w ? Math.atan2(w[1] - pl.y, w[0] - pl.x) : null;
  }
  function mouseWorld() {
    const m = G.Input.mouse();
    if (!m || (!m.x && !m.y)) return null;
    return [G.Camera.left() + m.x / G.Camera.scale, G.Camera.top() + m.y / G.Camera.scale];
  }

  // ================= arena =================
  const ZONE_FROM = 90, ZONE_TO = 150, ZONE_R0 = 820, ZONE_R1 = 240;
  let berryT = 0, zoneT = 0, picked = false;
  function zoneR(t = G.Game.st.time) {
    if (t <= ZONE_FROM) return ZONE_R0;
    return ZONE_R0 + (ZONE_R1 - ZONE_R0) * Math.min(1, (t - ZONE_FROM) / (ZONE_TO - ZONE_FROM));
  }
  /** Cada fotograma (todos): zona segura y bayas (anfitrión). */
  function arenaTick(dt, pl) {
    if (!arena || !on) return;
    const t = G.Game.st.time;
    for (const f of feed) f.t -= dt;
    feed = feed.filter(f => f.t > 0);
    if (hitMark > 0) hitMark -= dt;
    // Fuera de la zona: se pierde vida.
    if (pl && !pl.dead && t > ZONE_FROM && Math.hypot(pl.x, pl.y) > zoneR(t)) {
      zoneT -= dt;
      if (zoneT <= 0) { zoneT = 0.5; pl.invuln = 0; const sh = G.Camera.shake; pl.hurt(pl.maxHp * 0.04); G.Camera.shake = sh; }
    }
    if (G.Coop.isHost && t >= berryT) {
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
    offers = rollOffers(pl); chosen = []; rerolls = 1; pickTimer = GRACE - 1.5; picked = false;
    renderPick();
    G.UI.show('scr-pkpick');
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
    document.getElementById('pk-sub').textContent = G.I18n.f('Elige {x} de {x} · quedan {x} s', PICK_N, OFFER_N, Math.max(0, Math.ceil(pickTimer)));
    const ok = document.getElementById('pk-ok');
    ok.disabled = chosen.length !== PICK_N;
    ok.textContent = G.I18n.f('¡A luchar! ({x}/{x})', chosen.length, PICK_N);
    ok.onclick = confirmPick;
    const rr = document.getElementById('pk-reroll');
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
  }
  /** Cada fotograma: cuenta atrás de la elección. */
  function pickTick(dt) {
    if (!arena || picked || !G.UI.isOpen('scr-pkpick')) return;
    const before = Math.ceil(pickTimer);
    pickTimer -= dt;
    if (pickTimer <= 0) confirmPick();
    else if (Math.ceil(pickTimer) !== before) document.getElementById('pk-sub').textContent = G.I18n.f('Elige {x} de {x} · quedan {x} s', PICK_N, OFFER_N, Math.max(0, Math.ceil(pickTimer)));   // sólo el texto: rehacer las cartas se comía clics
  }
  /** Teclas 1-5 mientras se elige (game.js). */
  function pickKey(n) { if (arena && !picked && G.UI.isOpen('scr-pkpick')) { if (n >= 1 && n <= OFFER_N) toggle(n - 1); return true; } return false; }

  // ================= dibujo =================
  /** Mundo: zona segura, línea de tiro y punto de mira. */
  function drawWorld(ctx) {
    if (!on || !G.Coop.active) return;
    const cam = G.Camera, pl = G.Game.player;
    if (arena && G.Game.st.time > ZONE_FROM - 10) {
      const R = zoneR();
      ctx.save();
      ctx.beginPath();
      ctx.rect(cam.left() - 80, cam.top() - 80, cam.w + 160, cam.h + 160);
      ctx.arc(0, 0, R, 0, 6.2832, true);
      ctx.fillStyle = 'rgba(150,20,50,0.28)';
      ctx.fill('evenodd');
      ctx.setLineDash([14, 10]);
      ctx.lineWidth = 4; ctx.strokeStyle = '#ff5f6d';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
    if (!pl || pl.dead || !aiming()) return;
    let tx, ty;
    if (G.Touch.active) {
      if (!G.Touch.aimVector() && pl.manualAim == null) return;
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
    const top = 84 + G.Coop.puppets().length * 18;
    feed.forEach((f, i) => {
      const y = top + i * 24, tw = ctx.measureText(f.text).width;
      ctx.globalAlpha = Math.min(1, f.t);
      ctx.fillStyle = 'rgba(10,14,32,.78)'; ctx.fillRect(12, y - 15, tw + 16, 21);
      ctx.fillStyle = f.mine ? '#ffd23f' : '#ffffff'; ctx.fillText(f.text, 20, y);
    });
    ctx.globalAlpha = 1;
    const pl = G.Game.player, t = G.Game.st.time;
    if (arena && pl && !pl.dead) {
      let msg = null, col = '#ffd23f';
      if (t > ZONE_FROM && Math.hypot(pl.x, pl.y) > zoneR(t)) { msg = G.T('¡Estás fuera de la zona! Vuelve al centro'); col = '#ff5f6d'; }
      else if (t > ZONE_FROM - 10 && t < ZONE_TO) msg = t < ZONE_FROM ? G.I18n.f('La zona se cierra en {x} s', Math.ceil(ZONE_FROM - t)) : G.T('La zona se está cerrando…');
      if (msg) {
        ctx.textAlign = 'center'; ctx.font = F(15);
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(msg, w / 2, 96);
        ctx.fillStyle = col; ctx.fillText(msg, w / 2, 96);
      }
    }
    ctx.restore();
  }

  return { foesIn, foeNear, meFor, deal, touchesMe, TEAM_NAMES, TEAM_COLORS, teamWinner, get teams() { return on && teams && G.Coop.active; },
           begin, tick, foe, wonByMe, circle, arc, seg, projectile, orb, setWinner, afterRun, K, GRACE,
           onNet, timeScale, manualAim, arenaTick, arenaStart, pickTick, pickKey, drawWorld, drawHud, zoneR,
           get aiming() { return aiming(); }, get arena() { return on && arena && G.Coop.active; },
           _roll: rollOffers,   // pruebas
           get _dbg() { return { hitMark, feed, chosen, offers, picked }; },   // pruebas
           get on() { return on && G.Coop.active; } };
})();
