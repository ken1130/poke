/* ============ items.js — objetos equipables (uno por run) ============
 * Se encuentran en los cofres (a veces en los normales, a menudo en los de
 * candado) y los sueltan los jefes. Sólo puedes llevar UNO; si encuentras
 * otro, eliges con cuál quedarte. Duran lo que dura la run.
 *
 *   on(pl)   se lo pones (lo que hace mientras lo llevas)
 *   off(pl)  se lo quitas (deshace lo de on)
 * Los que reaccionan a algo (golpe mortal, daño hecho...) los mira el
 * jugador con pl.hasItem(id).
 */
G.Items = (() => {
  const LIST = [
    { id: 'leftovers', name: 'Restos', desc: 'Recuperas un 1,5% de tu vida por segundo.',
      on: p => { p.regenFlat += p.maxHp * 0.015; p._itemRegen = p.maxHp * 0.015; },
      off: p => { p.regenFlat -= p._itemRegen || 0; } },
    { id: 'choiceband', name: 'Cinta Elección', desc: '+40% de daño, pero no puedes cambiar de movimiento.',
      on: p => { p.atkMul *= 1.4; }, off: p => { p.atkMul /= 1.4; } },
    { id: 'quickclaw', name: 'Garra Rápida', desc: '-20% de recarga en todos tus movimientos.',
      on: p => { p.cdMul *= 0.8; }, off: p => { p.cdMul /= 0.8; } },
    { id: 'focussash', name: 'Banda Focus', desc: 'Un golpe que te dejaría KO te deja con 1 de vida (cada 60 s).',
      on: () => {}, off: () => {} },
    { id: 'shellbell', name: 'Cascabel Concha', desc: 'Recuperas vida con el daño que haces.',
      on: () => {}, off: () => {} },
    { id: 'amuletcoin', name: 'Moneda Amuleto', desc: '+50% de Pokémonedas al acabar la run.',
      on: p => { p.coinMul *= 1.5; }, off: p => { p.coinMul /= 1.5; } },
    { id: 'luckyegg', name: 'Huevo Suerte', desc: '+30% de experiencia.',
      on: p => { p.xpMul *= 1.3; }, off: p => { p.xpMul /= 1.3; } },
    { id: 'lifeorb', name: 'Vidasfera', desc: '+30% de daño, pero cada ataque te quita un poco de vida.',
      on: p => { p.atkMul *= 1.3; }, off: p => { p.atkMul /= 1.3; } },
    { id: 'choicescarf', name: 'Pañuelo Elección', desc: '+35% de velocidad.',
      on: p => { p.spdMul *= 1.35; }, off: p => { p.spdMul /= 1.35; } },
    { id: 'rockyhelmet', name: 'Casco Dentado', desc: 'Los que te golpean cuerpo a cuerpo reciben daño.',
      on: () => {}, off: () => {} },
    { id: 'assaultvest', name: 'Chaleco Asalto', desc: '+20% de reducción de daño recibido.',
      on: p => { p.dmgReduce += 0.2; }, off: p => { p.dmgReduce -= 0.2; } },
    // ---- 2026-10-15 ----
    { id: 'expertbelt', name: 'Cinta Experto', desc: '+30% de daño con los golpes muy eficaces.',
      on: () => {}, off: () => {} },
    { id: 'scopelens', name: 'Periscopio', desc: '+15% de probabilidad de golpe crítico.',
      on: p => { p.critChance += 0.15; }, off: p => { p.critChance -= 0.15; } },
    { id: 'brightpowder', name: 'Polvo Brillo', desc: '20% de probabilidad de esquivar un golpe por completo.',
      on: () => {}, off: () => {} },
    { id: 'kingsrock', name: 'Roca del Rey', desc: 'Tus ataques tienen un 10% de probabilidad de hacer retroceder (inmovilizar un momento) a los enemigos normales.',
      on: () => {}, off: () => {} },
    { id: 'eviolite', name: 'Mineral Evolutivo', desc: 'Si tu Pokémon aún puede evolucionar, recibe un 35% menos de daño.',
      on: () => {}, off: () => {} },
    { id: 'airballoon', name: 'Globo Helio', desc: '+25% de velocidad. Si te golpean, explota y vuelve a los 30 s.',
      on: p => { p.balloon = true; p.balloonT = 0; p.spdMul *= 1.25; },
      off: p => { if (p.balloon) p.spdMul /= 1.25; p.balloon = false; p.balloonT = 0; } }
  ];
  /*
   * ---- Artefactos (2026-10-16) ----
   * Sólo salen de los cofres con candado (10 %, world.js). Ocupan un hueco de objeto y
   * sólo otro artefacto los puede sustituir (game.js offerItem). Lo que hacen al golpear,
   * al moverse, etc. está en systems/artifacts.js (G.Arts); aquí sólo lo fijo.
   * Números ajustados a la escala del juego (ver docs/dev/MOD-NOTES.md, "Artefactos").
   */
  const ART = { quicksilver: { spd: 1.5, stepDmg: 14, stepEvery: 0.5, stepLife: 1, cap: 10 },
                arsenal: { atk: 1.3, crit: 0.15, critMul: 1.5, cap: 15 },
                elderwand: { per: 0.05, max: 0.6 },
                liver: { red: 0.35, cap: 10 },
                dice: { win: 0.9, mul: 2 },
                climber: { stacks: 6 },
                tank64: { hp: 500 } };   // (主人 2026-10-16：200 → 500)
  const ARTS = [
    { id: 'quicksilver', art: true, name: 'Los Pies de Mercurio', short: 'Pies de Mercurio',
      desc: '+50% de velocidad. Dejas huellas que duran 1 s: los enemigos que las pisan reciben daño (14 × tu ataque, cada 0,5 s). Con Agilidad, la velocidad se acumula hasta Nv. 10. El agua no te frena.',
      on: p => { p.spdMul *= ART.quicksilver.spd; }, off: p => { p.spdMul /= ART.quicksilver.spd; } },
    { id: 'arsenal', art: true, name: 'El Arsenal del Vecino', short: 'Arsenal del Vecino',
      desc: '+30% de ataque. Con Danza Espada, el ataque se acumula hasta Nv. 15. Si no tienes crítico, +15% de probabilidad de crítico. Los críticos hacen +150% de daño.',
      on: p => {
        p.atkMul *= ART.arsenal.atk;
        p._arsCrit = (p.critChance || 0) > 0 ? 0 : ART.arsenal.crit;
        p.critChance = (p.critChance || 0) + p._arsCrit;
        p.critMul = (p.critMul || 1.5) + ART.arsenal.critMul;
      },
      off: p => {
        p.atkMul /= ART.arsenal.atk;
        p.critChance -= p._arsCrit || 0; p._arsCrit = 0;
        p.critMul -= ART.arsenal.critMul; if (p.critMul <= 1.5) p.critMul = 0;
      } },
    { id: 'elderwand', art: true, name: 'La Varita de Saúco Partida', short: 'Varita de Saúco',
      desc: 'Cada ataque baja un 5% más la recarga (se acumula, hasta -60%). Si te mueves, vuelve a 0.',
      on: p => { p.wandN = 0; }, off: p => { p.wandN = 0; } },
    { id: 'liver', art: true, name: 'El Hígado del Ingeniero de Guardia', short: 'Hígado del Ingeniero',
      desc: '+35% de reducción de daño. Con Fortaleza, la defensa se acumula hasta Nv. 10. Inmune a todos los proyectiles (no a cuerpo a cuerpo ni rayos).',
      on: p => { p.dmgReduce += ART.liver.red; }, off: p => { p.dmgReduce -= ART.liver.red; } },
    { id: 'dice', art: true, name: 'Los Dados del Doble o Nada', short: 'Dados Doble o Nada',
      desc: 'Cada golpe: 90% de hacer el doble de daño y 10% de no hacer nada.',
      on: () => {}, off: () => {} },
    { id: 'climber', art: true, name: 'El Equipo de Escalada de Shixin', short: 'Equipo de Shixin',
      desc: 'Tus golpes queman: unos 20 de daño por segundo (sube con tu nivel, como las quemaduras).',
      on: () => {}, off: () => {} },
    { id: 'tank64', art: true, name: 'El Tanque 64', short: 'Tanque 64',
      desc: '+500 de vida máxima.',
      on: p => { p.addMaxHp(ART.tank64.hp); }, off: p => { p.maxHp -= ART.tank64.hp; p.hp = Math.min(p.hp, p.maxHp); } }
  ];
  const BY = {};
  for (const it of LIST) BY[it.id] = it;
  for (const it of ARTS) BY[it.id] = it;

  /** Uno al azar, distinto del que ya llevas (nunca un artefacto). */
  function roll(except) {
    const pool = LIST.filter(i => i.id !== except);
    return G.U.pick(pool).id;
  }
  /** Un artefacto al azar. */
  function rollArt() { return G.U.pick(ARTS).id; }
  const isArt = id => !!(BY[id] && BY[id].art);
  /** Probabilidad de artefacto en cada cofre con candado. */
  const ART_CHANCE = 0.1;

  return { LIST, ARTS, ART, BY, roll, rollArt, isArt, ART_CHANCE };
})();
