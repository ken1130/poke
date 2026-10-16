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

  /*
   * Animación (2026-10-16, pedido del dueño): antes de cambiar, 2,6 s como en los juegos: tu
   * Pokémon se vuelve una silueta blanca que alterna entre su forma y la nueva, cada vez más
   * deprisa, con luz que se le acerca. Mientras, eres invulnerable (te puedes mover). Al acabar,
   * evoluciona de verdad (los compañeros lo ven cambiar entonces, como antes).
   */
  const DUR = 2.6;
  /** Cada fotograma: ¿toca evolucionar? (también en el invitado: su nivel lo manda el anfitrión) */
  function check(pl) {
    if (!pl || pl.dead || !enabled() || pl.noEvo) return;
    if (pl.evoAnim) { step(pl); return; }
    const lv = levelFor(pl.dex);
    if (lv == null || pl.level < lv) return;
    const opts = G.EVOS[pl.dex].filter(d => G.DEX_BY[d] && G.SPRITE_META[d]);
    const to = G.U.pick(opts), shiny = pl.shiny && G.Sprites.hasShiny(to);
    G.Sprites.preload([to], 8000, shiny);
    pl.evoAnim = { t0: performance.now(), to, toAnim: new G.Sprites.Animator(to, 1, shiny) };
    pl.invuln = Math.max(pl.invuln || 0, DUR + 0.4);
    G.Spawner.say(G.I18n.f('¿Eh? ¡{x} está evolucionando!', G.T(pl.mon.name)), DUR, true);
    G.Audio.sfx('surge');
  }
  /** 0..1 de la animación (o null). */
  function progress(pl) { return pl && pl.evoAnim ? Math.min(1, (performance.now() - pl.evoAnim.t0) / 1000 / DUR) : null; }
  function step(pl) {
    const k = progress(pl);
    // Luz que se le acerca (más cuanto más avanza).
    if (Math.random() < 0.4 + k) {
      const a = Math.random() * 6.2832, d = 60 + Math.random() * 40, cy = pl.y - pl.bodyH * 0.5;
      G.FX.px(pl.x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, Math.random() < 0.5 ? '#ffffff' : '#fff6c0',
              { vx: -Math.cos(a) * d * 2.2, vy: -Math.sin(a) * d * 1.5, life: 0.42 });
    }
    if (k < 1) return;
    const to = pl.evoAnim.to;
    pl.evoAnim = null;
    const from = pl.mon.name;
    pl.evolveTo(to);
    G.Spawner.say(G.I18n.f('¡{x} ha evolucionado a {x}!', G.T(from), G.T(pl.mon.name)), 3.2, true);
    G.Audio.sfx('legend');
    G.Game.flash('#ffffff', 0.6);
    G.FX.ring(pl.x, pl.y, 8, 120, '#ffffff', 0.8, 6);
    G.FX.ring(pl.x, pl.y, 4, 70, '#fff6c0', 0.5, 4);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#fff6c0', 36, 220);
    for (let i = 0; i < 6; i++) G.FX.twinkle(pl.x + G.U.rand(-26, 26), pl.y - G.U.rand(8, 46));
    G.Progress.event('pokeEvolve', { dex: to });
    const st = G.DB.save && G.DB.save.stats;
    if (st) st.pokeEvolves = (st.pokeEvolves || 0) + 1;
  }

  return { check, levelFor, progress, LEVELS };
})();
