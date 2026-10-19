/* ============ menu.js — menú principal, colección y mejoras ============ */
G.MenuUI = (() => {
  const $ = G.UI.$;
  const GEN_NAMES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  // Formas regionales (pokedex-forms.js, 2026-10-19): se numeran por su especie y llevan su región.
  const FORM_NAME = { alola: 'Forma de Alola', galar: 'Forma de Galar', hisui: 'Forma de Hisui', paldea: 'Forma de Paldea' };
  const noOf = p => String(p.base || p.dex).padStart(3, '0');
  const formOf = p => (p.form ? ' · ' + G.T(FORM_NAME[p.form]) : '');
  let dexFilter = 'all', dexGen = 1, dexSel = null, dexQuery = '', dexType = null;

  function init() {
    const ICON = { play: 'ball', adventure: 'trophy', challenge: 'crown', dex: 'book', upgrades: 'up', gacha: 'ball4', goals: 'medal3', party: 'friends', modes: 'cards', cheat: 'star', settings: 'gear' };
    document.querySelectorAll('#scr-menu [data-go]').forEach(b => {
      b.insertAdjacentHTML('afterbegin', `<span class="mi-ico">${G.Icons.html(ICON[b.dataset.go], 26)}</span>`);
      b.dataset.sfx = b.dataset.go === 'play' ? 'confirm' : 'click';
      b.onclick = () => {
        const go = b.dataset.go;
        if (go === 'play') { if (G.Social.room) G.LobbyUI.open(); else G.Flow.play(); }
        else if (go === 'dex') openDex(true);
        else if (go === 'upgrades') openUpgrades();
        else if (go === 'gacha') G.GachaUI.open();
        else if (go === 'goals') G.GoalsUI.open();
        else if (go === 'party') G.PartyUI.open();
        else if (go === 'modes') G.Modes.openPanel();
        else if (go === 'challenge') G.Challenges.open();
        else if (go === 'adventure') G.Stages.openMap();
        else if (go === 'cheat') G.Cheat.openPrompt();
        else if (go === 'settings') G.SettingsUI.open();
      };
    });
    document.querySelectorAll('[data-back]').forEach(b => { b.onclick = open; });
    G.Social.on(() => { if (G.UI.isOpen('scr-menu')) socialLine(); });
    $('btn-logout').onclick = async () => {
      if (G.DB.guest && !(await G.Dialog.confirm('Eres invitado: se perderá todo el progreso. ¿Salir?', { ok: 'Salir', danger: true }))) return;
      G.Audio.music(null);
      G.DB.logout().then(() => G.Flow.toLogin());
    };
  }

  // ---------------- menú principal ----------------

  function open() {
    const s = G.DB.save;
    const mon = G.DEX_BY[s.partner];
    const shiny = !!s.partnerShiny && G.DB.ownsShiny(mon.dex);
    G.UI.chrome(true);
    G.UI.show('scr-menu');
    G.UI.sprite($('menu-partner'), mon.dex, { lively: true, scale: 4, hero: true, shiny });
    $('menu-partner').style.setProperty('--stage-c', shiny ? '#9ae6ff' : G.U.TYPE_COLOR[mon.types[0]]);
    $('menu-partner').classList.toggle('shiny', shiny);
    $('menu-partner-name').innerHTML = mon.name + (shiny ? ' ' + G.Icons.html('shiny', 24) : '');
    $('menu-partner-info').innerHTML = G.UI.typeChips(mon.types) + ' ' + G.UI.stars(mon.rarity);
    // Normal / shiny a mano, aquí mismo (en el móvil no se encontraba en la ficha).
    const seg = $('menu-shiny');
    seg.classList.toggle('hidden', !G.DB.ownsShiny(mon.dex));
    seg.lastChild.innerHTML = G.Icons.html('shiny', 12) + ' Shiny';
    seg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', (b.dataset.v === '1') === shiny);
      b.onclick = () => {
        if ((b.dataset.v === '1') === shiny) return;
        s.partnerShiny = b.dataset.v === '1';
        G.DB.commit();
        G.Audio.sfx('confirm');
        open();
      };
    });

    grave(s.lastRun);
    $('btn-logout').classList.toggle('hidden', G.DB.mode === 'local' || G.DB.unbound);   // sin cuenta, no hay sesión que cerrar
    G.AccountUI.refresh();
    modesLine();
    const owned = Object.keys(s.owned).filter(d => G.DEX_BY[d]).length;
    const shinies = Object.keys(s.shiny || {}).length;
    const dq = G.DexQuests.pending();
    $('menu-dex-count').textContent = dq ? G.I18n.f('{x} premios de retos por recoger', dq) : `${owned} / ${G.DEX.length}` + (shinies ? ` · ${shinies} shiny` : '');
    $('menu-dex-count').classList.toggle('gold', dq > 0);

    const st = s.stats;
    $('menu-stats').innerHTML =
      `Runs <b style="color:#fff">${st.runs}</b> · Mejor tiempo <b style="color:#fff">${G.U.mmss(st.bestTime)}</b><br>` +
      `Mejor nivel <b style="color:#fff">${st.bestLevel}</b> · Derrotados <b style="color:#fff">${st.totalKills.toLocaleString('es')}</b>` +
      (G.DB.guest ? '<br><span style="color:#ffb0b8">Modo invitado: no se guarda</span>' : '');

    socialLine();
    // Premios de misiones por recoger.
    G.Progress.checkAch();
    const pend = G.Progress.pending();
    $('menu-goals-sub').textContent = pend ? pend + (pend === 1 ? ' premio por recoger' : ' premios por recoger') : 'Misiones, logros y perfil';
    $('menu-goals-sub').classList.toggle('gold', pend > 0);
    // (Amigos, apodo y "en línea" desactivados en esta versión: sin Social.start
    // no se pide apodo ni se escribe en la nube cada 10 min.)
    G.InvitePop.refresh();
    G.NewsUI.autoOpen();          // novedades sin ver: se abren solas una vez
    G.PartyUI.checkLink();        // abierto con un enlace de invitación: a esa sala
  }

  /** Bajo "Reglas a medida" (y "Jugar"): las que tienes puestas. */
  function modesLine() {
    const sub = $('menu-modes-sub'), sm = G.Modes.summary();
    sub.textContent = sm ? G.T('Activas') + ': ' + sm.split(' · ').map(x => G.T(x)).join(' · ') : G.T('Sólo para «Jugar»');
    sub.classList.toggle('gold', !!sm);
    const ch = $('menu-ch-sub');
    if (ch) ch.textContent = G.Challenges.menuLine();
    const adv = $('menu-adv-sub');
    if (adv && G.Stages) adv.textContent = G.Stages.menuLine();
  }

  /** Texto bajo "Amigos" y "Jugar": quién está en línea, solicitudes, sala. */
  function socialLine() {
    const room = G.Social.room;
    const play = document.querySelector('#scr-menu [data-go=play] small');
    const sm = G.Modes.summary();
    if (play) {
      play.textContent = room ? G.I18n.f('Volver a tu sala ({x}/{x})', room.members.length, G.Social.MAX_PLAYERS)
        : sm ? G.T('Con reglas a medida') + ': ' + sm.split(' · ').map(x => G.T(x)).join(' · ') : G.T('Entra en la mazmorra');
      play.classList.toggle('gold', !room && !!sm);
    }
    const fr = G.Social.friends;
    const on = fr.filter(f => f.status === 'ok' && f.online).length;
    const req = fr.filter(f => f.status === 'in').length;
    const parts = [];
    if (on) parts.push(on + ' en línea');
    if (req) parts.push(req + (req === 1 ? ' solicitud' : ' solicitudes'));
    const sub = $('menu-friends-sub');   // el botón de Amigos puede no estar (versión sin online)
    if (!sub) return;
    sub.textContent = parts.length ? parts.join(' · ') : 'Juega en grupo, hasta 4';
    sub.classList.toggle('gold', req > 0);
  }

  // ---------------- colección ----------------

  /*
   * Móvil en horizontal (2026-10-17, rwd-menus.css): las regiones y los filtros van en una sola
   * barra que se desliza a los lados, y la ficha se abre a pantalla completa al tocar un Pokémon
   * (clase «sheet» en #scr-dex). En el PC no cambia nada: la barra no existe y la ficha va al lado.
   */
  const PHONE = window.matchMedia ? matchMedia('(max-height: 520px)') : { matches: false };
  function placeDexBar() {
    const tabs = $('dex-gens'), fb = $('dex-filters');
    let bar = $('dex-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'dex-bar'; bar.className = 'dex-bar';
      tabs.before(bar);
      if (PHONE.addEventListener) PHONE.addEventListener('change', placeDexBar);
    }
    if (PHONE.matches) { if (tabs.parentNode !== bar) bar.append(tabs, fb); }
    else if (tabs.parentNode === bar) { bar.after(tabs); $('dex-grid').before(fb); }
  }
  const sheet = on => $('scr-dex').classList.toggle('sheet', on);
  /** Cabecera de la ficha a pantalla completa (sólo se ve en el móvil). */
  const sheetHead = (title, sub) => `<div class="dex-sheet-head"><button class="btn small ghost dex-sheet-back" data-sfx="back">Volver</button>
      <div class="ttl"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  function wireSheet(box) {
    const b = box.querySelector('.dex-sheet-back');
    if (b) b.onclick = () => sheet(false);
  }

  function openDex(fresh) {
    G.UI.show('scr-dex', true);
    if (fresh) sheet(false);
    placeDexBar();
    const s = G.DB.save;
    // (2026-10-16: con un personaje original de compañero, se abría en Kanto mostrándolo como Pokémon: «undefined»)
    if (dexSel == null) { dexSel = s.partner; dexGen = G.CUSTOM_BY[s.partner] ? OTHER : G.DEX_BY[s.partner].gen; }
    const owned = Object.keys(s.owned).filter(d => G.DEX_BY[d]).length;
    $('dex-total').textContent = `${owned} / ${G.DEX.length}`;

    // Pestañas de generación, con cuántos tienes de cada una.
    const tabs = $('dex-gens');
    tabs.innerHTML = '';
    GEN_NAMES.forEach((name, i) => {
      const g = i + 1;
      const total = G.DEX.filter(p => p.gen === g).length;
      const have = G.DEX.filter(p => p.gen === g && s.owned[p.dex]).length;
      const b = document.createElement('button');
      b.className = 'gen-tab' + (g === dexGen ? ' on' : '');
      b.innerHTML = `<b>${name}</b><small>${have}/${total}</small>`;
      b.onclick = () => { dexGen = g; openDex(); };
      tabs.appendChild(b);
    });
    // «Otros» (2026-10-16): personajes originales (data/custom.js). No cuentan para el total.
    {
      const b = document.createElement('button');
      b.className = 'gen-tab gen-other' + (dexGen === OTHER ? ' on' : '');
      b.innerHTML = `<b>${G.T('Otros')}</b><small>${(G.CUSTOM || []).length}</small>`;
      b.onclick = () => { dexGen = OTHER; openDex(); };
      tabs.appendChild(b);
    }

    const F = [['all', 'Todos'], ['team', 'Mi equipo'], ['own', 'Tengo'], ['miss', 'Me faltan'], ['shiny', 'Shiny'],
               ['5', 5], ['4', 4], ['3', 3], ['2', 2], ['1', 1]];
    const fb = $('dex-filters');
    fb.innerHTML = '';
    for (const [k, label] of F) {
      const c = document.createElement('button');
      c.className = 'chip' + (k === dexFilter ? ' on' : '');
      c.innerHTML = k === 'shiny' ? G.Icons.html('shiny', 12) + ' Shiny'
                  : k === 'team' ? '★ ' + G.T(label) + ` (${Object.keys(s.team || {}).filter(d => s.owned[d]).length})`
                  : typeof label === 'number' ? G.Icons.rarity(label, 12) + ' ' + G.Gacha.RARITY_NAME[label] : label;
      c.onclick = () => { dexFilter = k; openDex(); };
      fb.appendChild(c);
    }
    // Por tipo (2026-10-15): una fila de chips de colores; con un tipo elegido se buscan
    // en todas las regiones. Otra vez el mismo, se quita.
    const tb = document.createElement('div');
    tb.className = 'filters dex-types';
    for (const t of Object.keys(G.U.TYPE_NAME)) {
      const c = document.createElement('button');
      c.className = 'chip' + (t === dexType ? ' on' : '');
      c.style.cssText = `border-color:${G.U.TYPE_COLOR[t]};${t === dexType ? `background:${G.U.TYPE_COLOR[t]};color:#10131c` : `color:${G.U.TYPE_COLOR[t]}`}`;
      c.textContent = G.U.TYPE_NAME[t];
      c.onclick = () => { dexType = dexType === t ? null : t; openDex(); };
      tb.appendChild(c);
    }
    fb.appendChild(tb);
    // Buscador: por nombre (traducido o no) o número, en todas las regiones.
    const search = $('dex-search');
    search.value = dexQuery;
    search.oninput = () => { dexQuery = search.value; tabs.classList.toggle('dim', !!dexQuery.trim()); renderGrid(); };
    tabs.classList.toggle('dim', !!dexQuery.trim() || !!dexType || dexFilter === 'team');
    // Móvil: que se vea en la barra lo que está elegido (el tipo, el filtro o la región).
    const bar = $('dex-bar');
    if (PHONE.matches && bar) {
      const on = tb.querySelector('.on') || (dexFilter !== 'all' && fb.querySelector('.chip.on')) || tabs.querySelector('.on');
      if (on) {
        const br = bar.getBoundingClientRect(), r = on.getBoundingClientRect();
        if (r.left < br.left || r.right > br.right - 28) on.scrollIntoView({ inline: 'center', block: 'nearest' });
      }
    }
    renderGrid();
    if (dexGen === OTHER && !dexQuery.trim() && !dexType && dexFilter !== 'team') {
      const list = G.CUSTOM || [];
      if (list.length) showCustom(G.CUSTOM_BY[dexSel] || list[0]);
      else $('dex-detail').innerHTML = `<div class="center"><h3 class="gold">${G.T('Otros')}</h3><p class="sub">${G.T('Aquí aparecerán los personajes originales del juego. No cuentan para el Pokédex.')}</p></div>`;
    } else {
      // Un original seleccionado no es un Pokémon: en las regiones se enseña el primero de la región.
      if (G.CUSTOM_BY[dexSel]) dexSel = (G.DEX.find(p => p.gen === dexGen) || G.DEX[0]).dex;
      showDetail(dexSel);
    }
  }

  /** ¿Coincide el Pokémon con lo buscado? Nombre (como se ve o el original) o número. */
  function matches(p, q) {
    if (/^\d+$/.test(q)) return p.dex === +q || p.base === +q;   // (las formas regionales, por su especie)   // número exacto: 25 o 025 -> Pikachu
    // También por tipo escrito ("fuego", "火", "fire"...).
    const byType = Object.keys(G.U.TYPE_NAME).find(t => [G.U.TYPE_NAME[t], G.T(G.U.TYPE_NAME[t]), t].some(n => String(n).toLowerCase() === q));
    if (byType) return p.types.includes(byType);
    return p.name.toLowerCase().includes(q) || G.T(p.name).toLowerCase().includes(q);
  }

  const OTHER = 'other';
  /** Pestaña «Otros»: personajes originales, aparte del Pokédex. */
  function renderOther(grid) {
    const list = G.CUSTOM || [];
    if (!list.length) {
      grid.innerHTML = `<p class="sub" style="grid-column:1/-1">${G.T('Aquí aparecerán los personajes originales del juego. No cuentan para el Pokédex.')}</p>`;
      return;
    }
    for (const c of list) {
      const cell = document.createElement('div');
      cell.className = 'cell custom';
      cell.innerHTML = `<span class="no">${G.T('Original')}</span><b>${G.T(c.name)}</b>` + (G.DB.save.petPick === c.dex ? PET_TAG() : '');
      cell.insertBefore(G.UI.spriteCanvas(c.dex, 92, 80, { scale: 2, shadow: true }), cell.querySelector('b'));
      cell.onclick = () => { dexSel = c.dex; showCustom(c); sheet(true); };
      grid.appendChild(cell);
    }
  }
  /*
   * Mascota (2026-10-16): el Pokémon (o personaje original) que saldrá del huevo de compañero
   * (companion.js pickedPet). Un botón en la ficha para marcarlo / quitarlo.
   */
  const PET_TAG = () => `<span class="badge-pet" title="Mascota" style="position:absolute;left:4px;bottom:4px;font-size:10px;font-weight:800;padding:1px 5px;border-radius:5px;background:#5fc283;color:#10301c">${G.T('Mascota')}</span>`;
  const petBtn = dex => {
    const on = G.DB.save.petPick === dex;
    return `<button id="dex-pet" class="btn ghost" style="width:100%;margin-top:6px${on ? ';border-color:#9fe0b0;color:#9fe0b0' : ''}">${G.T(on ? 'Quitar de mascota' : 'Elegir de mascota')}</button>
      <p style="font-size:11px;color:var(--muted);margin:4px 0 0;text-align:center">${G.T('La mascota es la que sale del huevo de compañero en cada run.')}</p>`;
  };
  function wirePet(dex, name, redraw) {
    const b = $('dex-pet');
    if (!b) return;
    b.onclick = () => {
      const s = G.DB.save, on = s.petPick === dex;
      if (on) delete s.petPick; else s.petPick = dex;
      G.DB.commit();
      G.UI.toast(G.I18n.f(on ? '{x} ya no es tu mascota' : '{x} es ahora tu mascota', name));
      renderGrid(); redraw();
    };
  }
  function showCustom(c) {
    const box = $('dex-detail');
    if (!box) return;
    const s = G.DB.save, dex = c.dex, usingThis = s.partner === dex;
    const max = { hp: 183, atk: 1.55, spd: 137 };
    const bar = (label, v, m, txt) =>
      `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, v / m * 100)}%"></i></div><span>${txt}</span></div>`;
    box.innerHTML = sheetHead(G.T(c.name), G.T('Original')) + `<div class="dex-hero">
      <canvas id="dex-big" class="stage" width="220" height="190"></canvas>
      <div class="center">
        <div style="color:var(--muted);font-size:13px">${G.T('Personaje original · no cuenta para el Pokédex')}</div>
        <h3>${G.T(c.name)}</h3>
        <div style="margin:6px 0">${G.UI.typeChips(c.types || [])}</div>
        ${c.desc ? `<p>${G.T(c.desc)}</p>` : ''}
      </div></div><div class="dex-info">
      ${bar('Vida', c.hp, max.hp, c.hp)}
      ${bar('Ataque', c.atk, max.atk, '×' + c.atk.toFixed(2))}
      ${bar('Velocidad', c.spd, max.spd, c.spd)}
      <p style="font-size:14px;margin:10px 0 4px">Empieza con <b class="gold">${G.Moves.BY_ID[G.startMoveOf(dex)].name}</b></p>
      <div class="dex-acts">${usingThis
        ? '<button class="btn grow" disabled style="width:100%">Es tu compañero</button>'
        : '<button id="dex-pick" class="btn gold" data-sfx="confirm" style="width:100%">Elegir de compañero</button>'}</div>
      ${petBtn(dex)}</div>`;
    wireSheet(box);
    wirePet(dex, G.T(c.name), () => showCustom(c));
    $('dex-big').style.setProperty('--stage-c', G.U.TYPE_COLOR[(c.types || ['normal'])[0]]);
    G.UI.sprite($('dex-big'), dex, { lively: true, spin: true, scale: 3, hero: true });
    const pick = $('dex-pick');
    if (pick) pick.onclick = () => {
      s.partner = dex; s.partnerShiny = false;
      G.DB.commit();
      G.UI.toast(G.T(c.name) + ' es ahora tu compañero');
      renderGrid(); showCustom(c);
    };
  }

  function renderGrid() {
    const s = G.DB.save;
    const grid = $('dex-grid');
    grid.innerHTML = '';
    const q = dexQuery.trim().toLowerCase();
    if (dexGen === OTHER && !q && !dexType && dexFilter !== 'team') { renderOther(grid); return; }
    for (const p of G.DEX) {
      // «Mi equipo» (2026-10-15): los marcados, de todas las regiones.
      if (q ? !matches(p, q) : !dexType && dexFilter !== 'team' && p.gen !== dexGen) continue;
      if (dexType && !p.types.includes(dexType)) continue;
      const own = !!s.owned[p.dex], sh = !!(s.shiny && s.shiny[p.dex]);
      const inTeam = own && !!(s.team && s.team[p.dex]);
      if (dexFilter === 'team' && !inTeam) continue;
      if (dexFilter === 'own' && !own) continue;
      if (dexFilter === 'miss' && own) continue;
      if (dexFilter === 'shiny' && !sh) continue;
      if (/^\d$/.test(dexFilter) && p.rarity !== +dexFilter) continue;

      const cell = document.createElement('div');
      cell.className = 'cell' + (own ? '' : ' locked') + (p.dex === dexSel ? ' on' : '');
      cell.insertAdjacentHTML('beforeend', `<span class="no">${noOf(p)}</span>`);
      if (inTeam) cell.insertAdjacentHTML('beforeend', '<span class="badge-team" title="Mi equipo">★</span>');
      if (p.dex === s.partner) cell.insertAdjacentHTML('beforeend', `<span class="badge-r" title="Compañero">${G.Icons.html('crown', 14)}</span>`);
      else if (sh) cell.insertAdjacentHTML('beforeend', `<span class="badge-r" title="Tienes su shiny">${G.Icons.html('shiny', 12)}</span>`);
      const useShiny = sh && p.dex === s.partner && s.partnerShiny;
      cell.appendChild(G.UI.spriteCanvas(p.dex, 92, 80, { scale: 2, silhouette: !own, shadow: own, shiny: useShiny }));
      cell.insertAdjacentHTML('beforeend', `<b>${own ? p.name : '???'}</b>${G.UI.stars(p.rarity, 9)}`);
      if (own && s.petPick === p.dex) cell.insertAdjacentHTML('beforeend', PET_TAG());
      cell.onclick = () => {
        dexSel = p.dex;
        grid.querySelectorAll('.cell').forEach(c => c.classList.remove('on'));
        cell.classList.add('on');
        showDetail(p.dex);
        sheet(true);
      };
      grid.appendChild(cell);
    }
    if (!grid.children.length) grid.innerHTML = dexFilter === 'team' && !q && !dexType
      ? '<p class="sub" style="grid-column:1/-1">Aún no hay nadie en Mi equipo: elige un Pokémon y pulsa «Añadir a Mi equipo».</p>'
      : '<p class="sub" style="grid-column:1/-1">Ninguno con este filtro.</p>';
  }

  // Variante que se está viendo en la ficha (normal o shiny).
  let viewShiny = false;

  function showDetail(dex) {
    const s = G.DB.save;
    const p = G.DEX_BY[dex];
    const own = !!s.owned[dex];
    const hasSh = G.DB.ownsShiny(dex);
    const isPartner = dex === s.partner;
    if (!hasSh) viewShiny = false;
    else if (isPartner && dex !== showDetail.last) viewShiny = !!s.partnerShiny;
    showDetail.last = dex;

    const max = { hp: 183, atk: 1.55, spd: 137 };
    const bar = (label, v, m, txt) =>
      `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, v / m * 100)}%"></i></div><span>${txt}</span></div>`;
    const usingThis = isPartner && (!hasSh || !!s.partnerShiny === viewShiny);

    const box = $('dex-detail');
    box.innerHTML = sheetHead(own ? p.name : '???', `Nº ${noOf(p)} · ${GEN_NAMES[p.gen - 1]}${formOf(p)}`) + `<div class="dex-hero">
      <canvas id="dex-big" class="stage" width="220" height="190"></canvas>
      ${hasSh ? `<div class="seg">
          <button class="${viewShiny ? '' : 'on'}" data-v="0">Normal</button>
          <button class="${viewShiny ? 'on' : ''}" data-v="1">${G.Icons.html('shiny', 12)} Shiny</button></div>` : ''}
      <div class="center">
        <div style="color:var(--muted);font-size:13px">Nº ${noOf(p)} · ${GEN_NAMES[p.gen - 1]}${formOf(p)}</div>
        <h3>${own ? p.name : '???'}</h3>
        <div style="color:${G.Gacha.RARITY_COLOR[p.rarity]}">${G.UI.stars(p.rarity, 24)} ${G.Gacha.RARITY_NAME[p.rarity]}</div>
        <div style="margin:6px 0">${own ? G.UI.typeChips(p.types) : ''}</div>
      </div></div><div class="dex-info">
      ${own ? `
        ${bar('Vida', p.hp, max.hp, p.hp)}
        ${bar('Ataque', p.atk, max.atk, '×' + p.atk.toFixed(2))}
        ${bar('Velocidad', p.spd, max.spd, p.spd)}
        <p style="font-size:14px;margin:10px 0 4px">Empieza con <b class="gold">${G.Moves.BY_ID[G.startMoveOf(dex)].name}</b></p>
        <p class="move-icons" title="Movimientos que puede aprender">
          ${G.Moves.poolFor(p).map(id => `<span title="${G.Moves.BY_ID[id].name}">${G.Icons.html('move:' + id, 16)}</span>`).join('')}</p>
        <div class="dex-acts">${usingThis
          ? '<button class="btn grow" disabled style="width:100%">Es tu compañero</button>'
          : `<button id="dex-pick" class="btn gold" data-sfx="confirm" style="width:100%">Elegir de compañero${viewShiny ? ' (shiny)' : ''}</button>`}
        <button id="dex-team" class="btn ghost" style="width:100%;margin-top:6px">${s.team && s.team[dex] ? '★ Quitar de Mi equipo' : '☆ Añadir a Mi equipo'}</button></div>
        ${petBtn(dex)}
        ${G.DexQuests.html(dex)}
      ` : `<p class="center" style="color:var(--muted)">Aún no lo tienes.<br>Consíguelo en el banner de <b class="gold">${GEN_NAMES[p.gen - 1]}</b>
            o derrotándolo cuando salga shiny.</p>`}
    </div>`;
    wireSheet(box);
    $('dex-big').style.setProperty('--stage-c', !own ? '#5b83d6' : viewShiny ? '#9ae6ff' : G.U.TYPE_COLOR[p.types[0]]);
    $('dex-big').classList.toggle('shiny', own && viewShiny);
    G.UI.sprite($('dex-big'), dex, { lively: own, spin: own, silhouette: !own, scale: 3, hero: true, shiny: own && viewShiny });
    box.querySelectorAll('.seg button').forEach(b => {
      b.onclick = () => { viewShiny = b.dataset.v === '1'; showDetail(dex); };
    });
    G.DexQuests.wire(box, dex, () => { renderGrid(); showDetail(dex); });
    if (own) wirePet(dex, p.name, () => showDetail(dex));
    const team = $('dex-team');
    if (team) team.onclick = () => {
      s.team = s.team || {};
      if (s.team[dex]) delete s.team[dex]; else s.team[dex] = Date.now();
      G.DB.commit();
      G.UI.toast(G.I18n.f(s.team[dex] ? '{x} está en Mi equipo' : '{x} ya no está en Mi equipo', p.name));
      openDex();
    };
    const pick = $('dex-pick');
    if (pick) pick.onclick = () => {
      s.partner = dex;
      s.partnerShiny = hasSh && viewShiny;
      G.DB.commit();
      G.UI.toast(p.name + (s.partnerShiny ? ' shiny' : '') + ' es ahora tu compañero');
      renderGrid(); showDetail(dex);
    };
  }

  // ---------------- mejoras ----------------

  let upgDex = null;

  function openUpgrades() {
    G.UI.show('scr-upgrades', true);
    const s = G.DB.save;
    if (!upgDex || !(s.owned[upgDex] || G.CUSTOM_BY[upgDex])) upgDex = s.partner;
    // Selector con tus Pokémon: el compañero primero, luego los que ya tienen mejoras.
    // Los personajes originales (custom.js) siempre están: no se "consiguen".
    const sel = $('upg-mon');
    const lv = d => Object.values(s.pupg[d] || {}).reduce((a, b) => a + b, 0);
    const mons = Object.keys(s.owned).map(Number).filter(d => G.DEX_BY[d])
      .concat((G.CUSTOM || []).map(c => c.dex))
      .sort((a, b) => (b === s.partner) - (a === s.partner) || lv(b) - lv(a) || a - b);
    sel.innerHTML = mons.map(d => `<option value="${d}">${G.DEX_BY[d].name}${d === s.partner ? ' (compañero)' : ''}${lv(d) ? ' · ' + lv(d) + ' niveles' : ''}</option>`).join('');
    sel.value = upgDex;
    sel.onchange = () => { upgDex = +sel.value; G.Audio.sfx('select'); renderUpgrades(); };
    renderUpgrades();
  }

  function renderUpgrades() {
    const s = G.DB.save;
    const levels = G.DB.upgradesOf(upgDex);
    const mon = G.DEX_BY[upgDex];
    const shiny = upgDex === s.partner && !!s.partnerShiny && G.DB.ownsShiny(upgDex);
    G.UI.sprite($('upg-stage'), upgDex, { lively: true, scale: 2, hero: true, shiny });
    $('upg-stage').style.setProperty('--stage-c', shiny ? '#9ae6ff' : G.U.TYPE_COLOR[mon.types[0]]);
    const box = $('upg-list');
    box.innerHTML = '';
    for (const u of G.Upgrades.LIST) {
      const lvl = levels[u.id] || 0;
      const maxed = lvl >= u.max;
      const cost = maxed ? 0 : G.Upgrades.cost(u.id, lvl);
      const el = document.createElement('div');
      el.className = 'panel upg-item';
      el.innerHTML = `
        <div class="ic">${G.Icons.html(u.icon, 32)}</div>
        <div>
          <b>${u.name}</b> <span style="color:var(--muted);font-size:13px">${u.unit}</span>
          <div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        </div>
        <div class="upg-btns">
          ${u.id === 'ban' && lvl > 0 ? `<button class="btn small" data-ban>Elegir (${banList().length}/${lvl})</button>` : ''}
          <button class="btn small ${maxed ? '' : 'gold'}" data-buy data-sfx="none" ${maxed || s.coins < cost ? 'disabled' : ''}>
          ${maxed ? 'Máx.' : `<span class="coin"></span> ${cost}`}</button></div>`;
      if (u.id === 'ban' && lvl > 0) el.querySelector('[data-ban]').onclick = () => { banOpen = !banOpen; renderUpgrades(); };
      el.querySelector('[data-buy]').onclick = () => {
        // Se vuelve a leer todo al pulsar (la partida puede haber cambiado desde que se dibujó).
        const sv = G.DB.save, lv = G.DB.upgradesOf(upgDex), now = lv[u.id] || 0;
        if (now >= u.max) { renderUpgrades(); return; }
        const price = G.Upgrades.cost(u.id, now);
        if (sv.coins < price) { renderUpgrades(); return; }
        sv.coins -= price;
        lv[u.id] = now + 1;
        G.DB.commit(true);
        G.Audio.sfx('buy');
        G.UI.refreshCoins();
        G.UI.toast(`${mon.name} · ${u.name}: nivel ${now + 1}`);
        renderUpgrades();
      };
      box.appendChild(el);
      if (u.id === 'ban' && lvl > 0 && banOpen) box.appendChild(banPicker(lvl));
    }
    box.appendChild(bindPanel());
    allButton();
  }

  /** Botón "Mejorar todo": compra niveles, del más barato al más caro, mientras alcancen las monedas. */
  function allButton() {
    const btn = $('upg-all');
    const levels = G.DB.upgradesOf(upgDex);
    let total = 0;
    for (const u of G.Upgrades.LIST) for (let l = levels[u.id] || 0; l < u.max; l++) total += G.Upgrades.cost(u.id, l);
    btn.disabled = total === 0 || G.DB.save.coins < cheapestNext(levels);
    btn.innerHTML = total === 0 ? 'Todo al máximo' : `Mejorar todo · <span class="coin"></span> ${total}`;
    btn.onclick = () => {
      const sv = G.DB.save, lv = G.DB.upgradesOf(upgDex), mon = G.DEX_BY[upgDex];
      let bought = 0;
      for (;;) {
        let best = null;
        for (const u of G.Upgrades.LIST) {
          const now = lv[u.id] || 0;
          if (now >= u.max) continue;
          const price = G.Upgrades.cost(u.id, now);
          if (price <= sv.coins && (!best || price < best.price)) best = { u, price };
        }
        if (!best) break;
        sv.coins -= best.price;
        lv[best.u.id] = (lv[best.u.id] || 0) + 1;
        bought++;
      }
      if (!bought) { renderUpgrades(); return; }
      G.DB.commit(true);
      G.Audio.sfx('buy');
      G.UI.refreshCoins();
      G.UI.toast(G.I18n.f('{x}: +{x} niveles de mejora', G.T(mon.name), bought));
      renderUpgrades();
    };
  }

  function cheapestNext(levels) {
    let min = Infinity;
    for (const u of G.Upgrades.LIST) { const l = levels[u.id] || 0; if (l < u.max) min = Math.min(min, G.Upgrades.cost(u.id, l)); }
    return min;
  }

  // ---------------- atajos: hueco fijo para cada movimiento ----------------
  // save.pbind[dex] = [movimiento del hueco 1, del 2, del 3, del 4] (o null).
  function bindPanel() {
    const s = G.DB.save;
    s.pbind = s.pbind || {};
    const list = s.pbind[upgDex] || [null, null, null, null];
    const mon = G.DEX_BY[upgDex];
    const ids = G.Moves.poolFor(mon).concat([G.startMoveOf(upgDex)]).filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => G.Moves.BY_ID[a].name.localeCompare(G.Moves.BY_ID[b].name, 'es'));
    const el = document.createElement('div');
    el.className = 'panel bind-panel';
    el.innerHTML = `<b>Atajos de movimientos</b>
      <p class="sub" style="margin:2px 0 8px">Elige qué movimiento va siempre en cada hueco (teclas 1-5 o los iconos de abajo), para la memoria muscular. Si aún no tienes tantos movimientos, va al hueco más cercano.</p>
      <div class="bind-slots">${[0, 1, 2, 3, 4].map(i => `<label class="bind-slot"><span>${i + 1}</span>
        <select class="field" data-slot="${i}"><option value="">Libre</option>${ids.map(id =>
          `<option value="${id}" ${list[i] === id ? 'selected' : ''}>${G.Moves.BY_ID[id].name}</option>`).join('')}</select></label>`).join('')}</div>`;
    el.querySelectorAll('select[data-slot]').forEach(sel => {
      sel.onchange = () => {
        const l = (s.pbind[upgDex] || [null, null, null, null, null]).slice(0, 5);
        while (l.length < 5) l.push(null);
        const i = +sel.dataset.slot, id = sel.value || null;
        // Un movimiento sólo puede estar en un hueco.
        for (let j = 0; j < 5; j++) if (id && l[j] === id) l[j] = null;
        l[i] = id;
        s.pbind[upgDex] = l;
        G.DB.commit();
        G.Audio.sfx('select');
        renderUpgrades();
      };
    });
    return el;
  }

  // ---------------- veto: movimientos bloqueados ----------------
  // Lista por Pokémon en save.pban[dex]; con N niveles de Veto, N movimientos.
  let banOpen = false;
  function banList() {
    const s = G.DB.save;
    s.pban = s.pban || {};
    return s.pban[upgDex] || (s.pban[upgDex] = []);
  }
  function banPicker(max) {
    const mon = G.DEX_BY[upgDex];
    const start = G.startMoveOf(upgDex);
    const ids = G.Moves.poolFor(mon).filter(id => id !== start)
      .sort((a, b) => G.Moves.BY_ID[a].name.localeCompare(G.Moves.BY_ID[b].name, 'es'));
    const list = banList();
    const el = document.createElement('div');
    el.className = 'panel ban-picker';
    el.innerHTML = `<p class="sub" style="margin:0 0 8px">Toca los movimientos que no quieres que te salgan en las cartas (${list.length}/${max}). El movimiento de inicio no se puede vetar.</p>
      <div class="ban-moves">${ids.map(id => { const d = G.Moves.BY_ID[id]; const on = list.includes(id);
        return `<button class="chip ${on ? 'on ban' : ''}" data-id="${id}">${G.Icons.html('move:' + id, 16)} ${d.name}${on ? ' ' + G.Icons.html('ban', 14) : ''}</button>`; }).join('')}</div>`;
    el.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => {
        const l = banList(), id = b.dataset.id, i = l.indexOf(id);
        if (i >= 0) l.splice(i, 1);
        else if (l.length >= max) { G.UI.toast('Ya tienes ' + max + ' vetados: quita uno primero'); return; }
        else l.push(id);
        G.DB.commit();
        G.Audio.sfx('select');
        renderUpgrades();
      };
    });
    return el;
  }

  /*
   * Lápida de la última run (2026-10-16, pedido del dueño): al lado de la hornacina, con lo que
   * pasó la última vez. «Aquí yace» si caíste, «Victoria» si superaste la mazmorra, «Retirada»
   * si la dejaste. Al pulsarla, el detalle (movimientos, modo, fecha).
   */
  const MODE_NAME = { normal: 'Jugar', daily: 'Desafío diario', weekly: 'Reto semanal', legend: 'Desafío legendario', tower: 'Torre sin fin', stage: 'Aventura', guard: 'Proteger a Dazhuang' };
  function grave(r) {
    const el = $('menu-grave');
    if (!el) return;
    const mon = r && G.DEX_BY[r.dex];
    el.classList.toggle('hidden', !mon);
    if (!mon) return;
    const head = r.clear ? 'Victoria' : r.dead ? 'Aquí yace' : 'Retirada';
    el.classList.toggle('won', !!r.clear);
    el.innerHTML = `<span class="g-head">${G.T(head)}</span><b class="g-name">${G.T(mon.name)}</b>` +
      `<span class="g-line">${r.mode === 'normal' || r.floor ? 'B' + (r.floor + 1) + 'F · ' : ''}${G.U.mmss(r.time)}</span>` +
      `<span class="g-line">Lv.${r.level} · ${G.I18n.f('{x} derrotados', r.kills.toLocaleString())}</span>` +
      `<span class="g-moss"></span>`;
    el.title = G.T('Tu última run');
    el.onclick = () => {
      const d = new Date(r.at);
      const lines = [
        G.T(head) + ' · ' + G.T(mon.name) + (r.shiny ? ' ✨' : ''),
        G.T('Modo') + ': ' + G.T(MODE_NAME[r.mode] || 'Otro modo') + (r.group ? ' · ' + G.T('en grupo') : ''),
        G.T('Tiempo') + ': ' + G.U.mmss(r.time) + (r.floor || r.mode === 'normal' ? ' · ' + G.T('Piso más hondo') + ': B' + (r.floor + 1) + 'F' : ''),
        G.T('Nivel') + ': ' + r.level + ' · ' + G.T('Derrotados') + ': ' + r.kills.toLocaleString() + ' · ' + G.T('Jefes') + ': ' + r.bosses,
        G.T('Pokémonedas ganadas') + ': +' + r.coins,
        (r.moves || []).length ? G.T('Movimientos') + ': ' + r.moves.map(([n, l]) => G.T(n) + ' Lv.' + l).join(', ') : '',
        d.toLocaleString()
      ].filter(Boolean);
      const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      G.Dialog.alertHtml(lines.map(l => `<div>${esc(l)}</div>`).join(''), 'Tu última run');
    };
  }

  return { init, open, GEN_NAMES };
})();
