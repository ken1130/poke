/* ============ guard.js — sin menú contextual ni atajos de las herramientas de desarrollo (2026-10-17) ============
 * Petición del dueño: que no sea tan fácil copiar la página. OJO: sólo disuade a la gente normal;
 * las herramientas se pueden abrir desde el menú del navegador, con view-source: o sin JavaScript,
 * y el código está en el repositorio. Con ?dev en la dirección no se bloquea nada (para probar).
 *   - Clic derecho / mantener pulsado: bloqueado, salvo en campos de texto (en el móvil hace
 *     falta para pegar el código de sala).
 *   - F12, Ctrl+Shift+I/J/C/K, Ctrl+U (ver código), Ctrl+S (guardar página) y los de Mac (⌘⌥I/J/C/U, ⌘S).
 */
(() => {
  if (/[?&]dev\b/.test(location.search)) return;
  const editable = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  addEventListener('contextmenu', e => { if (!editable(e.target)) e.preventDefault(); }, true);
  addEventListener('dragstart', e => { if (e.target && e.target.tagName === 'IMG') e.preventDefault(); }, true);
  addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
    const block = e.key === 'F12'
      || (mod && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k))          // Ctrl+Shift+I/J/C/K
      || (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].includes(k))       // Mac ⌘⌥I/J/C/U
      || (mod && !e.shiftKey && (k === 'u' || k === 's'));                 // ver código / guardar
    if (block) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
