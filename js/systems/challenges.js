/* ============ challenges.js — desafíos: reto semanal y torre sin fin ============
 * Ventana "Desafíos" del menú: reto diario (modes.js), reto semanal, torre sin
 * fin y desafío legendario (rift.js). Ninguno usa las "Reglas a medida": cada
 * uno trae las suyas (G.Modes.setRules).
 *
 *   reto semanal  una regla rara distinta cada semana (lunes a domingo), mismo mapa
 *                 y mismos enemigos para todos esa semana. Clasificación por tiempo.
 *   torre         cada minuto subes un piso y se añade una maldición al azar
 *                 (más vida, más daño, oscuridad...). ¿Hasta qué piso llegas?
 *
 * Clasificaciones: Firestore boards/{clave}/r/{uid} (sólo con cuenta de Google).
 * En grupo (sala "Equipo" → Qué jugar) los tres retos también se juegan juntos; su
 * marca va a una clasificación de grupo aparte (clave + '-team', la sube el anfitrión
 * con los nombres de todos). En la torre, los pisos y maldiciones los manda él ('twr').
 */
G.Challenges = (() => {
  // ---------------- reto semanal ----------------

  /** Semana ISO: { year, week, key: '2026-W42' }. */
  function isoWeek(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t - y0) / 86400000 + 1) / 7);
    return { year: t.getUTCFullYear(), week, key: t.getUTCFullYear() + '-W' + String(week).padStart(2, '0') };
  }
  const weekSeed = () => { const w = isoWeek(); return w.year * 100 + w.week; };

  // Una regla por semana (van rotando).
  const WEEKLY = [
    { id: 'ghost', name: 'Semana fantasmal', desc: 'Sólo salen Pokémon de tipo Fantasma y Siniestro.', rules: { types: ['ghost', 'dark'] } },
    { id: 'glass', name: 'Cañón de cristal', desc: 'Tu vida ×0,3, pero tu ataque ×2.', rules: { glass: 1 } },
    { id: 'boss', name: 'Semana de jefes', desc: 'Sólo salen jefes, cada vez más.', rules: { boss: true } },
    { id: 'fast', name: 'A toda velocidad', desc: 'Los enemigos van ×1,4 más rápido y tú ×1,3.', rules: { spd: 1.4, meSpd: 1.3 } },
    { id: 'giant', name: 'Gigantes', desc: 'La mitad de enemigos, pero con ×2,5 de vida. Premio ×1,5.', rules: { hp: 2.5, count: 0.5, reward: 1.5 } },
    { id: 'dark', name: 'Noche cerrada', desc: 'Sólo ves lo que tienes cerca.', rules: { dark: 1 } },
    { id: 'noheal', name: 'Sin curas', desc: 'Nada te cura: ni bayas ni regeneración.', rules: { heal: 0 } },
    { id: 'dragon', name: 'Dragones y acero', desc: 'Sólo salen Pokémon de tipo Dragón y Acero.', rules: { types: ['dragon', 'steel'] } }
  ];
  const weekly = () => WEEKLY[weekSeed() % WEEKLY.length];

  // ---------------- torre sin fin ----------------

  const FLOOR = 60;          // segundos por piso
  const CURSES = [
    { id: 'hp', name: 'Enemigos más duros', apply: r => { r.hp = (r.hp || 1) * 1.25; } },
    { id: 'dmg', name: 'Enemigos más fuertes', apply: r => { r.dmg = (r.dmg || 1) * 1.2; } },
    { id: 'spd', name: 'Enemigos más rápidos', apply: r => { r.spd = (r.spd || 1) * 1.1; } },
    { id: 'count', name: 'Más enemigos', apply: r => { r.count = (r.count || 1) * 1.2; } },
    { id: 'heal', name: 'Curas más débiles', apply: r => { r.heal = (r.heal == null ? 1 : r.heal) * 0.7; } },
    { id: 'dark', name: 'Oscuridad', apply: r => { r.dark = Math.min(3, (r.dark || 0) + 1); } },
    { id: 'boss', name: '¡Un jefe!', once: true }
  ];
  let tower = null;          // { floor, curses: [id] }

  // ---------------- récords (este dispositivo) ----------------
  const KEY_W = 'ps.weekly.', KEY_T = 'ps.tower.best';
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } }
  const weeklyBest = () => readJSON(KEY_W + isoWeek().key);
  const towerBest = () => readJSON(KEY_T) || 0;

  // ---------------- al empezar / durante / al acabar ----------------

  /** Al empezar una run (antes de sortear el mapa): reglas del modo. */
  function prepare() {
    const run = G.Modes.run;
    tower = null;
    if (run === 'weekly') G.Modes.setRules(weekly().rules);
    else if (run === 'tower') { G.Modes.setRules({}); tower = { floor: 1, curses: [] }; }
    else if (run === 'legend' || run === 'daily') G.Modes.setRules({});
  }
  /** Semilla del mapa: igual para todos (reto diario / semanal) o null. */
  function seed() {
    if (G.Modes.run === 'daily') return G.Modes.dailySeed();
    if (G.Modes.run === 'weekly') return weekSeed();
    return null;
  }
  /** Ya con tu Pokémon creado: lo que te cambian las reglas. */
  function applyPlayer(pl) {
    if (G.Modes.rule('glass')) { pl.maxHp = pl.hp = Math.max(1, Math.round(pl.maxHp * 0.3)); pl.atkMul *= 2; pl.glassK = 0.3; }
    const ms = G.Modes.rule('meSpd');
    if (ms) pl.spdMul *= ms;
  }

  /** Cada fotograma (solitario o anfitrión): sube de piso en la torre. */
  function update(dt, time, pl) {
    if (!tower || (G.Coop.active && !G.Coop.isHost)) return;
    const f = 1 + Math.floor(time / FLOOR);
    if (f <= tower.floor) return;
    tower.floor = f;
    // En la arena de una grieta no sale el jefe (se perdería al volver): otra maldición.
    const c = G.U.pick(G.Rift.inArena ? CURSES.filter(x => !x.once) : CURSES);
    if (c.once) {
      G.Spawner.spawnBossNow(pl, time);
    } else {
      const r = Object.assign({}, rulesNow());
      c.apply(r);
      G.Modes.setRules(r);
      tower.curses.push(c.id);
    }
    if (G.Coop.isHost) G.Coop.broadcast(['twr', f, rulesNow(), tower.curses, c.id]);
    G.Spawner.say(G.I18n.f('Piso {x}', f) + ' · ' + G.T(c.name), 3, true);
    G.Audio.sfx('boss');
    G.FX.ring(pl.x, pl.y, 10, G.Camera.outerRadius(), '#c47bff', 0.7, 6);
  }
  function rulesNow() {
    const r = {};
    for (const k of ['hp', 'dmg', 'spd', 'count', 'heal', 'dark']) { const v = G.Modes.rule(k); if (v != null) r[k] = v; }
    return r;
  }

  /** Invitado: piso nuevo de la torre (reglas para la oscuridad y las curas, y el HUD). */
  function onNet(ev) {
    if (ev[0] !== 'twr' || G.Modes.run !== 'tower') return;
    tower = tower || { floor: 1, curses: [] };
    tower.floor = ev[1]; tower.curses = ev[3] || [];
    G.Modes.setRules(ev[2] || {});
    const c = CURSES.find(x => x.id === ev[4]);
    if (c) G.Spawner.say(G.I18n.f('Piso {x}', ev[1]) + ' · ' + G.T(c.name), 3, true);
  }
  /** Clave de la clasificación de un reto (en grupo, la suya aparte). */
  function boardKey(run, group) {
    const k = run === 'daily' ? 'd-' + G.Modes.today() : run === 'weekly' ? 'w-' + isoWeek().key : 'tower';
    return group ? k + '-team' : k;
  }

  /** Texto para el HUD: "Piso 4 · ..." (o null). */
  function hudLine() {
    if (G.Modes.run === 'tower' && tower) {
      const n = {};
      for (const id of tower.curses) n[id] = (n[id] || 0) + 1;
      const names = Object.keys(n).map(id => G.T(CURSES.find(c => c.id === id).name) + (n[id] > 1 ? ' ×' + n[id] : ''));
      return { title: G.I18n.f('Piso {x}', tower.floor), sub: names.join(' · ') };
    }
    if (G.Modes.run === 'weekly') return { title: G.T('Reto semanal'), sub: G.T(weekly().name) };
    return null;
  }

  /** Tras el resumen: marca del reto semanal o piso de la torre (antes de G.Modes.afterRun). */
  function afterRun(r) {
    const box = document.getElementById('over-stats');
    const run = G.Modes.run;
    if (!box || (run !== 'weekly' && run !== 'tower' && !(run === 'daily' && r.group))) return;
    if (r.group) { teamAfterRun(r, box, run); return; }
    let html = '';
    if (run === 'weekly') {
      const wk = isoWeek().key, best = weeklyBest();
      const better = !best || r.time > best.time;
      if (better) writeJSON(KEY_W + wk, { time: Math.floor(r.time), level: r.level, kills: r.kills, dex: r.dex });
      post('w-' + wk, Math.floor(r.time), r);
      G.DB.save.stats.weeklyRuns = (G.DB.save.stats.weeklyRuns || 0) + 1;
      html = `<div style="grid-column:1/-1;text-align:center" class="panel"><span>${G.T('Reto semanal')} · ${G.T(weekly().name)}</span>
        <div class="${better ? 'gold' : ''}">${better ? G.T('¡Tu mejor marca de la semana!') : G.I18n.f('Tu mejor marca de la semana: {x}', G.U.mmss(best.time))}</div></div>`;
    } else {
      const floor = tower ? tower.floor : 1, best = towerBest();
      if (floor > best) writeJSON(KEY_T, floor);
      post('tower', floor, r);
      const st = G.DB.save.stats; st.bestTower = Math.max(st.bestTower || 0, floor);
      html = `<div style="grid-column:1/-1;text-align:center" class="panel"><span>${G.T('Torre sin fin')}</span>
        <b class="gold">${G.I18n.f('Has llegado al piso {x}', floor)}</b>
        <div style="color:var(--muted)">${floor > best ? G.T('¡Nuevo récord!') : G.I18n.f('Récord: piso {x}', best)}</div></div>`;
    }
    G.DB.commit();
    box.insertAdjacentHTML('beforeend', html);
    tower = null;
  }

  /** En grupo: la marca del grupo (la sube el anfitrión) y nada de récords en solitario. */
  function teamAfterRun(r, box, run) {
    const floor = tower ? tower.floor : 1;
    if (run === 'weekly' && G.DB.save) { G.DB.save.stats.weeklyRuns = (G.DB.save.stats.weeklyRuns || 0) + 1; G.DB.commit(); }
    const v = run === 'tower' ? floor : Math.floor(r.time);
    const names = (r.names || []).join('、').slice(0, 48);
    if (r.host) post(boardKey(run, true), v, r, names);
    const label = run === 'daily' ? G.T('Reto diario') : run === 'weekly' ? G.T('Reto semanal') + ' · ' + G.T(weekly().name) : G.T('Torre sin fin');
    box.insertAdjacentHTML('beforeend', `<div style="grid-column:1/-1;text-align:center" class="panel"><span>${label} · ${G.T('en grupo')}</span>
      <b class="gold">${run === 'tower' ? G.I18n.f('Has llegado al piso {x}', floor) : G.U.mmss(r.time)}</b>
      <div style="color:var(--muted)">${G.T('La marca del grupo va a la clasificación de grupos.')}</div></div>`);
    tower = null;
  }

  // ---------------- clasificaciones (boards/{clave}/r/{uid}) ----------------

  const col = key => G.DB.fb.fs.collection('boards').doc(key).collection('r');

  /** Sube tu marca si es mejor (v = puntuación: segundos o piso). */
  async function post(key, v, r, name) {
    if (!G.DB.online) return;
    try {
      const ref = col(key).doc(G.DB.fb.uid);
      const old = await ref.get();
      if (old.exists && (old.data().v || 0) >= v) return;
      await ref.set({ name: String(name || G.DB.user || '').slice(0, 48), v: v | 0, t: Math.floor(r.time) | 0, lv: r.level | 0, dex: r.dex | 0,
                      at: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (e) { console.warn('[Desafíos] no se pudo subir:', e.code || e.message); }
  }

  /** Ventana con una clasificación. fmt(v) = cómo se escribe la marca. */
  async function openBoard(key, title, fmt, group = false) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:72;display:flex;align-items:center;justify-content:center;background:rgba(5,9,20,.7)';
    ov.innerHTML = `<div class="box" style="width:min(520px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:18px 20px">
      <div class="row between"><h3 style="margin:0">${title}</h3>
      <button class="btn small ghost" data-close>${G.T('Volver')}</button></div><div data-list style="margin-top:10px">${G.T('Cargando…')}</div></div>`;
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.querySelector('[data-close]').onclick = () => ov.remove();
    document.body.appendChild(ov);
    const list = ov.querySelector('[data-list]');
    if (!G.DB.online) { list.textContent = G.T('Vincula tu cuenta de Google para salir en la clasificación y verla.'); return; }
    try {
      const snap = await col(key).orderBy('v', 'desc').limit(50).get();
      const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const me = G.DB.fb.uid;
      list.innerHTML = snap.empty ? G.T('Todavía no hay nadie. ¡Sé el primero!')
        : `<table style="width:100%;border-collapse:collapse;font-size:14px">` + snap.docs.map((d, i) => {
            const v = d.data(), mon = G.DEX_BY[v.dex];
            return `<tr${d.id === me ? ' class="gold"' : ''} style="border-bottom:1px solid #ffffff14">
              <td style="padding:4px 6px">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
              <td translate="no">${esc(v.name)}</td>${group ? '' : `<td>${mon ? G.T(mon.name) : ''}</td>`}
              <td><b>${fmt(v.v)}</b></td><td>Lv ${v.lv}</td></tr>`;
          }).join('') + '</table>';
    } catch (e) { list.textContent = G.T('No se pudo cargar la clasificación.'); console.warn(e); }
  }

  // ---------------- ventana "Desafíos" ----------------

  let overlay = null;
  function close() { if (overlay) { overlay.remove(); overlay = null; } }
  function go(kind) { close(); G.Modes.start(kind); }

  function open() {
    close();
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:66;display:flex;align-items:center;justify-content:center;background:rgba(5,9,20,.7)';
    overlay.onclick = e => { if (e.target === overlay) close(); };
    const db = G.Modes.dailyBest(), wb = weeklyBest(), tb = towerBest(), lb = G.Modes.legendBest(), wk = weekly();
    const card = (id, title, sub, desc, rec, board) => `
      <div class="panel" style="padding:10px 12px;margin-top:8px">
        <div class="row between" style="gap:10px">
          <div class="grow"><b>${G.T(title)}</b> ${sub ? `<small style="color:var(--muted)">${sub}</small>` : ''}
            <div style="font-size:13px;color:var(--muted)">${desc}</div>
            ${rec ? `<div style="font-size:13px" class="gold">${rec}</div>` : ''}</div>
          <div class="ch-btns" style="display:flex;flex-direction:column;gap:6px"><button class="btn gold" data-go="${id}">${G.T('Jugar')}</button>
            ${board ? `<button class="btn small" data-board="${id}">${G.T(id === 'daily' ? 'Clasificación' : 'Ver clasificación')}</button>
              <button class="btn small" data-tboard="${id}">${G.T('Grupos')}</button>` : ''}</div>
        </div>
      </div>`;
    overlay.innerHTML = `
      <div class="box" style="width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:18px 20px">
        <div class="row between"><h3 style="margin:0">${G.T('Desafíos')}</h3><button class="btn small ghost" data-close>${G.T('Volver')}</button></div>
        <p class="sub" style="margin:6px 0 0">${G.T('Cada desafío tiene sus propias reglas: las «Reglas a medida» no cuentan aquí.')}
          ${G.T('Con amigos: crea una sala en «Jugar con amigos» y elige el desafío en «Qué jugar» (tiene su clasificación de grupos).')}</p>
        ${card('daily', 'Reto diario', G.Modes.today(), G.T('Mismo mapa y mismos enemigos para todos hoy. Comparte tu tiempo con tus amigos.'),
          db ? G.I18n.f('Tu mejor marca de hoy: {x}', G.U.mmss(db.time)) : '', true)}
        ${card('weekly', 'Reto semanal', isoWeek().key, `<b style="color:#ffd23f">${G.T(wk.name)}</b> — ${G.T(wk.desc)}`,
          wb ? G.I18n.f('Tu mejor marca de la semana: {x}', G.U.mmss(wb.time)) : '', true)}
        ${card('tower', 'Torre sin fin', '', G.T('Cada minuto subes un piso y cae una maldición nueva. ¿Hasta dónde llegas?'),
          tb ? G.I18n.f('Récord: piso {x}', tb) : '', true)}
        ${card('legend', 'Desafío legendario', '', G.T('Legendarios uno tras otro en la arena de la grieta. ¿Cuántos vences antes de caer?'),
          lb ? G.I18n.f('Récord: {x}', lb) : '', false)}
      </div>`;
    overlay.querySelector('[data-close]').onclick = close;
    overlay.querySelectorAll('[data-go]').forEach(b => { b.dataset.sfx = 'confirm'; b.onclick = () => go(b.dataset.go); });
    overlay.querySelectorAll('[data-board]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.board;
        if (k === 'daily') G.Modes.openBoard();
        else if (k === 'weekly') openBoard('w-' + isoWeek().key, G.T('Reto semanal') + ' <small style="color:var(--muted)">' + isoWeek().key + '</small>', v => G.U.mmss(v));
        else openBoard('tower', G.T('Torre sin fin'), v => G.I18n.f('Piso {x}', v));
      };
    });
    overlay.querySelectorAll('[data-tboard]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.tboard;
        const t = (k === 'daily' ? G.T('Reto diario') : k === 'weekly' ? G.T('Reto semanal') : G.T('Torre sin fin')) + ' · ' + G.T('Grupos');
        openBoard(boardKey(k, true), t, k === 'tower' ? v => G.I18n.f('Piso {x}', v) : v => G.U.mmss(v), true);
      };
    });
    document.body.appendChild(overlay);
    if (G.I18n.walk) G.I18n.walk(overlay);
  }

  /** Texto bajo "Desafíos" en el menú. */
  function menuLine() { return G.T('Reto semanal') + ': ' + G.T(weekly().name); }

  return { open, close, prepare, seed, applyPlayer, update, onNet, hudLine, afterRun, menuLine, isoWeek, weekly, WEEKLY,
           get floor() { return tower ? tower.floor : 0; } };
})();
