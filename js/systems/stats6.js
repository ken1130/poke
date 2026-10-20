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
  const rawDef = (d, avg) => G.U.clamp(Math.pow(Math.max(1, d) / Math.max(1, avg), -DEF_EXP), DEF_MIN, DEF_MAX);
  // Media de todos (una vez): se divide por ella para que, en conjunto, el daño quede ×1,00 (sin esto
  // salía ×1,01-1,02: un poco más difícil).
  let MEAN = null;
  function means() {
    if (MEAN) return MEAN;
    let sp = 0, ss = 0, n = 0;
    for (const m of G.DEX || []) {
      const s = of(m.dex); if (!s) continue;
      const avg = (s.atk + s.def + s.spa + s.spdef) / 4;
      sp += rawDef(s.def, avg); ss += rawDef(s.spdef, avg); n++;
    }
    MEAN = n ? { p: sp / n, s: ss / n } : { p: 1, s: 1 };
    return MEAN;
  }
  const defMul = (d, avg, c) => rawDef(d, avg) / (c === 's' ? means().s : means().p);
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
    pl.k6 = { p: ga / top, s: gs / top, dp: defMul(s.def, avg, 'p'), ds: defMul(s.spdef, avg, 's'), best: s.atk >= s.spa ? 'p' : 's' };
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
  /**
   * ×daño que recibe un ENEMIGO `e` del movimiento `m` (2026-10-20, el dueño: «¿y la defensa de los
   * enemigos?»): físico → su Defensa, especial → su Defensa Esp., frente a sus propios stats (igual que el
   * jugador; en conjunto no cambia la dificultad). Se calcula una vez por enemigo. Muñecos: no (la sala
   * de entrenamiento mide el movimiento tal cual).
   */
  function foeK(e, m) {
    if (!e || e.dummy) return 1;
    const c = cat(m);
    if (!c) return 1;
    let k = e._k6;
    if (k === undefined) {
      const s = of(e.dex);
      if (!s) k = null;
      else { const avg = (s.atk + s.def + s.spa + s.spdef) / 4; k = { dp: defMul(s.def, avg, 'p'), ds: defMul(s.spdef, avg, 's') }; }
      e._k6 = k;
    }
    return !k ? 1 : c === 'p' ? k.dp : k.ds;
  }
  /** Lo que domina un Pokémon: 'p' | 's' | null. */
  function bestOf(dex) { const s = of(dex); return s ? (s.atk >= s.spa ? 'p' : 's') : null; }
  /**
   * Etiqueta de un movimiento para las listas donde se elige (cartas, vínculos, sala de entrenamiento,
   * vetos): «Físico» naranja / «Especial» azul; si es lo que domina `best`, «★ Físico · domina».
   */
  function chip(m, best) {
    const c = cat(m);
    if (!c) return '';
    const name = G.T(c === 'p' ? 'Físico (clase de ataque)' : 'Especial (clase de ataque)');
    return `<span class="tag-chip cat-${c}${best === c ? ' cat-best' : ''}">${best === c ? '★ ' + name + '・' + G.T('domina (clase de ataque)') : name}</span>`;
  }
  return { of, setup, cat, atkK, hurtK, foeK, gAtk, defMul, bestOf, chip };
})();
