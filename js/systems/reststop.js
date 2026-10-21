/* ============ reststop.js — descanso entre pisos (2026-10-16) ============
 * Partida normal: al llegar a un piso nuevo (B2F en adelante, también los de sin fin), cada
 * uno elige UNA de tres (floors.js la abre con G.Game.openChoice: en grupo, todos parados
 * hasta que eligen; si hay otra elección abierta, espera en la cola):
 *   fire   Hoguera: recuperas toda la vida (y 3 s sin recibir daño).
 *   cart   Mercader errante: un objeto Raro o Épico al azar (ya se ve cuál). Pasa por
 *          G.Game.offerItem, así que valen los rangos (si lo tuyo es mejor, se vende).
 *   train  Entrenamiento: una carta dorada. Lo primero que se pueda de:
 *            1) un movimiento listo para evolucionar → evoluciona;
 *            2) subir movimientos dos veces (el mismo o dos distintos);
 *            3) dos mejoras de estadística (por orden: Potencia > Reflejos > Vigor > Coraza >
 *               Aprendizaje > Carrera > Síntesis > Imán).
 * Lo que se elige lo aplica cada uno en su ordenador (como las cartas de nivel).
 */
G.Rest = (() => {
  const $ = id => document.getElementById(id);
  const STAT_ORDER = ['atk', 'cd', 'hp', 'def', 'xp', 'spd', 'rgn', 'mag'];

  // Iconos pixel art (12×12, mismo formato que icons.js).
  Object.assign(G.Icons.UI, {
    rest_fire: { pal: { r: '#ff7a3d', y: '#ffd23f', w: '#fff3b0', b: '#8a5a2b', d: '#5a3a1a' }, rows: [
      '.....k......', '....krk.....', '....krrk.k..', '...krrrkkrk.', '...kryrrrrk.', '..kryyyrrk..',
      '..kryywyrk..', '..kryywyrk..', '...kryyrk...', '.kbbkkkkbbk.', 'kbdbbbbbbdbk', '.kkkkkkkkkk.'] },
    rest_cart: { pal: { b: '#c08a4a', d: '#7a5226', y: '#ffd23f' }, rows: [
      '....kkkk....', '...kbbbbk...', '....kddk....', '...kkkkkk...', '..kbbbbbbk..', '.kbbyyybbbk.',
      '.kbykkyybbk.', '.kbyyyyybdk.', '.kbbykkybdk.', '.kbbbyyybdk.', '..kddddddk..', '...kkkkkk...'] },
    rest_train: { pal: { y: '#ffd23f', o: '#e08a1e', w: '#fff3b0' }, rows: [
      '.....kk.....', '....kyyk....', '....kwyk....', 'kkkkkwyykkkk', 'kwwyyyyyyyok', '.kwyyyyyyok.',
      '..kyyyyyok..', '..kyyokyyk..', '.kyyok.kyok.', '.kyok...kok.', '.kkk.....kk.', '............'] }
  });

  /** Un objeto Raro o Épico que no lleves. */
  function rollItem(pl) {
    const pool = G.Items.LIST.filter(i => (i.tier === 2 || i.tier === 3) && !pl.hasItem(i.id));
    return (pool.length ? G.U.pick(pool) : G.U.pick(G.Items.LIST)).id;
  }

  /** Qué hará el entrenamiento ahora mismo: { kind, steps: [carta...], text }. */
  function trainPlan(pl) {
    const all = G.LevelUp.offer(pl, 60);
    const evo = all.find(c => c.type === 'evo');
    if (evo) return { kind: 'evo', text: G.I18n.f('Evoluciona {x}', evo.title) };
    // Primero los movimientos de ataque (los de apoyo/pasivos, después).
    const rank = c => { const m = pl.moves.find(o => 'up:' + o.id === c.key); return m && (m.kind === 'support' || G.Moves.isPassive(m)) ? 1 : 0; };
    const ups = all.filter(c => c.type === 'up').sort((a, b) => rank(a) - rank(b));
    if (ups.length) return { kind: 'up', text: ups.length > 1 ? G.I18n.f('Sube {x} y {x} un nivel', ups[0].title, ups[1].title) : G.I18n.f('Sube {x} dos niveles', ups[0].title) };
    return { kind: 'stat', text: G.T('Dos mejoras de estadística (Potencia, Reflejos, Vigor…)') };
  }
  /** Aplica el entrenamiento (se vuelve a mirar, por si algo ha cambiado). */
  function train(pl) {
    const got = [];
    for (let step = 0; step < 2; step++) {
      const all = G.LevelUp.offer(pl, 60);
      const evo = step === 0 && all.find(c => c.type === 'evo');
      if (evo) { evo.apply(pl); got.push(evo.title); break; }
      const ups = all.filter(c => c.type === 'up');
      if (ups.length) {
        // La segunda vez, otro movimiento si lo hay.
        const c = (step === 1 && ups.find(u => !got.includes(u.title))) || ups[0];
        c.apply(pl); got.push(c.title); continue;
      }
      const stats = all.filter(c => c.type === 'stat' && c.key !== 'stat:heal')
        .sort((a, b) => STAT_ORDER.indexOf(a.key.slice(5)) - STAT_ORDER.indexOf(b.key.slice(5)));
      const c = stats.find(s => !got.includes(s.title)) || stats[0];
      if (c) { c.apply(pl); got.push(c.title); }
    }
    return got;
  }

  let chosen = true;
  /** game.js openChoice: abre la ventana; done() al elegir. */
  function show(done) {
    const pl = G.Game.player;
    if (!pl) { done(); return; }
    const box = $('rest-cards');
    box.innerHTML = '';
    chosen = false;
    const itemId = rollItem(pl), it = G.Items.BY[itemId], tp = trainPlan(pl);
    const opts = [
      { icon: 'rest_fire', col: '#ff7a3d', name: 'Hoguera', desc: 'Recuperas toda la vida y estás 3 s a salvo.',
        apply: () => { pl.heal(pl.maxHp); pl.invuln = Math.max(pl.invuln || 0, 3); G.FX.ring(pl.x, pl.y, 6, 110, '#5fe08a', 0.7, 5); G.Spawner.say('¡Vida al máximo!', 2.4, true); } },
      { icon: itemId, col: G.Items.TIER_COLOR[it.tier], name: 'Mercader errante',
        desc: G.Items.tierChip(itemId) + '<b>' + G.T(it.name) + '</b>: ' + G.T(it.desc),
        then: () => G.Game.offerItem(itemId, true) },
      { icon: 'rest_train', col: '#ffd23f', name: 'Entrenamiento', desc: tp.text, gold: true,
        apply: () => { const got = train(pl); G.Spawner.say('Entrenamiento' + ': ' + got.join(' · '), 3, true); G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffe14d', 30, 220); } }
    ];
    opts.forEach((o, i) => {
      const el = document.createElement('div');
      el.className = 'card' + (o.gold ? ' evo' : '');
      el.innerHTML = `<div class="ico" style="background:${o.col}2e">${G.Icons.html(o.icon, 32)}</div>
        <div class="txt"><div class="nm">${G.T(o.name)}</div><div class="ds">${o.desc}</div></div>
        <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => {
        if (chosen) return;
        chosen = true;
        G.UI.hide('scr-rest');
        G.Audio.sfx('confirm');
        if (o.apply) o.apply();
        done();
        if (o.then) setTimeout(o.then, 60);
      };
      box.appendChild(el);
    });
    $('rest-sub').textContent = G.I18n.f('Llegas a B{x}F. Antes de seguir, elige una:', G.Floors.floor + 1);
    $('rest-keys').innerHTML = G.T('Sólo una por piso') + ' · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>';
    G.UI.show('scr-rest');
    G.Audio.sfx('heal');
  }
  /** Teclas 1-3 y elección automática del grupo (game.js). */
  function pick(i) { const c = document.querySelectorAll('#rest-cards .card')[i]; if (c) c.click(); }

  return { show, pick, trainPlan };
})();
