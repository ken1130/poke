/* ============ titles.js — títulos del perfil (2026-10-21) ============
 * Un título es una etiqueta corta junto a tu nombre: arriba a la derecha (menú), en la
 * sala y encima de tu Pokémon en grupo, en el ranking y en tu perfil público.
 * Cada uno se desbloquea con una estadística de la cuenta (`stat` + `goal`) o con
 * `value(save)`; los títulos de los logros antiguos (achievements.js `title`) también se
 * pueden poner (id 'a:' + logro). Se guarda en save.title (id, o null); en grupo viaja con
 * el nombre (social.js memberInfo → coop.js begin → player.title).
 * Nombres: español aquí; 繁中 e inglés abajo (G.I18n.add). Cortos: en el móvil no caben
 * más de ~6 caracteres chinos.
 */
G.Titles = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = k => s => (s.stats && s.stats[k]) || 0;
  const count = k => s => Object.keys(s[k] || {}).length;
  // Runs jugadas con cada personaje original (custom.js, dex 10001-10008): todo el mundo los
  // tiene, así que «coleccionarlos» es haber jugado con cada uno (save.customRuns, progress.js).
  const customPlayed = s => (G.CUSTOM || []).filter(c => s.customRuns && s.customRuns[c.dex]).length;

  const LIST = [
    { id: 'lord',     name: 'Verdugo del Laberinto',  col: '#ffd23f', stat: 'clears',      goal: 1,    cond: 'Vence al Señor del Laberinto en B5F' },
    { id: 'guardian', name: 'Guardián de Dazhuang',   col: '#9fe0b0', stat: 'bestGuard',   goal: 50,   cond: 'Protege a Dazhuang las 50 oleadas' },
    { id: 'legends',  name: 'Cazador de leyendas',    col: '#c47bff', value: count('legends'), goal: 10, cond: 'Vence a 10 legendarios distintos' },
    { id: 'kills1k',  name: 'Mil tajos',              col: '#ff6b5a', stat: 'totalKills',  goal: 1000, cond: 'Derrota a 1.000 enemigos' },
    { id: 'custom',   name: 'Coleccionista original', col: '#ff9ed8', value: customPlayed, goal: () => (G.CUSTOM || []).length || 8, cond: 'Juega una run con cada personaje original' },
    { id: 'party',    name: 'Estrella de la fiesta',  col: '#ffb45f', stat: 'partyWins',   goal: 5,    cond: 'Gana 5 juegos de mesa del modo fiesta' },
    { id: 'shiny',    name: 'Cazador de brillos',     col: '#7fe0ff', value: count('shiny'), goal: 5,  cond: 'Consigue 5 shinies' },
    { id: 'phoenix',  name: 'Fénix',                  col: '#ff8a3d', stat: 'bestTime',    goal: 1800, cond: 'Aguanta 30 minutos en una run' },
    { id: 'kecleon',  name: 'Cliente de Kecleon',     col: '#5fe08a', stat: 'kecleonBuys', goal: 10,   cond: 'Compra 10 veces en la tienda de Kecleon sin robar' },
    { id: 'combo',    name: 'Maestro del combo',      col: '#a98bff', stat: 'combos',      goal: 10,   cond: 'Usa 10 ataques combinados en grupo' },
    { id: 'tower',    name: 'Escalador de la torre',  col: '#8fd0ff', stat: 'bestTower',   goal: 10,   cond: 'Llega al piso 10 de la Torre sin fin' },
    { id: 'poker',    name: 'Rey del póker',          col: '#fff3a8', stat: 'bigtwoWins',  goal: 10,   cond: 'Gana 10 partidas de Big Two' },
    { id: 'breeder',  name: 'Maestro de huevos',      col: '#f6e7c8', stat: 'hatches',     goal: 10,   cond: 'Haz eclosionar 10 huevos' },
    { id: 'friend',   name: 'Viejo amigo',            col: '#ffc4ec', stat: 'groupRuns',   goal: 10,   cond: 'Juega 10 partidas en grupo' }
  ];
  const BY = {};
  for (const t of LIST) BY[t.id] = t;

  // Títulos de los logros (achievements.js `title`): el mismo nombre en varios logros vale con cualquiera.
  let LEGACY = null;
  function legacy() {
    if (LEGACY) return LEGACY;
    const byName = new Map();
    for (const a of G.AchDefs.LIST) {
      if (!a.title) continue;
      const t = byName.get(a.title);
      if (t) { t.achs.push(a.id); continue; }
      byName.set(a.title, { id: 'a:' + a.id, name: a.title, col: '#eaf2ff', achs: [a.id], cond: a.desc, legacy: true });
    }
    LEGACY = [...byName.values()];
    for (const t of LEGACY) BY[t.id] = t;
    return LEGACY;
  }
  function all() { return LIST.concat(legacy()); }
  function def(id) { if (!id) return null; if (!BY[id]) legacy(); return BY[id] || null; }

  const save = () => G.DB.save;
  const goalOf = t => (typeof t.goal === 'function' ? t.goal() : t.goal || 1);
  /** Lo que pide y cuánto llevas: { text, v, goal, ok }. */
  function need(t) {
    const s = save();
    const goal = goalOf(t);
    if (!s) return { text: G.T(t.cond), v: 0, goal, ok: false };
    if (t.achs) { const ok = t.achs.some(id => s.ach && s.ach[id]); return { text: G.T(t.cond), v: ok ? 1 : 0, goal: 1, ok }; }
    const v = t.value ? t.value(s) : st(t.stat)(s);
    return { text: G.T(t.cond), v: Math.min(v, goal), goal, ok: v >= goal };
  }
  const unlocked = t => need(t).ok;

  /** El tuyo (sólo si sigue desbloqueado), o null. */
  function mine() {
    const s = save();
    if (!s) return null;
    // Antes el título era el nombre del logro en save.profile.title: se pasa al id.
    if (s.title == null && s.profile && s.profile.title) {
      const l = legacy().find(t => t.name === s.profile.title);
      s.title = l ? l.id : null;
    }
    const t = def(s.title);
    return t && unlocked(t) ? t : null;
  }
  /** Para mandarlo (sala, ranking): el id o ''. */
  function myId() { const t = mine(); return t ? t.id : ''; }
  /** Nombre traducido de un id (el que mandan los demás); '' si no existe. */
  function nameOf(id) { const t = def(id); return t ? G.T(t.name) : ''; }
  function colorOf(id) { const t = def(id); return t ? t.col : '#eaf2ff'; }
  /** Fichita HTML junto a un nombre ('' si no hay título). */
  function chip(id, cls = '') {
    const t = def(id);
    return t ? `<span class="tag-chip title-chip${cls ? ' ' + cls : ''}" translate="no" style="background:${t.col}">${esc(G.T(t.name))}</span>` : '';
  }

  /** Encima del nombre de un compañero (player.js): fichita de píxeles en el mundo. (x, y) = centro, borde inferior. */
  function drawTag(ctx, id, x, y) {
    const t = def(id);
    if (!t) return;
    const txt = G.T(t.name);
    ctx.save();
    ctx.font = '700 6px Pixelify,"Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    const w = Math.ceil(ctx.measureText(txt).width) + 6, h = 9;
    const x0 = Math.round(x - w / 2), y0 = Math.round(y - h);
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    ctx.fillStyle = t.col; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = '#10131a';
    ctx.fillText(txt, x, y0 + 7);
    ctx.restore();
  }

  // ---------------- desbloqueos (aviso como los logros, desde progress.js checkAch) ----------------

  /** Avisa de los títulos nuevos (los de los logros ya los anuncia el logro). notify(título, sub). */
  function check(notify) {
    const s = save();
    if (!s) return;
    s.titleSeen = s.titleSeen || {};
    const fresh = LIST.filter(t => !s.titleSeen[t.id] && unlocked(t));
    if (!fresh.length) return;
    for (const t of fresh) s.titleSeen[t.id] = Date.now();
    if (fresh.length <= 2) for (const t of fresh) notify(G.I18n.f('¡Nuevo título: {x}!', G.T(t.name)), G.T('Póntelo en Perfil → Título'));
    else notify(G.I18n.f('¡{x} títulos nuevos!', fresh.length), G.T('Póntelos en Perfil → Título'));
  }

  // ---------------- elegir (Perfil) ----------------

  /** Elige un título (o '' para ninguno). Devuelve false si está bloqueado. */
  function pick(id) {
    const s = save();
    if (!s) return false;
    const t = def(id);
    if (id && (!t || !unlocked(t))) return false;
    s.title = t ? t.id : null;
    if (G.UI && G.UI.refreshCoins && !document.getElementById('topbar').classList.contains('hidden')) G.UI.refreshCoins();
    return true;
  }

  /** La sección «Título» del perfil, dentro de `box`. onSave(): guardar y repintar. */
  function renderPicker(box, onSave) {
    const cur = myId();
    box.insertAdjacentHTML('beforeend', `<h3 style="margin-top:14px">${G.T('Título')}</h3>
      <p class="note" style="margin:0 0 6px">${G.T('Va junto a tu nombre: en el menú, en la sala y encima de ti en grupo, y en el ranking.')}</p>`);
    const row = document.createElement('div');
    row.className = 'title-row';
    const card = t => {
      const nd = t ? need(t) : { ok: true };
      const on = (t ? t.id : '') === cur;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cos-card title-card' + (on ? ' on' : '') + (nd.ok ? '' : ' locked');
      el.innerHTML = (t ? chip(t.id) : `<span class="tag-chip title-chip none">${G.T('Sin título')}</span>`)
        + (t ? `<small>${esc(nd.text)}</small>` : `<small>${G.T('Sólo tu nombre')}</small>`)
        + (nd.ok ? (on ? `<small class="gold">${G.T('Puesto')}</small>` : '')
          : `<div class="bar"><i style="width:${nd.v / nd.goal * 100}%"></i></div><small>${G.Icons.html('lock', 12)} ${nd.v} / ${nd.goal}</small>`);
      el.onclick = () => {
        if (!nd.ok) { G.Audio.sfx('error'); return; }
        pick(t ? t.id : '');
        onSave();
      };
      row.appendChild(el);
    };
    card(null);
    LIST.forEach(card);
    box.appendChild(row);

    // Los que dan los logros: sólo los conseguidos (los demás están en la pestaña Logros).
    const got = legacy().filter(unlocked);
    box.insertAdjacentHTML('beforeend', `<div class="cos-label">${G.T('Títulos de los logros')}</div>`);
    const leg = document.createElement('div');
    leg.className = 'title-legacy';
    if (!got.length) leg.innerHTML = `<small class="note" style="margin:0">${G.T('Consigue logros para desbloquear títulos.')}</small>`;
    for (const t of got) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag-chip title-chip' + (t.id === cur ? ' on' : '');
      b.setAttribute('translate', 'no');
      b.textContent = G.T(t.name);
      b.onclick = () => { pick(t.id); onSave(); };
      leg.appendChild(b);
    }
    box.appendChild(leg);
  }

  return { LIST, all, def, need, mine, myId, nameOf, colorOf, chip, drawTag, check, pick, renderPicker };
})();

