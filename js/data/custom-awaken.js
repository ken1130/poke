/* ============ custom-awaken.js — el «Despertar» de los personajes originales (2026-10-21) ============
 * Los personajes de custom.js (10001-10008) no evolucionan en la partida; en vez de Megaevolución
 * tienen una forma despierta al Nv. 35 que funciona EXACTAMENTE como una Mega (systems/evo.js:
 * misma ventana, mismos ×MEGA_BOOST, habilidad de megaability.js y movimiento inicial despertado,
 * misma sincronización en grupo). Sólo cambian los textos («despertar» en vez de «megaevolucionar»).
 *   dex = 30000 + el del personaje (40001-40008), como las Megas (30000 + base). Hojas en
 *   assets/pokemon/4000x/ (tools/custom_sprites/make_awaken.py: recolor + aura) y su geometría en
 *   sprites-awaken.js. Stats de seis en stats6-custom.js (×1,2 como las Megas sin dato).
 *   Se registran en G.MEGA_BY_BASE (para evo.js y el Pokédex) y en G.DEX_BY (evolveTo, sprites,
 *   compañeros en grupo). NO en G.CUSTOM / G.CUSTOM_BY: no son un personaje aparte (no se eligen de
 *   compañero, no salen como celda en «Otros»: salen dentro de la ficha de su personaje).
 * El movimiento exclusivo (moves.js `only: 1000x`) ya está aprendido al despertar: `only` sólo
 * decide quién lo recibe al empezar, no se vuelve a mirar.
 */
G.AWAKEN = [
  // base, nombre (es), zh, en
  [10001, 'Panda Despierto',        '覺醒熊貓',   'Awakened Panda'],
  [10002, 'Pollito Despierto',      '覺醒地瓜球', 'Awakened Sweet Potato Ball'],
  [10003, 'Didi Despierto',         '覺醒迪迪',   'Awakened Didi'],
  [10004, 'Heroe Despierto',        '覺醒英雄',   'Awakened Hero'],
  [10005, 'Turbo Abuela Despierta', '覺醒高速婆婆', 'Awakened Turbo Granny'],
  [10006, 'Tom Despierto',          '覺醒湯姆貓', 'Awakened Tom'],
  [10007, 'Lika Despierta',         '覺醒利卡',   'Awakened Licker'],
  [10008, 'Jerry Despierto',        '覺醒傑利鼠', 'Awakened Jerry']
].map(([base, name, zh, en]) => {
  const b = G.CUSTOM_BY && G.CUSTOM_BY[base];
  if (!b || !G.SPRITE_META[30000 + base]) return null;
  return { dex: 30000 + base, base, mega: true, awaken: true, custom: true, name, zh, en,
           types: b.types.slice(), hp: b.hp, spd: b.spd + 8, atk: Math.round(b.atk * 1.15 * 100) / 100,
           rarity: b.rarity, bst: (b.bst || 0) + 100, gen: 0, starter: false, start: b.start, desc: b.desc };
}).filter(Boolean);
G.MEGA_BY_BASE = G.MEGA_BY_BASE || {};
for (const f of G.AWAKEN) {
  (G.MEGA_BY_BASE[f.base] = G.MEGA_BY_BASE[f.base] || []).push(f);
  G.DEX_BY[f.dex] = f;
}
G.AWAKEN_BY = {};
for (const f of G.AWAKEN) G.AWAKEN_BY[f.dex] = f;

// Nombres y textos (la ventana de evolución, la HUD, el Pokédex: lo mismo que la Mega pero «despertar»).
if (G.I18n && G.I18n.add) {
  const zh = {}, en = {};
  for (const f of G.AWAKEN) { zh[f.name] = f.zh; en[f.name] = f.en; }
  G.I18n.add(Object.assign(zh, {
    'Despertar': '覺醒',
    'Despierto (prefijo del movimiento despertado)': '覺醒',
    '¡{x} puede despertar!': '{x} 可以覺醒了！',
    '¡{x} está despertando!': '{x} 正在覺醒！',
    '¡{x} ha despertado: {x}!': '{x} 覺醒成 {x}！',
    'Ahora no (Despertar)': '先不要',
    'Puedes despertar luego: tecla M, el botón de la pantalla o el de la pausa.': '之後隨時可以覺醒：按 M、畫面上的按鈕，或暫停選單的按鈕。',
    'Cuando quieras: M o el botón «Despertar» para despertar': '想覺醒時，按 M 或畫面上的「覺醒」按鈕',
    'Despertar (botón)': '覺醒',
    'Despertar (pausa)': '覺醒',
    'Habilidad despierta: {x}': '覺醒特性：{x}',
    'Puede despertar en la partida (Nv. {x})': '遊戲中 Lv.{x} 起可以覺醒（原創角色的超級進化）',
    'Movimiento despertado: daño +{x}% y recarga -{x}%': '覺醒招式：傷害 +{x}%、冷卻 -{x}%',
    'Motor Eléctrico': '電氣引擎', 'Movimientos Eléctricos +30% y todos se recargan un 10% antes.': '電屬性招式 +30%，所有招式冷卻縮短 10%。',
    'Valor Tardío': '遲來的勇氣', 'Cuanta menos vida te queda, más daño haces (hasta +40%).': '血越少傷害越高（最多 +40%）。'
  }), 'zh');
  G.I18n.add(Object.assign(en, {
    'Despertar': 'Awakening',
    'Despierto (prefijo del movimiento despertado)': 'Awakened',
    '¡{x} puede despertar!': '{x} can awaken!',
    '¡{x} está despertando!': '{x} is awakening!',
    '¡{x} ha despertado: {x}!': '{x} awakened into {x}!',
    'Ahora no (Despertar)': 'Not now',
    'Puedes despertar luego: tecla M, el botón de la pantalla o el de la pausa.': 'You can awaken any time later: press M, the on-screen button or the one in the pause menu.',
    'Cuando quieras: M o el botón «Despertar» para despertar': 'Whenever you like: M or the “Awaken” button to awaken',
    'Despertar (botón)': 'Awaken',
    'Despertar (pausa)': 'Awaken',
    'Habilidad despierta: {x}': 'Awakened ability: {x}',
    'Puede despertar en la partida (Nv. {x})': 'Can awaken during a run (Lv. {x}): the original characters’ Mega Evolution',
    'Movimiento despertado: daño +{x}% y recarga -{x}%': 'Awakened move: damage +{x}% and recharge -{x}%',
    'Motor Eléctrico': 'Volt Engine', 'Movimientos Eléctricos +30% y todos se recargan un 10% antes.': 'Electric moves +30% and all moves recharge 10% faster.',
    'Valor Tardío': 'Late Courage', 'Cuanta menos vida te queda, más daño haces (hasta +40%).': 'The less HP you have, the more damage you deal (up to +40%).'
  }));
}
