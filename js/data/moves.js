/* ============ moves.js — catálogo de movimientos ============
 *
 * kind (comportamiento, implementado en systems/combat.js):
 *   projectile  dispara `count` proyectiles al enemigo más cercano
 *   melee       golpe en arco alrededor del Pokémon
 *   beam        rayo recto que atraviesa todo lo que pilla
 *   orbit       orbes que giran alrededor mientras el movimiento está activo
 *   nova        ráfaga radial en todas las direcciones
 *   aura        círculo de daño continuo alrededor
 *   buff        potencia al propio Pokémon (acumulable, caduca)
 *   ---- desde 2026-10-10 (mismos gráficos, otra forma de jugar) ----
 *   boomerang   sale hacia el enemigo y vuelve a ti, golpeando a la ida y a la vuelta
 *   chain       golpea a uno y salta a los `count` siguientes más cercanos
 *   mine        minas en el suelo que estallan al pisarlas
 *   meteor      caen `count` meteoros sobre enemigos cercanos (avisa la sombra)
 *   turret      deja algo que dispara solo durante `dur` segundos
 *   dash        cruzas hacia el enemigo golpeando todo el camino (sin recibir daño)
 *   trail       vas dejando charcos que dañan a lo que los pisa
 *   cone        muchos disparos cortos en abanico (aliento, chorro...)
 *   ---- de esta versión (números por nivel en TABLE, no por escalera) ----
 *   flameshield PASIVO: quema a los que se acercan (sigue un rato aunque se alejen)
 *   lightning   rayos que caen sobre enemigos al azar en un radio
 *   drain       muerde a los N más cercanos y te cura (evolucionado: PASIVO)
 *   psyarrow    flechas que vuelan a un enemigo y saltan a los siguientes más cercanos
 *   ---- 2026-10-15 (también con TABLE) ----
 *   acidrain    lluvia venenosa a tu alrededor: veneno + frenado que dura aunque se alejen; charcos
 *   fist        puñetazos rápidos al más cercano, con críticos seguros cada N golpes
 *   bulk        PASIVO: defensa según el tamaño de tu Pokémon (evolucionado: campo de fuerza)
 *   spear       lanzas al enemigo que perforan (evolucionado: 8 direcciones y se parten)
 *   treefall    árboles que caen en diagonal sobre enemigos (aplastan en un círculo)
 *   ---- 2026-10-16 (también con TABLE) ----
 *   hearts      corazones que buscan enemigos, los frenan y te dan velocidad; rebotan
 *   tornado     tornados de agua hacia los enemigos; atraviesan y lanzan por los aires
 *   bladestorm  tormenta de esquirlas a tu alrededor (daño/s) + cuchillas a un enemigo
 *   dbeam       rayos de ti a los enemigos (evolucionado: rayo continuo y agujeros negros)
 *   ---- apoyo (2026-10-15, también con TABLE) ----
 *   support     movimientos de apoyo (curar, defender): funcionan solos con su recarga,
 *               como los pasivos (no se eligen como ataque). Cada uno en combat.js support().
 *
 * Sólo el movimiento ACTIVO se ejecuta. Se cambia con 1-4 / Q / E.
 *
 * El icono no se guarda aquí: G.Icons lo compone (emblema del tipo +
 * insignia de la familia), ver ui/icons.js.
 *
 * Las mejoras (lvl 1 -> 5) salen de una escalera común por `kind`:
 *   mods multiplicativos -> dmg, cd, speed, radius, dur, amount, arc
 *   mods aditivos        -> count, pierce, stacks
 */
