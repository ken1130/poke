/* ============ cheat.js — códigos de truco ============
 * Se escriben con el teclado en cualquier pantalla (no dentro de un campo de texto).
 *   greedisgood  ->  9.999.999 monedas y tickets (x1 y x10), toda la Pokédex
 *                    y todos los Pokémon para jugar.
 * Sólo en modo local (doble clic en index.html): la partida en la nube y el
 * ranking online no se tocan.
 */
G.Cheat = (() => {
  const CODE = 'greedisgood';
  const AMOUNT = 9999999;
  let buffer = '';

  function greedIsGood() {
    const s = G.DB.save;
    if (!s) return;
    if (G.DB.mode === 'cloud' && !G.DB.guest) {
      G.UI.toast('Los trucos sólo funcionan en modo local (abre index.html con doble clic)', 4000);
      return;
    }
    s.coins = AMOUNT;
    s.tickets = { t1: AMOUNT, t10: AMOUNT };
    for (const mon of G.DEX) G.DB.grant(mon.dex, 'gacha');
    G.DB.commit(true);
    G.UI.refreshCoins();
    if (G.Game.state === 'ui' && G.UI.isOpen('scr-menu')) G.MenuUI.open();
    G.Audio.sfx('confirm');
    G.UI.toast('¡Truco activado! Pokédex y Pokémon desbloqueados · 9.999.999 monedas y tickets', 4000);
  }

  addEventListener('keydown', e => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    buffer = (buffer + e.key.toLowerCase()).slice(-CODE.length);
    if (buffer === CODE) { buffer = ''; greedIsGood(); }
  });

  return { greedIsGood };
})();
