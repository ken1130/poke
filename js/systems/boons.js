/* ============ boons.js — modo normal: bendición inicial e hitos (2026-10-15) ============
 *
 *   Bendición inicial  al empezar una partida normal eliges 1 de 3 al azar (de unas 11).
 *                      En grupo cada uno elige la suya (el grupo espera, como con las cartas).
 *   Hitos              a los 10, 20 y 30 minutos: aviso grande y premio.
 *                        10 min  un disco de movimientos
 *                        20 min  un objeto equipable + un ticket
 *                        30 min  un ticket ×10 + monedas
 *                      En grupo lo decide el anfitrión ('ms') y cada uno recibe lo suyo; lo que
 *                      va al suelo (tickets, monedas) lo suelta el anfitrión junto a cada uno.
 * Sólo en el modo normal (no en Aventura, retos ni PK).
 */
G.Boons = (() => {
  const $ = id => document.getElementById(id);

  /*
   * icon: de G.Icons · apply(pl): lo que hace · then: 'disc' | 'item' (se abre después de elegir)
   */
  const POOL = {
    disc:    { icon: 'star',   name: 'Disco de regalo',   desc: 'Abres ahora mismo un disco de movimientos (1-4 mejoras).', then: 'disc' },
    partner: { icon: 'bond',   name: 'Compañero desde el principio', desc: 'Un huevo que eclosiona enseguida: empiezas con un compañero.',
               apply: pl => { if (!pl.buddy) pl.egg = { from: -9999 }; } },
    wisdom:  { icon: 'book',   name: 'Aprendiz veloz',    desc: '+30% de experiencia toda la partida.', apply: pl => { pl.xpMul *= 1.3; } },
    level:   { icon: 'up',     name: 'Ventaja inicial',   desc: 'Empiezas en el nivel 3 (dos cartas ya).', apply: () => { G.Game.debugLevelUp(); G.Game.debugLevelUp(); } },
    item:    { icon: 'crown',  name: 'Objeto inicial',    desc: 'Un objeto equipable al azar.', then: 'item' },
    power:   { icon: 'fist',   name: 'Fuerza',            desc: '+20% de daño toda la partida.', apply: pl => { pl.atkMul *= 1.2; } },
    speed:   { icon: 'boot',   name: 'Pies ligeros',      desc: '+15% de velocidad toda la partida.', apply: pl => { pl.spdMul *= 1.15; } },
    rerolls: { icon: 'cards',  name: 'Indeciso',          desc: '+3 cambios de cartas de nivel.', apply: pl => { pl.rerollBonus = (pl.rerollBonus || 0) + 3; } },
    revive:  { icon: 'sprout', name: 'Semilla Revivir',   desc: 'Si caes, vuelves con la mitad de la vida (una vez).', apply: pl => { pl.reviveSeed = true; } },
    potions: { icon: 'berry',  name: 'Alquimista',        desc: 'Cada 2 minutos te bebes una poción buena al azar.', apply: pl => { pl.potionBoon = 120; } },
    vigor:   { icon: 'heart',  name: 'Robusto',           desc: '+40 de vida máxima.', apply: pl => { pl.addMaxHp(40); } }
  };

  let offered = false;               // ya se ofreció en esta partida
  let mile = 0;                      // hitos dados (anfitrión / solitario)
  const MILES = [600, 1200, 1800];

  function reset() { offered = false; mile = 0; }
  const normal = () => G.Modes.run === 'normal' && !G.PvP.on && !G.Rift.inArena;

  /** Cada fotograma de juego (todos): ofrecer la bendición; la poción del Alquimista. */
  function update(dt, pl) {
    if (!pl) return;
    if (!offered && normal() && !pl.dead && G.Game.state === 'playing') { offered = true; G.Game.offerBoon(); }
    if (pl.potionBoon && !pl.dead) {
      pl.potionBoon -= dt;
      if (pl.potionBoon <= 0) {
        pl.potionBoon = 120;
        const good = Object.keys(G.Loot.POTIONS).filter(k => k !== 'toxic' && k !== 'heavy');
        G.Loot.drink(pl, G.U.pick(good), true);
      }
    }
  }

  /** Anfitrión o solitario: los hitos de tiempo. */
  function tick(time, players) {
    if (!normal() || mile >= MILES.length || time < MILES[mile]) return;
    mile++;
    if (G.Coop.active) G.Coop.broadcast(['ms', mile]);
    milestone(mile);
    // Lo que va al suelo, junto a cada uno.
    for (const p of players) {
      if (p.dead) continue;
      if (mile === 2) G.Pickups.drop('ticket', p.x + 20, p.y - 10, 1);
      if (mile === 3) {
        G.Pickups.drop('ticket10', p.x + 24, p.y - 12, 1);
        for (let i = 0; i < 8; i++) G.Pickups.drop('coin', p.x + G.U.rand(-50, 50), p.y + G.U.rand(-36, 36), 5);
      }
    }
  }

  /** Cada uno: el aviso del hito y su premio personal. */
  function milestone(n) {
    const pl = G.Game.player;
    const TXT = ['', '¡10 minutos! Premio: un disco de movimientos', '¡20 minutos! Premio: un objeto y un ticket', '¡30 minutos! Premio: ticket ×10 y monedas'];
    G.Spawner.say(G.T(TXT[n] || ''), 4, true);
    G.Audio.sfx('legend');
    if (pl) {
      for (const col of ['#ffd23f', '#ff8ad8', '#7fe0ff']) G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, col, 18, 240);
      G.FX.ring(pl.x, pl.y, 8, 160, '#ffd23f', 0.8, 6);
      G.Camera.kick(0.4);
    }
    banner = { n, until: performance.now() + 4000 };
    if (!pl || pl.dead) return;
    if (n === 1) setTimeout(() => G.Game.offerBox(), 400);
    if (n === 2) setTimeout(() => G.Game.offerItem(G.Items.roll(), true), 400);
  }

  // ---------------- ventana de la bendición ----------------

  /** Enseña 3 bendiciones al azar; `done` al elegir. */
  function show(pl, done) {
    const ids = G.U.pickN(Object.keys(POOL), 3);
    const box = $('boon-cards');
    box.innerHTML = '';
    let chosen = false;
    ids.forEach((id, i) => {
      const b = POOL[id];
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div class="ico" style="background:#ffd23f22">${G.Icons.html(b.icon, 32)}</div>
        <div class="txt"><div class="nm">${b.name}</div><div class="ds">${b.desc}</div></div>
        <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => {
        if (chosen) return;
        chosen = true;
        G.UI.hide('scr-boon');
        G.Audio.sfx('legend');
        if (b.apply) b.apply(pl);
        G.FX.ring(pl.x, pl.y, 8, 120, '#ffd23f', 0.7, 5);
        G.Spawner.say(G.T(b.name) + '!', 2.4, true);
        done();
        if (b.then === 'disc') setTimeout(() => G.Game.offerBox(), 60);
        if (b.then === 'item') setTimeout(() => G.Game.offerItem(G.Items.roll(), true), 60);
      };
      box.appendChild(el);
    });
    G.UI.show('scr-boon');
  }
  /** Teclas 1-3 y elección automática del grupo. */
  function pick(i) { const c = document.querySelectorAll('#boon-cards .card')[i]; if (c) c.click(); }

  // ---------------- aviso del hito (HUD) ----------------
  let banner = null;
  /** Dibuja el cartel grande del hito unos segundos (hud.js). */
  function drawHud(ctx, w, h, F) {
    if (!banner) return;
    const left = (banner.until - performance.now()) / 1000;
    if (left <= 0) { banner = null; return; }
    const a = Math.min(1, left, (4 - left) * 4);
    const txt = G.I18n.f('¡{x} minutos!', banner.n * 10);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = F(800, 34);
    const y = h * 0.28;
    ctx.lineWidth = 7; ctx.strokeStyle = '#1a0e04'; ctx.strokeText(txt, w / 2, y);
    const g = ctx.createLinearGradient(0, y - 30, 0, y);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(1, '#ffb000');
    ctx.fillStyle = g; ctx.fillText(txt, w / 2, y);
    ctx.font = F(800, 14);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
    const sub = G.T('¡Hito superado!');
    ctx.strokeText(sub, w / 2, y + 22); ctx.fillStyle = '#ffe9a0'; ctx.fillText(sub, w / 2, y + 22);
    ctx.restore();
  }

  return { reset, update, tick, milestone, show, pick, drawHud, POOL };
})();