(() => {
  const LADDERS = {
    projectile: [
      { t: '+1 proyectil',                  m: { count: 1, spread: 1.4 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+1 proyectil y +1 perforación',   m: { count: 1, pierce: 1, spread: 1.2 } }
    ],
    melee: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% alcance',                  m: { radius: 1.25 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: 'Golpea en 360° y +50% daño',    m: { arc: 9, dmg: 1.50 } }
    ],
    beam: [
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% alcance y grosor',         m: { radius: 1.30, width: 1.30 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } }
    ],
    orbit: [
      { t: '+1 orbe',                       m: { count: 1 } },
      { t: '+55% daño',                     m: { dmg: 1.55 } },
      { t: '+25% radio y gira más rápido',  m: { radius: 1.25, speed: 1.35 } },
      { t: '+1 orbe y +55% daño',           m: { count: 1, dmg: 1.55 } }
    ],
    nova: [
      { t: '+4 proyectiles',                m: { count: 4 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+4 proyectiles y +1 perforación', m: { count: 4, pierce: 1 } }
    ],
    aura: [
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: 'Golpea un 40% más a menudo',    m: { cd: 0.70 } },
      { t: '+30% radio y +50% daño',        m: { radius: 1.30, dmg: 1.50 } }
    ],
    boomerang: [
      { t: '+1 bumerán',                    m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% alcance',                  m: { radius: 1.30 } },
      { t: '+1 bumerán y +40% daño',        m: { count: 1, dmg: 1.40 } }
    ],
    chain: [
      { t: '+2 saltos',                     m: { count: 2 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+2 saltos y +40% daño',         m: { count: 2, dmg: 1.40 } }
    ],
    mine: [
      { t: '+1 mina',                       m: { count: 1 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: '+30% radio de explosión',       m: { radius: 1.30 } },
      { t: '+1 mina y -25% recarga',        m: { count: 1, cd: 0.75 } }
    ],
    meteor: [
      { t: '+1 meteoro',                    m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+2 meteoros y -20% recarga',    m: { count: 2, cd: 0.80 } }
    ],
    turret: [
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: 'Dispara un 35% más rápido',     m: { rate: 0.74 } },
      { t: '+1 a la vez',                   m: { count: 1 } },
      { t: '+50% duración y +40% daño',     m: { dur: 1.50, dmg: 1.40 } }
    ],
    dash: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% distancia',                m: { radius: 1.30 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+60% daño y más ancho',         m: { dmg: 1.60, width: 1.40 } }
    ],
    trail: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+40% duración',                 m: { dur: 1.40 } },
      { t: 'Charcos un 30% más grandes',    m: { radius: 1.30 } },
      { t: '+50% daño y +30% radio',        m: { dmg: 1.50, radius: 1.30 } }
    ],
    cone: [
      { t: '+3 disparos',                   m: { count: 3 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% alcance',                  m: { life: 1.30 } },
      { t: '+3 disparos y +1 perforación',  m: { count: 3, pierce: 1 } }
    ],
    // Los de esta versión: el texto describe la mejora; los números salen de TABLE.
    flameshield: [
      { t: '+4 de daño/s, +2 s y +0,5 casillas', m: {} },
      { t: '+8 de daño/s, +3 s y +1 casilla',    m: {} },
      { t: '+10 de daño/s y +8 s',               m: {} },
      { t: '+13 de daño/s, +12 s y +1 casilla',  m: {} }
    ],
    lightning: [
      { t: '+1 rayo',                                        m: {} },
      { t: '+8 de daño por rayo',                            m: {} },
      { t: '+2 rayos, +2 de daño y +2 casillas de alcance',  m: {} },
      { t: '+3 rayos y +5 de daño',                          m: {} }
    ],
    drain: [
      { t: '+3 de daño y +1 de curación',                              m: {} },
      { t: '+3 objetivos, +8 de daño y +2 de curación',                m: {} },
      { t: '+5 objetivos, +13 de daño, +2 de curación y +2 casillas',  m: {} },
      { t: '+5 objetivos, +7 de daño y +2 de curación',                m: {} }
    ],
    psyarrow: [
      { t: '+6 de daño al primero y +3 a los demás',                 m: {} },
      { t: '+1 flecha',                                              m: {} },
      { t: '+1 perforación, +8 al primero y +5 a los demás',         m: {} },
      { t: '+6 de daño al primero y +4 a los demás',                 m: {} }
    ],
    acidrain: [
      { t: '+3 de daño/s, +4 s y +1 casilla',                         m: {} },
      { t: '+5 de daño/s y +6 s; deja charcos que frenan',            m: {} },
      { t: '+6 de daño/s, +5 s y +1 casilla; los charcos envenenan', m: {} },
      { t: '+6 de daño/s y +8 s; los que pisan un charco van dejando más', m: {} }
    ],
    fist: [
      { t: '+4 de daño y +5% de crítico; crítico seguro cada 8 golpes',                m: {} },
      { t: '+8 de daño y +7,5% de crítico; crítico cada 7 golpes y empuja 3 casillas', m: {} },
      { t: '+10 de daño, +7,5% de crítico, +2 casillas; crítico cada 6 golpes',          m: {} },
      { t: '+10% de crítico, crítico cada 5 golpes; los críticos hacen sangrar',       m: {} }
    ],
    bulk: [
      { t: '+5% de armadura y +5% de reducción de daño',              m: {} },
      { t: '+10% de armadura, +7,5% de reducción y +50 de vida',      m: {} },
      { t: '+13% de armadura y +7,5% de reducción',                   m: {} },
      { t: '+12% de armadura, +10% de reducción y +60 de vida',       m: {} }
    ],
    spear: [
      { t: '+1 lanza y +6 de daño',                                   m: {} },
      { t: '+1 perforación y +8 de daño',                             m: {} },
      { t: '+10 de daño, lanzas un 15% más grandes y +2 casillas',     m: {} },
      { t: '+1 lanza, +1 perforación y +10 de daño',                   m: {} }
    ],
    treefall: [
      { t: '+10 de daño y árbol más grande',                          m: {} },
      { t: '+6 de daño y +1 árbol',                                   m: {} },
      { t: '+8 de daño; donde cae deja una zona que frena',           m: {} },
      { t: '+10 de daño y +1 árbol',                                  m: {} }
    ],
    // ---- 2026-10-16: exclusivos de los personajes originales (data/custom.js) ----
    foampunch: [
      { t: '+12 de daño y salpicadura más grande', m: {} },
      { t: '+14 de daño; golpea a 2 enemigos', m: {} },
      { t: '+16 de daño y salpicadura más grande', m: {} },
      { t: '+18 de daño; golpea a 3 enemigos', m: {} }
    ],
    scare: [
      { t: '+12 de daño, +1 por enemigo cerca y -0,1 s de recarga',          m: {} },
      { t: '+8 de daño, +1 por enemigo (hasta 14) y más radio',             m: {} },
      { t: '+12 de daño, +1 por enemigo y -0,1 s de recarga',                m: {} },
      { t: '+12 de daño, +1 por enemigo (hasta 16) y más radio',            m: {} }
    ],
    afterimage: [
      { t: '+2 de daño, sombras más duraderas y +2% de velocidad',           m: {} },
      { t: '+3 de daño, sombras más grandes y +3% de velocidad',             m: {} },
      { t: '+3 de daño, sombras más grandes y +3% de velocidad',             m: {} },
      { t: '+4 de daño, sombras más duraderas y +2% de velocidad',           m: {} }
    ],
    pounce: [
      { t: '+4 de daño por zarpazo; si lo derriba, salta a otro enemigo', m: {} },
      { t: '+4 de daño y más alcance', m: {} },
      { t: '+6 de daño, +1 zarpazo y salta a 2 enemigos', m: {} },
      { t: '+8 de daño y más alcance', m: {} }
    ],
    whip: [
      { t: '+10 de daño, lengua más larga y +1 de veneno', m: {} },
      { t: '+14 de daño', m: {} },
      { t: '+16 de daño, lengua más larga y gruesa y +1 de veneno', m: {} },
      { t: '+10 de daño', m: {} }
    ],
    question: [
      { t: '+15 de daño y pregunta a 3 enemigos',                           m: {} },
      { t: '+15 de daño, más alcance y se quedan pensando más rato',        m: {} },
      { t: '+18 de daño y pregunta a 4 enemigos',                           m: {} },
      { t: '+22 de daño, 5 enemigos y más rato pensando',                   m: {} }
    ],
    roll: [
      { t: '+4 de daño y +1 bola', m: {} },
      { t: '+8 de daño, bolas más grandes que atraviesan 5', m: {} },
      { t: '+10 de daño y +1 bola', m: {} },
      { t: '+14 de daño, bolas más grandes que atraviesan 8', m: {} }
    ],
    // ---- 2026-10-16 ----
    hearts: [
      { t: '+8 de daño y +2 casillas de alcance',                           m: {} },
      { t: '+10 de daño y +1 corazón',                                      m: {} },
      { t: '+12 de daño; los corazones rebotan 1 vez',                      m: {} },
      { t: '+10 de daño y +1 corazón; el rebote hace ×2 (una vez)',          m: {} }
    ],
    tornado: [
      { t: '+8 de daño, +1 tornado y atraviesan',                           m: {} },
      { t: '+10 de daño y +1 tornado',                                      m: {} },
      { t: '+10 de daño y tornados más grandes',                            m: {} },
      { t: '+12 de daño; lanzan por los aires a los enemigos (1 s sin moverse)', m: {} }
    ],
    bladestorm: [
      { t: 'Tormenta +2 de daño/s y +1 casilla; cuchilla +8 de daño y más grande', m: {} },
      { t: 'Tormenta +2 de daño/s; cuchilla +8 de daño y +1 cuchilla',      m: {} },
      { t: 'Tormenta +2 de daño/s y +1 casilla; cuchilla +12 de daño y atraviesa', m: {} },
      { t: 'Tormenta +2 de daño/s; cuchilla +10 de daño y +1 cuchilla',     m: {} }
    ],
    dbeam: [
      { t: '+6 de daño y rayo más ancho',                                   m: {} },
      { t: '+12 de daño y +1 rayo',                                         m: {} },
      { t: '+8 de daño, 15% de crítico y +1,5 casillas',                    m: {} },
      { t: '+10 de daño y +1 rayo; al acertar sale otro rayo hacia atrás',  m: {} }
    ],
    // Apoyo: el texto de cada nivel va en el propio movimiento (def.upTexts), porque cada
    // uno mejora cosas distintas; esta escalera sólo da la longitud (4 mejoras).
    support: [{ t: '', m: {} }, { t: '', m: {} }, { t: '', m: {} }, { t: '', m: {} }],
    buff: [
      { t: '+1 acumulación máxima',         m: { stacks: 1 } },
      { t: '+40% potencia',                 m: { amount: 1.40 } },
      { t: '+50% duración',                 m: { dur: 1.50 } },
      { t: '+1 acumulación y +40% potencia', m: { stacks: 1, amount: 1.40 } }
    ]
  };

  const RAW = [
    // ---------------- NORMAL (pool común a todos) ----------------
    { id: 'tackle', name: 'Placaje', type: 'normal', kind: 'melee',
      desc: 'Embiste en arco a todo lo que tengas delante.',
      cd: 0.50, dmg: 13, radius: 48, arc: 1.7, knock: 90 },

    { id: 'quick-attack', name: 'Ataque Rápido', type: 'normal', kind: 'dash',
      desc: 'Cruzas como un rayo hacia el enemigo y golpeas todo el camino.',
      cd: 0.75, dmg: 20, radius: 110, width: 34, knock: 40 },

    { id: 'swords-dance', name: 'Danza Espada', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula ATAQUE mientras esté activo.',
      cd: 0.85, stat: 'atk', amount: 0.13, dur: 7, stacks: 5 },

    { id: 'agility', name: 'Agilidad', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula VELOCIDAD mientras esté activo.',
      cd: 0.85, stat: 'spd', amount: 0.10, dur: 7, stacks: 5 },

    { id: 'harden', name: 'Fortaleza', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula DEFENSA mientras esté activo.',
      cd: 0.85, stat: 'def', amount: 0.07, dur: 7, stacks: 5 },

    // ---------------- FUEGO ----------------
    { id: 'ember', name: 'Ascuas', type: 'fire', kind: 'projectile',
      desc: 'Bola de fuego al enemigo más cercano.',
      cd: 0.52, dmg: 18, speed: 310, count: 1, spread: 0.12, pierce: 0, life: 1.6, size: 7, burn: 1 },

    { id: 'flamethrower', name: 'Lanzallamas', type: 'fire', kind: 'cone',
      desc: 'Chorro de llamas en abanico corto que quema.',
      cd: 0.70, dmg: 7, count: 7, arc: 0.9, speed: 380, life: 0.42, size: 6, pierce: 1, burn: 1 },

    { id: 'fire-spin', name: 'Giro Fuego', type: 'fire', kind: 'orbit',
      desc: 'Llamas que giran a tu alrededor. Defensa constante.',
      cd: 0.30, dmg: 14, count: 3, radius: 62, speed: 2.4, size: 9, burn: 1 },

    { id: 'heat-wave', name: 'Onda Ígnea', type: 'fire', kind: 'nova',
      desc: 'Explota en llamas en todas las direcciones.',
      cd: 1.25, dmg: 13, speed: 250, count: 10, pierce: 1, life: 1.1, size: 7, burn: 1 },

    // ---------------- AGUA ----------------
    { id: 'water-gun', name: 'Pistola Agua', type: 'water', kind: 'projectile',
      desc: 'Chorro perforante. Fiable a cualquier distancia.',
      cd: 0.44, dmg: 14, speed: 350, count: 1, spread: 0.10, pierce: 1, life: 1.5, size: 6 },

    { id: 'bubble', name: 'Burbuja', type: 'water', kind: 'nova',
      desc: 'Burbujas en abanico que ralentizan a quien tocan.',
      cd: 1.00, dmg: 9, speed: 210, count: 8, pierce: 0, life: 1.3, size: 8, slow: 0.45 },

    { id: 'hydro-pump', name: 'Hidrobomba', type: 'water', kind: 'beam',
      desc: 'Cañonazo de agua lento pero devastador.',
      cd: 1.50, dmg: 29, radius: 250, width: 30 },

    { id: 'aqua-ring', name: 'Acua Aro', type: 'water', kind: 'buff',
      desc: 'No hace daño: acumula REGENERACIÓN de vida.',
      cd: 0.90, stat: 'regen', amount: 1.6, dur: 8, stacks: 4 },

    // ---------------- PLANTA ----------------
    { id: 'vine-whip', name: 'Látigo Cepa', type: 'grass', kind: 'melee',
      desc: 'Látigos de largo alcance en arco amplio.',
      cd: 0.62, dmg: 16, radius: 68, arc: 1.3, knock: 60 },

    { id: 'razor-leaf', name: 'Hoja Afilada', type: 'grass', kind: 'boomerang',
      desc: 'Dos hojas que van y vuelven cortando a la ida y a la vuelta.',
      cd: 0.90, dmg: 10, speed: 330, count: 2, spread: 0.5, radius: 210, size: 6 },

    { id: 'leaf-storm', name: 'Tormenta Floral', type: 'grass', kind: 'orbit',
      desc: 'Un ciclón de hojas gira amplio a tu alrededor.',
      cd: 0.26, dmg: 14, count: 4, radius: 74, speed: 2.6, size: 8 },

    // (Antes Gigadrenado: curaba con cada golpe y estaba roto. Mismo id para no romper partidas.)
    { id: 'giga-drain', name: 'Hierba Lazo', type: 'grass', kind: 'aura',
      desc: 'Raíces que atrapan y machacan todo lo que tienes cerca.',
      cd: 0.55, dmg: 9, radius: 76 },

    // ---------------- ELÉCTRICO ----------------
    { id: 'thunder-shock', name: 'Impactrueno', type: 'electric', kind: 'projectile',
      desc: 'Descarga rapidísima que atraviesa varios enemigos.',
      cd: 0.40, dmg: 13, speed: 480, count: 1, spread: 0.08, pierce: 2, life: 1.1, size: 5 },

    { id: 'discharge', name: 'Chispazo', type: 'electric', kind: 'aura',
      desc: 'Campo eléctrico permanente alrededor de ti.',
      cd: 0.45, dmg: 8, radius: 70 },

    { id: 'thunderbolt', name: 'Rayo', type: 'electric', kind: 'chain',
      desc: 'Un rayo que salta de un enemigo a otro.',
      cd: 0.95, dmg: 21, count: 4, radius: 140 },

    // ---------------- PSÍQUICO ----------------
    // (11-10-2026: -22/-30 % de daño y persiguen menos; llenaban el ranking.)
    { id: 'confusion', name: 'Confusión', type: 'psychic', kind: 'projectile',
      desc: 'Onda que persigue sola a su objetivo.',
      cd: 0.58, dmg: 13, speed: 280, count: 1, spread: 0.1, pierce: 0, life: 2.2, size: 8, homing: 2.0 },

    { id: 'psybeam', name: 'Psicorrayo', type: 'psychic', kind: 'beam',
      desc: 'Rayo psíquico ancho y contundente.',
      cd: 1.15, dmg: 17, radius: 215, width: 40 },

    { id: 'psychic', name: 'Psíquico', type: 'psychic', kind: 'nova',
      desc: 'Estallido mental radial que busca enemigos.',
      cd: 1.35, dmg: 10, speed: 230, count: 12, pierce: 1, life: 1.6, size: 7, homing: 1.0 },

    // ---------------- TIPOS SECUNDARIOS ----------------
    { id: 'sludge', name: 'Residuos', type: 'poison', kind: 'projectile',
      desc: 'Lodo tóxico que envenena al impactar.',
      cd: 0.60, dmg: 17, speed: 290, count: 1, spread: 0.12, pierce: 0, life: 1.5, size: 8, poison: 1 },

    { id: 'mud-shot', name: 'Disparo Lodo', type: 'ground', kind: 'nova',
      desc: 'Salpica lodo alrededor y ralentiza.',
      cd: 1.10, dmg: 11, speed: 200, count: 7, pierce: 0, life: 1.0, size: 9, slow: 0.4 },

    { id: 'gust', name: 'Tornado', type: 'flying', kind: 'orbit',
      desc: 'Remolinos de viento que te escoltan.',
      cd: 0.26, dmg: 13, count: 3, radius: 72, speed: 2.8, size: 8, knock: 40 },

    { id: 'wing-attack', name: 'Ataque Ala', type: 'flying', kind: 'melee',
      desc: 'Barrido de alas amplio que empuja.',
      cd: 0.55, dmg: 14, radius: 58, arc: 1.9, knock: 70 },

    // ---------------- NORMAL (extra) ----------------
    { id: 'body-slam', name: 'Golpe Cuerpo', type: 'normal', kind: 'melee',
      desc: 'Placaje con todo el peso: lento, corto y brutal.',
      cd: 0.95, dmg: 30, radius: 46, arc: 2.2, knock: 140 },

    { id: 'hyper-voice', name: 'Vozarrón', type: 'normal', kind: 'nova',
      desc: 'Onda sonora que sale en todas direcciones.',
      cd: 1.15, dmg: 12, speed: 260, count: 9, pierce: 1, life: 0.9, size: 7 },

    // ---------------- VENENO (extra) ----------------
    { id: 'poison-sting', name: 'Picotazo Veneno', type: 'poison', kind: 'projectile',
      desc: 'Aguijón rápido que envenena.',
      cd: 0.34, dmg: 8, speed: 420, count: 1, spread: 0.08, pierce: 0, life: 1.0, size: 4, poison: 1 },

    { id: 'toxic', name: 'Tóxico', type: 'poison', kind: 'trail',
      desc: 'Vas dejando charcos de veneno que intoxican a quien los pisa.',
      cd: 0.3, dmg: 6, radius: 26, dur: 3, poison: 1 },

    // ---------------- TIERRA (extra) ----------------
    { id: 'bulldoze', name: 'Terratemblor', type: 'ground', kind: 'aura',
      desc: 'Sacude el suelo: daña y frena a lo cercano.',
      cd: 0.7, dmg: 11, radius: 80, slow: 0.35 },

    // ---------------- BICHO ----------------
    { id: 'bug-bite', name: 'Picadura', type: 'bug', kind: 'melee',
      desc: 'Mordisco rápido en arco corto.',
      cd: 0.42, dmg: 11, radius: 44, arc: 1.6, knock: 40 },

    { id: 'string-shot', name: 'Disparo Demora', type: 'bug', kind: 'mine',
      desc: 'Deja telarañas en el suelo que atrapan y frenan mucho al que las pisa.',
      cd: 1.1, dmg: 14, count: 2, radius: 56, dur: 7, slow: 0.6 },

    { id: 'bug-buzz', name: 'Zumbido', type: 'bug', kind: 'aura',
      desc: 'Vibración constante que machaca lo cercano.',
      cd: 0.45, dmg: 8, radius: 66 },

    // ---------------- ROCA ----------------
    { id: 'rock-throw', name: 'Lanzarrocas', type: 'rock', kind: 'projectile',
      desc: 'Pedrusco pesado que empuja al enemigo.',
      cd: 0.7, dmg: 24, speed: 260, count: 1, spread: 0.12, pierce: 0, life: 1.4, size: 9, knock: 90 },

    { id: 'rock-slide', name: 'Avalancha', type: 'rock', kind: 'meteor',
      desc: 'Caen rocas del cielo sobre los enemigos cercanos.',
      cd: 1.3, dmg: 21, count: 3, radius: 46, knock: 50 },     // (12-10-2026: era 26; mataba el doble que la media)

    // ---------------- HIELO ----------------
    { id: 'ice-beam', name: 'Rayo Hielo', type: 'ice', kind: 'beam',
      desc: 'Rayo helado que congela casi del todo.',
      cd: 1.1, dmg: 20, radius: 220, width: 30, slow: 0.7 },

    { id: 'powder-snow', name: 'Nieve Polvo', type: 'ice', kind: 'aura',
      desc: 'Ventisca a tu alrededor que ralentiza.',
      cd: 0.55, dmg: 8, radius: 76, slow: 0.45 },

    // ---------------- LUCHA ----------------
    { id: 'karate-chop', name: 'Golpe Kárate', type: 'fighting', kind: 'melee',
      desc: 'Golpe seco y potente al frente.',
      cd: 0.5, dmg: 18, radius: 50, arc: 1.2, knock: 110 },

    { id: 'aura-sphere', name: 'Esfera Aural', type: 'fighting', kind: 'projectile',
      desc: 'Esfera de energía que nunca falla.',
      cd: 0.62, dmg: 17, speed: 300, count: 1, spread: 0.1, pierce: 0, life: 2.0, size: 8, homing: 4 },

    // ---------------- FANTASMA ----------------
    { id: 'lick', name: 'Lengüetazo', type: 'ghost', kind: 'melee',
      desc: 'Lametazo espectral que paraliza un poco.',
      cd: 0.48, dmg: 12, radius: 48, arc: 1.8, slow: 0.4 },

    { id: 'shadow-ball', name: 'Bola Sombra', type: 'ghost', kind: 'projectile',
      desc: 'Esfera oscura que atraviesa a varios.',
      cd: 0.66, dmg: 19, speed: 280, count: 1, spread: 0.1, pierce: 2, life: 1.6, size: 9 },

    // ---------------- DRAGÓN ----------------
    { id: 'dragon-rage', name: 'Furia Dragón', type: 'dragon', kind: 'beam',
      desc: 'Llamarada dracónica en línea recta.',
      cd: 1.0, dmg: 24, radius: 230, width: 34 },

    { id: 'dragon-dance', name: 'Danza Dragón', type: 'dragon', kind: 'buff',
      desc: 'No hace daño: acumula ATAQUE más rápido que Danza Espada.',
      cd: 0.7, stat: 'atk', amount: 0.11, dur: 7, stacks: 5 },

    // ---------------- HADA ----------------
    { id: 'fairy-wind', name: 'Viento Feérico', type: 'fairy', kind: 'nova',
      desc: 'Brisa mágica en todas direcciones.',
      cd: 1.0, dmg: 11, speed: 230, count: 10, pierce: 0, life: 1.2, size: 7 },

    { id: 'dazzling-gleam', name: 'Brillo Mágico', type: 'fairy', kind: 'aura',
      desc: 'Destello a tu alrededor.',
      cd: 0.5, dmg: 9, radius: 72 },

    // ---------------- ACERO ----------------
    { id: 'metal-claw', name: 'Garra Metal', type: 'steel', kind: 'melee',
      desc: 'Zarpazo de acero en arco.',
      cd: 0.5, dmg: 15, radius: 50, arc: 1.6, knock: 60 },

    { id: 'flash-cannon', name: 'Foco Resplandor', type: 'steel', kind: 'beam',
      desc: 'Rayo de luz metálica que perfora.',
      cd: 1.05, dmg: 23, radius: 220, width: 30 },

    // ---------------- SINIESTRO ----------------
    { id: 'bite', name: 'Mordisco', type: 'dark', kind: 'melee',
      desc: 'Dentellada rápida que hace retroceder.',
      cd: 0.45, dmg: 14, radius: 46, arc: 1.5, knock: 70 },

    { id: 'dark-pulse', name: 'Pulso Umbrío', type: 'dark', kind: 'nova',
      desc: 'Onda de energía oscura en todas direcciones.',
      cd: 1.15, dmg: 14, speed: 240, count: 10, pierce: 1, life: 1.1, size: 8 },

    { id: 'night-shade', name: 'Tinieblas', type: 'dark', kind: 'aura',
      desc: 'Una sombra te rodea y consume lo cercano.',
      cd: 0.5, dmg: 9, radius: 72 },

    // ---------------- NUEVOS (2026-10-10): mismas formas, otras mecánicas ----------------
    { id: 'bonemerang', name: 'Huesomerang', type: 'ground', kind: 'boomerang',
      desc: 'Un hueso que va y vuelve golpeando fuerte.',
      cd: 0.95, dmg: 16, speed: 300, count: 1, radius: 230, size: 8, knock: 40 },

    { id: 'psycho-cut', name: 'Psicocorte', type: 'psychic', kind: 'boomerang',
      desc: 'Cuchillas psíquicas que vuelven a ti.',
      cd: 0.8, dmg: 9, speed: 360, count: 2, spread: 0.6, radius: 200, size: 7 },

    { id: 'spikes', name: 'Púas', type: 'ground', kind: 'mine',
      desc: 'Siembra púas que estallan al pisarlas.',
      cd: 1.2, dmg: 18, count: 2, radius: 60, dur: 8 },

    { id: 'toxic-spikes', name: 'Púas Tóxicas', type: 'poison', kind: 'mine',
      desc: 'Púas venenosas que envenenan mucho al estallar.',
      cd: 1.1, dmg: 11, count: 2, radius: 56, dur: 8, poison: 2 },

    { id: 'hail', name: 'Granizo', type: 'ice', kind: 'meteor',
      desc: 'Bolas de hielo caen sobre los enemigos y los frenan.',
      cd: 1.2, dmg: 18, count: 4, radius: 40, slow: 0.4 },

    { id: 'meteor-mash', name: 'Puño Meteoro', type: 'steel', kind: 'meteor',
      desc: 'Dos meteoros de acero que aplastan donde caen.',
      cd: 1.4, dmg: 34, count: 2, radius: 54, knock: 80 },

    { id: 'will-o-wisp', name: 'Fuego Fatuo', type: 'fire', kind: 'turret',
      desc: 'Deja una llama flotante que dispara sola y quema.',
      cd: 3.5, dmg: 15, rate: 0.55, dur: 6, count: 1, range: 300, speed: 300, size: 7, burn: 1 },

    { id: 'substitute', name: 'Sustituto', type: 'normal', kind: 'turret',
      desc: 'Un muñeco que se queda disparando por ti.',
      cd: 4.0, dmg: 14, rate: 0.4, dur: 6, count: 1, range: 280, speed: 320, size: 6 },

    { id: 'aerial-ace', name: 'Golpe Aéreo', type: 'flying', kind: 'dash',
      desc: 'Te lanzas en picado y cortas todo lo que cruzas.',
      cd: 0.75, dmg: 18, radius: 120, width: 40, knock: 60 },

    { id: 'flame-wheel', name: 'Rueda Fuego', type: 'fire', kind: 'trail',
      desc: 'Corres envuelto en fuego y dejas un rastro de llamas.',
      cd: 0.28, dmg: 10, radius: 28, dur: 2.6, burn: 1 },

    { id: 'bubble-beam', name: 'Rayo Burbuja', type: 'water', kind: 'cone',
      desc: 'Chorro de burbujas en abanico corto que frena.',
      cd: 0.65, dmg: 6, count: 7, arc: 1.0, speed: 340, life: 0.45, size: 6, slow: 0.3 },

    { id: 'hex', name: 'Infortunio', type: 'ghost', kind: 'chain',
      desc: 'Maldición que salta entre enemigos. Mucho más daño si están quemados, envenenados o frenados.',
      cd: 0.9, dmg: 17, count: 4, radius: 150, hex: 1.7 },

    // ---------------- de esta versión (números en TABLE) ----------------
    { id: 'flame-shield', name: 'Escudo de Llamas', type: 'fire', kind: 'flameshield',
      desc: 'PASIVO: quema a los enemigos que se te acercan. Siguen ardiendo un rato aunque se alejen.',
      cd: 0.5, dmg: 10, radius: 80 },
    { id: 'thunder-strike', name: 'Caída de Rayo', type: 'electric', kind: 'lightning',
      desc: 'Rayos que caen del cielo sobre enemigos cercanos al azar.',
      cd: 1.17, dmg: 20, count: 4, radius: 256 },
    { id: 'vampire-fang', name: 'Colmillo Vampiro', type: 'bug', kind: 'drain',
      desc: 'Muerde a los enemigos más cercanos y te cura. Al evolucionar pasa a ser PASIVO.',
      cd: 1.7, dmg: 14, count: 5, radius: 160 },
    { id: 'psy-arrow', name: 'Flecha Psíquica', type: 'psychic', kind: 'psyarrow',
      desc: 'Flecha que vuela a un enemigo y salta a los siguientes más cercanos.',
      cd: 1.2, dmg: 14, count: 1, radius: 512 },
    // ---------------- 2026-10-15 (números en TABLE) ----------------
    { id: 'acid-rain', name: 'Lluvia Corrosiva', type: 'poison', kind: 'acidrain',
      desc: 'Lluvia venenosa a tu alrededor: envenena y frena a los enemigos un buen rato.',
      cd: 1.5, dmg: 6, radius: 192 },
    { id: 'lee-fist', name: 'Puño Lee', type: 'fighting', kind: 'fist',
      desc: 'Puñetazos rápidos al enemigo más cercano. Cada pocos golpes, uno es crítico seguro.',
      cd: 0.28, dmg: 16, radius: 160 },
    { id: 'heavyweight', name: 'Peso Pesado', type: 'normal', kind: 'bulk',
      desc: 'PASIVO: armadura (menos daño al chocar) y reducción de daño. Cuanto más grande tu Pokémon, más.',
      cd: 0.5, dmg: 0, radius: 0 },
    { id: 'ghost-spear', name: 'Lanza Espectral', type: 'ghost', kind: 'spear',
      desc: 'Lanza fantasmal contra el enemigo más cercano.',
      cd: 0.95, dmg: 26, radius: 320 },
    { id: 'nature-tree', name: 'Bautismo Natural', type: 'grass', kind: 'treefall',
      desc: 'Un árbol cae en diagonal del cielo y aplasta a los enemigos donde cae.',
      cd: 1.5, dmg: 30, radius: 384 },
    // ---------------- 2026-10-16 (números en TABLE) ----------------
    { id: 'formless-art', name: 'Arte Sin Forma', type: 'fairy', kind: 'hearts',
      desc: 'Corazones rosas que buscan a los enemigos a 10 casillas: los frenan y a ti te dan velocidad.',
      cd: 0.9, dmg: 16, radius: 320 },
    { id: 'raging-tornado', name: 'Tornado Furioso', type: 'water', kind: 'tornado',
      desc: 'Tornados de agua que van a por los enemigos a 10 casillas.',
      cd: 1.3, dmg: 14, radius: 320 },
    { id: 'blade-storm', name: 'Tormenta de Cuchillas', type: 'steel', kind: 'bladestorm',
      desc: 'Tormenta de esquirlas de metal a tu alrededor que daña cada segundo, y una cuchilla contra un enemigo a 9 casillas.',
      cd: 0.5, dmg: 8, radius: 288 },
    { id: 'destruction-beam', name: 'Rayo Destructor', type: 'normal', kind: 'dbeam',
      desc: 'Un rayo desde ti hasta un enemigo a 10 casillas que daña a todo lo que toca.',
      cd: 1.1, dmg: 24, radius: 320 },
    // ---------------- 2026-10-16: exclusivos de los personajes originales ----------------
    // `only`: sólo lo aprende ese personaje (es su movimiento inicial); no sale en las cartas de los demás.
    { id: 'foam-punch', name: 'Puño Espuma', type: 'water', kind: 'foampunch', only: 10003,
      desc: 'EXCLUSIVO de Didi: un puñetazo al enemigo más cercano que estalla en espuma y moja a los de alrededor.',
      cd: 0.7, dmg: 36, radius: 160 },
    { id: 'scaredy-burst', name: 'Pelos de Punta', type: 'normal', kind: 'scare', only: 10004,
      desc: 'EXCLUSIVO de Héroe: se asusta tanto que se le eriza todo y aparta a los que tiene cerca. Cuantos más enemigos, más daño.',
      cd: 1.4, dmg: 28, radius: 102 },
    { id: 'turbo-dash', name: 'Turbo Fantasma', type: 'ghost', kind: 'afterimage', only: 10005,
      desc: 'EXCLUSIVO de la Turbo Abuela: va tan rápida que deja sombras de sí misma que dañan a quien las toca (y a todo lo que hay entre una y otra). Parada, suelta ondas fantasma. Más velocidad.',
      cd: 0.3, dmg: 14, radius: 51 },
    { id: 'cat-pounce', name: 'Caza Ratones', type: 'dark', kind: 'pounce', only: 10006,
      desc: 'EXCLUSIVO de Tom: zarpazos seguidos al enemigo más cercano.',
      cd: 0.8, dmg: 14, radius: 176 },
    { id: 'tongue-lash', name: 'Lengüetazo Látigo', type: 'poison', kind: 'whip', only: 10007,
      desc: 'EXCLUSIVO de Lika: la lengua sale como un látigo hasta un enemigo y envenena a todos los que toca por el camino.',
      cd: 0.9, dmg: 30, radius: 208 },
    { id: 'curious-question', name: 'Pregunta Curiosa', type: 'normal', kind: 'question', only: 10001,
      desc: 'EXCLUSIVO del Panda: lanza preguntas a los enemigos cercanos; los que reciben una se quedan pensando un momento (inmóviles).',
      cd: 1.0, dmg: 26, radius: 192 },
    { id: 'potato-roll', name: 'Boniato Rodante', type: 'electric', kind: 'roll', only: 10002,
      desc: 'EXCLUSIVO del Boniato: rueda bolas de boniato electrizadas que atraviesan a los enemigos.',
      cd: 1.0, dmg: 22, radius: 256 },
    // ---------------- apoyo (2026-10-15): curar y defender ----------------
    { id: 'recover', name: 'Recuperación', type: 'psychic', kind: 'support', cd: 12, dmg: 0, radius: 0,
      desc: 'APOYO: cada pocos segundos recuperas parte de tu vida máxima.',
      upTexts: ['+3% de curación y -1 s de recarga', '+3% de curación y -1 s de recarga', '+3% de curación y -1 s de recarga', '+4% de curación y -1 s de recarga'],
      evoText: 'Cura un 30% cada 7 s y quita los estados malos' },
    { id: 'light-screen', name: 'Pantalla de Luz', type: 'psychic', kind: 'support', cd: 15, dmg: 0, radius: 0,
      desc: 'APOYO: cada pocos segundos levanta una pantalla que reduce a la mitad el daño que recibes.',
      upTexts: ['+0,5 s de pantalla y -1 s de recarga', '+0,5 s, -1 s de recarga y para un 55%', '+0,5 s de pantalla y -1 s de recarga', '+0,5 s, -1 s de recarga y para un 60%'],
      evoText: 'Pantalla de 7 s que para un 65% del daño, cada 10 s' },
    { id: 'protect', name: 'Protección', type: 'normal', kind: 'support', cd: 20, dmg: 0, radius: 0,
      desc: 'APOYO: si te rodean (o te queda poca vida), te vuelves invulnerable un momento.',
      upTexts: ['+0,1 s de protección y -2 s de recarga', 'Salta con 4 enemigos cerca, +0,2 s y -2 s', '+0,2 s de protección y -1 s de recarga', '+0,2 s de protección y -1 s de recarga'],
      evoText: '2,5 s de protección cada 12 s y una onda que aparta a los enemigos' },
    { id: 'wish', name: 'Deseo', type: 'normal', kind: 'support', cd: 18, dmg: 0, radius: 0,
      desc: 'APOYO: pides un deseo y a los 2 s te curas (y a los compañeros cercanos).',
      upTexts: ['+3% de curación y -1 s de recarga', '+3% de curación y -1 s de recarga', '+3% de curación y -1 s de recarga', '+4% de curación y -1 s de recarga'],
      evoText: 'Cura un 40% cada 12 s, a ti y al grupo en un radio mayor' },
    { id: 'calm-mind', name: 'Paz Mental', type: 'psychic', kind: 'support', cd: 10, dmg: 0, radius: 0,
      desc: 'APOYO: cada pocos segundos te concentras: +10% de daño y -10% de daño recibido un rato (se acumula).',
      upTexts: ['Dura 1 s más', 'Se acumula hasta 2 veces y -1 s de recarga', 'Dura 1 s más', 'Se acumula hasta 3 veces y -1 s de recarga'],
      evoText: '+12% por acumulación (hasta 3), cada 7 s' },
    { id: 'life-dew', name: 'Rocío Vital', type: 'water', kind: 'support', cd: 10, dmg: 0, radius: 0,
      desc: 'APOYO: cada pocos segundos os curáis un poco tú y los compañeros cercanos.',
      upTexts: ['+1% de curación y -0,5 s de recarga', '+1% de curación y -0,5 s de recarga', '+1% de curación y -0,5 s de recarga', '+2% de curación y -0,5 s de recarga'],
      evoText: 'Cura un 16% cada 7 s en un radio mayor' },
    { id: 'rest', name: 'Descanso', type: 'normal', kind: 'support', cd: 40, dmg: 0, radius: 0,
      desc: 'APOYO: con poca vida te echas a dormir un momento (no te mueves ni atacas) y despiertas con la vida llena.',
      upTexts: ['-4 s de recarga', '-4 s de recarga y duermes menos', '-4 s de recarga y duermes menos', '-3 s de recarga y duermes menos'],
      evoText: 'Duermes sólo 1,2 s, cada 22 s, y durmiendo no te hacen daño' },
    { id: 'safeguard', name: 'Velo Sagrado', type: 'fairy', kind: 'support', cd: 30, dmg: 0, radius: 0,
      desc: 'APOYO: los estados malos no te afectan (frenado, pociones malas) y cada cierto tiempo te limpia.',
      upTexts: ['-3 s de recarga', '-3 s de recarga', '-3 s de recarga', '-3 s de recarga'],
      evoText: 'Además, -10% de daño recibido' },
    // ---------------- 2026-10-15 · tipos con pocos movimientos (19 nuevos) ----------------
    // Campos extra que mira combat.js: rootCh/rootT (parálisis o retroceso: inmoviliza),
    // weakCh (baja el ataque del enemigo un 30 %), critBonus, superVs (×2 contra ese tipo),
    // boostCh + boost (a veces te sube stats), recoil (te quita % de vida), confuseEvery.
    // Roca
    { id: 'stealth-rock', name: 'Trampa Rocas', type: 'rock', kind: 'mine',
      desc: 'Siembra piedras afiladas a tu alrededor que estallan al pisarlas.',
      cd: 1.2, dmg: 20, count: 2, radius: 58, dur: 9, knock: 30 },
    { id: 'ancient-power', name: 'Poder Pasado', type: 'rock', kind: 'nova',
      desc: 'Rocas en todas direcciones. A veces te sube ataque, velocidad y defensa.',
      cd: 1.2, dmg: 10, speed: 240, count: 8, pierce: 1, life: 1.1, size: 9, boostCh: 0.12, boost: 'all' },
    { id: 'rock-tomb', name: 'Tumba Rocas', type: 'rock', kind: 'meteor',
      desc: 'Bloques de roca caen junto a los enemigos y los frenan mucho.',
      cd: 1.3, dmg: 17, count: 3, radius: 48, slow: 0.6 },
    // Dragón
    { id: 'dragon-breath', name: 'Dragoaliento', type: 'dragon', kind: 'cone',
      desc: 'Aliento de dragón en abanico. Puede paralizar.',
      cd: 0.7, dmg: 7, count: 7, arc: 0.9, speed: 360, life: 0.45, size: 7, rootCh: 0.12, rootT: 0.8 },
    { id: 'outrage', name: 'Enfado', type: 'dragon', kind: 'dash',
      desc: 'Embestidas furiosas sin parar. Cada pocas, te quedas confuso un momento.',
      cd: 0.55, dmg: 22, radius: 120, width: 44, knock: 50, confuseEvery: 6 },
    { id: 'draco-meteor', name: 'Cometa Draco', type: 'dragon', kind: 'meteor',
      desc: 'Lluvia de meteoros enorme y devastadora, pero tarda en recargar.',
      cd: 3.4, dmg: 36, count: 5, radius: 54, knock: 90 },
    // Hada
    { id: 'disarming-voice', name: 'Voz Cautivadora', type: 'fairy', kind: 'chain',
      desc: 'Una voz que salta de enemigo en enemigo. Nunca falla.',
      cd: 0.85, dmg: 18, count: 4, radius: 150 },
    { id: 'draining-kiss', name: 'Beso Drenaje', type: 'fairy', kind: 'aura',
      desc: 'Besa a los que tienes cerca y te curas con cada beso.',
      cd: 0.6, dmg: 9, radius: 74, drain: 1 },
    { id: 'play-rough', name: 'Carantoña', type: 'fairy', kind: 'dash',
      desc: 'Te lanzas a jugar con los enemigos. Puede bajarles el ataque.',
      cd: 0.8, dmg: 22, radius: 110, width: 40, knock: 60, weakCh: 0.3 },
    // Volador
    { id: 'air-slash', name: 'Tajo Aéreo', type: 'flying', kind: 'cone',
      desc: 'Cuchillas de aire en abanico. Pueden hacer retroceder.',
      cd: 0.75, dmg: 9, count: 6, arc: 1.0, speed: 420, life: 0.45, size: 7, pierce: 1, rootCh: 0.1, rootT: 0.5 },
    { id: 'brave-bird', name: 'Pájaro Osado', type: 'flying', kind: 'dash',
      desc: 'Embestida en picado brutal. Te hace un poco de daño a ti.',
      cd: 1.0, dmg: 32, radius: 150, width: 46, knock: 90, recoil: 0.03 },
    // Hielo
    { id: 'ice-shard', name: 'Canto Helado', type: 'ice', kind: 'projectile',
      desc: 'Esquirlas de hielo rapidísimas, casi sin recarga.',
      cd: 0.3, dmg: 10, speed: 520, count: 1, spread: 0.1, pierce: 0, life: 0.8, size: 6 },
    { id: 'freeze-dry', name: 'Liofilización', type: 'ice', kind: 'beam',
      desc: 'Rayo helado que frena. Hace el doble a los de tipo Agua.',
      cd: 1.1, dmg: 19, radius: 220, width: 32, slow: 0.5, superVs: 'water' },
    // Lucha
    { id: 'force-palm', name: 'Palmeo', type: 'fighting', kind: 'melee',
      desc: 'Palmada que empuja lejos y puede paralizar.',
      cd: 0.55, dmg: 17, radius: 48, arc: 1.3, knock: 140, rootCh: 0.2, rootT: 0.7 },
    { id: 'vacuum-wave', name: 'Onda Vacío', type: 'fighting', kind: 'aura',
      desc: 'Onda de choque a tu alrededor que golpea a todo lo que está pegado.',
      cd: 0.6, dmg: 10, radius: 80 },
    // Acero
    { id: 'bullet-punch', name: 'Puño Bala', type: 'steel', kind: 'dash',
      desc: 'Puñetazos rapidísimos con pequeños saltos.',
      cd: 0.35, dmg: 11, radius: 70, width: 30, knock: 30 },
    { id: 'steel-wing', name: 'Ala de Acero', type: 'steel', kind: 'boomerang',
      desc: 'Alas de acero que van y vuelven. A veces te suben la defensa.',
      cd: 0.95, dmg: 15, speed: 320, count: 1, radius: 220, size: 9, boostCh: 0.25, boost: 'def' },
    // Siniestro
    { id: 'night-slash', name: 'Tajo Umbrío', type: 'dark', kind: 'dash',
      desc: 'Tajo veloz entre las sombras. Mucha probabilidad de crítico.',
      cd: 0.75, dmg: 18, radius: 110, width: 36, knock: 40, critBonus: 0.3 },
    { id: 'snarl', name: 'Alarido Feroz', type: 'dark', kind: 'cone',
      desc: 'Rugido en abanico que frena y puede bajar el ataque de los enemigos.',
      cd: 0.7, dmg: 6, count: 7, arc: 1.1, speed: 340, life: 0.45, size: 7, slow: 0.35, weakCh: 0.25 }
  ];

  /*
   * Números por nivel de los movimientos de esta versión: [Nv1..Nv5, evolucionado].
   * Casilla = 32 unidades. (Equilibrados con los demás: ver el historial del proyecto.)
   *   flame-shield    dps, dur (s), r (casillas); evolucionado: vuln (+% daño recibido)
   *   thunder-strike  n rayos, dmg, r; evolucionado: link (daño/s de las descargas entre rayos)
   *   vampire-fang    n objetivos, dmg, heal (curación total por golpe), r; evolucionado: cd y pasivo
   */
  const TABLE = {
    'flame-shield': [
      { dps: 10, dur: 5,  r: 2.5 }, { dps: 14, dur: 7,  r: 3 }, { dps: 22, dur: 10, r: 4 },
      { dps: 32, dur: 18, r: 4 },   { dps: 45, dur: 30, r: 5 }, { dps: 60, dur: 50, r: 5, vuln: 0.15 }
    ],
    'thunder-strike': [
      { n: 4, dmg: 20, r: 8 },  { n: 5, dmg: 20, r: 8 },  { n: 5, dmg: 28, r: 8 },
      { n: 7, dmg: 30, r: 10 }, { n: 10, dmg: 35, r: 10 }, { n: 12, dmg: 40, r: 11, link: 50 }
    ],
    'vampire-fang': [
      { n: 5, dmg: 14, heal: 2, r: 5 },  { n: 5, dmg: 17, heal: 3, r: 5 },  { n: 8, dmg: 25, heal: 5, r: 5 },
      { n: 13, dmg: 38, heal: 7, r: 7 }, { n: 18, dmg: 45, heal: 9, r: 7 }, { n: 12, dmg: 35, heal: 8, r: 7, cd: 1.0, passive: true }
    ],
    // n flechas, d1 al primero, d2 a los perforados, pierce saltos, r alcance; evolucionado: repeat (puede volver a uno ya golpeado)
    'psy-arrow': [
      { n: 1, d1: 14, d2: 8, pierce: 4, r: 16 },  { n: 1, d1: 20, d2: 11, pierce: 4, r: 16 },
      { n: 2, d1: 20, d2: 11, pierce: 4, r: 16 },  { n: 2, d1: 28, d2: 16, pierce: 5, r: 16 },
      { n: 2, d1: 34, d2: 20, pierce: 5, r: 16 },  { n: 3, d1: 34, d2: 34, pierce: 6, r: 16, repeat: true }
    ],
    // ---- 2026-10-15 ----
    // dps de veneno, dur (s) del veneno y el frenado, r (casillas), slow (frenado), pud (charcos:
    // 1 frenan, 2 también envenenan), spread (s que deja charcos quien pisa uno); evolucionado: over
    // (la lluvia cae sobre cada enemigo del radio y deja charcos bajo ellos)
    'acid-rain': [
      { dps: 6,  dur: 5,  r: 6, slow: 0.25 },          { dps: 9,  dur: 9,  r: 7, slow: 0.25 },
      { dps: 14, dur: 15, r: 7, slow: 0.25, pud: 1 },  { dps: 20, dur: 20, r: 8, slow: 0.3, pud: 2 },
      { dps: 26, dur: 28, r: 8, slow: 0.3, pud: 2, spread: 8 },
      { dps: 50, dur: 28, r: 12, slow: 0.3, pud: 2, spread: 8, over: true }
    ],
    // dmg por puñetazo, crit (probabilidad, se suma a la tuya), every (crítico seguro cada N), r,
    // knock (empuja 3 casillas), bleed (daño/s hasta que muera, a los que reciben un crítico);
    // evolucionado: n (golpea a los n más cercanos), cmul (multiplicador del crítico)
    'lee-fist': [
      { dmg: 16, crit: 0.10, every: 9, r: 5 },  { dmg: 20, crit: 0.15, every: 8, r: 5 },
      { dmg: 28, crit: 0.225, every: 7, r: 5, knock: 600 },  { dmg: 38, crit: 0.30, every: 6, r: 7, knock: 600 },
      { dmg: 38, crit: 0.40, every: 5, r: 7, knock: 600, bleed: 6 },
      { dmg: 40, crit: 0.50, every: 5, r: 10, knock: 600, bleed: 6, cmul: 1.8, n: 12, cd: 0.55 }
    ],
    // Para el Pokémon más grande (×0,4 el más pequeño): armor (menos daño al chocar), red (reducción
    // de todo el daño), hp (vida extra total); evolucionado: field (los enemigos normales no te tocan)
    'heavyweight': [
      { armor: 0.10, red: 0.10, hp: 0 },   { armor: 0.15, red: 0.15, hp: 0 },
      { armor: 0.25, red: 0.225, hp: 50 }, { armor: 0.38, red: 0.30, hp: 50 },
      { armor: 0.50, red: 0.40, hp: 110 }, { armor: 0.70, red: 0.45, hp: 190, field: true }
    ],
    // dmg, n lanzas, pierce, size, r; evolucionado: radial (8 direcciones), split (al perforar salen
    // 2 lanzas más pequeñas que golpean a 2 como mucho), sdmg (su daño)
    'ghost-spear': [
      { dmg: 26, n: 1, pierce: 0, size: 1, r: 10 },    { dmg: 32, n: 2, pierce: 0, size: 1, r: 10 },
      { dmg: 40, n: 2, pierce: 1, size: 1, r: 10 },    { dmg: 50, n: 2, pierce: 1, size: 1.15, r: 12 },
      { dmg: 60, n: 3, pierce: 2, size: 1.15, r: 12 },
      { dmg: 60, n: 8, pierce: 4, size: 1.15, r: 12, radial: true, split: 2, sdmg: 30 }
    ],
    // dmg, n árboles, size (radio del golpe ×54), r; zone (deja una zona que frena 3 s);
    // evolucionado: hasta n árboles (uno por enemigo), spikes (pinchos: 2º golpe), root (s inmovilizados)
    'nature-tree': [
      { dmg: 30, n: 1, size: 1, r: 12 },       { dmg: 40, n: 1, size: 1.25, r: 12 },
      { dmg: 46, n: 2, size: 1.25, r: 12 },    { dmg: 54, n: 2, size: 1.25, r: 12, zone: true },
      { dmg: 64, n: 3, size: 1.25, r: 12, zone: true },
      { dmg: 80, n: 12, size: 1.25, r: 15, zone: true, spikes: 40, root: 2, cd: 2.6 }
    ],
    // ---- 2026-10-16 (tabla del dueño ×2, como los de 2026-10-15) ----
    // dmg por corazón, n corazones, r (casillas), bounce (rebotes a otro enemigo a 6 casillas),
    // bmul (multiplicador del PRIMER rebote); evolucionado: immune (inmune a los rayos de los enemigos)
    'formless-art': [
      { dmg: 16, n: 1, r: 10, bounce: 0, bmul: 1 },  { dmg: 24, n: 1, r: 12, bounce: 0, bmul: 1 },
      { dmg: 34, n: 2, r: 12, bounce: 0, bmul: 1 },  { dmg: 46, n: 2, r: 12, bounce: 1, bmul: 1 },
      { dmg: 56, n: 3, r: 12, bounce: 1, bmul: 2 },
      { dmg: 56, n: 5, r: 14, bounce: 3, bmul: 3, immune: true, cd: 1.0 }
    ],
    // dmg, n tornados, pierce (atraviesan), size, r; launch (s en el aire, inmovilizado);
    // evolucionado: dot (daño/s mientras está en el aire), slap (bofetada de la mano azul al caer)
    'raging-tornado': [
      { dmg: 14, n: 1, pierce: false, size: 1, r: 10 },   { dmg: 22, n: 2, pierce: true, size: 1, r: 10 },
      { dmg: 32, n: 3, pierce: true, size: 1, r: 10 },    { dmg: 42, n: 3, pierce: true, size: 1.4, r: 10 },
      { dmg: 54, n: 3, pierce: true, size: 1.4, r: 10, launch: 1 },
      { dmg: 54, n: 3, pierce: true, size: 1.4, r: 10, launch: 3, dot: 40, slap: 70 }
    ],
    // Tormenta: sdps (daño/s), sr (casillas). Cuchilla: bdmg, bn, bsize, bpierce, r (casillas), bcd (s);
    // evolucionado: knock + bleed (sangrado/s durante 3 s), radial (8 direcciones), split (se parte a ±90°)
    'blade-storm': [
      { sdps: 8,  sr: 3, bdmg: 18, bn: 1, bsize: 1,   bpierce: 0, r: 9, bcd: 1 },
      { sdps: 10, sr: 4, bdmg: 26, bn: 1, bsize: 1.3, bpierce: 0, r: 9, bcd: 1 },
      { sdps: 12, sr: 4, bdmg: 34, bn: 2, bsize: 1.3, bpierce: 0, r: 9, bcd: 1 },
      { sdps: 14, sr: 5, bdmg: 46, bn: 2, bsize: 1.3, bpierce: 3, r: 9, bcd: 1 },
      { sdps: 16, sr: 5, bdmg: 56, bn: 3, bsize: 1.3, bpierce: 3, r: 9, bcd: 1 },
      { sdps: 16, sr: 6, bdmg: 56, bn: 8, bsize: 1.3, bpierce: 3, r: 9, bcd: 1.2, knock: 60, bleed: 8, radial: true, split: true }
    ],
    // dmg por rayo, n rayos, w (ancho), r (casillas), crit (se suma al tuyo), back (rayo hacia atrás
    // al acertar); evolucionado: dps (rayo continuo, cada cd s), slow, hole (prob. de agujero negro
    // al matar), holeR (casillas que atrae), holeDmg (explosión a los 4 s)
    // ---- 2026-10-16: exclusivos de los personajes originales ----
    // (2026-10-16, el dueño: «son flojos») Subidos para quedar cerca de Puño Lee en la prueba fija
    // (6 s, minuto 7: ~250 a Nv.1, ~1200 a Nv.5, ~3000 evolucionado).
    // Didi: dmg del puñetazo, sdmg salpicadura, sr (casillas) de salpicadura, r alcance, n enemigos; evo: knock, slow
    'foam-punch': [
      { dmg: 50, sdmg: 16, sr: 2.2, r: 5, n: 1 },   { dmg: 62, sdmg: 20, sr: 2.6, r: 5, n: 1 },
      { dmg: 76, sdmg: 24, sr: 2.6, r: 5.5, n: 2 }, { dmg: 92, sdmg: 28, sr: 3, r: 5.5, n: 2 },
      { dmg: 110, sdmg: 34, sr: 3, r: 6, n: 3 },
      { dmg: 140, sdmg: 52, sr: 4.2, r: 7, n: 3, knock: 120, slow: 0.4, cd: 0.55 }
    ],
    // Héroe: dmg base, per (daño extra por enemigo cerca), cap (hasta cuántos cuenta), r (casillas), knock;
    // evo: root (inmoviliza s a los normales) e inv (s invulnerable)
    'scaredy-burst': [
      { dmg: 28, per: 4, cap: 12, r: 3.2, knock: 140, cd: 1.4 }, { dmg: 40, per: 5, cap: 12, r: 3.4, knock: 160, cd: 1.3 },
      { dmg: 48, per: 6, cap: 14, r: 3.6, knock: 170, cd: 1.2 }, { dmg: 60, per: 7, cap: 14, r: 3.8, knock: 180, cd: 1.1 },
      { dmg: 72, per: 8, cap: 16, r: 4, knock: 190, cd: 1.0 },
      { dmg: 110, per: 12, cap: 18, r: 4.6, knock: 230, root: 0.7, inv: 0.5, cd: 0.8 }
    ],
    // Turbo Abuela: dmg (sombra cada 0,3 s, y el tramo recorrido de una sombra a la siguiente), life (s), ir (casillas),
    // haste (velocidad extra); quieta, una onda alrededor (×0,6); evo: boom (cada sombra estalla al desaparecer)
    'turbo-dash': [
      { dmg: 6, life: 0.9, ir: 1.6, haste: 0.12 },  { dmg: 8, life: 1.1, ir: 1.7, haste: 0.14 },
      { dmg: 11, life: 1.2, ir: 1.8, haste: 0.17 }, { dmg: 14, life: 1.3, ir: 2.0, haste: 0.20 },
      { dmg: 18, life: 1.4, ir: 2.1, haste: 0.22 },
      { dmg: 24, life: 1.8, ir: 2.5, haste: 0.28, boom: 50 }
    ],
    // Tom: dmg por zarpazo, n zarpazos, r alcance, chain (saltos al derribar); evo: bleed (sangrado/s)
    'cat-pounce': [
      { dmg: 24, n: 3, r: 5.5, chain: 0 }, { dmg: 28, n: 3, r: 5.5, chain: 1 },
      { dmg: 32, n: 3, r: 6, chain: 1 },   { dmg: 38, n: 4, r: 6, chain: 2 },
      { dmg: 46, n: 4, r: 6.5, chain: 2 },
      { dmg: 58, n: 5, r: 7.5, chain: 4, bleed: 14, cd: 0.65 }
    ],
    // Lika: dmg, r alcance (casillas), w ancho, poison (acumulaciones); evo: n lenguas, pull (atrae hacia ti)
    'tongue-lash': [
      { dmg: 40, r: 6.5, w: 22, poison: 1, n: 1 }, { dmg: 50, r: 7, w: 22, poison: 2, n: 1 },
      { dmg: 64, r: 7, w: 22, poison: 2, n: 1 },   { dmg: 80, r: 8, w: 26, poison: 3, n: 1 },
      { dmg: 90, r: 8, w: 26, poison: 3, n: 1 },
      { dmg: 125, r: 9.5, w: 34, poison: 4, n: 3, pull: 120, cd: 0.7 }
    ],
    // Panda: dmg por pregunta, n enemigos, r alcance, stun (s que se quedan pensando); evo: all (todos los del radio)
    'curious-question': [
      { dmg: 40, n: 2, r: 6, stun: 0.35 }, { dmg: 55, n: 3, r: 6, stun: 0.35 },
      { dmg: 70, n: 3, r: 6.5, stun: 0.45 }, { dmg: 88, n: 4, r: 6.5, stun: 0.45 },
      { dmg: 110, n: 5, r: 7, stun: 0.55 },
      { dmg: 120, n: 99, r: 7.5, stun: 0.8, all: true, cd: 1.0 }
    ],
    // Boniato: dmg por bola, n bolas, pierce (atraviesa), size, r alcance; evo: zap (descarga a los de alrededor al golpear)
    'potato-roll': [
      { dmg: 40, n: 1, pierce: 3, size: 1.2, r: 8 }, { dmg: 44, n: 2, pierce: 3, size: 1.2, r: 8 },
      { dmg: 52, n: 2, pierce: 5, size: 1.4, r: 8.5 }, { dmg: 62, n: 3, pierce: 5, size: 1.4, r: 8.5 },
      { dmg: 76, n: 3, pierce: 8, size: 1.6, r: 9 },
      { dmg: 110, n: 5, pierce: 99, size: 2, r: 10, zap: 40, cd: 0.8 }
    ],
    'destruction-beam': [
      { dmg: 24, n: 1, w: 30, r: 10 },   { dmg: 30, n: 1, w: 44, r: 10 },   { dmg: 42, n: 2, w: 44, r: 10 },
      { dmg: 50, n: 2, w: 44, r: 11.5, crit: 0.15 },
      { dmg: 60, n: 3, w: 44, r: 11.5, crit: 0.15, back: true },
      // (2026-10-16, feedback: el rayo púrpura era demasiado largo: 11,5 → 6,9 casillas, el 60 %)
      { dps: 140, n: 3, w: 48, r: 6.9, crit: 0.15, back: true, slow: 0.45, hole: 0.15, holeR: 7, holeDmg: 80, cd: 0.2 }
    ],
    // ---- apoyo (2026-10-15): cd en s; heal = fracción de la vida máxima ----
    'recover': [
      { cd: 12, heal: 0.15 }, { cd: 11, heal: 0.18 }, { cd: 10, heal: 0.21 }, { cd: 9, heal: 0.24 }, { cd: 8, heal: 0.28 },
      { cd: 7, heal: 0.30, cleanse: true }
    ],
    // dur s de pantalla; cut = parte del daño que para
    'light-screen': [
      { cd: 15, dur: 4, cut: 0.5 }, { cd: 14, dur: 4.5, cut: 0.5 }, { cd: 13, dur: 5, cut: 0.55 }, { cd: 12, dur: 5.5, cut: 0.55 }, { cd: 11, dur: 6, cut: 0.6 },
      { cd: 10, dur: 7, cut: 0.65 }
    ],
    // n = enemigos a menos de 90 px para saltar (o vida < 40 %); dur s invulnerable
    'protect': [
      { cd: 20, dur: 1.5, n: 5 }, { cd: 18, dur: 1.6, n: 5 }, { cd: 16, dur: 1.8, n: 4 }, { cd: 15, dur: 2, n: 4 }, { cd: 14, dur: 2.2, n: 4 },
      { cd: 12, dur: 2.5, n: 3, blast: true }
    ],
    // r = radio para curar compañeros
    'wish': [
      { cd: 18, heal: 0.25, r: 200 }, { cd: 17, heal: 0.28, r: 200 }, { cd: 16, heal: 0.31, r: 200 }, { cd: 15, heal: 0.34, r: 200 }, { cd: 14, heal: 0.38, r: 200 },
      { cd: 12, heal: 0.40, r: 280 }
    ],
    // max = acumulaciones; amt por acumulación; dur s
    'calm-mind': [
      { cd: 10, dur: 6, max: 1, amt: 0.1 }, { cd: 10, dur: 7, max: 1, amt: 0.1 }, { cd: 9, dur: 7, max: 2, amt: 0.1 }, { cd: 9, dur: 8, max: 2, amt: 0.1 }, { cd: 8, dur: 8, max: 3, amt: 0.1 },
      { cd: 7, dur: 8, max: 3, amt: 0.12 }
    ],
    'life-dew': [
      { cd: 10, heal: 0.10, r: 200 }, { cd: 9.5, heal: 0.11, r: 200 }, { cd: 9, heal: 0.12, r: 200 }, { cd: 8.5, heal: 0.13, r: 200 }, { cd: 8, heal: 0.15, r: 200 },
      { cd: 7, heal: 0.16, r: 280 }
    ],
    // sleep = s dormido; con vida < 30 %
    'rest': [
      { cd: 40, sleep: 2 }, { cd: 36, sleep: 2 }, { cd: 32, sleep: 1.8 }, { cd: 28, sleep: 1.6 }, { cd: 25, sleep: 1.5 },
      { cd: 22, sleep: 1.2, guard: true }
    ],
    // cd = cada cuánto limpia; red = reducción de daño (evolucionado)
    'safeguard': [
      { cd: 30 }, { cd: 27 }, { cd: 24 }, { cd: 21 }, { cd: 18 },
      { cd: 15, red: 0.1 }
    ]
  };
  /** Fila de TABLE para una instancia (según su nivel y si ha evolucionado). */
  const stat = m => (TABLE[m.id] ? TABLE[m.id][m.evolved ? 5 : Math.max(0, Math.min(4, m.lvl - 1))] : null);
  /** ¿Funciona aunque no sea el movimiento activo? */
  const isPassive = m => m.kind === 'flameshield' || m.kind === 'bulk' || m.kind === 'support' || !!(m.evolved && stat(m) && stat(m).passive);

  // Cuerpo a cuerpo (12-10-2026): +20 % de daño y +25 % de alcance y de arco
  // (y -25 % de daño recibido mientras sea tu ataque activo, en player.js).
  // Pegaban bien, pero había que arriesgar mucho más que con los de distancia.
  for (const m of RAW) {
    if (m.kind !== 'melee') continue;
    m.dmg = Math.round(m.dmg * 1.2);
    m.radius = Math.round(m.radius * 1.25);
    if (m.arc) m.arc = Math.min(3, +(m.arc * 1.25).toFixed(2));
  }

  // Equilibrio (15-10-2026), según una prueba fija (30 muñecos quietos y un jefe, mismo
  // Pokémon): estos se quedaban muy por debajo de la media tanto en grupo como contra
  // un jefe. Los rayos, ×1,5; algunos disparos y torretas, ×1,3.
  const DMG_BUFF = { 'hydro-pump': 1.5, 'ice-beam': 1.5, 'flash-cannon': 1.5, 'psybeam': 1.5,
                     'poison-sting': 1.3, 'sludge': 1.3, 'bonemerang': 1.3, 'substitute': 1.3, 'will-o-wisp': 1.3 };
  for (const m of RAW) if (DMG_BUFF[m.id]) m.dmg = Math.round(m.dmg * DMG_BUFF[m.id]);

  // Pool de movimientos por tipo. El pool `normal` lo tienen todos.
  const POOL = {};
  for (const m of RAW) if (!m.only) (POOL[m.type] = POOL[m.type] || []).push(m.id);   // (los exclusivos, fuera)

  const BY_ID = {};
  for (const m of RAW) {
    m.ups = LADDERS[m.kind];
    m.maxLvl = m.ups.length + 1;
    BY_ID[m.id] = m;
  }

  /** Movimientos que este Pokémon puede aprender (sus tipos + normal). */
  // Movimientos normales creados para esta versión: sólo para Pokémon de tipo normal (2026-10-16,
  // feedback). Los normales de siempre (Danza Espada, Fortaleza, Agilidad...) siguen para todos.
  const NORMAL_OWN = new Set(['heavyweight', 'destruction-beam']);
  function poolFor(mon) {
    const isNormal = mon.types.includes('normal');
    const ids = new Set(POOL.normal.filter(id => isNormal || !NORMAL_OWN.has(id)));
    for (const t of mon.types) for (const id of (POOL[t] || [])) ids.add(id);
    return [...ids];
  }

  /**
   * Instancia de movimiento en una run: los números base de `def` con todas
   * las mejoras de la escalera hasta `lvl` ya aplicadas.
   */
  function instance(id, lvl = 1) {
    const def = BY_ID[id];
    const s = Object.assign({}, def, { id, def, lvl, t: 0 });
    delete s.ups;
    for (let i = 0; i < lvl - 1; i++) applyMods(s, def.ups[i].m);
    return s;
  }

  const MULT = ['dmg', 'cd', 'speed', 'radius', 'dur', 'amount', 'arc', 'width', 'spread', 'life', 'size', 'rate'];
  const ADD = ['count', 'pierce', 'stacks'];

  function applyMods(s, m) {
    for (const k in m) {
      if (MULT.includes(k) && s[k] != null) s[k] *= m[k];
      else if (ADD.includes(k)) s[k] = (s[k] || 0) + m[k];
      else s[k] = m[k];
    }
  }

  /** Sube de nivel una instancia ya creada. */
  function levelUp(s) {
    if (s.lvl >= s.def.maxLvl) return false;
    applyMods(s, s.def.ups[s.lvl - 1].m);
    s.lvl++;
    return true;
  }

  /** Texto de la próxima mejora, para la carta de subida de nivel. */
  function nextUpText(s) {
    if (s.lvl >= s.def.maxLvl) return null;
    return s.def.upTexts ? s.def.upTexts[s.lvl - 1] : s.def.ups[s.lvl - 1].t;      // (apoyo: texto propio)
  }

  /** Movimiento inicial según el tipo principal (si el Pokémon no trae uno). */
  const START = {
    fire: 'ember', water: 'water-gun', grass: 'vine-whip', electric: 'thunder-shock',
    psychic: 'confusion', poison: 'sludge', ground: 'mud-shot', flying: 'gust',
    bug: 'bug-bite', rock: 'rock-throw', ice: 'ice-beam', fighting: 'karate-chop',
    ghost: 'shadow-ball', dragon: 'dragon-rage', fairy: 'fairy-wind', steel: 'metal-claw',
    dark: 'bite', normal: 'tackle'
  };
  function startFor(mon) {
    if (mon.start && BY_ID[mon.start]) return mon.start;
    for (const t of mon.types) if (START[t]) return START[t];
    return 'tackle';
  }

  // ---------------- evolución de movimientos ----------------
  /*
   * Un movimiento al NIVEL MÁXIMO evoluciona si en esa run has cogido alguna
   * vez la mejora de su condición (`needs`, un id de LevelUp.STATS). Sale una
   * carta dorada. Los potenciadores (buff) no evolucionan.
   */
  const NEED_NAME = { hp: 'Vigor', atk: 'Potencia', spd: 'Carrera', cd: 'Reflejos', def: 'Coraza',
                      rgn: 'Síntesis', mag: 'Imán', xp: 'Aprendizaje' };
  const EVO = {
    'tackle': ['Derribo', 'hp'],             'quick-attack': ['Velocidad Extrema', 'spd'],
    'body-slam': ['Gigaimpacto', 'atk'],     'hyper-voice': ['Alboroto', 'cd'],
    'ember': ['Llamarada', 'atk'],           'flamethrower': ['Sofoco', 'cd'],
    'fire-spin': ['Fuego Sagrado', 'rgn'],   'heat-wave': ['Erupción', 'hp'],
    'water-gun': ['Escaldar', 'atk'],        'bubble': ['Surf', 'spd'],
    'hydro-pump': ['Hidrocañón', 'atk'],     'vine-whip': ['Latigazo', 'atk'],
    'razor-leaf': ['Lluevehojas', 'cd'],     'leaf-storm': ['Danza Pétalo', 'rgn'],
    'giga-drain': ['Planta Feroz', 'hp'],    'thunder-shock': ['Trueno', 'atk'],
    'discharge': ['Campo Eléctrico', 'def'], 'thunderbolt': ['Electrocañón', 'cd'],
    'confusion': ['Psicocarga', 'cd'],       'psybeam': ['Premonición', 'atk'],
    'psychic': ['Vasta Fuerza', 'mag'],      'sludge': ['Bomba Lodo', 'atk'],
    'poison-sting': ['Puya Nociva', 'spd'],  'toxic': ['Gas Venenoso', 'rgn'],
    'mud-shot': ['Tierra Viva', 'atk'],      'bulldoze': ['Terremoto', 'atk'],
    'gust': ['Vendaval', 'spd'],             'wing-attack': ['Ala Mortífera', 'atk'],
    'bug-bite': ['Tijera X', 'atk'],         'string-shot': ['Red Viscosa', 'cd'],
    'bug-buzz': ['Enjambre', 'rgn'],         'rock-throw': ['Roca Afilada', 'atk'],
    'rock-slide': ['Joya de Luz', 'cd'],    'ice-beam': ['Ventisca', 'atk'],
    'powder-snow': ['Viento Hielo', 'spd'],  'karate-chop': ['A Bocajarro', 'atk'],
    'aura-sphere': ['Onda Certera', 'cd'],   'lick': ['Puño Sombra', 'atk'],
    'shadow-ball': ['Golpe Fantasma', 'cd'], 'dragon-rage': ['Pulso Dragón', 'atk'],
    'fairy-wind': ['Fuerza Lunar', 'atk'],   'dazzling-gleam': ['Campo de Niebla', 'rgn'],
    'metal-claw': ['Cabeza de Hierro', 'atk'], 'flash-cannon': ['Rayo Metálico', 'def'],
    'bite': ['Triturar', 'atk'],             'dark-pulse': ['Alarido', 'spd'],
    'night-shade': ['Pesadilla', 'rgn'],
    'bonemerang': ['Ataque Óseo', 'atk'],    'psycho-cut': ['Psicocolmillo', 'cd'],
    'spikes': ['Fisura', 'atk'],             'toxic-spikes': ['Lanza Mugre', 'rgn'],
    'hail': ['Alud', 'cd'],                  'meteor-mash': ['Bomba Imán', 'atk'],
    'will-o-wisp': ['Infierno', 'cd'],       'substitute': ['Doble Equipo', 'def'],
    'aerial-ace': ['Acróbata', 'spd'],       'flame-wheel': ['Envite Ígneo', 'spd'],
    'bubble-beam': ['Acua Cola', 'atk'],     'hex': ['Poltergeist', 'mag'],
    'flame-shield': ['Escudo Ígneo', 'def'], 'thunder-strike': ['Tormenta Eléctrica', 'atk'],
    'vampire-fang': ['Colmillo Eterno', 'rgn'], 'psy-arrow': ['Flecha Psíquica Eterna', 'cd'],
    'acid-rain': ['Nanolluvia', 'rgn'],      'lee-fist': ['Puño Furioso', 'atk'],
    'heavyweight': ['Shaq', 'hp'],           'ghost-spear': ['Lanza Sombría', 'cd'],
    'nature-tree': ['¡Árbol Va!', 'mag'],
    // 2026-10-16
    'formless-art': ['Vuelo Celestial', 'spd'],  'raging-tornado': ['Perro Loco', 'atk'],
    'blade-storm': ['Cruzada', 'def'],           'destruction-beam': ['Poder Púrpura', 'atk'],
    'foam-punch': ['Gran Ola Esponjosa', 'atk'], 'scaredy-burst': ['Valor de Héroe', 'def'],
    'turbo-dash': ['Turbo Máximo', 'spd'],       'cat-pounce': ['Gato Implacable', 'atk'],
    'tongue-lash': ['Lengua Mortal', 'cd'],
    'curious-question': ['Cien Mil Porqués', 'cd'], 'potato-roll': ['Estampida de Boniatos', 'atk'],
    // apoyo (2026-10-15)
    'recover': ['Luz Lunar', 'rgn'],         'light-screen': ['Velo Aurora', 'def'],
    'protect': ['Escudo Real', 'def'],       'wish': ['Deseo Milenario', 'hp'],
    'calm-mind': ['Paz Absoluta', 'atk'],    'life-dew': ['Lluvia Vital', 'rgn'],
    'rest': ['Sueño Profundo', 'hp'],        'safeguard': ['Guardia Divina', 'def'],
    // 2026-10-15 · los 19 nuevos
    'stealth-rock': ['Campo de Agujas', 'cd'],     'ancient-power': ['Meteoro Ancestral', 'atk'],
    'rock-tomb': ['Mausoleo', 'def'],              'dragon-breath': ['Aliento Real', 'cd'],
    'outrage': ['Furia Ancestral', 'hp'],          'draco-meteor': ['Lluvia de Cometas', 'atk'],
    'disarming-voice': ['Canto Encantador', 'cd'], 'draining-kiss': ['Beso Vital', 'rgn'],
    'play-rough': ['Juego Salvaje', 'spd'],        'air-slash': ['Tajo Huracán', 'spd'],
    'brave-bird': ['Ave Divina', 'hp'],            'ice-shard': ['Lanzas de Hielo', 'cd'],
    'freeze-dry': ['Liofilización Total', 'atk'],  'force-palm': ['Palma Celestial', 'atk'],
    'vacuum-wave': ['Onda de Vacío', 'def'],       'bullet-punch': ['Ráfaga de Balas', 'spd'],
    'steel-wing': ['Ala de Acero Pura', 'def'],    'night-slash': ['Tajo Abismal', 'atk'],
    'snarl': ['Rugido Abismal', 'mag']
  };
  // Lo que gana al evolucionar, según cómo funcione.
  const EVO_MODS = {
    projectile: { t: '×1,8 daño, +2 proyectiles, +2 perforación y más grandes', m: { dmg: 1.8, count: 2, pierce: 2, size: 1.3, spread: 1.1 } },
    melee:      { t: '×1,9 daño, más alcance y golpea en 360°', m: { dmg: 1.9, radius: 1.3, arc: 9 } },
    beam:       { t: '×1,8 daño, rayo un 50% más grueso y más largo', m: { dmg: 1.8, width: 1.5, radius: 1.2, cd: 0.85 } },
    orbit:      { t: '+2 orbes, ×1,7 daño y más radio', m: { count: 2, dmg: 1.7, radius: 1.15 } },
    nova:       { t: '+6 proyectiles, ×1,6 daño y +1 perforación', m: { count: 6, dmg: 1.6, pierce: 1 } },
    aura:       { t: '×1,8 daño y un 35% más de radio', m: { dmg: 1.8, radius: 1.35 } },
    boomerang:  { t: '×1,8 daño, +1 bumerán y más alcance', m: { dmg: 1.8, count: 1, radius: 1.2, size: 1.2 } },
    chain:      { t: '×1,7 daño y +3 saltos', m: { dmg: 1.7, count: 3, radius: 1.2 } },
    mine:       { t: '×1,8 daño, +2 minas y explosión más grande', m: { dmg: 1.8, count: 2, radius: 1.25 } },
    meteor:     { t: '×1,7 daño, +2 meteoros y más radio', m: { dmg: 1.7, count: 2, radius: 1.2 } },
    turret:     { t: '×1,8 daño, +1 a la vez y dispara más rápido', m: { dmg: 1.8, count: 1, rate: 0.8 } },
    dash:       { t: '×1,9 daño, más distancia y menos recarga', m: { dmg: 1.9, radius: 1.25, cd: 0.8 } },
    trail:      { t: '×1,8 daño, charcos más grandes y duraderos', m: { dmg: 1.8, radius: 1.25, dur: 1.3 } },
    cone:       { t: '×1,7 daño, +4 disparos y +1 perforación', m: { dmg: 1.7, count: 4, pierce: 1 } },
    flameshield: { t: '60 de daño/s durante 50 s; los quemados reciben +15% de daño', m: {} },
    lightning:   { t: '12 rayos de 40 y descargas entre ellos (+50 de daño/s)', m: {} },
    drain:       { t: 'Pasa a ser PASIVO: cada 1 s muerde a 12 (35 de daño) y te cura 8', m: {} },
    psyarrow:    { t: 'Todos reciben 34, +1 flecha, +1 perforación y puede volver a perforar al mismo', m: {} },
    acidrain:    { t: 'Llueve sobre cada enemigo a 12 casillas (50 de daño/s) y deja charcos bajo ellos', m: {} },
    fist:        { t: 'Golpea a los 12 más cercanos a 10 casillas; 50% de crítico y los críticos hacen ×1,8', m: {} },
    bulk:        { t: 'Campo de fuerza: los enemigos normales no pueden tocarte; armadura 70%, reducción 45% y +80 de vida', m: {} },
    spear:       { t: '8 lanzas en todas direcciones que perforan 4; cada vez que perforan salen 2 más', m: {} },
    treefall:    { t: 'Un árbol por cada enemigo cercano (hasta 12), pinchos de +40 e inmoviliza 2 s', m: {} },
    hearts:      { t: 'Inmune a los rayos de los enemigos; +2 corazones, +2 casillas, +2 rebotes y el rebote hace ×3', m: {} },
    tornado:     { t: 'Daño continuo mientras están en el aire, +2 s en el aire y al caer una mano azul les da una bofetada de 70', m: {} },
    bladestorm:  { t: 'La tormenta empuja y hace sangrar (+1 casilla); cuchillas en 8 direcciones que se parten en dos a ±90° al atravesar al primero (y esas dos, otra vez)', m: {} },
    foampunch:   { t: 'Gran ola: +2 casillas de salpicadura que empuja y frena; más daño y menos recarga', m: {} },
    scare:       { t: 'Inmoviliza 0,7 s a los normales y te vuelves invulnerable 0,5 s; +12 por enemigo (hasta 18), cada 0,8 s', m: {} },
    afterimage:  { t: 'Sombras más grandes y duraderas que estallan (50) al desaparecer; +28% de velocidad', m: {} },
    pounce:      { t: '5 zarpazos que hacen sangrar (14/s); si lo derriba, salta hasta a 4 enemigos', m: {} },
    whip:        { t: 'Tres lenguas a la vez que atraen a los enemigos hacia ti y envenenan ×4; mucho más daño', m: {} },
    question:    { t: 'Pregunta a TODOS los enemigos del radio a la vez y se quedan pensando 0,8 s', m: {} },
    roll:        { t: '5 bolas enormes que lo atraviesan todo y electrocutan (40) a los de alrededor al golpear', m: {} },
    dbeam:       { t: 'Rayo púrpura continuo mientras haya enemigos: daña y frena; al matar, 15% de dejar un agujero negro que atrae (7 casillas) 4 s y estalla (80)', m: {} },
    support:     { t: 'Más fuerte y más a menudo', m: {} }       // (el texto de verdad: def.evoText)
  };

  // Al evolucionar casi no ganaban nada (la prueba fija daba lo mismo o menos que al Nv.5):
  // daño extra para que la evolución se note (como las demás, ~×2).
  const EVO_BONUS = { 'thunder-shock': 2.0, 'flamethrower': 2.2, 'heat-wave': 1.7, 'bulldoze': 1.8, 'meteor-mash': 1.8 };

  /** ¿Puede evolucionar ya? → { name, needs, needName, text, ready } o null */
  function evoInfo(m, statsTaken) {
    const e = EVO[m.id];
    if (!e || m.evolved || m.lvl < m.def.maxLvl || !EVO_MODS[m.kind]) return null;
    const [name, needs] = e;
    return { name, needs, needName: NEED_NAME[needs], text: m.def.evoText || EVO_MODS[m.kind].t,
             ready: !!(statsTaken && statsTaken[needs]) };
  }

  /** Evoluciona una instancia (cambia nombre y potencia; sigue siendo del mismo tipo). */
  function evolve(m) {
    const e = EVO[m.id];
    if (!e || m.evolved) return false;
    applyMods(m, EVO_MODS[m.kind].m);
    if (EVO_BONUS[m.id] && m.dmg) m.dmg *= EVO_BONUS[m.id];
    m.baseName = m.name;
    m.name = e[0];
    m.evolved = true;
    return true;
  }

  G.Moves = { ALL: RAW, BY_ID, POOL, poolFor, instance, levelUp, nextUpText, startFor,
              EVO, EVO_MODS, NEED_NAME, evoInfo, evolve, TABLE, stat, isPassive };
})();
