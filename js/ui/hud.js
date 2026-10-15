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
      // Los huecos de pasivos no se tocan: funcionan siempre.
      const passive = pl.passiveSlot(i);
      if (m && !passive) G.Touch.addButton(x, y, S, S, () => { if (G.Game.state === 'playing' && pl.active !== i) { pl.setActive(i); G.Audio.sfx('click'); } }, GAP / 2 + 3);
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

  // ---------------- minimapa ----------------

  /*
   * Lo importante de alrededor (unos 40 m): cofres de movimientos y pociones (en el
   * borde si están más lejos, para saber hacia dónde ir), objetos, cofres y
   * altares/manantiales del mapa, jefes, la grieta y los compañeros.
   */
  const MM_R = 1300;                 // radio del mundo que se ve (unidades)
  let mmProps = [], mmT = 0;
  function drawMinimap(ctx, w, pl, touch) {
    const S = touch ? 96 : 124, x0 = w - S - 14, y0 = touch ? 62 : 48;
    const cx = x0 + S / 2, cy = y0 + S / 2, k = (S / 2 - 6) / MM_R;
    const now = performance.now() / 1000;
    // Los objetos del mapa se buscan sólo cada medio segundo (no cambian deprisa).
    if (now - mmT > 0.5) {
      mmT = now;
      mmProps = G.World.specialsNear(pl.x, pl.y, MM_R).filter(p => p.type !== 'trap' && !p.used)
        .concat(G.World.propsInCircle(pl.x, pl.y, MM_R).filter(p => p.type === 'chest'));
    }
    ctx.save();
    roundRect(ctx, x0, y0, S, S, 10);
    ctx.fillStyle = 'rgba(8,12,24,.78)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(200,215,255,.6)'; ctx.stroke();
    roundRect(ctx, x0, y0, S, S, 10); ctx.clip();
    const at = (x, y, edge) => {
      let dx = (x - pl.x) * k, dy = (y - pl.y) * k;
      const m = S / 2 - 6;
      if (Math.abs(dx) > m || Math.abs(dy) > m) {
        if (!edge) return null;
        const s = m / Math.max(Math.abs(dx), Math.abs(dy)); dx *= s; dy *= s;
      }
      return [cx + dx, cy + dy];
    };
    const dot = (x, y, col, r, edge, sq) => {
      const q = at(x, y, edge);
      if (!q) return;
      ctx.fillStyle = col;
      ctx.beginPath();
      if (sq) ctx.rect(q[0] - r, q[1] - r, r * 2, r * 2); else ctx.arc(q[0], q[1], r, 0, 6.2832);
      ctx.fill();
    };
    const PROP_COL = { altar: '#ff8ad8', spring: '#4fb4ff', bigchest: '#ffb000', chest: '#c47a2c' };
    for (const p of mmProps) dot(p.x, p.y, PROP_COL[p.type] || '#fff', p.type === 'chest' ? 1.8 : 2.6, false, true);
    const blink = Math.sin(now * 6) > 0;
    for (const p of G.Pickups.all()) {
      if ((p.kind === 'sbox' || p.kind === 'potion') && !G.Loot.visible(p)) continue;
      if (p.kind === 'sbox') dot(p.x, p.y, blink ? '#ffe14d' : '#ff9a3d', 4.2, true, true);
      else if (p.kind === 'potion') dot(p.x, p.y, '#ff7ad9', 3.2, true);
      else if (p.kind === 'item' || p.kind === 'token' || p.kind === 'ticket10') dot(p.x, p.y, '#ffd23f', 2.6, false);
    }
    for (const e of G.EnemyMgr.all()) if (e.boss && !e.dead) dot(e.x, e.y, '#ff4d5e', 4, true);
    const rift = G.Rift.rift;
    if (rift) dot(rift.x, rift.y, blink ? '#e2d0ff' : '#a06bff', 4, true);
    if (G.Coop.active) for (const o of G.Coop.players()) if (o !== pl) dot(o.x, o.y, o.dead ? '#ff5f6d' : '#5fe08a', 3, true);
    // Tú: flecha blanca hacia donde miras.
    const a = pl.moveAngle || 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
    ctx.lineTo(cx + Math.cos(a + 2.5) * 4.5, cy + Math.sin(a + 2.5) * 4.5);
    ctx.lineTo(cx + Math.cos(a - 2.5) * 4.5, cy + Math.sin(a - 2.5) * 4.5);
    ctx.closePath(); ctx.fill();
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
