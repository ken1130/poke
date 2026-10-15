/* ============ relics.js — reliquias de la torre sin fin (2026-10-15) ============
 * Cada 5 pisos de la torre (challenges.js) se elige 1 de 3 reliquias: un efecto
 * fuerte que dura toda la torre. Se para la partida mientras eliges (en grupo,
 * para todos, como con las cartas: G.Game.openChoice). Cada uno elige las suyas.
 * Salen como iconos bajo el piso en el HUD.
 */
G.Relics = (() => {
  const $ = id => document.getElementById(id);

  /*
   * icon: de G.Icons (pixel art) · on(p): lo que hace (para el resto de la run).
   * Las que necesitan algo cada fotograma (bolas de fuego, bomba) las mueve tick().
   */
  const LIST = {
    leech:  { icon: 'relic_fang', name: 'Colmillo Sediento', desc: 'Te curas un 3% del daño que haces.',
              on: p => { p.relicLeech = (p.relicLeech || 0) + 0.03; } },
    wisdom: { icon: 'book', name: 'Tomo Antiguo', desc: '+30% de experiencia.',
              on: p => { p.xpMul *= 1.3; } },
    orbs:   { icon: 'relic_orbs', name: 'Ascuas Gemelas', desc: 'Dos bolas de fuego giran a tu alrededor y queman.',
              on: p => { p.relicOrbs = (p.relicOrbs || 0) + 2; } },
    crit:   { icon: 'scopelens', name: 'Ojo del Cazador', desc: '+15% de crítico y los críticos hacen ×1,8.',
              on: p => { p.critChance = (p.critChance || 0) + 0.15; p.critMul = 1.8; } },
    revive: { icon: 'sprout', name: 'Brote Eterno', desc: 'Si caes, vuelves con la mitad de la vida (una vez).',
              on: p => { p.reviveSeed = true; } },
    wind:   { icon: 'magnet', name: 'Pluma Veloz', desc: '+40% de radio de recogida y +15% de velocidad.',
              on: p => { p.magnet *= 1.4; p.spdMul *= 1.15; } },
    venom:  { icon: 'relic_venom', name: 'Frasco de Ponzoña', desc: 'Los enemigos quemados o envenenados reciben +15% de daño.',
              on: p => { p.relicVenom = true; } },
    bomb:   { icon: 'bomb', name: 'Detonador', desc: 'Cada 10 s estalla una bomba gratis a tu alrededor.',
              on: p => { p.relicBomb = (p.relicBomb || 0) + 1; } }
  };

  let owned = [], bombT = 10;
  function reset() { owned = []; bombT = 10; }

  /** Toca elegir (piso múltiplo de 5). Se para la partida hasta elegir. */
  function offer() {
    const pl = G.Game.player;
    if (!pl || pl.dead) return;
    const pool = Object.keys(LIST).filter(id => !owned.includes(id));
    if (!pool.length) return;
    const pick = G.U.pickN(pool, 3);
    G.Game.openChoice(done => show(pl, pick, done));
  }

  function show(pl, pick, done) {
    const box = $('relic-cards');
    box.innerHTML = '';
    pick.forEach((id, i) => {
      const r = LIST[id];
      const el = document.createElement('div');
      el.className = 'card evo';
      el.innerHTML = `<div class="ico" style="background:#c47bff33">${G.Icons.html(r.icon, 32)}</div>
        <div class="txt"><div class="nm">${G.T(r.name)}</div><div class="ds">${G.T(r.desc)}</div></div>
        <div class="key">${i + 1}</div>`;
      el.onclick = () => {
        G.UI.hide('scr-relic');
        owned.push(id);
        r.on(pl);
        G.Audio.sfx('legend');
        G.FX.ring(pl.x, pl.y, 8, 120, '#c47bff', 0.8, 6);
        G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#e2c6ff', 34, 240);
        G.Spawner.say(G.T('Reliquia') + ': ' + G.T(r.name), 2.6, true);
        done();
      };
      box.appendChild(el);
    });
    G.Audio.sfx('levelup');
    G.UI.show('scr-relic');
  }

  /** Elegir con el teclado (1-3) o solo a los 25 s en grupo. */
  function pick(i) { const c = document.querySelectorAll('#relic-cards .card')[i]; if (c) c.click(); }

  /** Cada fotograma (cada uno su jugador): bolas de fuego y bomba. */
  function tick(dt, pl) {
    if (!pl || pl.dead || !owned.length) return;
    if (pl.relicOrbs) {
      const mine = G.Projectiles.all().filter(p => p.orb && p.owner === pl && p.mid === 'relic');
      for (let i = mine.length; i < pl.relicOrbs; i++) {
        G.Projectiles.spawnOrb({
          owner: pl, ghost: false, mid: 'relic', x: pl.x, y: pl.y, r: 8, color: '#ff7b3d', vis: G.VFX.forType('fire'),
          dmg: 0, oa: (i / pl.relicOrbs) * 6.2832, orad: 78, ospeed: 3.2, rehit: 0.4, knock: 40, burn: 1, poison: 0, slow: 0, mtype: 'fire'
        });
      }
      for (const p of mine) p.dmg = 18 * pl.atk * (1 + 0.05 * pl.level);
    }
    if (pl.relicBomb) {
      bombT -= dt;
      if (bombT <= 0) {
        bombT = 10;
        const R = G.Camera.outerRadius();
        G.FX.ring(pl.x, pl.y, 20, R * 0.7, '#ff7b3d', 0.5, 6);
        G.Camera.kick(0.5);
        G.Audio.sfx('break');
        for (const e of G.EnemyMgr.all()) {
          if (e.dead || !G.Camera.sees(e.x, e.y, 0)) continue;
          e.hurt((60 + pl.level * 14) * pl.relicBomb, '#ff7b3d', e.x - pl.x, e.y - pl.y, 160);
        }
      }
    }
  }

  /** HUD: las reliquias que llevas, centradas en (cx, y). */
  function drawHud(ctx, cx, y) {
    if (!owned.length) return;
    const S = 18, GAP = 4, w = owned.length * (S + GAP) - GAP;
    let x = cx - w / 2;
    for (const id of owned) {
      ctx.fillStyle = 'rgba(30,12,48,.75)'; ctx.fillRect(x - 2, y - 2, S + 4, S + 4);
      ctx.strokeStyle = '#c47bff'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, S + 3, S + 3);
      G.Icons.draw(ctx, LIST[id].icon, x, y, S);
      const r = LIST[id];
      G.HUD.tapInfo(x - 2, y - 2, S + 4, S + 4, 'relic:' + id, () => ({ title: G.T(r.name), color: '#c47bff', lines: [G.T(r.desc), G.T('Reliquia: dura toda la torre.')] }));
      x += S + GAP;
    }
  }

  return { reset, offer, pick, tick, drawHud, LIST, get owned() { return owned; } };
})();
