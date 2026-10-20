/* ============ stats6.js — Ataque / Ataque Esp. / Defensa / Defensa Esp. (2026-10-20) ============
 * El dueño: «hacedlo como el autor original: los seis stats y movimientos físicos / especiales».
 * Datos: data/stats6.js (PokeAPI) y data/stats6-custom.js (originales y movimientos inventados).
 *
 * Ataque: el «atk» de siempre (con todas sus mejoras, objetos y pociones) es el del lado fuerte, igual
 * que antes (tools/fetch_pokedex.py lo sacaba del mayor de Ataque y Ataque Esp.). Al pegar se multiplica
 * por lo que vale el lado del movimiento frente al fuerte: el lado fuerte ×1 (como siempre) y el otro
 * menos. Así ningún Pokémon sube, y todo lo que da «+ataque» vale para los dos lados.
 * Defensa: el golpe que te da un enemigo al tocarte (físico) se multiplica por dp; sus disparos y rayos
 * (especiales), por ds. Se mira la defensa FRENTE A SUS PROPIOS stats (la media de los cuatro): así un
 * Pokémon sin evolucionar, con todo bajo, no recibe más daño que antes; sólo cuenta hacia qué lado tira
 * (Steelix, mucha Defensa: menos daño de contacto). Entre DEF_MIN y DEF_MAX.
 */
G.Stats6 = (() => {
  const gAtk = v => 0.70 + v / 100 * 0.55;           // como tools/fetch_pokedex.py
  const DEF_EXP = 0.35, DEF_MIN = 0.75, DEF_MAX = 1.2;
  const defMul = (d, avg) => G.U.clamp(Math.pow(Math.max(1, d) / Math.max(1, avg), -DEF_EXP), DEF_MIN, DEF_MAX);
  // Sin dato de PokeAPI ni a mano: por cómo es el ataque.
  const BY_KIND = { melee: 'p', dash: 'p', fist: 'p', pounce: 'p', pan: 'p', whip: 'p', roll: 'p', spear: 'p', treefall: 'p',
                    projectile: 's', beam: 's', nova: 's', meteor: 's', orbit: 's', lightning: 's', psyarrow: 's', hearts: 's' };

  /** [Ataque, Defensa, Ataque Esp., Defensa Esp.] de un Pokémon (o null). Formas y Megas: las suyas o las del base. */
  function of(dex) {
    const S = G.STATS6 || {}, m = G.DEX_BY && G.DEX_BY[dex];
    const s = S[dex] || (m && m.base && S[m.base]);
    return s ? { atk: s[0], def: s[1], spa: s[2], spdef: s[3] } : null;
  }
  /** Lo que se usa en combate (al crear el Pokémon y al evolucionar). */
  function setup(pl) {
    const s = pl && of(pl.dex);
    if (!s) { if (pl) pl.k6 = null; return; }
    const ga = gAtk(s.atk), gs = gAtk(s.spa), top = Math.max(ga, gs);
    const avg = (s.atk + s.def + s.spa + s.spdef) / 4;
    pl.k6 = { p: ga / top, s: gs / top, dp: defMul(s.def, avg), ds: defMul(s.spdef, avg), best: s.atk >= s.spa ? 'p' : 's' };
  }
  /** Clase de un movimiento: 'p' físico, 's' especial o null (de apoyo). */
  function cat(m) {
    if (!m) return null;
    const C = G.MOVE_CAT || {};
    return C[m.id] || (m.def && C[m.def.id]) || BY_KIND[m.kind] || null;
  }
  /** ×daño de un golpe de `pl` con `m`. */
  function atkK(pl, m) {
    const k = pl && pl.k6, c = k && cat(m);
    return c === 'p' ? k.p : c === 's' ? k.s : 1;
  }
  /** ×daño que recibe `pl` de un golpe 'p' (contacto) o 's' (disparo, rayo). */
  function hurtK(pl, c) {
    const k = pl && pl.k6;
    return !k ? 1 : c === 'p' ? k.dp : c === 's' ? k.ds : 1;
  }
  return { of, setup, cat, atkK, hurtK, gAtk, defMul };
})();
