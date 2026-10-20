/* ============ run-ui.js — cartas de nivel, pausa y fin de run ============ */
G.RunUI = (() => {
  const $ = G.UI.$;
  let offers = null, offerCb = null, coopMode = false;

  /** @param coop  en grupo: tras elegir, se queda esperando a los demás */
  function showLevelUp(level, list, cb, coop = false) {
    offerCb = cb; coopMode = coop;
    $('lvl-num').textContent = level;
    $('lvl-wait').textContent = '';
    $('lvl-wait').classList.toggle('hidden', !coop);
    $('cards').classList.remove('done');
    renderCards(list);
    $('lvl-reroll').onclick = reroll;
    $('lvl-auto').onclick = cycleAuto;
    autoHeld = false;
    showAuto();
    G.UI.show('scr-levelup');
    planAuto();
  }

  /*
   * Elegir solo (2026-10-16, pedido de los jugadores). Botón de 3 estados, se guarda:
   *   off    eliges tú
   *   stats  si las 3 son mejoras de estadística, elige sola (con movimientos, eliges tú)
   *   all    elige siempre: evolución > mejora que desbloquea una evolución > subir un
   *          movimiento > movimiento nuevo > estadística
   * Estadísticas por orden: Potencia > Reflejos > Vigor > Coraza > Aprendizaje > Carrera >
   * Síntesis > Imán (con menos del 35 % de vida, antes la Baya Zidra).
   * Se marca la carta y se coge a los 1,2 s: hay tiempo de pulsar otra o de apagarlo.
   * (2026-10-16, «una vez puesto no se puede quitar»: en «todo» la ventana se cerraba antes de
   * llegar al botón. Ahora tocar el botón en esa ventana anula la elección automática de ésta, y
   * el mismo botón está también en la pausa.)
   */
  const AUTO_MODES = ['off', 'stats', 'all'];
  const AUTO_NAME = { off: 'Elegir solo: no', stats: 'Elegir solo: sólo mejoras', all: 'Elegir solo: todo' };
  const STAT_ORDER = ['atk', 'cd', 'hp', 'def', 'xp', 'spd', 'rgn', 'mag', 'heal'];
  let autoT = null, autoHeld = false;      // autoHeld: has tocado el botón en esta ventana (eliges tú)
  const AUTO_DELAY = 1200;
  const autoMode = () => (G.DB.save && G.DB.save.autoPick) || 'off';
  function showAuto() {
    const m = autoMode();
    for (const id of ['lvl-auto', 'pause-auto']) {
      const b = $(id);
      if (!b) continue;
      b.textContent = G.T(AUTO_NAME[m]) + (id === 'lvl-auto' && autoT ? ' · ' + G.T('toca para parar') : '');
      b.classList.toggle('on', m !== 'off');
    }
  }
  function cycleAuto() {
    const s = G.DB.save;
    s.autoPick = AUTO_MODES[(AUTO_MODES.indexOf(autoMode()) + 1) % AUTO_MODES.length];
    G.DB.commit();
    G.Audio.sfx('select');
    // En la ventana de nivel: esta vez eliges tú (el modo nuevo vale desde la próxima).
    if (offers) { autoHeld = true; clearTimeout(autoT); autoT = null; $('cards').querySelectorAll('.card').forEach(el => el.classList.remove('auto')); }
    showAuto();
  }
  /** Qué carta cogería (índice) o -1 si toca elegir a ti. */
  function autoChoice(list) {
    const m = autoMode(), pl = G.Game.player;
    if (m === 'off' || !list || !list.length || !pl) return -1;
    if (m === 'stats' && list.some(c => c.type !== 'stat')) return -1;
    const idx = f => list.findIndex(f);
    const low = pl.hp < pl.maxHp * 0.35;
    const statRank = c => { const r = STAT_ORDER.indexOf(c.key.slice(5)); return c.key === 'stat:heal' && low ? -1 : r < 0 ? 99 : r; };
    const order = [c => c.type === 'evo', c => c.key === 'stat:heal' && low, c => c.type === 'stat' && c.tag !== 'Mejora',
                   c => c.type === 'up', c => c.type === 'new'];
    if (m === 'all') for (const f of order) { const i = idx(f); if (i >= 0) return i; }
    let best = -1;
    list.forEach((c, i) => { if (c.type === 'stat' && (best < 0 || statRank(c) < statRank(list[best]))) best = i; });
    return best;
  }
  function planAuto() {
    clearTimeout(autoT); autoT = null;
    const cards = $('cards').querySelectorAll('.card');
    cards.forEach(el => el.classList.remove('auto'));
    const i = autoHeld ? -1 : autoChoice(offers);
    if (i >= 0) {
      cards[i] && cards[i].classList.add('auto');
      const list = offers;
      autoT = setTimeout(() => { autoT = null; if (offers === list) pick(i); }, AUTO_DELAY);
    }
    showAuto();
  }

  /**
   * Cambiar las cartas: 1 vez gratis por partida y 1 más por cada jefe
   * derrotado (en grupo cuentan los jefes del equipo; cada uno tiene los suyos).
   */
  const FREE_REROLLS = 15;
  function rerollsLeft() {
    const p = G.Game.player;
    // 1 gratis + los comprados en Mejoras (antes, 1 más por cada jefe).
    // (15-10-2026: 15 gratis por partida, antes 1.)
    return p ? Math.max(0, FREE_REROLLS + (p.rerollBonus || 0) - (p.rerolls || 0)) : 0;
  }

  function reroll() {
    if (!offers || rerollsLeft() <= 0) return;
    const p = G.Game.player;
    p.rerolls = (p.rerolls || 0) + 1;
    G.Audio.sfx('select');
    renderCards(G.LevelUp.offer(p));
    planAuto();
  }

  function renderCards(list) {
    offers = list;
    const left = rerollsLeft();
    $('lvl-rr-n').textContent = left;
    $('lvl-reroll').classList.toggle('hidden', left <= 0);
    const box = $('cards');
    box.innerHTML = '';
    list.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'card';
      const tag = c.type === 'new'
        ? `<span class="tag-chip" style="background:${c.color}">Nuevo · ${c.tag}</span>`
        : c.type === 'up' || c.type === 'evo'
          ? `<span class="tag-chip" style="background:${c.color}">${c.tag}</span>`
          : `<span class="tag-chip" style="background:${c.color === '#ffd23f' ? '#ffd23f' : '#9fb1c9'}">${c.tag}</span>`;
      if (c.type === 'evo') el.classList.add('evo');
      el.innerHTML =
        `<div class="ico" style="background:${c.color}33">${G.Icons.html(c.icon, 32)}</div>
         <div class="txt"><div class="nm">${c.title} ${tag}${catChip(c)}</div><div class="ds">${c.desc}</div></div>
         <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';             // el juego pone su propio sonido al elegir
      el.onclick = () => pick(i);
      box.appendChild(el);
    });
  }

  /** Físico / especial del movimiento de la carta (stats6.js); ★ si es el que domina tu Pokémon. */
  function catChip(c) {
    const mm = /^(new|up|evo):(.+)$/.exec(c.key || ''), d = mm && G.Moves.BY_ID[mm[2]];
    const k = d && G.Stats6 && G.Stats6.cat(d);
    if (!k) return '';
    const pl = G.Game.player, star = pl && pl.k6 && pl.k6.best === k ? '★ ' : '';
    return ` <span class="tag-chip cat-${k}">${star}${G.T(k === 'p' ? 'Físico (clase de ataque)' : 'Especial (clase de ataque)')}</span>`;
  }

  function pick(i) {
    if (!offers || !offers[i]) return;
    clearTimeout(autoT); autoT = null;
    const c = offers[i], cb = offerCb;
    offers = null; offerCb = null;
    $('lvl-reroll').classList.add('hidden');
    if (coopMode) {
      // Se queda la carta elegida a la vista mientras eligen los demás.
      $('cards').querySelectorAll('.card').forEach((el, j) => el.classList.toggle('picked', j === i));
      $('cards').classList.add('done');
    } else G.UI.hide('scr-levelup');
    cb(c);
  }

  /** Cooperativo: quién falta por elegir. */
  function setWaiting(names) {
    const me = G.Social.me ? G.Social.me.name : '';
    const others = names.filter(n => n !== me);
    const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a[0];
    $('lvl-wait').textContent = !names.length ? ''
      : !others.length ? 'Elige tu carta'
      : names.includes(me) ? 'Faltan por elegir: ' + list([...others, 'tú'])
      : 'Esperando a ' + list(others) + '…';
  }

  function closeLevelUp() {
    clearTimeout(autoT); autoT = null;
    offers = null; offerCb = null;
    $('cards').classList.remove('done');
    G.UI.hide('scr-levelup');
  }

  /**
   * Mensaje de apoyo (Ko-fi) al acabar: tras un récord o cada 10 partidas,
   * nunca en la primera y como mucho una vez al día. Se cierra con la X.
   */
  /** Esta versión no pide donaciones al acabar la run. */
  function askSupport() { return false; }


  function showOver(r, onBack) {
    // Mazmorra superada (floors.js): victoria, no "has caído".
    $('over-title').textContent = r.clear ? '¡Victoria! Mazmorra superada' : r.dead ? 'Has caído…' : 'Run terminada';
    $('over-title').classList.toggle('gold', !!r.clear);
    // «Proteger a Dazhuang» (guard.js): su propio título.
    if (r.guard) $('over-title').textContent = G.T(r.guard.won ? '¡Has protegido a Dazhuang!' : r.dead ? 'Dazhuang ha caído…' : 'Run terminada');
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    $('over-stats').innerHTML = `
      <div class="ov-tile"><span>Tiempo</span><b>${G.U.mmss(r.time)}</b></div>
      <div class="ov-tile"><span>Nivel</span><b>${r.level}</b></div>
      <div class="ov-tile"><span>Derrotados</span><b>${r.kills}</b></div>
      <div class="ov-tile"><span>Jefes</span><b>${r.bosses}</b></div>
      ${r.floor ? `<div class="ov-tile"><span>Piso más hondo</span><b>B${r.floor + 1}F</b></div>` : ''}
      ${r.guard ? `<div class="ov-tile"><span>${G.T('Oleadas superadas')}</span><b class="${r.guard.won ? 'gold' : ''}">${r.guard.cleared} / ${G.Guard.WAVES}</b></div>` : ''}
      ${r.clearTime != null ? `<div class="ov-tile"><span>Mazmorra superada</span><b class="gold">${G.U.mmss(r.clearTime)}</b></div>` : ''}
      ${r.goals && r.goals.length ? `<div class="ov-goals" style="grid-column:1/-1"><span>Retos de la run</span><b style="font-size:14px">
        ${r.goals.map(g => `<span style="color:${g.done ? '#7dffb0' : '#ff8a96'}">${g.done ? '✔' : '✘'} ${esc(G.T(g.name))}</span>`).join(' · ')}</b></div>` : ''}
      <div class="ov-coins" style="grid-column:1/-1"><span>Pokémonedas ganadas</span>
        <b class="gold"><span class="coin"></span> +${r.coins}</b>
        <div style="font-size:12px;color:var(--muted)">${r.breakdown}</div></div>
      ${r.t1 || r.t10 ? `<div class="ov-tix" style="grid-column:1/-1"><span>Tickets del gacha</span><b>
        ${r.t1 ? G.Icons.html('ticket', 22) + ' +' + r.t1 + ' ' : ''}${r.t10 ? G.Icons.html('ticket10', 22) + ' +' + r.t10 + ' ×10' : ''}</b></div>` : ''}
      <div class="ov-moves" style="grid-column:1/-1"><span>Movimientos</span><b style="font-size:15px">
        ${r.moves.map(m => `${G.Icons.html('move:' + m.id, 16)} ${m.name} Lv.${m.lvl}`).join(' · ') || '—'}</b></div>
      ${r.caught && r.caught.length ? `<div style="grid-column:1/-1" class="caught ov-caught"><span>${G.Icons.html('shiny', 12)} Shinies conseguidos</span>
        <div class="caught-row" id="over-caught"></div></div>` : ''}
      ${r.record ? '<div style="grid-column:1/-1;text-align:center" class="gold ov-rec">¡Nuevo récord de tiempo!</div>' : ''}
      ${askSupport(r) ? `<div class="support-ask" id="over-ask" style="grid-column:1/-1">
        <button class="x" type="button" aria-label="Cerrar">×</button>
        <p>¿Te está gustando Pokémon Dungeon Survivors? Lo hago yo solo y los servidores cuestan dinero. Si quieres, puedes ayudarme a mantenerlo en línea.</p>
        <a class="btn small gold" href="${G.Funding.url}" target="_blank" rel="noopener">${G.Icons.html('heart', 14)} Apoyar en Ko-fi</a>
      </div>` : ''}`;
    const ask = $('over-ask');
    if (ask) ask.querySelector('.x').onclick = () => ask.remove();
    $('btn-again').onclick = onBack;
    if (r.caught && r.caught.length) {
      const row = $('over-caught');
      for (const c of r.caught) {
        const w = document.createElement('div');
        w.appendChild(G.UI.spriteCanvas(c.dex, 90, 72, { shiny: true, lively: true, scale: 2 }));
        w.insertAdjacentHTML('beforeend', `<small>${G.DEX_BY[c.dex].name}${c.isNew ? ' · ¡nuevo!' : ''}</small>`);
        row.appendChild(w);
      }
    }
    G.UI.show('scr-over');
  }

  /**
   * Has encontrado un objeto llevando ya dos: cambiar uno de los que llevas por el nuevo,
   * o quedarte como estás. cb(idQueSeQuita) o cb(null) si no lo coges.
   */
  /** Título de la ventana de objetos: «¡Un objeto!» (cambiar) o «Mochila» (bag mode, showBag). */
  function itemHead(bag) {
    const sec = $('scr-item');
    sec.classList.toggle('bagmode', !!bag);
    sec.querySelector('h2').textContent = G.T(bag ? 'Mochila' : '¡Un objeto!');
    sec.querySelector('.sub').innerHTML = bag
      ? G.T('Elige qué cambias o tira los que no quieras (el que cambias desaparece)')
      : G.T('Llevas dos: elige cuál cambias ·') + ' <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>';
  }

  /*
   * Mochila (2026-10-16, hoja V3.1 «al pulsar I, una mochila con "tirar todo" o cambiar uno a
   * uno; el cambiado desaparece»). Usa la ventana de objetos (#scr-item), así todo lo que ya
   * la tiene en cuenta (pausa del grupo, tienda, tiempo límite) sirve igual.
   *   held     lo que llevas · pending  lo que espera (icono flotante)
   *   act(tipo, id, otro)  'take' (id en lugar de otro, o en un hueco) · 'drop' (id) · 'dropAll' · 'close'
   * Mismas reglas de siempre: sólo por uno de su rango o peor; un artefacto sólo por otro artefacto.
   */
  function showBag(held, pending, act) {
    itemHead(true);
    const box = $('item-cards');
    const art = id => G.Items.isArt(id), T = G.Items.tier;
    const can = (o, id) => T(o) <= T(id) && (!art(o) || art(id));
    const it = id => G.Items.BY[id];
    const chip = id => G.Items.tierChip(id) + (art(id) ? `<span class="art-chip">${G.T('Artefacto')}</span>` : '');
    const slot = id => `<div class="bag-slot t${T(id)}${art(id) ? ' art' : ''}"><div class="ico">${G.Icons.html(id, 32)}</div>` +
      `<div class="txt"><div class="nm">${chip(id)}<b>${G.T(it(id).name)}</b></div><div class="ds">${G.T(it(id).desc)}</div></div></div>`;
    const free = G.Player.MAX_ITEMS - held.length;
    let html = `<div class="bag-h">${G.I18n.f('Llevas ({x}/{x})', held.length, G.Player.MAX_ITEMS)}</div><div class="bag-held">` +
      held.map(slot).join('') + Array.from({ length: Math.max(0, free) }, () => `<div class="bag-slot empty">${G.T('Hueco libre')}</div>`).join('') + '</div>' +
      `<div class="bag-h">${G.T('Objetos encontrados')}</div>`;
    pending.forEach(id => {
      const opts = held.filter(o => can(o, id));
      html += `<div class="bag-new">${slot(id)}<div class="bag-acts">` +
        (free > 0 ? `<button class="btn small gold" data-take="${id}">${G.T('Equipar en el hueco')}</button>` : '') +
        opts.map(o => `<button class="btn small gold" data-take="${id}" data-out="${o}">${G.I18n.f('Cambiar por {x}', G.T(it(o).name))}</button>`).join('') +
        (!opts.length && free <= 0 ? `<span class="bag-lock">${G.T('Lo que llevas es de más rango')}</span>` : '') +
        `<button class="btn small ghost" data-drop="${id}">${G.I18n.f('Tirar (+{x})', G.Items.sellValue(id))}</button></div></div>`;
    });
    const all = pending.reduce((a, id) => a + G.Items.sellValue(id), 0);
    html += `<div class="bag-foot"><button class="btn small danger" data-dropall="1">${G.I18n.f('Tirar todo (+{x} monedas)', all)}</button>` +
      `<button class="btn small" data-close="1">${G.T('Cerrar (decido luego)')}</button></div>`;
    box.innerHTML = `<div class="bag">${html}</div>`;
    box.querySelectorAll('[data-take]').forEach(b => { b.onclick = () => act('take', b.dataset.take, b.dataset.out); });
    box.querySelectorAll('[data-drop]').forEach(b => { b.onclick = () => act('drop', b.dataset.drop); });
    box.querySelector('[data-dropall]').onclick = () => act('dropAll');
    box.querySelector('[data-close]').onclick = () => act('close');
    G.UI.show('scr-item');
  }

  function showItemChoice(cur, next, cb) {
    itemHead(false);
    const box = $('item-cards');
    box.innerHTML = '';
    const nx = G.Items.BY[next];
    // Artefactos (2026-10-16): sólo otro artefacto puede quitar uno. Con un objeto normal,
    // los artefactos que llevas salen bloqueados (y si los dos lo son, sólo queda no cogerlo).
    const art = id => G.Items.isArt(id);
    const tag = id => art(id) ? `<span class="art-chip">${G.T('Artefacto')}</span> ` : '';
    // Rangos (2026-10-16): uno de más rango que el nuevo sale bloqueado.
    const chip = G.Items.tierChip;
    const opts = cur.map(id => {
      const it = G.Items.BY[id];
      if (art(id) && !art(next)) {
        return { icon: id, title: chip(id) + tag(id) + G.T(it.name), locked: true, isArt: true,
          desc: `<span class="swap-lock">${G.T('Un artefacto sólo se puede cambiar por otro artefacto.')}</span>` };
      }
      if (G.Items.tier(id) > G.Items.tier(next)) {
        return { icon: id, title: chip(id) + G.T(it.name), locked: true,
          desc: `<span class="swap-lock">${G.I18n.f('Es de más rango que {x}: no se cambia.', G.T(nx.name))}</span>` };
      }
      return { icon: id, title: chip(next) + tag(next) + G.I18n.f('Cambiar {x} por {x}', G.T(it.name), G.T(nx.name)),
        desc: `<span class="swap-lose">${G.I18n.f('Pierdes {x}: {x}', G.T(it.name), G.T(it.desc))}</span><br>` +
              `<span class="swap-gain">${G.I18n.f('Ganas {x}: {x}', G.T(nx.name), G.T(nx.desc))}</span>`,
        val: id, evo: !art(next), isArt: art(next) };
    })
      .concat([{ icon: next, title: chip(next) + tag(next) + G.I18n.f('No coger {x}', G.T(nx.name)),
        desc: cur.every(art) && !art(next) ? G.T('Llevas dos artefactos: un objeto normal no los puede sustituir.') : G.T('Te quedas con los dos que llevas.'), val: null }]);
    let n = 0;
    opts.forEach(o => {
      const el = document.createElement('div');
      el.className = 'card' + (o.evo ? ' evo' : '') + (o.isArt ? ' art' : '') + (o.locked ? ' locked' : '');
      el.innerHTML = `<div class="ico">${G.Icons.html(o.icon, 36)}</div>
        <div class="txt"><div class="nm">${o.title}</div><div class="ds">${o.desc}</div></div>
        <div class="key">${o.locked ? G.Icons.html('lock', 24) : ++n}</div>`;
      if (o.locked) el.dataset.sfx = 'none';
      else el.onclick = () => { G.UI.hide('scr-item'); cb(o.val); };
      box.appendChild(el);
    });
    G.UI.show('scr-item');
  }

  // ---------------- vínculo: qué movimientos se fusionan ----------------

  let bond = null;          // { opt, cb, first, list }

  /**
   * @param opt  pl.bondOptions(): 'add' (uno suelto al grupo) o 'pair' (dos sueltos, en dos pasos)
   * @param cb   recibe la lista de movimientos que se juntan
   */
  function showBond(opt, cb) {
    bond = { opt, cb, first: null, list: [] };
    $('bond-back').onclick = bondBack;
    renderBond();
    G.UI.show('scr-bond');
  }

  function renderBond() {
    const { opt, first } = bond;
    const names = ms => ms.map(m => m.name).join(' + ');
    const step2 = opt.mode === 'pair' && first;
    $('bond-sub').textContent = opt.mode === 'add' ? 'Elige qué movimiento se une a ' + names(opt.group)
      : step2 ? '¿Con cuál unes ' + first.name + '?' : 'Elige el primer movimiento que vas a unir';
    $('bond-back').classList.toggle('hidden', !step2);
    bond.list = step2 ? opt.loose.filter(m => m !== first) : opt.loose;
    const box = $('bond-cards');
    box.innerHTML = '';
    bond.list.forEach((m, i) => {
      const col = G.U.TYPE_COLOR[m.type];
      const desc = opt.mode === 'add' ? 'Se lanzará a la vez que ' + names(opt.group) + '.'
        : step2 ? 'Se lanzará a la vez que ' + first.name + '. Queda un hueco libre.'
        : m.desc || '';
      const el = document.createElement('div');
      el.className = 'card' + (opt.mode === 'add' || step2 ? ' bond' : '');
      el.innerHTML =
        `<div class="ico" style="background:${col}33">${G.Icons.html('move:' + m.id, 32)}</div>
         <div class="txt"><div class="nm">${m.name} <span class="tag-chip" style="background:${col}">Lv.${m.lvl}</span></div><div class="ds">${desc}</div></div>
         <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => pickBond(i);
      box.appendChild(el);
    });
  }

  function pickBond(i) {
    if (!bond || !bond.list[i]) return;
    const m = bond.list[i];
    if (bond.opt.mode === 'pair' && !bond.first) {
      bond.first = m;
      G.Audio.sfx('select');
      renderBond();
      return;
    }
    const picked = bond.opt.mode === 'add' ? [m] : [bond.first, m];
    const cb = bond.cb;
    bond = null;
    G.UI.hide('scr-bond');
    cb(picked);
  }

  function bondBack() {
    if (!bond) return;
    bond.first = null;
    renderBond();
  }

  /** Estadísticas de tu Pokémon ahora mismo (2026-10-15: se pidió ver la velocidad, la vida...). */
  function renderPauseStats() {
    const pl = G.Game.player, box = $('pause-stats');
    if (!box) return;
    if (!pl) { box.innerHTML = ''; return; }
    const pct = v => Math.round(v * 100) + '%';
    const mul = v => '×' + (+v.toFixed(2)).toString().replace('.', G.I18n.lang === 'es' ? ',' : '.');
    const taken = (what, k) => (Math.abs(1 - k) < 0.005 ? '—' : G.T(what) + ' ' + (k < 1 ? '−' : '+') + pct(Math.abs(1 - k)));
    const rows = [
      ['Nivel', 'Lv.' + pl.level],
      ['Vida', Math.ceil(pl.hp) + ' / ' + Math.round(pl.maxHp)],
      // Ataque y Ataque Esp. (stats6.js): el de los movimientos de cada clase; las defensas, en % de daño recibido.
      ...(pl.k6 ? [['Ataque', mul(pl.atk * pl.k6.p)], ['Ataque Esp.', mul(pl.atk * pl.k6.s)],
                   ['Defensa', taken('golpes recibidos', pl.k6.dp)], ['Defensa Esp.', taken('disparos recibidos', pl.k6.ds)]] : [['Ataque', mul(pl.atk)]]),
      ['Velocidad', String(Math.round(pl.spd))],
      ['Recarga', pl.cdK < 1 ? '−' + pct(1 - pl.cdK) : '—'],
      ['Crítico', pct(pl.critChance || 0)],
      ['Daño crítico', mul(pl.critMul || 1.5)],
      ['Reducción de daño', pl.reduction > 0 ? pct(pl.reduction) : '—'],
      ['Regeneración', pl.regen > 0 ? (+pl.regen.toFixed(1)) + ' /s' : '—'],
      ['Alcance de recogida', String(Math.round(pl.magnet))],
      ['Bonus de experiencia', mul(pl.xpMul)],
      ['Bonus de monedas', mul(pl.coinMul)]
    ];
    // Piso y retos de la run (modo normal, 2026-10-16).
    if (G.Modes.run === 'normal' && !G.PvP.on) {
      const th = G.Floors.THEMES[G.Floors.theme];
      rows.push(['Piso', 'B' + (G.Floors.floor + 1) + 'F · ' + G.T(th.name)]);
      for (const g of G.RunGoals.summary()) rows.push([G.T('Reto') + ': ' + G.T(g.name), g.prog]);
    }
    box.innerHTML = rows.map(([k, v]) => `<div><span>${G.T(k)}</span><b>${v}</b></div>`).join('');
  }

  function showPause(coop = false) {
    renderPauseStats();
    $('pause-auto').onclick = cycleAuto;
    showAuto();
    // Megaevolución (evo.js): si ya puede y dijo «ahora no», desde aquí (cierra la pausa y abre la ventana).
    const mb = $('pause-mega'), mp = G.Game.player;
    mb.classList.toggle('hidden', !(mp && G.Evo.megaReady(mp)));
    mb.onclick = () => { $('btn-resume').click(); setTimeout(() => G.Evo.openMega(G.Game.player), 60); };
    G.UI.soundControls($('pause-sound'));
    $('pause-coop').classList.toggle('hidden', !coop);
    $('btn-quit').textContent = coop ? 'Salir de la partida' : G.Modes.run === 'training' ? G.T('Salir del entrenamiento') : 'Abandonar run';
    G.UI.show('scr-pause');
  }

  function wirePause(onResume, onQuit) {
    $('btn-resume').onclick = onResume;
    $('btn-quit').onclick = onQuit;
    $('btn-pause-cheat').onclick = () => G.Cheat.openPrompt();   // trucos de partida (invencible, nivel 30...)
  }

  return { showLevelUp, reroll, showItemChoice, showBag, showBond, pickBond, bondBack, pick, setWaiting, closeLevelUp, showOver, wirePause, showPause };
})();
