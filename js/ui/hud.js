/* ============ hud.js — interfaz dentro del canvas ============
 * Se dibuja en coordenadas de PANTALLA (sin la transformación de cámara).
 */
G.HUD = (() => {
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bar(ctx, x, y, w, h, frac, col, bg = 'rgba(0,0,0,.55)') {
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    if (frac > 0) {
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w * G.U.clamp(frac, 0, 1), h);
      ctx.restore();
    }
  }

  function draw(ctx, w, h, pl, st) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    G.Touch.clearButtons();
    const touch = G.Touch.active;

    // ---------- oscuridad (reto semanal / torre): sólo ves lo de cerca ----------
    const dark = G.Modes.rule('dark');
    if (dark) {
      const sx = (pl.x - G.Camera.x) * G.Camera.scale + w / 2, sy = (pl.y - pl.bodyH * 0.5 - G.Camera.y) * G.Camera.scale + h / 2;
      const r0 = Math.min(w, h) * (0.42 - dark * 0.07);
      const gr = ctx.createRadialGradient(sx, sy, r0 * 0.55, sx, sy, r0);
      gr.addColorStop(0, 'rgba(4,6,14,0)'); gr.addColorStop(1, 'rgba(4,6,14,.94)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    }

    // ---------- barra de experiencia (borde superior) ----------
    const xpF = pl.xp / pl.xpNext;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, w, 7);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#4fd1ff'); g.addColorStop(1, '#a98bff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w * G.U.clamp(xpF, 0, 1), 7);

    // ---------- vida + nivel ----------
    const px = 16, py = 20;
    ctx.font = F(800, 13);
    ctx.fillStyle = '#eaf2ff';
    ctx.textAlign = 'left';
    ctx.fillText(pl.mon.name, px, py + 10);

    ctx.font = F(700, 11);
    ctx.fillStyle = '#ffcb3d';
    ctx.fillText('Lv. ' + pl.level, px, py + 26);

    bar(ctx, px + 48, py + 17, 168, 11, pl.hp / pl.maxHp, '#ff5f6d');
    ctx.font = F(700, 10);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(pl.hp) + ' / ' + Math.round(pl.maxHp), px + 48 + 84, py + 26);

    // buffs activos
    const COL = { atk: '#ff6b4d', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
    const LBL = { atk: 'ATK', spd: 'VEL', def: 'DEF', regen: 'REG' };
    let bx = px;
    ctx.textAlign = 'left';
    for (const k in pl.buffs) {
      const b = pl.buffs[k];
      if (b.n <= 0) continue;
      ctx.font = F(800, 9);
      const txt = LBL[k] + ' ×' + b.n;
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
      ctx.fillStyle = COL[k];
      ctx.fillText(txt, bx + 6, py + 45);
      bx += tw + 5;
    }
    // poción activa (loot.js): nombre y segundos que le quedan
    if (pl.potion) {
      const d = pl.potion.def;
      ctx.font = F(800, 9);
      const txt = G.T(d.name).replace(/^¡|[!！]$/g, '') + ' ' + Math.ceil(pl.potion.t) + 's';
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.fillStyle = d.color;
      ctx.fillText(txt, bx + 6, py + 45);
      bx += tw + 5;
    }

    // ---------- reloj / bioma / kills ----------
    ctx.textAlign = 'center';
    ctx.font = F(800, 26);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillText(G.U.mmss(st.time), w / 2, 42);
    ctx.font = F(600, 10);
    ctx.fillStyle = '#8fa3c4';
    ctx.fillText(G.World.biomeName().toUpperCase() + '  ·  ' + pl.kills + ' DERROTADOS  ·  ' + pl.coins + ' MONEDAS', w / 2, 58);

    // ---------- clima (arriba a la derecha) ----------
    const wx = G.Weather.current;
    if (wx) {
      ctx.font = F(800, 11);
      ctx.textAlign = 'left';
      const txt = wx.name.toUpperCase() + ' · ' + Math.ceil(wx.left) + 's';
      const tw = ctx.measureText(txt).width + 40;
      const x0 = w - tw - 16 - (touch ? 56 : 0), y0 = 14;
      roundRect(ctx, x0, y0, tw, 26, 9);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
      G.Icons.draw(ctx, wx.icon, x0 + 6, y0 + 3, 20);
      ctx.fillStyle = wx.color;
      ctx.fillText(txt, x0 + 32, y0 + 17);
    }

    // ---------- minimapa (arriba a la derecha) ----------
    if (!G.Modes.rule('dark')) drawMinimap(ctx, w, pl, touch);

    // ---------- barra del jefe ----------
    const boss = G.EnemyMgr.all().find(e => e.boss && !e.dead);
    if (boss) {
      const bw = Math.min(420, w - 80);
      bar(ctx, (w - bw) / 2, 70, bw, 12, boss.hp / boss.maxHp, '#ffcb3d');
      ctx.font = F(800, 10);
      ctx.fillStyle = '#20160a';
      ctx.fillText((boss.raid ? G.T('INCURSIÓN') + ' · ' : '') + boss.name.toUpperCase(), w / 2, 80);
    }

    // ---------- incursión: a quién va el jefe ----------
    if (G.Raid.active) {
      const cam = G.Camera, beat = 0.6 + Math.sin(performance.now() / 120) * 0.4;
      for (const p of G.Coop.players()) {
        if (!G.Raid.targets(p) || p.dead) continue;
        const sx = (p.x - cam.left()) * cam.scale, sy = (p.y - p.bodyH - cam.top()) * cam.scale - 26;
        if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
        ctx.save();
        ctx.globalAlpha = beat; ctx.textAlign = 'center';
        ctx.font = F(800, p === pl ? 14 : 11);
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        const t = G.T(p === pl ? '¡Te ha fichado! ¡Corre!' : '¡Fichado!');
        ctx.strokeText('🎯 ' + t, sx, sy); ctx.fillStyle = '#ff5f6d'; ctx.fillText('🎯 ' + t, sx, sy);
        ctx.restore();
      }
    }

    // ---------- aviso ----------
    // ---------- shinies fuera de pantalla: destello en el borde ----------
    const cam = G.Camera, pulse = 0.6 + Math.sin(performance.now() / 160) * 0.4;
    for (const e of G.Modes.on('shiny') ? [] : G.EnemyMgr.shinies()) {   // en modo shiny lo son todos
      const sx = (e.x - cam.left()) * cam.scale, sy = (e.y - cam.top()) * cam.scale;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 34;
      const ex = G.U.clamp(sx, M, w - M), ey = G.U.clamp(sy, M + 60, h - M - 70);
      const a = Math.atan2(sy - ey, sx - ex);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.translate(ex, ey);
      ctx.fillStyle = '#9ae6ff';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
      ctx.lineTo(Math.cos(a + 2.5) * 12, Math.sin(a + 2.5) * 12);
      ctx.lineTo(Math.cos(a - 2.5) * 12, Math.sin(a - 2.5) * 12);
      ctx.fill();
      ctx.globalAlpha = 1;
      G.Icons.draw(ctx, 'shiny', -12, -12, 24);
      ctx.restore();
    }

    // ---------- mensajes rápidos encima de cada jugador ----------
    if (G.Coop.active) {
      for (const p of [pl, ...G.Coop.puppets()]) {
        if (!p.chat) continue;
        G.Chat.draw(ctx, p, (p.x - cam.left()) * cam.scale, (p.y - cam.top()) * cam.scale, cam.scale, F);
      }
    }

    // ---------- grupo (no PK): compañeros caídos, para ir a levantarlos ----------
    // En pantalla: "¡Ayúdame!" latiendo encima. (Fuera de la pantalla ya está la flecha
    // de drawCoop, que parpadea en rojo con "¡X necesita ayuda! · N m".)
    if (G.Coop.active && (!G.PvP.on || G.PvP.teams)) {
      for (const p of G.Coop.puppets()) {
        if (!p.dead || (G.PvP.teams && p.team !== pl.team)) continue;
        const sx = (p.x - cam.left()) * cam.scale, sy = (p.y - cam.top()) * cam.scale;
        ctx.save();
        ctx.textAlign = 'center';
        if (sx > 0 && sx < w && sy > 0 && sy < h) {
          ctx.globalAlpha = pulse;
          ctx.font = F(800, 13);
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)';
          const ty = sy - (p.bodyH + 34) * cam.scale;
          ctx.strokeText(G.T('¡Ayúdame!'), sx, ty);
          ctx.fillStyle = '#ff5f6d'; ctx.fillText(G.T('¡Ayúdame!'), sx, ty);
        }
        ctx.restore();
      }
    }

    // Poder de altar activo.
    if (pl.power) {
      const pw = pl.power, txt = pw.def.name.toUpperCase() + ' ' + Math.ceil(pw.t) + 's';
      ctx.font = F(800, 9);
      ctx.textAlign = 'left';
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.fillStyle = pw.def.color;
      ctx.fillText(txt, bx + 6, py + 45);
      bx += tw + 5;
    }

    if (G.Coop.active) drawCoop(ctx, w, h, pl, px, py + (bx > px ? 56 : 40));

    // Grieta: flecha grande que late en el borde si no se ve, y si se ve, una
    // flecha que bota encima; en la arena, cuenta atrás.
    const rift = G.Rift.rift;
    if (rift) {
      const sx = (rift.x - cam.left()) * cam.scale, sy = (rift.y - 40 - cam.top()) * cam.scale;
      const now = performance.now() / 1000, beat = 0.5 + Math.sin(now * 7) * 0.5;
      const label = 'GRIETA · ' + Math.round(G.U.dist(pl.x, pl.y, rift.x, rift.y) / 32) + ' m · ' + Math.ceil(rift.ttl) + ' s';
      const off = sx < 0 || sx > w || sy < 0 || sy > h;
      ctx.save();
      if (off) {
        const M = 52, ex = G.U.clamp(sx, M, w - M), ey = G.U.clamp(sy, M + 70, h - M - 80);
        const a = Math.atan2(sy - ey, sx - ex), ca = Math.cos(a), sa = Math.sin(a);
        ctx.translate(ex, ey);
        // Halo que late.
        ctx.globalAlpha = 0.18 + beat * 0.22;
        ctx.fillStyle = '#b48aff';
        ctx.beginPath(); ctx.arc(0, 0, 30 + beat * 8, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        const tri = (k) => {
          ctx.beginPath();
          ctx.moveTo(ca * 40 * k, sa * 40 * k);
          ctx.lineTo(Math.cos(a + 2.45) * 20 * k, Math.sin(a + 2.45) * 20 * k);
          ctx.lineTo(Math.cos(a - 2.45) * 20 * k, Math.sin(a - 2.45) * 20 * k);
          ctx.closePath();
        };
        tri(1.12); ctx.fillStyle = '#1a0b33'; ctx.fill();
        tri(1); ctx.fillStyle = beat > 0.5 ? '#e2d0ff' : '#a06bff'; ctx.fill();
        ctx.font = F(800, 12);
        ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        const lx = -ca * 34, ly = -sa * 30 + 4;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = '#e2d0ff';
        ctx.fillText(label, lx, ly);
      } else {
        // Encima de la grieta: flecha hacia abajo que bota.
        const by = sy - 46 - Math.abs(Math.sin(now * 4)) * 10;
        ctx.translate(sx, by);
        ctx.beginPath(); ctx.moveTo(-15, -12); ctx.lineTo(15, -12); ctx.lineTo(0, 8); ctx.closePath();
        ctx.lineWidth = 4; ctx.strokeStyle = '#1a0b33'; ctx.stroke();
        ctx.fillStyle = beat > 0.5 ? '#e2d0ff' : '#a06bff'; ctx.fill();
        ctx.font = F(800, 11); ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        const l2 = 'GRIETA · ' + Math.ceil(rift.ttl) + ' s';
        ctx.strokeText(l2, 0, -18); ctx.fillStyle = '#e2d0ff'; ctx.fillText(l2, 0, -18);
      }
      ctx.restore();
    }
    // Tu cofre de movimientos: si no se ve, flecha dorada en el borde con los metros.
    const box = G.Pickups.all().find(p => p.kind === 'sbox' && G.Loot.visible(p));
    if (box) {
      const bsx = (box.x - cam.left()) * cam.scale, bsy = (box.y - 20 - cam.top()) * cam.scale;
      if (bsx < 0 || bsx > w || bsy < 0 || bsy > h) {
        const M = 46, ex = G.U.clamp(bsx, M, w - M), ey = G.U.clamp(bsy, M + 70, h - M - 90);
        const a = Math.atan2(bsy - ey, bsx - ex), ca = Math.cos(a), sa = Math.sin(a);
        const beat = 0.5 + Math.sin(performance.now() / 140) * 0.5;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.globalAlpha = 0.2 + beat * 0.2; ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(0, 0, 24 + beat * 6, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(ca * 32, sa * 32);
        ctx.lineTo(Math.cos(a + 2.45) * 16, Math.sin(a + 2.45) * 16);
        ctx.lineTo(Math.cos(a - 2.45) * 16, Math.sin(a - 2.45) * 16);
        ctx.closePath();
        ctx.fillStyle = beat > 0.5 ? '#fff3b0' : '#ffd23f'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#2a1a08'; ctx.stroke();
        const label = G.T('COFRE DE MOVIMIENTOS') + ' · ' + Math.round(G.U.dist(pl.x, pl.y, box.x, box.y) / 32) + ' m';
        ctx.font = F(800, 11);
        ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        const lx = -ca * 28, ly = -sa * 26 + 4;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(label, lx, ly);
        ctx.fillStyle = '#ffe14d'; ctx.fillText(label, lx, ly);
        ctx.restore();
      }
    }
    if (G.Rift.inArena) {
      ctx.textAlign = 'center';
      ctx.font = F(800, 12);
      ctx.fillStyle = '#d9c2ff';
      ctx.fillText('GRIETA · ' + G.U.mmss(G.Rift.timeLeft), w / 2, boss ? 98 : 76);
    }

    // Desafíos y aventura: piso de la torre, regla de la semana, objetivo de la fase.
    const ch = (G.Stages && G.Stages.hudLine()) || G.Challenges.hudLine();
    if (ch && !G.Rift.inArena) {
      ctx.textAlign = 'center';
      const y0 = boss ? 98 : 76;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.font = F(800, 13); ctx.strokeText(ch.title, w / 2, y0); ctx.fillStyle = ch.color || '#e2b0ff'; ctx.fillText(ch.title, w / 2, y0);
      if (ch.sub) { ctx.font = F(700, 10); ctx.strokeText(ch.sub, w / 2, y0 + 14); ctx.fillStyle = '#d6dcf0'; ctx.fillText(ch.sub, w / 2, y0 + 14); }
      if (ch.bar != null) {
        const bw = 180;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(w / 2 - bw / 2, y0 + (ch.sub ? 20 : 6), bw, 6);
        ctx.fillStyle = ch.color || '#e2b0ff'; ctx.fillRect(w / 2 - bw / 2, y0 + (ch.sub ? 20 : 6), bw * G.U.clamp(ch.bar, 0, 1), 6);
      }
    }

    // Eventos: cuenta atrás, flecha al Pokémon perdido / a la marca y a los duendes.
    G.Events.drawHud(ctx, w, h, pl, F);
    G.Stages.drawHud(ctx, w, h, pl, F);

    // Aviso propio al abrirse una grieta (no lo tapan los otros avisos).
    if (rift && rift.t < 4.5) {
      const a = Math.min(1, rift.t * 4, (4.5 - rift.t) * 2), pop = 1 + Math.max(0, 0.25 - rift.t) * 1.6;
      const y0 = h * 0.2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w / 2, y0); ctx.scale(pop, pop);
      ctx.font = F(800, 20);
      const t1 = '¡SE HA ABIERTO UNA GRIETA!', t2 = 'Sigue la flecha morada: dentro te espera un legendario';
      const bw = Math.min(w - 24, Math.max(ctx.measureText(t1).width, (ctx.font = F(700, 11), ctx.measureText(t2).width)) + 36);
      roundRect(ctx, -bw / 2, -26, bw, 52, 10);
      ctx.fillStyle = 'rgba(26,11,51,.88)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#b48aff'; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = F(800, 20); ctx.fillStyle = '#e2d0ff'; ctx.fillText(t1, 0, -2);
      ctx.font = F(700, 11); ctx.fillStyle = '#c9b0ff'; ctx.fillText(t2, 0, 16);
      ctx.restore();
    }

    const ban = G.Spawner.banner();
    if (ban) {
      const a = Math.min(1, ban.t * 1.6);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = F(800, 22);
      ctx.fillStyle = '#ffcb3d';
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
      ctx.strokeText(ban.text, w / 2, h * 0.3);
      ctx.fillText(ban.text, w / 2, h * 0.3);
      ctx.restore();
    }

    // ---------- ranura de movimientos ----------
    const S = 54, GAP = 9;
    const n = Math.max(1, pl.slots.length);
    const totalW = n * S + (n - 1) * GAP;
    let sx = (w - totalW) / 2;
    // Por encima de la barra de inicio del iPhone (allí los toques a veces no llegan).
    const sy = h - S - 18 - (touch ? Math.min(28, G.Touch.safeArea().bottom) : 0);
    const BOND = '#ff8ad8';
    const cdOf = m => m.kind === 'orbit' ? 0 : G.U.clamp(m.t / (m.cd * pl.cdMul), 0, 1);

    for (let i = 0; i < n; i++) {
      const g = pl.slots[i] || [];
      const m = g[0];
      const fused = g.length > 1;
      const on = i === pl.active;
      const x = sx + i * (S + GAP);
      const y = on ? sy - 6 : sy;
      // Tocar (o hacer clic en) un icono activa ese movimiento.
      // Tocar otro movimiento lo activa; tocar el activo o un pasivo (que funciona siempre)
      // enseña qué hace (otra vez: se cierra).
      const passive = pl.passiveSlot(i);
      if (m) G.Touch.addButton(x, y, S, S, () => {
        if (G.Game.state !== 'playing') return;
        G.Audio.sfx('click');
        if (passive || pl.active === i) { info = info && info.i === i ? null : { i, until: performance.now() + 5000 }; return; }
        pl.setActive(i); info = null;
      }, GAP / 2 + 3);
      const col = m ? G.U.TYPE_COLOR[m.type] : '#4a5468';

      // fondo
      roundRect(ctx, x, y, S, S, 12);
      ctx.fillStyle = on ? 'rgba(20,30,50,.95)' : 'rgba(10,16,28,.8)';
      ctx.fill();
      ctx.lineWidth = on ? 2.5 : fused || (m && m.evolved) ? 2 : 1.2;
      // Vínculo: borde rosa. Evolucionado: dorado.
      ctx.strokeStyle = fused ? BOND : m && m.evolved ? '#ffd23f' : on ? col : 'rgba(140,170,210,.22)';
      ctx.stroke();

      if (!m) continue;

      if (fused) {
        // Vínculo: los movimientos en una cuadrícula de 2×2, cada uno con su recarga.
        const C = 22, P = (S - C * 2) / 3;
        g.forEach((gm, k) => {
          const cx = x + P + (k % 2) * (C + P), cy = y + P + Math.floor(k / 2) * (C + P);
          G.Icons.draw(ctx, 'move:' + gm.id, cx, cy, C);
          const f = cdOf(gm);
          if (f > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx, cy, C, C * f); }
          if (gm.evolved) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, C - 1, C - 1); }
          // Destello al lanzarse.
          const fl = 1 - (performance.now() - (gm.castAt || 0)) / 180;
          if (fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (fl * 0.55).toFixed(2) + ')'; ctx.fillRect(cx, cy, C, C); }
        });
      } else {
        // recarga: se vacía de abajo a arriba
        const cdFrac = cdOf(m);
        if (cdFrac > 0) {
          ctx.save();
          roundRect(ctx, x, y, S, S, 12); ctx.clip();
          ctx.fillStyle = 'rgba(0,0,0,.6)';
          ctx.fillRect(x, y, S, S * cdFrac);
          ctx.restore();
        }

        // emblema del tipo + insignia de la familia
        G.Icons.draw(ctx, 'move:' + m.id, x + (S - 32) / 2, y + (S - 32) / 2 - 2, 32);

        // nivel del movimiento (puntitos)
        const dots = m.def.maxLvl;
        const dw = 4, dgap = 2;
        const tw = dots * dw + (dots - 1) * dgap;
        for (let d = 0; d < dots; d++) {
          ctx.fillStyle = d < m.lvl ? col : 'rgba(255,255,255,.18)';
          ctx.fillRect(x + (S - tw) / 2 + d * (dw + dgap), y + S - 9, dw, 3);
        }
      }

      // tecla (los pasivos, en vez de número: "PASIVO", siempre activos)
      ctx.font = F(800, 9);
      ctx.fillStyle = fused ? BOND : on ? col : 'rgba(180,200,230,.6)';
      ctx.textAlign = 'left';
      if (passive) {
        ctx.textAlign = 'center';
        ctx.font = F(800, 8);
        const lbl = G.T('PASIVO');
        const lw = ctx.measureText(lbl).width + 8;
        roundRect(ctx, x + (S - lw) / 2, y - 7, lw, 12, 5);
        ctx.fillStyle = '#5fe08a'; ctx.fill();
        ctx.fillStyle = '#0a1a10';
        ctx.fillText(lbl, x + S / 2, y + 2);
        ctx.textAlign = 'left';
      } else ctx.fillText(String(i + 1), x + 3, y + 10);

      // nombre encima del activo (con un vínculo: "Ascuas +2")
      if (on) {
        ctx.font = F(700, 10);
        ctx.textAlign = 'center';
        ctx.fillStyle = fused ? BOND : col;
        ctx.fillText(fused ? m.name + ' +' + (g.length - 1) : m.name, x + S / 2, y - 7);
      }
    }

    // ---------- qué hace el movimiento tocado ----------
    if (info && performance.now() < info.until && pl.slots[info.i]) drawMoveInfo(ctx, w, pl, pl.slots[info.i], sx + info.i * (S + GAP) + S / 2, sy - 24);
    else info = null;

    // ---------- vínculo guardado (aún no hay dos movimientos sueltos) ----------
    if (pl.bonds > 0) {
      const bx = sx + totalW + 12, by = sy + S / 2 - 12;
      G.Icons.draw(ctx, 'bond', bx, by, 24);
      if (pl.bonds > 1) {
        ctx.font = F(800, 10);
        ctx.textAlign = 'left';
        ctx.fillStyle = BOND;
        ctx.fillText('×' + pl.bonds, bx + 25, by + 20);
      }
    }

    // ---------- objeto equipado (a la izquierda de los movimientos) ----------
    {
      const ix = sx - S - 18, iy = sy;
      roundRect(ctx, ix, iy, S, S, 12);
      ctx.fillStyle = pl.item ? 'rgba(40,30,10,.9)' : 'rgba(10,16,28,.55)';
      ctx.fill();
      ctx.lineWidth = pl.item ? 2 : 1;
      ctx.strokeStyle = pl.item ? '#ffd23f' : 'rgba(140,170,210,.18)';
      ctx.stroke();
      if (pl.item) {
        G.Icons.draw(ctx, pl.item, ix + (S - 36) / 2, iy + (S - 36) / 2, 36);
        ctx.font = F(700, 9);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(G.Items.BY[pl.item].name, ix + S / 2, iy - 6);
      }
    }

    // ---------- PK: viendo a otro jugador tras caer ----------
    const spec = G.Game.spectating();
    if (spec) {
      const t1 = G.I18n.f('Observando a {x}', spec.tag), t2 = G.T(touch ? 'Toca «Cambiar» para ver a otro' : 'Tab / Espacio: ver a otro');
      ctx.save();
      ctx.font = F(800, 15);
      const bw = Math.min(w - 24, Math.max(ctx.measureText(t1).width, (ctx.font = F(700, 10), ctx.measureText(t2).width)) + 40 + (touch ? 84 : 0));
      const bx0 = w / 2 - bw / 2, by0 = h - 150;
      roundRect(ctx, bx0, by0, bw, 46, 10);
      ctx.fillStyle = 'rgba(10,16,28,.82)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = spec.tagColor || '#ffd23f'; ctx.stroke();
      const tx = touch ? bx0 + (bw - 84) / 2 : w / 2;
      ctx.textAlign = 'center';
      ctx.font = F(800, 15); ctx.fillStyle = '#f4f8ff'; ctx.fillText('👁 ' + t1, tx, by0 + 21);
      ctx.font = F(700, 10); ctx.fillStyle = 'rgba(180,200,230,.85)'; ctx.fillText(t2, tx, by0 + 37);
      if (touch) {
        const cbx = bx0 + bw - 80, cby = by0 + 7;
        roundRect(ctx, cbx, cby, 72, 32, 8);
        ctx.fillStyle = 'rgba(255,210,63,.9)'; ctx.fill();
        ctx.font = F(800, 13); ctx.fillStyle = '#1a1a1a'; ctx.fillText(G.T('Cambiar'), cbx + 36, cby + 21);
        G.Touch.addButton(cbx, cby, 72, 32, () => G.Game.nextSpec(), 6);
      }
      ctx.restore();
    }

    // ---------- botón de pausa (táctil) ----------
    if (touch) {
      const sa = G.Touch.safeArea();
      const bx = w - 52 - Math.min(44, sa.right), by = 12 + Math.min(20, sa.top), bs = 40;
      roundRect(ctx, bx, by, bs, bs, 10);
      ctx.fillStyle = 'rgba(10,16,28,.7)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,248,255,.8)'; ctx.stroke();
      ctx.fillStyle = '#f4f8ff';
      ctx.fillRect(bx + 13, by + 11, 5, 18); ctx.fillRect(bx + 22, by + 11, 5, 18);
      G.Touch.addButton(bx, by, bs, bs, () => G.Game.togglePause(), 8);
      // Mensajes rápidos (en grupo): botón 💬 a la izquierda de la pausa.
      if (G.Coop.active) {
        const cx = bx - bs - 8;
        roundRect(ctx, cx, by, bs, bs, 10);
        ctx.fillStyle = G.Chat.isOpen() ? 'rgba(255,210,63,.85)' : 'rgba(10,16,28,.7)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,248,255,.8)'; ctx.stroke();
        ctx.font = F(400, 20); ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.fillText('💬', cx + bs / 2, by + 27);
        G.Touch.addButton(cx, by, bs, bs, () => G.Chat.toggle(), 8);
      }
    }

    // pista de controles
    if (st.time < 14) {
      ctx.font = F(600, 10);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(180,200,230,.55)';
      ctx.fillText(touch ? 'Arrastra el dedo para moverte  ·  toca un ataque para cambiarlo'
                         : 'WASD moverse  ·  1-4 / Q / E o clic en un ataque para cambiarlo  ·  Esc pausa' + (G.Coop.active ? '  ·  T mensajes' : ''), w / 2, h - 4);
    }

    ctx.restore();
  }

  // ---------------- ficha de un movimiento ----------------

  let info = null;                   // { i: hueco tocado, until }
  /** Corta un texto en líneas de como mucho `maxW` px (en chino, por caracteres). */
  function wrap(ctx, text, maxW) {
    const out = [];
    // Chino: se puede cortar en cualquier carácter; si no, por palabras.
    const words = /[\u3000-\u9fff\uff00-\uffef]/.test(text) || !/\s/.test(text) ? [...text] : text.split(/(\s+)/);
    let line = '';
    for (const wd of words) {
      if (ctx.measureText(line + wd).width > maxW && line.trim()) { out.push(line.trim()); line = wd.trimStart(); }
      else line += wd;
    }
    if (line.trim()) out.push(line.trim());
    return out;
  }
  /** Cajita encima del hueco: nombre, nivel, qué hace, mejoras que ya tiene y la siguiente. */
  function drawMoveInfo(ctx, w, pl, group, cx, bottom) {
    const W = Math.min(300, w - 24), P = 10, LH = 14;
    const rows = [];                 // [texto, color, negrita]
    for (const m of group) {
      const passive = G.Moves.isPassive(m);
      rows.push([G.T(m.name) + '  Lv.' + m.lvl + '/' + m.def.maxLvl + (passive ? '  · ' + G.T('PASIVO') : ''), G.U.TYPE_COLOR[m.type], true]);
      rows.push([G.T(m.def.desc), '#dfe8ff']);
      for (let k = 0; k < m.lvl - 1 && m.def.ups[k]; k++) rows.push(['✓ ' + G.T(m.def.ups[k].t), '#9fe0b0']);
      if (m.evolved && G.Moves.EVO_MODS[m.kind]) rows.push(['★ ' + G.T(m.name) + ': ' + G.T(G.Moves.EVO_MODS[m.kind].t), '#ffd23f']);
      const next = G.Moves.nextUpText(m);
      if (next) rows.push(['→ ' + G.I18n.f('Siguiente nivel: {x}', G.T(next)), '#8fa3c4']);
    }
    const lines = [];
    for (const [t, col, bold] of rows) {
      ctx.font = F(bold ? 800 : 600, bold ? 12 : 11);
      for (const l of wrap(ctx, t, W - P * 2)) lines.push([l, col, bold]);
    }
    const H = P * 2 + lines.length * LH;
    const x0 = G.U.clamp(cx - W / 2, 12, w - W - 12), y0 = Math.max(70, bottom - H);
    ctx.save();
    roundRect(ctx, x0, y0, W, H, 10);
    ctx.fillStyle = 'rgba(8,12,24,.92)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(200,215,255,.55)'; ctx.stroke();
    ctx.textAlign = 'left';
    lines.forEach(([l, col, bold], k) => {
      ctx.font = F(bold ? 800 : 600, bold ? 12 : 11);
      ctx.fillStyle = col;
      ctx.fillText(l, x0 + P, y0 + P + 11 + k * LH);
    });
    ctx.restore();
  }

  // ---------------- minimapa ----------------

  /*
   * Lo importante de alrededor (unos 40 m): cofres de movimientos y pociones (en el
   * borde si están más lejos, para saber hacia dónde ir), objetos, cofres y
   * altares/manantiales del mapa, jefes, la grieta y los compañeros.
   */
  const MM_R = 1300;                 // radio del mundo que se ve (unidades)
  const MM_N = 48;                   // celdas del terreno por lado
  let mmProps = [], mmT = 0, mmTer = null, mmAt = null;
  /** Terreno de alrededor (suelo / pared / agua...) en una imagen pequeña; se rehace cada medio segundo. */
  function minimapTerrain(pl) {
    const cell = (MM_R * 2) / MM_N;
    const ox = Math.round(pl.x / cell) * cell - MM_R, oy = Math.round(pl.y / cell) * cell - MM_R;
    if (!mmTer) { mmTer = document.createElement('canvas'); mmTer.width = mmTer.height = MM_N; }
    const c = mmTer.getContext('2d'), B = G.Tiles.BIOMES[G.World.biome] || G.Tiles.BIOMES[0];
    const floor = B.floor[0], wall = B.wallTop ? B.wallTop[0] : '#222', liq = B.liq || '#3b7fc6';
    for (let j = 0; j < MM_N; j++) for (let i = 0; i < MM_N; i++) {
      const x = ox + (i + 0.5) * cell, y = oy + (j + 0.5) * cell;
      c.fillStyle = G.World.isWall(x, y) ? wall : G.World.isLiquid(x, y) ? liq : floor;
      c.fillRect(i, j, 1, 1);
    }
    mmAt = { ox, oy, cell };
  }

  /** Iconitos del minimapa (dibujados a mano, unos 10-14 px). */
  const MM_ICON = {
    sbox(ctx, x, y, on) {
      ctx.fillStyle = on ? 'rgba(255,225,77,.55)' : 'rgba(255,225,77,.25)';
      ctx.beginPath(); ctx.arc(x, y, 10, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#9a5a22'; ctx.fillRect(x - 6, y - 2, 12, 7);
      ctx.fillStyle = '#c47a2c'; ctx.fillRect(x - 7, y - 6, 14, 5);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 1.5, y - 4, 3, 5); ctx.fillRect(x - 7, y - 2, 14, 1);
      ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 1; ctx.strokeRect(x - 7, y - 6, 14, 11);
    },
    potion(ctx, x, y) {
      ctx.fillStyle = '#ff7ad9'; ctx.beginPath(); ctx.arc(x, y + 1.5, 4.5, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#2a0a20'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#e8eef8'; ctx.fillRect(x - 1.5, y - 5, 3, 3);
    },
    item(ctx, x, y) {
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5a3a00'; ctx.lineWidth = 1; ctx.stroke();
    },
    bigchest(ctx, x, y) {
      ctx.fillStyle = '#7a4a1a'; ctx.fillRect(x - 5, y - 4, 10, 8);
      ctx.fillStyle = '#c0c8d8'; ctx.fillRect(x - 1.5, y - 2, 3, 4);
      ctx.strokeStyle = '#1a0e04'; ctx.lineWidth = 1; ctx.strokeRect(x - 5, y - 4, 10, 8);
    },
    chest(ctx, x, y) { ctx.fillStyle = '#b07030'; ctx.fillRect(x - 2.5, y - 2, 5, 4); },
    altar(ctx, x, y) {
      ctx.fillStyle = '#ff8ad8'; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 4.5, y + 4); ctx.lineTo(x - 4.5, y + 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#3a0a2a'; ctx.lineWidth = 1; ctx.stroke();
    },
    spring(ctx, x, y) {
      ctx.fillStyle = '#4fb4ff'; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.quadraticCurveTo(x + 5, y + 1, x, y + 4); ctx.quadraticCurveTo(x - 5, y + 1, x, y - 5); ctx.fill();
      ctx.strokeStyle = '#0a2a4a'; ctx.lineWidth = 1; ctx.stroke();
    },
    rift(ctx, x, y, on) {
      ctx.strokeStyle = on ? '#e2d0ff' : '#a06bff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = '#2a0a4a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.2832); ctx.fill();
    },
    boss(ctx, x, y) {
      ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#3a0008'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2); ctx.fillRect(x - 2, y + 2, 4, 1);
    },
    mate(ctx, x, y, dead) {
      ctx.fillStyle = dead ? '#ff5f6d' : '#5fe08a'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  };

  /*
   * Minimapa: el terreno de alrededor (unos 40 m) con iconos de lo importante. Tu cofre
   * de movimientos, tus pociones, la grieta, los jefes y los compañeros salen en el
   * borde aunque estén más lejos (para saber hacia dónde ir). El recuadro es lo que ves
   * en pantalla. Debajo, la lista con distancias y direcciones (drawMinimapList).
   */
  function drawMinimap(ctx, w, pl, touch) {
    const S = touch ? 124 : 172, x0 = w - S - 14, y0 = touch ? 62 : 48;
    const cx = x0 + S / 2, cy = y0 + S / 2, k = (S / 2) / MM_R;
    const now = performance.now() / 1000;
    if (now - mmT > 0.5 || !mmAt) {
      mmT = now;
      mmProps = G.World.specialsNear(pl.x, pl.y, MM_R).filter(p => p.type !== 'trap' && !p.used)
        .concat(G.World.propsInCircle(pl.x, pl.y, MM_R).filter(p => p.type === 'chest'));
      minimapTerrain(pl);
    }
    ctx.save();
    roundRect(ctx, x0 - 3, y0 - 3, S + 6, S + 6, 12);
    ctx.fillStyle = 'rgba(8,12,24,.85)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(220,230,255,.75)'; ctx.stroke();
    roundRect(ctx, x0, y0, S, S, 9); ctx.clip();
    // terreno (algo oscurecido para que resalten los iconos)
    const scale = mmAt.cell * k;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(mmTer, cx + (mmAt.ox - pl.x) * k, cy + (mmAt.oy - pl.y) * k, MM_N * scale, MM_N * scale);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x0, y0, S, S);
    // lo que se ve en pantalla
    const cam = G.Camera;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(cx + (cam.left() - pl.x) * k, cy + (cam.top() - pl.y) * k, cam.w * k, cam.h * k);
    const at = (x, y, edge) => {
      let dx = (x - pl.x) * k, dy = (y - pl.y) * k;
      const m = S / 2 - 8;
      if (Math.abs(dx) > m || Math.abs(dy) > m) {
        if (!edge) return null;
        const s = m / Math.max(Math.abs(dx), Math.abs(dy)); dx *= s; dy *= s;
      }
      return [cx + dx, cy + dy];
    };
    const icon = (name, x, y, edge, arg) => { const q = at(x, y, edge); if (q) MM_ICON[name](ctx, q[0], q[1], arg); };
    const blink = Math.sin(now * 6) > 0;
    for (const p of mmProps) icon(MM_ICON[p.type] ? p.type : 'chest', p.x, p.y, false);
    for (const p of G.Pickups.all()) {
      if ((p.kind === 'sbox' || p.kind === 'potion') && !G.Loot.visible(p)) continue;
      if (p.kind === 'sbox') icon('sbox', p.x, p.y, true, blink);
      else if (p.kind === 'potion') icon('potion', p.x, p.y, true);
      else if (p.kind === 'item' || p.kind === 'token' || p.kind === 'ticket10') icon('item', p.x, p.y, false);
    }
    const rift = G.Rift.rift;
    if (rift) icon('rift', rift.x, rift.y, true, blink);
    for (const e of G.EnemyMgr.all()) if (e.boss && !e.dead) icon('boss', e.x, e.y, true);
    if (G.Coop.active) for (const o of G.Coop.players()) if (o !== pl) icon('mate', o.x, o.y, true, o.dead);
    // Tú: flecha blanca hacia donde miras.
    const a = pl.moveAngle || 0;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7);
    ctx.lineTo(cx + Math.cos(a + 2.5) * 5.5, cy + Math.sin(a + 2.5) * 5.5);
    ctx.lineTo(cx + Math.cos(a - 2.5) * 5.5, cy + Math.sin(a - 2.5) * 5.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    drawMinimapList(ctx, w, pl, x0 + S, y0 + S + 8);
  }

  /**
   * Debajo del minimapa: lo más cercano de cada cosa importante, con su distancia y una
   * flecha hacia dónde está (tu cofre de movimientos, tus pociones, objetos, cofres con
   * candado, altares, manantiales, la grieta y los jefes).
   */
  const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  function drawMinimapList(ctx, w, pl, right, top) {
    const rows = [];
    const near = (list, fn) => {
      let best = null, bd = Infinity;
      for (const o of list) { if (!fn(o)) continue; const d = G.U.dist2(o.x, o.y, pl.x, pl.y); if (d < bd) { bd = d; best = o; } }
      return best;
    };
    const add = (o, name, col, ic) => { if (o) rows.push({ o, name, col, ic, d: G.U.dist(o.x, o.y, pl.x, pl.y) }); };
    const pk = G.Pickups.all();
    add(near(pk, p => p.kind === 'sbox' && G.Loot.visible(p)), 'COFRE DE MOVIMIENTOS', '#ffe14d', 'sbox');
    add(near(pk, p => p.kind === 'potion' && G.Loot.visible(p)), 'Poción', '#ff7ad9', 'potion');
    add(near(pk, p => p.kind === 'item'), 'Objeto', '#ffd23f', 'item');
    add(near(mmProps, p => p.type === 'bigchest' && !p.used), 'Cofre con candado', '#ffb000', 'bigchest');
    add(near(mmProps, p => p.type === 'altar' && !p.used), 'Altar', '#ff8ad8', 'altar');
    add(near(mmProps, p => p.type === 'spring' && !p.used), 'Manantial', '#4fb4ff', 'spring');
    if (G.Rift.rift) add(G.Rift.rift, 'Grieta', '#c9a6ff', 'rift');
    add(near(G.EnemyMgr.all(), e => e.boss && !e.dead), 'Jefe', '#ff5f6d', 'boss');
    if (!rows.length) return;
    ctx.save();
    ctx.font = F(800, 10);
    ctx.textAlign = 'right';
    rows.slice(0, 6).forEach((r, k) => {
      const a = Math.atan2(r.o.y - pl.y, r.o.x - pl.x);
      const arrow = ARROWS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
      const txt = G.T(r.name) + ' ' + Math.round(r.d / 32) + 'm ' + arrow;
      const tw = ctx.measureText(txt).width + 26, y = top + k * 19;
      roundRect(ctx, right - tw, y, tw, 17, 6);
      ctx.fillStyle = 'rgba(8,12,24,.8)'; ctx.fill();
      ctx.save(); MM_ICON[r.ic](ctx, right - tw + 9, y + 8.5, false); ctx.restore();
      ctx.font = F(800, 10);
      ctx.fillStyle = r.col;
      ctx.fillText(txt, right - 5, y + 12);
    });
    ctx.restore();
  }

  // ---------------- cooperativo ----------------

  /**
   * - Vida de cada compañero debajo de la tuya.
   * - Flecha en el borde de la pantalla hacia los que no se ven, con su nombre
   *   y a cuántos metros están (roja y parpadeando si está caído).
   * - Si has caído tú: aviso y barra de "te están levantando".
   */
  function drawCoop(ctx, w, h, pl, px, top) {
    const cam = G.Camera;
    const t = performance.now() / 1000;
    let y = top;
    ctx.textAlign = 'left';
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      ctx.font = F(800, 10);
      ctx.fillStyle = m.color;
      ctx.fillText(m.name, px, y + 9);
      const lx = px + 78;
      bar(ctx, lx, y + 1, 110, 8, o.dead ? 0 : o.hp / o.maxHp, o.dead ? '#ff5f6d' : '#5fe08a');
      if (o.dead) {
        ctx.font = F(800, 9);
        ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff8a96' : '#ffd0d5';
        ctx.fillText('CAÍDO', lx + 116, y + 9);
      }
      y += 15;
    }

    // Flechas hacia los compañeros fuera de la vista.
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      const sx = (o.x - cam.left()) * cam.scale, sy = (o.y - o.bodyH * 0.5 - cam.top()) * cam.scale;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 42;
      const ex = G.U.clamp(sx, M, w - M), ey = G.U.clamp(sy, M + 70, h - M - 80);
      const a = Math.atan2(sy - ey, sx - ex);
      const metres = Math.round(G.U.dist(pl.x, pl.y, o.x, o.y) / 32);
      const col = o.dead ? (Math.sin(t * 8) > 0 ? '#ff5f6d' : '#ffd0d5') : m.color;
      ctx.save();
      ctx.translate(ex, ey);
      // Flecha
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, 6.2832); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.lineTo(Math.cos(a + 2.4) * 14, Math.sin(a + 2.4) * 14);
      ctx.lineTo(Math.cos(a - 2.4) * 14, Math.sin(a - 2.4) * 14);
      ctx.closePath(); ctx.fill();
      // Inicial del compañero dentro del círculo
      ctx.font = F(800, 14);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(m.name.charAt(0).toUpperCase(), 0, 5);
      // Nombre y distancia: al lado contrario de la flecha, para que no se salga
      const lx = -Math.cos(a) * 30, ly = -Math.sin(a) * 26 + 4;
      ctx.font = F(800, 12);
      const label = (o.dead ? '¡' + m.name + ' necesita ayuda! ' : m.name + ' ') + '· ' + metres + ' m';
      ctx.textAlign = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = col;
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }

    // Tú, caído.
    if (pl.dead) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = F(800, 20);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      const mates = G.Coop.puppets().filter(p => !p.dead && (!G.PvP.on || (G.PvP.teams && p.team === pl.team)));
      const msg = G.PvP.on && !G.PvP.teams ? 'Has caído: estás fuera del PK'
        : !mates.length ? (G.PvP.on ? 'Tu equipo ha caído…' : 'Habéis caído todos…') : 'Has caído: un compañero puede levantarte';
      ctx.strokeText(msg, w / 2, h * 0.62);
      ctx.fillStyle = '#ffb0b8';
      ctx.fillText(msg, w / 2, h * 0.62);
      const f = (pl.reviveT || 0) / G.Player.REVIVE_TIME;
      if (f > 0) bar(ctx, w / 2 - 110, h * 0.62 + 12, 220, 10, f, '#5fe08a');
      ctx.restore();
    }
  }

  return { draw, roundRect, bar };
})();
