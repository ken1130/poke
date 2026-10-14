/* ============ evo.js — tu Pokémon evoluciona durante la partida ============
 * Al subir de nivel en la run (datos: data/evolutions.js):
 *   primera fase (sin preevolución) -> Nv. 10 · segunda fase -> Nv. 20 · tercera -> Nv. 30
 * Al evolucionar sube de vida, velocidad y ataque (los stats de la evolución) y
 * cambia el sprite; los movimientos se quedan. Si hay varias (Eevee...), una al azar.
 * Se puede apagar en Ajustes (Piedra eterna). En grupo, los demás lo ven (coop.js manda el dex).
 */
G.Evo = (() => {
  const LEVELS = [10, 20, 30];
  let parent = null;        // dex -> de quién evoluciona

  function depth(dex) {
    if (!parent) { parent = {}; for (const f in G.EVOS) for (const t of G.EVOS[f]) parent[t] = +f; }
    let d = 0;
    while (parent[dex] && d < 4) { dex = parent[dex]; d++; }
    return d;
  }
  /** Nivel al que evoluciona este Pokémon (o null si no evoluciona). */
  function levelFor(dex) {
    const to = G.EVOS[dex];
    if (!to || !to.some(d => G.DEX_BY[d] && G.SPRITE_META[d])) return null;
    return LEVELS[Math.min(2, depth(dex))];
  }
  const enabled = () => G.Settings.get('evolve') !== false;

  /** Cada fotograma: ¿toca evolucionar? (también en el invitado: su nivel lo manda el anfitrión) */
  function check(pl) {
    if (!pl || pl.dead || !enabled() || pl.noEvo) return;
    const lv = levelFor(pl.dex);
    if (lv == null || pl.level < lv) return;
    const opts = G.EVOS[pl.dex].filter(d => G.DEX_BY[d] && G.SPRITE_META[d]);
    const to = G.U.pick(opts);
    const from = pl.mon.name;
    pl.evolveTo(to);
    G.Sprites.preload([to], 8000, pl.shiny);
    G.Spawner.say(G.I18n.f('¡{x} ha evolucionado a {x}!', G.T(from), G.T(pl.mon.name)), 3.2, true);
    G.Audio.sfx('legend');
    G.Game.flash('#ffffff', 0.6);
    G.FX.ring(pl.x, pl.y, 8, 120, '#ffffff', 0.8, 6);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#fff6c0', 36, 220);
    G.Progress.event('pokeEvolve', { dex: to });
    const st = G.DB.save && G.DB.save.stats;
    if (st) st.pokeEvolves = (st.pokeEvolves || 0) + 1;
  }

  return { check, levelFor, LEVELS };
})();
