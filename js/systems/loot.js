/* ============ loot.js — cofres de movimientos y pociones ============
 * (2026-10-15) Dos cosas nuevas que aparecen en el mapa (se ven en el minimapa):
 *
 *   Disco de movimientos  a los 4, 9 y 15 minutos aparece uno cerca de cada
 *       jugador. Da de 1 a 4 mejoras al azar (de las de las cartas de nivel, sobre
 *       todo movimientos). Se puede volver a tirar 3 veces por run y cada uno abre
 *       como mucho 3 por run.
 *   Poción  cada minuto y pico aparece una cerca de alguien. Efecto al azar durante
 *       unos segundos: gigante, diminuto, furia, estrella, imán, suerte... o una mala.
 *
 * Cada cofre y cada poción es de UN jugador (value = su uid, o 'me' en solitario):
 * sólo él lo ve (también en el minimapa) y sólo él puede cogerlo; en grupo no se
 * quitan unos a otros. Los crea el anfitrión (como todos los objetos del suelo), el
 * efecto se decide al cogerlo y al dueño le llega ('sbox' / 'potion', coop.js).
 * No salen en PK ni dentro de la arena de la grieta.
 */
G.Loot = (() => {
  const $ = id => document.getElementById(id);
  const BOX_AT = [240, 540, 900];        // s de run en que aparece cada disco (uno por jugador)
  // En una fase de la Aventura (más corta) se reparten a lo largo de lo que dura: 20 %, 50 %, 80 %.
  let boxAt = BOX_AT;
  const BOX_MAX = 3;                // cofres que puede abrir cada uno por run
  const BOX_REROLLS = 3;           // veces que se puede volver a tirar (por run, entre todos los cofres)
  const POTION_EVERY = 80;          // s (±20 %) entre pociones
  const POTION_MAX = 2;             // en el suelo a la vez, por jugador

  let boxesSpawned = 0, potionT = 0;

  function reset() { boxesSpawned = 0; potionT = 45; boxAt = null; }

  const allowed = () => !G.PvP.on && !G.Rift.inArena;

  /** Anfitrión o solitario, cada fotograma de juego. */
  function tick(dt, time, players) {
    if (!allowed()) return;
    if (!boxAt) {
      const len = G.Stages.runLength && G.Stages.runLength();
      boxAt = len ? [0.2, 0.5, 0.8].map(k => Math.max(30, Math.round(len * k))) : BOX_AT;
    }
    if (boxesSpawned < boxAt.length && time >= boxAt[boxesSpawned]) {
      boxesSpawned++;
      let n = 0;
      for (const p of players) if ((p.sboxes || 0) < BOX_MAX && spawnNear(p, 'sbox', 360, 600)) n++;
      if (n) {
        const msg = '¡Ha aparecido un disco de movimientos! Búscalo en el minimapa';
        G.Spawner.say(msg, 3.5, true);
        if (G.Coop.active) G.Coop.say(msg, 3.5);
      }
    }
    potionT -= dt;
    if (potionT <= 0) {
      potionT = POTION_EVERY * G.U.rand(0.8, 1.2);
      const live = players.filter(p => !p.dead);
      const who = live.length ? G.U.pick(live) : null;
      if (who && G.Pickups.all().filter(p => p.kind === 'potion' && p.value === ownerKey(who)).length < POTION_MAX) spawnNear(who, 'potion', 280, 520);
    }
  }

  /** De quién es: uid en grupo, 'me' en solitario. */
  const ownerKey = p => (p && p.uid) || 'me';

  /** Lo deja (para el jugador p) en un sitio libre a una distancia entre r0 y r1 de él. */
  function spawnNear(p, kind, r0, r1) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.2832, d = G.U.rand(r0, r1);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (G.World.isFree(x, y, 16)) { G.Pickups.drop(kind, x, y, ownerKey(p)); return true; }
    }
    return false;
  }

  /** ¿Es de este jugador? (sólo él lo ve y lo coge) */
  const isMine = (p, pl) => p.value === ownerKey(pl);
  /** ¿Puede cogerlo este jugador? (el suyo y, los cofres, como mucho 2 por run) */
  function canTake(p, pl) {
    return isMine(p, pl) && (p.kind !== 'sbox' || (pl.sboxes || 0) < BOX_MAX)
      && (p.kind !== 'egg' || (!pl.egg && !pl.buddy && !(pl.net && pl.net.bd)));   // huevo: uno, si aún no tienes compañero
  }
  /** ¿Se dibuja aquí? Sólo los tuyos (y un cofre que ya no puedes abrir, tampoco). */
  function visible(p) { const pl = G.Game.player; return !!pl && canTake(p, pl); }

  // ---------------- disco de movimientos ----------------

  /** Cuántas mejoras da: 1 (50 %), 2 (30 %), 3 (15 %) o 4 (5 %). */
  function boxCount() {
    const r = Math.random();
    return r < 0.5 ? 1 : r < 0.8 ? 2 : r < 0.95 ? 3 : 4;
  }

  /**
   * Las mejoras del cofre: primero movimientos (nuevos, mejoras y evoluciones, sin
   * pasarse de los huecos libres) y, si no hay bastantes, mejoras de la run.
   */
  function rollBox(pl) {
    const n = boxCount();
    const pool = G.LevelUp.offer(pl, 30);
    const out = [];
    let free = pl.maxMoves - pl.slots.length;
    for (const c of pool) {
      if (out.length >= n) break;
      if (c.type === 'stat') continue;
      if (c.type === 'new') { if (free <= 0) continue; free--; }
      out.push(c);
    }
    for (const c of pool) {
      if (out.length >= n) break;
      if (c.type === 'stat' && !out.includes(c)) out.push(c);
    }
    return out;
  }

  /** El disco (para la ventana; el arcoíris y el giro van en el CSS). */
  // Pixel art del disco (tiles.js), el mismo que en el mapa, con su brillo animado.

  /**
   * Abre la ventana del cofre; `done` cuando se acepta. Primero el disco gira y se
   * ilumina, y las mejoras salen de una en una (no se sabe cuántas hasta el final): con 3,
   * brillo dorado; con 4, ¡premio gordo! (borde arcoíris y fiesta). Volver a tirar
   * repite la animación, más corta.
   */
  function showBox(pl, done) {
    let list = rollBox(pl), run = 0;
    const boxEl = document.querySelector('#scr-sbox > .box');
    const buttons = on => { $('sbox-ok').disabled = !on; $('sbox-reroll').disabled = !on; };
    const card = c => {
      const el = document.createElement('div');
      el.className = 'card reveal' + (c.type === 'evo' ? ' evo' : '');
      const tag = c.type === 'new' ? 'Nuevo · ' + c.tag : c.tag;
      el.innerHTML = `<div class="ico" style="background:${c.color}33">${G.Icons.html(c.icon, 32)}</div>
        <div class="txt"><div class="nm">${c.title} <span class="tag-chip" style="background:${c.color}">${tag}</span></div><div class="ds">${c.desc}</div></div>`;
      return el;
    };
    const play = quick => {
      const me = ++run, n = list.length;
      const later = (ms, fn) => setTimeout(() => { if (me === run && G.UI.isOpen('scr-sbox')) fn(); }, ms);
      const SHAKE = quick ? 450 : 1100, STEP = quick ? 280 : 520;
      buttons(false);
      boxEl.classList.remove('tier3', 'tier4');
      $('sbox-banner').classList.add('hidden');
      $('sbox-cards').innerHTML = '';
      $('sbox-sub').classList.remove('count');
      $('sbox-sub').textContent = G.T('Abriendo…');
      const chest = $('sbox-chest');
      chest.innerHTML = '<img class="sb-disc" alt="">';
      const img = chest.firstChild;
      let fr = 0;
      const spin = () => { if (!chest.firstChild) return; img.src = G.Tiles.propSprite(G.World.biome, 'disc', fr++ % 6).toDataURL(); setTimeout(spin, quick ? 60 : 90); };
      spin();
      chest.className = 'on shake';
      G.Audio.sfx('select');
      later(SHAKE, () => { chest.className = 'on open'; G.Audio.sfx('break'); });
      for (let k = 0; k < n; k++) {
        later(SHAKE + 250 + k * STEP, () => {
          $('sbox-cards').appendChild(card(list[k]));
          $('sbox-sub').classList.add('count');
          $('sbox-sub').textContent = '×' + (k + 1);
          G.Audio.sfx(k >= 2 ? 'shiny' : 'xp');
          if (k === 0) { chest.className = ''; chest.innerHTML = ''; }
          if (k === 2) boxEl.classList.add('tier3');
          if (k === 3) {
            boxEl.classList.replace('tier3', 'tier4');
            $('sbox-banner').classList.remove('hidden');
          }
        });
      }
      later(SHAKE + 250 + (n - 1) * STEP + 350, () => {
        $('sbox-sub').classList.remove('count');
        $('sbox-sub').textContent = n === 1 ? G.T('¡1 mejora!') : G.I18n.f('¡{x} mejoras!', n);
        if (n >= 3) G.Audio.sfx('legend');
        if (n >= 4 && pl === G.Game.player) G.Progress.event('jackpot');
        if (n >= 4) {
          // Premio gordo: fiesta también en el mapa.
          for (const col of ['#ff5f6d', '#ffd23f', '#5fe08a', '#4fb4ff', '#c47bff']) G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, col, 16, 260);
          G.FX.ring(pl.x, pl.y, 8, 200, '#ffd23f', 0.9, 6);
          G.Camera.kick(0.5);
        }
        const left = BOX_REROLLS - (pl.sboxRerolls || 0);
        $('sbox-rr-n').textContent = left;
        $('sbox-reroll').classList.toggle('hidden', left <= 0);
        buttons(true);
      });
    };
    $('sbox-reroll').onclick = () => {
      if ($('sbox-reroll').disabled || (pl.sboxRerolls || 0) >= BOX_REROLLS) return;
      pl.sboxRerolls = (pl.sboxRerolls || 0) + 1;
      list = rollBox(pl);
      play(true);
    };
    $('sbox-ok').onclick = () => {
      if ($('sbox-ok').disabled) return;
      run++;
      G.UI.hide('scr-sbox');
      boxEl.classList.remove('tier3', 'tier4');
      G.Audio.sfx('confirm');
      for (const c of list) c.apply(pl);
      G.FX.ring(pl.x, pl.y, 8, 120, '#ffd23f', 0.7, 5);
      G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffe14d', 30, 220);
      done();
    };
    G.UI.show('scr-sbox');
    play(false);
  }

  // ---------------- pociones ----------------

  /*
   * w: peso (probabilidad) · dur: segundos · on/off: lo que cambia en el jugador.
   * Gigante y diminuto cambian el tamaño (también lo ven los demás en grupo).
   */
  const POTIONS = {
    giant: { w: 18, dur: 20, color: '#ff7b3d', name: '¡Gigante!',
             desc: '+25% de daño, -25% de daño recibido y aplastas a los que te tocan; -15% de velocidad',
             on: p => { p.sizeK = 1.5; p.atkMul *= 1.25; p.potionRed = 0.25; p.spdMul *= 0.85; p.r *= 1.25; p.giant = true; },
             off: p => { p.sizeK = 1; p.atkMul /= 1.25; p.potionRed = 0; p.spdMul /= 0.85; p.r = G.Sprites.bodyRadius(p.dex); p.giant = false; } },
    tiny:  { w: 18, dur: 20, color: '#7fe0ff', name: '¡Diminuto!',
             desc: '+35% de velocidad y es más difícil que te den; -10% de daño',
             on: p => { p.sizeK = 0.6; p.spdMul *= 1.35; p.atkMul *= 0.9; p.r *= 0.6; },
             off: p => { p.sizeK = 1; p.spdMul /= 1.35; p.atkMul /= 0.9; p.r = G.Sprites.bodyRadius(p.dex); } },
    fury:  { w: 16, dur: 20, color: '#ff5f6d', name: '¡Furia!',
             desc: '-35% de recarga en todos los movimientos',
             on: p => { p.cdMul *= 0.65; }, off: p => { p.cdMul /= 0.65; } },
    star:  { w: 12, dur: 8, color: '#ffd23f', name: '¡Estrella!',
             desc: 'No recibes daño durante 8 s',
             on: p => { p.star = true; }, off: p => { p.star = false; } },
    magnet:{ w: 12, dur: 0, color: '#ff9ed8', name: '¡Imán!',
             desc: 'Toda la experiencia del mapa vuela hacia ti',
             on: () => {}, off: () => {} },
    lucky: { w: 14, dur: 20, color: '#5fe08a', name: '¡Suerte!',
             desc: 'Experiencia ×2',
             on: p => { p.xpMul *= 2; }, off: p => { p.xpMul /= 2; } },
    toxic: { w: 5, dur: 5, color: '#a043d0', name: 'Poción mala: ¡veneno!',
             desc: 'Pierdes un poco de vida durante 5 s',
             on: p => { p.toxic = true; }, off: p => { p.toxic = false; } },
    // De risa (2026-10-15): no cambian mucho la partida, pero dan juego.
    bighead: { w: 6, dur: 15, color: '#ffd23f', name: '¡Cabezón!',
             desc: 'Te crece la cabeza… (y +10% de crítico)',
             on: p => { p.sizeK = 1.8; p.critChance = (p.critChance || 0) + 0.1; }, off: p => { p.sizeK = 1; p.critChance -= 0.1; } },
    reverse: { w: 5, dur: 8, color: '#c47bff', name: 'Poción rara: ¡al revés!',
             desc: 'Izquierda es derecha y arriba es abajo durante 8 s',
             on: p => { p.reversed = true; }, off: p => { p.reversed = false; } },
    disco:   { w: 6, dur: 10, color: '#ff8ad8', name: '¡Fiesta disco!',
             desc: 'Los enemigos de alrededor se ponen a bailar (van mucho más lentos)',
             on: p => { p.disco = true; }, off: p => { p.disco = false; } },
    heavy: { w: 5, dur: 5, color: '#8f98ab', name: 'Poción mala: ¡pesadez!',
             desc: 'Vas a la mitad de velocidad durante 5 s',
             on: p => { p.spdMul *= 0.5; }, off: p => { p.spdMul /= 0.5; } }
  };

  function rollPotion() {
    const ids = Object.keys(POTIONS);
    let r = Math.random() * ids.reduce((a, id) => a + POTIONS[id].w, 0);
    for (const id of ids) { r -= POTIONS[id].w; if (r <= 0) return id; }
    return ids[0];
  }

  /** Te bebes la poción `id` (la que tuvieras antes se acaba). */
  function drink(pl, id) {
    const def = POTIONS[id];
    if (!def || !pl) return;
    pl.drinkPotion(id, def);
    G.Spawner.say(G.T(def.name) + ' ' + G.T(def.desc), 3, true);
    G.FX.ring(pl.x, pl.y, 6, 90, def.color, 0.5, 4);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, def.color, 20, 160);
    G.Audio.sfx(id === 'toxic' || id === 'heavy' ? 'hurt' : 'shiny');
  }

  return { reset, tick, canTake, visible, ownerKey, showBox, rollPotion, drink, POTIONS, BOX_MAX };
})();
