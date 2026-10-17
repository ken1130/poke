/* ============ dungeon.js — sorpresas del mapa (2026-10-15) ============
 * Cosas que aparecen durante la run (las ve todo el grupo, salen en el minimapa):
 *
 *   mhouse  Casa de monstruos: un "?" en el suelo. Al entrar, salen muchos
 *           enemigos alrededor; aguanta 30 s (o acaba con todos) y suelta un
 *           buen botín en el centro.
 *   shop    Tienda de Kecleon: 5 artículos + 4 de mascotas (se pagan con las monedas de la
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
  const FAR = 3200;          // 100 m (32 px = 1 m): un sitio más lejos de todos se vuelve a poner cerca
  let farT = 1;
  let blessing = null;               // { id, until } (todo el grupo)
  let buyT = 0, buyKey = '';         // tú, encima de un artículo de la tienda
  let room = null, lastExit = -99;   // interior en el que está el grupo (ver beginRoom)

  // Reputación con Kecleon en esta run (2026-10-15: si no, lo mejor era siempre robar y matarle).
  //   buys    compras pagadas · desde 3, "cliente fiel": tiendas siguientes −20 % y un artículo especial
  //   robbed  le habéis vencido · las tiendas siguientes +50 % y el siguiente Kecleon es más duro
  //   stole   alguien robó · sin robos y con alguna compra, al acabar: regalo de Kecleon
  // La lleva el anfitrión y la manda con ['dg', 'rep', buys, robbed, stole].
  let kRep = { buys: 0, robbed: false, stole: false };
  const LOYAL = 3;
  const loyal = () => kRep.buys >= LOYAL && !kRep.robbed;
  function sendRep() { send(['dg', 'rep', kRep.buys, kRep.robbed ? 1 : 0, kRep.stole ? 1 : 0]); }

  function reset() {
    kRep = { buys: 0, robbed: false, stole: false };
    sites = []; nextId = 1; blessing = null; buyT = 0; buyKey = ''; room = null; lastExit = -99; shopSkip = null;
    houseT = 150; shopT = 240; statueT = 200;      // (2026-10-16: la primera tienda a los 4:00, antes 4:30)
    G.Funny.reset(); G.Encounters.reset(); timed = false;
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
    else if (k === 'fused') doFuse(G.Game.player, ev[2]);
    else if (k === 'bless') startBlessing(ev[2], ev[3]);
    else if (k === 'say') G.Spawner.say(G.T(ev[2]), ev[3] || 3, true);
    else if (k === 'ach') G.Progress.event(ev[2]);
    else if (k === 'fn') G.Funny.onNet(ev);
    else if (k === 'en') G.Encounters.onNet(ev);       // encuentros (encounters.js)
    else if (k === 'spun') G.Roulette.onSpun(ev[2], ev[3], ev[4]);
    else if (k === 'rspin') G.Roulette.watch(ev[2], ev[3], ev[4]);
    else if (k === 'room') { if (ev[2] === 'heal' && room) room.springFull = false; roomFx(ev[2], ev[3], ev[4]); }
    else if (k === 'chest') openChest(ev[2]);
    else if (k === 'enter') beginRoom(ev[2]);
    else if (k === 'exit') endRoom();
    else if (k === 'rlock') { if (room) room.locked = !!ev[2]; }
    else if (k === 'rep') kRep = { buys: ev[2] | 0, robbed: !!ev[3], stole: !!ev[4] };
    else if (k === 'poor') { fuseBusy = false; shopKey = ''; G.Spawner.say(G.I18n.f('¡No tienes bastantes monedas! (cuesta {x})', ev[2]), 2, true); }
  }
  /** Anfitrión: un invitado pide comprar (o se lleva sin pagar) el artículo `idx`. */
  function onClient(from, ev) {
    if (ev[1] === 'buy') tryBuy(byId(ev[2]), ev[3], from, !!ev[4]);
    else if (ev[1] === 'fuse') tryFuse(byId(ev[2]), from, ev[3] | 0);
    // Objeto vendido solo por un invitado (game.js offerItem): las monedas de la run son del anfitrión.
    else if (ev[1] === 'sell') G.Game.player.coins = (G.Game.player.coins || 0) + G.U.clamp(ev[2] | 0, 0, 30);
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

  /**
   * ¿Está tocando la caseta de la tienda? (2026-10-16: sólo contaba la puerta, y llegando por un
   * lado o por detrás se atravesaba la caseta antes de entrar.) Caseta: 88×80 dibujada en s.y - 36.
   */
  const onShopHut = (p, s) => Math.abs(p.x - s.x) < 44 + p.r * 0.5 && p.y > s.y - 70 && p.y < s.y + 12;

  // ---------------- cada fotograma ----------------

  /** Anfitrión o solitario: programa lo que sale y lo que pasa. */
  function tick(dt, players) {
    G.Funny.tick(dt, players);
    G.Encounters.tick(dt, players);
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
        if (open && live.some(p => G.U.dist2(p.x, p.y, s.x, s.y + 6) < 40 * 40 || (s.type === 'shop' && onShopHut(p, s)))) { enterRoom(s, live); return; }
      }
    }
    // Sitios a más de 100 m de todos (2026-10-16: te alejabas y en el minimapa salían a miles
    // de metros): se vuelven a poner cerca de alguien, como al aparecer.
    farT -= dt;
    if (farT <= 0) {
      farT = 1;
      for (const s of sites) {
        if (!live.every(p => G.U.dist2(p.x, p.y, s.x, s.y) > FAR * FAR)) continue;
        const at = freeSpot(G.U.pick(live), 420, 820, s.type === 'mhouse' ? 120 : 70);
        if (at) { s.x = at[0]; s.y = at[1]; send(pack(s)); }
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
    G.Encounters.update(dt, pl);
    if (room && pl && !pl.dead) collideFurniture(pl);
    if (room && G.Coop.isHost !== false) for (const e of G.EnemyMgr.all()) if (!e.dead && !e.remote) collideFurniture(e);
    if (!pl || pl.dead || !room || room.kind !== 'shop') { closeShop(); return; }
    // Dentro de la tienda: el menú se abre solo (y otra vez si vuelves al mostrador).
    const shop = byId(room.siteId);
    if (!shop || (shop.state !== 'open' && shop.state !== 'free')) { closeShop(); return; }
    // Eligiendo algo (cartas, objeto, disco...): la tienda se cierra y vuelve a abrirse después.
    // (2026-10-15: se ponía encima y, al comprar otra cosa, la elección se perdía y la partida
    // se quedaba parada para siempre: el "cuelgue" de la mazmorra.)
    if (choosing()) { if (openShop) { closeShop(); shopKey = ''; } return; }
    // Ruleta (2026-10-15): al acercarte a ella se abre sola (también desde el menú).
    const [rx, ry] = roulP(), nearR = G.U.dist2(pl.x, pl.y, rx, ry + 12) < 70 * 70;
    if (nearR && !room.atRoul && !G.Roulette.busy) {      // (con una elección abierta ya se ha salido arriba)
      if ((shop.spins == null ? 3 : shop.spins) > 0) openRoulette(shop);
      else G.Spawner.say(G.T('Ya no quedan tiradas en esta ruleta'), 2, true);
    }
    room.atRoul = nearR;
    if (G.Roulette.busy) return;
    if (shop.state !== room.seen) { room.seen = shop.state; shopSkip = null; }   // Kecleon vencido: otra vez el menú
    const [ptx, pty] = petP(), nearP = G.U.dist2(pl.x, pl.y, ptx, pty + 12) < 80 * 80;
    if (nearP && !room.atPet) { shopTab = 'pet'; shopKey = ''; if (openShop) refreshShop(); else { showShop(shop, 'pet'); } }
    room.atPet = nearP;
    if (nearP && openShop) { refreshShop(); return; }
    const atCounter = G.U.dist2(pl.x, pl.y, room.cx, counterY()) < 110 * 110;
    // Volver al mostrador: otra vez la pestaña de artículos normales (2026-10-16: se quedaba en
    // la de mascotas; ir a la estantería de mascotas sí cambiaba).
    if (atCounter && !room.atCnt && openShop && shopTab !== 'gen') { shopTab = 'gen'; shopKey = ''; }
    room.atCnt = atCounter;
    if (!atCounter) room.wasAway = true;
    if (shopSkip === shop.id && atCounter && !openShop && room.wasAway) shopSkip = null;
    if (!openShop) { if (shopSkip !== shop.id) { room.wasAway = false; showShop(shop); } }
    else refreshShop();
  }

  // ---------------- menú de la tienda ----------------
  let openShop = null, shopKey = '', shopSkip = null, shopTab = 'gen';
  /** ¿Hay una elección abierta? (mientras, nada de tienda ni ruleta) */
  const CHOICE_SCR = ['scr-levelup', 'scr-item', 'scr-bond', 'scr-sbox', 'scr-relic', 'scr-boon', 'scr-pkpick', 'scr-fclear', 'scr-rest'];
  const choosing = () => CHOICE_SCR.some(id => document.getElementById(id) && G.UI.isOpen(id));
  const WARE_DESC = { potion: 'Una poción al azar.', upgrade: 'Una mejora de las cartas de nivel (sobre todo movimientos).', heal: 'Recuperas el 60 % de la vida.',
                      rerolls: '+3 cambios de cartas de nivel.', disc: 'Un disco de movimientos: de 1 a 4 mejoras.', tm: 'Aprendes un movimiento nuevo (o una mejora si no caben más).',
                      protein: '+10 % de daño el resto de la run.', hpup: '+30 de vida máxima.', revive: 'Si caes, vuelves con la mitad de la vida (una vez).',
                      ticket: 'Un ticket del gacha (para el grupo).', ticket10: 'Un ticket ×10 del gacha (para el grupo).', egg: 'Un huevo Pokémon (si aún no tienes compañero).',
                      carbos: '+8 % de velocidad el resto de la run.', iron: '+5 % de reducción de daño el resto de la run.', ppup: '-6 % de recarga el resto de la run.',
                      magnet: '+30 % de alcance para recoger cosas el resto de la run.', incense: '+15 % de Pokémonedas al acabar la run.',
                      pcandy: 'Tu compañero sube 3 niveles (si aún es un huevo, saldrá con ellos).', pstone: 'Tu compañero sube hasta su próxima evolución (+5 niveles si ya no evoluciona).' };
  // (2026-10-16: toDataURL de cada icono cada vez que se rehacía la lista; ahora una vez por bioma y dibujo.)
  const wareUrl = new Map();
  function wareIcon(w) {
    if (WARE_SPRITE[w.kind]) {
      const k = G.World.biome + ':' + WARE_SPRITE[w.kind];
      let url = wareUrl.get(k);
      if (!url) { url = G.Tiles.propSprite(G.World.biome, WARE_SPRITE[w.kind], 0).toDataURL(); wareUrl.set(k, url); }
      return `<img src="${url}" style="width:36px;height:36px;image-rendering:pixelated">`;
    }
    return G.Icons.html(w.kind === 'item' ? w.item : w.kind === 'pgear' ? G.Companion.GEAR[w.gear].icon : WARE_ICON[w.kind], 36);
  }
  function showShop(s, tab = 'gen') {
    openShop = s; shopKey = ''; shopTab = tab;
    const el = document.getElementById('shop-leave');
    el.onclick = () => { shopSkip = s.id; closeShop(); requestExit(); };
    document.getElementById('shop-roul').onclick = () => { if (!choosing() && (s.spins == null ? 3 : s.spins) > 0) openRoulette(s); };
    // Móvil (rwd-run.css): la hoja de la tienda se recoge con ▾ para ver la sala; al abrir, desplegada.
    const sbox = document.querySelector('#scr-shop > .box');
    if (sbox) { sbox.classList.remove('min'); document.getElementById('shop-min').onclick = () => sbox.classList.toggle('min'); }
    refreshShop();
    document.getElementById('scr-shop').classList.remove('hidden');    // (sin G.UI.show: no cierra otras ventanas)
    G.Audio.sfx('select');
  }
  function openRoulette(s) {
    G.UI.hide('scr-shop');
    G.Roulette.open(s, () => { if (openShop === s) { shopKey = ''; document.getElementById('scr-shop').classList.remove('hidden'); refreshShop(); } });
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
    const key = s.state + ':' + coins + ':' + left + ':' + shopTab + ':' + (pl.petGear || []).length + ':' + (pl.buddy ? pl.buddy.lvl + '' + pl.buddy.dex : pl.egg ? 'e' : '') + ':' + s.wares.map(w => w.sold ? 1 : 0).join('') + ':' + pl.items.join(',') + ':' + (fuseBusy ? 1 : 0);
    if (key === shopKey) return;
    shopKey = key;
    document.getElementById('shop-sub').textContent = free ? G.T('¡Has vencido a Kecleon! Todo es GRATIS') : G.I18n.f('Monedas de esta run: {x}', coins)
      + (kRep.robbed ? ' · ' + G.T('Kecleon te guarda rencor: +50 %') : loyal() ? ' · ' + G.T('Cliente fiel: −20 %') : kRep.buys ? ' · ' + G.I18n.f('Compras: {x}/{x} para ser cliente fiel', kRep.buys, LOYAL) : '');
    // Pestañas (2026-10-16): lo normal y la sección de mascotas.
    const tabs = document.getElementById('shop-tabs');
    const inSec = sec => s.wares.filter(w => (w.sec || 'gen') === sec);
    const left2 = sec => inSec(sec).filter(w => !w.sold).length;
    const fz = fuseCheck(pl);
    tabs.innerHTML = [['gen', 'Artículos'], ['pet', 'Mascotas'], ['fuse', 'Fusión']].map(([k, label]) =>
      `<button class="shop-tab${shopTab === k ? ' on' : ''}" data-tab="${k}">${G.T(label)} <small>${k === 'fuse' ? (fz.ok ? '!' : '–') : left2(k)}</small></button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { shopTab = b.dataset.tab; shopKey = ''; G.Audio.sfx('select'); refreshShop(); }; });
    const box = document.getElementById('shop-list');
    box.innerHTML = '';
    if (shopTab === 'pet') {
      // Quién es tu compañero y lo que ya lleva puesto.
      const b = pl.buddy, mon = b && G.DEX_BY[b.dex];
      const gearIc = (pl.petGear || []).map(g => `<span title="${G.T(G.Companion.GEAR[g].name)}">${G.Icons.html(G.Companion.GEAR[g].icon, 24)}</span>`).join('');
      const head = document.createElement('div');
      head.className = 'shop-pet';
      head.innerHTML = `<div class="txt"><b>${mon ? G.I18n.f('Tu compañero: {x}', G.T(mon.name)) + ' · Lv.' + (b.lvl || 1)
          : pl.egg ? G.T('Tu compañero aún es un huevo') : G.T('Aún no tienes compañero')}</b>` +
        `<small>${mon ? G.T('El equipo es para toda la run y sólo se vende aquí.') : G.T('Lo que compres se lo pondrá en cuanto salga del huevo.')}</small>` +
        // Habilidad del compañero (companion.js, Nv. 15) y su imán (Nv. 25).
        (() => { const k = G.Companion.skillInfo && G.Companion.skillInfo(pl); if (!k) return '';
          return `<small class="pet-skill">${G.Icons.html(k.icon, 12)} ${G.T(k.name)}: ${k.unlocked ? G.T(k.desc) : G.I18n.f('se desbloquea en Nv. {x}', k.unlockLv)}` +
            (k.magnet ? ' · ' + G.T(k.magnetDesc) : '') + '</small>'; })() + `</div>` +
        `<div class="gear">${gearIc || `<small>${G.T('Sin equipo')}</small>`}</div>`;
      box.appendChild(head);
    }
    if (shopTab === 'fuse') box.appendChild(fuseCard(s, pl, fz, free, coins));
    s.wares.forEach((w, i) => {
      if ((w.sec || 'gen') !== shopTab) return;
      const row = document.createElement('div');
      const gi = w.kind === 'pgear' ? G.Companion.GEAR[w.gear] : null;
      const tier = w.kind === 'item' && G.Items.BY[w.item] ? G.Items.tier(w.item) : gi ? gi.tier : 0;
      // Ya no te sirve (lo llevas puesto, o ya tienes compañero): no se puede comprar.
      const useless = w.kind === 'pgear' ? G.Companion.gear(pl, w.gear) : w.kind === 'egg' ? !!(pl.buddy || pl.egg) : false;
      row.className = 'shop-card' + (tier ? ' t' + tier : '') + (w.feat ? ' feat' : '') + (w.sold ? ' sold' : '');
      const name = w.kind === 'item' && G.Items.BY[w.item] ? G.Items.BY[w.item].name : gi ? gi.name : WARE_NAME[w.kind];
      const desc = w.kind === 'item' && G.Items.BY[w.item] ? G.Items.BY[w.item].desc : gi ? gi.desc : WARE_DESC[w.kind];
      const can = (free || coins >= w.price) && !useless;
      const chips = (w.feat ? `<span class="tag-chip feat-chip">★ ${G.T('Especial')}</span>` : '') +
        (tier ? `<span class="tier-chip t${tier}">${G.T(G.Items.TIER_NAME[tier])}</span>` : '') +
        (gi ? `<span class="tag-chip pet-chip">${G.T('Equipo de mascota')}</span>` : '');
      row.innerHTML = `<div class="ico">${wareIcon(w)}</div>` +
        `<div class="txt"><div class="chips">${chips}</div><b>${G.T(name)}</b><small>${G.T(desc || '')}</small></div>` +
        (w.sold ? `<span class="stamp">${G.T('Vendido')}</span>` :
          `<div class="act"><span class="price ${can || useless ? '' : 'poor'}">${free ? G.T('Gratis') : G.Icons.html('coin', 14) + ' ' + w.price}</span>` +
          `<div class="row" style="gap:4px">` + (useless ? `<span class="owned">${G.T(w.kind === 'egg' ? 'Ya tienes' : 'Equipado')}</span>`
            : `<button class="btn small gold" data-buy="${i}" ${can ? '' : 'disabled'}>${G.T('Comprar')}</button>` +
              (free ? '' : `<button class="btn small steal" data-steal="${i}" title="${G.T('Kecleon se enfadará')}">${G.T('Robar')}</button>`)) + '</div></div>');
      box.appendChild(row);
    });
    box.querySelectorAll('[data-buy]').forEach(b => { b.onclick = () => { if (choosing()) return; G.Audio.sfx('coin'); request(s, +b.dataset.buy, false); }; });
    box.querySelectorAll('[data-steal]').forEach(b => { b.onclick = async () => {
      if (choosing()) return;
      if (!(await G.Dialog.confirm('¿Robarlo? Kecleon se enfadará y te perseguirá (si lo vences, todo será gratis).', { ok: 'Robar', danger: true }))) return;
      if (openShop !== s) return;
      request(s, +b.dataset.steal, true); closeShop(); shopSkip = s.id;
    }; });
    const rb = document.getElementById('shop-roul');
    rb.textContent = G.T('Ruleta de Kecleon') + ' (' + left + ')';
    rb.disabled = left <= 0;
  }
  /*
   * ---- Fusión (2026-10-16) ----
   * Dos objetos normales del MISMO rango que llevas puestos → uno al azar del rango siguiente:
   * Común + Común → Raro · Raro + Raro → Épico. Épico + Épico no se funde y un artefacto nunca
   * sale ni sirve de material (sólo los cofres con candado los dan). Se paga con las monedas de
   * la run, que en grupo son del anfitrión (como al comprar): el invitado pide ['dg','fuse'] y
   * sólo si el anfitrión cobra le contesta ['dg','fused'] y la fusión se hace en SU ordenador
   * (los objetos son de cada uno, como lo comprado en applyWare).
   */
  const FUSE_BASE = { 1: 45, 2: 90 };
  let fuseBusy = false;                 // invitado: esperando la respuesta del anfitrión
  /** Precios ×2 y +35 % por cada jugador más (rollWares, fusePrice). */
  const priceK = () => 2 * (1 + 0.35 * Math.max(0, G.Game.everyone().length - 1));
  function fusePrice(tier) {
    const k = 1 + T() / 900, mul = (kRep.robbed ? 1.5 : 1) * (loyal() ? 0.8 : 1) * priceK();
    return Math.round(FUSE_BASE[tier] * k * mul);
  }
  /** ¿Se pueden fundir los dos que llevas? → { ok, tier, reason } */
  function fuseCheck(pl) {
    const it = pl.items;
    if (it.length < 2) return { ok: false, reason: 'Necesitas llevar dos objetos del mismo rango.' };
    if (it.some(G.Items.isArt)) return { ok: false, reason: 'Los artefactos no se pueden fundir.' };
    const a = G.Items.tier(it[0]), b = G.Items.tier(it[1]);
    if (a !== b) return { ok: false, reason: 'Necesitas llevar dos objetos del mismo rango.' };
    if (a >= 3) return { ok: false, tier: a, reason: 'Dos épicos ya no se pueden fundir.' };
    return { ok: true, tier: a };
  }
  function fuseCard(s, pl, fz, free, coins) {
    const el = document.createElement('div');
    el.className = 'shop-fuse';
    const mat = id => id
      ? `<div class="mat t${G.Items.tier(id)}">${G.Icons.html(id, 36)}<span class="tier-chip t${G.Items.tier(id)}">${G.T(G.Items.TIER_NAME[G.Items.tier(id)])}</span><small>${G.T(G.Items.BY[id].name)}</small></div>`
      : `<div class="mat empty">${G.Icons.html('fuse_q', 36)}<small>${G.T('Hueco vacío')}</small></div>`;
    const to = fz.ok ? fz.tier + 1 : 0, price = fz.ok ? fusePrice(fz.tier) : 0;
    const can = fz.ok && !fuseBusy && (free || coins >= price);
    el.innerHTML = `<div class="fuse-row">${mat(pl.items[0])}<span class="plus">+</span>${mat(pl.items[1])}` +
      `<span class="arrow">${G.Icons.html('fuse_arrow', 24)}</span>` +
      `<div class="mat res${to ? ' t' + to : ''}">${G.Icons.html('fuse_q', 36)}` +
      (to ? `<span class="tier-chip t${to}">${G.T(G.Items.TIER_NAME[to])}</span><small>${G.I18n.f('Un objeto {x} al azar', G.T(G.Items.TIER_NAME[to]))}</small>` : `<small>?</small>`) + `</div></div>` +
      `<p class="fuse-note">${fz.ok ? G.T('Los dos objetos desaparecen y recibes uno nuevo de rango superior (nunca un artefacto).') : G.T(fz.reason)}</p>` +
      `<div class="fuse-act">` + (fz.ok ? `<span class="price ${can || free ? '' : 'poor'}">${free ? G.T('Gratis') : G.Icons.html('coin', 14) + ' ' + price}</span>` : '') +
      `<button class="btn gold" id="shop-fuse" ${can ? '' : 'disabled'}>${G.T(fuseBusy ? 'Fundiendo…' : 'Fundir')}</button></div>` +
      `<small class="fuse-help">${G.T('Común + Común → Raro · Raro + Raro → Épico')}</small>`;
    el.querySelector('#shop-fuse').onclick = () => { if (!choosing()) requestFuse(s, fz.tier); };
    return el;
  }
  function requestFuse(s, tier) {
    const pl = G.Game.player, fz = fuseCheck(pl);
    if (!fz.ok || fz.tier !== tier || fuseBusy) return;
    if (authority()) tryFuse(s, null, tier);
    else { fuseBusy = true; shopKey = ''; G.Coop.request(['dg', 'fuse', s.id, tier]); setTimeout(() => { fuseBusy = false; shopKey = ''; }, 4000); }
  }
  /** Anfitrión: cobra la fusión (de `from`, o la suya si es null). */
  function tryFuse(s, from, tier) {
    if (!s || s.type !== 'shop' || !FUSE_BASE[tier]) return;
    if (s.state !== 'open' && s.state !== 'free') return;
    const host = G.Game.player, price = fusePrice(tier);
    if (s.state !== 'free') {
      if ((host.coins || 0) < price) { if (from) G.Coop.sendTo(from, ['dg', 'poor', price]); else G.Spawner.say(G.I18n.f('¡No tienes bastantes monedas! (cuesta {x})', price), 2, true); return; }
      host.coins -= price;
    }
    G.Audio.sfx('coin');
    if (from) G.Coop.sendTo(from, ['dg', 'fused', tier]);
    else doFuse(host, tier);
  }
  /** En el ordenador del dueño de los objetos: los dos se van y llega uno del rango siguiente. */
  function doFuse(pl, tier) {
    fuseBusy = false; shopKey = '';
    const fz = fuseCheck(pl);
    if (!fz.ok || fz.tier !== tier) return;
    const old = pl.items.slice();
    for (const id of old) G.Items.BY[id].off(pl);
    pl.items = [];
    const pool = G.Items.LIST.filter(i => i.tier === tier + 1 && !old.includes(i.id));
    const id = G.U.pick(pool).id;
    pl.equip(id);
    const col = G.Items.TIER_COLOR[tier + 1];
    G.FX.ring(pl.x, pl.y, 6, 110, col, 0.7, 5);
    G.FX.ring(pl.x, pl.y, 40, 6, '#ffffff', 0.45, 3);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, col, 34, 230);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffffff', 14, 140);
    G.Audio.sfx(tier + 1 >= 3 ? 'legend' : 'shiny');
    G.Spawner.say(G.I18n.f('¡Fusión! {x} + {x} → {x}', G.T(G.Items.BY[old[0]].name), G.T(G.Items.BY[old[1]].name), G.T(G.Items.BY[id].name)), 3, true);
    G.Progress.event('item', { id });
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
      // Más duros que los de ese momento (2026-10-15: antes caían de un golpe; luego se
      // pasó: ahora +60 s de dureza, ×1,5 de vida, ×1,1 de daño y uno de cada 8, élite).
      const e = G.Spawner.spawnAt(x, y, t + 60);
      if (e) {
        e.maxHp = e.hp = Math.round(e.maxHp * 1.5); e.dmg *= 1.1;
        if (i % 8 === 0 && e.behavior !== 'thief') e.makeElite(G.U.pick(Object.keys(G.Enemy.ELITE)));
        room.mobs.push(e.id); G.FX.burst(x, y - 10, '#c47bff', 6, 90); }
    }
  }
  function houseStartFx() {
    G.Spawner.say(G.T('¡Es una casa de monstruos! Aguanta 30 s'), 3, true);
    G.Audio.sfx('boss');
    G.Camera.kick(0.8);
  }

  // ---------------- interiores ----------------

  // (2026-10-16: la tienda, más grande — con 3 jugadores se quedaba pequeña: 7×5 → 10×7)
  const ROOMS = { shop: { rw: 10, rh: 7, theme: 'fighting' }, myst: { rw: 9, rh: 7, theme: 'ghost' } };
  const TSZ = () => G.Tiles.T * G.Sprites.PX;
  const counterY = () => room.cy - (room.rh - 2.6) * room.ts;
  /** Muebles de la tienda que no se atraviesan: [x0, y0, x1, y1] (mostrador, estanterías, ruleta). */
  function furniture() {
    if (!room || room.kind !== 'shop') return [];
    const ts = room.ts, cy = counterY() + 14, out = [[room.cx - 70, cy - 16, room.cx + 70, cy + 16]];
    for (let i = -3; i <= 3; i++) if (i) { const x = room.cx + i * ts * 2.2, y = room.cy - (room.rh - 1.4) * ts; out.push([x - 30, y - 30, x + 30, y + 30]); }
    const [rx, ry] = roulP();
    out.push([rx - 20, ry - 6, rx + 20, ry + 30]);
    const [px, py] = petP();
    out.push([px - 30, py - 30, px + 30, py + 30]);
    return out;
  }
  /**
   * Los muebles son sólidos. Se mira el camino desde la última posición buena: si cruza un
   * mueble, te quedas en el lado por el que llegabas (2026-10-16: antes se te sacaba por el
   * lado más cercano y, corriendo o con un acelerón, se atravesaba el mostrador).
   */
  function collideFurniture(p) {
    const r = Math.max(8, p.r * 0.8);
    const px = p._fx != null && G.U.dist2(p._fx, p._fy, p.x, p.y) < 400 * 400 ? p._fx : p.x;
    const py = p._fx != null && G.U.dist2(p._fx, p._fy, p.x, p.y) < 400 * 400 ? p._fy : p.y;
    for (const [bx0, by0, bx1, by1] of furniture()) {
      const x0 = bx0 - r, y0 = by0 - r, x1 = bx1 + r, y1 = by1 + r;
      const inside = (x, y) => x > x0 && x < x1 && y > y0 && y < y1;
      if (!inside(p.x, p.y) && !segBox(px, py, p.x, p.y, x0, y0, x1, y1)) continue;
      if (inside(px, py)) {
        // Ya estaba dentro (al entrar en la sala, un empujón...): fuera por el lado más cercano.
        const dl = p.x - x0, dr = x1 - p.x, du = p.y - y0, dd = y1 - p.y, m = Math.min(dl, dr, du, dd);
        if (m === dl) p.x = x0; else if (m === dr) p.x = x1; else if (m === du) p.y = y0; else p.y = y1;
        continue;
      }
      // Venía de fuera: se queda pegado a la cara por la que llegaba (y puede deslizarse por ella).
      if (px <= x0) p.x = x0; else if (px >= x1) p.x = x1;
      else if (py <= y0) p.y = y0; else p.y = y1;
    }
    p._fx = p.x; p._fy = p.y;
  }
  /** ¿El segmento (ax, ay)-(bx, by) pasa por dentro de la caja? */
  function segBox(ax, ay, bx, by, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    for (const [pp, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (pp === 0) { if (q < 0) return false; continue; }
      const t = q / pp;
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 < t1;
  }
  const doorP = () => [room.cx, room.cy + (room.rh - 1) * room.ts];
  const chestP = i => [room.cx + (i - 1) * room.ts * 3, room.cy - (room.rh - 2) * room.ts];
  const springP = () => [room.cx, room.cy - 8];
  const roulP = () => [room.cx + (room.rw - 1.6) * room.ts, room.cy - room.ts * 0.6];
  /** Rincón de mascotas (2026-10-16): enfrente de la ruleta; al acercarte se abre la tienda en «Mascotas». */
  const petP = () => [room.cx - (room.rw - 1.6) * room.ts, room.cy - room.ts * 0.6];
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
    if (room || G.Rift.inArena) return;          // nunca una sala dentro de otra o de la arena (ver rift.js start)
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
    G.Spawner.say(G.T(cfg.kind !== 'shop' ? 'Has entrado en la sala misteriosa…'
      : kRep.robbed ? '¡OTRA VEZ TÚ! Kecleon no olvida: todo un 50 % más caro'
      : loyal() ? '¡Bienvenido de nuevo, cliente fiel! −20 % y un artículo especial'
      : '¡Bienvenido! ¡Tienda de Kecleon!'), 3, true);
  }

  /** Anfitrión: lo que pasa en la sala misteriosa al entrar. */
  function roomStart(live) {
    const ev = room.ev, cx = room.cx, cy = room.cy;
    if (ev === 'house') {
      lockDoor(true);
      houseStartFx();
      send(['dg', 'say', '¡Es una casa de monstruos! Aguanta 30 s', 3]);
      wave(12 + 3 * live.length);
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
      if (room.t >= 6 * room.wave && room.t < HOUSE_TIME - 5) wave(6 + 2 * live.length);
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
   * 5 al azar (2026-10-16: antes 4; el huevo pasa a «Mascotas»; más abajo, carbos…incense):
   *   potion   una poción al azar          upgrade  una mejora de las cartas (sobre todo movimientos)
   *   item     un objeto equipable         heal     te cura el 60 %
   *   rerolls  +3 cambios de cartas         disc     un disco de movimientos (1-4 mejoras)
   *   tm       MT: un movimiento nuevo (o una mejora si no caben más)
   *   protein  +10 % de daño para el resto de la run     hpup  +30 de vida máxima
   *   revive   Semilla Revivir: al caer, vuelves (una vez)   ticket  un ticket del gacha
   *   egg      un huevo Pokémon (si aún no tienes compañero)
   */
  const WARES = { potion: 15, upgrade: 35, item: 40, heal: 12, rerolls: 20, disc: 55, tm: 30, protein: 35, hpup: 25, revive: 45, ticket: 60,
                  // 2026-10-16: más género
                  carbos: 30, iron: 35, ppup: 35, magnet: 20, incense: 30 };
  /*
   * Sección «Mascotas» (2026-10-16): equipo del compañero (companion.js GEAR), caramelos,
   * piedra evolutiva y el huevo (si a alguien le falta compañero). Cada tienda: 5 cosas
   * normales y 4 de mascotas, al azar.
   */
  const PET_WARES = { pcandy: 35, pstone: 60, egg: 50 };
  const N_GEN = 5, N_PET = 4;
  function rollWares(t) {
    const k = 1 + t / 900;
    // ×2 (2026-10-16: a los 4 min ya se llevaban 800 monedas y todo salía regalado) y, en grupo,
    // +35 % por cada jugador más (las monedas son de todos y se juntan antes).
    const PRICE_K = priceK();
    const mul = (kRep.robbed ? 1.5 : 1) * (loyal() ? 0.8 : 1) * PRICE_K;
    const price = b => Math.round(b * k * mul);
    const gen = G.U.pickN(Object.keys(WARES), N_GEN).map(kind => ({ kind, sec: 'gen', price: price(WARES[kind]), item: kind === 'item' ? G.Items.roll() : null }));
    // Cliente fiel: uno de los cinco pasa a ser un artículo especial (un objeto o un ticket ×10), a buen precio.
    if (loyal()) gen[N_GEN - 1] = Math.random() < 0.7 ? { kind: 'item', sec: 'gen', price: Math.round(WARES.item * k * 0.9 * PRICE_K), item: G.Items.roll(), feat: true }
                                                     : { kind: 'ticket10', sec: 'gen', price: Math.round(150 * k * 0.8 * PRICE_K), item: null, feat: true };
    const petPool = Object.keys(G.Companion.GEAR).map(g => ({ kind: 'pgear', gear: g }))
      .concat(Object.keys(PET_WARES).filter(w => w !== 'egg').map(kind => ({ kind })));
    const pet = G.U.pickN(petPool, N_PET).map(o => ({ kind: o.kind, sec: 'pet', gear: o.gear || null, item: null,
      price: price(o.kind === 'pgear' ? G.Companion.GEAR[o.gear].price : PET_WARES[o.kind]) }));
    // Huevos (2026-10-16): siempre en Mascotas, uno por jugador; cada uno sólo puede comprar uno (tryBuy).
    const eggs = G.Game.everyone().map(() => ({ kind: 'egg', sec: 'pet', gear: null, item: null, price: price(PET_WARES.egg) }));
    return gen.concat(pet, eggs);
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
        kRep.robbed = true; sendRep();
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
    // Huevos: uno por persona y tienda, y nada si ya tienes compañero o huevo.
    const who = from || 'host';
    if (w.kind === 'egg') {
      const b = from ? G.Game.everyone().find(p => p.uid === from) : host;
      const has = b && (b.buddy || b.egg || (b.net && b.net.bd));
      if ((s.eggBy || []).includes(who) || has) {
        const msg = has ? 'Ya tienes compañero (o un huevo)' : 'Sólo puedes comprar un huevo';
        if (from) G.Coop.sendTo(from, ['dg', 'say', msg, 2.4]); else G.Spawner.say(G.T(msg), 2.4, true);
        return;
      }
    }
    if (!free && !steal) {
      if ((host.coins || 0) < w.price) { if (from) G.Coop.sendTo(from, ['dg', 'poor', w.price]); return; }
      host.coins -= w.price;
      kRep.buys++;
      if (kRep.buys === LOYAL && !kRep.robbed) say('¡Ya eres cliente fiel de Kecleon! Las próximas tiendas: −20 % y un artículo especial', 3.5);
      sendRep();
    }
    if (steal && !free) { kRep.stole = true; sendRep(); }
    if (w.kind === 'egg') (s.eggBy = s.eggBy || []).push(who);
    w.sold = true;
    send(pack(s));
    const buyer = from ? G.Game.everyone().find(p => p.uid === from) : host;
    if (w.kind === 'ticket' || w.kind === 'ticket10') G.Pickups.drop(w.kind, buyer ? buyer.x : s.x, buyer ? buyer.y - 10 : s.y, 1);   // el ticket es del grupo
    else if (from) G.Coop.sendTo(from, ['dg', 'got', w]);
    else applyWare(host, w);
    G.Audio.sfx(steal ? 'hurt' : 'coin');
    if (steal && !free) kecleonRage(s);
    else if (!free && s.wares.every(o => o.sold) && !(room && room.siteId === s.id)) { say('¡Gracias por tu compra! Kecleon se va contento', 2.6); remove(s); }
  }

  // Guardaespaldas de Kecleon: Machamp, a cada lado del mostrador (drawables, kecleonRage).
  const GUARD_DEX = 68, GUARD_DX = 96;
  const guardAnim = {};       // lado (-1 / 1) -> animador

  /** Kecleon se enfada: sale como jefe donde está la tienda. */
  function kecleonRage(s) {
    const t = T(), pl = G.Game.player;
    const slots = G.Enemies.BOSS_SLOTS || [];
    let slot = slots[0];
    for (const o of slots) if (o.at <= t) slot = o;
    // Fuerza de los jefes de ese momento, más un extra por el nivel del grupo.
    const lvl = Math.max(...G.Game.everyone().map(p => p.level || 1));
    // (2026-10-15: más duro; antes caía enseguida. 2026-10-16: aún más con el nivel y con
    // cuántos sois: con la vida/ataque por nivel y en grupo, robar salía siempre a cuenta.)
    const n = G.Game.everyone().length, more = Math.max(0, n - 1);
    const def = G.Enemies.bossFor(352, slot, 2.5 * (1 + lvl * 0.05));
    def.behavior = 'charger';
    const e = G.Spawner.spawnBossNow(pl, t, def);
    if (e) {
      const floor = Math.round(G.Enemies.bossFloor(t) * 2.5 * G.Coop.scaleHp(n));
      if (e.maxHp < floor) e.maxHp = floor;
      e.maxHp = Math.round(e.maxHp * (1 + 0.25 * more));          // además del extra de jefe en grupo
      e.hp = e.maxHp; e.dmg *= 1.5 * (1 + lvl * 0.02); e.spd *= 1.25;
      // Ya le habíais vencido antes en esta run: viene con ganas de revancha.
      if (kRep.robbed) { e.maxHp = e.hp = Math.round(e.maxHp * 1.4); e.dmg *= 1.2; }
    }
    // Y con sus dos guardaespaldas (2026-10-16: tras vencerle una vez ya no está solo).
    if (e && kRep.robbed) {
      for (const side of [-1, 1]) {
        const gd = G.Enemies.bossFor(GUARD_DEX, slot, 1.2 * (1 + lvl * 0.05));
        gd.behavior = 'charger';
        const g = G.Spawner.spawnBossNow(pl, t, gd);
        if (!g) continue;
        g.maxHp = g.hp = Math.round(e.maxHp * 0.4); g.dmg = e.dmg * 0.6;
        g.x = room ? room.cx + side * GUARD_DX : s.x + side * 60; g.y = room ? counterY() + room.ts : s.y;
        g.name = G.T('Guardaespaldas');
      }
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
      case 'item': G.Game.offerItem(w.item, true); break;      // (comprado: la ventana ya, no el icono)
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
      case 'carbos': pl.spdMul *= 1.08; G.Spawner.say(G.T('+8% de velocidad (resto de la run)'), 2.4, true); break;
      case 'iron': pl.dmgReduce += 0.05; G.Spawner.say(G.T('+5% de reducción de daño (resto de la run)'), 2.4, true); break;
      case 'ppup': pl.cdMul *= 0.94; G.Spawner.say(G.T('-6% de recarga (resto de la run)'), 2.4, true); break;
      case 'magnet': pl.magnet *= 1.3; G.Spawner.say(G.T('+30% de alcance del imán (resto de la run)'), 2.4, true); break;
      case 'incense': pl.coinMul *= 1.15; G.Spawner.say(G.T('+15% de Pokémonedas al acabar la run'), 2.4, true); break;
      case 'pgear': G.Companion.addGear(pl, w.gear); break;
      case 'pcandy': G.Companion.addLevels(pl, 3); break;
      case 'pstone': G.Companion.evoStone(pl); break;
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
  const WARE_ICON = { upgrade: 'up', heal: 'berry', rerolls: 'cards', tm: 'book', protein: 'fist', hpup: 'heart', revive: 'sprout', ticket: 'ticket', ticket10: 'ticket10',
                      carbos: 'w_carbos', iron: 'w_iron', ppup: 'w_ppup', magnet: 'w_magnet', incense: 'w_incense', pcandy: 'w_pcandy', pstone: 'w_pstone' };
  const WARE_SPRITE = { potion: 'potion', disc: 'disc', egg: 'egg' };
  const WARE_NAME = { ticket10: 'Ticket ×10', potion: 'Poción', upgrade: 'Mejora', item: 'Objeto', heal: 'Curación', rerolls: '+3 cambios', disc: 'Disco', tm: 'MT',
                      protein: 'Proteína', hpup: 'Más PS', revive: 'Semilla Revivir', ticket: 'Ticket', egg: 'Huevo',
                      carbos: 'Carburante', iron: 'Hierro', ppup: 'Más PP', magnet: 'Imán', incense: 'Incienso Fortuna', pcandy: 'Caramelo Compañero', pstone: 'Piedra Evolutiva' };
  function drawAir(ctx) {
    G.Funny.drawAir(ctx);
    G.Encounters.drawAir(ctx);
    const now = performance.now() / 1000;
    if (room) { drawRoomAir(ctx, now); return; }
    for (const s of sites) {
      if (!G.Camera.sees(s.x, s.y, 320)) continue;
      ctx.save();
      if (s.type === 'mhouse' && s.state === 'idle') {
        label(ctx, '?', s.x, s.y - 14 - Math.abs(Math.sin(now * 2.5)) * 8, '#e2c6ff', 34);
        label(ctx, G.T('SALA MISTERIOSA · entra'), s.x, s.y + 40, '#d9a6ff', 11);
      } else if (s.type === 'statue') {
        // (La estatua se dibuja ordenada con los Pokémon: drawables.)
        if (Math.random() < 0.08) G.FX.twinkle(s.x + G.U.rand(-12, 12), s.y - 58 + G.U.rand(-10, 10));
        label(ctx, G.T('ESTATUA MISTERIOSA'), s.x, s.y - 80, '#e8eef8', 11);
      } else if (s.type === 'shop' && s.wares) {
        // (La caseta se dibuja ordenada con los Pokémon: drawables.)
        const title = s.state === 'free' ? G.T('¡TODO GRATIS!') : s.state === 'angry' ? G.T('¡KECLEON FURIOSO!') : G.T('TIENDA DE KECLEON');
        label(ctx, title + (s.state === 'open' ? ' · ' + Math.max(0, Math.ceil(s.until - T())) + 's' : ''), s.x, s.y - 86, s.state === 'angry' ? '#ff5f6d' : '#9fe0b0');
        if (s.state === 'open' || s.state === 'free') label(ctx, G.T('Entra por la puerta: dentro no hay enemigos'), s.x, s.y + 24, '#7dffb0', 11);
      }
      ctx.restore();
    }
  }

  /**
   * Muebles de la tienda (y Kecleon tras el mostrador) para dibujarlos ordenados por Y con los
   * Pokémon (game.js drawScene). 2026-10-16: antes iban encima de todo y un Pokémon alto delante
   * del mostrador quedaba con la cabeza tapada, como si estuviera dentro.
   */
  function drawables() {
    if (!room) {
      // En el mapa: la caseta de la tienda y la estatua (antes encima de todo: quien estaba
      // delante de la puerta quedaba tapado, como metido dentro).
      const out = [], now = performance.now() / 1000;
      for (const s of sites) {
        if (!G.Camera.sees(s.x, s.y, 320)) continue;
        if (s.type === 'statue') out.push({ y: s.y, draw: ctx => {
          ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 24, 8, 0, 0, 6.2832); ctx.fill(); ctx.restore();
          sprite(ctx, 'statue', Math.floor(now * 1.5) % 6, s.x, s.y - 34);
        } });
        else if (s.type === 'shop' && s.wares) out.push({ y: s.y + 4, draw: ctx => {
          ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 4, 46, 12, 0, 0, 6.2832); ctx.fill(); ctx.restore();
          sprite(ctx, 'shopdoor', 0, s.x, s.y - 36);
        } });
      }
      return out;
    }
    const r = room, ts = r.ts, s = byId(r.siteId), out = [];
    const put = (type, v, x, y, k = 2, extra) => {
      const h = G.Tiles.propSprite(G.World.biome, type, v).height * k;
      out.push({ y: y + h / 2, draw: ctx => { sprite(ctx, type, v, x, y, k); if (extra) extra(ctx); } });
    };
    if (r.kind !== 'shop') {
      // Sala del tesoro: los cofres grandes, también ordenados.
      if (r.ev === 'treasure') for (let i = 0; i < 3; i++) { const [x, y] = chestP(i); put('bigchest', r.chests[i] ? 1 : 0, x, y); }
      return out;
    }
    for (let i = -3; i <= 3; i++) if (i) put('shelf', (i + 3) % 3, r.cx + i * ts * 2.2, r.cy - (r.rh - 1.4) * ts);
    const [px, py] = petP();
    put('shelf', 1, px, py, 2, ctx => { sprite(ctx, 'egg', 0, px - 12, py - 30, 1.5); sprite(ctx, 'egg', 0, px + 12, py - 26, 1.5); });
    const now = performance.now() / 1000;
    put('roulette', Math.floor(now * 6) % 4, r.cx + (r.rw - 1.6) * ts, r.cy - ts * 0.6);
    // Ya le vencisteis una vez: dos guardaespaldas vigilan el mostrador.
    if (s && s.state === 'open' && kRep.robbed) for (const side of [-1, 1]) {
      const gx = r.cx + side * GUARD_DX, gy = counterY() + 10;
      out.push({ y: gy, draw: ctx => {
        let an = guardAnim[side];
        if (!an) { an = guardAnim[side] = new G.Sprites.Animator(GUARD_DEX, 1, false); G.Sprites.preload([GUARD_DEX]); }
        an.loop('Idle'); an.update(1 / 60);
        G.Sprites.drawShadow(ctx, GUARD_DEX, gx, gy);
        an.draw(ctx, gx, gy, {});
      } });
    }
    if (s && s.state === 'open') out.push({ y: counterY() - 6, draw: ctx => {
      if (!kecleonAnim) kecleonAnim = new G.Sprites.Animator(352, 1, false);
      kecleonAnim.loop('Idle'); kecleonAnim.update(1 / 60);
      G.Sprites.drawShadow(ctx, 352, r.cx, counterY() - 6);
      kecleonAnim.draw(ctx, r.cx, counterY() - 6, {});
    } });
    put('counter', 0, r.cx, counterY() + 14);
    return out;
  }

  /** Lo alto del interior: carteles y bocadillos (los muebles van en drawables). */
  function drawRoomAir(ctx, now) {
    const r = room, ts = r.ts, pl = G.Game.player, [dx, dy] = doorP();
    ctx.save();
    if (r.kind === 'shop') {
      const s = byId(r.siteId);
      // (Los muebles y Kecleon se dibujan con todo lo demás, ordenados por Y: ver drawables.)
      { const [px, py] = petP(); label(ctx, G.T('Mascotas'), px, py - ts * 1.3, '#9fe0b0', 11); }
      label(ctx, G.T('Ruleta'), r.cx + (r.rw - 1.6) * ts, r.cy - ts * 1.9, '#ffd23f', 11);
      if (s && s.state === 'open') {
        if (!openShop) G.Funny.bubble(ctx, r.cx, counterY() - 70, G.T('Acércate al mostrador para comprar'));
        if (kRep.robbed) label(ctx, G.T('GUARDAESPALDAS'), r.cx - GUARD_DX, counterY() - 56, '#ff8a95', 10);
      } else if (s && s.state === 'angry') {
        const k = G.EnemyMgr.get(s.bossId);
        if (k && !k.dead) G.Funny.bubble(ctx, k.x, k.y - k.bodyH - 16, G.T('¡LADRÓN! ¡VUELVE AQUÍ!'), '#c8282a');
      }
      label(ctx, G.T('TIENDA DE KECLEON'), r.cx, r.cy - (r.rh - 0.2) * ts, '#9fe0b0');
    } else {
      const names = { house: 'CASA DE MONSTRUOS', treasure: 'SALA DEL TESORO', heal: 'SALA DE CURACIÓN', trap: 'SALA TRAMPA' };
      let t = G.T(names[r.ev] || 'SALA MISTERIOSA');
      if (r.ev === 'house' && r.locked) t += ' · ' + Math.max(0, Math.ceil(HOUSE_TIME - r.t)) + 's';
      label(ctx, t, r.cx, r.cy - (r.rh - 0.2) * ts, r.ev === 'house' ? '#ff8a95' : '#d9a6ff');
      if (r.ev === 'treasure') for (let i = 0; i < 3; i++) {
        const [x, y] = chestP(i);
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
  function clearSites() { sites = []; buyT = 0; buyKey = ''; G.Encounters.clear(); }

  const ROOM_NAME = { shop: 'Tienda de Kecleon', house: 'Casa de monstruos', treasure: 'Sala del tesoro', heal: 'Sala de curación', trap: 'Sala trampa' };
  return { reset, clearSites, tick, update, onNet, onClient, drawGround, drawAir, drawables, blessingInfo, mod,
           get sites() { return room ? [] : sites; }, BLESS,
           /** ¿Está el grupo dentro de un interior? (spawner, loot, etc. no sacan nada) */
           get inRoom() { return !!room; },
           /** game.js, al acabar: ¿regalo de Kecleon? (alguna compra y ningún robo en toda la run) */
           get honest() { return kRep.buys > 0 && !kRep.stole; }, get rep() { return kRep; },
           get room() { return room; },    // pruebas
           get roomName() { return room ? ROOM_NAME[room.kind === 'shop' ? 'shop' : room.ev] || 'Sala misteriosa' : null; },
           get roomDoor() { if (!room) return null; const [x, y] = doorP(); return { x, y }; } };
})();
