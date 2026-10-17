/* ============ social-ui.js — apodo, amigos, sala e invitaciones ============ */
(() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** ¿Se puede usar lo online? Si no, explica por qué. */
  function needOnline() {
    if (G.DB.online) return true;
    G.UI.toast(G.DB.guest ? 'Crea una cuenta para jugar con amigos y salir en el ranking.'
      : 'Esto necesita la versión online del juego (con la nube).', 3200);
    return false;
  }

  // ======================= APODO =======================

  G.NickUI = (() => {
    let then = null, skipped = false;

    function init() {
      $('nick-form').onsubmit = async e => {
        e.preventDefault();
        $('nick-err').textContent = '';
        $('nick-ok').disabled = true;
        const r = await G.Social.claimNick($('nick-in').value);
        $('nick-ok').disabled = false;
        if (!r.ok) { $('nick-err').textContent = r.error; G.Audio.sfx('error'); return; }
        G.Audio.sfx('confirm');
        G.UI.toast('Tu apodo es ' + G.Social.me.name);
        const cb = then; then = null;
        if (cb) cb(); else G.MenuUI.open();
      };
      $('nick-later').onclick = () => { skipped = true; then = null; G.MenuUI.open(); };
    }

    /** @param next  qué abrir después de elegirlo */
    function open(next) {
      then = next || null;
      G.UI.show('scr-nick');
      $('nick-err').textContent = '';
      $('nick-in').value = '';
      setTimeout(() => $('nick-in').focus(), 50);
    }

    return { init, open, get skipped() { return skipped; } };
  })();

  /** Abre `fn` si tienes apodo; si no, pide el apodo primero. */
  function withNick(fn) {
    if (!needOnline()) return;
    if (G.Social.me) { fn(); return; }
    G.Social.start().then(r => { if (r === 'ok') fn(); else G.NickUI.open(fn); });
  }

  // ======================= AMIGOS =======================

  G.FriendsUI = (() => {
    function init() {
      $('fr-add').onsubmit = async e => {
        e.preventDefault();
        const name = $('fr-name').value;
        msg('');
        const r = await G.Social.request(name);
        msg(r.ok ? r.msg : r.error, !r.ok);
        if (r.ok) $('fr-name').value = '';
      };
      $('fr-room').onclick = () => G.LobbyUI.open();
      G.Social.on(() => { if (G.UI.isOpen('scr-friends')) render(); });
    }

    function msg(t, bad) {
      $('fr-msg').textContent = t || '';
      $('fr-msg').style.color = bad ? '#ffb0b8' : '';
      if (t) G.Audio.sfx(bad ? 'error' : 'confirm');
    }

    function open() { withNick(() => { G.UI.show('scr-friends', true); msg(''); render(); G.Social.refreshPresence(); }); }

    /** "hace 5 min", "hace 2 h", "hace 3 días". */
    function ago(t) {
      const m = Math.max(1, Math.round((Date.now() - t) / 60000));
      if (m < 60) return 'hace ' + m + ' min';
      const h = Math.round(m / 60);
      if (h < 48) return 'hace ' + h + ' h';
      return 'hace ' + Math.round(h / 24) + ' días';
    }

    function stateText(f) {
      if (f.status === 'in') return 'Quiere ser tu amigo';
      if (f.status === 'out') return 'Solicitud enviada';
      if (!f.online) return f.seen ? 'Visto ' + ago(f.seen) : 'Desconectado';
      return f.play ? 'Jugando' : 'En línea';
    }

    function render() {
      const room = G.Social.room;
      $('fr-me').innerHTML = 'Tu apodo: <b class="gold" translate="no">' + esc(G.Social.me ? G.Social.me.name : '') + '</b> · dáselo a tus amigos para que te añadan.';
      $('fr-room').classList.toggle('hidden', !room);
      const list = G.Social.friends.sort((a, b) => {
        const rank = f => f.status === 'in' ? 0 : f.status === 'ok' ? (f.online ? (f.play ? 2 : 1) : 3) : 4;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
      const box = $('fr-list');
      box.innerHTML = '';
      if (!list.length) {
        box.innerHTML = '<p class="sub">Aún no tienes amigos añadidos. Escribe arriba el apodo de un amigo.</p>';
        return;
      }
      for (const f of list) {
        const el = document.createElement('div');
        el.className = 'fr-row';
        const dot = f.status !== 'ok' ? 'pend' : !f.online ? 'off' : f.play ? 'play' : 'on';
        const inRoom = room && room.members.some(m => m.uid === f.uid);
        el.innerHTML = `<i class="dot ${dot}"></i><b translate="no"><a href="#" class="plink" title="Ver su perfil">${esc(f.name)}</a></b><span class="st">${inRoom ? 'En tu sala' : stateText(f)}</span><span class="grow"></span>`;
        if (f.status === 'ok') el.querySelector('.plink').onclick = e => { e.preventDefault(); G.ProfileUI.show(f.uid); };
        else el.querySelector('.plink').onclick = e => e.preventDefault();
        const btn = (txt, cls, fn) => {
          const b = document.createElement('button');
          b.className = 'btn small ' + cls; b.textContent = txt; b.onclick = fn; el.appendChild(b); return b;
        };
        if (f.status === 'in') {
          btn('Aceptar', 'gold', async () => { const r = await G.Social.accept(f.uid); msg(r.ok ? r.msg : r.error, !r.ok); });
          btn('Rechazar', 'ghost', () => G.Social.remove(f.uid));
        } else if (f.status === 'out') {
          btn('Cancelar', 'ghost', () => G.Social.remove(f.uid));
        } else {
          if (f.online && !f.play && !inRoom && (!room || room.isHost)) {
            btn('Invitar', 'gold', async () => {
              const r = await G.Social.invite(f.uid);
              msg(r.ok ? r.msg : r.error, !r.ok);
              if (r.ok) G.LobbyUI.open();
            });
          }
          btn('Quitar', 'ghost', async () => { if (await G.Dialog.confirm(G.I18n.f('¿Quitar a {x} de tus amigos?', f.name), { ok: 'Quitar', danger: true })) G.Social.remove(f.uid); });
        }
        box.appendChild(el);
      }
    }

    return { init, open, render };
  })();

  // ======================= SALA =======================

  G.LobbyUI = (() => {
    let membersKey = '';

    function init() {
      $('lobby-leave').onclick = async () => {
        await G.Social.leaveRoom();
        G.Net.close();
        G.MenuUI.open();
      };
      $('lobby-menu').onclick = () => G.MenuUI.open();
      $('lobby-start').onclick = start;
      $('lobby-start').dataset.sfx = 'confirm';
      // Conecta / desconecta la red al entrar o salir de una sala.
      G.Social.on(what => {
        const room = G.Social.room;
        if (room) {
          G.Net.open(room.id, room.isHost, room.host);
          G.Net.syncMembers(room.members.map(m => m.uid));
        } else if (G.Net.open_) G.Net.close();
        if (what === 'room-closed') {
          G.UI.toast('La sala se ha cerrado', 2600);
          if (G.UI.isOpen('scr-lobby')) G.MenuUI.open();
        }
        if (G.UI.isOpen('scr-lobby')) render();
      });
      G.Net.onPeer(() => { if (G.UI.isOpen('scr-lobby')) render(); });
    }

    function open() {
      if (!G.Social.room) { G.MenuUI.open(); return; }
      G.Social.refreshMember();
      G.Social.refreshPresence();
      G.UI.show('scr-lobby', true);
      membersKey = '';
      render();
    }

    function close() { G.UI.hide('scr-lobby'); }

    function connText(m, room) {
      if (m.uid === room.host) return 'Anfitrión';
      if (!room.isHost) return m.uid === G.Social.uid ? 'Tú' : 'En la sala';
      const mode = G.Net.mode(m.uid);
      return mode === 'direct' ? 'Conectado' : mode === 'relay' ? 'Conectado (por servidor)' : mode === 'failed' ? 'No se pudo conectar (reintentando…)' : 'Conectando…';
    }

    function render() {
      const room = G.Social.room;
      if (!room) return;
      const ms = room.members;
      $('lobby-code').textContent = room.id;
      // Modo: el anfitrión lo cambia; los demás lo ven.
      $('lobby-mode').querySelectorAll('[data-mode]').forEach(b => {
        const on = b.dataset.mode === room.mode;
        b.classList.toggle('gold', on);
        b.disabled = !room.isHost && !on;
        b.onclick = () => { if (room.isHost && !on) G.Social.setMode(b.dataset.mode); };
      });
      // Escenario: el anfitrión lo elige aquí mismo (es su ajuste de Modos de juego); los demás lo ven.
      const sel = $('lobby-scene');
      if (!sel.options.length) {
        sel.innerHTML = `<option value="">${G.T('Turno normal')}</option>` +
          G.Tiles.SCENES.map(i => `<option value="${i}">${G.T(G.Tiles.BIOMES[i].name)}</option>`).join('');
      }
      const mine = G.Modes.scene();
      if (room.isHost && room.scene !== mine && sel.dataset.synced !== room.id) { sel.dataset.synced = room.id; G.Social.setScene(mine); }
      const shown = room.isHost ? mine : room.scene;
      sel.value = shown == null ? '' : String(shown);
      sel.disabled = !room.isHost;
      sel.onchange = () => {
        const v = sel.value === '' ? null : +sel.value;
        G.Settings.set('scene', v);
        G.Social.setScene(v);
      };

      // Equipo: modo jefes / shiny de la sala (no los de los ajustes de cada uno).
      $('lobby-mods').classList.toggle('hidden', room.mode !== 'coop');
      $('lobby-mods').querySelectorAll('[data-mod]').forEach(b => {
        const on = !!(room.mods || {})[b.dataset.mod];
        b.textContent = G.T(on ? 'Sí' : 'No');
        b.classList.toggle('gold', on);
        b.disabled = !room.isHost;
        b.onclick = () => { if (room.isHost) G.Social.setMods(Object.assign({}, room.mods, { [b.dataset.mod]: !on })); };
      });
      // Equipo: qué se juega (una sola lista, así no se pisan): partida normal, desafíos en
      // grupo (con su clasificación de grupo), legendarios o una fase de la Aventura
      // (las que tiene desbloqueadas el anfitrión). Los modos jefes/shiny y el escenario, sólo en la normal.
      // Venías de la Aventura con "Con amigos": la fase ya elegida.
      if (room.isHost && room.mode === 'coop') {
        const ps = G.Stages.takePartyStage();
        if (ps != null && G.Stages.unlocked(ps)) G.Social.setMods(Object.assign({}, room.mods, { stage: ps, ch: null, rush: false }));
      }
      const md = room.mods || {};
      const cur = Number.isInteger(md.stage) ? 'stage' : md.ch ? md.ch : md.rush ? 'legend' : 'n';
      $('lobby-stage').classList.toggle('hidden', room.mode !== 'coop');
      $('lobby-mods').classList.toggle('hidden', room.mode !== 'coop' || cur !== 'n');
      $('lobby-scene-row').classList.toggle('hidden', room.mode === 'party' || (room.mode !== 'pvp' && cur !== 'n'));
      renderPlay(room, md, cur);

      // PK por equipos: cada uno elige el suyo (si no, 1.º y 3.º rojo, 2.º y 4.º azul).
      $('lobby-teams').classList.toggle('hidden', room.mode !== 'pvp');
      const tb = $('lobby-teams-btn');
      tb.textContent = G.T(room.teams ? 'Sí' : 'No');
      tb.classList.toggle('gold', !!room.teams);
      tb.disabled = !room.isHost;
      tb.onclick = () => { if (room.isHost) G.Social.setTeams(!room.teams); };
      const myTeam = (() => { const i = ms.findIndex(m => m.uid === G.Social.uid); return i < 0 ? -1 : G.Social.teamOf(ms[i], i); })();
      const names = t => ms.filter((m, i) => G.Social.teamOf(m, i) === t).map(m => esc(m.name)).join('、') || '—';
      const side = t => `<b style="color:${G.PvP.TEAM_COLORS[t]}">${G.T(G.PvP.TEAM_NAMES[t])}</b>: <span translate="no">${names(t)}</span>` +
        (myTeam === t ? '' : ` <button class="btn small" data-team="${t}" style="margin-left:4px">${G.T('Unirme')}</button>`);
      const tl = $('lobby-teams-list');
      tl.innerHTML = room.teams ? `<div style="flex-basis:100%;text-align:center;margin-top:4px">${side(0)}</div><div style="flex-basis:100%;text-align:center;margin-top:4px">${side(1)}</div>`
        : G.T('Todos contra todos.');
      tl.style.flexBasis = room.teams ? '100%' : '';
      tl.querySelectorAll('[data-team]').forEach(b => { b.onclick = () => G.Social.setTeam(+b.dataset.team); });
      const teamsOk = !(room.mode === 'pvp' && room.teams) || (names(0) !== '—' && names(1) !== '—');

      // PK: mapa. Arena = sin salvajes ni jefes, eliges 3 de 5 movimientos y la zona se cierra.
      $('lobby-arena').classList.toggle('hidden', room.mode !== 'pvp');
      const ab = $('lobby-arena-btn');
      ab.textContent = G.T(room.arena !== false ? 'Arena' : 'Campo abierto');
      ab.classList.toggle('gold', room.arena !== false);
      ab.disabled = !room.isHost;
      ab.onclick = () => { if (room.isHost) G.Social.setArena(room.arena === false); };
      $('lobby-arena-desc').textContent = G.T(room.arena !== false
        ? 'Sin Pokémon salvajes ni jefes: cada uno elige 3 de 5 movimientos y la zona se va cerrando.'
        : 'Con Pokémon salvajes para subir de nivel mientras os buscáis.');

      // PK: personaje al azar (el anfitrión lo activa).
      $('lobby-rand').classList.toggle('hidden', room.mode !== 'pvp');
      const rb = $('lobby-rand-btn');
      rb.textContent = G.T(room.rand ? 'Sí' : 'No');
      rb.classList.toggle('gold', !!room.rand);
      rb.disabled = !room.isHost;
      rb.onclick = () => { if (room.isHost) G.Social.setRand(!room.rand); };
      renderPkx(room, ms.length);
      renderParty(room, ms);
      $('lobby-mode-desc').textContent = G.T(room.mode === 'pvp'
        ? 'PK: os podéis atacar entre vosotros. Gana el último en pie.'
        : room.mode === 'party' ? 'Fiesta: juegos de mesa por turnos, con CPU si faltan jugadores.'
        : 'Equipo: jugáis juntos contra los Pokémon salvajes.');
      $('lobby-copy').onclick = () => G.Modes.copy(room.id);
      // Enlace: el amigo lo abre y entra directamente en la sala.
      $('lobby-link').onclick = () => G.Modes.copy(G.PartyUI.link(room.id));
      $('lobby-sub').textContent = room.isHost
        ? 'Eres el anfitrión. Pasa el código a tus amigos (hasta ' + G.Social.MAX_PLAYERS + ') y empezad cuando estéis.'
        : 'Estás en la sala de ' + ((ms.find(m => m.uid === room.host) || {}).name || '…') + '. El anfitrión empezará la partida.';

      // Las tarjetas sólo se rehacen si cambian los miembros (los sprites no parpadean).
      const nCpu = room.mode === 'party' ? Math.min(G.Social.partyOf(room).cpu, G.Social.MAX_PLAYERS - ms.length) : 0;
      const key = ms.map(m => m.uid + ':' + m.dex + ':' + (m.shiny ? 1 : 0)).join('|') + '#' + nCpu;
      const box = $('lobby-members');
      if (key !== membersKey) {
        membersKey = key;
        box.innerHTML = '';
        for (let i = 0; i < G.Social.MAX_PLAYERS; i++) {
          const m = ms[i];
          const c = document.createElement('div');
          c.className = 'lob-card' + (m ? '' : ' empty');
          if (m) {
            c.style.setProperty('--pc', G.Coop.COLORS[i]);
            c.appendChild(G.UI.spriteCanvas(m.dex, 120, 96, { scale: 2, lively: true, shiny: !!m.shiny }));
            c.insertAdjacentHTML('beforeend', `<b translate="no">${esc(m.name)}</b><small>${esc((G.DEX_BY[m.dex] || {}).name || '')}</small><span class="conn" data-u="${m.uid}"></span>`);
          } else if (i < ms.length + nCpu) {
            c.classList.add('cpu');
            c.innerHTML = `<span class="lob-cpu">${G.T('Jugador CPU')}</span><small>${G.T('Lo controla el juego')}</small>`;
          } else c.innerHTML = '<span>Libre</span>';
          box.appendChild(c);
        }
      }
      box.querySelectorAll('.conn').forEach(el => {
        const m = ms.find(x => x.uid === el.dataset.u);
        if (!m) return;
        const t = connText(m, room);
        el.textContent = t;
        el.className = 'conn' + (t === 'Conectando…' ? ' wait' : '');
      });

      // Invitar (sólo el anfitrión y si queda sitio).
      const canInvite = false;   // esta versión invita con el código de la sala, no con la lista de amigos
      $('lobby-inv-title').classList.toggle('hidden', !canInvite);
      const inv = $('lobby-invite');
      inv.classList.toggle('hidden', !canInvite);
      if (canInvite) {
        inv.innerHTML = '';
        const free = G.Social.friends.filter(f => f.status === 'ok' && f.online && !ms.some(m => m.uid === f.uid));
        if (!free.length) inv.innerHTML = '<p class="sub" style="margin:0">Ningún amigo en línea ahora mismo.</p>';
        for (const f of free) {
          const el = document.createElement('div');
          el.className = 'fr-row';
          el.innerHTML = `<i class="dot ${f.play ? 'play' : 'on'}"></i><b translate="no">${esc(f.name)}</b><span class="st">${f.play ? 'Jugando' : 'En línea'}</span><span class="grow"></span>`;
          const b = document.createElement('button');
          b.className = 'btn small gold'; b.textContent = 'Invitar';
          b.onclick = async () => { const r = await G.Social.invite(f.uid); G.UI.toast(r.ok ? r.msg : r.error); };
          el.appendChild(b);
          inv.appendChild(el);
        }
      }

      const btn = $('lobby-start');
      btn.classList.toggle('hidden', !room.isHost);
      btn.parentElement.classList.toggle('hidden', !room.isHost);     // (el invitado no tiene botón: sin barra)
      const connecting = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'connecting');
      const failed = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'failed');
      if (room.mode === 'party') {
        const pg = G.Party.game(G.Social.partyOf(room).game), seats = ms.length + nCpu;
        const okN = !!pg && seats >= pg.minPlayers && seats <= pg.maxPlayers;
        btn.disabled = !room.isHost || !okN || connecting || failed || G.Party.active;
        btn.textContent = G.I18n.f('Empezar la fiesta ({x})', seats + '/' + G.Social.MAX_PLAYERS);
        $('lobby-note').textContent = G.T(!room.isHost ? (G.Party.left ? 'Tu plaza la juega la CPU. Puedes volver a la mesa.' : 'Cuando el anfitrión empiece, entraréis todos a la vez.')
          : !pg ? 'Ese juego aún no está disponible.'
          : !okN ? 'Añade jugadores CPU: hacen falta al menos 2 jugadores.'
          : failed ? 'No se puede conectar con algún amigo: su red (o la tuya) no deja jugar en grupo. Probad con otra wifi o datos móviles; se reintenta solo.'
          : connecting ? 'Conectando con tus amigos…' : 'La partida empieza para todos a la vez.');
        return;
      }
      btn.disabled = !room.isHost || ms.length < 2 || connecting || failed || !teamsOk;
      btn.textContent = 'Empezar partida (' + ms.length + '/' + G.Social.MAX_PLAYERS + ')';
      $('lobby-note').textContent = !room.isHost ? 'Cuando el anfitrión empiece, entraréis todos a la vez.'
        : ms.length < 2 ? 'Esperando a que alguien entre con el código…'
        : !teamsOk ? 'Cada equipo necesita al menos a una persona.'
        : failed ? 'No se puede conectar con algún amigo: su red (o la tuya) no deja jugar en grupo. Probad con otra wifi o datos móviles; se reintenta solo.'
        : connecting ? 'Conectando con tus amigos…' : 'La partida empieza para todos a la vez.';
    }

    /**
     * Equipo: qué se juega, con botones (antes una lista desplegable larga): partida normal,
     * Aventura (la fase se elige en su mapa, con las estrellas), retos en grupo o legendarios.
     * Debajo, una ficha con lo elegido (objetivo y estrellas de la fase, regla de la semana...).
     */
    /**
     * PK: extras (pvp-extra.js). Rondas para todos; lo demás según cuántos sois al empezar
     * (2: tesoro, trampas, revancha; 3 o más: fantasmas, tesoro, rachas, duelo final).
     * El anfitrión los cambia; los demás los ven.
     */
    function renderPkx(room, n) {
      const box = $('lobby-pkx');
      box.classList.toggle('hidden', room.mode !== 'pvp');
      if (room.mode !== 'pvp') return;
      const o = G.Social.pkxOf(room), host = room.isHost;
      const sw = (k, label, yes = 'Sí', no = 'No') => `<span style="white-space:nowrap"><span>${G.T(label)}</span> <button class="btn small switch${o[k] ? ' gold' : ''}" data-pkx="${k}"${host ? '' : ' disabled'}>${G.T(o[k] ? yes : no)}</button></span>`;
      const row = (title, items, note) => `<div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">${title ? `<b>${G.T(title)}</b>` : ''}${items.join('')}${note ? `<span class="sub" style="margin:0;flex-basis:100%;text-align:center">${G.T(note)}</span>` : ''}</div>`;
      const h = row('', [sw('bo3', 'Rondas', 'Al mejor de 3', 'Una ronda')], o.bo3 ? 'Gana quien gane 2 rondas; entre rondas, todos vuelven con la vida llena.' : 'Una sola ronda: el último en pie gana.')
        + row('Si sois 2:', [sw('treasure', 'Tesoro central'), sw('traps', 'Suelo trampa'), sw('reroll', 'Revancha del perdedor')],
              n === 2 ? 'Ahora sois 2: se usan éstos.' : '')
        + row('Si sois 3 o más:', [sw('ghosts', 'Fantasmas traviesos'), sw('treasure', 'Tesoro central'), sw('streak', 'Rachas de K.O.'), sw('duel', 'Duelo final')],
              n >= 3 ? 'Ahora sois 3 o más: se usan éstos.' : '');
      if (box.dataset.html !== h) {
        box.innerHTML = h; box.dataset.html = h;
        box.querySelectorAll('[data-pkx]').forEach(b => {
          b.onclick = () => { const r = G.Social.room; if (r && r.isHost) { const c = G.Social.pkxOf(r); c[b.dataset.pkx] = !c[b.dataset.pkx]; G.Social.setPkx(c); } };
        });
      }
    }

    /**
     * Fiesta (party.js): el juego (los que aún no están, "Próximamente") y cuántas CPU
     * rellenan plazas (máximo 4 en la mesa). El anfitrión lo cambia; los demás lo ven.
     * Un invitado que dejó la mesa (o se cortó) puede volver con "Volver a la mesa".
     */
    function renderParty(room, ms) {
      const box = $('lobby-party');
      box.classList.toggle('hidden', room.mode !== 'party');
      if (room.mode !== 'party') return;
      const o = G.Social.partyOf(room), host = room.isHost;
      const maxCpu = Math.max(0, G.Social.MAX_PLAYERS - ms.length), cpu = Math.min(o.cpu, maxCpu);
      const g = G.Party.game(o.game);
      const chips = G.Party.games().map(d => `<button class="chip lp-game ${d.id === o.game && !d.soon ? 'on' : ''}" data-pg="${d.id}" ${host && !d.soon ? '' : 'disabled'}>
          ${G.T(d.name)}${d.soon ? ` <small class="lp-soon">${G.T('Próximamente')}</small>` : ''}</button>`).join('');
      const back = !host && G.Party.left ? `<button class="btn small gold" data-pback>${G.T('Volver a la mesa')}</button>` : '';
      const h = `<div class="chips lp-games">${chips}</div>
        <div class="sub lp-desc">${g ? G.T(g.desc) : ''}</div>
        <div class="row lp-cpu"><span>${G.T('Jugadores CPU')}</span>
          <button class="btn small" data-pcpu="-1" ${host && cpu > 0 ? '' : 'disabled'}>−</button><b translate="no">${cpu}</b>
          <button class="btn small" data-pcpu="1" ${host && cpu < maxCpu ? '' : 'disabled'}>+</button>
          <span class="sub" style="margin:0">${G.I18n.f('En la mesa: {x}', (ms.length + cpu) + '/' + G.Social.MAX_PLAYERS)}</span>${back}</div>`;
      if (box.dataset.html !== h) {
        box.innerHTML = h; box.dataset.html = h;
        box.querySelectorAll('[data-pg]').forEach(b => { b.onclick = () => { const r = G.Social.room; if (r && r.isHost) { G.Audio.sfx('click'); G.Social.setParty(Object.assign(G.Social.partyOf(r), { game: b.dataset.pg })); } }; });
        box.querySelectorAll('[data-pcpu]').forEach(b => {
          b.onclick = () => {
            const r = G.Social.room;
            if (!r || !r.isHost) return;
            const c = G.Social.partyOf(r), mx = Math.max(0, G.Social.MAX_PLAYERS - r.members.length);
            G.Social.setParty(Object.assign(c, { cpu: Math.max(0, Math.min(mx, Math.min(c.cpu, mx) + +b.dataset.pcpu)) }));
          };
        });
        const pb = box.querySelector('[data-pback]');
        if (pb) pb.onclick = () => G.Party.hello(true);
      }
    }

    function renderPlay(room, md, cur) {
      const PLAYS = [['n', 'Partida normal'], ['stage', 'Aventura'], ['daily', 'Reto diario'], ['weekly', 'Reto semanal'],
                     ['tower', 'Torre sin fin'], ['legend', 'Desafío legendario']];
      const set = v => G.Social.setMods(Object.assign({}, md, { stage: null, rush: v === 'legend', ch: ['daily', 'weekly', 'tower'].includes(v) ? v : null }));
      const pickStage = () => G.Stages.openMap({ current: md.stage, pick: id => G.Social.setMods(Object.assign({}, md, { stage: id, ch: null, rush: false })) });
      const box = $('lobby-play');
      const html = PLAYS.map(([v, l]) => `<button class="chip ${v === cur ? 'on' : ''}" data-play="${v}" ${room.isHost ? '' : 'disabled'}
        style="padding:6px 12px;font-size:14px">${G.T(l)}</button>`).join('');
      if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
      box.querySelectorAll('[data-play]').forEach(b => {
        b.onclick = () => {
          if (!room.isHost) return;
          G.Audio.sfx('click');
          if (b.dataset.play === 'stage') pickStage(); else set(b.dataset.play);
        };
      });
      // Ficha de lo elegido.
      const info = $('lobby-play-info');
      let h = '';
      if (cur === 'stage') {
        const s = G.Stages.LIST[md.stage], n = G.Stages.starsOf(s.id);
        h = `<div style="flex:1;min-width:220px"><b class="gold">${G.T('Aventura')} ${G.Stages.title(s)}</b>
            <span style="color:#ffd23f;letter-spacing:1px" title="${G.T('Tus estrellas')}">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>
            <div style="font-size:13px">🎯 ${G.Stages.goalText(s)}</div>
            <div style="font-size:12px;color:var(--muted)">★ ${G.T('Superarla')} · ★ ${G.T('Acabar con la mitad de la vida o más')} · ★ ${G.Stages.star3Text(s)}</div></div>
          ${room.isHost ? `<button class="btn small gold" data-change>${G.T('Cambiar fase')}</button>` : ''}`;
      } else if (cur === 'weekly') {
        const wk = G.Challenges.weekly();
        h = `<div><b class="gold">${G.T('Reto semanal')} · ${G.T(wk.name)}</b><div style="font-size:13px">${G.T(wk.desc)} ${G.T('Clasificación de grupos aparte.')}</div></div>`;
      } else {
        const D = { n: 'Partida normal: con los modos y el escenario que elijas aquí abajo.',
                    daily: 'Mismo mapa y mismos enemigos para todos hoy. Clasificación de grupos aparte.',
                    tower: 'Cada minuto subís un piso y cae una maldición nueva. Clasificación de grupos aparte.',
                    legend: 'Legendarios uno tras otro en la arena de la grieta. ¿Cuántos vencéis?' };
        h = `<div style="font-size:13px">${G.T(D[cur] || '')}</div>`;
      }
      if (info.dataset.html !== h) { info.innerHTML = h; info.dataset.html = h; }
      const ch = info.querySelector('[data-change]');
      if (ch) ch.onclick = pickStage;
    }

    function start() {
      const room = G.Social.room;
      if (room && room.isHost && room.mode === 'party') {
        // Fiesta: no se entra en el mundo; se abre la mesa para todos (la sala sigue abierta
        // para que quien se corte pueda volver a entrar y recuperar su plaza).
        const o = G.Social.partyOf(room);
        const r = G.Party.hostStart({ game: o.game, cpu: Math.min(o.cpu, G.Social.MAX_PLAYERS - room.members.length), roomId: room.id,
          members: room.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: !!m.shiny })) });
        if (!r.ok) G.UI.toast(G.I18n.f(r.error, r.x || ''), 2600);
        return;
      }
      if (!room || !room.isHost || room.members.length < 2) return;
      // PK con personaje al azar: a cada uno un Pokémon distinto (no legendario, con sprites).
      const rand = room.mode === 'pvp' && !!room.rand;
      const pool = rand ? G.DEX.filter(p => !p.leg && G.SPRITE_META[p.dex]) : [];
      const picks = rand ? G.U.pickN(pool, room.members.length) : [];
      const cfg = {
        k: 'start', seed: Math.floor(Math.random() * 1e6), host: room.host, pvp: room.mode === 'pvp', scene: room.mode === 'pvp' || !(room.mods || {}).ch && !(room.mods || {}).rush && !Number.isInteger((room.mods || {}).stage) ? G.Modes.scene() : null, rand,
        mods: room.mode === 'pvp' ? {} : { boss: !!(room.mods || {}).boss, shiny: !!(room.mods || {}).shiny, rush: !!(room.mods || {}).rush,
          stage: Number.isInteger((room.mods || {}).stage) ? room.mods.stage : null, ch: (room.mods || {}).ch || null },
        teams: room.mode === 'pvp' && !!room.teams,
        arena: room.mode === 'pvp' && room.arena !== false,
        pkx: room.mode === 'pvp' ? G.Social.pkxOf(room) : null,      // extras del PK (pvp-extra.js)
        members: room.members.map((m, i) => ({ uid: m.uid, name: m.name, dex: rand ? picks[i].dex : m.dex, shiny: rand ? false : !!m.shiny, team: G.Social.teamOf(m, i) }))
      };
      G.Social.setOpen(false);
      G.Net.broadcast(cfg);
      G.Flow.startCoop(cfg);
    }

    return { init, open, close, render };
  })();

  // ======================= INVITACIONES =======================

  G.InvitePop = (() => {
    let cur = null;

    function init() {
      $('inv-yes').onclick = async () => {
        if (!cur) return;
        const from = cur.from;
        hide();
        const r = await G.Social.acceptInvite(from);
        if (!r.ok) { G.UI.toast(r.error, 3000); return; }
        G.LobbyUI.open();
      };
      $('inv-no').onclick = () => { if (cur) G.Social.declineInvite(cur.from); hide(); };
      G.Social.on(what => { if (what === 'invites' || what === 'room') refresh(); });
    }

    function hide() { cur = null; $('invite-pop').classList.add('hidden'); }

    /** Enseña la invitación más antigua si estás en los menús (no en plena partida). */
    function refresh() {
      const room = G.Social.room;
      const list = G.Social.invites.filter(i => !room || i.room !== room.id).sort((a, b) => a.at - b.at);
      if (!list.length || G.Game.state !== 'ui' || !G.DB.loggedIn) { hide(); return; }
      if (cur && cur.from === list[0].from) return;
      cur = list[0];
      $('inv-text').innerHTML = `${G.Icons.html('friends', 22)} <b class="gold" translate="no">${esc(cur.name)}</b> te invita a jugar en su sala`;
      $('invite-pop').classList.remove('hidden');
      G.Audio.sfx('shiny');
    }

    return { init, refresh };
  })();

  G.SocialUI = {
    init() { G.NickUI.init(); G.FriendsUI.init(); G.LobbyUI.init(); G.InvitePop.init(); },
    withNick, needOnline
  };
})();
