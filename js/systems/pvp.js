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
  /** Tu Pokémon, si se le puede golpear ahora. */
  function target(owner) {
    const pl = G.Coop.local;
    if (teams && owner && owner.team === (pl && pl.team)) return null;       // compañero de equipo
    return armed() && pl && !pl.dead && !pl.god && owner && owner !== pl ? pl : null;
  }
  /** Te dan: daño, empujón y aviso al que te ha dado (para su marca de impacto). */
  function hurt(pl, dmg, type, owner) {
    const before = pl.hp;
    pl.hurt(dmg * (arena ? K_ARENA : K), type);
    const d = before - pl.hp;
    if (d <= 0) return true;
    stopT = Math.max(stopT, 0.05);
    if (owner) {
      const a = Math.atan2(pl.y - owner.y, pl.x - owner.x);
      const nx = pl.x + Math.cos(a) * 16, ny = pl.y + Math.sin(a) * 16;
      if (G.World.isFree(nx, ny, pl.r * 0.6)) { pl.x = nx; pl.y = ny; }
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
    if (ev[1] !== 'h') return;
    const [, , vic, atk, d, ko] = ev, me = G.Net.uid;
    if (atk && atk === me && vic !== me) {
      const v = G.Coop.mate(vic), p = v && v.pl;
      hitMark = 0.22; stopT = Math.max(stopT, 0.04);
      G.Audio.sfx('hit');
      if (p) {
        G.FX.dmgText(p.x, p.y - p.bodyH - 6, String(d), ko ? '#ff5f6d' : '#ffe14d', true);
        G.FX.burst(p.x, p.y - p.bodyH * 0.5, '#ffffff', 8, 140);
        p.flash = 0.12;
      }
      G.Camera.kick(0.18);
    }
    if (ko) {
      slowT = 0.7;
      feed.unshift({ text: G.I18n.f('{x} ha tumbado a {x}', nameOf(atk), nameOf(vic)), t: 5, mine: atk === me || vic === me });
      feed = feed.slice(0, 4);
      if (atk === me) { G.FX.dmgText(G.Game.player.x, G.Game.player.y - 70, G.T('¡K.O.!'), '#ffd23f', true); G.Audio.sfx('bossDown'); }
      else G.Audio.sfx('faint');
    }
  }
  /** game.js: el reloj del juego va más despacio un instante (parón al golpear, cámara lenta al tumbar). */
  function timeScale(real) {
    if (!on) return 1;
    if (stopT > 0) { stopT -= real; return 0.12; }
    if (slowT > 0) { slowT -= real; return 0.35; }
    return 1;
  }

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
      if (zoneT <= 0) { zoneT = 0.5; pl.invuln = 0; pl.hurt(pl.maxHp * 0.04); }
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
  function rollOffers(pl) {
    const own = G.Moves.poolFor(pl.mon).filter(id => attackDef(G.Moves.BY_ID[id]));
    const any = G.Moves.ALL.filter(attackDef).map(d => d.id);
    const out = G.U.pickN(own, OFFER_N);
    for (const id of G.U.pickN(any, 20)) if (out.length < OFFER_N && !out.includes(id)) out.push(id);
    return out;
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

  return { TEAM_NAMES, TEAM_COLORS, teamWinner, get teams() { return on && teams && G.Coop.active; },
           begin, tick, foe, wonByMe, circle, arc, seg, projectile, orb, setWinner, afterRun, K, GRACE,
           onNet, timeScale, manualAim, arenaTick, arenaStart, pickTick, pickKey, drawWorld, drawHud, zoneR,
           get aiming() { return aiming(); }, get arena() { return on && arena && G.Coop.active; },
           get _dbg() { return { hitMark, feed, chosen, offers, picked }; },   // pruebas
           get on() { return on && G.Coop.active; } };
})();
