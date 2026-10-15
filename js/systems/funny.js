/* ============ funny.js — cosas de risa (2026-10-15) ============
 * Para jugar con amigos y reírse un rato. Todo cuelga de dungeon.js (reset, tick,
 * update, dibujo y red ['dg', 'fn', ...]) para no tocar el bucle principal.
 *
 *   Magikarp   "Gran migración": de vez en cuando aparecen ~30 Magikarp que no hacen
 *              nada más que chapotear. Cada uno suelta una moneda.
 *   Snorlax    Un Snorlax dormido corta el paso: los enemigos rebotan contra él. Ronca.
 *              Si te quedas a su lado 3 s se despierta: aplastamiento que barre a los
 *              enemigos de alrededor, cura la mitad de la vida a todos, suelta monedas
 *              (y a veces un objeto) y se va (2026-10-15: antes sólo estaba ahí).
 *   Slowpoke   Los Slowpoke/Slowbro/Slowking reaccionan tarde: el número de daño sale
 *              2,5 s después, con un "…?" antes (ver enemy.js showHurt).
 *   Bocadillos Los enemigos a veces dicen tonterías ("Sólo pasaba por aquí…").
 *   Kecleon    Habla: da la bienvenida, grita "¡LADRÓN!" y llora si pierde.
 * Las pociones de risa (cabezón, al revés, disco) están en loot.js.
 *
 * Cooperativo: Magikarp son enemigos normales (se copian solos). Snorlax lo pone el
 * anfitrión y se manda con ['dg', 'fn', 'snor', x, y]; el despertar, con
 * ['dg', 'fn', 'wake'] (el anfitrión hace el daño y suelta el botín; cada uno se cura).
 * Los bocadillos son de cada uno.
 */
