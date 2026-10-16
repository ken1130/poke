/* ============ rungoals.js — retos de la run (modo normal, 2026-10-16) ============
 *
 * Al empezar una partida normal salen 2 retos al azar de LIST (cada jugador los suyos, en
 * grupo también). Se ven en una cajita del HUD (tocar = qué son) y en la pausa. Al cumplir
 * uno: aviso y premio — un ticket del gacha (va directo a tu partida guardada) y +40 monedas
 * de la run (del grupo: en grupo se las pide al anfitrión con ['rgc', 40]).
 *
 * Todo se cuenta en cada ordenador con lo que ya pasa en el juego (vida, derrotados, pisos,
 * eventos de progress.js, compras de la tienda); no hace falta nada más por la red.
 */
G.RunGoals = (() => {
  /*
   * goal: lo que hay que llegar · time: el progreso son segundos (se enseña como m:ss)
   */
  const LIST = {
    nohit:  { name: 'Intocable', desc: 'Aguanta 3 minutos seguidos sin recibir daño.', goal: 180, time: true },
    mhouse: { name: 'Cazador de casas', desc: 'Supera 2 casas de monstruos.', goal: 2 },
    deep:   { name: 'Descenso rápido', desc: 'Llega a B3F antes del minuto 10.', goal: 1 },
    kills:  { name: 'Exterminador', desc: 'Derrota a 800 Pokémon en esta run.', goal: 800 },
    boss:   { name: 'Sin despeinarse', desc: 'Vence a un jefe del piso con más de la mitad de tu vida.', goal: 1 },
    shop:   { name: 'Buen cliente', desc: 'Compra 3 cosas en la tienda de Kecleon.', goal: 3 },
    danger: { name: 'Amante del riesgo', desc: 'Baja 2 veces por la ruta peligrosa.', goal: 2 },
    nopot:  { name: 'Sin pociones', desc: 'Llega al minuto 8 sin beber ninguna poción.', goal: 480, time: true }
  };
  const PER = 2, COINS = 40;

  let goals = [];          // [{ id, n, done, failed }]
  let rolled = false, streak = 0, hpPrev = null, houses = 0, risky = 0, potions = 0;

  function reset() { goals = []; rolled = false; streak = 0; hpPrev = null; houses = 0; risky = 0; potions = 0; }
  const normal = () => G.Modes.run === 'normal' && !G.PvP.on;

  /** Cada fotograma de juego (cada uno lo suyo). */
  function update(dt, time, pl) {
    if (!pl || !normal()) return;
    if (!rolled) { rolled = true; goals = G.U.pickN(Object.keys(LIST), PER).map(id => ({ id, n: 0, done: false, failed: false })); }
    if (!goals.length) return;
    // Sin recibir daño: si la vida baja, se empieza de cero (curarse no cuenta).
    if (!pl.dead && hpPrev != null && pl.hp < hpPrev - 0.01) streak = 0;
    else if (!pl.dead && !G.Dungeon.inRoom) streak += dt;
    if (pl.dead) streak = 0;
    hpPrev = pl.hp;
    for (const g of goals) {
      if (g.done || g.failed) continue;
      switch (g.id) {
        case 'nohit': g.n = Math.max(g.n, Math.min(LIST.nohit.goal, streak)); break;
        case 'mhouse': g.n = houses; break;
        case 'deep': if (G.Floors.floor >= 2 && time < 600) g.n = 1; else if (time >= 600) g.failed = true; break;
        case 'kills': g.n = Math.min(LIST.kills.goal, pl.kills || 0); break;
        case 'shop': g.n = Math.min(LIST.shop.goal, (G.Dungeon.rep && G.Dungeon.rep.buys) || 0); break;
        case 'danger': g.n = risky; break;
        case 'nopot': if (potions) g.failed = true; else g.n = Math.min(LIST.nopot.goal, time); break;
      }
      if (!g.failed && g.n >= LIST[g.id].goal) complete(g, pl);
    }
  }

  /** Lo que avisan otros módulos (progress.js, floors.js, loot.js). */
  function onEvent(kind, d) {
    if (!normal() || !goals.length) return;
    const pl = G.Game.player;
    if (kind === 'mhouse') houses++;
    else if (kind === 'route' && d && d.danger) risky++;
    else if (kind === 'potion') potions++;
    else if (kind === 'floorBoss') {
      const g = goals.find(o => o.id === 'boss' && !o.done);
      if (g && pl && !pl.dead && pl.hp > pl.maxHp * 0.5) { g.n = 1; complete(g, pl); }
    }
  }

  function complete(g, pl) {
    g.done = true;
    const def = LIST[g.id];
    // Ticket: a tu partida guardada (en grupo los tickets de la run son del grupo).
    const sv = G.DB.save;
    if (sv) { sv.tickets = sv.tickets || { t1: 0, t10: 0 }; sv.tickets.t1 += 1; G.DB.commit(); }
    if (!G.Coop.active || G.Coop.isHost) pl.coins = (pl.coins || 0) + COINS;
    else G.Coop.request(['rgc', COINS]);
    G.UI.toast(G.I18n.f('¡Reto cumplido: {x}! +1 ticket y +{x} monedas', G.T(def.name), COINS), 3600);
    G.Audio.sfx('shinyGet');
    G.FX.ring(pl.x, pl.y, 8, 120, '#7dffb0', 0.7, 5);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffd23f', 22, 200);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, G.T('¡Reto cumplido!'), '#7dffb0', true);
  }

  const prog = g => {
    const d = LIST[g.id];
    if (g.done) return '✔';
    if (g.failed) return '✘';
    return d.time ? G.U.mmss(g.n) + '/' + G.U.mmss(d.goal) : Math.floor(g.n) + '/' + d.goal;
  };

  /** HUD: cajita a la izquierda (debajo de la vida / del grupo). Devuelve su alto. */
  function drawHud(ctx, w, h, F, x, top, roundRect) {
    if (!goals.length || !normal()) return 0;
    const rows = goals.map(g => [G.T(LIST[g.id].name), prog(g), g.done ? '#7dffb0' : g.failed ? '#ff8a96' : '#e6eeff']);
    ctx.save();
    ctx.font = F(800, 12);
    let tw = ctx.measureText(G.T('Retos de la run')).width;
    ctx.font = F(800, 11);
    for (const [n, p] of rows) tw = Math.max(tw, ctx.measureText(n + '  ' + p).width + 12);
    const W = Math.min(230, tw + 16), H = 18 + rows.length * 15 + 3;
    roundRect(ctx, x, top, W, H, 7);
    ctx.fillStyle = 'rgba(8,12,24,.62)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(125,255,176,.45)'; ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = F(800, 12);
    ctx.fillStyle = '#7dffb0'; ctx.fillText(G.T('Retos de la run'), x + 7, top + 14);
    rows.forEach(([n, p, col], i) => {
      const y = top + 30 + i * 15;
      ctx.font = F(700, 11); ctx.fillStyle = col; ctx.textAlign = 'left';
      ctx.fillText(n, x + 7, y);
      ctx.font = F(800, 11); ctx.textAlign = 'right';
      ctx.fillText(p, x + W - 7, y);
    });
    ctx.restore();
    G.HUD.tapInfo(x, top, W, H, 'rungoals', () => ({ title: G.T('Retos de la run'), color: '#7dffb0',
      lines: goals.map(g => (g.done ? '✔ ' : g.failed ? '✘ ' : '• ') + G.T(LIST[g.id].name) + ': ' + G.T(LIST[g.id].desc) + ' (' + prog(g) + ')')
        .concat([G.I18n.f('Premio de cada uno: 1 ticket del gacha y {x} monedas de la run.', COINS)]) }));
    return H;
  }

  /** Pausa y resumen: [nombre, progreso, hecho]. */
  function summary() { return goals.map(g => ({ name: LIST[g.id].name, desc: LIST[g.id].desc, prog: prog(g), done: g.done, failed: g.failed })); }

  return { LIST, reset, update, onEvent, drawHud, summary, get goals() { return goals; },
           /** Pruebas: estos retos. */ debugSet(ids) { rolled = true; goals = ids.map(id => ({ id, n: 0, done: false, failed: false })); } };
})();