// ---------------- 繁中 ----------------
G.I18n.add({
  'Verdugo del Laberinto': '迷宮之主殺手',
  'Guardián de Dazhuang': '大壯的守護者',
  'Cazador de leyendas': '傳說獵人',
  'Mil tajos': '千人斬',
  'Coleccionista original': '原創收藏家',
  'Estrella de la fiesta': '派對之星',
  'Cazador de brillos': '異色獵人',
  'Fénix': '不死鳥',
  'Cliente de Kecleon': '卡克隆常客',
  'Maestro del combo': '合體技大師',
  'Escalador de la torre': '無盡塔攀登者',
  'Rey del póker': '撲克王',
  'Maestro de huevos': '孵蛋達人',
  'Viejo amigo': '老朋友',
  'Vence al Señor del Laberinto en B5F': '在 B5F 打倒迷宮之主',
  'Protege a Dazhuang las 50 oleadas': '守護大壯撐過 50 波',
  'Vence a 10 legendarios distintos': '打倒 10 隻不同的傳說小精靈',
  'Derrota a 1.000 enemigos': '擊倒 1,000 隻敵人',
  'Juega una run con cada personaje original': '用每一隻原創角色各玩過一場',
  'Gana 5 juegos de mesa del modo fiesta': '在派對模式的桌遊贏 5 次',
  'Consigue 5 shinies': '擁有 5 隻異色',
  'Aguanta 30 minutos en una run': '單場撐過 30 分鐘',
  'Compra 10 veces en la tienda de Kecleon sin robar': '在卡克隆商店老實購買 10 次',
  'Usa 10 ataques combinados en grupo': '組隊時使用 10 次合體技',
  'Llega al piso 10 de la Torre sin fin': '無盡塔爬到第 10 層',
  'Gana 10 partidas de Big Two': '大老二贏 10 場',
  'Haz eclosionar 10 huevos': '孵化 10 顆蛋',
  'Juega 10 partidas en grupo': '組隊玩 10 場',
  'Título': '稱號',
  'Sin título': '無稱號',
  'Sólo tu nombre': '只顯示名字',
  'Puesto': '使用中',
  'Títulos de los logros': '成就稱號',
  'Va junto a tu nombre: en el menú, en la sala y encima de ti en grupo, y en el ranking.': '會跟在你的名字旁邊：主選單、組隊房間、隊友頭上、排行榜都看得到。',
  'Consigue logros para desbloquear títulos.': '達成成就可以解鎖稱號。',
  '¡Nuevo título: {x}!': '新稱號：{x}！',
  '¡{x} títulos nuevos!': '解鎖了 {x} 個新稱號！',
  'Póntelo en Perfil → Título': '到「個人檔案 → 稱號」裝上',
  'Póntelos en Perfil → Título': '到「個人檔案 → 稱號」裝上'
}, 'zh');

