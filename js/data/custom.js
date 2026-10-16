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
G.CUSTOM = [];
