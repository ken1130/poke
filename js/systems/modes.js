/* ============ modes.js — modos de juego (este dispositivo) ============
 * Ajustes (G.Settings, cada PC o móvil los suyos):
 *   shinyMode    todos los enemigos salen shiny (sólo cambia el aspecto)
 *   bossMode     sólo salen jefes (spawner.js)
 *   extremeMode  enemigos ×2 de daño y ×1,4 de velocidad; ×2 de XP y monedas
 *   diffHp / diffCount / diffSpd   dificultad a medida, en % (100 = normal)
 *
 * Tipos de run (los elige el botón con el que empiezas):
 *   'normal'  la de siempre, con los modos de arriba
 *   'daily'   reto diario: mapa y enemigos sorteados con la fecha, iguales
 *             para todos ese día; sin modos ni dificultad a medida
 *   'legend'  legendarios seguidos en la arena de la grieta (rift.js) hasta caer
 */
G.Modes = (() => {
  const $ = id => document.getElementById(id);
  let run = 'normal';
  const S = () => G.Settings;
  const fair = () => run === 'daily';

  /** ¿Está activo un modo? 'shiny' | 'boss' | 'extreme' */
  function on(k) { return !fair() && !!S().get(k + 'Mode'); }
  const pct = k => (fair() ? 1 : (S().get(k) || 100) / 100);

  const hpMul = () => pct('diffHp');
  const spdMul = () => pct('diffSpd') * (on('extreme') ? 1.4 : 1);
  const dmgMul = () => (on('extreme') ? 2 : 1);
  const countMul = () => pct('diffCount');
  const rewardMul = () => (on('extreme') ? 2 : 1);

  /** Multiplicadores {hp, spd, dmg} de un enemigo, con los modos aplicados. */
  function scale(sc) {
    return Object.assign({}, sc, { hp: sc.hp * hpMul(), spd: (sc.spd || 1) * spdMul(), dmg: (sc.dmg || 1) * dmgMul() });
  }

  // ---------------- reto diario ----------------

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dailySeed() { return +today().replace(/-/g, ''); }

  /** Aleatorio con semilla (mulberry32). */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Ejecuta fn con Math.random sembrado (mapa y elenco iguales para todos). */
  function seeded(seed, fn) {
    const orig = Math.random;
    Math.random = rng(seed);
    try { fn(); } finally { Math.random = orig; }
  }

  const KEY_DAILY = 'ps.daily.', KEY_LEGEND = 'ps.legend.best';
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } }

  function dailyBest() { return readJSON(KEY_DAILY + today()); }
  function legendBest() { return readJSON(KEY_LEGEND) || 0; }

  // ---------------- empezar y acabar ----------------

  function start(kind) {
    closePanel();
    run = kind;
    G.Flow.play();
  }
  function reset() { run = 'normal'; }

  /** Tras el resumen de la run: el resultado del reto o de los legendarios. */
  function afterRun(r) {
    const box = $('over-stats');
    if (!box) { reset(); return; }
    let html = '';
    if (run === 'daily') {
      const mon = G.T(G.DEX_BY[r.dex].name);
      const line = G.I18n.f('PokéSurvivor · Reto diario {x} · {x} · {x} · Lv {x} · {x} derrotados',
        today(), mon, G.U.mmss(r.time), r.level, r.kills);
      const best = dailyBest();
      const better = !best || r.time > best.time;
      if (better) writeJSON(KEY_DAILY + today(), { time: Math.floor(r.time), level: r.level, kills: r.kills, dex: r.dex });
      html = `<div style="grid-column:1/-1" class="panel"><span>${G.T('Reto diario')} ${today()}</span>
        <p class="daily-line" style="margin:6px 0;font-size:14px;user-select:all">${line}</p>
        ${better ? `<div class="gold">${G.T('¡Tu mejor marca de hoy!')}</div>` : `<div style="color:var(--muted)">${G.I18n.f('Tu mejor marca de hoy: {x}', G.U.mmss(best.time))}</div>`}
        <button class="btn small gold" type="button" id="over-share">${G.T('Copiar resultado')}</button></div>`;
      box.insertAdjacentHTML('beforeend', html);
      $('over-share').onclick = () => copy(line);
    } else if (run === 'legend') {
      const wins = G.Rift.rushWins;
      const best = legendBest();
      if (wins > best) writeJSON(KEY_LEGEND, wins);
      html = `<div style="grid-column:1/-1;text-align:center" class="panel"><span>${G.T('Desafío legendario')}</span>
        <b class="gold">${G.I18n.f('Legendarios vencidos: {x}', wins)}</b>
        <div style="color:var(--muted)">${wins > best ? G.T('¡Nuevo récord!') : G.I18n.f('Récord: {x}', best)}</div></div>`;
      box.insertAdjacentHTML('beforeend', html);
    }
    reset();
  }

  function copy(text) {
    const ok = () => G.UI.toast(G.T('Copiado'), 1600);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, ok);
    else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) { /* nada */ }
      ta.remove(); ok();
    }
  }

  // ---------------- ventana "Modos de juego" ----------------

  let overlay = null;
  function closePanel() { if (overlay) { overlay.remove(); overlay = null; } if (G.UI.isOpen('scr-menu')) G.MenuUI.open(); }

  const TOGGLES = [
    ['shinyMode', 'Modo shiny', 'Todos los Pokémon salvajes salen shiny (sólo cambia el aspecto).'],
    ['bossMode', 'Modo jefes', 'En el mapa sólo salen jefes, cada vez más y más fuertes.'],
    ['extremeMode', 'Modo extremo', 'Enemigos con ×2 de daño y ×1,4 de velocidad; tú ganas ×2 de XP y monedas.']
  ];
  const SLIDERS = [['diffHp', 'Vida de los enemigos'], ['diffCount', 'Cantidad de enemigos'], ['diffSpd', 'Velocidad de los enemigos']];

  function openPanel() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:66;display:flex;align-items:center;justify-content:center;background:rgba(5,9,20,.7)';
    render();
    overlay.onclick = e => { if (e.target === overlay) closePanel(); };
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });
    document.body.appendChild(overlay);
  }

  function render() {
    const db = dailyBest(), lb = legendBest();
    const sw = k => S().get(k);
    overlay.innerHTML = `
      <div class="box" style="width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:18px 20px">
        <div class="row between"><h3 style="margin:0">Modos de juego</h3><button class="btn small ghost" data-close>Volver</button></div>

        <div class="panel" style="padding:10px 12px;margin-top:10px">
          <div class="row between" style="gap:10px">
            <div class="grow"><b>Reto diario</b> <small style="color:var(--muted)">${today()}</small>
              <div style="font-size:13px;color:var(--muted)">Mismo mapa y mismos enemigos para todos hoy (sin modos ni dificultad a medida). Comparte tu tiempo con tus amigos.</div>
              ${db ? `<div style="font-size:13px" class="gold">${G.I18n.f('Tu mejor marca de hoy: {x}', G.U.mmss(db.time))}</div>` : ''}</div>
            <button class="btn gold" data-run="daily">Jugar</button>
          </div>
        </div>

        <div class="panel" style="padding:10px 12px;margin-top:8px">
          <div class="row between" style="gap:10px">
            <div class="grow"><b>Desafío legendario</b>
              <div style="font-size:13px;color:var(--muted)">Legendarios uno tras otro en la arena de la grieta. ¿Cuántos vences antes de caer?</div>
              ${lb ? `<div style="font-size:13px" class="gold">${G.I18n.f('Récord: {x}', lb)}</div>` : ''}</div>
            <button class="btn gold" data-run="legend">Jugar</button>
          </div>
        </div>

        <h3 class="set-h" style="margin-top:14px">Modos (para la run normal)</h3>
        ${TOGGLES.map(([k, name, desc]) => `
          <div class="set-row"><div class="grow"><b>${name}</b><small>${desc}</small></div>
            <button class="btn small switch ${sw(k) ? 'gold' : ''}" data-k="${k}">${sw(k) ? 'Sí' : 'No'}</button></div>`).join('')}

        <h3 class="set-h" style="margin-top:14px">Dificultad a medida</h3>
        ${SLIDERS.map(([k, name]) => `
          <div class="set-row"><div class="grow"><b>${name}</b></div>
            <input type="range" min="50" max="300" step="10" value="${sw(k) || 100}" data-s="${k}" style="width:160px">
            <span class="gold" style="width:52px;text-align:right" data-v="${k}">${sw(k) || 100}%</span></div>`).join('')}
        <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn small ghost" data-reset>Restablecer (100%)</button></div>
      </div>`;
    overlay.querySelector('[data-close]').onclick = closePanel;
    overlay.querySelectorAll('[data-run]').forEach(b => { b.onclick = () => start(b.dataset.run); });
    overlay.querySelectorAll('[data-k]').forEach(b => {
      b.onclick = () => { S().set(b.dataset.k, !S().get(b.dataset.k)); G.Audio.sfx('click'); render(); };
    });
    overlay.querySelectorAll('[data-s]').forEach(inp => {
      inp.oninput = () => { S().set(inp.dataset.s, +inp.value); overlay.querySelector(`[data-v="${inp.dataset.s}"]`).textContent = inp.value + '%'; };
    });
    overlay.querySelector('[data-reset]').onclick = () => { for (const [k] of SLIDERS) S().set(k, 100); render(); };
    if (G.I18n.walk) G.I18n.walk(overlay);
  }

  /** Texto bajo "Modos de juego" en el menú: qué está activo. */
  function summary() {
    const act = TOGGLES.filter(([k]) => S().get(k)).map(([, n]) => n.replace('Modo ', ''));
    if (SLIDERS.some(([k]) => (S().get(k) || 100) !== 100)) act.push('dificultad a medida');
    return act.length ? act.join(' · ') : 'Reto diario, legendarios y más';
  }

  return {
    on, scale, countMul, rewardMul, dailySeed, seeded, start, reset, afterRun, openPanel, summary, copy,
    get run() { return run; }
  };
})();
