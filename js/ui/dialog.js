/* ============ dialog.js — avisos, confirmaciones y preguntas con el estilo del juego ============
 * En lugar de alert/confirm/prompt del navegador (que salen fuera del juego).
 *   await G.Dialog.alert('texto')
 *   if (await G.Dialog.confirm('¿Seguro?', { ok: 'Borrar', danger: true })) ...
 *   const v = await G.Dialog.prompt('Nuevo apodo', 'Ash', { max: 16 })   // null si cancela
 */
G.Dialog = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function open({ title = '', text = '', input = null, ok = 'Aceptar', cancel = null, danger = false }) {
    return new Promise(done => {
      const el = document.createElement('section');
      el.className = 'scr dim';
      el.style.zIndex = 80;
      el.innerHTML = `<div class="box center" style="width:min(380px,calc(100% - 32px))">
        ${title ? `<h3>${esc(G.T(title))}</h3>` : ''}
        ${text ? `<p class="sub" style="white-space:pre-line">${esc(G.T(text))}</p>` : ''}
        ${input ? `<input class="field" maxlength="${input.max || 64}" spellcheck="false" style="width:100%;margin-top:6px" translate="no">` : ''}
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:center;flex-wrap:wrap">
          ${cancel ? `<button class="btn ghost" data-a="no">${esc(G.T(cancel))}</button>` : ''}
          <button class="btn ${danger ? 'danger' : 'gold'}" data-a="yes">${esc(G.T(ok))}</button>
        </div></div>`;
      document.body.appendChild(el);
      const inp = el.querySelector('input');
      if (inp) inp.value = input.value || '';
      const end = v => { el.remove(); done(v); };
      const yes = () => end(inp ? inp.value : true);
      const no = () => end(inp ? null : false);
      el.querySelector('[data-a=yes]').onclick = yes;
      const nb = el.querySelector('[data-a=no]'); if (nb) nb.onclick = no;
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); yes(); }
        if (e.key === 'Escape') { e.stopPropagation(); cancel ? no() : yes(); }
      });
      setTimeout(() => { if (inp) { inp.focus(); inp.select(); } else el.querySelector('[data-a=yes]').focus(); }, 50);
    });
  }

  return {
    alert: (text, title = '') => open({ title, text, ok: 'Entendido' }),
    confirm: (text, opts = {}) => open({ title: opts.title || '', text, ok: opts.ok || 'Confirmar', cancel: opts.cancel || 'Cancelar', danger: !!opts.danger }),
    prompt: (title, value = '', opts = {}) => open({ title, text: opts.text || '', input: { value, max: opts.max }, ok: opts.ok || 'Confirmar', cancel: 'Cancelar' })
  };
})();
