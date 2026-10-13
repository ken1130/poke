/* ============ party-ui.js — jugar con amigos con un código de invitación ============
 * Menú > "Jugar con amigos": crear una sala (su id es un código de 6 letras) o
 * entrar en una con el código que te pasen. Después, la sala de siempre (LobbyUI).
 * Hace falta cuenta de Google (la sala identifica a cada jugador por su cuenta).
 */
G.PartyUI = (() => {
  let overlay = null;

  function close() { if (overlay) { overlay.remove(); overlay = null; } }

  async function open() {
    if (!G.DB.online) {
      const ok = await G.Dialog.confirm('Para jugar con amigos necesitas vincular tu cuenta de Google (así la sala sabe quién es cada uno). Tu progreso actual se conserva.',
        { title: 'Jugar con amigos', ok: 'Vincular con Google' });
      if (ok) G.AccountUI.bind();
      return;
    }
    G.Social.startLite();
    if (G.Social.room) { G.LobbyUI.open(); return; }
    close();
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:66;display:flex;align-items:center;justify-content:center;background:rgba(5,9,20,.7)';
    overlay.innerHTML = `
      <div class="box" style="width:min(420px,calc(100% - 24px));padding:18px 20px">
        <div class="row between"><h3 style="margin:0">Jugar con amigos</h3><button class="btn small ghost" data-close>Volver</button></div>
        <p class="sub">Equipo o PK, hasta 4 jugadores. Uno crea la sala y pasa el código a los demás.</p>
        <button class="btn gold" style="width:100%" data-create>Crear sala</button>
        <h3 class="set-h" style="margin-top:16px">Entrar con un código</h3>
        <div class="row" style="gap:8px">
          <input class="field grow" id="party-code" maxlength="8" placeholder="ABC234" autocapitalize="characters" spellcheck="false" translate="no"
                 style="text-transform:uppercase;letter-spacing:4px;font:700 20px monospace;text-align:center">
          <button class="btn" data-join>Unirse</button>
        </div>
        <p class="err" id="party-err"></p>
      </div>`;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    overlay.querySelector('[data-close]').onclick = close;
    const err = t => { overlay.querySelector('#party-err').textContent = G.T(t); };
    overlay.querySelector('[data-create]').onclick = async e => {
      e.target.disabled = true;
      try { await G.Social.createRoom(); close(); G.LobbyUI.open(); }
      catch (x) { e.target.disabled = false; err('No se pudo crear la sala.'); console.warn(x); }
    };
    const join = async () => {
      const b = overlay.querySelector('[data-join]');
      b.disabled = true; err('');
      const r = await G.Social.joinByCode(overlay.querySelector('#party-code').value);
      if (!overlay) return;
      b.disabled = false;
      if (!r.ok) { err(r.error); G.Audio.sfx('error'); return; }
      close(); G.LobbyUI.open();
    };
    overlay.querySelector('[data-join]').onclick = join;
    overlay.querySelector('#party-code').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
    document.body.appendChild(overlay);
  }

  return { open, close };
})();
