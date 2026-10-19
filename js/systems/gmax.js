/* ============ gmax.js — Dinamax / Gigamax (2026-10-19, hoja V3.1) ============
 * SpriteCollab no tiene hojas Gigamax, así que es un poder que vale para CUALQUIER Pokémon:
 * se carga derrotando enemigos (CHARGE_KILLS; la segunda vez, ×1,5) y se usa con G o el botón
 * «Gigamax» (máximo USES por run). Durante DUR s: tamaño ×SIZE, ataque ×ATK, vida máxima ×HP
 * (y te cura lo que sube), con un aura de nubes rojas de píxeles. Al acabar se encoge y todo
 * vuelve (la vida máxima extra se quita). No en PK, ni en la zona de fiesta.
 * El tamaño va aparte de las pociones (sizeK) y del Tanque 64 (artSize): se multiplican.
 * Grupo: myState [24] = 1 mientras dura (los demás ven el aura); el tamaño ya va en [17].
 */
G.Gmax = (() => {
  const CHARGE_KILLS = 150, USES = 2, DUR = 18, SIZE = 1.8, ATK = 1.5, HP = 1.5;

  const allowed = pl => !!pl && !G.PvP.on && G.Modes.run !== 'plaza' && G.Modes.run !== 'training';
  /** Al empezar la run. */
  function begin(pl) { G.MaxMoves.reset(); if (pl) { pl.gmaxUses = 0; pl.gmaxK0 = pl.kills || 0; pl.gmaxT = 0; pl.gmaxK = 1; } }
  const need = pl => Math.round(CHARGE_KILLS * (pl.gmaxUses ? 1.5 : 1));
  /** 0..1 de la carga (1 = listo). */
  function charge(pl) {
    if (!allowed(pl) || (pl.gmaxUses || 0) >= USES || pl.gmaxT > 0) return 0;
    return G.U.clamp(((pl.kills || 0) - (pl.gmaxK0 || 0)) / need(pl), 0, 1);
  }
  const ready = pl => charge(pl) >= 1 && !pl.dead && !pl.evoAnim;

  function activate(pl) {
    pl = pl || G.Game.player;
    if (!pl || !ready(pl)) return false;
    pl.gmaxUses = (pl.gmaxUses || 0) + 1;
    pl.gmaxT = DUR;
    pl.gmaxK = SIZE; pl.r *= SIZE; pl.bodyH *= SIZE;
    pl.atkMul *= ATK;
    pl.gmaxHp = pl.maxHp * (HP - 1);
    pl.maxHp += pl.gmaxHp; pl.hp = Math.min(pl.maxHp, pl.hp + pl.gmaxHp);
    pl.invuln = Math.max(pl.invuln || 0, 1);
    G.Game.flash('#ff5f6d', 0.5);
    G.Camera.kick(0.6);
    G.FX.ring(pl.x, pl.y, 10, 160, '#ff3a4a', 0.7, 6);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ff6a5a', 40, 260);
    G.Audio.sfx('legend');
    G.Spawner.say(G.I18n.f('¡{x} se ha gigamaxizado!', G.T(pl.mon.name)), 2.8, true);
    return true;
  }
  function end(pl) {
    if (!pl || !(pl.gmaxT > 0 || (pl.gmaxK || 1) !== 1)) return;
    pl.gmaxT = 0;
    const k = pl.gmaxK || 1;
    pl.r /= k; pl.bodyH /= k; pl.gmaxK = 1;
    pl.atkMul /= ATK;
    pl.maxHp -= pl.gmaxHp || 0; pl.hp = Math.min(pl.maxHp, pl.hp); pl.gmaxHp = 0;
    pl.gmaxK0 = pl.kills || 0;                          // la siguiente carga empieza ahora
    G.FX.ring(pl.x, pl.y, 120, 10, '#ff8a95', 0.5, 4);   // se encoge
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffb0b8', 18, 160);
    G.Audio.sfx('back');
  }
  /** Cada fotograma (tu Pokémon). */
  function update(dt, pl) {
    G.MaxMoves.update(dt);
    if (!pl) return;
    if (pl.gmaxT > 0) {
      pl.gmaxT -= dt;
      if (pl.dead || pl.gmaxT <= 0 || !allowed(pl)) end(pl);
      else if (Math.random() < dt * 14) G.FX.px(pl.x + G.U.rand(-pl.r * 1.4, pl.r * 1.4), pl.y - G.U.rand(0, pl.bodyH), Math.random() < 0.5 ? '#ff3a4a' : '#ff9a8a', { vy: -50, life: 0.5 });
    }
    if (G.Input.tap('keyg') && !G.UI.isOpen('scr-pause')) activate(pl);
  }
  /** Para myState [24]. */
  const code = pl => (pl && pl.gmaxT > 0 ? 1 : 0);

  /** Aura de nubes rojas de píxeles bajo y alrededor del Pokémon (el tuyo y los de los demás). */
  function drawAura(ctx, p) {
    const on = p.remote ? !!(p.net && p.net.gm) : p.gmaxT > 0;
    if (!on) return;
    const t = performance.now() / 1000, R = Math.max(18, p.r * 1.5);
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * 6.2832 + t * 0.9, wob = Math.sin(t * 3 + i) * 3;
      const x = p.x + Math.cos(a) * (R + wob), y = p.y + Math.sin(a) * (R * 0.42 + wob * 0.4);
      const s = 6 + (i % 3) * 2;
      ctx.fillStyle = i % 2 ? 'rgba(200,30,50,.55)' : 'rgba(255,90,80,.45)';
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      ctx.fillStyle = 'rgba(255,200,190,.35)';
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), 2, 2);
    }
    // Nube sobre la cabeza.
    const hy = p.y - (p.bodyH || 30) - 10;
    for (let i = 0; i < 7; i++) {
      const x = p.x + (i - 3) * 7 + Math.sin(t * 2 + i) * 2, y = hy + Math.sin(t * 2.5 + i * 1.7) * 3;
      ctx.fillStyle = i % 2 ? 'rgba(220,40,60,.5)' : 'rgba(255,120,100,.45)';
      ctx.fillRect(Math.round(x - 4), Math.round(y - 4), 8, 8);
    }
    ctx.restore();
  }

  /** HUD: la carga (barra) y, lista, el botón (G). */
  function drawHud(ctx, w, h, pl, F) {
    if (!pl || pl.remote || !allowed(pl) || (pl.gmaxUses || 0) >= USES && !(pl.gmaxT > 0)) return;
    const touch = G.Touch.active, S = touch ? 58 : 44;
    let bx = w - S - 16 - G.HUD.SR - (touch ? S + 14 : 0), by = h - S - 18 - G.HUD.SB - (touch ? 0 : 118);
    if (bx < G.HUD.barRight + 10) by -= S + 34;
    const c = pl.gmaxT > 0 ? pl.gmaxT / DUR : charge(pl), on = pl.gmaxT > 0, rdy = ready(pl);
    ctx.save();
    ctx.globalAlpha = rdy || on ? 0.95 : 0.6;
    ctx.beginPath(); ctx.arc(bx + S / 2, by + S / 2, S / 2, 0, 6.2832);
    ctx.fillStyle = '#2a1018'; ctx.fill();
    // Anillo de carga (o lo que queda).
    ctx.beginPath(); ctx.arc(bx + S / 2, by + S / 2, S / 2 - 3, -Math.PI / 2, -Math.PI / 2 + c * 6.2832);
    ctx.lineWidth = 5; ctx.strokeStyle = on ? '#ff8a95' : rdy && Math.sin(performance.now() / 120) > 0 ? '#ffd23f' : '#ff3a4a'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#0f0c16';
    ctx.beginPath(); ctx.arc(bx + S / 2, by + S / 2, S / 2, 0, 6.2832); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe0e4'; ctx.font = F(800, touch ? 11 : 10);
    ctx.fillText(on ? Math.ceil(pl.gmaxT) + 's' : G.T('Gigamax'), bx + S / 2, by + S / 2 + 2);
    ctx.font = F(700, 9);
    if (!touch) ctx.fillText(rdy ? '[G]' : Math.round(c * 100) + '%', bx + S / 2, by + S / 2 + 13);
    else if (!rdy && !on) ctx.fillText(Math.round(c * 100) + '%', bx + S / 2, by + S / 2 + 13);
    ctx.restore();
    if (rdy) G.Touch.addButton(bx, by, S, S, () => activate(pl), 8);
  }

  return { begin, update, activate, end, charge, ready, code, drawAura, drawHud, DUR, SIZE, USES };
})();
