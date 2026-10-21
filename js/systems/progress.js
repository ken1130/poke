/* ============ progress.js — misiones, logros y estadísticas de cuenta ============
 * El juego avisa de lo que pasa con G.Progress.event(tipo, datos):
 *
 *   kill      { types, boss, legend }  (también en las copias del cooperativo)
 *   chest     cofre con candado abierto
 *   item      { id }        objeto equipado
 *   evolve    { move }      movimiento evolucionado
 *   rift      { type }      pelea de grieta ganada
 *   runEnd    { time, level, coins, types, group, dex }
 *   missionDone { daily }   (lo lanza claim)
 *   guard { waves } · partyWin { game } · kbuy      (títulos, data/titles.js, 2026-10-21)
 *
 * y esto actualiza en la partida guardada:
 *   stats.bossesTotal · riftWins · evolutions · missionsDone · groupRuns
 *   stats.bestGuard · partyWins · bigtwoWins · kecleonBuys · customRuns{dex}
 *   legends{dex} · arenas{tipo} · itemsFound{id} · evoMoves{id} · ach{id}
 *   missions { day, daily[], rerolled, week, weekly[] }
 *
 * Misiones: 3 diarias + 2 semanales, sorteadas con una semilla de la fecha y
 * la cuenta (en cualquier ordenador salen las mismas). El premio se recoge
 * a mano; los logros se dan solos al conseguirlos.
 */
