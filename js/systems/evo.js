/* ============ evo.js — tu Pokémon evoluciona durante la partida ============
 * Al subir de nivel en la run (datos: data/evolutions.js):
 *   primera fase (sin preevolución) -> Nv. 10 · segunda fase -> Nv. 20 · tercera -> Nv. 30
 * Al evolucionar sube de vida, velocidad y ataque (los stats de la evolución) y
 * cambia el sprite; los movimientos se quedan. Se puede apagar en Ajustes (Piedra eterna).
 * En grupo, los demás lo ven (coop.js manda el dex).
 *
 * Elegir (2026-10-19, el dueño): cuando hay más de un camino se abre UNA ventana (#scr-evo, con
 * G.Game.openChoice: en grupo, todos parados como con las cartas) que pone juntos TODOS los caminos
 * de ese momento, cada uno con su sprite, tipos y cómo cambian vida / ataque / velocidad:
 *   - cada evolución normal (G.EVOS[dex]: Eevee, Slowpoke, Kirlia… y las formas regionales
 *     que se añadan, que también salen de G.EVOS: no hay nada escrito a mano por Pokémon);
 *   - cada forma Mega disponible (G.MEGA_BY_BASE[dex], data/mega.js), desde el Nv. MEGA_LV.
 * Con un solo camino de evolución normal y ninguna Mega, evoluciona sin preguntar (como antes).
 * Si sólo hay Megas, hay «Ahora no»: luego se puede megaevolucionar con M, el botón de la HUD o
 * el de la pausa. Con «Elegir solo: todo» (save.autoPick) se marca la de más stats y se coge a
 * los 1,2 s (se puede parar, como las cartas de nivel).
 * Megaevolución: dura toda la run; vida, ataque y velocidad ×MEGA_BOOST; la animación es la de
 * evolucionar, con luz de arcoíris. No en PK.
 * Despertar (2026-10-21, data/custom-awaken.js): los personajes originales no evolucionan; su «Mega» es la
 * forma despierta (G.MEGA_BY_BASE[1000x], con `awaken`). Todo igual que la Mega, sólo cambian los textos.
 */
