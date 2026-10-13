/* ============ cheat.js — códigos de truco ============
 * Dos formas de meter un código:
 *   - Menú > Trucos: ventana con un campo de texto (también en móvil).
 *   - Escribirlo con el teclado en cualquier pantalla (no dentro de un campo).
 * Códigos:
 *   greedisgood  ->  9.999.999 monedas y tickets (x1 y x10), toda la Pokédex
 *                    y todos los Pokémon para jugar.
 * Sólo en modo local: la partida en la nube y el ranking online no se tocan.
 */
G.Cheat = (() => {
  const AMOUNT = 9999999;
  const CODES = { greedisgood: greedIsGood };
  const MAX_LEN = Math.max(...Object.keys(CODES).map(c => c.length));
  let buffer = '';
  let overlay = null;

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

  /** Aplica un código. Devuelve false si no existe. */
  function redeem(code) {
    const fn = CODES[String(code || '').trim().toLowerCase()];
    if (!fn) return false;
    fn();
    return true;
  }

  // ---------------- ventana del menú ----------------

  function closePrompt() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function openPrompt() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:66;display:flex;align-items:center;justify-content:center;background:rgba(5,9,20,.7)';
    overlay.innerHTML = `
      <form class="box" style="width:min(360px,calc(100% - 32px));padding:20px 22px" autocomplete="off">
        <h3>Trucos</h3>
        <label for="cheat-code">Código</label>
        <input id="cheat-code" class="field" maxlength="32" spellcheck="false" autocapitalize="off" style="width:100%;margin:6px 0 4px">
        <p id="cheat-err" class="err"></p>
        <div class="row" style="gap:10px;margin-top:8px">
          <button type="button" class="btn ghost grow" data-cancel>Cancelar</button>
          <button type="submit" class="btn gold grow">Usar</button>
        </div>
      </form>`;
    overlay.onclick = e => { if (e.target === overlay) closePrompt(); };
    overlay.querySelector('[data-cancel]').onclick = closePrompt;
    const input = overlay.querySelector('#cheat-code');
    overlay.querySelector('form').onsubmit = e => {
      e.preventDefault();
      if (redeem(input.value)) { closePrompt(); return; }
      overlay.querySelector('#cheat-err').textContent = 'Código incorrecto';
      G.Audio.sfx('error');
      input.select();
    };
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePrompt(); } });
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 30);
  }

  // ---------------- escribirlo con el teclado ----------------

  addEventListener('keydown', e => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    buffer = (buffer + e.key.toLowerCase()).slice(-MAX_LEN);
    for (const code of Object.keys(CODES)) {
      if (buffer.endsWith(code)) { buffer = ''; CODES[code](); break; }
    }
  });

  return { redeem, openPrompt };
})();
