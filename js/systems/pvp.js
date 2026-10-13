/* ============ pvp.js — PK en una sala (último en pie gana) ============
 * Va sobre el cooperativo (coop.js): cada uno decide lo que le golpea, así que
 * aquí los ataques "fantasma" de los demás (combat.js) también te hacen daño.
 *   - 15 s de preparación sin daño entre jugadores; salís separados.
 *   - El daño de los movimientos está pensado para Pokémon salvajes con mucha
 *     vida: a un jugador le llega el 30 %.
 *   - Sin revivir. El anfitrión acaba la partida cuando queda uno (game.js).
 *   - Siguen saliendo Pokémon salvajes (a la mitad) para subir de nivel.
 */
G.PvP = (() => {
  const GRACE = 15, K = 0.3;
  let on = false, saidGo = false, winner;

  function begin(cfg) {
    on = !!(cfg && cfg.pvp); saidGo = false; winner = undefined;
    if (on) G.Spawner.say('¡PK! Gana el último en pie. Tenéis 15 s para prepararos…', 4, true);
  }

  const armed = () => on && G.Game.st.time >= GRACE;
  /** Tu Pokémon, si se le puede golpear ahora. */
  function target(owner) {
    const pl = G.Coop.local;
    return armed() && pl && !pl.dead && !pl.god && owner && owner !== pl ? pl : null;
  }
  function hurt(pl, dmg, type) { pl.hurt(dmg * K, type); return true; }

  function tick() {
    if (on && !saidGo && armed()) { saidGo = true; G.Spawner.say('¡A luchar!', 2.4, true); G.Audio.sfx('boss'); }
  }

  /** Círculo (aura, explosión, charco, golpe de un proyectil). */
  function circle(owner, x, y, r, dmg, type) {
    const pl = target(owner);
    return pl && G.U.dist2(x, y, pl.x, pl.y) <= (r + pl.r) ** 2 ? hurt(pl, dmg, type) : false;
  }
  /** Abanico (cuerpo a cuerpo). */
  function arc(owner, x, y, r, aim, half, dmg, type) {
    const pl = target(owner);
    if (!pl || G.U.dist2(x, y, pl.x, pl.y) > (r + pl.r) ** 2) return false;
    const a = Math.atan2(pl.y - y, pl.x - x);
    return Math.abs(((a - aim + Math.PI * 3) % 6.2832) - Math.PI) <= half ? hurt(pl, dmg, type) : false;
  }
  /** Tramo con anchura (rayo, embestida). */
  function seg(owner, sx, sy, ex, ey, w, dmg, type) {
    const pl = target(owner);
    if (!pl) return false;
    const dx = ex - sx, dy = ey - sy, l2 = dx * dx + dy * dy || 1;
    const t = G.U.clamp(((pl.x - sx) * dx + (pl.y - sy) * dy) / l2, 0, 1);
    return G.U.dist2(sx + dx * t, sy + dy * t, pl.x, pl.y) <= (w / 2 + pl.r) ** 2 ? hurt(pl, dmg, type) : false;
  }
  /** Proyectil fantasma de otro jugador. Devuelve true si te ha dado (se gasta). */
  function projectile(p) { return circle(p.owner, p.x, p.y, p.r, p.dmg, p.mtype); }
  /** Órbita de otro jugador: te golpea como mucho cada `rehit` s. */
  function orb(p, now) {
    const pl = target(p.owner);
    if (!pl) return;
    const last = p.hitLog.get('pvp') || -99;
    if (now - last < p.rehit) return;
    if (G.U.dist2(p.x, p.y, pl.x, pl.y) <= (p.r + pl.r) ** 2) { p.hitLog.set('pvp', now); hurt(pl, p.dmg, p.mtype); }
  }

  /** El rival vivo más cercano a `pl` dentro de `range` (para apuntar y atacar), ya pasada la preparación. */
  function foe(pl, range) {
    if (!armed() || !G.Coop.active) return null;
    let best = null, bd = range * range;
    for (const p of G.Coop.puppets()) {
      if (p.dead) continue;
      const d = G.U.dist2(pl.x, pl.y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** ¿Has ganado tú el PK que acaba de terminar? */
  function wonByMe() { return winner != null && !!G.Social.me && winner === G.Social.me.name; }

  /** Lo pone el anfitrión al acabar (o llega en el 'ov'): nombre del ganador, o null si nadie. */
  function setWinner(name) { winner = name; }

  /** Tras el resumen de la run: quién ha ganado. */
  function afterRun() {
    if (!on && winner === undefined) return;
    const box = document.getElementById('over-stats');
    if (box && winner !== undefined) {
      const me = G.Social.me && G.Social.me.name;
      const txt = winner == null ? G.T('¡Empate!') : winner === me ? G.T('¡Has ganado el PK!') : G.I18n.f('¡{x} ha ganado el PK!', winner);
      // El título de siempre ("Has caído…") no vale en PK: victoria, derrota o empate.
      const title = document.getElementById('over-title');
      if (title) title.textContent = G.T(winner == null ? '¡Empate!' : winner === me ? '¡Victoria!' : 'Derrota…');
      box.insertAdjacentHTML('afterbegin', `<div style="grid-column:1/-1;text-align:center" class="panel"><b class="gold" style="font-size:22px">🏆 ${txt}</b></div>`);
    }
    on = false; winner = undefined;
  }

  return { begin, tick, foe, wonByMe, circle, arc, seg, projectile, orb, setWinner, afterRun, K, GRACE,
           get on() { return on && G.Coop.active; } };
})();
