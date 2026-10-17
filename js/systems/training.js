/* ============ training.js — Sala de entrenamiento (2026-10-16, lo pidió el dueño) ============
 * Run de prueba (G.Modes.run === 'training', sólo en solitario):
 *   - Unos muñecos Pikachu (1, 3 o 5) en corro a tu alrededor: no se mueven, no atacan
 *     y nunca caen (la vida se rellena tras cada golpe). Enseñan los números de siempre.
 *   - Arriba, el daño: total, últimos 5 s y por segundo (botón «Reiniciar»).
 *   - «Movimientos»: eliges hasta pl.maxMoves de TODOS los movimientos (también los
 *     exclusivos), con su nivel (1-5) o evolucionado, y se aplica sin volver a empezar.
 *   - Nada más: sin enemigos, jefes, eventos, grietas, tienda, escaleras ni clima
 *     (game.js usa un bucle reducido: trainingUpdate), sin experiencia ni cartas,
 *     invencible y sin premios ni récords al salir (game.js endRun).
 * Ajustes del panel guardados en este aparato (localStorage 'ps.training').
 */
G.Training = (() => {
  const KEY = 'ps.training';
  const DEX = 25;                         // Pikachu
  const COUNTS = [1, 3, 5];
  const HPS = [1000, 10000, 100000];      // vida de cada muñeco (cuenta para lo que pega por % de vida)
  const RING = 125;                       // radio del corro (en el móvil, en horizontal, cabe entero)
  const WIN = 5;                          // segundos de la ventana de "últimos 5 s"

  let cfg = load();
  let dummies = [];
  let hits = [];                          // [tiempo de juego, daño]
  let total = 0, firstAt = null, hudT = 0;
  let hud = null, panel = null, draft = null, query = '';

  function load() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* nada */ }
    c = c && typeof c === 'object' ? c : {};
    return {
      n: COUNTS.includes(c.n) ? c.n : 5,
      hp: HPS.includes(c.hp) ? c.hp : 10000,
      moves: Array.isArray(c.moves) ? c.moves.filter(x => Array.isArray(x) && G.Moves.BY_ID[x[0]]).slice(0, 5) : null
    };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* nada */ } }

  const on = () => G.Modes.run === 'training';
  const now = () => G.Game.st.time;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Math.round(v).toLocaleString('es');

  // ---------------- muñecos ----------------

  /** Muñeco: un Pikachu quieto que no ataca y nunca cae (cuenta todo el daño que recibe). */
  class Dummy extends G.Enemy {
    constructor(x, y, hp) {
      super({ dex: DEX, name: 'Pikachu', hp, spd: 0, dmg: 0, xp: 0, behavior: 'dummy' }, x, y, { hp: 1, spd: 1, dmg: 1 });
      this.dummy = true;
      this.hx = x; this.hy = y;
    }
    hurt(amount, color, dirX, dirY, knock, eff) {
      const before = this.hp;
      super.hurt(amount, color, dirX, dirY, 0, eff);
      const d = before - this.hp;
      if (d > 0) record(d);
      // Siempre con la vida llena: nunca cae y no salta nada de "al derrotar".
      this.hp = this.maxHp; this.dead = false;
    }
    die() { /* los muñecos no caen */ }
    update(dt, pl) {
      this.anim.update(dt);
      if (this.flash > 0) this.flash -= dt;
      this.bob += dt * 6;
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 0; }
      if (this.rootT > 0) this.rootT -= dt;
      if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shield = 0; }
      // Quemadura y veneno (igual que en Enemy.update), para que cuenten en el daño.
      if (this.burn > 0) {
        this.burnT -= dt; this.burnTick -= dt;
        if (this.burnTick <= 0) { this.burnTick = 0.5; this.hurt(1.6 * this.burn * (1 + pl.level * 0.06), '#ff9a4d'); }
        if (this.burnT <= 0) this.burn = 0;
      }
      if (this.poison > 0) {
        this.poisonT -= dt; this.poisonTick -= dt;
        if (this.poisonTick <= 0) { this.poisonTick = 0.6; this.hurt(this.maxHp * 0.012 * this.poison + 1, '#d47cf0'); }
        if (this.poisonT <= 0) this.poison = 0;
      }
      // Quieto en su sitio (empujones, atracciones y separación no lo mueven).
      this.x = this.hx; this.y = this.hy; this.kx = this.ky = 0;
      this.jump = null; this.jumpLift = 0;
      if (pl) this.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - this.y, pl.x - this.x));
      this.anim.loop('Idle', 1);
    }
  }

  /** Pone el corro de muñecos alrededor de (x, y) (quita los que hubiera). */
  function placeDummies(x, y) {
    for (const d of dummies) G.EnemyMgr.remove(d);
    dummies = [];
    G.Sprites.preload([DEX]);
    const n = cfg.n;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * (Math.PI * 2 / n);
      // Si ese punto cae en una pared o un objeto, se prueba un poco más cerca o más lejos.
      let px = x + Math.cos(a0) * RING, py = y + Math.sin(a0) * RING;
      for (const r of [RING, RING - 40, RING + 40, RING - 70, RING + 80]) {
        const qx = x + Math.cos(a0) * r, qy = y + Math.sin(a0) * r;
        if (G.World.isFree(qx, qy, 14)) { px = qx; py = qy; break; }
      }
      dummies.push(G.EnemyMgr.add(new Dummy(px, py, cfg.hp)));
    }
  }

  // ---------------- daño ----------------

  function record(d) {
    if (!on()) return;
    const t = now();
    if (firstAt == null) firstAt = t;
    total += d;
    hits.push([t, d]);
  }
  function resetStats() { hits = []; total = 0; firstAt = null; drawHud(); }
  function stats() {
    const t = now();
    while (hits.length && hits[0][0] < t - WIN) hits.shift();
    const last = hits.reduce((s, h) => s + h[1], 0);
    const span = firstAt == null ? 0 : Math.min(WIN, Math.max(0.5, t - firstAt));
    return { total, last, dps: span ? last / span : 0, avg: firstAt == null ? 0 : total / Math.max(0.5, t - firstAt) };
  }

  // ---------------- movimientos ----------------

  /** Lista [[id, nivel, evolucionado], ...] de lo que llevas ahora. */
  function current(pl) {
    const out = [];
    for (const g of pl.slots) for (const m of g) out.push([m.id, m.lvl, m.evolved ? 1 : 0]);
    return out;
  }

  /** Cambia tus movimientos por los de `list` sin empezar de nuevo. */
  function applyMoves(pl, list) {
    G.Projectiles.clearOrbs(pl);
    G.Projectiles.clear();
    G.Combat.clearFields();
    pl.moves = []; pl.slots = []; pl.active = -1;
    pl.bind = {};                                   // el orden, el que eliges aquí
    // Lo que dejan puesto algunos pasivos / apoyos (se recalcula cada fotograma si siguen).
    pl.bulkArmor = 0; pl.bulkRed = 0; pl.bulkField = false; pl.supRed = 0; pl.calmN = 0;
    if (pl.bulkHp) { pl.maxHp = Math.max(1, pl.maxHp - pl.bulkHp); pl.bulkHp = 0; }
    for (const [id, lvl, evo] of list.slice(0, pl.maxMoves)) {
      if (!pl.addMove(id)) continue;
      const m = pl.moves[pl.moves.length - 1];
      const want = evo ? m.def.maxLvl : Math.max(1, Math.min(m.def.maxLvl, lvl | 0));
      while (m.lvl < want && G.Moves.levelUp(m)) { /* sube */ }
      if (evo && canEvolve(m.id)) G.Moves.evolve(m);
    }
    pl.arrange();
    pl.active = -1;
    const i = pl.slots.findIndex((g, k) => !pl.passiveSlot(k));
    if (i >= 0) pl.setActive(i); else pl.active = 0;
    pl.hp = pl.maxHp;
    cfg.moves = current(pl);
    save();
  }
  const canEvolve = id => { const d = G.Moves.BY_ID[id]; return !!(d && G.Moves.EVO[id] && G.Moves.EVO_MODS[d.kind]); };

  // ---------------- run ----------------

  /** Al empezar la run (game.js startRun): invencible, muñecos y tus movimientos guardados. */
  function begin(pl) {
    pl.god = true;
    resetStats();
    if (cfg.moves && cfg.moves.length) applyMoves(pl, cfg.moves);
    placeDummies(pl.x, pl.y);
    showHud();
    G.Spawner.say(G.T('Sala de entrenamiento'), 2.4, true);
    setTimeout(() => { if (on() && G.Game.state === 'playing' && !cfg.moves) openPanel(); }, 400);
  }

  /** Cada fotograma (game.js trainingUpdate). */
  function update(dt, pl) {
    pl.hp = pl.maxHp;
    // Si algo se ha llevado un muñeco (no debería), se vuelve a poner el corro.
    if (dummies.some(d => G.EnemyMgr.get(d.id) !== d)) {
      const c = dummies[0] ? [dummies.reduce((s, d) => s + d.hx, 0) / dummies.length, dummies.reduce((s, d) => s + d.hy, 0) / dummies.length] : [pl.x, pl.y];
      placeDummies(c[0], c[1]);
    }
    if ((hudT -= dt) <= 0) { hudT = 0.2; drawHud(); }
    if (hud) hud.style.display = G.UI.isOpen('scr-pause') ? 'none' : '';
  }

  /** Al salir (game.js endRun). */
  function end() {
    closePanel();
    if (hud) { hud.remove(); hud = null; }
    dummies = []; hits = []; total = 0; firstAt = null;
  }

  // ---------------- HUD ----------------

  function showHud() {
    if (hud) hud.remove();
    hud = document.createElement('div');
    hud.id = 'training-hud';
    // Arriba a la izquierda, bajo la barra de vida (en el centro tapaba al muñeco de arriba).
    hud.style.cssText = 'position:fixed;top:64px;left:14px;z-index:18;display:flex;flex-direction:column;gap:3px;min-width:150px;' +
      'padding:8px 10px;border-radius:10px;background:rgba(10,18,40,.78);border:1px solid #ffffff22;font-size:13px;color:#e8eefc;';
    const line = (k, t, col) => `<div style="display:flex;justify-content:space-between;gap:12px"><span>${G.T(k)}</span><b data-t="${t}"${col ? ` style="color:${col}"` : ''}>0</b></div>`;
    hud.innerHTML = `<b style="color:#ffd23f">${G.T('Sala de entrenamiento')}</b>
      ${line('Daño total', 'total')}${line('Últimos 5 s', 'last')}${line('Por segundo', 'dps', '#7dffb0')}
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="btn small" type="button" data-act="reset">${G.T('Reiniciar')}</button>
        <button class="btn small gold" type="button" data-act="moves">${G.T('Movimientos')}</button>
        <button class="btn small ghost" type="button" data-act="quit">${G.T('Salir de la sala')}</button></div>`;
    hud.querySelector('[data-act="reset"]').onclick = e => { e.currentTarget.blur(); resetStats(); G.Audio.sfx('click'); };
    hud.querySelector('[data-act="moves"]').onclick = e => { e.currentTarget.blur(); openPanel(); };
    hud.querySelector('[data-act="quit"]').onclick = e => { e.currentTarget.blur(); G.Game.quit(); };
    document.body.appendChild(hud);
    drawHud();
  }
  function drawHud() {
    if (!hud) return;
    // Móvil: debajo del bloque de la izquierda del HUD (va escalado, hud.js) y fuera de la muesca.
    const touch = G.Touch.active, top = touch ? Math.max(64, Math.round(G.HUD.leftBottom + 6)) : 64, left = 14 + (touch ? G.HUD.SL : 0);
    if (hud.dataset.pos !== top + ',' + left) { hud.dataset.pos = top + ',' + left; hud.style.top = top + 'px'; hud.style.left = left + 'px'; }
    const s = stats();
    hud.querySelector('[data-t="total"]').textContent = num(s.total);
    hud.querySelector('[data-t="last"]').textContent = num(s.last);
    hud.querySelector('[data-t="dps"]').textContent = num(s.dps);
  }

  // ---------------- panel de movimientos ----------------

  const isOpen = () => !!panel;

  function openPanel() {
    const pl = G.Game.player;
    if (!on() || !pl || panel) return;
    draft = { moves: current(pl), n: cfg.n, hp: cfg.hp };
    query = '';
    panel = document.createElement('div');
    panel.id = 'training-panel';
    panel.className = 'pn-ov';
    panel.style.cssText = 'position:fixed;inset:0;z-index:66;display:flex;align-items:center;justify-content:center;background:rgba(5,9,20,.6)';
    panel.onclick = e => { if (e.target === panel) closePanel(); };
    document.body.appendChild(panel);
    render();
    G.Audio.sfx('click');
  }
  function closePanel() { if (panel) { panel.remove(); panel = null; draft = null; } }

  function moveChip(id) {
    const d = G.Moves.BY_ID[id];
    return `<span class="type" style="background:${G.U.TYPE_COLOR[d.type] || '#888'}">${G.T(G.U.TYPE_NAME[d.type] || d.type)}</span>`;
  }

  function render() {
    if (!panel) return;
    const pl = G.Game.player, max = pl ? pl.maxMoves : 5;
    const rows = draft.moves.map(([id, lvl, evo], i) => {
      const d = G.Moves.BY_ID[id], ml = d.maxLvl;
      const lv = [];
      for (let k = 1; k <= ml; k++) lv.push(`<button class="btn small ${!evo && lvl === k ? 'gold' : ''}" data-lv="${i}:${k}" style="min-width:30px;padding:4px 6px">${k}</button>`);
      if (canEvolve(id)) lv.push(`<button class="btn small ${evo ? 'gold' : ''}" data-lv="${i}:evo" title="${esc(G.T(G.Moves.EVO[id][0]))}" style="padding:4px 8px">★ ${G.T('Evolucionado')}</button>`);
      return `<div class="set-row" style="gap:8px;flex-wrap:wrap">
        <div class="grow" style="min-width:140px"><b>${i + 1}. ${esc(G.T(evo ? G.Moves.EVO[id][0] : d.name))}</b> ${moveChip(id)}
          ${d.only ? `<small style="color:#ff9ed8">${G.T('Exclusivo')}</small>` : ''}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${lv.join('')}</div>
        <div style="display:flex;gap:4px">
          <button class="btn small ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="${esc(G.T('Subir'))}">▲</button>
          <button class="btn small ghost" data-del="${i}" title="${esc(G.T('Quitar movimiento'))}">✕</button></div></div>`;
    }).join('') || `<p class="sub">${G.T('Ningún movimiento: elige alguno de la lista de abajo.')}</p>`;
    const q = query.trim().toLowerCase();
    const list = G.Moves.ALL.filter(d => {
      if (!q) return true;
      return [d.name, G.T(d.name), d.id, G.U.TYPE_NAME[d.type] || '', G.T(G.U.TYPE_NAME[d.type] || '')].some(s => String(s).toLowerCase().includes(q));
    });
    const full = draft.moves.length >= max;
    panel.innerHTML = `
      <div class="box pn-sheet pn-train" style="width:min(720px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:16px 18px">
        <div class="row between pn-bar"><h3 style="margin:0">${G.T('Sala de entrenamiento')} · ${G.T('Movimientos')}</h3>
          <button class="btn small ghost" data-close>${G.T('Volver')}</button></div>
        <div class="pn-col"><p class="sub" style="margin:6px 0 0">${G.I18n.f('Elige hasta {x} movimientos (de todos) y su nivel; se aplica sin volver a empezar.', max)}</p>
        <div style="margin-top:8px">${rows}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center">
          <span>${G.T('Muñecos')}</span>${COUNTS.map(n => `<button class="btn small ${draft.n === n ? 'gold' : ''}" data-n="${n}">${n}</button>`).join('')}
          <span style="margin-left:10px">${G.T('Vida de cada muñeco')}</span>${HPS.map(h => `<button class="btn small ${draft.hp === h ? 'gold' : ''}" data-hp="${h}">${num(h)}</button>`).join('')}
        </div>
        <small style="color:var(--muted)">${G.T('La vida sólo cambia lo que quita un % de la vida (veneno...). Los muñecos nunca caen.')}</small>
        <div class="row" style="gap:8px;margin-top:10px;justify-content:flex-end">
          <button class="btn small ghost" data-clear>${G.T('Quitar todos')}</button>
          <button class="btn gold" data-apply>${G.T('Aplicar')}</button></div></div>
        <div class="pn-col"><h3 class="set-h" style="margin-top:12px">${G.T('Todos los movimientos')} <small style="color:var(--muted)">${full ? G.I18n.f('(máximo {x})', max) : ''}</small></h3>
        <input type="search" data-q value="${esc(query)}" placeholder="${esc(G.T('Buscar por nombre o tipo…'))}" style="width:100%;margin:4px 0 8px;padding:6px 8px;border-radius:8px;border:1px solid #ffffff33;background:#0b1430;color:#fff">
        <div data-list style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px">
          ${list.map(d => {
            const has = draft.moves.some(x => x[0] === d.id);
            return `<button class="btn small ${has ? 'gold' : ''}" data-add="${d.id}" ${!has && full ? 'disabled' : ''}
              style="display:flex;align-items:center;gap:6px;justify-content:flex-start;text-align:left">
              <i style="flex:0 0 10px;height:10px;border-radius:50%;background:${G.U.TYPE_COLOR[d.type] || '#888'}"></i>
              <span>${esc(G.T(d.name))}${d.only ? ' ✦' : ''}</span></button>`;
          }).join('')}
        </div></div>
      </div>`;
    const $$ = s => panel.querySelectorAll(s);
    panel.querySelector('[data-close]').onclick = closePanel;
    $$('[data-lv]').forEach(b => {
      b.onclick = () => {
        const [i, v] = b.dataset.lv.split(':'), row = draft.moves[+i];
        if (v === 'evo') { row[2] = row[2] ? 0 : 1; if (row[2]) row[1] = G.Moves.BY_ID[row[0]].maxLvl; }
        else { row[1] = +v; row[2] = 0; }
        G.Audio.sfx('click'); render();
      };
    });
    $$('[data-up]').forEach(b => { b.onclick = () => { const i = +b.dataset.up; if (i > 0) { const m = draft.moves; [m[i - 1], m[i]] = [m[i], m[i - 1]]; render(); } }; });
    $$('[data-del]').forEach(b => { b.onclick = () => { draft.moves.splice(+b.dataset.del, 1); G.Audio.sfx('click'); render(); }; });
    $$('[data-n]').forEach(b => { b.onclick = () => { draft.n = +b.dataset.n; render(); }; });
    $$('[data-hp]').forEach(b => { b.onclick = () => { draft.hp = +b.dataset.hp; render(); }; });
    $$('[data-add]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.add, i = draft.moves.findIndex(x => x[0] === id);
        if (i >= 0) draft.moves.splice(i, 1);
        else if (draft.moves.length < max) draft.moves.push([id, 1, 0]);
        G.Audio.sfx('click'); render();
      };
    });
    panel.querySelector('[data-clear]').onclick = () => { draft.moves = []; render(); };
    panel.querySelector('[data-apply]').onclick = apply;
    const inp = panel.querySelector('[data-q]');
    // Las teclas del buscador no llegan al juego (el espacio y las flechas no se pierden).
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closePanel(); });
    inp.oninput = () => {
      query = inp.value;
      const pos = inp.selectionStart;
      render();
      const again = panel && panel.querySelector('[data-q]');
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* nada */ } }
    };
  }

  function apply() {
    const pl = G.Game.player;
    if (!pl || !draft) return;
    const reDummies = draft.n !== cfg.n || draft.hp !== cfg.hp;
    cfg.n = draft.n; cfg.hp = draft.hp;
    applyMoves(pl, draft.moves);
    if (reDummies || !dummies.length) placeDummies(pl.x, pl.y);
    resetStats();
    G.Audio.sfx('confirm');
    closePanel();
  }

  return { begin, update, end, openPanel, closePanel, isOpen, resetStats, applyMoves, stats,
           get dummies() { return dummies; }, get cfg() { return cfg; } };
})();
