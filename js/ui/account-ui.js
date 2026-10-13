/* ============ account-ui.js — vincular Google y cambiar el apodo ============
 * Con la nube disponible se entra sin cuenta (partida en el navegador). El botón
 * "Vincular con Google" (barra de arriba y Ajustes > Cuenta) la pasa a la nube;
 * en otro dispositivo, vincular la misma cuenta la recupera (y fusiona).
 */
G.AccountUI = (() => {
  const $ = id => document.getElementById(id);

  /** Navegadores dentro de apps (LINE, Facebook, Instagram...): Google no deja entrar desde ellos. */
  function inAppBrowser() { return /\bLine\/|FBAN|FBAV|Instagram|WebView|; wv\)/i.test(navigator.userAgent); }

  async function bind(onDone) {
    if (inAppBrowser()) {
      await G.Dialog.alert('Google no deja iniciar sesión dentro de LINE u otras apps. Abre el juego en Chrome o Safari (menú ⋯ → Abrir en el navegador) y vincula desde allí.', 'Vincular con Google');
      return;
    }
    const btns = [$('btn-bind'), $('set-bind')].filter(Boolean);
    btns.forEach(b => { b.disabled = true; });
    const r = await G.DB.bindGoogle();
    btns.forEach(b => { b.disabled = false; });
    if (!r.ok) { if (r.error) G.UI.toast(r.error, 4000); return; }
    G.Audio.sfx('confirm');
    G.UI.toast(G.T('¡Cuenta de Google vinculada! Tu progreso se guarda en la nube'), 4000);
    refresh();
    if (onDone) onDone();
    if (G.Game.state === 'ui') G.Flow.afterLogin();
  }

  async function rename(onDone) {
    const cur = G.DB.user || '';
    const n = await G.Dialog.prompt('Cambiar apodo', cur, { max: 16, text: '1-16 caracteres. Se ve arriba a la derecha.', ok: 'Guardar' });
    if (n == null) return;
    const clean = n.replace(/[<>&"'`\\]/g, '').trim().slice(0, 16);
    if (!clean) { G.UI.toast(G.T('El apodo no puede estar vacío'), 2500); return; }
    G.DB.setName(clean);
    G.UI.refreshCoins();
    G.UI.toast(G.I18n.f('Ahora te llamas {x}', clean), 2500);
    if (onDone) onDone();
  }

  /** Botón de la barra de arriba: sólo mientras juegas sin vincular. */
  function refresh() {
    const b = $('btn-bind');
    if (!b) return;
    b.classList.toggle('hidden', !G.DB.unbound);
    b.onclick = () => bind();
  }

  return { bind, rename, refresh, inAppBrowser };
})();
