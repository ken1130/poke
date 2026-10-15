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
 * Cooperativo: lo decide todo el anfitrión (dónde sale, cuándo empieza, quién
 * compra, la bendición) y se lo cuenta a los demás con eventos ['dg', ...]; los
 * invitados piden comprar con ['dg', 'buy', ...]. En solitario, igual pero local.
 */
G.Dungeon = (() => {
  const T = () => G.Game.st.time;
  const authority = () => !G.Coop.active || G.Coop.isHost;

  let sites = [];                    // { id, type, x, y, state, ... }
  let nextId = 1;
  let houseT = 0, shopT = 0, statueT = 0;
  let blessing = null;               // { id, until } (todo el grupo)
  let buyT = 0, buyKey = '';         // tú, encima de un artículo de la tienda

  function reset() {
    sites = []; nextId = 1; blessing = null; buyT = 0; buyKey = '';
    houseT = 150; shopT = 270; statueT = 200;
  }
  const allowed = () => !G.PvP.on && !G.Rift.inArena && G.Modes.run !== 'legend';
  const byId = id => sites.find(s => s.id === id);

  // ---------------- red ----------------
  function send(ev) { if (G.Coop.active && G.Coop.isHost) G.Coop.broadcast(ev); }
  /** Lo que se cuenta de un sitio (lo justo para dibujarlo). */
  const pack = s => ['dg', 'site', s.id, s.type, Math.round(s.x), Math.round(s.y), s.state, s.wares || null, s.until || 0];

  function onNet(ev) {
    const k = ev[1];
    if (k === 'site') {
      let s = byId(ev[2]);
      if (!s) { s = { id: ev[2] }; sites.push(s); }
      Object.assign(s, { type: ev[3], x: ev[4], y: ev[5], state: ev[6], wares: ev[7], until: ev[8] });
      if (s.state === 'active' && s.type === 'mhouse' && !s.shown) { s.shown = true; houseStartFx(s); }
    } else if (k === 'gone') sites = sites.filter(s => s.id !== ev[2]);
    else if (k === 'got') applyWare(G.Game.player, ev[2]);
    else if (k === 'bless') startBlessing(ev[2], ev[3]);
    else if (k === 'say') G.Spawner.say(G.T(ev[2]), ev[3] || 3, true);
    else if (k === 'ach') G.Progress.event(ev[2]);
    else if (k === 'poor') G.Spawner.say(G.I18n.f('¡No tienes bastantes monedas! (cuesta {x})', ev[2]), 2, true);
  }
  /** Anfitrión: un invitado pide comprar (o se lleva sin pagar) el artículo `idx`. */
  function onClient(from, ev) {
    if (ev[1] === 'buy') tryBuy(byId(ev[2]), ev[3], from, !!ev[4]);
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
    const live = players.filter(p => !p.dead);
    if (!live.length) return;
    const t = T();
    if (blessing && t >= blessing.until) endBlessing();
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
      if (s.type === 'mhouse') houseTick(s, dt, live);
      else if (s.type === 'shop') shopTick(s, live);
      else if (s.type === 'statue') statueTick(s, live);
    }
  }

  /** Cada ordenador, para su jugador: comprar en la tienda (quedarse encima). */
  function update(dt, pl) {
    if (!pl || pl.dead) { buyT = 0; return; }
    let on = null;
    for (const s of sites) {
      if (s.type !== 'shop' || !s.wares || s.state === 'closed') continue;
      s.wares.forEach((w, i) => {
        if (w.sold) return;
        const [wx, wy] = warePos(s, i);
        if (G.U.dist2(pl.x, pl.y, wx, wy) < (20 + pl.r * 0.5) ** 2) on = { s, i, w };
      });
    }
    if (!on) { buyT = 0; buyKey = ''; return; }
    const key = on.s.id + ':' + on.i;
    if (key !== buyKey) { buyKey = key; buyT = 0; G.Audio.sfx('select'); }
    buyT += dt;
    const free = on.s.state === 'free';
    const price = free ? 0 : on.w.price;
    const coins = pl.coins || 0;
    // Con dinero: 1 s encima y es tuyo. Sin dinero: a los 3 s lo robas.
    if (coins >= price && buyT >= (free ? 0.4 : 1)) { request(on.s, on.i, false); buyT = -99; }
    else if (coins < price && !free) {
      if (buyT >= 0.3 && buyT - dt < 0.3) G.Spawner.say(G.I18n.f('¡No tienes bastantes monedas! (cuesta {x}) Si te quedas… lo robas', price), 2.4, true);
      if (buyT >= 3) { request(on.s, on.i, true); buyT = -99; }
    }
  }
  function request(s, i, steal) {
    if (authority()) tryBuy(s, i, null, steal);
    else G.Coop.request(['dg', 'buy', s.id, i, steal ? 1 : 0]);
  }

  // ---------------- casa de monstruos ----------------

  const HOUSE_R = 270, HOUSE_TIME = 30;
  function houseTick(s, dt, live) {
    if (s.state === 'idle') {
      if (live.some(p => G.U.dist2(p.x, p.y, s.x, s.y) < 80 * 80)) {
        s.t = 0; s.wave = 0; s.mobs = [];
        setState(s, 'active');
        s.shown = true;
        houseStartFx(s);
        wave(s, 12 + 4 * live.length);
      }
      return;
    }
    if (s.state !== 'active') return;
    s.t += dt;
    if (s.t >= 6 * (s.wave + 1) && s.t < HOUSE_TIME - 5) wave(s, 5 + 2 * live.length);
    const alive = s.mobs.filter(id => { const e = G.EnemyMgr.get(id); return e && !e.dead; }).length;
    if (s.t >= HOUSE_TIME || (alive === 0 && s.t > 4)) houseEnd(s, alive === 0);
  }
  function wave(s, n) {
    s.wave++;
    const t = T();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + Math.random() * 0.3, r = HOUSE_R * G.U.rand(0.75, 1);
      const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r * 0.8;
      if (!G.World.isFree(x, y, 12)) continue;
      const e = G.Spawner.spawnAt(x, y, t + 40);         // un poco más duros que los de ese momento
      if (e) { s.mobs.push(e.id); G.FX.burst(x, y - 10, '#c47bff', 6, 90); }
    }
  }
  function houseStartFx(s) {
    G.Spawner.say(G.T('¡Es una casa de monstruos! Aguanta 30 s'), 3, true);
    G.Audio.sfx('boss');
    if (G.U.dist2(s.x, s.y, G.Camera.x, G.Camera.y) < 700 * 700) G.Camera.kick(0.8);
    s.startAt = performance.now();
  }
  function houseEnd(s, cleared) {
    remove(s);
    say(cleared ? '¡Casa de monstruos superada! Recoge el botín' : '¡Has aguantado! Recoge el botín', 3);
    award('mhouse');
    const t = T();
    G.Pickups.dropXp(s.x, s.y, Math.round(140 + t * 0.9), true);
    for (let i = 0; i < 8; i++) G.Pickups.drop('coin', s.x + G.U.rand(-50, 50), s.y + G.U.rand(-35, 35), 5);
    if (Math.random() < 0.6) G.Pickups.drop('item', s.x + 30, s.y - 10, G.Items.roll());
  }

  // ---------------- tienda de Kecleon ----------------

  /*
   * Lo que vende (precio base en monedas de la run; sube con el tiempo):
   *   potion   una poción al azar     upgrade  una mejora de las cartas (sobre todo movimientos)
   *   item     un objeto equipable    heal     te cura el 60 %
   *   rerolls  +3 cambios de cartas de nivel
   */
  const WARES = { potion: 15, upgrade: 35, item: 40, heal: 12, rerolls: 20 };
  function rollWares(t) {
    const k = 1 + t / 900;
    return G.U.pickN(Object.keys(WARES), 3).map(kind => ({ kind, price: Math.round(WARES[kind] * k), item: kind === 'item' ? G.Items.roll() : null }));
  }
  const warePos = (s, i) => [s.x + (i - 1) * 64, s.y + 58 - (i === 1 ? -8 : 0)];

  function shopTick(s, live) {
    const t = T();
    if (s.state === 'open' || s.state === 'idle') {
      if (s.state === 'idle') { s.state = 'open'; send(pack(s)); }
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
    if (from) G.Coop.sendTo(from, ['dg', 'got', w]);
    else applyWare(host, w);
    G.Audio.sfx(steal ? 'hurt' : 'coin');
    if (steal && !free) kecleonRage(s);
    else if (!free && s.wares.every(o => o.sold)) { say('¡Gracias por tu compra! Kecleon se va contento', 2.6); remove(s); }
  }

  /** Kecleon se enfada: sale como jefe donde está la tienda. */
  function kecleonRage(s) {
    const t = T(), pl = G.Game.player;
    const slots = G.Enemies.BOSS_SLOTS || [];
    let slot = slots[0];
    for (const o of slots) if (o.at <= t) slot = o;
    // Fuerza de los jefes de ese momento, más un extra por el nivel del grupo.
    const lvl = Math.max(...G.Game.everyone().map(p => p.level || 1));
    const def = G.Enemies.bossFor(352, slot, 1.3 * (1 + lvl * 0.02));
    def.behavior = 'charger';
    const e = G.Spawner.spawnBossNow(pl, t, def);
    if (e) { e.x = s.x; e.y = s.y; e.name = 'Kecleon'; s.bossId = e.id; }
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
  function drawGround(ctx) {
    const now = performance.now() / 1000;
    for (const s of sites) {
      if (!G.Camera.sees(s.x, s.y, 320)) continue;
      ctx.save();
      if (s.type === 'mhouse') {
        if (s.state === 'active') {
          // Borde de la casa: aro rojo que late.
          ctx.globalAlpha = 0.5 + Math.sin(now * 6) * 0.2;
          ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]);
          ctx.beginPath(); ctx.ellipse(s.x, s.y, HOUSE_R, HOUSE_R * 0.8, 0, 0, 6.2832); ctx.stroke();
        } else {
          // Trampilla de piedra con un "?" tallado (pixel art, tiles.js) y un halo morado.
          ctx.globalAlpha = 0.25 + Math.sin(now * 3) * 0.12; ctx.fillStyle = '#c47bff';
          ctx.beginPath(); ctx.ellipse(s.x, s.y, 52, 32, 0, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 1;
          G.Pickups.sprite(ctx, 'mhouse', 0, s.x, s.y, 2);
        }
      } else if (s.type === 'shop' && s.wares) {
        // Alfombra de la tienda (pixel art, como en Mundo Misterioso) y los artículos.
        G.Pickups.sprite(ctx, 'shopmat', 0, s.x, s.y + 56, 2);
        s.wares.forEach((w, i) => {
          if (w.sold) return;
          const [wx, wy] = warePos(s, i);
          ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(wx, wy, 18, 8, 0, 0, 6.2832); ctx.fill();
        });
      }
      ctx.restore();
    }
  }
  const WARE_ICON = { potion: null, upgrade: 'up', item: null, heal: 'berry', rerolls: 'cards' };
  const WARE_NAME = { potion: 'Poción', upgrade: 'Mejora', item: 'Objeto', heal: 'Curación', rerolls: '+3 cambios' };
  function drawAir(ctx) {
    const now = performance.now() / 1000;
    const pl = G.Game.player;
    for (const s of sites) {
      if (!G.Camera.sees(s.x, s.y, 320)) continue;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '800 12px Pixelify,"Segoe UI",system-ui,sans-serif';
      const label = (txt, x, y, col) => {
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, x, y);
        ctx.fillStyle = col; ctx.fillText(txt, x, y);
      };
      if (s.type === 'mhouse' && s.state === 'idle') {
        ctx.font = '800 34px Pixelify,"Segoe UI",system-ui,sans-serif';
        label('?', s.x, s.y - 14 - Math.abs(Math.sin(now * 2.5)) * 8, '#e2c6ff');
      } else if (s.type === 'mhouse' && s.state === 'active' && s.t != null) {
        label(G.T('CASA DE MONSTRUOS') + ' · ' + Math.max(0, Math.ceil(HOUSE_TIME - s.t)) + 's', s.x, s.y - 30, '#ff8a95');
      } else if (s.type === 'statue') {
        // Estatua de Unown en pixel art (tiles.js); el ojo va cambiando de color.
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 24, 8, 0, 0, 6.2832); ctx.fill();
        G.Pickups.sprite(ctx, 'statue', Math.floor(now * 1.5) % 6, s.x, s.y - 34, 2);
        if (Math.random() < 0.08) G.FX.twinkle(s.x + G.U.rand(-12, 12), s.y - 58 + G.U.rand(-10, 10));
        ctx.font = '800 11px Pixelify,"Segoe UI",system-ui,sans-serif';
        label(G.T('ESTATUA MISTERIOSA'), s.x, s.y - 80, '#e8eef8');
      } else if (s.type === 'shop' && s.wares) {
        // Kecleon detrás del mostrador (si no está furioso: entonces es el jefe).
        if (s.state !== 'angry') {
          if (!kecleonAnim) kecleonAnim = new G.Sprites.Animator(352, 1, false);
          kecleonAnim.loop('Idle'); kecleonAnim.update(1 / 60);
          G.Sprites.drawShadow(ctx, 352, s.x, s.y);
          kecleonAnim.draw(ctx, s.x, s.y, {});
        }
        const title = s.state === 'free' ? G.T('¡TODO GRATIS!') : s.state === 'angry' ? G.T('¡KECLEON FURIOSO!') : G.T('TIENDA DE KECLEON');
        label(title + (s.state === 'open' ? ' · ' + Math.max(0, Math.ceil(s.until - T())) + 's' : ''), s.x, s.y - 52, s.state === 'angry' ? '#ff5f6d' : '#9fe0b0');
        ctx.font = '800 10px Pixelify,"Segoe UI",system-ui,sans-serif';
        s.wares.forEach((w, i) => {
          if (w.sold) return;
          const [wx, wy] = warePos(s, i);
          const bob = Math.sin(now * 3 + i) * 2;
          if (w.kind === 'potion') G.Pickups.sprite(ctx, 'potion', Math.floor(now) % 6, wx, wy - 14 + bob, 1.6);
          else G.Icons.draw(ctx, w.kind === 'item' ? w.item : WARE_ICON[w.kind], wx - 12, wy - 26 + bob, 24);
          const price = s.state === 'free' ? G.T('Gratis') : w.price + ' ' + G.T('monedas');
          label(G.T(w.kind === 'item' && G.Items.BY[w.item] ? G.Items.BY[w.item].name : WARE_NAME[w.kind]), wx, wy + 16, '#ffffff');
          label(price, wx, wy + 28, s.state === 'free' ? '#5fe08a' : (pl && (pl.coins || 0) >= w.price ? '#ffd23f' : '#ff8a95'));
          // Anillo de "comprando" mientras estás encima.
          if (buyKey === s.id + ':' + i && buyT > 0) {
            const need = s.state === 'free' ? 0.4 : (pl && (pl.coins || 0) >= w.price ? 1 : 3);
            ctx.strokeStyle = pl && (pl.coins || 0) >= w.price ? '#5fe08a' : '#ff5f6d'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(wx, wy - 12, 16, -Math.PI / 2, -Math.PI / 2 + 6.2832 * Math.min(1, buyT / need)); ctx.stroke();
          }
        });
      }
      ctx.restore();
    }
  }

  /** HUD: la bendición o maldición activa (nombre y segundos). */
  function blessingInfo() {
    if (!blessing) return null;
    const d = BLESS[blessing.id];
    return { name: d.name, color: d.color, left: Math.max(0, blessing.until - T()) };
  }

  /** Al bajar de piso (floors.js): lo del mapa anterior desaparece (la bendición sigue). */
  function clearSites() { sites = []; buyT = 0; buyKey = ''; }

  return { reset, clearSites, tick, update, onNet, onClient, drawGround, drawAir, blessingInfo, mod,
           get sites() { return sites; }, BLESS };
})();
