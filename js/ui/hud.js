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

  /** Color de tipo aclarado (mitad hacia el blanco) para que se lea sobre fondo oscuro. */
  function lighten(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16), c = k => Math.round(((n >> k) & 255) * 0.45 + 255 * 0.55);
    return `rgb(${c(16)},${c(8)},${c(0)})`;
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

    // Monedas de esta run (2026-10-15): bien visibles; tocando, para qué sirven.
    {
      const cx0 = px + 48 + 168 + 8, cy0 = py + 13;
      ctx.font = F(800, 12);
      const txt = String(Math.floor(pl.coins || 0));
      const tw = ctx.measureText(txt).width + 30;
      roundRect(ctx, cx0, cy0, tw, 19, 9);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
      G.Icons.draw(ctx, 'coin', cx0 + 4, cy0 + 2, 15);
      ctx.textAlign = 'left'; ctx.fillStyle = '#ffe14d';
      ctx.fillText(txt, cx0 + 22, cy0 + 14);
      tapInfo(cx0, cy0, tw, 19, 'coins', () => ({ title: G.I18n.f('Monedas de esta run: {x}', Math.floor(pl.coins || 0)), color: '#ffd23f',
        lines: [G.T('Se gastan en la tienda de Kecleon (pociones, objetos, mejoras...) y en su ruleta.'),
                G.T('Lo que no gastes se suma a tus Pokémonedas al acabar la run.')] }));
    }

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
      tapInfo(bx, py + 34, tw, 15, 'buff:' + k, () => ({ title: G.T(BUFF_NAME[k]) + ' ×' + b.n, color: COL[k],
        lines: [G.I18n.f('+{x}% mientras dure (quedan {x} s)', Math.round(b.n * b.amount * 100), Math.ceil(b.t))] }));
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
      tapInfo(bx, py + 34, tw, 15, 'potion', () => ({ title: G.T(d.name), color: d.color, lines: [G.T(d.desc)] }));
      bx += tw + 5;
    }
    // huevo Pokémon (companion.js): cuánto le falta para eclosionar
    const egg = G.Companion.eggProgress(pl);
    if (egg != null) {
      ctx.font = F(800, 9);
      const done = Math.round(egg * G.Companion.KILLS);
      const txt = G.T('Huevo') + ' ' + done + '/' + G.Companion.KILLS;
      const tw = ctx.measureText(txt).width + 50;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.fillStyle = '#fff3c8';
      ctx.fillText(txt, bx + 6, py + 45);
      bar(ctx, bx + tw - 40, py + 39, 34, 5, egg, '#ffd23f', 'rgba(255,255,255,.18)');
      tapInfo(bx, py + 34, tw, 15, 'egg', () => ({ title: G.T('Huevo Pokémon'), color: '#fff3c8',
        lines: [G.I18n.f('Eclosiona tras derrotar a {x} más.', G.Companion.KILLS - done), G.T('Nace un compañero que lucha contigo, sube de nivel y evoluciona.')] }));
      bx += tw + 5;
    }
    // compañero: nivel (toca para ver qué hace)
    if (pl.buddy && G.DEX_BY[pl.buddy.dex]) {
      ctx.font = F(800, 9);
      const bd = pl.buddy, txt = G.T(G.DEX_BY[bd.dex].name) + ' Lv.' + (bd.lvl || 1);
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.fillStyle = '#9fe0b0';
      ctx.fillText(txt, bx + 6, py + 45);
      tapInfo(bx, py + 34, tw, 15, 'buddy', () => ({ title: G.T('Compañero') + ': ' + G.T(G.DEX_BY[bd.dex].name) + (bd.shiny ? ' ✨' : ''), color: '#9fe0b0',
        lines: [G.T('Dispara solo al enemigo más cercano.'), G.T('Sube 1 nivel cada 25 derrotados (+8% de daño) y evoluciona en Nv. 10 y 20.')] }));
      bx += tw + 5;
    }

    // bendición o maldición de la estatua (dungeon.js), para todo el grupo
    const bl = G.Dungeon.blessingInfo();
    if (bl) {
      ctx.font = F(800, 9);
      const txt = G.T(bl.name) + ' ' + Math.ceil(bl.left) + 's';
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.fillStyle = bl.color;
      ctx.fillText(txt, bx + 6, py + 45);
      tapInfo(bx, py + 34, tw, 15, 'bless', () => ({ title: G.T(bl.name), color: bl.color, lines: [G.T(bl.desc || ''), G.T('Para todo el grupo.')] }));
      bx += tw + 5;
    }

    // ---------- reloj / bioma / kills ----------
    ctx.textAlign = 'center';
    ctx.font = F(800, 26);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillText(G.U.mmss(st.time), w / 2, 42);
    ctx.font = F(600, 10);
    ctx.fillStyle = '#8fa3c4';
    ctx.fillText((G.Dungeon.roomName ? G.T(G.Dungeon.roomName) : G.World.biomeName()).toUpperCase() + '  ·  ' + pl.kills + ' DERROTADOS  ·  ' + pl.coins + ' MONEDAS', w / 2, 58);

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

    // ---------- piso y ataque combinado (floors.js) ----------
    G.Floors.drawHud(ctx, w, h, pl, F, roundRect);

    // ---------- minimapa (arriba a la derecha) ----------
    if (!G.Modes.rule('dark')) drawMinimap(ctx, w, pl, touch, h);
    G.Boons.drawHud(ctx, w, h, F);                // cartel de los hitos de 10/20/30 min

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
    const rift = !G.Dungeon.inRoom && G.Rift.rift;      // (dentro de una sala, la flecha no tiene sentido)
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
    // Tu disco de movimientos: si no se ve, flecha celeste en el borde con los metros.
    const box = !G.Dungeon.inRoom && G.Pickups.all().find(p => (p.kind === 'sbox' || p.kind === 'fbox') && G.Loot.visible(p));      // (dentro de una sala, no)
    if (box) {
      const bsx = (box.x - cam.left()) * cam.scale, bsy = (box.y - 20 - cam.top()) * cam.scale;
      if (bsx < 0 || bsx > w || bsy < 0 || bsy > h) {
        const M = 46, ex = G.U.clamp(bsx, M, w - M), ey = G.U.clamp(bsy, M + 70, h - M - 90);
        const a = Math.atan2(bsy - ey, bsx - ex), ca = Math.cos(a), sa = Math.sin(a);
        const beat = 0.5 + Math.sin(performance.now() / 140) * 0.5;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.globalAlpha = 0.2 + beat * 0.2; ctx.fillStyle = '#7fe0ff';
        ctx.beginPath(); ctx.arc(0, 0, 24 + beat * 6, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(ca * 32, sa * 32);
        ctx.lineTo(Math.cos(a + 2.45) * 16, Math.sin(a + 2.45) * 16);
        ctx.lineTo(Math.cos(a - 2.45) * 16, Math.sin(a - 2.45) * 16);
        ctx.closePath();
        ctx.fillStyle = beat > 0.5 ? '#e6fbff' : '#7fe0ff'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#0a2a3a'; ctx.stroke();
        const label = G.T('DISCO DE MOVIMIENTOS') + ' · ' + Math.round(G.U.dist(pl.x, pl.y, box.x, box.y) / 32) + ' m';
        ctx.font = F(800, 11);
        ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        const lx = -ca * 28, ly = -sa * 26 + 4;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(label, lx, ly);
        ctx.fillStyle = '#bff3ff'; ctx.fillText(label, lx, ly);
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
      G.Relics.drawHud(ctx, w / 2, y0 + (ch.sub ? 22 : 8));        // reliquias de la torre
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
        // Apoyo (curar/defender) se marca aparte: también funciona solo.
        const sup = g.every(gm => gm.kind === 'support');
        const lbl = G.T(sup ? 'APOYO' : 'PASIVO');
        const lw = ctx.measureText(lbl).width + 8;
        roundRect(ctx, x + (S - lw) / 2, y - 7, lw, 12, 5);
        ctx.fillStyle = sup ? '#7fe0ff' : '#5fe08a'; ctx.fill();
        ctx.fillStyle = '#0a1a10';
        ctx.fillText(lbl, x + S / 2, y + 2);
        ctx.textAlign = 'left';
      } else ctx.fillText(String(i + 1), x + 3, y + 10);

      // nombre encima del activo (con un vínculo: "Ascuas +2")
      if (on) {
        // Sobre una pastilla oscura y con el color del tipo aclarado: el morado de Fantasma
        // o el azul de Dragón no se leían encima del mapa.
        ctx.font = F(800, 11);
        ctx.textAlign = 'center';
        const label = G.T(fused ? m.name + ' +' + (g.length - 1) : m.name);
        const lw = ctx.measureText(label).width + 12;
        roundRect(ctx, x + S / 2 - lw / 2, y - 21, lw, 16, 7);
        ctx.fillStyle = 'rgba(8,12,24,.85)'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = fused ? BOND : col; ctx.stroke();
        ctx.fillStyle = fused ? '#ffd0f0' : lighten(col);
        ctx.fillText(label, x + S / 2, y - 9);
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

    // ---------- objetos equipados (2 huecos, a la izquierda de los movimientos) ----------
    for (let k = 0; k < G.Player.MAX_ITEMS; k++) {
      const id = pl.items[k];
      const ix = sx - (S + 12) * (G.Player.MAX_ITEMS - k) - 6, iy = sy;
      roundRect(ctx, ix, iy, S, S, 12);
      ctx.fillStyle = id ? 'rgba(40,30,10,.9)' : 'rgba(10,16,28,.55)';
      ctx.fill();
      ctx.lineWidth = id ? 2 : 1;
      ctx.strokeStyle = id ? '#ffd23f' : 'rgba(140,170,210,.18)';
      ctx.stroke();
      if (id) {
        const it = G.Items.BY[id];
        G.Icons.draw(ctx, id, ix + (S - 36) / 2, iy + (S - 36) / 2, 36);
        ctx.font = F(700, 9);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(G.T(it.name), ix + S / 2, iy - 6);
        tapInfo(ix, iy, S, S, 'item' + k, () => ({ title: G.T(it.name), color: '#ffd23f', lines: [G.T(it.desc), G.T('Puedes llevar 2 objetos; duran toda la run.')] }), 'up');
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

    drawTip(ctx, w, h);

    // pista de controles
    if (st.time < 14) {
      ctx.font = F(600, 10);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(180,200,230,.55)';
      ctx.fillText(touch ? 'Arrastra el dedo para moverte  ·  toca un ataque para cambiarlo'
                         : 'WASD moverse  ·  1-5 / Q / E o clic en un ataque para cambiarlo  ·  Esc pausa' + (G.Coop.active ? '  ·  T mensajes' : ''), w / 2, h - 4);
    }

    ctx.restore();
  }

  // ---------------- tocar para ver qué es (2026-10-15) ----------------
  /*
   * Todo lo que en el HUD es sólo un icono o una pastilla (objeto, pociones, bendición,
   * huevo, compañero, potenciadores, reliquias...) se puede tocar / pulsar para ver qué
   * hace. Otra vez, se cierra (o a los 5 s).
   */
  const BUFF_NAME = { atk: 'Ataque', spd: 'Velocidad', def: 'Defensa', regen: 'Regeneración' };
  let tip = null;                    // { key, rect, dir, info, until }
  function tapInfo(x, y, w, h, key, info, dir = 'down') {
    if (tip && tip.key === key) { tip.rect = [x, y, w, h]; tip.info = info; }
    G.Touch.addButton(x, y, w, h, () => {
      if (G.Game.state !== 'playing') return;
      G.Audio.sfx('click');
      tip = tip && tip.key === key ? null : { key, rect: [x, y, w, h], dir, info, until: performance.now() + 5000 };
    }, 4);
  }
  function drawTip(ctx, w, h) {
    if (!tip) return;
    if (performance.now() > tip.until) { tip = null; return; }
    const d = tip.info();
    if (!d) { tip = null; return; }
    const W = Math.min(280, w - 24), P = 10, LH = 14;
    const lines = [];
    ctx.font = F(800, 12);
    for (const l of wrap(ctx, d.title, W - P * 2)) lines.push([l, d.color, true]);
    ctx.font = F(600, 11);
    for (const t of d.lines || []) if (t) for (const l of wrap(ctx, t, W - P * 2)) lines.push([l, '#dfe8ff', false]);
    const H = P * 2 + lines.length * LH;
    const [rx, ry, rw, rh] = tip.rect;
    const x0 = G.U.clamp(rx + rw / 2 - W / 2, 12, w - W - 12);
    const y0 = tip.dir === 'up' ? Math.max(8, ry - H - 8) : Math.min(h - H - 8, ry + rh + 6);
    ctx.save();
    roundRect(ctx, x0, y0, W, H, 10);
    ctx.fillStyle = 'rgba(8,12,24,.94)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = d.color || 'rgba(200,215,255,.55)'; ctx.stroke();
    ctx.textAlign = 'left';
    lines.forEach(([l, col, bold], k) => { ctx.font = F(bold ? 800 : 600, bold ? 12 : 11); ctx.fillStyle = col; ctx.fillText(l, x0 + P, y0 + P + 11 + k * LH); });
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
      rows.push([G.T(m.name) + '  Lv.' + m.lvl + '/' + m.def.maxLvl + (passive ? '  · ' + G.T(m.kind === 'support' ? 'APOYO' : 'PASIVO') : ''), G.U.TYPE_COLOR[m.type], true]);
      rows.push([G.T(m.def.desc), '#dfe8ff']);
      for (let k = 0; k < m.lvl - 1 && m.def.ups[k]; k++) rows.push(['✓ ' + G.T(m.def.ups[k].t), '#9fe0b0']);
      if (m.evolved && G.Moves.EVO_MODS[m.kind]) rows.push(['★ ' + G.T(m.name) + ': ' + G.T(m.def.evoText || G.Moves.EVO_MODS[m.kind].t), '#ffd23f']);
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
    stairs(ctx, x, y) {
      const img = G.Tiles.propSprite(G.World.biome, 'stairs', 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(x - 9), Math.round(y - 7.5), 18, 15);
    },
    sbox(ctx, x, y, on) {
      ctx.fillStyle = on ? 'rgba(127,224,255,.55)' : 'rgba(127,224,255,.25)';
      ctx.beginPath(); ctx.arc(x, y, 10, 0, 6.2832); ctx.fill();
      G.Pickups.sprite(ctx, 'disc', Math.floor(performance.now() / 160) % 6, x, y, 0.85);
    },
    egg(ctx, x, y) {
      const img = G.Tiles.propSprite(G.World.biome, 'egg', 0);
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(x - img.width * 0.4), Math.round(y - img.height * 0.4), img.width * 0.8, img.height * 0.8);
      ctx.imageSmoothingEnabled = prev;
    },
    potion(ctx, x, y) { G.Pickups.sprite(ctx, 'potion', 5, x, y, 0.75); },
    // (2026-10-16) Todo en pixel art: los objetos del mapa, sus propios sprites (tiles.js) en
    // pequeño; lo demás, iconitos de PAINT.mmicon.
    item(ctx, x, y) { G.Pickups.sprite(ctx, 'mmicon', 0, x, y, 1); },
    bigchest(ctx, x, y) { G.Pickups.sprite(ctx, 'bigchest', 0, x, y, 0.5); },
    chest(ctx, x, y) { G.Pickups.sprite(ctx, 'chest', 0, x, y, 0.4); },
    altar(ctx, x, y) { G.Pickups.sprite(ctx, 'altar', 0, x, y, 0.42); },
    spring(ctx, x, y) { G.Pickups.sprite(ctx, 'spring', 0, x, y, 0.36); },
    rift(ctx, x, y, on) {
      if (on) { ctx.fillStyle = 'rgba(180,140,255,.45)'; ctx.fillRect(Math.round(x) - 7, Math.round(y) - 7, 14, 14); }
      G.Pickups.sprite(ctx, 'rift', Math.floor(performance.now() / 150) % 4, x, y, 0.4);
    },
    boss(ctx, x, y) { G.Pickups.sprite(ctx, 'mmicon', 1, x, y, 1); },
    mhouse(ctx, x, y, on) {
      if (on) { ctx.fillStyle = 'rgba(196,123,255,.5)'; ctx.fillRect(Math.round(x) - 8, Math.round(y) - 6, 16, 12); }
      G.Pickups.sprite(ctx, 'mhouse', 0, x, y, 0.45);
    },
    shop(ctx, x, y) { G.Pickups.sprite(ctx, 'mmicon', 2, x, y, 1); },
    statue(ctx, x, y) { G.Pickups.sprite(ctx, 'statue', Math.floor(performance.now() / 600) % 6, x, y, 0.45); },
    elite(ctx, x, y, on) { G.Pickups.sprite(ctx, 'mmicon', 3, x, y + (on ? -1 : 0), 1); },
    mate(ctx, x, y, dead) { G.Pickups.sprite(ctx, 'mmicon', dead ? 5 : 4, x, y, 1); }
  };

  /*
   * Minimapa: el terreno de alrededor (unos 40 m) con iconos de lo importante. Tu cofre
   * de movimientos, tus pociones, la grieta, los jefes y los compañeros salen en el
   * borde aunque estén más lejos (para saber hacia dónde ir). El recuadro es lo que ves
   * en pantalla. Debajo, la lista con distancias y direcciones (drawMinimapList).
   */
  function drawMinimap(ctx, w, pl, touch, h) {
    // Móvil en horizontal (poca altura): algo más pequeño y la lista más corta.
    const short = touch && h < 450;
    const S = touch ? (short ? 104 : 124) : 172, x0 = w - S - 14, y0 = touch ? 62 : 48;
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
    const inside = G.Dungeon.inRoom;              // tienda / sala: sólo lo de dentro (nada en el borde)
    const icon = (name, x, y, edge, arg) => { const q = at(x, y, edge && !inside); if (q) MM_ICON[name](ctx, q[0], q[1], arg); };
    const blink = Math.sin(now * 6) > 0;
    for (const p of mmProps) icon(MM_ICON[p.type] ? p.type : 'chest', p.x, p.y, false);
    for (const p of G.Pickups.all()) {
      if ((p.kind === 'sbox' || p.kind === 'fbox' || p.kind === 'potion' || p.kind === 'egg') && !G.Loot.visible(p)) continue;
      if (p.kind === 'sbox' || p.kind === 'fbox') icon('sbox', p.x, p.y, true, blink);
      else if (p.kind === 'egg') icon('egg', p.x, p.y, true);
      else if (p.kind === 'potion') icon('potion', p.x, p.y, true);
      else if (p.kind === 'item' || p.kind === 'token' || p.kind === 'ticket10') icon('item', p.x, p.y, false);
    }
    const rift = G.Rift.rift;
    if (rift) icon('rift', rift.x, rift.y, true, blink);
    const door = G.Dungeon.roomDoor;
    if (door) icon('shop', door.x, door.y, false);
    for (const s of G.Dungeon.sites) icon(s.type, s.x, s.y, true, blink);
    if (G.Floors.stairs) icon('stairs', G.Floors.stairs.x, G.Floors.stairs.y, true);
    for (const e of G.EnemyMgr.all()) if (e.boss && !e.dead) icon('boss', e.x, e.y, true);
    for (const e of G.EnemyMgr.all()) if (e.elite && !e.boss && !e.dead) icon('elite', e.x, e.y, false, blink);
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
    drawMinimapList(ctx, w, pl, x0 + S, y0 + S + 8, short ? 3 : 6);
  }

  /**
   * Debajo del minimapa: lo más cercano de cada cosa importante, con su distancia y una
   * flecha hacia dónde está (tu disco de movimientos, tus pociones, objetos, cofres con
   * candado, altares, manantiales, la grieta y los jefes).
   */
  const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  function drawMinimapList(ctx, w, pl, right, top, max = 6) {
    const rows = [];
    const near = (list, fn) => {
      let best = null, bd = Infinity;
      for (const o of list) { if (!fn(o)) continue; const d = G.U.dist2(o.x, o.y, pl.x, pl.y); if (d < bd) { bd = d; best = o; } }
      return best;
    };
    const add = (o, name, col, ic) => { if (o) rows.push({ o, name, col, ic, d: G.U.dist(o.x, o.y, pl.x, pl.y) }); };
    const pk = G.Pickups.all();
    // Dentro de la tienda o de una sala: la salida (y sólo lo que haya dentro).
    if (G.Dungeon.roomDoor) add(G.Dungeon.roomDoor, 'Salida', '#7dffb0', 'shop');
    add(near(pk, p => (p.kind === 'sbox' || p.kind === 'fbox') && G.Loot.visible(p)), 'DISCO DE MOVIMIENTOS', '#7fe0ff', 'sbox');
    add(near(pk, p => p.kind === 'potion' && G.Loot.visible(p)), 'Poción', '#ff7ad9', 'potion');
    add(near(pk, p => p.kind === 'egg' && G.Loot.visible(p)), 'Huevo', '#fff3c8', 'egg');
    add(near(pk, p => p.kind === 'item'), 'Objeto', '#ffd23f', 'item');
    add(near(mmProps, p => p.type === 'bigchest' && !p.used), 'Cofre con candado', '#ffb000', 'bigchest');
    add(near(mmProps, p => p.type === 'altar' && !p.used), 'Altar', '#ff8ad8', 'altar');
    add(near(mmProps, p => p.type === 'spring' && !p.used), 'Manantial', '#4fb4ff', 'spring');
    if (G.Rift.rift) add(G.Rift.rift, 'Grieta', '#c9a6ff', 'rift');
    for (const s of G.Dungeon.sites) {
      if (s.type === 'mhouse') add(s, s.state === 'active' ? 'Casa de monstruos' : 'Sala misteriosa', '#d9a6ff', 'mhouse');
      else if (s.type === 'shop') add(s, 'Tienda de Kecleon', '#9fe0b0', 'shop');
      else if (s.type === 'statue') add(s, 'Estatua misteriosa', '#e8eef8', 'statue');
    }
    if (G.Floors.stairs) add(G.Floors.stairs, 'Escaleras', '#9fc8ff', 'stairs');
    add(near(G.EnemyMgr.all(), e => e.boss && !e.dead), 'Jefe', '#ff5f6d', 'boss');
    add(near(G.EnemyMgr.all(), e => e.elite && !e.boss && !e.dead), 'Élite', '#ffb84d', 'elite');
    if (!rows.length) return;
    ctx.save();
    ctx.font = F(800, 10);
    ctx.textAlign = 'right';
    // Lo más importante primero (caben 6).
    const PRI = ['sbox', 'egg', 'stairs', 'potion', 'mhouse', 'shop', 'statue', 'boss', 'rift', 'elite', 'item', 'bigchest', 'altar', 'spring'];
    if (G.Dungeon.roomDoor) for (let i = rows.length - 1; i >= 0; i--) if (rows[i].d > 700) rows.splice(i, 1);
    rows.sort((a, b) => PRI.indexOf(a.ic) - PRI.indexOf(b.ic));
    rows.slice(0, max).forEach((r, k) => {
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
      // Conexión (2026-10-16): punto de color y "Directo 45 ms" / "Relé 300 ms".
      const ni = G.Coop.netInfo(m.uid);
      if (ni) {
        const nx = lx + 116 + (o.dead ? 44 : 0);
        const nc = ni.ms < 100 ? '#5fe08a' : ni.ms < 200 ? '#ffd23f' : '#ff5f6d';
        ctx.fillStyle = nc;
        ctx.beginPath(); ctx.arc(nx + 3, y + 5, 3, 0, 6.2832); ctx.fill();
        ctx.font = F(700, 9);
        ctx.fillStyle = 'rgba(220,230,255,.8)';
        ctx.fillText(G.I18n.f(ni.direct ? 'Directo {x} ms' : 'Relé {x} ms', ni.ms), nx + 9, y + 9);
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

  return { draw, roundRect, bar, tapInfo };
})();
