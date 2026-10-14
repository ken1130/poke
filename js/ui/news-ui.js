/* ============ news-ui.js — "Novedades" ============
 * Botón en la barra de arriba que abre la lista de cambios del juego
 * (js/data/changelog.js). Lleva un punto mientras haya algo que no has visto.
 */
G.NewsUI = (() => {
  const $ = G.UI.$;
  // Esta versión enseña sus propias novedades (data/modnews.js), en 繁中 o inglés.
  const KEY = 'ps.modnews.seen';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const latest = () => (G.MODNEWS[0] || {}).d || '';
  function seen() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

  function init() {
    const b = $('btn-news');
    b.innerHTML = G.Icons.html('book', 18) + ' <span>' + G.T('Novedades') + '</span><i class="dot"></i>';
    b.style.display = '';
    b.onclick = open;
    $('news-close').onclick = close;
    refresh();
  }
  function refresh() { $('btn-news').classList.toggle('new', seen() < latest()); }

  function fmt(d) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString({ en: 'en-GB', zh: 'zh-TW' }[G.I18n.lang] || 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function open() {
    const L = G.I18n.lang === 'zh' ? 'zh' : 'en';
    // Cada texto ya va en su idioma: translate="no" para que no lo toque i18n.
    const PARTS = [['new', { zh: '新功能', en: 'New' }], ['chg', { zh: '調整', en: 'Changes' }], ['fix', { zh: '修正', en: 'Fixes' }]];
    $('news-body').innerHTML = G.MODNEWS.map(v =>
      `<div class="news-day" translate="no"><h3>${esc(v.title ? v.title[L] : '')}<small>${fmt(v.d)}</small></h3>` +
      PARTS.filter(([k]) => v[k] && v[k].length).map(([k, lbl]) =>
        `<div class="news-part"><span class="news-tag ${k}">${lbl[L]}</span><ul>${v[k].map(t => `<li>${esc(t[L])}</li>`).join('')}</ul></div>`).join('') +
      '</div>').join('');
    $('news-body').scrollTop = 0;
    $('scr-news').classList.remove('hidden');
    try { localStorage.setItem(KEY, latest()); } catch (e) { /* nada */ }
    refresh();
  }
  function close() { $('scr-news').classList.add('hidden'); }

  /** Al llegar al menú: si hay novedades sin ver, se abren solas (una vez por versión). */
  function autoOpen() { if (seen() < latest()) open(); }

  return { init, open, close, autoOpen };
})();
