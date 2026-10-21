/* ============ stats6-custom.js — lo que PokeAPI no tiene (a mano, 2026-10-20) ============
 * Personajes originales: [Ataque, Defensa, Ataque Esp., Defensa Esp.], en la escala de los juegos. El lado
 * fuerte es el de su movimiento exclusivo y vale lo mismo que su «atk» de custom.js (no cambia su fuerza).
 * (2026-10-20: subidos con su atk a 1,24-1,30; el lado flojo y las defensas, en la misma proporción, así
 * que físico/especial y lo que aguantan de cada lado quedan igual que antes.)
 * Movimientos inventados (o de estado en los juegos que aquí hacen daño): "p" físico, "s" especial.
 * Los de apoyo y mejora (Danza Espada, Paz Mental, Recuperación...) no hacen daño: sin clase.
 */
Object.assign(G.STATS6, {
  10001: [87, 107, 102, 99],   // Panda · Pregunta Curiosa (especial)
  10002: [98, 86, 87, 93],   // Pollito · Boniato Rodante (físico)
  10003: [98, 102, 76, 95],   // Didi · Puño Espuma (físico)
  10004: [97, 100, 102, 100],   // Héroe · Pelos de Punta (especial)
  10005: [109, 77, 88, 108],   // Turbo Abuela · Turbo Fantasma (físico)
  10006: [98, 91, 72, 83],   // Tom · Caza Ratones (físico)
  10007: [98, 105, 80, 79],   // Lika · Lengüetazo Látigo (físico)
  10008: [102, 83, 89, 113],   // Jerry · Sartenazo (físico)
  // Formas despiertas (custom-awaken.js, 40001-40008): ×1,2 como las Megas que PokeAPI no tiene (fetch_stats6.py).
  40001: [104, 128, 122, 119], 40002: [118, 103, 104, 112], 40003: [118, 122, 91, 114], 40004: [116, 120, 122, 120],
  40005: [131, 92, 106, 130], 40006: [118, 109, 86, 100], 40007: [118, 126, 96, 95], 40008: [122, 100, 107, 136]
});
Object.assign(G.MOVE_CAT, {
  // físicos: golpes, mordiscos, cargas, cosas duras
  'lee-fist': 'p', 'cat-pounce': 'p', 'frying-pan': 'p', 'foam-punch': 'p', 'stone-fist': 'p', 'blade-storm': 'p',
  'ghost-spear': 'p', 'vampire-fang': 'p', 'nature-tree': 'p', 'turbo-dash': 'p', 'tongue-lash': 'p', 'potato-roll': 'p',
  'unstable-element': 'p', 'spikes': 'p', 'stealth-rock': 'p', 'string-shot': 'p', 'heavyweight': 'p',
  // especiales: energía, elementos, rayos
  'thunder-strike': 's', 'psy-arrow': 's', 'acid-rain': 's', 'flame-shield': 's', 'formless-art': 's', 'raging-tornado': 's',
  'destruction-beam': 's', 'ice-art': 's', 'dragon-orb': 's', 'planet-wind': 's', 'toxic': 's', 'toxic-spikes': 's',
  'hail': 's', 'will-o-wisp': 's', 'substitute': 's', 'curious-question': 's', 'scaredy-burst': 's'
});
