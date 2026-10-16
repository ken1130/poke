/* ============ custom.js — personajes originales (2026-10-16) ============
 * Personajes creados para este juego (no son Pokémon). Salen en la pestaña «Otros» del
 * Pokédex y NO cuentan para el total del Pokédex (966), ni para las regiones, logros o
 * misiones de colección (todo eso sigue usando G.DEX, que no los incluye).
 *
 * Para añadir uno, una entrada como esta (cuando tenga su sprite y su ficha):
 *   { id: 'c001', name: 'Nombre', types: ['fire'], hp: 100, spd: 100, atk: 1,
 *     desc: 'Quién es y qué hace.' }
 * (Para que se pueda jugar con él hará falta además su hoja de sprites y engancharlo
 * en el gacha / compañero: queda para cuando exista el primero.)
 */
G.CUSTOM = [
  // Hojas en assets/pokemon/{dex}/ (hechas con tools/custom_sprites/). dex >= 10001 para no chocar con la Pokédex.
  { dex: 10001, id: 'c001', name: 'Panda', types: ['normal'], hp: 100, spd: 100, atk: 1.10, rarity: 2, bst: 400, gen: 0, starter: false, custom: true,
    start: 'tackle', desc: 'Un panda curioso que pregunta de todo.',
    sprite: {"s":1,"v":1792131054,"a":{"Idle":{"w":44,"h":46,"n":2,"r":8,"d":[60,12],"ax":21.5,"ay":39.5},"Walk":{"w":44,"h":46,"n":4,"r":8,"d":[7,7,7,7],"ax":21.5,"ay":39.5},"Attack":{"w":44,"h":46,"n":4,"r":8,"d":[4,5,8,5],"ax":21.5,"ay":39.5},"Shoot":{"w":44,"h":46,"n":4,"r":8,"d":[5,6,10,5],"ax":21.5,"ay":39.5},"Charge":{"w":44,"h":46,"n":4,"r":8,"d":[8,8,8,8],"ax":21.5,"ay":39.5},"Hurt":{"w":44,"h":46,"n":2,"r":8,"d":[12,12],"ax":21.5,"ay":39.5},"Faint":{"w":44,"h":46,"n":2,"r":8,"d":[10,40],"ax":21.5,"ay":39.5}}} },
  { dex: 10002, id: 'c002', name: 'Pollito', types: ['electric'], hp: 92, spd: 108, atk: 1.05, rarity: 2, bst: 400, gen: 0, starter: false, custom: true,
    start: 'thunder-shock', desc: 'Un pollito de píxeles que vino de un sticker.',
    sprite: {"s":1,"a":{"Idle":{"w":42,"h":42,"n":2,"r":8,"d":[70,8],"ax":20.5,"ay":35.5},"Walk":{"w":42,"h":42,"n":4,"r":8,"d":[7,7,7,7],"ax":20.5,"ay":35.5},"Attack":{"w":42,"h":42,"n":4,"r":8,"d":[4,5,8,5],"ax":20.5,"ay":35.5},"Shoot":{"w":42,"h":42,"n":4,"r":8,"d":[5,6,10,5],"ax":20.5,"ay":35.5},"Charge":{"w":42,"h":42,"n":4,"r":8,"d":[8,8,8,8],"ax":20.5,"ay":35.5},"Hurt":{"w":42,"h":42,"n":2,"r":8,"d":[12,12],"ax":20.5,"ay":35.5},"Faint":{"w":42,"h":42,"n":2,"r":8,"d":[10,40],"ax":20.5,"ay":35.5}},"v":1792130575} },
  // Personajes del dueño (2026-10-16): sólo había 2 fotos (normal y KO); el resto de poses las hizo tools/custom_sprites/make_poses.py.
  { dex: 10003, id: 'c003', name: 'Didi', types: ['fighting', 'water'], hp: 106, spd: 98, atk: 1.08, rarity: 2, bst: 400, gen: 0, starter: false, custom: true,
    start: 'water-gun', desc: 'Un bichón esponjoso que reparte puñetazos y chorros de agua.',
    sprite: {"s":1,"v":1792132732,"a":{"Idle":{"w":42,"h":52,"n":2,"r":8,"d":[70,8],"ax":20.5,"ay":45.5},"Walk":{"w":42,"h":52,"n":4,"r":8,"d":[7,7,7,7],"ax":20.5,"ay":45.5},"Attack":{"w":42,"h":52,"n":4,"r":8,"d":[4,5,8,5],"ax":20.5,"ay":45.5},"Shoot":{"w":42,"h":52,"n":4,"r":8,"d":[5,6,10,5],"ax":20.5,"ay":45.5},"Charge":{"w":42,"h":52,"n":4,"r":8,"d":[8,8,8,8],"ax":20.5,"ay":45.5},"Hurt":{"w":42,"h":52,"n":2,"r":8,"d":[12,12],"ax":20.5,"ay":45.5},"Faint":{"w":42,"h":52,"n":2,"r":8,"d":[10,40],"ax":20.5,"ay":45.5}}} },
  { dex: 10004, id: 'c004', name: 'Heroe', types: ['normal', 'fighting'], hp: 100, spd: 112, atk: 1.04, rarity: 2, bst: 400, gen: 0, starter: false, custom: true,
    start: 'quick-attack', desc: 'Le da miedo todo, pero siempre acaba salvando a los suyos.',
    sprite: {"s":1,"v":1792133404,"a":{"Idle":{"w":58,"h":56,"n":2,"r":8,"d":[70,8],"ax":28.5,"ay":49.5},"Walk":{"w":58,"h":56,"n":4,"r":8,"d":[6,6,6,6],"ax":28.5,"ay":49.5},"Attack":{"w":58,"h":56,"n":4,"r":8,"d":[4,5,8,5],"ax":28.5,"ay":49.5},"Shoot":{"w":58,"h":56,"n":4,"r":8,"d":[5,6,10,5],"ax":28.5,"ay":49.5},"Charge":{"w":58,"h":56,"n":4,"r":8,"d":[8,8,8,8],"ax":28.5,"ay":49.5},"Hurt":{"w":58,"h":56,"n":2,"r":8,"d":[12,12],"ax":28.5,"ay":49.5},"Faint":{"w":58,"h":56,"n":2,"r":8,"d":[10,40],"ax":28.5,"ay":49.5}}} },
  { dex: 10005, id: 'c005', name: 'Turbo Abuela', types: ['fighting', 'ghost'], hp: 88, spd: 126, atk: 1.10, rarity: 2, bst: 400, gen: 0, starter: false, custom: true,
    start: 'lick', desc: 'Una abuela fantasma metida en un gato de la suerte. Corre rapidísimo.',
    sprite: {"s":1,"v":1792132734,"a":{"Idle":{"w":44,"h":54,"n":2,"r":8,"d":[70,8],"ax":21.5,"ay":47.5},"Walk":{"w":44,"h":54,"n":4,"r":8,"d":[7,7,7,7],"ax":21.5,"ay":47.5},"Attack":{"w":44,"h":54,"n":4,"r":8,"d":[4,5,8,5],"ax":21.5,"ay":47.5},"Shoot":{"w":44,"h":54,"n":4,"r":8,"d":[5,6,10,5],"ax":21.5,"ay":47.5},"Charge":{"w":44,"h":54,"n":4,"r":8,"d":[8,8,8,8],"ax":21.5,"ay":47.5},"Hurt":{"w":44,"h":54,"n":2,"r":8,"d":[12,12],"ax":21.5,"ay":47.5},"Faint":{"w":44,"h":54,"n":2,"r":8,"d":[10,40],"ax":21.5,"ay":47.5}}} }
];
// Se pueden buscar por dex (jugar con ellos), pero NO están en G.DEX: no cuentan para nada.
G.CUSTOM_BY = {};
for (const c of G.CUSTOM) { G.CUSTOM_BY[c.dex] = c; G.DEX_BY[c.dex] = c; }
