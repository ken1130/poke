/* ============ dungeon.js — sorpresas del mapa (2026-10-15) ============
 * Cosas que aparecen durante la run (las ve todo el grupo, salen en el minimapa):
 *
 *   mhouse  Casa de monstruos: un "?" en el suelo. Al entrar, salen muchos
 *           enemigos alrededor; aguanta 30 s (o acaba con todos) y suelta un
 *           buen botín en el centro.
 *   shop    Tienda de Kecleon: 3 cosas a la venta (se pagan con las monedas de la
 *           run). Quédate encima para comprar. Sin dinero suficiente, si sigues
 *           encima, la robas... y Kecleon se enfada: sale como jefe (tan fuerte como
 *           los jefes de ese momento y algo más según tu nivel). Si lo vences, lo
 *           que quede en la tienda es gratis.
 *   statue  Estatua misteriosa: al tocarla, una bendición (o una maldición con
 *           premio) para todo el grupo durante 3 minutos.
 *
 * Interiores (2026-10-15): la tienda y la sala "?" son una PUERTA en el mapa. Al
 * tocarla, todo el grupo entra a un interior (como la arena de la grieta: una sala
 * cerrada lejos del mapa, los enemigos de fuera se guardan con EnemyMgr.stash y no
 * aparecen nuevos). Tienda: sin enemigos, se abre el menú; robar despierta a Kecleon
 * DENTRO y la puerta se cierra hasta vencerlo. Sala: casa de monstruos (la puerta se
 * cierra 30 s), tesoro, curación o trampa. Se sale por la puerta del sur cuando
 * todos están en ella (o han pulsado «Salir»); fuera, onda que aparta a los enemigos
 * y 3 s de invulnerabilidad.
 *
 * Cooperativo: lo decide todo el anfitrión (dónde sale, cuándo empieza, quién
 * compra, la bendición, cuándo se entra y se sale de un interior) y se lo cuenta a
 * los demás con eventos ['dg', ...]: 'enter' cfg · 'exit' · 'rlock' (puerta). Los
 * invitados piden comprar con ['dg', 'buy', ...] y salir con ['dg', 'out'].
 * Se entra TODOS juntos (un interior por grupo): con el mundo y los enemigos
 * compartidos y decididos por el anfitrión, interiores separados por jugador
 * romperían la sincronización. En solitario, igual pero local.
 */
