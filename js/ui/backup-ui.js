/* ============ backup-ui.js — exportar e importar la partida ============
 * Sin nube, la partida vive en el navegador: para pasarla a otro dispositivo
 * (o guardarla por si se borra) se exporta como un código de texto
 * "PS1:" + JSON en base64, que se copia o se descarga en un .txt.
 */
G.Backup = (() => {
  const PREFIX = 'PS1:';
  let overlay = null;

  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return PREFIX + btoa(bin);
  }
  function decode(code) {
    const s = String(code || '').trim();
    if (!s.startsWith(PREFIX)) return null;
    try {
      const bin = atob(s.slice(PREFIX.length).replace(/\s+/g, ''));
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    } catch (e) { return null; }
  }

  function close() { if (overlay) { overlay.remove(); overlay = null; } }

  function frame(inner) {
    close();
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:66;display:flex;align-items:center;justify-content:center;background:rgba(5,9,20,.7)';
    overlay.innerHTML = `<div class="box" style="width:min(480px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:18px 20px">${inner}</div>`;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close]').onclick = close;
    return overlay;
  }

  function openExport() {
    const code = encode(G.DB.save);
    const o = frame(`
      <h3>Exportar partida</h3>
      <p class="sub">Copia este código o descarga el archivo, y en el otro dispositivo usa <b>Importar partida</b>.</p>
      <textarea class="field" readonly translate="no" style="width:100%;height:110px;font:12px monospace;word-break:break-all">${code}</textarea>
      <div class="row wrap" style="gap:8px;margin-top:10px">
        <button class="btn gold grow" type="button" data-copy>Copiar código</button>
        <button class="btn grow" type="button" data-dl>Descargar .txt</button>
        <button class="btn ghost grow" type="button" data-close>Cerrar</button>
      </div>`);
    o.querySelector('[data-copy]').onclick = () => G.Modes.copy(code);
    o.querySelector('[data-dl]').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
      a.download = 'pokesurvivor-' + new Date().toISOString().slice(0, 10) + '.txt';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }

  function openImport() {
    const o = frame(`
      <h3>Importar partida</h3>
      <p class="sub">Pega el código o carga el archivo .txt. <b class="gold">Sustituye la partida de este dispositivo.</b></p>
      <textarea class="field" id="bk-code" spellcheck="false" translate="no" placeholder="PS1:…" style="width:100%;height:110px;font:12px monospace;word-break:break-all"></textarea>
      <p class="err" id="bk-err"></p>
      <div class="row wrap" style="gap:8px;margin-top:6px">
        <label class="btn grow" style="margin:0;text-align:center">Cargar .txt<input type="file" accept=".txt,text/plain" data-file hidden></label>
        <button class="btn gold grow" type="button" data-go>Importar</button>
        <button class="btn ghost grow" type="button" data-close>Cerrar</button>
      </div>`);
    const ta = o.querySelector('#bk-code');
    o.querySelector('[data-file]').onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (f) f.text().then(t => { ta.value = t.trim(); });
    };
    o.querySelector('[data-go]').onclick = () => {
      const obj = decode(ta.value);
      if (!obj) { o.querySelector('#bk-err').textContent = G.T('Código no válido'); G.Audio.sfx('error'); return; }
      if (!confirm(G.T('Se sustituirá la partida de este dispositivo. ¿Seguro?'))) return;
      if (!G.DB.importSave(obj)) { o.querySelector('#bk-err').textContent = G.T('Código no válido'); return; }
      G.UI.toast(G.T('Partida importada'), 2000);
      setTimeout(() => location.reload(), 800);
    };
  }

  return { openExport, openImport, encode, decode };
})();
