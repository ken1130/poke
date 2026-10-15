/* ============ loot.js — cofres de movimientos y pociones ============
 * (2026-10-15) Dos cosas nuevas que aparecen en el mapa (se ven en el minimapa):
 *
 *   Cofre de movimientos  a los 4 y a los 11 minutos aparece uno cerca de cada
 *       jugador. Da de 1 a 4 mejoras al azar (de las de las cartas de nivel, sobre
 *       todo movimientos). Se puede volver a tirar 15 veces por run y cada uno abre
 *       como mucho 2 por run.
 *   Poción  cada minuto y pico aparece una cerca de alguien. Efecto al azar durante
 *       unos segundos: gigante, diminuto, furia, estrella, imán, suerte... o una mala.
 *
 * En grupo los crea el anfitrión (como todos los objetos del suelo) y el efecto se
 * decide al cogerlo; al que lo coge le llega ('sbox' / 'potion', coop.js).
 * No salen en PK ni dentro de la arena de la grieta.
 */
G.Loot = (() => {
  const $ = id => document.getElementById(id);
  const BOX_AT = [240, 660];        // s de run en que aparece cada cofre (uno por jugador)
  const BOX_MAX = 2;                // cofres que puede abrir cada uno por run
  const BOX_REROLLS = 15;           // veces que se puede volver a tirar (por run, entre todos los cofres)
  const POTION_EVERY = 80;          // s (±20 %) entre pociones
  const POTION_MAX = 2;             // en el suelo a la vez, por jugador

  let boxesSpawned = 0, potionT = 0;

  function reset() { boxesSpawned = 0; potionT = 45; }

  const allowed = () => !G.PvP.on && !G.Rift.inArena;

  /** Anfitrión o solitario, cada fotograma de juego. */
  function tick(dt, time, players) {
    if (!allowed()) return;
    if (boxesSpawned < BOX_AT.length && time >= BOX_AT[boxesSpawned]) {
      boxesSpawned++;
      let n = 0;
      for (const p of players) if (!p.dead && spawnNear(p, 'sbox', 360, 600)) n++;
      if (n) {
        const msg = '¡Ha aparecido un cofre de movimientos! Búscalo en el minimapa';
        G.Spawner.say(msg, 3.5, true);
        if (G.Coop.active) G.Coop.say(msg, 3.5);
      }
    }
    potionT -= dt;
    if (potionT <= 0) {
      potionT = POTION_EVERY * G.U.rand(0.8, 1.2);
      const live = players.filter(p => !p.dead);
      const n = G.Pickups.all().filter(p => p.kind === 'potion').length;
      if (live.length && n < POTION_MAX * live.length) spawnNear(G.U.pick(live), 'potion', 280, 520);
    }
  }

  /** Lo deja en un sitio libre a una distancia entre r0 y r1 del jugador. */
  function spawnNear(p, kind, r0, r1) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.2832, d = G.U.rand(r0, r1);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (G.World.isFree(x, y, 16)) { G.Pickups.drop(kind, x, y, 0); return true; }
    }
    return false;
  }

  /** ¿Puede cogerlo este jugador? (los cofres, como mucho 2 por run) */
  function canTake(kind, pl) { return kind !== 'sbox' || (pl.sboxes || 0) < BOX_MAX; }

  // ---------------- cofre de movimientos ----------------

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

  /** Abre la ventana del cofre; `done` cuando se acepta. */
  function showBox(pl, done) {
    let list = rollBox(pl);
    const render = () => {
      $('sbox-sub').textContent = list.length === 1 ? G.T('¡1 mejora!') : G.I18n.f('¡{x} mejoras!', list.length);
      const box = $('sbox-cards');
      box.innerHTML = '';
      list.forEach(c => {
        const el = document.createElement('div');
        el.className = 'card' + (c.type === 'evo' ? ' evo' : '');
        const tag = c.type === 'new' ? 'Nuevo · ' + c.tag : c.tag;
        el.innerHTML = `<div class="ico" style="background:${c.color}33">${G.Icons.html(c.icon, 32)}</div>
          <div class="txt"><div class="nm">${c.title} <span class="tag-chip" style="background:${c.color}">${tag}</span></div><div class="ds">${c.desc}</div></div>`;
        box.appendChild(el);
      });
      const left = BOX_REROLLS - (pl.sboxRerolls || 0);
      $('sbox-rr-n').textContent = left;
      $('sbox-reroll').classList.toggle('hidden', left <= 0);
    };
    $('sbox-reroll').onclick = () => {
      if ((pl.sboxRerolls || 0) >= BOX_REROLLS) return;
      pl.sboxRerolls = (pl.sboxRerolls || 0) + 1;
      G.Audio.sfx('select');
      list = rollBox(pl);
      render();
    };
    $('sbox-ok').onclick = () => {
      G.UI.hide('scr-sbox');
      G.Audio.sfx('confirm');
      for (const c of list) c.apply(pl);
      G.FX.ring(pl.x, pl.y, 8, 120, '#ffd23f', 0.7, 5);
      G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffe14d', 30, 220);
      done();
    };
    render();
    G.UI.show('scr-sbox');
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

  return { reset, tick, canTake, showBox, rollPotion, drink, POTIONS, BOX_MAX };
})();