G.Funny = (() => {
  const T = () => G.Game.st.time;
  let karpT = 0, snorT = 0, quipT = 0;
  let snorlax = null;                 // { x, y, z }
  let quips = [];                     // { e, text, t }
  let karps = new Set();              // ids de los Magikarp de la migración

  function reset() { karpT = 420 + Math.random() * 120; snorT = 240 + Math.random() * 120; quipT = 20; snorlax = null; quips = []; karps = new Set(); }
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const allowed = () => !G.PvP.on && !G.Rift.inArena && !(G.Dungeon && G.Dungeon.inRoom) && G.Modes.run !== 'legend';
  const LINES = {
    es: ['Sólo pasaba por aquí…', 'Hoy no quería trabajar', '¡Se lo diré a mi hermano mayor!', 'Mi madre me llama para cenar', '¿Me dejas pasar?', '¡Es mi primer día!', 'Espera, ¡aún no estaba listo!', 'No en la cara, por favor', 'Qué Pokémon tan guapo…', '¿Has visto mis llaves?', 'Yo sólo quería un abrazo', '¡Esto no es lo que parece!'],
    en: ['Just passing by…', 'I didn’t want to work today', 'I’m telling my big brother!', 'Mom’s calling me for dinner', 'Can I get through?', 'It’s my first day!', 'Wait, I wasn’t ready!', 'Not the face, please', 'Such a handsome Pokémon…', 'Have you seen my keys?', 'I just wanted a hug', 'This isn’t what it looks like!'],
    zh: ['我只是路過的…', '今天不想上班', '我要去跟我哥告狀！', '我媽叫我回家吃飯了', '可以借過一下嗎？', '今天是我第一天上班！', '等等我還沒準備好！', '拜託不要打臉', '你的寶可夢好帥喔…', '你有看到我的鑰匙嗎？', '我只是想要一個抱抱', '事情不是你想的那樣！']
  };
  const lines = () => LINES[G.I18n.lang] || LINES.es;

  /** Anfitrión o solitario. */
  function tick(dt, players) {
    if (!allowed()) return;
    const live = players.filter(p => !p.dead);
    if (!live.length) return;
    const t = T();
    if (t >= karpT) { karpT = t + 420 + Math.random() * 180; migration(G.U.pick(live)); }
    if (t >= snorT && !snorlax) { snorT = t + 300 + Math.random() * 120; placeSnorlax(G.U.pick(live)); }
    wakeTick(dt, live);
  }

  // ---------------- Magikarp ----------------
  function migration(p) {
    const def = { dex: 129, name: 'Magikarp', hp: 14, spd: 26, dmg: 0, xp: 3, behavior: 'chase' };
    const sc = { hp: 1 + T() / 300, dmg: 0, spd: 1 };
    const base = Math.random() * 6.2832;
    let n = 0;
    for (let i = 0; i < 30; i++) {
      const a = base + G.U.rand(-0.9, 0.9), d = G.U.rand(260, 460);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!G.World.isFree(x, y, 10)) continue;
      const e = new G.Enemy(def, x, y, sc);
      e.dmg = 0; e.karp = true;
      G.EnemyMgr.add(e);
      karps.add(e.id); n++;
    }
    if (n) {
      G.Spawner.say(G.T('¡La gran migración de Magikarp! (no hacen nada… pero dan monedas)'), 3.5, true);
      if (G.Coop.active) G.Coop.say('¡La gran migración de Magikarp! (no hacen nada… pero dan monedas)', 3.5);
      G.Audio.sfx('surge');
    }
  }
  /** enemy.js die(): un Magikarp de la migración suelta una moneda. */
  function onDeath(e) { if (e.karp || karps.has(e.id)) { karps.delete(e.id); G.Pickups.drop('coin', e.x, e.y, 2); } }

  // ---------------- Snorlax ----------------
  function placeSnorlax(p) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.2832, d = G.U.rand(300, 520);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!G.World.isFree(x, y, 40)) continue;
      setSnorlax(x, y);
      if (G.Coop.active && G.Coop.isHost) G.Coop.broadcast(['dg', 'fn', 'snor', Math.round(x), Math.round(y)]);
      G.Spawner.say(G.T('Un Snorlax duerme en el camino… quédate a su lado para despertarlo'), 3.5, true);
      return;
    }
  }
  function setSnorlax(x, y) { snorlax = { x, y, z: 0, wake: 0, until: T() + 150, anim: new G.Sprites.Animator(143, 1.3, false) }; }

  const WAKE_R = 80, WAKE_TIME = 3;
  /** Anfitrión: alguien lleva un rato a su lado. */
  function wakeTick(dt, live) {
    if (!snorlax) return;
    const near = live.some(p => G.U.dist2(p.x, p.y, snorlax.x, snorlax.y) < WAKE_R * WAKE_R);
    snorlax.wake = near ? snorlax.wake + dt : Math.max(0, snorlax.wake - dt);
    if (snorlax.wake < WAKE_TIME) return;
    const { x, y } = snorlax;
    if (G.Coop.active) G.Coop.broadcast(['dg', 'fn', 'wake']);
    // Aplastamiento: barre a los normales de alrededor y hace mucho daño a los jefes.
    for (const e of G.EnemyMgr.queryCircle(x, y, 240)) {
      if (e.dead || e.remote) continue;
      e.hurt(e.boss ? e.maxHp * 0.15 : e.hp + 1, '#ffd23f');
    }
    for (let i = 0; i < 12; i++) G.Pickups.drop('coin', x + G.U.rand(-70, 70), y + G.U.rand(-40, 40), 5);
    if (Math.random() < 0.35) G.Pickups.drop('item', x + 30, y, G.Items.roll());
    wakeFx();
  }
  /** Todos: se despierta, aplasta, cura y se marcha. */
  function wakeFx() {
    if (!snorlax) return;
    const { x, y } = snorlax, pl = G.Game.player;
    G.FX.ring(x, y, 20, 240, '#ffd23f', 0.6, 6);
    G.FX.burst(x, y - 20, '#ffe9a0', 40, 260);
    G.FX.dmgText(x, y - 80, G.T('¡Snorlax se ha despertado!'), '#ffd23f', true);
    G.Camera.kick(1.2);
    G.Audio.sfx('boss');
    if (pl && !pl.dead) { pl.heal(pl.maxHp * 0.5); G.FX.ring(pl.x, pl.y, 6, 80, '#5fe08a', 0.6, 4); }
    G.Spawner.say(G.T('¡Snorlax se ha despertado! Aplastamiento y curación para todos'), 3, true);
    snorlax = null;
  }

  function onNet(ev) {
    if (ev[2] === 'snor') setSnorlax(ev[3], ev[4]);
    else if (ev[2] === 'wake') wakeFx();
  }

  /** Cada ordenador: Snorlax empuja a los enemigos; bocadillos. */
  function update(dt, pl) {
    if (snorlax) {
      if (T() > snorlax.until) snorlax = null;
      else {
        const R = 46;
        for (const e of G.EnemyMgr.queryCircle(snorlax.x, snorlax.y, R)) {
          if (e.dead || e.boss || e.remote) continue;
          const d = Math.max(1, G.U.dist(e.x, e.y, snorlax.x, snorlax.y));
          e.kx += (e.x - snorlax.x) / d * 260; e.ky += (e.y - snorlax.y) / d * 260;
          if (Math.random() < 0.05) G.FX.dmgText(e.x, e.y - e.bodyH - 4, G.T('¡Boing!'), '#ffd23f');
        }
        snorlax.anim.loop('Idle'); snorlax.anim.update(dt * 0.25);
        // Invitado: la barra la calcula con su propio Pokémon (el despertar lo decide el anfitrión).
        if (!authority() && pl && !pl.dead) snorlax.wake = G.U.dist2(pl.x, pl.y, snorlax.x, snorlax.y) < WAKE_R * WAKE_R ? Math.min(WAKE_TIME, snorlax.wake + dt) : Math.max(0, snorlax.wake - dt);
        if ((snorlax.z -= dt) <= 0) { snorlax.z = 1.6; if (pl && G.U.dist2(pl.x, pl.y, snorlax.x, snorlax.y) < 260 * 260) G.FX.dmgText(snorlax.x + 16, snorlax.y - 64, 'Zzz…', '#bfe8ff'); }
      }
    }
    // Poción disco: los de alrededor bailan (frenados) y salen luces de colores.
    if (pl && pl.disco && !pl.dead) {
      pl.discoT = (pl.discoT || 0) - dt;
      if (pl.discoT <= 0) {
        pl.discoT = 0.35;
        const col = `hsl(${Math.floor(Math.random() * 360)},90%,65%)`;
        G.FX.ring(pl.x, pl.y, 10, 280, col, 0.4, 3);
        for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 280)) {
          if (e.dead || e.boss) continue;
          e.applySlow(0.75, 0.5);
          if (Math.random() < 0.08) G.FX.dmgText(e.x, e.y - e.bodyH - 4, '♪', col);
        }
      }
    }
    // Bocadillos: de vez en cuando uno de los que se ven dice una tontería.
    quipT -= dt;
    if (quipT <= 0) {
      quipT = 9 + Math.random() * 9;
      const near = G.EnemyMgr.all().filter(e => !e.dead && !e.boss && G.Camera.sees(e.x, e.y, -40));
      if (near.length) quips.push({ e: G.U.pick(near), text: G.U.pick(lines()), t: 3 });
    }
    for (const q of quips) q.t -= dt;
    quips = quips.filter(q => q.t > 0 && !q.e.dead);
  }

  function bubble(ctx, x, y, text, col = '#1a1a2a') {
    ctx.save();
    ctx.font = '700 11px Pixelify,"Segoe UI",system-ui,sans-serif';
    const w = ctx.measureText(text).width + 14, h = 20;
    const bx = Math.round(x - w / 2), by = Math.round(y - h);
    // Bocadillo de cómic en pixel: caja blanca con borde oscuro y piquito.
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = col;
    ctx.fillRect(bx, by - 2, w, 2); ctx.fillRect(bx, by + h, w, 2); ctx.fillRect(bx - 2, by, 2, h); ctx.fillRect(bx + w, by, 2, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x) - 3, by + h, 6, 4);
    ctx.fillStyle = col; ctx.fillRect(Math.round(x) - 5, by + h + 2, 2, 2); ctx.fillRect(Math.round(x) + 3, by + h + 2, 2, 2); ctx.fillRect(Math.round(x) - 1, by + h + 4, 2, 2);
    ctx.fillStyle = col; ctx.textAlign = 'center';
    ctx.fillText(text, x, by + 14);
    ctx.restore();
  }

  function drawAir(ctx) {
    if (snorlax && G.Camera.sees(snorlax.x, snorlax.y, 80)) {
      G.Sprites.drawShadow(ctx, 143, snorlax.x, snorlax.y, 1.3);
      snorlax.anim.draw(ctx, snorlax.x, snorlax.y, {});
      // Qué hacer con él: bocadillo de ayuda y barra de "despertando".
      const pl = G.Game.player, w = snorlax.wake || 0;
      if (w > 0) {
        const bw = 60, bx = Math.round(snorlax.x - bw / 2), by = Math.round(snorlax.y - 96);
        ctx.fillStyle = '#1a1a2a'; ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(bx, by, Math.round(bw * Math.min(1, w / WAKE_TIME)), 6);
      } else if (pl && G.U.dist2(pl.x, pl.y, snorlax.x, snorlax.y) < 320 * 320) {
        bubble(ctx, snorlax.x, snorlax.y - 84, G.T('Quédate a mi lado para despertarme… Zzz'));
      }
    }
    for (const q of quips) bubble(ctx, q.e.x, q.e.y - q.e.bodyH - 10, G.T(q.text));
  }

  return { reset, tick, update, drawAir, onNet, onDeath, bubble, get snorlax() { return snorlax; } };
})();
