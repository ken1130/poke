/* ============ stats6-custom.js — lo que PokeAPI no tiene (a mano, 2026-10-20) ============
 * Personajes originales: [Ataque, Defensa, Ataque Esp., Defensa Esp.], en la escala de los juegos. El lado
 * fuerte es el de su movimiento exclusivo y vale lo mismo que su «atk» de antes (no cambia su fuerza).
 * Movimientos inventados (o de estado en los juegos que aquí hacen daño): "p" físico, "s" especial.
 * Los de apoyo y mejora (Danza Espada, Paz Mental, Recuperación...) no hacen daño: sin clase.
 */
Object.assign(G.STATS6, {
  10001: [60, 75, 73, 70],   // Panda · Pregunta Curiosa (especial)
  10002: [64, 55, 55, 60],   // Pollito · Boniato Rodante (físico)
  10003: [69, 70, 50, 65],   // Didi · Puño Espuma (físico)
  10004: [58, 60, 62, 60],   // Héroe · Pelos de Punta (especial)
  10005: [73, 50, 55, 70],   // Turbo Abuela · Turbo Fantasma (físico)
  10006: [67, 60, 45, 55],   // Tom · Caza Ratones (físico)
  10007: [76, 80, 60, 60],   // Lika · Lengüetazo Látigo (físico)
  10008: [69, 55, 58, 75]    // Jerry · Sartenazo (físico)
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
