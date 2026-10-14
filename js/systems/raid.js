/* ============ raid.js — jefe de incursión (sólo en grupo, 2 o más) ============
 * En una partida en grupo normal (no PK), a los 5:00 y luego cada 5 minutos sale
 * un jefe gigante con mucha vida (más cuantos más seáis). Cada 8 s fija a uno de
 * vosotros ("¡Te ha fichado!") y va a por él: los demás tienen que pegarle mientras.
 * Si no lo tumbáis en 2:30, se va. Si cae: ticket ×10 y monedas para el grupo.
 * Lo decide todo el anfitrión; a los demás les llega con 'rdt' (a quién mira) y 'say'.
 */
G.Raid = (() => {
  const EVERY = 300, LIFE = 150, LOCK = 8;
  // Pokémon muy fuertes (no legendarios) que pueden salir.
  const POOL = [149, 248, 373, 376, 445, 635, 706, 784, 887, 998, 143, 289, 230, 131, 130, 448, 609, 612];
  let nextAt = EVERY, boss = null, lockT = 0, targetUid = null, life = 0;

  const can = () => G.Coop.active && !G.PvP.on && G.Modes.run === 'normal' && G.Coop.players().length >= 2;

  function reset() { nextAt = EVERY; boss = null; lockT = 0; targetUid = null; life = 0; }

  /** Anfitrión, cada fotograma. */
  function update(dt, time) {
    if (!G.Coop.isHost || !can() || G.Rift.inArena) return;
    if (boss) {
      if (boss.dead) { win(); return; }
      life -= dt;
      if (life <= 0) { escape(); return; }
      if ((lockT -= dt) <= 0) lockOn();
      return;
    }
    if (time >= nextAt) { nextAt += EVERY; spawn(time); }
  }

  function spawn(time) {
    const n = G.Coop.players().length;
    const ok = POOL.filter(d => G.DEX_BY[d] && G.SPRITE_META[d]);
    const dex = G.U.pick(ok);
    const slot = G.Enemies.BOSS_SLOTS[Math.min(G.Enemies.BOSS_SLOTS.length - 1, 1 + Math.floor(time / 300))];
    const def = G.Enemies.bossFor(dex, slot, 2.2 * n);
    def.raid = true; def.dmg = Math.round(def.dmg * 1.25);
    boss = G.Spawner.spawnBossNow(null, time, def);
    life = LIFE; lockT = 2;
    G.Spawner.say(G.I18n.f('¡Jefe de incursión: {x}! ¡Tumbadlo entre todos en 2:30!', G.T(boss.name)), 4);
  }

  function lockOn() {
    lockT = LOCK;
    const alive = G.Coop.players().filter(p => !p.dead);
    if (!alive.length || !boss) return;
    const t = G.U.pick(alive);
    targetUid = t.uid;
    boss.lockOn = t;
    G.Coop.broadcast(['rdt', targetUid]);
    G.Audio.sfx('error');
  }

  function win() {
    const pl = G.Game.player;
    pl.t10 += 1; pl.coins += 300;          // del equipo: llega a todos con el estado del grupo
    G.Spawner.say('¡Incursión superada! Ticket ×10 y 300 monedas para el grupo', 4);
    G.Audio.sfx('shinyGet');
    const st = G.DB.save && G.DB.save.stats;
    if (st) st.raids = (st.raids || 0) + 1;
    G.Coop.broadcast(['rdw']);
    clear();
  }
  function escape() {
    if (boss && !boss.dead) { boss.hp = 0; boss.dead = true; boss.fade = 0.01; boss.noLoot = true; }
    G.Spawner.say(G.I18n.f('{x} se ha marchado…', G.T(boss.name)), 3);
    clear();
  }
  function clear() { boss = null; targetUid = null; if (G.Coop.isHost) G.Coop.broadcast(['rdt', null]); }

  /** Invitados: lo que manda el anfitrión. */
  function onEvent(ev) {
    if (ev[0] === 'rdt') targetUid = ev[1];
    if (ev[0] === 'rdw') { const st = G.DB.save && G.DB.save.stats; if (st) st.raids = (st.raids || 0) + 1; G.Audio.sfx('shinyGet'); }
  }

  /** ¿Va a por este jugador? (para el aviso encima) */
  function targets(p) { return !!targetUid && p && p.uid === targetUid; }

  return { reset, update, onEvent, targets, get active() { return !!boss || !!targetUid; }, POOL };
})();