G.Progress = (() => {
  const TYPES = Object.keys(G.U.TYPE_NAME);
  let achT = 0, toastQ = [], toastT = 0;

  // ---------------- misiones ----------------

  function rng(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function make(def, r) {
    const goal = def.goals[Math.floor(r() * def.goals.length)];
    const param = def.param === 'type' ? TYPES[Math.floor(r() * TYPES.length)] : null;
    return { id: def.id, goal, param, prog: 0, claimed: false, told: false };
  }

  function pickSet(defs, n, r, avoid = []) {
    const pool = defs.filter(d => !avoid.includes(d.id));
    const out = [];
    while (out.length < n && pool.length) out.push(make(pool.splice(Math.floor(r() * pool.length), 1)[0], r));
    return out;
  }

  /** Crea las misiones del día / semana si han cambiado. */
  function ensure(s) {
    if (!s) return;
    const ids = G.Ranking.periodIds();
    const key = String(s.created || 0);
    s.missions = s.missions || {};
    const M = s.missions;
    if (M.day !== ids.d) {
      M.day = ids.d; M.rerolled = false;
      M.daily = pickSet(G.MissionDefs.daily, 3, rng(ids.d + key));
    }
    if (M.week !== ids.w) {
      M.week = ids.w;
      M.weekly = pickSet(G.MissionDefs.weekly, 2, rng(ids.w + key));
    }
  }

  function text(m) { return G.MissionDefs.BY[m.id].text(m.goal, m.param); }
  function done(m) { return m.prog >= m.goal; }

  function advance(list, kind, d) {
    for (const m of list || []) {
      if (m.claimed || done(m)) continue;
      const def = G.MissionDefs.BY[m.id];
      if (!def || def.ev !== kind) continue;
      if (def.match && !def.match(d, m.param)) continue;
      const v = def.value ? def.value(d) : 1;
      m.prog = def.mode === 'max' ? Math.max(m.prog, v) : m.prog + v;
      if (done(m) && !m.told) {
        m.told = true;
        notify('Misión completada: ' + text(m), 'Recoge el premio en Misiones');
      }
    }
  }

  /** Recoge el premio de una misión terminada. */
  function claim(m, weekly = false) {
    const s = G.DB.save;
    if (!s || m.claimed || !done(m)) return false;
    m.claimed = true;
    grant(G.MissionDefs.BY[m.id].reward);
    s.stats.missionsDone = (s.stats.missionsDone || 0) + 1;
    event('missionDone', { daily: !weekly });
    G.DB.commit();
    return true;
  }

  /** Cambia una diaria sin terminar por otra (una vez al día). */
  function reroll(i) {
    const s = G.DB.save;
    ensure(s);
    const M = s.missions;
    const m = M.daily[i];
    if (!m || M.rerolled || m.claimed) return false;
    const r = rng(M.day + 'cambio' + Date.now());
    const [n] = pickSet(G.MissionDefs.daily, 1, r, M.daily.map(x => x.id));
    if (!n) return false;
    M.daily[i] = n;
    M.rerolled = true;
    G.DB.commit();
    return true;
  }

  function grant(r) {
    const s = G.DB.save;
    if (!r) return;
    s.tickets = s.tickets || { t1: 0, t10: 0 };
    if (r.coins) s.coins += r.coins;
    if (r.t1) s.tickets.t1 += r.t1;
    if (r.t10) s.tickets.t10 += r.t10;
    if (G.UI && G.UI.refreshCoins && !document.getElementById('topbar').classList.contains('hidden')) G.UI.refreshCoins();
  }

  function rewardText(r) {
    const p = [];
    if (r.t10) p.push(G.Icons.html('ticket10', 12) + ' ' + r.t10 + ' ×10');
    if (r.t1) p.push(G.Icons.html('ticket', 12) + ' ' + r.t1);
    if (r.coins) p.push('<span class="coin"></span> ' + r.coins);
    return p.join(' &nbsp;');
  }

  // ---------------- eventos ----------------

  function event(kind, d = {}) {
    const s = G.DB.save;
    if (!s) return;
    ensure(s);
    const S = s.stats;
    switch (kind) {
      case 'kill':
        if (d.boss) S.bossesTotal = (S.bossesTotal || 0) + 1;
        if (d.legend) { s.legends = s.legends || {}; if (!s.legends[d.legend]) s.legends[d.legend] = Date.now(); }
        break;
      case 'rift':
        S.riftWins = (S.riftWins || 0) + 1;
        if (d.type) { s.arenas = s.arenas || {}; s.arenas[d.type] = s.arenas[d.type] || Date.now(); }
        break;
      case 'evolve':
        S.evolutions = (S.evolutions || 0) + 1;
        s.evoMoves = s.evoMoves || {}; s.evoMoves[d.move] = s.evoMoves[d.move] || Date.now();
        break;
      case 'item':
        s.itemsFound = s.itemsFound || {}; s.itemsFound[d.id] = s.itemsFound[d.id] || Date.now();
        break;
      // Lo nuevo del mapa (2026-10-16): disco con 4 mejoras, Kecleon, casa de monstruos,
      // pisos, huevos, élites y ataque combinado.
      case 'jackpot': S.jackpots = (S.jackpots || 0) + 1; break;
      case 'kecleon': S.kecleonWins = (S.kecleonWins || 0) + 1; break;
      case 'mhouse': S.mhouses = (S.mhouses || 0) + 1; break;
      case 'floor': S.maxFloor = Math.max(S.maxFloor || 1, d.n || 1); break;
      // Mazmorra superada (floors.js, 2026-10-16): veces y mejor tiempo.
      case 'clear': S.clears = (S.clears || 0) + 1; if (d.t) S.bestClear = S.bestClear ? Math.min(S.bestClear, d.t) : d.t; break;
      case 'lord2': S.lord2 = (S.lord2 || 0) + 1; break;    // Señor del Mundo Distorsión vencido (B10F, floors.js, 2026-10-21)
      case 'hatch': S.hatches = (S.hatches || 0) + 1; if (d.shiny) S.shinyHatches = (S.shinyHatches || 0) + 1; break;
      case 'combo': S.combos = (S.combos || 0) + 1; break;
      case 'eliteKill': S.eliteKills = (S.eliteKills || 0) + 1; break;
      // Títulos (titles.js, 2026-10-21): oleadas de Dazhuang, juegos de mesa ganados, compras honradas en Kecleon.
      case 'guard': S.bestGuard = Math.max(S.bestGuard || 0, d.waves | 0); break;
      case 'partyWin': S.partyWins = (S.partyWins || 0) + 1; if (d.game === 'bigtwo') S.bigtwoWins = (S.bigtwoWins || 0) + 1; break;
      case 'kbuy': S.kecleonBuys = (S.kecleonBuys || 0) + 1; break;
      case 'runEnd':
        if (d.group) S.groupRuns = (S.groupRuns || 0) + 1;
        // Runs con cada personaje original (título «Coleccionista original»).
        if (d.dex && G.CUSTOM_BY && G.CUSTOM_BY[d.dex]) { s.customRuns = s.customRuns || {}; s.customRuns[d.dex] = s.customRuns[d.dex] || Date.now(); }
        break;
    }
    if (G.RunGoals) G.RunGoals.onEvent(kind, d);           // retos de la run (rungoals.js)
    advance(s.missions.daily, kind, d);
    advance(s.missions.weekly, kind, d);
    // Los logros se miran como mucho una vez por segundo (hay cientos de bajas).
    if (kind !== 'kill' || d.boss || d.legend) checkAch();
    else if (performance.now() - achT > 1000) checkAch();
  }

  /** Un enemigo ha caído (anfitrión, solitario o copia en el invitado). */
  function kill(e) {
    const legend = e.legend || (G.Rift.inArena && e.boss) ? e.dex : 0;
    event('kill', { types: e.types || [], boss: !!e.boss, legend });
    if (e.elite) event('eliteKill');
  }

  // ---------------- logros ----------------

  function checkAch() {
    const s = G.DB.save;
    if (!s) return;
    achT = performance.now();
    s.ach = s.ach || {};
    for (const a of G.AchDefs.LIST) {
      if (s.ach[a.id]) continue;
      if (a.value(s) < a.goal) continue;
      s.ach[a.id] = Date.now();
      grant(a.reward);
      notify('¡Logro: ' + a.name + '!', a.title ? 'Nuevo título: ' + a.title : '', a);
    }
    // Aspecto (2026-10-16): auras y colores de nombre que dan los logros.
    if (G.Cosmetic) G.Cosmetic.check((t, sub) => notify(t, sub));
    // Títulos (2026-10-21, data/titles.js): los que dan las estadísticas de la cuenta.
    if (G.Titles) G.Titles.check((t, sub) => notify(t, sub));
  }

  /** Títulos que tienes (de los logros conseguidos). */
  function titles() {
    const s = G.DB.save;
    return G.AchDefs.LIST.filter(a => a.title && s && s.ach && s.ach[a.id]).map(a => a.title);
  }

  /** Premios de misiones por recoger (para el aviso del menú). */
  function pending() {
    const s = G.DB.save;
    if (!s) return 0;
    ensure(s);
    return [...s.missions.daily, ...s.missions.weekly].filter(m => done(m) && !m.claimed).length;
  }

  // ---------------- avisos ----------------

  function notify(title, sub, ach) {
    toastQ.push({ title, sub, ach });
    if (toastQ.length === 1) showNext();
  }

  function showNext() {
    const n = toastQ[0];
    if (!n) return;
    let el = document.getElementById('ach-pop');
    if (!el) { el = document.createElement('div'); el.id = 'ach-pop'; el.className = 'box ach-pop'; document.body.appendChild(el); }
    const icon = n.ach ? (n.ach.dex ? '' : G.Icons.html('medal' + n.ach.tier, 24)) : G.Icons.html('medal2', 24);
    el.innerHTML = `${icon}<div><b>${n.title}</b>${n.sub ? `<small>${n.sub}</small>` : ''}</div>`;
    if (n.ach && n.ach.dex) el.prepend(G.UI.spriteCanvas(n.ach.dex, 48, 40, { scale: 1 }));
    el.classList.remove('hidden');
    G.Audio.sfx(n.ach ? 'legend' : 'confirm');
    clearTimeout(toastT);
    toastT = setTimeout(() => {
      el.classList.add('hidden');
      toastQ.shift();
      setTimeout(showNext, 250);
    }, 2800);
  }

  return { ensure, event, kill, claim, reroll, checkAch, titles, pending, text, done, rewardText, grant };
})();