// ---------------- English ----------------
G.I18n.add({
  'Verdugo del Laberinto': 'Lord Slayer',
  'Guardián de Dazhuang': 'Dazhuang Guardian',
  'Cazador de leyendas': 'Legend Hunter',
  'Mil tajos': 'Thousand Cuts',
  'Coleccionista original': 'Original Collector',
  'Estrella de la fiesta': 'Party Star',
  'Cazador de brillos': 'Shiny Hunter',
  'Fénix': 'Phoenix',
  'Cliente de Kecleon': 'Kecleon Regular',
  'Maestro del combo': 'Combo Master',
  'Escalador de la torre': 'Tower Climber',
  'Rey del póker': 'Poker King',
  'Maestro de huevos': 'Egg Master',
  'Viejo amigo': 'Old Friend',
  'Vence al Señor del Laberinto en B5F': 'Defeat the Lord of the Labyrinth on B5F',
  'Protege a Dazhuang las 50 oleadas': 'Guard Dazhuang through all 50 waves',
  'Vence a 10 legendarios distintos': 'Defeat 10 different legendaries',
  'Derrota a 1.000 enemigos': 'Defeat 1,000 enemies',
  'Juega una run con cada personaje original': 'Play a run with every original character',
  'Gana 5 juegos de mesa del modo fiesta': 'Win 5 party-mode table games',
  'Consigue 5 shinies': 'Own 5 shinies',
  'Aguanta 30 minutos en una run': 'Survive 30 minutes in one run',
  'Compra 10 veces en la tienda de Kecleon sin robar': 'Buy 10 times at Kecleon\'s shop without stealing',
  'Usa 10 ataques combinados en grupo': 'Use 10 combo attacks in co-op',
  'Llega al piso 10 de la Torre sin fin': 'Reach floor 10 of the Endless Tower',
  'Gana 10 partidas de Big Two': 'Win 10 games of Big Two',
  'Haz eclosionar 10 huevos': 'Hatch 10 eggs',
  'Juega 10 partidas en grupo': 'Play 10 co-op runs',
  'Título': 'Title',
  'Sin título': 'No title',
  'Sólo tu nombre': 'Just your name',
  'Puesto': 'Equipped',
  'Títulos de los logros': 'Achievement titles',
  'Va junto a tu nombre: en el menú, en la sala y encima de ti en grupo, y en el ranking.': 'Shown next to your name: in the menu, in the lobby and above you in co-op, and in the ranking.',
  'Consigue logros para desbloquear títulos.': 'Earn achievements to unlock titles.',
  '¡Nuevo título: {x}!': 'New title: {x}!',
  '¡{x} títulos nuevos!': '{x} new titles!',
  'Póntelo en Perfil → Título': 'Equip it in Profile → Title',
  'Póntelos en Perfil → Título': 'Equip them in Profile → Title'
});
