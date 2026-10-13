/* ============ cheat.js — códigos de truco ============
 * Dos formas de meter un código:
 *   - Menú > Trucos: ventana con un campo de texto (también en móvil).
 *   - Escribirlo con el teclado en cualquier pantalla (no dentro de un campo).
 * Códigos:
 *   greedisgood        ->  9.999.999 monedas y tickets (x1 y x10), toda la Pokédex
 *                          y todos los Pokémon para jugar.
 *   allmoneybackmyhome ->  9.999.999 monedas.
 *   allcoupon          ->  99.999.999 tickets del gacha (x1 y x10).
 *   whosyourdaddy      ->  invencible el resto de la run (en partida).
 *   iamlevel30         ->  sube hasta el nivel 30 (en partida; eliges las cartas).
 *   allshiny           ->  todos los shinies (y sus Pokémon).
 *   maxpower           ->  todas las mejoras al máximo en todos los Pokémon (Rompescudos y Anticura incluidas).
 * Funcionan también con la partida en la nube (proyecto de Firebase propio).
 */
G.Cheat = (() => {
  const AMOUNT = 9999999, TICKETS = 99999999;
  const CODES = { greedisgood: greedIsGood, allmoneybackmyhome: allMoney, allcoupon: allCoupon,
                  whosyourdaddy: godMode, iamlevel30: level30, allshiny: allShiny, maxpower: maxPower };
  // Lista que se enseña en la ventana de Trucos (lo que hace cada uno).
  const HELP = [
    ['greedisgood', 'Toda la Pokédex y todos los Pokémon, 9.999.999 monedas y 9.999.999 tickets (×1 y ×10)'],
    ['allmoneybackmyhome', '9.999.999 monedas'],
    ['allcoupon', '99.999.999 tickets del gacha (×1 y ×10)'],
    ['whosyourdaddy', 'Invencible el resto de la partida (úsalo jugando)'],
    ['iamlevel30', 'Subes al nivel 30 y eliges las cartas (úsalo jugando)'],
    ['allshiny', 'Todos los Pokémon shiny para tu colección'],
    ['maxpower', 'Todas las mejoras al máximo en todos tus Pokémon (incluidas Rompescudos y Anticura -99%)']
  ];
  const MAX_LEN = Math.max(...Object.keys(CODES).map(c => c.length));
  let buffer = '';
  let overlay = null;

  /** La partida a modificar (también en la nube: el proyecto de Firebase es el de esta versión). */
  function target() { return G.DB.save || null; }

  /** Guarda, refresca lo que se ve y avisa. */
  function done(msg) {
    G.DB.commit(true);
    G.UI.refreshCoins();
    if (G.Game.state === 'ui' && G.UI.isOpen('scr-menu')) G.MenuUI.open();
    G.Audio.sfx('confirm');
    G.UI.toast(msg, 4000);
  }

  function greedIsGood() {
    const s = target();
    if (!s) return;
    s.coins = AMOUNT;
    s.tickets = { t1: AMOUNT, t10: AMOUNT };
    for (const mon of G.DEX) G.DB.grant(mon.dex, 'gacha');
    done('¡Truco activado! Pokédex y Pokémon desbloqueados · 9.999.999 monedas y tickets');
  }

  function allMoney() {
    const s = target();
    if (!s) return;
    s.coins = AMOUNT;
    done('¡Truco activado! 9.999.999 monedas');
  }

  function allCoupon() {
    const s = target();
    if (!s) return;
    s.tickets = { t1: TICKETS, t10: TICKETS };
    done('¡Truco activado! 99.999.999 tickets del gacha (×1 y ×10)');
  }

  /** El jugador de la partida en curso, o null (avisa) si no estás jugando. */
  function inRun() {
    const pl = G.Game.player;
    if (pl && !pl.dead && G.Game.state !== 'ui' && G.Game.state !== 'over') return pl;
    G.UI.toast('Este truco se usa durante la partida', 3000);
    G.Audio.sfx('error');
    return null;
  }

  function godMode() {
    if (!target()) return;
    const pl = inRun();
    if (!pl) return;
    pl.god = true;
    G.Audio.sfx('confirm');
    G.UI.toast('¡Truco activado! Invencible hasta el final de la partida', 3500);
  }

  function level30() {
    if (!target()) return;
    const pl = inRun();
    if (!pl) return;
    const n = Math.max(0, 30 - pl.level);
    if (!n) { G.UI.toast('Ya estás en el nivel 30 o más', 2500); return; }
    for (let i = 0; i < n; i++) G.Game.debugLevelUp();
    G.UI.toast(G.I18n.f('¡Truco activado! +{x} niveles: elige tus cartas', n), 3500);
  }

  function allShiny() {
    const s = target();
    if (!s) return;
    let n = 0;
    for (const mon of G.DEX) if (G.Sprites.hasShiny(mon.dex) && G.DB.grantShiny(mon.dex, 'gacha')) n++;
    done(G.I18n.f('¡Truco activado! {x} shinies nuevos', n));
  }

  function maxPower() {
    const s = target();
    if (!s) return;
    for (const mon of G.DEX) {
      const lv = G.DB.upgradesOf(mon.dex);
      for (const u of G.Upgrades.LIST) lv[u.id] = u.max;
    }
    done('¡Truco activado! Todas las mejoras al máximo en todos los Pokémon');
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
      <form class="box" style="width:min(440px,calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;padding:20px 22px" autocomplete="off">
        <h3>Trucos</h3>
        <div class="cheat-list" style="display:flex;flex-direction:column;gap:8px;margin:8px 0 14px">
          ${HELP.map(([code, what]) => `
          <div class="panel" style="display:flex;align-items:center;gap:10px;padding:8px 10px">
            <div style="flex:1;min-width:0">
              <code translate="no" style="font:700 15px monospace;color:var(--gold);user-select:all">${code}</code>
              <div style="font-size:13px;color:var(--muted)">${what}</div>
            </div>
            <button type="button" class="btn small" data-copy="${code}">Copiar</button>
          </div>`).join('')}
        </div>
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
    // Copiar: al portapapeles y, de paso, al campo (basta con pulsar Usar).
    overlay.querySelectorAll('[data-copy]').forEach(b => {
      b.onclick = () => {
        const code = b.dataset.copy;
        input.value = code;
        overlay.querySelector('#cheat-err').textContent = '';
        const ok = () => { G.UI.toast('Copiado: ' + code, 1800); G.Audio.sfx('click'); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(code).then(ok, ok);
        else { input.select(); try { document.execCommand('copy'); } catch (e) { /* nada */ } ok(); }
      };
    });
    overlay.querySelector('form').onsubmit = e => {
      e.preventDefault();
      if (redeem(input.value)) { closePrompt(); return; }
      overlay.querySelector('#cheat-err').textContent = 'Código incorrecto';
      G.Audio.sfx('error');
      input.select();
    };
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePrompt(); } });
    document.body.appendChild(overlay);
    if (!G.Settings.touch) setTimeout(() => input.focus(), 30);   // en móvil, sin teclado de golpe
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
