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
 *   'weekly' / 'tower' / 'stage'   reto semanal, torre sin fin y aventura
 *             (challenges.js y stages.js): cada uno trae sus propias reglas
 *
 * Los ajustes de arriba (modos, escenario y dificultad a medida) SÓLO valen en la
 * run normal. Los retos, la torre, la aventura y los legendarios no los usan:
 * llevan sus reglas (`rules`), así nunca se pisan.
 */
G.Modes = (() => {
  const $ = id => document.getElementById(id);
  let run = 'normal';
  // Partida en grupo: los modos los pone la sala ({ boss, shiny }), no los ajustes de cada uno.
  let roomMods = null;
  /**
   * Reglas del modo especial en curso (reto semanal, torre, aventura...):
   *   hp, spd, dmg, count, reward   multiplicadores de los enemigos / del premio
   *   boss     sólo jefes · shiny   todos shiny · types   sólo Pokémon de esos tipos
   *   glass    tu vida ×0,3 y tu ataque ×2 · meSpd   tu velocidad ×
   *   heal     cuánto curas (0 = nada) · dark   oscuridad alrededor (1, 2, 3...)
   */
  let rules = null;
  const S = () => G.Settings;
  const fair = () => run !== 'normal';
  const R = (k, d) => (rules && rules[k] != null ? rules[k] : d);

  /** ¿Está activo un modo? 'shiny' | 'boss' | 'extreme' */
  function on(k) {
    if (rules && rules[k] != null) return !!rules[k];     // la regla del modo manda (reto semanal: sólo jefes)
    if (roomMods) return !!roomMods[k];
    if (rules) return false;
    return !fair() && !!S().get(k + 'Mode');
  }
  const pct = k => (fair() || roomMods ? 1 : (S().get(k) || 100) / 100);

  const hpMul = () => pct('diffHp') * R('hp', 1);
  const spdMul = () => pct('diffSpd') * (on('extreme') ? 1.4 : 1) * R('spd', 1);
  const dmgMul = () => (on('extreme') ? 2 : 1) * R('dmg', 1);
  const countMul = () => pct('diffCount') * R('count', 1);
  const rewardMul = () => (on('extreme') ? 2 : 1) * R('reward', 1);
  /** Cuánto cura lo que te cura (1 = normal). */
  const healMul = () => R('heal', 1);

  /** Escenario fijo elegido (índice de bioma) o null para el turno normal. Sólo en la run normal. */
  function scene() {
    const v = S().get('scene');
    return !fair() && Number.isInteger(v) && G.Tiles.SCENES.includes(v) ? v : null;
  }
  /** Pone las reglas del modo especial (o null). */
  function setRules(r) { rules = r ? Object.assign({}, r) : null; }
  /** Valor de una regla (o undefined). */
  function rule(k) { return rules ? rules[k] : undefined; }

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
  function reset() { run = 'normal'; roomMods = null; rules = null; }
  /** Al empezar una partida en grupo: los modos de la sala. */
  function setRoom(mods) {
    roomMods = Object.assign({ boss: false, shiny: false, rush: false, stage: null, ch: null }, mods);
    if (Number.isInteger(roomMods.stage) && G.Stages.LIST[roomMods.stage]) {
      // Aventura en grupo: la fase que eligió el anfitrión (sin modo jefes / shiny).
      run = 'stage'; G.Stages.select(roomMods.stage);
      roomMods.boss = roomMods.shiny = roomMods.rush = false;
    } else if (['daily', 'weekly', 'tower'].includes(roomMods.ch)) {
      // Desafío en grupo (con su clasificación de grupo, challenges.js).
      run = roomMods.ch; roomMods.boss = roomMods.shiny = roomMods.rush = false;
    } else if (roomMods.rush) run = 'legend';   // Desafío legendario en grupo
  }

  /** Tras el resumen de la run: el resultado del reto o de los legendarios. */
  function afterRun(r) {
    const box = $('over-stats');
    if (!box) { reset(); return; }
    let html = '';
    if (run === 'daily' && !r.group) {
      const mon = G.T(G.DEX_BY[r.dex].name);
      const line = G.I18n.f('Pokémon Dungeon Survivors · Reto diario {x} · {x} · {x} · Lv {x} · {x} derrotados',
        today(), mon, G.U.mmss(r.time), r.level, r.kills);
      const best = dailyBest();
      const better = !best || r.time > best.time;
      if (better) writeJSON(KEY_DAILY + today(), { time: Math.floor(r.time), level: r.level, kills: r.kills, dex: r.dex });
      postDaily(r);
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

  // ---------------- clasificación del reto diario (Firestore: daily/{fecha}/r/{uid}) ----------------

  const dailyCol = () => G.DB.fb.fs.collection('daily').doc(today()).collection('r');

  /** Sube tu marca de hoy si es mejor que la que había (sólo con cuenta de Google). */
  async function postDaily(r) {
    if (!G.DB.online) return;
    try {
      const ref = dailyCol().doc(G.DB.fb.uid);
      const old = await ref.get();
      if (old.exists && (old.data().t || 0) >= Math.floor(r.time)) return;
      await ref.set({ name: String(G.DB.user || '').slice(0, 16), t: Math.floor(r.time), lv: r.level | 0, kills: r.kills | 0, dex: r.dex | 0,
                      at: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (e) { console.warn('[Reto diario] no se pudo subir:', e.code || e.message); }
  }

  /** Ventana con la clasificación de hoy. */
  async function openBoard() {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(5,9,20,.7)';
    ov.innerHTML = `<div class="box" style="width:min(520px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:18px 20px">
      <div class="row between"><h3 style="margin:0">${G.T('Clasificación de hoy')} <small style="color:var(--muted)">${today()}</small></h3>
      <button class="btn small ghost" data-close>${G.T('Volver')}</button></div><div id="db-list" style="margin-top:10px">${G.T('Cargando…')}</div></div>`;
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.querySelector('[data-close]').onclick = () => ov.remove();
    document.body.appendChild(ov);
    const list = ov.querySelector('#db-list');
    if (!G.DB.online) { list.textContent = G.T('Vincula tu cuenta de Google para salir en la clasificación y verla.'); return; }
    try {
      const snap = await dailyCol().orderBy('t', 'desc').limit(50).get();
      const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const me = G.DB.fb.uid;
      list.innerHTML = snap.empty ? G.T('Nadie ha jugado el reto de hoy todavía. ¡Sé el primero!')
        : `<table style="width:100%;border-collapse:collapse;font-size:14px">` + snap.docs.map((d, i) => {
            const v = d.data(), mon = G.DEX_BY[v.dex];
            return `<tr${d.id === me ? ' class="gold"' : ''} style="border-bottom:1px solid #ffffff14">
              <td style="padding:4px 6px">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
              <td translate="no">${esc(v.name)}</td><td>${mon ? G.T(mon.name) : ''}</td>
              <td><b>${G.U.mmss(v.t)}</b></td><td>Lv ${v.lv}</td><td>${v.kills} ${G.T('derrotados')}</td></tr>`;
          }).join('') + '</table>';
    } catch (e) { list.textContent = G.T('No se pudo cargar la clasificación.'); console.warn(e); }
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
    const sw = k => S().get(k);
    overlay.innerHTML = `
      <div class="box" style="width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:18px 20px">
        <div class="row between"><h3 style="margin:0">Reglas a medida</h3><button class="btn small ghost" data-close>Volver</button></div>
        <p class="sub" style="margin:6px 0 0">Sólo cambian «Jugar» (la run normal) y las partidas en grupo normales que crees tú. La aventura y los desafíos llevan sus propias reglas y no usan estas.</p>

        <h3 class="set-h" style="margin-top:14px">Modos</h3>
        ${TOGGLES.map(([k, name, desc]) => `
          <div class="set-row"><div class="grow"><b>${name}</b><small>${desc}</small></div>
            <button class="btn small switch ${sw(k) ? 'gold' : ''}" data-k="${k}">${sw(k) ? 'Sí' : 'No'}</button></div>`).join('')}

        <h3 class="set-h" style="margin-top:14px">Escenario</h3>
        <p class="sub" style="margin:0 0 6px">Con uno elegido, toda la partida es en él (en grupo vale el del anfitrión).</p>
        <div class="scene-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px">
          <button class="btn small ${S().get('scene') == null ? 'gold' : ''}" data-scene="">Turno normal</button>
          ${G.Tiles.SCENES.map(i => { const B = G.Tiles.BIOMES[i], on = S().get('scene') === i;
            return `<button class="btn small ${on ? 'gold' : ''}" data-scene="${i}" style="display:flex;align-items:center;gap:6px;justify-content:flex-start">
              <i style="flex:0 0 14px;height:14px;border-radius:3px;border:1px solid #0006;background:linear-gradient(135deg,${B.floor[0]} 50%,${B.leaf[2]} 50%)"></i>${B.name}</button>`; }).join('')}
        </div>

        <h3 class="set-h" style="margin-top:14px">Dificultad a medida</h3>
        ${SLIDERS.map(([k, name]) => `
          <div class="set-row"><div class="grow"><b>${name}</b></div>
            <input type="range" min="50" max="300" step="10" value="${sw(k) || 100}" data-s="${k}" style="width:160px">
            <span class="gold" style="width:52px;text-align:right" data-v="${k}">${sw(k) || 100}%</span></div>`).join('')}
        <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn small ghost" data-reset>Restablecer (100%)</button></div>
      </div>`;
    overlay.querySelector('[data-close]').onclick = closePanel;
    overlay.querySelectorAll('[data-k]').forEach(b => {
      b.onclick = () => { S().set(b.dataset.k, !S().get(b.dataset.k)); G.Audio.sfx('click'); render(); };
    });
    overlay.querySelectorAll('[data-s]').forEach(inp => {
      inp.oninput = () => { S().set(inp.dataset.s, +inp.value); overlay.querySelector(`[data-v="${inp.dataset.s}"]`).textContent = inp.value + '%'; };
    });
    overlay.querySelector('[data-reset]').onclick = () => { for (const [k] of SLIDERS) S().set(k, 100); render(); };
    overlay.querySelectorAll('[data-scene]').forEach(b => {
      b.onclick = () => { S().set('scene', b.dataset.scene === '' ? null : +b.dataset.scene); G.Audio.sfx('click'); render(); };
    });
    if (G.I18n.walk) G.I18n.walk(overlay);
  }

  /** Texto bajo "Modos de juego" en el menú: qué está activo. */
  function summary() {
    const act = TOGGLES.filter(([k]) => S().get(k)).map(([, n]) => n);
    if (SLIDERS.some(([k]) => (S().get(k) || 100) !== 100)) act.push('Dificultad a medida');
    const sc = scene();
    if (sc != null) act.push(G.Tiles.BIOMES[sc].name);
    return act.length ? act.join(' · ') : '';
  }

  return {
    openBoard, on, scene, scale, countMul, rewardMul, healMul, setRules, rule, dailySeed, seeded, rng, start, reset, setRoom, afterRun, openPanel, summary, copy,
    today, dailyBest, legendBest, closePanel,
    get run() { return run; }
  };
})();