G.Evo = (() => {
  const LEVELS = [10, 20, 30];
  const MEGA_LV = 35;
  const MEGA_BOOST = { hp: 1.3, atk: 1.3, spd: 1.1 };
  const AUTO_DELAY = 1200;
  const $ = id => document.getElementById(id);
  let parent = null;        // dex -> de quién evoluciona

  function depth(dex) {
    if (!parent) { parent = {}; for (const f in G.EVOS) for (const t of G.EVOS[f]) parent[t] = +f; }
    let d = 0;
    while (parent[dex] && d < 4) { dex = parent[dex]; d++; }
    return d;
  }
  /** Nivel al que evoluciona este Pokémon (o null si no evoluciona). */
  function levelFor(dex) {
    const to = G.EVOS[dex];
    if (!to || !to.some(d => G.DEX_BY[d] && G.SPRITE_META[d])) return null;
    return LEVELS[Math.min(2, depth(dex))];
  }
  const enabled = () => G.Settings.get('evolve') !== false;

  // ---------------- qué caminos hay ahora ----------------

  /** Evoluciones normales a las que ya puede ir (vacío si no le toca). */
  function evoOptions(pl) {
    if (!enabled() || pl.noEvo) return [];
    const lv = levelFor(pl.dex);
    if (lv == null || pl.level < lv) return [];
    return G.EVOS[pl.dex].filter(d => G.DEX_BY[d] && G.SPRITE_META[d]).map(to => ({ kind: 'evo', to }));
  }
  /** ¿Puede megaevolucionar ya? (una vez por run, desde MEGA_LV, no en PK) */
  function megaReady(pl) {
    return !!(pl && !pl.dead && !pl.megaDone && !pl.mon.mega && pl.level >= MEGA_LV && !G.PvP.on && !pl.remote
              && G.MEGA_BY_BASE && G.MEGA_BY_BASE[pl.dex]);
  }
  function megaOptions(pl) { return megaReady(pl) ? G.MEGA_BY_BASE[pl.dex].map(m => ({ kind: 'mega', to: m.dex })) : []; }

  /*
   * Animación (2026-10-16): antes de cambiar, 2,6 s como en los juegos: tu Pokémon se vuelve una
   * silueta blanca que alterna entre su forma y la nueva, cada vez más deprisa, con luz que se le
   * acerca. Mientras, eres invulnerable (te puedes mover). Al acabar, evoluciona de verdad. La
   * Mega, con luz de arcoíris.
   */
  const DUR = 2.6;
  /** Cada fotograma: ¿toca evolucionar? (también en el invitado: su nivel lo manda el anfitrión) */
  function check(pl) {
    if (!pl || pl.dead) return;
    if (pl.evoAnim) { step(pl); return; }
    if (pl.evoAsk) return;                               // ventana abierta o en la cola
    const evos = evoOptions(pl), megas = pl.megaSkip ? [] : megaOptions(pl);
    if (!evos.length && !megas.length) return;
    if (evos.length === 1 && !megas.length) { start(pl, evos[0]); return; }
    ask(pl, evos.concat(megas), !evos.length);
  }
  /** M, el botón de la HUD o el de la pausa: la ventana de la Mega, aunque antes dijeras «ahora no». */
  function openMega(pl) {
    pl = pl || G.Game.player;
    if (!megaReady(pl) || pl.evoAnim || pl.evoAsk) return false;
    ask(pl, evoOptions(pl).concat(megaOptions(pl)), !evoOptions(pl).length);
    return true;
  }

  /** ¿Esa forma es un Despertar (personaje original) y no una Mega? */
  const awk = dex => !!(G.DEX_BY[dex] && G.DEX_BY[dex].awaken);
  function start(pl, opt) {
    const to = opt.to, shiny = pl.shiny && G.Sprites.hasShiny(to), mega = opt.kind === 'mega';
    G.Sprites.preload([to], 8000, shiny);
    pl.evoAnim = { t0: performance.now(), to, mega, toAnim: new G.Sprites.Animator(to, 1, shiny) };
    pl.invuln = Math.max(pl.invuln || 0, DUR + 0.4);
    G.Spawner.say(G.I18n.f(mega ? awk(to) ? '¡{x} está despertando!' : '¡{x} está megaevolucionando!' : '¿Eh? ¡{x} está evolucionando!', G.T(pl.mon.name)), DUR, true);
    G.Audio.sfx('surge');
  }
  /** 0..1 de la animación (o null). */
  function progress(pl) { return pl && pl.evoAnim ? Math.min(1, (performance.now() - pl.evoAnim.t0) / 1000 / DUR) : null; }
  const rainbow = () => `hsl(${Math.floor(Math.random() * 360)},95%,70%)`;
  function step(pl) {
    const k = progress(pl), mega = pl.evoAnim.mega;
    // Luz que se le acerca (más cuanto más avanza).
    if (Math.random() < 0.4 + k) {
      const a = Math.random() * 6.2832, d = 60 + Math.random() * 40, cy = pl.y - pl.bodyH * 0.5;
      G.FX.px(pl.x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, mega ? rainbow() : Math.random() < 0.5 ? '#ffffff' : '#fff6c0',
              { vx: -Math.cos(a) * d * 2.2, vy: -Math.sin(a) * d * 1.5, life: 0.42 });
    }
    if (k < 1) return;
    const to = pl.evoAnim.to;
    pl.evoAnim = null;
    const from = pl.mon.name;
    if (mega) megaEvolve(pl, to);
    else pl.evolveTo(to);
    G.Spawner.say(G.I18n.f(mega ? awk(to) ? '¡{x} ha despertado: {x}!' : '¡{x} ha megaevolucionado a {x}!' : '¡{x} ha evolucionado a {x}!', G.T(from), G.T(pl.mon.name)), 3.2, true);
    G.Audio.sfx('legend');
    G.Game.flash('#ffffff', 0.6);
    G.FX.ring(pl.x, pl.y, 8, 120, mega ? '#ff8ad8' : '#ffffff', 0.8, 6);
    G.FX.ring(pl.x, pl.y, 4, 70, mega ? '#7fe0ff' : '#fff6c0', 0.5, 4);
    if (mega) for (let i = 0; i < 6; i++) G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, `hsl(${i * 60},95%,65%)`, 8, 240);
    else G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#fff6c0', 36, 220);
    for (let i = 0; i < 6; i++) G.FX.twinkle(pl.x + G.U.rand(-26, 26), pl.y - G.U.rand(8, 46));
    if (!mega) {
      G.Progress.event('pokeEvolve', { dex: to });
      const st = G.DB.save && G.DB.save.stats;
      if (st) st.pokeEvolves = (st.pokeEvolves || 0) + 1;
    }
  }
  /** Mega: el aspecto y los tipos de la Mega (evolveTo visual) y los ×MEGA_BOOST, para toda la run. */
  function megaEvolve(pl, to) {
    const base = pl.dex;
    pl.evolveTo(to, true);
    pl.megaDone = true;
    const add = pl.maxHp * (MEGA_BOOST.hp - 1);
    pl.maxHp += add; pl.hp = Math.min(pl.maxHp, pl.hp + add);
    pl.atkMul *= MEGA_BOOST.atk; pl.spdMul *= MEGA_BOOST.spd;
    G.MegaAb.apply(pl, (G.DEX_BY[to] && G.DEX_BY[to].base) || base);   // habilidad Mega y movimiento despertado
  }

  // ---------------- la ventana ----------------

  let cur = null;           // { pl, opts, canSkip, done, picked }
  let autoT = null;
  function ask(pl, opts, canSkip) {
    pl.evoAsk = true;
    G.Game.openChoice(done => show(pl, opts, canSkip, done));
  }
  /** Lo que se pone en la carta: stats del Pokémon resultante comparados con los de ahora. */
  function deltas(pl, o) {
    const now = pl.mon, to = G.DEX_BY[o.to];
    if (o.kind === 'mega') {
      return [['Vida', '+' + Math.round((MEGA_BOOST.hp - 1) * 100) + '%'], ['Ataque', '+' + Math.round((MEGA_BOOST.atk - 1) * 100) + '%'],
              ['Velocidad', '+' + Math.round((MEGA_BOOST.spd - 1) * 100) + '%']];
    }
    const sg = v => (v > 0 ? '+' : '') + v;
    return [['Vida', sg(Math.max(0, to.hp - now.hp) + Math.round(pl.maxHp * 0.08))],
            ['Ataque', sg(Math.round((to.atk / now.atk * 1.06 - 1) * 100)) + '%'],
            ['Velocidad', sg(Math.max(0, to.spd - now.spd))]];
  }
  /** Para «Elegir solo»: el que más sube (la Mega cuenta su ×). */
  function score(pl, o) {
    const to = G.DEX_BY[o.to];
    if (o.kind === 'mega') return 1e6 + (to.bst || 0);
    return (to.bst || 0) + to.hp + to.spd + to.atk * 100;
  }
  function show(pl, opts, canSkip, done) {
    if (!pl || pl.dead || G.Game.player !== pl) { pl && (pl.evoAsk = false); done(); return; }
    // (Puede haber cambiado mientras esperaba en la cola.)
    opts = opts.filter(o => o.kind === 'mega' ? megaReady(pl) && G.DEX_BY[o.to] && G.DEX_BY[o.to].base === pl.dex : (G.EVOS[pl.dex] || []).includes(o.to));
    if (!opts.length) { pl.evoAsk = false; done(); return; }
    cur = { pl, opts, canSkip, done, picked: false };
    const box = $('evo-cards');
    box.innerHTML = '';
    box.classList.toggle('many', opts.length + (canSkip ? 1 : 0) > 4);   // Eevee: 8 caminos, en dos columnas
    opts.forEach((o, i) => {
      const to = G.DEX_BY[o.to], mega = o.kind === 'mega', aw = mega && !!to.awaken;
      const el = document.createElement('div');
      el.className = 'card evo-card' + (mega ? ' evo mega' : '');
      const canvas = G.UI.spriteCanvas(o.to, 96, 84, { scale: 2, shiny: pl.shiny && G.Sprites.hasShiny(o.to), lively: true });
      canvas.className = 'evo-pic';
      const later = !mega && G.MEGA_BY_BASE && G.MEGA_BY_BASE[o.to] ? `<span class="tag-chip evo-later">${G.T('Luego puede megaevolucionar')}</span>` : '';
      el.innerHTML = `<div class="txt"><div class="nm"><span class="tag-chip ${mega ? 'evo-tag-mega' : 'evo-tag'}">${G.T(mega ? aw ? 'Despertar' : 'Megaevolución' : 'Evolución')}</span> ${G.T(to.name)}</div>
        <div class="evo-types">${G.UI.typeChips(to.types)}${later}</div>
        <div class="evo-stats">${deltas(pl, o).map(([k, v]) => `<span>${G.T(k)} <b>${v}</b></span>`).join('')}</div>
        ${mega ? `<div class="evo-ab">${G.I18n.f(aw ? 'Habilidad despierta: {x}' : 'Habilidad Mega: {x}', `<b>${G.T(G.MegaAb.of(to.base).name)}</b>`)} — ${G.T(G.MegaAb.of(to.base).desc)}<br>${G.I18n.f('{x} se despierta: daño +{x}%', G.T(G.Moves.BY_ID[pl.startMoveId] ? G.Moves.BY_ID[pl.startMoveId].name : ''), Math.round((G.MegaAb.AWAKE_DMG - 1) * 100))}</div>` : ''}</div>
        <div class="key">${i + 1}</div>`;
      el.insertBefore(canvas, el.firstChild);
      el.dataset.sfx = 'none';
      el.onclick = () => choose(i);
      box.appendChild(el);
    });
    const allAwk = opts.every(o => o.kind === 'mega' && awk(o.to));     // personaje original: «despertar»
    if (canSkip) {
      const el = document.createElement('div');
      el.className = 'card evo-skip';
      el.innerHTML = `<div class="txt"><div class="nm">${G.T(allAwk ? 'Ahora no (Despertar)' : 'Ahora no (Mega)')}</div><div class="ds">${G.T(allAwk ? 'Puedes despertar luego: tecla M, el botón de la pantalla o el de la pausa.' : 'Puedes megaevolucionar luego: tecla M, el botón de la pantalla o el de la pausa.')}</div></div><div class="key">${opts.length + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => choose(-1);
      box.appendChild(el);
    }
    // Título grande: «¡Despertar!» para los originales, «¡Megaevolución!» si sólo hay Mega (2026-10-21).
    const onlyMega = opts.some(o => o.kind === 'mega') && !opts.some(o => o.kind === 'evo');
    $('evo-title').textContent = G.T(onlyMega ? (allAwk ? '¡Despertar!' : '¡Megaevolución!') : '¡Evolución!');
    $('evo-sub').textContent = G.I18n.f(opts.some(o => o.kind === 'mega') && !opts.some(o => o.kind === 'evo')
      ? allAwk ? '¡{x} puede despertar!' : '¡{x} puede megaevolucionar!' : '¡{x} puede evolucionar! Elige el camino', G.T(pl.mon.name));
    G.UI.show('scr-evo');
    G.Audio.sfx('surge');
    planAuto();
  }
  /** «Elegir solo: todo»: se marca la mejor y se coge a los 1,2 s (el botón lo para). */
  function planAuto() {
    clearTimeout(autoT); autoT = null;
    const note = $('evo-auto');
    const on = cur && G.DB.save && G.DB.save.autoPick === 'all';
    note.classList.toggle('hidden', !on);
    if (!on) return;
    let best = 0;
    cur.opts.forEach((o, i) => { if (score(cur.pl, o) > score(cur.pl, cur.opts[best])) best = i; });
    const cards = $('evo-cards').querySelectorAll('.card');
    cards[best] && cards[best].classList.add('auto');
    note.innerHTML = `${G.T('Elegir solo: todo')} · <button class="btn small ghost" id="evo-stop">${G.T('Elijo yo')}</button>`;
    $('evo-stop').onclick = () => { clearTimeout(autoT); autoT = null; note.classList.add('hidden'); cards.forEach(c => c.classList.remove('auto')); };
    autoT = setTimeout(() => { autoT = null; choose(best); }, AUTO_DELAY);
  }
  function choose(i) {
    if (!cur || cur.picked) return;
    clearTimeout(autoT); autoT = null;
    const { pl, opts, canSkip, done } = cur;
    if (i >= opts.length || (i < 0 && !canSkip)) return;
    cur.picked = true; cur = null;
    G.UI.hide('scr-evo');
    pl.evoAsk = false;
    done();
    if (i < 0) {
      pl.megaSkip = true;
      G.Audio.sfx('back');
      G.Spawner.say(opts.every(o => o.kind === 'mega' && awk(o.to)) ? 'Cuando quieras: M o el botón «Despertar» para despertar' : 'Cuando quieras: M o el botón «Mega» para megaevolucionar', 3, true);
      return;
    }
    G.Audio.sfx('confirm');
    start(pl, opts[i]);
  }
  /** Teclas 1-9 y elección automática del grupo (game.js): -1 = «Ahora no» (si lo hay; si no, la primera). */
  function pick(i) {
    if (!cur) return;
    if (i < 0) i = cur.canSkip ? -1 : 0;
    choose(i === cur.opts.length && cur.canSkip ? -1 : i);
  }
  /** Al acabar la run, por si quedaba abierta. */
  function reset() { clearTimeout(autoT); autoT = null; cur = null; G.UI.hide('scr-evo'); }

  // ---------------- HUD: botón «Mega» (M) ----------------

  let pauseTxt = null;
  function drawHud(ctx, w, h, pl, F) {
    if (!pl || pl.remote || !megaReady(pl) || pl.evoAnim || pl.evoAsk) return;
    // El botón de la pausa (#pause-mega, run-ui.js) dice «Megaevolucionar»; a un personaje original, «Despertar».
    const pt = G.CUSTOM_BY && G.CUSTOM_BY[pl.dex] ? G.T('Despertar (pausa)') : G.T('Megaevolucionar');
    if (pt !== pauseTxt) { pauseTxt = pt; const pm = $('pause-mega'); if (pm) pm.innerHTML = `${pt} <kbd>M</kbd>`; }
    const touch = G.Touch.active, S = touch ? 58 : 44;
    let bx = w - S - 16 - G.HUD.SR - (touch ? 2 * (S + 14) : 0), by = h - S - 18 - G.HUD.SB - (touch ? 0 : 64);
    if (bx < G.HUD.barRight + 10) by -= S + 34;
    const t = performance.now() / 1000;
    ctx.save();
    ctx.beginPath(); ctx.arc(bx + S / 2, by + S / 2, S / 2, 0, 6.2832);
    const g = ctx.createLinearGradient(bx, by, bx + S, by + S);
    for (let c = 0; c < 6; c++) g.addColorStop(c / 5, `hsl(${(c * 60 + t * 90) % 360},90%,62%)`);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#1b1528'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = F(800, touch ? 13 : 11); ctx.fillStyle = '#1b1528';
    ctx.fillText(G.T(G.CUSTOM_BY && G.CUSTOM_BY[pl.dex] ? 'Despertar (botón)' : 'Mega (botón)'), bx + S / 2, by + S / 2 + 1);
    ctx.font = F(700, 9); ctx.fillText(touch ? '' : '[M]', bx + S / 2, by + S / 2 + 12);
    ctx.restore();
    G.Touch.addButton(bx, by, S, S, () => openMega(pl), 8);
  }

  return { check, levelFor, progress, LEVELS, MEGA_LV, MEGA_BOOST, megaReady, openMega, pick, reset, drawHud,
           get open() { return !!cur; } };
})();