G.Dungeon = (() => {
  const T = () => G.Game.st.time;
  const authority = () => !G.Coop.active || G.Coop.isHost;

  let sites = [];                    // { id, type, x, y, state, ... }
  let nextId = 1;
  let houseT = 0, shopT = 0, statueT = 0, timed = false;
  let blessing = null;               // { id, until } (todo el grupo)
  let buyT = 0, buyKey = '';         // tú, encima de un artículo de la tienda
  let room = null, lastExit = -99;   // interior en el que está el grupo (ver beginRoom)

  function reset() {
    sites = []; nextId = 1; blessing = null; buyT = 0; buyKey = ''; room = null; lastExit = -99; shopSkip = null;
    houseT = 150; shopT = 270; statueT = 200;
    G.Funny.reset(); timed = false;
  }
  const allowed = () => !G.PvP.on && !G.Rift.inArena && !room && G.Modes.run !== 'legend';
  const byId = id => sites.find(s => s.id === id);

  // ---------------- red ----------------
  function send(ev) { if (G.Coop.active && G.Coop.isHost) G.Coop.broadcast(ev); }
  /** Lo que se cuenta de un sitio (lo justo para dibujarlo). */
  const pack = s => ['dg', 'site', s.id, s.type, Math.round(s.x), Math.round(s.y), s.state, s.wares || null, s.until || 0, s.spins == null ? 3 : s.spins];

  function onNet(ev) {
    const k = ev[1];
    if (k === 'site') {
      let s = byId(ev[2]);
      if (!s) { s = { id: ev[2] }; sites.push(s); }
      Object.assign(s, { type: ev[3], x: ev[4], y: ev[5], state: ev[6], wares: ev[7], until: ev[8], spins: ev[9] == null ? 3 : ev[9] });
    } else if (k === 'gone') sites = sites.filter(s => s.id !== ev[2]);
    else if (k === 'got') applyWare(G.Game.player, ev[2]);
    else if (k === 'bless') startBlessing(ev[2], ev[3]);
    else if (k === 'say') G.Spawner.say(G.T(ev[2]), ev[3] || 3, true);
    else if (k === 'ach') G.Progress.event(ev[2]);
    else if (k === 'fn') G.Funny.onNet(ev);
    else if (k === 'spun') G.Roulette.onSpun(ev[2], ev[3], ev[4]);
    else if (k === 'room') { if (ev[2] === 'heal' && room) room.springFull = false; roomFx(ev[2], ev[3], ev[4]); }
    else if (k === 'chest') openChest(ev[2]);
    else if (k === 'enter') beginRoom(ev[2]);
    else if (k === 'exit') endRoom();
    else if (k === 'rlock') { if (room) room.locked = !!ev[2]; }
    else if (k === 'poor') G.Spawner.say(G.I18n.f('¡No tienes bastantes monedas! (cuesta {x})', ev[2]), 2, true);
  }
  /** Anfitrión: un invitado pide comprar (o se lleva sin pagar) el artículo `idx`. */
  function onClient(from, ev) {
    if (ev[1] === 'buy') tryBuy(byId(ev[2]), ev[3], from, !!ev[4]);
    else if (ev[1] === 'out') { if (room) room.out.add(from); }
    else if (ev[1] === 'spin') {
      const s = byId(ev[2]), r = G.Roulette.hostSpin(s, ev[3], from);
      G.Coop.sendTo(from, ['dg', 'spun', r ? r.idx : -1, r ? r.delta : 0, r ? r.left : 0]);
      if (r && s) send(pack(s));
    }
  }

  /** Logro para todo el grupo (cada uno lo apunta en su partida). */
  function award(kind) { G.Progress.event(kind); send(['dg', 'ach', kind]); }

  function say(text, secs = 3) {
    G.Spawner.say(G.T(text), secs, true);
    send(['dg', 'say', text, secs]);
  }

  // ---------------- dónde salen ----------------

  function freeSpot(p, r0, r1, clear = 60) {
    for (let k = 0; k < 50; k++) {
      const a = Math.random() * 6.2832, d = G.U.rand(r0, r1);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      let ok = G.World.isFree(x, y, 18);
      for (let j = 0; ok && j < 8; j++) ok = G.World.isFree(x + Math.cos(j * 0.785) * clear, y + Math.sin(j * 0.785) * clear * 0.7, 10);
      if (ok && !sites.some(s => G.U.dist2(s.x, s.y, x, y) < 400 * 400)) return [x, y];
    }
    return null;
  }
  function add(type, p, r0, r1, extra) {
    const at = freeSpot(p, r0, r1, type === 'mhouse' ? 120 : 70);
    if (!at) return null;
    const s = Object.assign({ id: nextId++, type, x: at[0], y: at[1], state: 'idle' }, extra);
    sites.push(s);
    send(pack(s));
    return s;
  }
  function setState(s, state) { s.state = state; send(pack(s)); }
  function remove(s) { sites = sites.filter(o => o !== s); send(['dg', 'gone', s.id]); }

  // ---------------- cada fotograma ----------------

  /** Anfitrión o solitario: programa lo que sale y lo que pasa. */
  function tick(dt, players) {
    G.Funny.tick(dt, players);
    const live = players.filter(p => !p.dead);
    if (!live.length) return;
    const t = T();
    // Fase de la Aventura (más corta): la primera de cada cosa, repartida en lo que dura.
    if (!timed) {
      timed = true;
      const len = G.Stages.runLength && G.Stages.runLength();
      if (len) { houseT = Math.round(len * 0.3); statueT = Math.round(len * 0.45); shopT = Math.round(len * 0.6); }
    }
    if (blessing && t >= blessing.until) endBlessing();
    if (room) {
      roomTick(dt, live);
      for (const s of sites.slice()) if (s.type === 'shop') shopTick(s, live);
      return;
    }
    // Puertas de los interiores: si alguien la toca, entra todo el grupo.
    if (!G.PvP.on && !G.Rift.inArena && t - lastExit > 2.5) {
      for (const s of sites) {
        const open = (s.type === 'shop' && (s.state === 'open' || s.state === 'free')) || (s.type === 'mhouse' && s.state === 'idle');
        if (open && live.some(p => G.U.dist2(p.x, p.y, s.x, s.y + 6) < 40 * 40)) { enterRoom(s, live); return; }
      }
    }
    if (allowed()) {
      if (t >= houseT && !sites.some(s => s.type === 'mhouse' && s.state === 'idle')) {
        houseT = t + G.U.rand(170, 240);
        if (add('mhouse', G.U.pick(live), 520, 820)) say('Hay una sala misteriosa (?) en el minimapa…', 3.5);
      }
      if (t >= shopT && !sites.some(s => s.type === 'shop')) {
        shopT = t + G.U.rand(380, 460);
        if (add('shop', G.U.pick(live), 480, 760, { wares: rollWares(t), until: t + 150 })) say('¡Kecleon ha abierto una tienda cerca!', 3.5);
      }
      if (t >= statueT && !sites.some(s => s.type === 'statue')) {
        statueT = t + G.U.rand(220, 300);
        if (add('statue', G.U.pick(live), 420, 700)) say('Ha aparecido una estatua misteriosa…', 3);
      }
    }
    for (const s of sites.slice()) {
      if (s.type === 'shop') shopTick(s, live);
      else if (s.type === 'statue') statueTick(s, live);
    }
  }

  /** Cada ordenador, para su jugador: comprar en la tienda (quedarse encima). */
  function update(dt, pl) {
    G.Funny.update(dt, pl);
    if (room && pl && !pl.dead) collideFurniture(pl);
    if (room && G.Coop.isHost !== false) for (const e of G.EnemyMgr.all()) if (!e.dead && !e.remote) collideFurniture(e);
    if (!pl || pl.dead || !room || room.kind !== 'shop') { closeShop(); return; }
    // Dentro de la tienda: el menú se abre solo (y otra vez si vuelves al mostrador).
    const shop = byId(room.siteId);
    if (!shop || (shop.state !== 'open' && shop.state !== 'free')) { closeShop(); return; }
    // Ruleta (2026-10-15): al acercarte a ella se abre sola (también desde el menú).
    const [rx, ry] = roulP(), nearR = G.U.dist2(pl.x, pl.y, rx, ry + 12) < 70 * 70;
    if (nearR && !room.atRoul && !G.Roulette.busy) {
      if ((shop.spins == null ? 3 : shop.spins) > 0) openRoulette(shop);
      else G.Spawner.say(G.T('Ya no quedan tiradas en esta ruleta'), 2, true);
    }
    room.atRoul = nearR;
    if (G.Roulette.busy) return;
    if (shop.state !== room.seen) { room.seen = shop.state; shopSkip = null; }   // Kecleon vencido: otra vez el menú
    const atCounter = G.U.dist2(pl.x, pl.y, room.cx, counterY()) < 110 * 110;
    if (!atCounter) room.wasAway = true;
    if (shopSkip === shop.id && atCounter && !openShop && room.wasAway) shopSkip = null;
    if (!openShop) { if (shopSkip !== shop.id) { room.wasAway = false; showShop(shop); } }
    else refreshShop();
  }

  // ---------------- menú de la tienda ----------------
  let openShop = null, shopKey = '', shopSkip = null;
  const WARE_DESC = { potion: 'Una poción al azar.', upgrade: 'Una mejora de las cartas de nivel (sobre todo movimientos).', heal: 'Recuperas el 60 % de la vida.',
                      rerolls: '+3 cambios de cartas de nivel.', disc: 'Un disco de movimientos: de 1 a 4 mejoras.', tm: 'Aprendes un movimiento nuevo (o una mejora si no caben más).',
                      protein: '+10 % de daño el resto de la run.', hpup: '+30 de vida máxima.', revive: 'Si caes, vuelves con la mitad de la vida (una vez).',
                      ticket: 'Un ticket del gacha (para el grupo).', egg: 'Un huevo Pokémon (si aún no tienes compañero).' };
  function wareIcon(w) {
    if (WARE_SPRITE[w.kind]) return `<img src="${G.Tiles.propSprite(G.World.biome, WARE_SPRITE[w.kind], 0).toDataURL()}" style="width:36px;height:36px;image-rendering:pixelated">`;
    return G.Icons.html(w.kind === 'item' ? w.item : WARE_ICON[w.kind], 36);
  }
  function showShop(s) {
    openShop = s; shopKey = '';
    const el = document.getElementById('shop-leave');
    el.onclick = () => { shopSkip = s.id; closeShop(); requestExit(); };
    document.getElementById('shop-roul').onclick = () => { if ((s.spins == null ? 3 : s.spins) > 0) openRoulette(s); };
    refreshShop();
    G.UI.show('scr-shop');
    G.Audio.sfx('select');
  }
  function openRoulette(s) {
    G.UI.hide('scr-shop');
    G.Roulette.open(s, () => { if (openShop === s) { shopKey = ''; G.UI.show('scr-shop'); refreshShop(); } });
  }
  function closeShop() {
    if (!openShop) return;
    openShop = null;
    G.UI.hide('scr-shop');
  }
  /** Rehace la lista si algo ha cambiado (vendido, monedas, estado). */
  function refreshShop() {
    const s = openShop, pl = G.Game.player;
    if (!s || G.Roulette.busy) return;
    const coins = Math.floor(pl.coins || 0), free = s.state === 'free', left = s.spins == null ? 3 : s.spins;
    const key = s.state + ':' + coins + ':' + left + ':' + s.wares.map(w => w.sold ? 1 : 0).join('');
    if (key === shopKey) return;
    shopKey = key;
    document.getElementById('shop-sub').textContent = free ? G.T('¡Has vencido a Kecleon! Todo es GRATIS') : G.I18n.f('Monedas de esta run: {x}', coins);
    const box = document.getElementById('shop-list');
    box.innerHTML = '';
    s.wares.forEach((w, i) => {
      const row = document.createElement('div');
      row.className = 'shop-row' + (w.sold ? ' sold' : '');
      const name = w.kind === 'item' && G.Items.BY[w.item] ? G.Items.BY[w.item].name : WARE_NAME[w.kind];
      const desc = w.kind === 'item' && G.Items.BY[w.item] ? G.Items.BY[w.item].desc : WARE_DESC[w.kind];
      const can = free || coins >= w.price;
      row.innerHTML = `<div class="ico">${wareIcon(w)}</div><div class="txt"><b>${G.T(name)}</b><small>${G.T(desc || '')}</small></div>` +
        (w.sold ? `<span class="sold">${G.T('Vendido')}</span>` :
          `<div class="act"><span class="price ${can ? '' : 'poor'}">${free ? G.T('Gratis') : G.Icons.html('coin', 14) + ' ' + w.price}</span>` +
          `<div class="row" style="gap:4px"><button class="btn small gold" data-buy="${i}" ${can ? '' : 'disabled'}>${G.T('Comprar')}</button>` +
          (free ? '' : `<button class="btn small steal" data-steal="${i}" title="${G.T('Kecleon se enfadará')}">${G.T('Robar')}</button>`) + '</div></div>');
      box.appendChild(row);
    });
    box.querySelectorAll('[data-buy]').forEach(b => { b.onclick = () => { G.Audio.sfx('coin'); request(s, +b.dataset.buy, false); }; });
    box.querySelectorAll('[data-steal]').forEach(b => { b.onclick = async () => {
      if (!(await G.Dialog.confirm('¿Robarlo? Kecleon se enfadará y te perseguirá (si lo vences, todo será gratis).', { ok: 'Robar', danger: true }))) return;
      if (openShop !== s) return;
      request(s, +b.dataset.steal, true); closeShop(); shopSkip = s.id;
    }; });
    const rb = document.getElementById('shop-roul');
    rb.textContent = G.T('Ruleta de Kecleon') + ' (' + left + ')';
    rb.disabled = left <= 0;
  }
  /** Al salir de un interior: onda que aparta a los enemigos cercanos y 3 s sin recibir daño. */
  function farewell(pl, msg) {
    pl.invuln = Math.max(pl.invuln || 0, 3);
    G.FX.ring(pl.x, pl.y, 10, 320, '#7dffb0', 0.7, 6);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#9fe0b0', 30, 260);
    G.Audio.sfx('surge');
    G.Spawner.say(G.T(msg || '¡Kecleon te despide! Tienes 3 s para escapar'), 2.4, true);
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 320)) {
      if (e.dead || e.boss) continue;
      e.hurt(1, '#9fe0b0', e.x - pl.x, e.y - pl.y, 650);
    }
  }
  function request(s, i, steal) {
    if (authority()) tryBuy(s, i, null, steal);
    else G.Coop.request(['dg', 'buy', s.id, i, steal ? 1 : 0]);
  }

  // ---------------- casa de monstruos ----------------

  const HOUSE_TIME = 30;
  /** Cada ordenador: lo que la sala le hace a SU Pokémon (si está cerca). */
  function roomFx(kind, x, y) {
    G.FX.ring(x, y, 10, 300, kind === 'heal' ? '#5fe08a' : kind === 'trap' ? '#a043d0' : '#ffd23f', 0.8, 6);
    G.FX.burst(x, y - 10, kind === 'heal' ? '#7dffb0' : kind === 'trap' ? '#c46cf0' : '#ffe14d', 40, 260);
    const pl = G.Game.player;
    if (!pl || pl.dead || G.U.dist2(pl.x, pl.y, x, y) > (room ? 700 : 340) ** 2) return;
    if (kind === 'heal') pl.heal(pl.maxHp);
    else if (kind === 'trap') { pl.invuln = 0; pl.hurt(pl.maxHp * 0.15); pl.slowT = 3; G.Audio.sfx('hurt'); }
  }

  /** Casa de monstruos (dentro de la sala): `n` enemigos por la sala, lejos de vosotros. */
  function wave(n) {
    room.wave++;
    const t = T(), ts = room.ts;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, ok = false;
      for (let k = 0; k < 12 && !ok; k++) {
        x = room.cx + G.U.rand(-1, 1) * (room.rw - 1.5) * ts; y = room.cy + G.U.rand(-1, 1) * (room.rh - 1.5) * ts;
        ok = G.World.isFree(x, y, 12) && G.Game.everyone().every(p => G.U.dist2(p.x, p.y, x, y) > 130 * 130);
      }
      if (!ok) continue;
      // Más duros que los de ese momento (2026-10-15: antes caían de un golpe):
      // +90 s de dureza, ×2 de vida, ×1,3 de daño y uno de cada 6, élite.
      const e = G.Spawner.spawnAt(x, y, t + 90);
      if (e) {
        e.maxHp = e.hp = Math.round(e.maxHp * 2); e.dmg *= 1.3;
        if (i % 6 === 0 && e.behavior !== 'thief') e.makeElite(G.U.pick(Object.keys(G.Enemy.ELITE)));
        room.mobs.push(e.id); G.FX.burst(x, y - 10, '#c47bff', 6, 90); }
    }
  }
  function houseStartFx() {
    G.Spawner.say(G.T('¡Es una casa de monstruos! Aguanta 30 s'), 3, true);
    G.Audio.sfx('boss');
    G.Camera.kick(0.8);
  }

  // ---------------- interiores ----------------

  const ROOMS = { shop: { rw: 7, rh: 5, theme: 'fighting' }, myst: { rw: 9, rh: 7, theme: 'ghost' } };
  const TSZ = () => G.Tiles.T * G.Sprites.PX;
  const counterY = () => room.cy - (room.rh - 2.6) * room.ts;
  /** Muebles de la tienda que no se atraviesan: [x0, y0, x1, y1] (mostrador, estanterías, ruleta). */
  function furniture() {
    if (!room || room.kind !== 'shop') return [];
    const ts = room.ts, cy = counterY() + 14, out = [[room.cx - 70, cy - 16, room.cx + 70, cy + 16]];
    for (let i = -2; i <= 2; i++) if (i) { const x = room.cx + i * ts * 2.2, y = room.cy - (room.rh - 1.4) * ts; out.push([x - 30, y - 30, x + 30, y + 30]); }
    const [rx, ry] = roulP();
    out.push([rx - 20, ry - 6, rx + 20, ry + 30]);
    return out;
  }
  /** Saca al Pokémon de dentro de un mueble (por el lado más cercano). */
  function collideFurniture(p) {
    const r = Math.max(6, p.r * 0.5);
    for (const [x0, y0, x1, y1] of furniture()) {
      if (p.x < x0 - r || p.x > x1 + r || p.y < y0 - r || p.y > y1 + r) continue;
      const dl = p.x - (x0 - r), dr = (x1 + r) - p.x, du = p.y - (y0 - r), dd = (y1 + r) - p.y;
      const m = Math.min(dl, dr, du, dd);
      if (m === dl) p.x = x0 - r; else if (m === dr) p.x = x1 + r; else if (m === du) p.y = y0 - r; else p.y = y1 + r;
    }
  }
  const doorP = () => [room.cx, room.cy + (room.rh - 1) * room.ts];
  const chestP = i => [room.cx + (i - 1) * room.ts * 3, room.cy - (room.rh - 2) * room.ts];
  const springP = () => [room.cx, room.cy - 8];
  const roulP = () => [room.cx + (room.rw - 1.6) * room.ts, room.cy - room.ts * 0.6];
  /** Todos: se abre el cofre i de la sala del tesoro. */
  function openChest(i) {
    if (!room || room.chests[i]) return;
    room.chests[i] = 1;
    const [x, y] = chestP(i);
    G.FX.burst(x, y - 10, '#ffe14d', 30, 220);
    G.FX.ring(x, y, 6, 90, '#ffd23f', 0.5, 4);
    G.Audio.sfx('shiny');
  }
  const myKey = p => (p === G.Game.player ? (p.uid || 'me') : p.uid);

  /** Anfitrión: alguien toca la puerta del sitio `s` → entra todo el grupo. */
  function enterRoom(s, live) {
    const kind = s.type === 'shop' ? 'shop' : 'myst';
    const r = Math.random();
    const ev = kind === 'shop' ? null : r < 0.5 ? 'house' : r < 0.7 ? 'treasure' : r < 0.85 ? 'heal' : 'trap';
    const R = ROOMS[kind];
    const cfg = { kind, ev, siteId: s.id, tx: 9000 + Math.floor(Math.random() * 3000), ty: 9000 + Math.floor(Math.random() * 3000),
                  rw: R.rw, rh: R.rh, bx: Math.round(s.x), by: Math.round(s.y + 70) };
    if (kind === 'myst') remove(s);
    send(['dg', 'enter', cfg]);
    beginRoom(cfg);
    if (kind === 'myst') roomStart(live);
  }

  /** En cada ordenador: viaje al interior. */
  function beginRoom(cfg) {
    const pl = G.Game.player, ts = TSZ();
    room = Object.assign({}, cfg, { ts, cx: cfg.tx * ts + ts / 2, cy: cfg.ty * ts + ts / 2, biome: G.World.biome,
                                    t: 0, wave: 0, mobs: [], out: new Set(), locked: false, seen: null, wasAway: false,
                                    chests: [0, 0, 0], springFull: cfg.ev === 'heal', atRoul: false });
    if (authority()) G.EnemyMgr.stash(); else G.EnemyMgr.clearRemote();
    G.Projectiles.clear(); G.Combat.clearFields(); G.Hazards.clear(); G.Weather.clear();
    G.World.setArena({ tx: cfg.tx, ty: cfg.ty, room: true, rw: cfg.rw, rh: cfg.rh, r: Math.max(cfg.rw, cfg.rh), type: ROOMS[cfg.kind].theme });
    G.World.setBiome(G.Tiles.arenaBiome(ROOMS[cfg.kind].theme), true);
    const ps = G.Game.everyone();
    ps.forEach((p, i) => { p.x = room.cx + (i - (ps.length - 1) / 2) * 36; p.y = room.cy + (room.rh - 2.6) * ts; p.safe = false; });
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    shopSkip = null;
    G.Game.flash(cfg.kind === 'shop' ? '#9fe0b0' : '#c9a6ff', 0.6);
    G.Audio.sfx('select');
    G.Spawner.say(G.T(cfg.kind === 'shop' ? '¡Bienvenido! ¡Tienda de Kecleon!' : 'Has entrado en la sala misteriosa…'), 2.6, true);
  }

  /** Anfitrión: lo que pasa en la sala misteriosa al entrar. */
  function roomStart(live) {
    const ev = room.ev, cx = room.cx, cy = room.cy;
    if (ev === 'house') {
      lockDoor(true);
      houseStartFx();
      send(['dg', 'say', '¡Es una casa de monstruos! Aguanta 30 s', 3]);
      wave(14 + 4 * live.length);
    } else if (ev === 'treasure') {
      say('¡Sala del tesoro! Acércate a los cofres para abrirlos', 3.2);
      G.Audio.sfx('legend');
    } else if (ev === 'heal') {
      say('¡Sala de curación! Pisa el manantial para recuperar toda la vida', 3.2);
    } else if (ev === 'trap') {
      say('¡Cuidado! Algo cruje bajo tus pies…', 2);
      room.trapAt = 1.4;
    }
  }
  function lockDoor(on) { if (!room || room.locked === on) return; room.locked = on; send(['dg', 'rlock', on ? 1 : 0]); }

  /** Anfitrión: cada fotograma dentro del interior. */
  function roomTick(dt, live) {
    room.t += dt;
    if (room.kind === 'shop') {
      const s = byId(room.siteId);
      lockDoor(!!s && s.state === 'angry');
      if (s && s.state === 'angry') {
        // Kecleon furioso no sale de su tienda.
        const k = G.EnemyMgr.get(s.bossId);
        if (k && !k.dead) {
          const m = (room.rw - 1.2) * room.ts, n = (room.rh - 1.2) * room.ts;
          k.x = G.U.clamp(k.x, room.cx - m, room.cx + m); k.y = G.U.clamp(k.y, room.cy - n, room.cy + n);
        }
      }
    } else if (room.ev === 'house' && room.locked) {
      if (room.t >= 5 * room.wave && room.t < HOUSE_TIME - 5) wave(7 + 3 * live.length);
      const alive = room.mobs.filter(id => { const e = G.EnemyMgr.get(id); return e && !e.dead; }).length;
      // Sólo se acaba antes si ya no quedan oleadas por salir y los has vencido a todos.
      if (room.t >= HOUSE_TIME || (alive === 0 && room.t >= HOUSE_TIME - 5)) {
        lockDoor(false);
        say(alive === 0 ? '¡Casa de monstruos superada! Recoge el botín' : '¡Has aguantado! Recoge el botín', 3);
        award('mhouse');
        const t = T();
        G.Pickups.dropXp(room.cx, room.cy, Math.round(140 + t * 0.9), true);
        for (let i = 0; i < 8; i++) G.Pickups.drop('coin', room.cx + G.U.rand(-60, 60), room.cy + G.U.rand(-35, 35), 5);
        if (Math.random() < 0.6) G.Pickups.drop('item', room.cx + 30, room.cy - 10, G.Items.roll());
        for (const id of room.mobs) { const e = G.EnemyMgr.get(id); if (e && !e.dead) e.hurt(e.hp + 1, '#ffffff'); }
      }
    } else if (room.ev === 'treasure') {
      // Cofres (2026-10-15: antes eran decorado y el botín salía solo): se abren al acercarse.
      room.chests.forEach((o, i) => {
        if (o) return;
        const [x, y] = chestP(i);
        if (!live.some(p => G.U.dist2(p.x, p.y, x, y + 20) < 60 * 60)) return;
        send(['dg', 'chest', i]); openChest(i);
        const dx = () => x + G.U.rand(-40, 40), dy = () => y + G.U.rand(40, 80);
        if (i === 0) { for (let k = 0; k < 7; k++) G.Pickups.drop('coin', dx(), dy(), 5); for (const p of live) G.Pickups.drop('potion', dx(), dy(), G.Loot.ownerKey(p)); }
        else if (i === 1) { G.Pickups.drop('item', x, y + 60, G.Items.roll()); if (Math.random() < 0.3) G.Pickups.drop('ticket', x + 30, y + 60, 1); for (let k = 0; k < 3; k++) G.Pickups.drop('coin', dx(), dy(), 5); }
        else for (let k = 0; k < 9; k++) G.Pickups.drop('coin', dx(), dy(), 5);
      });
    } else if (room.ev === 'heal' && room.springFull) {
      // Manantial: cura a todo el grupo cuando alguien lo pisa (una vez, como los del mapa).
      const [x, y] = springP();
      if (live.some(p => G.U.dist2(p.x, p.y, x, y) < 50 * 50)) {
        room.springFull = false;
        if (!blessing) { const until = T() + BLESS_TIME; startBlessing('vital', until); send(['dg', 'bless', 'vital', until]); }
        roomFx('heal', room.cx, room.cy); send(['dg', 'room', 'heal', Math.round(room.cx), Math.round(room.cy)]);
        say('¡El manantial te devuelve toda la vida!', 3);
      }
    } else if (room.ev === 'trap' && room.trapAt != null && room.t >= room.trapAt) {
      room.trapAt = null;
      say('¡Era una trampa! Gas venenoso… pero ha dejado monedas', 3.2);
      for (let i = 0; i < 20; i++) G.Pickups.drop('coin', room.cx + G.U.rand(-110, 110), room.cy + G.U.rand(-60, 60), 5);
      roomFx('trap', room.cx, room.cy); send(['dg', 'room', 'trap', Math.round(room.cx), Math.round(room.cy)]);
    }
    // Salida: con la puerta abierta, cuando todos están en ella (o han pulsado «Salir»).
    if (!room.locked) {
      const [dx, dy] = doorP();
      const atDoor = p => G.U.dist2(p.x, p.y, dx, dy) < 44 * 44 || room.out.has(myKey(p));
      if (live.every(atDoor)) { send(['dg', 'exit']); endRoom(); return; }
      if (G.Coop.active && live.some(atDoor) && Math.floor(room.t / 4) !== Math.floor((room.t - dt) / 4)) say('Esperando a que todos lleguen a la puerta…', 2);
    }
  }
  /** Botón «Salir» del menú: cuentas como listo para salir (y vas hacia la puerta). */
  function requestExit() {
    if (!room) return;
    const pl = G.Game.player;
    if (authority()) room.out.add(myKey(pl)); else G.Coop.request(['dg', 'out']);
    const [dx, dy] = doorP();
    pl.x = dx; pl.y = dy - 8;
  }

  /** En cada ordenador: vuelta al mapa, delante de la puerta del sitio. */
  function endRoom() {
    if (!room) return;
    const pl = G.Game.player, r = room;
    if (authority()) G.Pickups.pullAll();                // lo que quedara en la sala, para alguien
    room = null;
    lastExit = T();
    closeShop(); shopSkip = null;
    if (authority()) G.EnemyMgr.restore(); else G.EnemyMgr.clearRemote();
    G.Projectiles.clear(); G.Combat.clearFields(); G.Hazards.clear();
    G.World.setArena(null);
    G.World.setBiome(r.biome, true);
    const ps = G.Game.everyone();
    ps.forEach((p, i) => { p.x = r.bx + (i - (ps.length - 1) / 2) * 36; p.y = r.by; });
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Game.flash('#ffffff', 0.5);
    if (pl.dead) pl.revive(0.3);
    farewell(pl, r.kind === 'shop' ? '¡Kecleon te despide! Tienes 3 s para escapar' : 'Sales de la sala: 3 s para escapar');
  }

  // ---------------- tienda de Kecleon ----------------

  /*
   * Lo que vende (precio base en monedas de la run; sube con el tiempo). Cada tienda pone
   * 4 al azar (2026-10-16: antes 3 de 5):
   *   potion   una poción al azar          upgrade  una mejora de las cartas (sobre todo movimientos)
   *   item     un objeto equipable         heal     te cura el 60 %
   *   rerolls  +3 cambios de cartas         disc     un disco de movimientos (1-4 mejoras)
   *   tm       MT: un movimiento nuevo (o una mejora si no caben más)
   *   protein  +10 % de daño para el resto de la run     hpup  +30 de vida máxima
   *   revive   Semilla Revivir: al caer, vuelves (una vez)   ticket  un ticket del gacha
   *   egg      un huevo Pokémon (si aún no tienes compañero)
   */
  const WARES = { potion: 15, upgrade: 35, item: 40, heal: 12, rerolls: 20, disc: 55, tm: 30, protein: 35, hpup: 25, revive: 45, ticket: 60, egg: 50 };
  function rollWares(t) {
    const k = 1 + t / 900;
    // El huevo sólo si a alguien del grupo le falta compañero.
    const needEgg = G.Game.everyone().some(p => !p.buddy && !p.egg && !(p.net && p.net.bd));
    const kinds = Object.keys(WARES).filter(w => w !== 'egg' || needEgg);
    return G.U.pickN(kinds, 4).map(kind => ({ kind, price: Math.round(WARES[kind] * k), item: kind === 'item' ? G.Items.roll() : null }));
  }

  function shopTick(s, live) {
    const t = T();
    if (s.state === 'open' || s.state === 'idle') {
      if (s.state === 'idle') { s.state = 'open'; send(pack(s)); }
      if (room && room.siteId === s.id) s.until = Math.max(s.until, t + 20);     // no cierra con vosotros dentro
      if (t >= s.until) { say('Kecleon ha cerrado la tienda y se ha ido', 2.6); remove(s); }
    } else if (s.state === 'angry') {
      const e = G.EnemyMgr.get(s.bossId);
      if (!e || e.dead) {
        s.until = t + 40;
        setState(s, 'free');
        award('kecleon');
        say('¡Has vencido a Kecleon! Lo que queda en la tienda es GRATIS', 3.5);
      }
    } else if (s.state === 'free' && t >= s.until) remove(s);
  }

  /** Anfitrión: alguien (`from`, o tú si es null) compra o roba el artículo i. */
  function tryBuy(s, i, from, steal) {
    if (!s || s.type !== 'shop' || !s.wares || !s.wares[i] || s.wares[i].sold) return;
    const host = G.Game.player, w = s.wares[i];
    const free = s.state === 'free';
    if (!free && s.state !== 'open' && s.state !== 'angry') return;
    if (s.state === 'angry' && !free) return;               // con Kecleon furioso no se vende nada
    if (!free && !steal) {
      if ((host.coins || 0) < w.price) { if (from) G.Coop.sendTo(from, ['dg', 'poor', w.price]); return; }
      host.coins -= w.price;
    }
    w.sold = true;
    send(pack(s));
    const buyer = from ? G.Game.everyone().find(p => p.uid === from) : host;
    if (w.kind === 'ticket') G.Pickups.drop('ticket', buyer ? buyer.x : s.x, buyer ? buyer.y - 10 : s.y, 1);   // el ticket es del grupo
    else if (from) G.Coop.sendTo(from, ['dg', 'got', w]);
    else applyWare(host, w);
    G.Audio.sfx(steal ? 'hurt' : 'coin');
    if (steal && !free) kecleonRage(s);
    else if (!free && s.wares.every(o => o.sold) && !(room && room.siteId === s.id)) { say('¡Gracias por tu compra! Kecleon se va contento', 2.6); remove(s); }
  }

  /** Kecleon se enfada: sale como jefe donde está la tienda. */
  function kecleonRage(s) {
    const t = T(), pl = G.Game.player;
    const slots = G.Enemies.BOSS_SLOTS || [];
    let slot = slots[0];
    for (const o of slots) if (o.at <= t) slot = o;
    // Fuerza de los jefes de ese momento, más un extra por el nivel del grupo.
    const lvl = Math.max(...G.Game.everyone().map(p => p.level || 1));
    // (2026-10-15: más duro; antes caía enseguida.)
    const def = G.Enemies.bossFor(352, slot, 2.5 * (1 + lvl * 0.03));
    def.behavior = 'charger';
    const e = G.Spawner.spawnBossNow(pl, t, def);
    if (e) {
      const floor = Math.round(G.Enemies.bossFloor(t) * 1.8 * G.Coop.scaleHp(G.Game.everyone().length));
      if (e.maxHp < floor) e.maxHp = floor;
      e.hp = e.maxHp; e.dmg *= 1.5; e.spd *= 1.25;
    }
    // Dentro de la tienda: sale de detrás del mostrador (y la puerta se cierra hasta vencerlo).
    if (e) { e.x = room ? room.cx : s.x; e.y = room ? counterY() + room.ts : s.y; e.name = 'Kecleon'; s.bossId = e.id; }
    setState(s, 'angry');
    say('¡LADRÓN! ¡Kecleon se ha enfadado!', 3.5);
  }

  /** Lo comprado (o robado) llega a quien lo ha cogido. */
  function applyWare(pl, w) {
    if (!pl || !w) return;
    G.FX.ring(pl.x, pl.y, 6, 70, '#7dffb0', 0.5, 3);
    switch (w.kind) {
      case 'potion': G.Loot.drink(pl, G.Loot.rollPotion()); break;
      case 'item': G.Game.offerItem(w.item); break;
      case 'heal': pl.heal(pl.maxHp * 0.6); G.Spawner.say(G.T('¡Te has curado!'), 2, true); break;
      case 'rerolls': pl.rerollBonus = (pl.rerollBonus || 0) + 3; G.Spawner.say(G.T('+3 cambios de cartas de nivel'), 2.4, true); break;
      case 'disc': G.Game.offerBox(); break;
      case 'tm': {
        const list = G.LevelUp.offer(pl, 12);
        const c = list.find(o => o.type === 'new') || list.find(o => o.type === 'up') || list[0];
        if (c) { c.apply(pl); G.Spawner.say(G.T('MT') + ': ' + G.T(c.title), 2.6, true); }
        break;
      }
      case 'protein': pl.atkMul *= 1.1; G.Spawner.say(G.T('+10% de daño (resto de la run)'), 2.4, true); break;
      case 'hpup': pl.addMaxHp(30); G.Spawner.say(G.T('+30 de vida máxima'), 2.4, true); break;
      case 'revive': pl.reviveSeed = true; G.Spawner.say(G.T('Llevas una Semilla Revivir: si caes, vuelves'), 2.8, true); break;
      case 'egg':
        if (pl.buddy || pl.egg) G.Spawner.say(G.T('Ya tienes compañero (o un huevo)'), 2.4, true);
        else G.Companion.gotEgg(pl);
        break;
      case 'upgrade': {
        const list = G.LevelUp.offer(pl, 6);
        const c = list.find(o => o.type !== 'stat') || list[0];
        if (c) { c.apply(pl); G.Spawner.say(G.T('Mejora') + ': ' + G.T(c.title), 2.6, true); }
        break;
      }
    }
  }

  // ---------------- estatua misteriosa ----------------

  /*
   * Bendiciones (sólo cosas buenas) y maldiciones (algo malo, pero con premio). Lo que
   * toca a los jugadores lo aplica cada uno a su Pokémon; lo de los enemigos, el anfitrión.
   */
  const BLESS = {
    might:   { good: true, name: 'Bendición de fuerza', desc: '+20% de daño', color: '#ff6b4d',
               on: p => { p.atkMul *= 1.2; }, off: p => { p.atkMul /= 1.2; } },
    wisdom:  { good: true, name: 'Bendición de sabiduría', desc: '+25% de experiencia', color: '#4fb4ff',
               on: p => { p.xpMul *= 1.25; }, off: p => { p.xpMul /= 1.25; } },
    swift:   { good: true, name: 'Bendición del viento', desc: '+15% de velocidad', color: '#7fe0ff',
               on: p => { p.spdMul *= 1.15; }, off: p => { p.spdMul /= 1.15; } },
    vital:   { good: true, name: 'Bendición de vida', desc: 'Regeneras 3 de vida por segundo', color: '#5fe08a',
               on: p => { p.regenFlat += 3; }, off: p => { p.regenFlat -= 3; } },
    frenzy:  { good: false, name: 'Maldición del frenesí', desc: 'Los enemigos van un 15% más rápido, pero experiencia ×1,5', color: '#c47bff',
               on: p => { p.xpMul *= 1.5; }, off: p => { p.xpMul /= 1.5; }, enemySpd: 1.15 },
    glass:   { good: false, name: 'Maldición de cristal', desc: 'Recibes un 20% más de daño, pero haces un 35% más', color: '#ff8ad8',
               on: p => { p.atkMul *= 1.35; p.curseTaken = 0.2; }, off: p => { p.atkMul /= 1.35; p.curseTaken = 0; } },
    greed:   { good: false, name: 'Maldición de la avaricia', desc: 'Los enemigos aguantan un 30% más, pero monedas ×2', color: '#ffd23f',
               on: () => {}, off: () => {}, enemyHp: 1.3, coins: 2 }
  };
  const BLESS_TIME = 180;

  function statueTick(s, live) {
    if (!live.some(p => G.U.dist2(p.x, p.y, s.x, s.y) < 46 * 46)) return;
    remove(s);
    const ids = Object.keys(BLESS);
    const id = Math.random() < 0.6 ? G.U.pick(ids.filter(k => BLESS[k].good)) : G.U.pick(ids.filter(k => !BLESS[k].good));
    const until = T() + BLESS_TIME;
    startBlessing(id, until);
    send(['dg', 'bless', id, until]);
    G.FX.ring(s.x, s.y, 10, 160, BLESS[id].color, 0.8, 5);
  }
  function startBlessing(id, until) {
    const pl = G.Game.player, def = BLESS[id];
    if (!def || !pl) return;
    if (blessing) BLESS[blessing.id].off(pl);
    blessing = { id, until };
    def.on(pl);
    G.Spawner.say(G.T(def.name) + ': ' + G.T(def.desc) + ' (3 min)', 4, true);
    G.Audio.sfx(def.good ? 'legend' : 'surge');
  }
  function endBlessing() {
    const pl = G.Game.player;
    if (blessing && pl) BLESS[blessing.id].off(pl);
    blessing = null;
  }
  /** Para spawner/enemigos/monedas (sólo cuenta en el anfitrión). */
  const mod = k => (blessing && BLESS[blessing.id][k]) || 1;

  // ---------------- dibujo ----------------

  let kecleonAnim = null;
  const sprite = (ctx, type, v, x, y, k = 2) => G.Pickups.sprite(ctx, type, v, x, y, k);
  const label = (ctx, txt, x, y, col, size = 12) => {
    ctx.font = `800 ${size}px Pixelify,"Segoe UI",system-ui,sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
  };

  function drawGround(ctx) {
    const now = performance.now() / 1000;
    if (room) { drawRoomGround(ctx, now); return; }
    for (const s of sites) {
      if (!G.Camera.sees(s.x, s.y, 320)) continue;
      ctx.save();
      if (s.type === 'mhouse' && s.state === 'idle') {
        // Trampilla de piedra con un "?" tallado (pixel art, tiles.js) y un halo morado: se baja por ella.
        ctx.globalAlpha = 0.25 + Math.sin(now * 3) * 0.12; ctx.fillStyle = '#c47bff';
        ctx.beginPath(); ctx.ellipse(s.x, s.y, 52, 32, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        sprite(ctx, 'mhouse', 0, s.x, s.y);
      }
      ctx.restore();
    }
  }

  /** Suelo del interior: alfombra, puerta de salida (y las trampas/el manantial de la sala). */
  function drawRoomGround(ctx, now) {
    const r = room, ts = r.ts, [dx, dy] = doorP();
    ctx.save();
    if (r.kind === 'shop') sprite(ctx, 'shopmat', 0, r.cx, r.cy + ts * 0.6);
    else if (r.ev === 'heal') {
      sprite(ctx, 'spring', r.springFull ? 0 : 1, r.cx, r.cy - 8);
      if (r.springFull) label(ctx, G.T('Pisa el manantial'), r.cx, r.cy - 34, '#7dffb0', 11);
    }
    else if (r.ev === 'trap' && r.trapAt != null) for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) sprite(ctx, 'trap', (i + j + 3) % 3, r.cx + i * ts * 1.6, r.cy + j * ts * 1.4);
    else if (r.ev === 'house') {
      // Runas de aviso en las esquinas mientras la puerta está cerrada.
      const lit = Math.floor(now * 6) % 4;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => sprite(ctx, 'hmark', r.locked && i === lit ? 1 : 0, r.cx + a * (r.rw - 1.5) * ts, r.cy + b * (r.rh - 1.5) * ts));
    }
    // Puerta de salida en la pared sur.
    sprite(ctx, 'door', r.locked ? 1 : 0, dx, dy + ts * 0.55);
    ctx.restore();
  }
  // Iconos: los de G.Icons; el disco, la poción y el huevo, con su pixel art del mapa (tiles.js).
  const WARE_ICON = { upgrade: 'up', heal: 'berry', rerolls: 'cards', tm: 'book', protein: 'fist', hpup: 'heart', revive: 'sprout', ticket: 'ticket' };
  const WARE_SPRITE = { potion: 'potion', disc: 'disc', egg: 'egg' };
  const WARE_NAME = { potion: 'Poción', upgrade: 'Mejora', item: 'Objeto', heal: 'Curación', rerolls: '+3 cambios', disc: 'Disco', tm: 'MT',
                      protein: 'Proteína', hpup: 'Más PS', revive: 'Semilla Revivir', ticket: 'Ticket', egg: 'Huevo' };
  function drawAir(ctx) {
    G.Funny.drawAir(ctx);
    const now = performance.now() / 1000;
    if (room) { drawRoomAir(ctx, now); return; }
    for (const s of sites) {
      if (!G.Camera.sees(s.x, s.y, 320)) continue;
      ctx.save();
      if (s.type === 'mhouse' && s.state === 'idle') {
        label(ctx, '?', s.x, s.y - 14 - Math.abs(Math.sin(now * 2.5)) * 8, '#e2c6ff', 34);
        label(ctx, G.T('SALA MISTERIOSA · entra'), s.x, s.y + 40, '#d9a6ff', 11);
      } else if (s.type === 'statue') {
        // Estatua de Unown en pixel art (tiles.js); el ojo va cambiando de color.
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 24, 8, 0, 0, 6.2832); ctx.fill();
        sprite(ctx, 'statue', Math.floor(now * 1.5) % 6, s.x, s.y - 34);
        if (Math.random() < 0.08) G.FX.twinkle(s.x + G.U.rand(-12, 12), s.y - 58 + G.U.rand(-10, 10));
        label(ctx, G.T('ESTATUA MISTERIOSA'), s.x, s.y - 80, '#e8eef8', 11);
      } else if (s.type === 'shop' && s.wares) {
        // La tienda en el mapa: un puesto con toldo; se entra por la puerta.
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 4, 46, 12, 0, 0, 6.2832); ctx.fill();
        sprite(ctx, 'shopdoor', 0, s.x, s.y - 36);
        const title = s.state === 'free' ? G.T('¡TODO GRATIS!') : s.state === 'angry' ? G.T('¡KECLEON FURIOSO!') : G.T('TIENDA DE KECLEON');
        label(ctx, title + (s.state === 'open' ? ' · ' + Math.max(0, Math.ceil(s.until - T())) + 's' : ''), s.x, s.y - 86, s.state === 'angry' ? '#ff5f6d' : '#9fe0b0');
        if (s.state === 'open' || s.state === 'free') label(ctx, G.T('Entra por la puerta: dentro no hay enemigos'), s.x, s.y + 24, '#7dffb0', 11);
      }
      ctx.restore();
    }
  }

  /** Lo alto del interior: estanterías, Kecleon tras el mostrador, carteles. */
  function drawRoomAir(ctx, now) {
    const r = room, ts = r.ts, pl = G.Game.player, [dx, dy] = doorP();
    ctx.save();
    if (r.kind === 'shop') {
      const s = byId(r.siteId);
      // Estanterías contra la pared norte.
      for (let i = -2; i <= 2; i++) if (i) sprite(ctx, 'shelf', (i + 3) % 3, r.cx + i * ts * 2.2, r.cy - (r.rh - 1.4) * ts);
      // La ruleta, a un lado (se juega desde el menú).
      sprite(ctx, 'roulette', Math.floor(now * 6) % 4, r.cx + (r.rw - 1.6) * ts, r.cy - ts * 0.6);
      label(ctx, G.T('Ruleta'), r.cx + (r.rw - 1.6) * ts, r.cy - ts * 1.9, '#ffd23f', 11);
      if (s && s.state === 'open') {
        if (!kecleonAnim) kecleonAnim = new G.Sprites.Animator(352, 1, false);
        kecleonAnim.loop('Idle'); kecleonAnim.update(1 / 60);
        G.Sprites.drawShadow(ctx, 352, r.cx, counterY() - 6);
        kecleonAnim.draw(ctx, r.cx, counterY() - 6, {});
        if (!openShop) G.Funny.bubble(ctx, r.cx, counterY() - 70, G.T('Acércate al mostrador para comprar'));
      } else if (s && s.state === 'angry') {
        const k = G.EnemyMgr.get(s.bossId);
        if (k && !k.dead) G.Funny.bubble(ctx, k.x, k.y - k.bodyH - 16, G.T('¡LADRÓN! ¡VUELVE AQUÍ!'), '#c8282a');
      }
      sprite(ctx, 'counter', 0, r.cx, counterY() + 14);
      label(ctx, G.T('TIENDA DE KECLEON'), r.cx, r.cy - (r.rh - 0.2) * ts, '#9fe0b0');
    } else {
      const names = { house: 'CASA DE MONSTRUOS', treasure: 'SALA DEL TESORO', heal: 'SALA DE CURACIÓN', trap: 'SALA TRAMPA' };
      let t = G.T(names[r.ev] || 'SALA MISTERIOSA');
      if (r.ev === 'house' && r.locked) t += ' · ' + Math.max(0, Math.ceil(HOUSE_TIME - r.t)) + 's';
      label(ctx, t, r.cx, r.cy - (r.rh - 0.2) * ts, r.ev === 'house' ? '#ff8a95' : '#d9a6ff');
      if (r.ev === 'treasure') for (let i = 0; i < 3; i++) {
        const [x, y] = chestP(i);
        sprite(ctx, 'bigchest', r.chests[i] ? 1 : 0, x, y);
        if (!r.chests[i]) label(ctx, G.T('¡Ábreme!'), x, y - 30, '#ffd23f', 11);
      }
    }
    label(ctx, G.T(r.locked ? 'Puerta cerrada' : 'Salida'), dx, dy - ts * 0.9, r.locked ? '#ff8a95' : '#7dffb0', 11);
    if (!r.locked && pl && G.U.dist2(pl.x, pl.y, dx, dy) < 44 * 44 && G.Coop.active) label(ctx, G.T('Esperando a los demás…'), dx, dy - ts * 1.5, '#ffffff', 11);
    ctx.restore();
  }

  /** HUD: la bendición o maldición activa (nombre y segundos). */
  function blessingInfo() {
    if (!blessing) return null;
    const d = BLESS[blessing.id];
    return { name: d.name, desc: d.desc, color: d.color, left: Math.max(0, blessing.until - T()) };
  }

  /** Al bajar de piso (floors.js): lo del mapa anterior desaparece (la bendición sigue). */
  function clearSites() { sites = []; buyT = 0; buyKey = ''; }

  const ROOM_NAME = { shop: 'Tienda de Kecleon', house: 'Casa de monstruos', treasure: 'Sala del tesoro', heal: 'Sala de curación', trap: 'Sala trampa' };
  return { reset, clearSites, tick, update, onNet, onClient, drawGround, drawAir, blessingInfo, mod,
           get sites() { return room ? [] : sites; }, BLESS,
           /** ¿Está el grupo dentro de un interior? (spawner, loot, etc. no sacan nada) */
           get inRoom() { return !!room; },
           get room() { return room; },    // pruebas
           get roomName() { return room ? ROOM_NAME[room.kind === 'shop' ? 'shop' : room.ev] || 'Sala misteriosa' : null; },
           get roomDoor() { if (!room) return null; const [x, y] = doorP(); return { x, y }; } };
})();
