/* ============ megaability.js — Habilidad Mega y movimiento despertado (2026-10-19) ============
 * Al megaevolucionar (evo.js megaEvolve), además de los ×MEGA_BOOST:
 *  · Habilidad Mega (por Pokémon base, ABIL_OF): un efecto para toda la run (ver ABIL).
 *    Varias son las de los juegos (Garra Dura, Adaptable, Sombra Trampa...); las Megas nuevas
 *    de Leyendas Z-A llevan una que pega con su estilo.
 *  · Movimiento inicial despertado (pl.startMoveId, game.js): m.mega → daño ×AWAKE_DMG y
 *    recarga ×AWAKE_CD; en la HUD, borde arcoíris y «Mega» delante del nombre.
 * Daño: Combat.hit multiplica por dmgK(pl, m). Lo que va por tiempo (Sombra Trampa, Chorro
 * Arena, Impulso), en update (game.js, sólo tu Pokémon).
 */
G.MegaAb = (() => {
  const AWAKE_DMG = 1.3, AWAKE_CD = 0.85;
  // Efectos: dmg (todo ×), types+k (esos tipos ×k), stab (los de tus tipos ×k), crit (+prob.),
  // cd (recarga ×), red (menos daño recibido), spd (velocidad ×), y los que van por tiempo.
  const ABIL = {
    toughclaws:  { name: 'Garra Dura',      desc: 'Todo tu daño +20%.', dmg: 1.2 },
    adapt:       { name: 'Adaptable',       desc: 'Los movimientos de tus tipos hacen +33%.', stab: 1.33 },
    hugepower:   { name: 'Potencia (habilidad Mega)',        desc: 'Ataque +30%.', atk: 1.3 },
    sheerforce:  { name: 'Potencia Bruta',  desc: 'Todo tu daño +25%.', dmg: 1.25 },
    parental:    { name: 'Amor Filial',     desc: 'Cada golpe tiene un 30% de pegar otra vez (a la mitad).', parental: 0.3 },
    trace:       { name: 'Calco',           desc: 'Probabilidad de crítico +15%.', crit: 0.15 },
    prankster:   { name: 'Bromista',        desc: 'Todos tus movimientos se recargan un 15% antes.', cd: 0.85 },
    guard:       { name: 'Espejo Mágico',   desc: 'Recibes un 20% menos de daño.', red: 0.2 },
    intimidate:  { name: 'Intimidación',    desc: 'Recibes un 15% menos de daño y los enemigos cercanos van más lentos.', red: 0.15, tag: 0.15 },
    shadowtag:   { name: 'Sombra Trampa',   desc: 'Los enemigos cercanos no pueden escapar: van un 35% más lentos.', tag: 0.35 },
    sandstream:  { name: 'Chorro Arena',    desc: 'Una tormenta de arena daña a los enemigos cercanos cada segundo.', sand: true },
    speedboost:  { name: 'Impulso',         desc: 'Cada 10 s, velocidad +5% (hasta +30%).', boost: true },
    drought:     { name: 'Sequía',          desc: 'Sol intenso: movimientos de Fuego +35%.', types: ['fire'], k: 1.35 },
    pixilate:    { name: 'Piel Feérica',    desc: 'Movimientos de Hada y Normal +30%.', types: ['fairy', 'normal'], k: 1.3 },
    refrigerate: { name: 'Piel Helada',     desc: 'Movimientos de Hielo y Normal +30%.', types: ['ice', 'normal'], k: 1.3 },
    fairyaura:   { name: 'Aura Feérica',    desc: 'Movimientos de Hada +35%.', types: ['fairy'], k: 1.35 },
    deltastream: { name: 'Ráfaga Delta',    desc: 'Movimientos de Dragón y Volador +30%.', types: ['dragon', 'flying'], k: 1.3 },
    baddreams:   { name: 'Mal Sueño',       desc: 'Los enemigos cercanos pierden vida cada segundo y van más lentos.', sand: true, tag: 0.15 },
    // Despertar de los personajes originales (2026-10-21, custom-awaken.js): dos propias.
    voltengine:  { name: 'Motor Eléctrico', desc: 'Movimientos Eléctricos +30% y todos se recargan un 10% antes.', types: ['electric'], k: 1.3, cd: 0.9 },
    courage:     { name: 'Valor Tardío',    desc: 'Cuanta menos vida te queda, más daño haces (hasta +40%).', courage: 0.4 }
  };
  // Pokémon base -> habilidad Mega (data/mega.js: las 39).
  const ABIL_OF = {
    670: 'fairyaura', 65: 'trace', 94: 'shadowtag', 308: 'hugepower', 310: 'intimidate', 282: 'pixilate',
    475: 'trace', 229: 'drought', 334: 'pixilate', 428: 'speedboost', 354: 'prankster', 323: 'sheerforce',
    530: 'toughclaws', 302: 'guard', 303: 'hugepower', 359: 'guard', 448: 'adapt', 80: 'guard',
    319: 'toughclaws', 604: 'adapt', 6: 'toughclaws', 691: 'adapt', 362: 'refrigerate', 560: 'intimidate',
    142: 'toughclaws', 208: 'sandstream', 248: 'sandstream', 227: 'toughclaws', 115: 'parental',
    780: 'sheerforce', 718: 'guard', 719: 'guard', 150: 'sheerforce', 978: 'adapt', 491: 'baddreams',
    380: 'guard', 381: 'sheerforce', 384: 'deltastream', 807: 'speedboost',
    // Personajes originales al despertar (custom-awaken.js): Panda (Pregunta Curiosa es Normal, como él),
    // Pollito, Didi (puñetazos), Héroe (miedoso que al final se atreve), Turbo Abuela (cada vez más rápida),
    // Tom (atrapa a los ratones), Lika (pesadilla), Jerry (Sartenazo es Normal; él, Hada).
    10001: 'adapt', 10002: 'voltengine', 10003: 'hugepower', 10004: 'courage', 10005: 'speedboost',
    10006: 'shadowtag', 10007: 'baddreams', 10008: 'pixilate'
  };
  const of = base => ABIL[ABIL_OF[base]] || ABIL.sheerforce;

  /** Al megaevolucionar (evo.js). `base`: el Pokémon de antes. */
  function apply(pl, base) {
    const key = ABIL_OF[base] || 'sheerforce', a = ABIL[key];
    pl.megaAb = key; pl.megaTick = 0; pl.megaBoostN = 0; pl.megaBoostT = 0;
    if (a.atk) pl.atkMul *= a.atk;
    if (a.crit) pl.critChance = (pl.critChance || 0) + a.crit;
    if (a.cd) pl.cdMul *= a.cd;
    if (a.red) pl.dmgReduce = (pl.dmgReduce || 0) + a.red;
    // Movimiento inicial despertado.
    const m = pl.moves.find(x => x.id === pl.startMoveId);
    if (m) m.mega = true;
    G.Spawner.say(G.I18n.f(pl.mon && pl.mon.awaken ? 'Habilidad despierta: {x}' : 'Habilidad Mega: {x}', G.T(a.name)) + ' — ' + G.T(a.desc), 4, true);
  }

  /** Multiplicador de daño de un golpe (Combat.hit). */
  function dmgK(pl, m) {
    let k = m.mega ? AWAKE_DMG : 1;
    const a = ABIL[pl.megaAb];
    if (!a) return k;
    if (a.dmg) k *= a.dmg;
    if (a.types && a.types.includes(m.type)) k *= a.k;
    if (a.stab && pl.mon && pl.mon.types.includes(m.type)) k *= a.stab;
    if (a.courage && pl.maxHp > 0) k *= 1 + a.courage * G.U.clamp(1 - pl.hp / pl.maxHp, 0, 1);   // Valor Tardío: según la vida que falta
    return k;
  }
  /** Amor Filial: ¿este golpe pega otra vez? */
  const again = pl => { const a = ABIL[pl.megaAb]; return !!(a && a.parental && Math.random() < a.parental); };
  /** Recarga del movimiento despertado (Combat.tickMove). */
  const cdK = m => (m.mega ? AWAKE_CD : 1);

  /** Cada fotograma (tu Pokémon): lo que va por tiempo. */
  function update(dt, pl) {
    const a = pl && !pl.dead && ABIL[pl.megaAb];
    if (!a) return;
    if (a.tag && (pl.megaTagT = (pl.megaTagT || 0) - dt) <= 0) {
      pl.megaTagT = 0.25;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 170)) if (!e.dead && !e.dummy) e.applySlow(a.tag, 0.4);
    }
    if (a.sand && (pl.megaTick = (pl.megaTick || 0) - dt) <= 0) {
      pl.megaTick = 1;
      const col = pl.megaAb === 'baddreams' ? '#7a5c9a' : '#d6b25c', mt = { type: pl.megaAb === 'baddreams' ? 'dark' : 'rock', kind: 'mega-ab', maxFx: true, id: 'mega-ab' };
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 170)) {
        if (e.dead || e.dummy || G.U.dist2(e.x, e.y, pl.x, pl.y) > 170 * 170) continue;
        G.Combat.hitBy(pl, e, (6 + (pl.level || 1) * 1.2) * pl.atk, mt, 0);
      }
      if (G.Camera.sees(pl.x, pl.y, 170)) for (let i = 0; i < 18; i++) {
        const an = Math.random() * 6.28, d = 40 + Math.random() * 130;
        G.FX.px(pl.x + Math.cos(an) * d, pl.y + Math.sin(an) * d * 0.6 - 10, col, { vx: -Math.sin(an) * 120, vy: Math.cos(an) * 60, life: 0.6 });
      }
    }
    if (a.boost && pl.megaBoostN < 6 && (pl.megaBoostT = (pl.megaBoostT || 0) + dt) >= 10) {
      pl.megaBoostT = 0; pl.megaBoostN++; pl.spdMul *= 1.05;
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, G.T('¡Velocidad +5%!'), '#9fe0ff', false);
    }
  }

  return { apply, dmgK, again, cdK, update, of, ABIL, ABIL_OF, AWAKE_DMG, AWAKE_CD };
})();
