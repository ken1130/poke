/* ============ mega.js — formas Mega (2026-10-19, hoja V3.1 «須新增的圖鑑列表») ============
 * Sólo las que tienen animación completa en SpriteCollab (39; tools/fetch_mega.py baja sus
 * hojas a assets/pokemon/{30000+dex}/ y sprites-mega.js su geometría).
 * No son Pokémon del Pokédex (no cuentan, no salen en el gacha): son la forma Mega de un Pokémon
 * DURANTE la run (systems/evo.js). Cada una: dex = 30000 + el del base, base, sufijo (X / Y) y
 * sus tipos de Mega. Los números (vida, ataque, velocidad) salen del base; lo que gana al
 * megaevolucionar está en G.Evo.MEGA_BOOST.
 *   G.MEGA            la lista
 *   G.MEGA_BY_BASE    dex base -> [formas Mega]
 *   G.DEX_BY[dex]     también están aquí (para evolveTo, los sprites y los compañeros en grupo)
 */
G.MEGA = [
  [670, 'fairy'], [65, 'psychic'], [94, 'ghost', 'poison'], [308, 'fighting', 'psychic'], [310, 'electric'],
  [282, 'psychic', 'fairy'], [475, 'psychic', 'fighting'], [229, 'dark', 'fire'], [334, 'dragon', 'fairy'],
  [428, 'normal', 'fighting'], [354, 'ghost'], [323, 'fire', 'ground'], [530, 'ground', 'steel'],
  [302, 'dark', 'ghost'], [303, 'steel', 'fairy'], [359, 'dark'], [448, 'fighting', 'steel'],
  [80, 'water', 'psychic'], [319, 'water', 'dark'], [604, 'electric'], [6, 'fire', 'dragon', 'X'],
  [691, 'poison', 'dragon'], [362, 'ice'], [560, 'dark', 'fighting'], [142, 'rock', 'flying'],
  [208, 'steel', 'ground'], [248, 'rock', 'dark'], [227, 'steel', 'flying'], [115, 'normal'],
  [780, 'normal', 'dragon'], [718, 'dragon', 'ground'], [719, 'rock', 'fairy'], [150, 'psychic', null, 'Y'],
  [978, 'dragon', 'water'], [491, 'dark'], [380, 'dragon', 'psychic'], [381, 'dragon', 'psychic'],
  [384, 'dragon', 'flying'], [807, 'electric']
].map(([base, t1, t2, sfx]) => {
  const b = G.DEX_BY[base];
  if (!b || !G.SPRITE_META[30000 + base]) return null;
  return { dex: 30000 + base, base, sfx: sfx || '', mega: true,
           name: 'Mega-' + b.name + (sfx ? ' ' + sfx : ''),
           types: t2 ? [t1, t2] : [t1],
           hp: b.hp, spd: b.spd + 8, atk: Math.round(b.atk * 1.15 * 100) / 100,
           rarity: b.rarity, bst: (b.bst || 0) + 100, gen: b.gen, starter: false, leg: b.leg };
}).filter(Boolean);
G.MEGA_BY_BASE = {};
for (const m of G.MEGA) {
  (G.MEGA_BY_BASE[m.base] = G.MEGA_BY_BASE[m.base] || []).push(m);
  G.DEX_BY[m.dex] = m;
}
// Nombres: «Mega-Charizard X» → 超級噴火龍X / Mega Charizard X (el del base, ya traducido).
if (G.I18n && G.I18n.add) {
  const zh = {}, en = {};
  for (const m of G.MEGA) {
    const base = G.T(G.DEX_BY[m.base].name);
    zh[m.name] = '超級' + base + (m.sfx ? m.sfx : '');
    en[m.name] = 'Mega ' + base + (m.sfx ? ' ' + m.sfx : '');
  }
  G.I18n.add(zh, 'zh');
  G.I18n.add(en);
}
