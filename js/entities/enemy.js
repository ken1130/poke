/* ============ enemy.js — Pokémon salvajes y su gestor ============
 * (x, y) son los PIES. Animaciones de Mundo Misterioso:
 *   Walk al moverse · Idle parado · Charge apuntando una embestida ·
 *   Attack al embestir o al golpearte · Shoot al disparar · Hurt al recibir ·
 *   Faint al caer (se queda en el suelo y se desvanece).
 *
 * Los voladores, los fantasma y los jefes ignoran el terreno. El resto choca
 * con paredes y objetos, va más lento en el agua y se quema en la lava.
 *
 * El gestor mantiene una rejilla espacial (reconstruida cada frame) para la
 * separación entre enemigos y las colisiones de proyectiles.
 */
(() => {
  let nextId = 1;
  /** Los jefes se agrandan hasta ~110 de alto, según lo grande que ya sea su sprite. */
  function bossScale(dex) {
    const m = G.Sprites.animMeta(dex, 'Idle');
    const h = (m ? m.ay : 30) * G.Sprites.PX;
    // En múltiplos de 0,5: con la cámara a ×2 cada píxel de arte ocupa un
    // número entero de píxeles de pantalla (escalas como 1,37 lo deforman).
    return G.U.clamp(Math.round(110 / h * 2) / 2, 1, 2);
  }

  const RAGE_TINT = 'sepia(1) saturate(8) hue-rotate(-55deg) brightness(0.95)';
  // Quemado (2026-10-16, V3.1 «que se vea rojo y parpadee»): rojo anaranjado claro, alternando con el normal.
  // Como la furia, la hoja teñida se hace UNA vez (G.Sprites tinted) y se guarda: nada de ctx.filter por fotograma.
  const BURN_TINT = 'sepia(1) saturate(9) hue-rotate(-40deg) brightness(0.9) contrast(1.15)';
  class Enemy {
    constructor(def, x, y, sc, boss = false) {
      this.id = nextId++;
      this.def = def;
      this.dex = def.dex;
      this.name = (G.DEX_BY[def.dex] && G.DEX_BY[def.dex].name) || def.name;
      this.x = x; this.y = y;
      this.boss = boss;
      this.scale = boss ? bossScale(def.dex) * (def.raid ? 1.5 : 1) : 1;
      this.raid = !!def.raid;
      this.anim = new G.Sprites.Animator(def.dex, this.scale);
      this.r = G.Sprites.bodyRadius(def.dex, this.scale);
      this.bodyH = G.Sprites.bodyHeight(def.dex, this.scale);

      this.maxHp = Math.round(def.hp * sc.hp);
      this.hp = this.maxHp;
      this.spd = def.spd * sc.spd;
      this.dmg = def.dmg * sc.dmg;
      this.xp = def.xp;
      this.behavior = def.behavior;

      const types = (G.DEX_BY[def.dex] && G.DEX_BY[def.dex].types) || [];
      this.types = types.length ? types : ['normal'];
      this.atkType = this.types[0];         // tipo de sus golpes (tabla de tipos)
      // Vuelan por encima de rocas y agua sólo los que FLOTAN en su sprite (un
      // Rowlet camina aunque sea Volador). Los jefes, por su tamaño, también.
      this.flying = boss || G.Sprites.hovers(def.dex);

      this.flash = 0;
      this.slow = 0; this.slowT = 0;
      this.rootT = 0;            // inmovilizado (enredaderas de ¡Árbol Va!)
      // (2026-10-16, V3.1) Confundido (gira sin atacar), congelado (bloque de hielo) y atrapado
      // por el Viento Planetario (lo mueve combat.js). Los tres: ni se mueve ni ataca.
      this.confT = 0; this.freezeT = 0; this.grab = null;
      this.burn = 0; this.burnT = 0; this.burnTick = 0;
      this.poison = 0; this.poisonT = 0; this.poisonTick = 0;
      this.lavaTick = 0;
      this.kx = 0; this.ky = 0;
      this.touchCd = 0;
      this.dead = false;
      this.fade = 0;             // tiempo de desvanecimiento tras caer

      // embestida
      this.phase = 'walk'; this.pt = 0; this.dx = 0; this.dy = 0;
      // distancia
      this.shotCd = def.shotCd ? G.U.rand(0.3, def.shotCd) : 0;
      // desatasco
      this.stuckT = 0; this.sideT = 0; this.side = 1;
      this.bob = Math.random() * 6.28;
      this.shiny = false;
      this.sparkT = 0;
      // personalidades
      this.sc = sc;                       // escala de la run (para sus invocaciones)
      this.shield = 0; this.shieldT = 0;  // escudo que absorbe daño
      this.skillCd = G.U.rand(1, 4);      // escudos / saltos
      this.minions = [];
      this.jump = null;                   // { sx, sy, tx, ty, t, dur }
      // Rezagados: si se quedan atrás, fuera de la vista, mientras huyes,
      // vuelven a salir por delante (ver EnemyMgr.update).
      this.lagT = 0;
    }

    cy() { return this.y; }

    /**
     * Lo convierte en shiny: otro sprite y, si `boost`, más aguante y mucha más XP
     * (en el modo shiny salen todos shiny y sólo cambia el aspecto).
     */
    makeShiny(boost = true) {
      this.shiny = true;
      this.anim = new G.Sprites.Animator(this.dex, this.scale, true);
      if (boost) { this.maxHp *= 2; this.hp = this.maxHp; this.xp *= 5; }
      G.Sprites.preload([this.dex], 4000, true);
    }

    /**
     * Enemigo de élite (spawner.js, 2026-10-15): ×4 de vida y de experiencia, algo más de
     * daño, un 25 % más grande y uno o dos afijos (2026-10-16, Enemy.ELITE):
     *   fast     más rápido               blink    se teletransporta junto a ti
     *   shield   burbuja que absorbe el 40 % de su vida máxima (una vez); al romperse, estalla
     *   split    al caer se parte en 2 más pequeños y con poca vida
     *   explode  al caer deja un aviso rojo y a los 0,8 s explota (fuera del círculo, nada)
     *   stealth  de lejos casi no se ve; de cerca (5 casillas) o al recibir un golpe, sí
     *   rage     con menos del 30 % de vida se pone rojo: más rápido y pega más
     * `affix`: uno, una lista o "a+b" (así viaja por la red). `copy`: copia de un invitado
     * (sólo el aspecto; la vida ya viene multiplicada).
     */
    makeElite(affix, copy = false) {
      const list = (Array.isArray(affix) ? affix : String(affix).split('+')).filter(a => Enemy.ELITE[a]);
      if (!list.length) return;
      this.affixes = [...new Set(list)];
      this.elite = this.affixes[0];
      this.scale = 1.25;
      this.anim = new G.Sprites.Animator(this.dex, this.scale, this.shiny);
      this.r = G.Sprites.bodyRadius(this.dex, this.scale);
      this.bodyH = G.Sprites.bodyHeight(this.dex, this.scale);
      if (copy) return;
      this.maxHp *= 4; this.hp = this.maxHp;
      this.dmg *= 1.3; this.xp *= 4;
      if (this.has('fast')) this.spd *= 1.5;
      if (this.has('blink')) this.eliteT = 4;
      if (this.has('shield')) { this.shield = this.maxHp * Enemy.AFX.shield; this.shieldT = 0; this.eliteShield = true; }
      // Ya estaba en la lista (casa de monstruos: se hace élite después de salir): a los invitados.
      if (G.Coop.isHost && G.EnemyMgr.get(this.id) === this) G.Coop.broadcast(['ee', this.id, this.affixes.join('+'), Math.ceil(this.maxHp)]);
    }
    /** ¿Tiene este afijo de élite? */
    has(a) { return !!(this.affixes && this.affixes.includes(a)); }
    /** Más pequeño (los hijos del élite «Divisor»; los invitados lo reciben en 'ne'). */
    makeSmall() {
      this.small = true;
      this.scale = 0.8;
      this.anim = new G.Sprites.Animator(this.dex, this.scale, this.shiny);
      this.r = G.Sprites.bodyRadius(this.dex, this.scale);
      this.bodyH = G.Sprites.bodyHeight(this.dex, this.scale);
    }

    /** Lo de cada afijo de élite (sólo en quien manda sobre el enemigo). */
    eliteTick(dt, pl) {
      if (!this.elite || this.remote || this.dead) return;
      // Escudo: la burbuja no caduca (shieldT 0); al romperse, estallido.
      if (this.eliteShield && this.shield <= 0) { this.eliteShield = false; Enemy.shieldPop(this); }
      if (this.has('rage') && !this.raging && this.hp < this.maxHp * Enemy.AFX.rageAt) {
        this.raging = true;
        this.spd *= Enemy.AFX.rageSpd; this.dmg *= Enemy.AFX.rageDmg;
        Enemy.rageFx(this);
      }
      if (this.has('blink') && pl && !pl.dead) {
        if ((this.eliteT -= dt) <= 0) {
          this.eliteT = 4;
          for (let k = 0; k < 8; k++) {
            const a = Math.random() * 6.2832, x = pl.x + Math.cos(a) * 80, y = pl.y + Math.sin(a) * 80;
            if (!G.World.isFree(x, y, this.r * 0.6, this.flying)) continue;
            G.FX.burst(this.x, this.y - this.bodyH * 0.5, '#c47bff', 14, 160);
            this.x = x; this.y = y; this.kx = 0; this.ky = 0;
            G.FX.burst(x, y - this.bodyH * 0.5, '#c47bff', 14, 160);
            G.FX.ring(x, y, 4, 40, '#c47bff', 0.35, 3);
            break;
          }
        }
      }
    }

    /** Hora dorada (events.js): doble de experiencia y a veces monedas. */
    makeGolden() {
      if (this.golden || this.boss || this.behavior === 'thief') return;
      this.golden = true;
      this.xp *= 2;
    }

    /** @param eff  'super' | 'weak' | null (tabla de tipos, sólo para enseñarlo) */
    hurt(amount, color = '#fff', dirX = 0, dirY = 0, knock = 0, eff = null) {
      if (this.dead) return;
      if (G.Coop.isHost) this.lastHitBy = G.Coop.hitter();
      // Escudo Ígneo (Escudo de Llamas evolucionado): mientras arde, recibe +15 % de todo.
      if (this.vulnUntil && G.Game.st.time < this.vulnUntil) amount *= 1.15;
      const d = Math.max(1, Math.round(amount));
      // Copia de un enemigo del anfitrión: el golpe se le manda a él, que es
      // quien decide si cae. Aquí sólo se ve (número, destello y animación).
      if (this.remote) {
        G.Coop.hit(this, d, color, dirX, dirY, knock);
        this.hp = Math.max(1, this.hp - d);
        this.showHurt(d, color, dirX, dirY, eff);
        return;
      }
      /*
       * Arceus, Señor del Laberinto (2026-10-19, V3.1, floors.js): mientras carga o encadena su
       * ataque no le pasa nada; y su Escudo Divino va aparte del escudo normal: sólo lo bajan
       * los golpes y el Rompescudos no le afecta.
       */
      if (this.lordInv) { if (Math.random() < 0.3) G.FX.dmgText(this.x, this.y - this.bodyH - 4, G.T('Inmune'), '#fff3c0'); this.flash = 0.03; return; }
      if (this.lordShield > 0) {
        const a = Math.min(this.lordShield, d);
        this.lordShield -= a;
        if (this.lordShield <= 0) G.Floors.lordShieldBroken(this);
        if (a >= d) { G.FX.dmgText(this.x, this.y - this.bodyH - 4, d, '#ffe9a0'); this.flash = 0.05; return; }
        amount = d - a;
      }
      // Rompescudos (Mejoras): el escudo se rompe sin absorber nada.
      if (this.shield > 0 && G.Game.everyone().some(p => p.shieldBreak)) {
        this.shield = 0; this.shieldT = 0;
        G.FX.ring(this.x, this.y, this.r, this.r * 2.4, '#9fd8ff', 0.35, 3);
      }
      // Escudo: absorbe primero.
      if (this.shield > 0) {
        const a = Math.min(this.shield, d);
        this.shield -= a;
        if (a >= d) { G.FX.dmgText(this.x, this.y - this.bodyH - 4, d, '#9fd8ff'); this.flash = 0.05; return; }
        amount = d - a;
      }
      this.hp -= Math.max(1, Math.round(amount));
      this.showHurt(d, color, dirX, dirY, eff);
      if (knock > 0 && !this.boss) {
        const [nx, ny] = G.U.norm(dirX, dirY);
        this.kx += nx * knock;
        this.ky += ny * knock;
      }
      if (G.Coop.isHost) G.Coop.hurtShown(this, d, color);
      if (this.hp <= 0) this.die();
    }

    /** Lo que se VE al recibir un golpe. */
    showHurt(d, color, dirX = 0, dirY = 0, eff = null) {
      this.flash = 0.09;
      if (this.has('stealth')) this.revealUntil = performance.now() + Enemy.AFX.reveal * 1000;     // sigiloso: al golpearlo se deja ver un momento
      // Slowpoke y familia se enteran tarde (funny.js): "…?" y el número 2,5 s después.
      if (this.dex === 79 || this.dex === 80 || this.dex === 199) {
        if (!this.slowT0 || performance.now() - this.slowT0 > 2500) { this.slowT0 = performance.now(); G.FX.dmgText(this.x, this.y - this.bodyH - 4, '…?', '#ffffff'); }
        setTimeout(() => { if (!this.dead) G.FX.dmgText(this.x, this.y - this.bodyH - 4, d + '!?', '#ff8ad8', true); }, 2500);
        return;
      }
      // Muy eficaz: número amarillo y grande. Poco eficaz: gris. Crítico: naranja y grande.
      G.FX.dmgText(this.x, this.y - this.bodyH - 4, d, eff === 'crit' ? '#ff9a3c' : eff === 'super' ? '#ffe14d' : eff === 'weak' ? '#a3abb8' : color,
                   this.boss || eff === 'super' || eff === 'crit');
      G.FX.spark(this.x, this.y - this.bodyH * 0.5, color, dirX, dirY, 3);
      if (!this.anim.busy() && this.phase !== 'dash') this.anim.play('Hurt');
      G.Audio.sfx('hit');
    }

    applySlow(factor, dur = 1.2) {
      if (this.remote) { G.Coop.status(this, 's', factor); return; }
      this.slow = Math.max(this.slow, factor);
      this.slowT = Math.max(this.slowT, dur);
    }
    /** Inmovilizado `dur` s (aparte del frenado: el veneno que frena no lo alarga). */
    applyRoot(dur) {
      if (this.remote) { G.Coop.status(this, 'r', dur); return; }
      this.rootT = Math.max(this.rootT, dur);
    }
    /** Confundido `dur` s: gira en el sitio y no ataca (los jefes sólo se frenan). */
    applyConfuse(dur) {
      if (this.remote) { G.Coop.status(this, 'c', dur); return; }
      if (this.boss) { this.applySlow(0.5, dur); return; }
      this.confT = Math.max(this.confT, dur); this.rootT = Math.max(this.rootT, dur);
    }
    /** Congelado `dur` s en un bloque de hielo: no se mueve ni ataca (los jefes sólo se frenan). */
    applyFreeze(dur) {
      if (this.remote) { G.Coop.status(this, 'f', dur); return; }
      if (this.boss) { this.applySlow(0.6, dur); return; }
      this.freezeT = Math.max(this.freezeT, dur); this.rootT = Math.max(this.rootT, dur);
    }
    /** ¿Fuera de combate? (confundido, congelado o atrapado; en una copia, lo que diga el anfitrión) */
    get disabled() { return this.confT > 0 || this.freezeT > 0 || !!this.grab || !!(this.net && this.net.st & 112); }
    applyBurn(stacks = 1) {
      if (this.remote) { G.Coop.status(this, 'b', stacks); return; }
      this.burn = Math.min(8, this.burn + stacks); this.burnT = 3;
    }
    /** Quemadura mínima (Equipo de Shixin, artefacto): al menos `n` acumulaciones durante 3 s. */
    applyBurnFloor(n) {
      if (this.remote) {
        const t = performance.now();
        if (t - (this.bfAt || 0) > 500) { this.bfAt = t; G.Coop.status(this, 'B', n); }
        return;
      }
      this.burn = Math.max(this.burn, Math.min(8, n)); this.burnT = Math.max(this.burnT, 3);
    }
    applyPoison(stacks = 1) {
      if (this.remote) { G.Coop.status(this, 'p', stacks); return; }
      this.poison = Math.min(8, this.poison + stacks); this.poisonT = 4;
    }

    die() {
      if (this.dead) return;
      this.dead = true;
      if (G.Coop.isHost) G.Coop.creditKill(this.lastHitBy);   // MVP: último golpe
      this.fade = 0.9;
      this.anim.play('Faint', { hold: true });
      const col = this.boss ? '#ffd95e' : '#ffffff';
      const cy = this.y - this.bodyH * 0.5;
      G.FX.burst(this.x, cy, col, this.boss ? 34 : 9, this.boss ? 260 : 120);
      G.FX.ring(this.x, this.y, this.r, this.r * (this.boss ? 6 : 2.6), col, this.boss ? 0.6 : 0.3, this.boss ? 6 : 3);
      // En una copia, el botín y los shinies los reparte el anfitrión.
      if (this.remote) {
        if (this.boss) G.Camera.kick(0.9);
        G.Audio.sfx(this.boss ? 'bossDown' : 'faint');
        if (this.shiny) { G.FX.burst(this.x, cy, '#ffe9a0', 30, 220); G.FX.ring(this.x, this.y, this.r, this.r * 7, '#9ae6ff', 0.7, 5); }
        return;
      }
      if (this.noLoot) return;          // jefe de incursión que se ha ido
      G.Funny.onDeath(this);            // Magikarp de la migración: una moneda
      if (this.elite) {
        // Élite: dos orbes grandes de experiencia y a veces un objeto; el "split" se parte en 3.
        for (let i = 0; i < 2; i++) G.Pickups.drop('xpBig', this.x + G.U.rand(-20, 20), this.y + G.U.rand(-14, 14), Math.ceil(this.xp / 4));
        if (G.Floors.eliteItem || Math.random() < Math.min(0.9, 0.4 * (1 + 0.2 * G.Floors.floor))) G.Pickups.drop('item', this.x + 18, this.y - 8, G.Items.roll());
        if (this.has('split')) {
          // (2026-10-16: 2 más pequeños y con la mitad de la vida de uno normal; antes 3 casi enteros)
          const base = this.maxHp / 4, def = this.def, x0 = this.x, y0 = this.y;
          const sc = { hp: base * Enemy.AFX.splitHp / Math.max(1, def.hp), dmg: this.dmg / 1.3 / Math.max(0.01, def.dmg), spd: 1 };
          // Al fotograma siguiente (no se toca la lista de enemigos mientras se recorre).
          setTimeout(() => {
            if (!G.Game.player) return;
            for (let i = 0; i < 2; i++) {
              const a = i * Math.PI + Math.random() * 0.8, x = x0 + Math.cos(a) * 30, y = y0 + Math.sin(a) * 24;
              if (!G.World.isFree(x, y, 10)) continue;
              const e = new Enemy(def, x, y, sc);
              e.makeSmall();
              e.xp = Math.max(1, Math.round(e.xp * 0.5));
              G.EnemyMgr.add(e);
              G.FX.burst(x, y - 10, '#5fe08a', 8, 110);
              G.FX.ring(x, y, 3, 26, '#5fe08a', 0.3, 2);
            }
          }, 0);
        }
        if (this.has('explode')) {
          // Aviso rojo y explosión (hazards.js: cada ordenador mira a SU Pokémon; el anfitrión lo reparte).
          const r = Enemy.AFX.boomR + this.r;
          G.Hazards.add({ kind: 'zone', x: this.x, y: this.y, r, delay: Enemy.AFX.boomDelay, dmg: this.dmg * Enemy.AFX.boomDmg, type: 'fire', color: '#ff4a3d' });
        }
      }
      if (this.boss) {
        G.Camera.kick(0.9);
        for (let i = 0; i < 10; i++) G.Pickups.drop('coin', this.x + G.U.rand(-40, 40), this.y + G.U.rand(-30, 30), 5);
        // Los jefes siempre sueltan un objeto equipable.
        G.Pickups.drop('item', this.x - 26, this.y - 10, G.Items.roll());
      }
      G.Pickups.dropXp(this.x, this.y, this.xp, this.boss, !!this.legend);
      if (this.golden && Math.random() < 0.35) G.Pickups.drop('coin', this.x + 6, this.y - 4, 3);
      // Duende del tesoro: Meowth suelta monedas; Gholdengo, un ticket ×10.
      if (this.behavior === 'thief') {
        const n = this.def.loot === 'ticket10' ? 6 : 20;
        for (let i = 0; i < n; i++) G.Pickups.drop('coin', this.x + G.U.rand(-36, 36), this.y + G.U.rand(-26, 26), 5);
        if (this.def.loot === 'ticket10') G.Pickups.drop('ticket10', this.x, this.y - 12, 1);
        G.FX.ring(this.x, this.y, this.r, this.r * 5, '#ffd23f', 0.6, 4);
      }
      if (this.legend) {
        // El legendario de la grieta: tickets sueltos y monedas (el ×10, como
        // la mitad de las veces; antes daba 2 siempre).
        for (let i = 0; i < 3; i++) G.Pickups.drop('ticket', this.x + G.U.rand(-30, 30), this.y + G.U.rand(-20, 20), 1);
        for (let i = 0; i < 10; i++) G.Pickups.drop('coin', this.x + G.U.rand(-50, 50), this.y + G.U.rand(-35, 35), 8);
      }
      G.Audio.sfx(this.boss ? 'bossDown' : 'faint');
      if (this.shiny) {
        G.FX.burst(this.x, cy, '#ffe9a0', 30, 220);
        G.FX.ring(this.x, this.y, this.r, this.r * 7, '#9ae6ff', 0.7, 5);
        if (G.onShinyCaught) G.onShinyCaught(this);
      }
    }

    /**
     * Copia de un enemigo del anfitrión: va hacia la última posición recibida
     * (más la velocidad estimada, para que no avance a saltos) y anima según
     * se mueva o según la animación que tenga en el anfitrión.
     */
    netUpdate(dt) {
      this.anim.update(dt);
      if (this.flash > 0) this.flash -= dt;
      if (this.dead) { this.fade -= dt; return; }
      if (this.touchCd > 0) this.touchCd -= dt;
      this.bob += dt * 6;
      if (this.shiny) {
        this.sparkT -= dt;
        if (this.sparkT <= 0) { this.sparkT = 0.22; G.FX.twinkle(this.x + G.U.rand(-this.r, this.r) * 1.2, this.y - G.U.rand(4, this.bodyH * 1.1)); }
      }
      const n = this.net;
      if (!n) return;
      // Élite «Escudo» del anfitrión: al romperse su burbuja, el estallido también aquí.
      const sh = !!(n.st & 4);
      if (this._sh && !sh && this.has('shield')) Enemy.shieldPop(this);
      if (!this._rg && n.st & 8) { this._rg = true; Enemy.rageFx(this); }
      this._sh = sh;
      const ox = this.x, oy = this.y;
      n.age += dt;
      // Con posiciones guardadas (2026-10-16): interpolación ~0,1 s en el pasado (coop.js).
      const p = n.buf && n.buf.length ? G.Coop.interp(n.buf, G.Coop.renderClock()) : null;
      if (p) {
        if (G.U.dist2(this.x, this.y, p[0], p[1]) > 160 * 160) { this.x = p[0]; this.y = p[1]; }
        else { this.x = G.U.damp(this.x, p[0], 12, dt); this.y = G.U.damp(this.y, p[1], 12, dt); }
      } else {
        // Formato antiguo: se adelanta hasta 0,3 s con la velocidad estimada.
        const lead = Math.min(0.3, n.age);
        const tx = n.x + n.vx * lead, ty = n.y + n.vy * lead;
        if (G.U.dist2(this.x, this.y, tx, ty) > 160 * 160) { this.x = tx; this.y = ty; }
        else { this.x = G.U.damp(this.x, tx, 12, dt); this.y = G.U.damp(this.y, ty, 12, dt); }
      }
      const vx = (this.x - ox) / (dt || 1), vy = (this.y - oy) / (dt || 1);
      const moving = Math.abs(vx) + Math.abs(vy) > 8;
      // Andando, mira hacia donde va (el anfitrión ya no manda cada cambio de dirección).
      this.anim.dir = moving && n.buf ? G.Sprites.dirFromAngle(Math.atan2(vy, vx)) : n.dir;
      // Animaciones de una vez (embestida, disparo...) que ha empezado el anfitrión.
      if (n.anim !== this.lastNetAnim) {
        this.lastNetAnim = n.anim;
        const a = G.Coop.ANIMS[n.anim];
        if (a && a !== 'Idle' && a !== 'Walk' && a !== 'Faint') this.anim.play(a, { speed: 1.4 });
      }
      this.anim.loop(moving ? 'Walk' : 'Idle');
    }

    update(dt, pl) {
      // Fuera de pantalla no hace falta animar (sí moverse y pensar).
      const seen = G.Camera.sees(this.x, this.y, 120);
      if (seen || this.dead) this.anim.update(dt);
      if (this.flash > 0) this.flash -= dt;
      if (this.dead) { this.fade -= dt; return; }
      if (this.shiny && seen) {
        this.sparkT -= dt;
        if (this.sparkT <= 0) {
          this.sparkT = 0.22;
          G.FX.twinkle(this.x + G.U.rand(-this.r, this.r) * 1.2, this.y - G.U.rand(4, this.bodyH * 1.1));
        }
      }
      if (this.touchCd > 0) this.touchCd -= dt;
      this.bob += dt * 6;

      // --- estados ---
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 0; }
      if (this.rootT > 0) this.rootT -= dt;
      if (this.confT > 0) this.confT -= dt;
      if (this.freezeT > 0) this.freezeT -= dt;
      if (this.burn > 0) {
        this.burnT -= dt; this.burnTick -= dt;
        if (this.burnTick <= 0) { this.burnTick = 0.5; this.hurt(1.6 * this.burn * (1 + pl.level * 0.06), '#ff9a4d'); }
        if (this.burnT <= 0) this.burn = 0;
      }
      if (this.poison > 0) {
        this.poisonT -= dt; this.poisonTick -= dt;
        if (this.poisonTick <= 0) { this.poisonTick = 0.6; this.hurt(this.maxHp * 0.012 * this.poison + 1, '#d47cf0'); }
        if (this.poisonT <= 0) this.poison = 0;
      }
      if (this.dead) return;
      this.eliteTick(dt, pl);

      // --- terreno ---
      let terrainMul = 1;
      // (El legendario está en su casa: su arena no le afecta.)
      if (!this.flying && !this.legend && G.World.isLiquid(this.x, this.y)) {
        const le = G.World.liquidEffect(this.types);
        if (le.dmg) {
          this.lavaTick -= dt;
          if (this.lavaTick <= 0) { this.lavaTick = le.every; this.hurt(6 + this.maxHp * 0.04, le.color); }
          if (this.dead) return;
        } else if (le.slow) terrainMul = le.slow < 0.5 ? 0.45 : 0.55;
      }

      const spd = this.spd * (1 - this.slow) * (this.rootT > 0 ? 0 : 1) * terrainMul * G.Weather.speedFor(this.types) * G.Dungeon.mod('enemySpd');
      let [dx, dy] = G.U.norm(pl.x - this.x, pl.y - this.y);
      const dist = G.U.dist(this.x, this.y, pl.x, pl.y);
      // Duende del tesoro: huye de ti (en zigzag) en cuanto te acercas.
      if (this.behavior === 'thief') {
        this.zig = (this.zig || 0) + dt;
        const near = dist < 300, a = Math.atan2(-dy, -dx) + Math.sin(this.zig * 2.2) * 0.7;
        const k = near ? 1 : 0.35;
        const vx0 = Math.cos(a) * spd * k, vy0 = Math.sin(a) * spd * k;
        const ox = this.x, oy = this.y;
        this.x += (vx0 + this.kx) * dt; this.y += (vy0 + this.ky) * dt;
        this.kx *= Math.pow(0.0015, dt); this.ky *= Math.pow(0.0015, dt);
        if (G.World.collide(this) && Math.hypot(this.x - ox, this.y - oy) < spd * k * dt * 0.3) this.zig += 1.4;
        if (Math.random() < dt * 6 && G.Camera.sees(this.x, this.y, 0)) G.FX.twinkle(this.x + G.U.rand(-this.r, this.r), this.y - G.U.rand(4, this.bodyH));
        this.anim.dir = G.Sprites.dirFromAngle(a);
        this.anim.loop('Walk', 1.4);
        return;
      }
      // Corredor: va a donde VAS a estar (te corta el paso si sólo huyes).
      if (this.behavior === 'runner' && pl._vx != null) {
        const lead = G.U.clamp(dist / Math.max(60, spd), 0, 1.4);
        [dx, dy] = G.U.norm(pl.x + pl._vx * lead - this.x, pl.y + pl._vy * lead - this.y);
        if (G.Camera.sees(this.x, this.y, 0) && Math.random() < dt * 10) G.FX.px(this.x - dx * 8 + G.U.rand(-4, 4), this.y, '#e8dcc0', { vy: -12, life: 0.35 });
      }

      // --- personalidad (escudos, saltos, explosión) ---
      if (this.shieldT > 0 && (this.shieldT -= dt) <= 0) this.shield = 0;
      if (this.jump) { this.updateJump(dt); return; }
      if (this.behavior === 'bomber' && this.phase === 'fuse') {
        this.pt -= dt;
        this.flash = Math.floor(this.pt * 10) % 2 ? 0.05 : 0;
        if (this.pt <= 0) { this.hp = 0; this.die(); }
        this.anim.loop('Idle');
        return;
      }
      if (this.behavior === 'bomber' && dist < this.r + pl.r + 26) { this.startFuse(); return; }
      if (this.behavior === 'shielder' || this.behavior === 'jumper') {
        this.skillCd -= dt;
        if (this.skillCd <= 0) {
          if (this.behavior === 'shielder') { this.skillCd = 6; this.castShields(); }
          else if (dist < 250) { this.skillCd = G.U.rand(5, 7); this.startJump(pl); return; }
          else this.skillCd = 0.5;
        }
      }

      // Si lleva rato atascado contra algo, rodea por un lado.
      if (this.sideT > 0) {
        this.sideT -= dt;
        const a = Math.atan2(dy, dx) + this.side * 1.25;
        dx = Math.cos(a); dy = Math.sin(a);
      }

      // Camino alrededor de los obstáculos (los que no vuelan).
      if (!this.flying && this.phase !== 'dash' && this.sideT <= 0) {
        const pd = G.Path.dirFor(this, pl);
        if (pd && !(this.keepsDistance() && dist < (this.def.range || 200) * 0.82)) { dx = pd[0]; dy = pd[1]; }
      }

      let vx = dx * spd, vy = dy * spd;
      let animBase = 'Walk';

      if (this.boss) {
        [vx, vy, animBase] = this.bossMove(dt, pl, dist, dx, dy, spd);
      } else if (this.behavior === 'charger') {
        this.pt -= dt;
        if (this.phase === 'walk') {
          if (dist < 200 && this.pt <= 0) {
            this.phase = 'aim'; this.pt = 0.55;
            this.anim.play('Charge', { speed: 1.6 });
          }
        } else if (this.phase === 'aim') {
          vx = vy = 0; animBase = 'Idle';
          if (this.pt <= 0) {
            this.phase = 'dash'; this.pt = 0.42;
            this.dx = dx; this.dy = dy;
            this.anim.play('Attack', { speed: 1.4 });
            G.FX.ring(this.x, this.y, this.r, this.r * 2.4, '#ff6b6b', 0.25, 2);
          }
        } else if (this.phase === 'dash') {
          vx = this.dx * spd * 3.4; vy = this.dy * spd * 3.4;
          if (this.pt <= 0) { this.phase = 'walk'; this.pt = 1.1; }
        }
      } else if (this.keepsDistance()) {
        const range = this.def.range || 200;
        const keep = range * 0.82;
        // Recta hacia ti (no el camino) para alejarse.
        const [ddx, ddy] = G.U.norm(pl.x - this.x, pl.y - this.y);
        if (dist < keep * 0.75) { vx = -ddx * spd * 0.8; vy = -ddy * spd * 0.8; }
        else if (dist < keep) { vx *= 0.1; vy *= 0.1; animBase = 'Idle'; }
        this.shotCd -= dt;
        if (this.shotCd <= 0 && dist < range && !this.disabled) {
          this.shotCd = this.def.shotCd || 2;
          this.special(pl, ddx, ddy);
        }
      }

      // --- integración ---
      const ox = this.x, oy = this.y;
      this.x += this.kx * dt; this.y += this.ky * dt;
      this.kx *= Math.pow(0.0015, dt); this.ky *= Math.pow(0.0015, dt);
      this.x += vx * dt; this.y += vy * dt;

      if (!this.flying && G.World.collide(this)) {
        // ¿Ha avanzado bastante menos de lo que quería?
        const want = Math.hypot(vx, vy) * dt;
        const got = Math.hypot(this.x - ox, this.y - oy);
        if (want > 0.5 && got < want * 0.35) {
          this.stuckT += dt;
          if (this.stuckT > 0.35 && this.sideT <= 0) {
            this.sideT = 0.7; this.stuckT = 0;
            this.side = Math.random() < 0.5 ? -1 : 1;
          }
        } else this.stuckT = 0;
      }

      // --- animación ---
      const moving = Math.abs(vx) + Math.abs(vy) > 2;
      const faceA = this.phase === 'dash' ? Math.atan2(this.dy, this.dx)
                  : moving ? Math.atan2(vy, vx) : Math.atan2(pl.y - this.y, pl.x - this.x);
      this.anim.dir = G.Sprites.dirFromAngle(faceA);
      this.anim.loop(moving ? animBase : 'Idle', moving ? Math.max(0.6, spd / 70) : 1);
    }

    // ---------------- jefes ----------------
    // Cada jefe (y cada legendario de las grietas) tiene 4 ataques: 2 de
    // cerca (Pisotón siempre + Embestida o Salto) y 2 de lejos según su tipo.
    // Va alternando entre ir a por ti y pelear a distancia, así que el que
    // dispara también se te echa encima y el de cuerpo a cuerpo también
    // dispara. Todo avisa en el suelo. Por debajo de la mitad de vida se
    // enfurece: más rápido, menos espera y a veces encadena dos ataques.

    bossInit() {
      const T = this.types, has = (...xs) => xs.some(x => T.includes(x));
      const melee = ['slam', G.U.hash(this.dex, 3, 7) < 0.5 ? 'dash' : 'leap'];
      const pref = has('fire', 'ground', 'poison', 'rock', 'grass') ? 'rain'
                 : has('electric', 'psychic', 'dragon', 'ice', 'steel') ? 'beam'
                 : has('fairy', 'ghost', 'water', 'flying') ? 'nova' : 'volley';
      const others = ['rain', 'beam', 'nova', 'volley'].filter(x => x !== pref);
      const ranged = [pref, others[Math.floor(G.U.hash(this.dex, 5, 9) * 3) % 3]];
      // Ataques de esta versión, sólo para algunos tipos:
      //   cuchillas giratorias  Acero, Bicho, Siniestro, Lucha
      //   espinas (荊棘)        Planta, Veneno, Tierra, Roca
      if (has('steel', 'bug', 'dark', 'fighting')) ranged[1] = 'blades';
      if (has('grass', 'poison', 'ground', 'rock')) { if (ranged[1] === 'blades') ranged.push('thorns'); else ranged[1] = 'thorns'; }
      //   carga de tren        Normal, Fuego, Eléctrico, Dragón — sólo enfurecido (rampage)
      const ramp = has('normal', 'fire', 'electric', 'dragon');
      const far = this.behavior === 'ranged';
      this.ai = { melee, ranged, farLike: far ? 0.65 : 0.35, mode: far ? 'far' : 'close', modeT: G.U.rand(6, 8),
                  cd: 1.6, cast: null, fury: false, side: Math.random() < 0.5 ? -1 : 1, ramp, rampT: 0 };
    }

    bossMove(dt, pl, dist, dx, dy, spd) {
      if (!this.ai) this.bossInit();
      const ai = this.ai;
      if (!ai.fury && this.hp < this.maxHp * 0.5) this.enrage();
      const k = ai.fury ? 1.25 : 1;
      if (ai.cast) return this.bossCast(dt, pl);
      ai.modeT -= dt; ai.cd -= dt * k;
      // Alterna siempre: en su distancia favorita está más rato (7-9 s) que en la otra (4-5 s).
      if (ai.modeT <= 0) {
        ai.mode = ai.mode === 'far' ? 'close' : 'far';
        ai.modeT = (ai.mode === 'far') === (ai.farLike > 0.5) ? G.U.rand(7, 9) : G.U.rand(4, 5);
        ai.side = -ai.side;
      }
      let vx = dx * spd * k * 1.1, vy = dy * spd * k * 1.1;
      const [ddx, ddy] = G.U.norm(pl.x - this.x, pl.y - this.y);
      if (ai.mode === 'far') {
        if (dist < 170) { vx = -ddx * spd; vy = -ddy * spd; }
        else if (dist < 300) { vx = -ddy * spd * 0.55 * ai.side; vy = ddx * spd * 0.55 * ai.side; }   // te rodea
      }
      // Enfurecido: carga de tren en cuanto puede, y luego cada ~14 s.
      if (ai.fury && ai.ramp && ai.cd <= 0 && (ai.rampT -= dt) <= 0) {
        ai.rampT = 14;
        this.bossStart('rampage', pl);
        return [0, 0, 'Idle'];
      }
      if (ai.cd <= 0) {
        let id = null;
        if (ai.mode === 'close') {
          const ok = ai.melee.filter(m => m === 'slam' ? dist < 125 : dist < 320);
          // De vez en cuando, aunque esté cerca, también dispara.
          id = ok.length && Math.random() < 0.8 ? G.U.pick(ok) : dist < 480 ? G.U.pick(ai.ranged) : null;
        } else {
          id = dist < 115 ? 'slam' : dist < 430 ? G.U.pick(ai.ranged) : null;
        }
        if (id) this.bossStart(id, pl);
      }
      return [vx, vy, 'Walk'];
    }

    enrage() {
      this.ai.fury = true;
      this.spd *= 1.15;
      G.Spawner.say('¡' + this.name + ' se ha enfurecido!', 2.4);
      G.FX.ring(this.x, this.y, this.r, this.r * 5, '#ff4a4a', 0.6, 5);
      G.Camera.kick(0.5);
      G.Audio.sfx('boss');
    }

    bossStart(id, pl) {
      const ai = this.ai, f = ai.fury ? 0.8 : 1, type = this.atkType;
      const col = G.U.TYPE_COLOR[type] || '#ff7a9e';
      const ang = Math.atan2(pl.y - this.y, pl.x - this.x);
      const c = ai.cast = { id, t: 0, wind: 0.6 * f, after: 0.35, ang };
      switch (id) {
        case 'slam':       // pisotón: onda alrededor
          c.wind = 0.85 * f;
          G.Hazards.add({ kind: 'zone', x: this.x, y: this.y, r: 96 + this.r, delay: c.wind, dmg: this.dmg * 1.3, type, color: col });
          this.anim.play('Charge', { speed: 1.2 });
          break;
        case 'dash':       // embestida en línea recta
          c.wind = 0.75 * f; c.len = 330; c.dur = 0.32;
          G.Hazards.add({ kind: 'beam', x: this.x, y: this.y, angle: ang, len: c.len + this.r, w: this.r * 2 + 16,
                          delay: c.wind + c.dur, dmg: this.dmg * 1.2, type, color: col });
          this.anim.play('Charge', { speed: 1.3 });
          break;
        case 'leap':       // salto y caída sobre ti
          this.jump = { sx: this.x, sy: this.y, tx: pl.x, ty: pl.y, t: -0.5 * f, dur: 0.65 };
          G.Hazards.add({ kind: 'zone', x: pl.x, y: pl.y, r: 82, delay: 0.5 * f + 0.65, dmg: this.dmg * 1.25, type, color: col });
          this.anim.play('Charge', { speed: 1.4 });
          ai.cast = null; ai.cd = G.U.rand(1.4, 2) + 0.6;
          break;
        case 'rain': {     // zonas que caen alrededor de ti
          const n = ai.fury ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const a = i ? Math.random() * 6.2832 : 0, d = i ? G.U.rand(40, 120) : 0;
            G.Hazards.add({ kind: 'zone', x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d * 0.8, r: 50,
                            delay: 1.05 + i * 0.12, dmg: this.shotDmg() * 1.15, type, color: col });
          }
          c.wind = 0.5; this.anim.play('Shoot');
          break;
        }
        case 'beam': {     // rayos en abanico
          const n = ai.fury ? 5 : 3, sp = ai.fury ? 0.42 : 0.5;
          for (let i = 0; i < n; i++) {
            G.Hazards.add({ kind: 'beam', x: this.x, y: this.y, angle: ang + (i - (n - 1) / 2) * sp, len: 400, w: 26,
                            delay: 1.0, dmg: this.shotDmg() * 1.2, type, color: col });
          }
          c.wind = 1.0; c.after = 0.25; this.anim.play('Charge', { speed: 1.1 });
          break;
        }
        case 'rampage':    // carga de tren: rebota contra lo que choque (ver bossCast)
          c.wind = 1.0; c.dir = ang; c.hits = 0;
          G.Hazards.add({ kind: 'beam', x: this.x, y: this.y, angle: ang, len: 420, w: this.r * 2 + 16,
                          delay: c.wind, dmg: this.dmg * 1.2, type, color: '#ff4a4a' });
          G.FX.ring(this.x, this.y, this.r, this.r * 4, '#ff4a4a', c.wind, 4);
          this.anim.play('Charge', { speed: 1.5 });
          G.Spawner.say('¡' + this.name + ' va a embestir sin parar!', 2.2);
          break;
        case 'blades':     // 8 cuchillas giratorias en espiral
          c.wind = 0.8 * f; c.after = 0.4;
          this.anim.play('Charge', { speed: 1.2 });
          G.FX.ring(this.x, this.y, this.r, this.r * 3, '#e6edf5', c.wind, 3);
          break;
        case 'thorns':     // espinas por toda la pantalla (o media), con aviso
          c.wind = 1.4 * f; c.after = 0.9;
          this.anim.play('Charge', { speed: 0.9 });
          G.FX.ring(this.x, this.y, this.r, this.r * 4, col, c.wind, 3);
          this.thorns(pl, c.wind, ai.fury);
          break;
        case 'volley':     // abanico de disparos
        case 'nova':       // anillo de disparos
          c.wind = (id === 'nova' ? 0.7 : 0.5) * f;
          this.anim.play('Charge', { speed: 1.4 });
          G.FX.ring(this.x, this.y, this.r, this.r * 2.4, col, c.wind, 2);
          break;
      }
    }

    bossCast(dt, pl) {
      const ai = this.ai, c = ai.cast;
      c.t += dt;
      if (c.id === 'rampage' && c.t >= c.wind) return this.rampage(dt, pl, c);
      if (c.id === 'dash' && c.t >= c.wind) {
        if (!c.go) { c.go = true; this.anim.play('Attack', { speed: 1.6 }); }
        if (c.t >= c.wind + c.dur) return this.bossEnd();
        const sp = c.len / c.dur;
        return [Math.cos(c.ang) * sp, Math.sin(c.ang) * sp, 'Walk'];
      }
      if (c.t >= c.wind && !c.fired) {
        c.fired = true;
        const [ax, ay] = G.U.norm(pl.x - this.x, pl.y - this.y);
        if (c.id === 'volley') this.shoot(ax, ay, 1.1, ai.fury ? 9 : 7, 0.8);
        else if (c.id === 'nova') { const n = ai.fury ? 18 : 14; this.shoot(ax, ay, 6.2832 * (n - 1) / n, n, 0.7); }
        else if (c.id === 'slam') this.anim.play('Attack', { speed: 1.4 });
        else if (c.id === 'blades') this.blades(c.ang, ai.fury);
      }
      if (c.t >= c.wind + c.after) return this.bossEnd();
      return [0, 0, 'Idle'];
    }

    /**
     * Cuchillas: 8 direcciones (una hacia ti). Hoja de 0,5 × 2,5 casillas
     * (16 × 80 unidades: una casilla son 32). Daño: BLADE_DMG × su disparo normal.
     */
    blades(ang, fury) {
      const type = this.atkType, col = G.U.TYPE_COLOR[type] || '#ff7a9e';
      const TILE = G.Tiles.T * G.Sprites.PX, BLADE_DMG = 1.1;
      for (let i = 0; i < 8; i++) {
        G.Hazards.add({ kind: 'blade', x: this.x, y: this.y, angle: ang + i * Math.PI / 4,
                        dmg: this.shotDmg() * BLADE_DMG, type, color: col,
                        sp: fury ? 165 : 135, life: 3.4, R: 24, om: fury ? 10 : 8.5, spin: 13,
                        w: TILE * 0.5, len: TILE * 2.5 });
      }
      this.anim.play('Shoot', { speed: 1.2 });
      if (G.Camera.sees(this.x, this.y, 100)) G.Audio.sfx('shot', { kind: 'beam', type });
    }

    /**
     * Espinas: tallos que salen desde los bordes de la pantalla, alternando lado,
     * con 2 casillas libres entre uno y otro. Primero se ve la franja (aviso)
     * mientras el jefe carga, y luego salen. Pantalla entera o la mitad (enfurecido:
     * siempre entera). Horizontales o, a veces, verticales. Daño: THORN_DMG × su disparo.
     */
    thorns(pl, wind, fury) {
      const type = this.atkType, col = G.U.TYPE_COLOR[type] || '#7ee07a';
      const TILE = G.Tiles.T * G.Sprites.PX, THORN_DMG = 1.3;
      const w = TILE * 0.5, step = TILE * 2 + w;          // 2 casillas libres entre espinas
      const W = 1300, H = 800;                            // algo más que la pantalla
      const vertical = Math.random() < 0.35;
      const full = fury || Math.random() < 0.5;
      const half = Math.random() < 0.5 ? -1 : 1;         // qué mitad, si es media pantalla
      const span = vertical ? W : H, across = vertical ? H : W;
      const off = Math.random() * step;
      let k = 0;
      for (let p = -span / 2 + off; p < span / 2; p += step, k++) {
        if (!full && Math.sign(p || 1) !== half) continue;
        const fromStart = k % 2 === 0;                   // alterna: izquierda/derecha (o arriba/abajo)
        const o = vertical
          ? { x: pl.x + p, y: pl.y + (fromStart ? -across / 2 : across / 2), angle: fromStart ? Math.PI / 2 : -Math.PI / 2 }
          : { x: pl.x + (fromStart ? -across / 2 : across / 2), y: pl.y + p, angle: fromStart ? 0 : Math.PI };
        G.Hazards.add(Object.assign(o, { kind: 'thorn', len: across, w, delay: wind + 0.5, grow: 0.35, stay: 0.5,
                                          dmg: this.shotDmg() * THORN_DMG, type, color: col }));
      }
    }

    /**
     * Carga de tren (como la definitiva de Sion): a toda velocidad en línea recta;
     * al chocar con una pared, árbol o roca, o con el borde de la pantalla, gira
     * 45° en el sentido de las agujas del reloj (más si sigue bloqueado). Para tras
     * RAMP_HITS choques. Mientras carga, su golpe por contacto hace ×1,5.
     */
    rampage(dt, pl, c) {
      const RAMP_HITS = 5, SPEED = 480;
      // El borde de la pantalla (alrededor de ti) también cuenta como obstáculo: rebota dentro de lo que ves.
      const BOUND_X = G.Camera.w / 2 - this.r - 24, BOUND_Y = G.Camera.h / 2 - this.r - 24;
      if (!c.go) { c.go = true; c.dmg0 = this.dmg; this.dmg *= 1.5; this.anim.play('Attack', { speed: 1.8 }); }
      const blocked = a => {
        const ahead = this.r + SPEED * dt + 6;
        const nx = this.x + Math.cos(a) * ahead, ny = this.y + Math.sin(a) * ahead;
        return !G.World.isFree(nx, ny, this.r * 0.6, true) || Math.abs(nx - pl.x) > BOUND_X || Math.abs(ny - pl.y) > BOUND_Y;
      };
      if (blocked(c.dir)) {
        // Choques seguidos (en una esquina) cuentan como uno: así recorre la pantalla.
        if (c.t - (c.lastHit || -9) > 0.35) c.hits++;
        c.lastHit = c.t;
        G.FX.burst(this.x, this.y - this.bodyH * 0.5, '#ffd23f', 10, 200);
        G.FX.sp('pow', 'fire', this.x + Math.cos(c.dir) * this.r, this.y - this.bodyH * 0.5 + Math.sin(c.dir) * this.r * 0.6,
                { life: 0.28, scale: 2, frameRate: 14 });
        for (let k = 0; k < 6; k++) G.FX.sp('rock', 'ground', this.x + Math.cos(c.dir) * this.r, this.y - 6,
                { vx: G.U.rand(-140, 140), vy: G.U.rand(-200, -80), grav: 520, spin: G.U.rand(-10, 10), life: 0.55 });
        G.FX.ring(this.x, this.y, this.r, this.r * 3, '#ff4a4a', 0.35, 4);
        if (G.Camera.sees(this.x, this.y, 60)) { G.Audio.sfx('break'); G.Camera.kick(0.35); }
        // Sentido de las agujas del reloj en pantalla (la y crece hacia abajo): +45°.
        for (let k = 0; k < 8; k++) { c.dir += Math.PI / 4; if (!blocked(c.dir)) break; }
      }
      if (c.hits >= RAMP_HITS || c.t > c.wind + 9) {
        this.dmg = c.dmg0;
        return this.bossEnd();
      }
      return [Math.cos(c.dir) * SPEED, Math.sin(c.dir) * SPEED, 'Walk'];
    }

    bossEnd() {
      const ai = this.ai;
      ai.cast = null;
      ai.cd = G.U.rand(1.3, 2.0);
      if (ai.fury && Math.random() < 0.35) ai.cd = 0.3;    // encadena otro
      return [0, 0, 'Idle'];
    }

    keepsDistance() { return ['ranged', 'fan', 'beamer', 'zoner', 'healer', 'summoner'].includes(this.behavior); }

    shotDmg() { return (this.def.shotDmg || 10) * (this.dmg / this.def.dmg); }

    /** Disparo normal de enemigo (uno, o varios en abanico). */
    shoot(ax, ay, spread = 0, n = 1, k = 1) {
      const sp = 190, type = this.atkType;
      const base = Math.atan2(ay, ax);
      for (let i = 0; i < n; i++) {
        const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
        const shot = G.Projectiles.spawn({
          x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          dmg: this.shotDmg() * k, r: 7, life: 2.4, friendly: false, color: '#ff7a9e', mtype: type,
          vis: G.VFX.forType(type)
        });
        if (G.Coop.isHost) G.Coop.enemyShot(shot, type);
      }
      this.anim.play('Shoot');
      G.FX.ring(this.x, this.y - G.LIFT, 4, 14, '#ff7a9e', 0.2, 2);
    }

    /** Lo que hace cada personalidad cuando le toca (anfitrión / solitario). */
    special(pl, dx, dy) {
      const col = G.U.TYPE_COLOR[this.atkType] || '#ff7a9e';
      switch (this.behavior) {
        case 'fan': { const n = this.def.fanN || 5; this.shoot(dx, dy, n === 3 ? 0.6 : 0.9, n, 0.65); break; }
        case 'beamer':
          // Rayo con aviso: primero se ve la franja en el suelo.
          // ray: es un rayo de verdad (Vuelo Celestial lo ignora; los de los jefes, no).
          G.Hazards.add({ kind: 'beam', x: this.x, y: this.y, angle: Math.atan2(dy, dx), len: 360, w: 22,
                          delay: 1.0, dmg: this.shotDmg() * 1.05, type: this.atkType, color: col, ray: 1 });
          this.anim.play('Charge', { speed: 1.2 });
          break;
        case 'zoner': {
          const n = G.U.randInt(1, this.def.zones || 3);
          for (let i = 0; i < n; i++) {
            G.Hazards.add({ kind: 'zone', x: pl.x + (i ? G.U.rand(-70, 70) : 0), y: pl.y + (i ? G.U.rand(-55, 55) : 0), r: 44,
                            delay: 1.2, dmg: this.shotDmg() * 0.95, type: this.atkType, color: col });
          }
          this.anim.play('Shoot');
          break;
        }
        case 'healer': this.healAround(); break;
        case 'summoner': this.summon(); break;
        default: this.shoot(dx, dy);
      }
    }

    healAround() {
      // 7 % de la vida (era 15 %: con varios curanderos curaban más de lo que
      // pegabas), y más cuanto más fuerte pegas, pero cada vez menos: con el
      // doble de ataque cura un 27 % más, con 10 veces más un 124 %, y como
      // mucho ×2,5. (Como los enemigos que tienen más vida si haces más daño.)
      const pow = Math.max(1, ...G.Game.everyone().map(p => (p.atk > 0 && p.baseAtk > 0 ? p.atk / p.baseAtk : 1)));
      // Anticura (Mejoras): cuenta la del jugador que más tenga.
      const cut = Math.max(0, ...G.Game.everyone().map(p => p.healCut || 0));
      const k = 0.07 * Math.min(2.5, Math.pow(pow, 0.35)) * (1 - Math.min(0.99, cut));
      let n = 0;
      for (const e of G.EnemyMgr.queryCircle(this.x, this.y, 150)) {
        if (e.dead || e.hp >= e.maxHp) continue;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * k);
        G.FX.burst(e.x, e.y - e.bodyH * 0.6, '#7dffb0', 5, 60);
        n++;
      }
      this.anim.play('Charge');
      G.FX.ring(this.x, this.y, 8, 150, '#5fe08a', 0.5, 3);
      if (G.Coop.isHost) G.Coop.broadcast(['fxr', Math.round(this.x), Math.round(this.y), 150, '#5fe08a']);
      if (n && G.Camera.sees(this.x, this.y, 0)) G.Audio.sfx('heal');
    }

    castShields() {
      const near = G.EnemyMgr.queryCircle(this.x, this.y, 160).filter(e => !e.dead)
        .sort((a, b) => G.U.dist2(a.x, a.y, this.x, this.y) - G.U.dist2(b.x, b.y, this.x, this.y)).slice(0, 6);
      for (const e of near) { e.shield = Math.max(e.shield, e.maxHp * 0.35); e.shieldT = 8; }
      this.anim.play('Charge');
      G.FX.ring(this.x, this.y, 8, 160, '#7fc8ff', 0.5, 3);
      if (G.Coop.isHost) G.Coop.broadcast(['fxr', Math.round(this.x), Math.round(this.y), 160, '#7fc8ff']);
    }

    summon() {
      this.minions = this.minions.filter(m => !m.dead && G.EnemyMgr.get(m.id));
      // Con el tope general de enemigos (menos Pokémon en pantalla), con un pequeño margen.
      if (this.minions.length >= 4 || G.EnemyMgr.count > G.Spawner.CAP + 15) return;
      const dex = this.def.minion || this.dex;
      const mon = G.DEX_BY[dex];
      const def = { dex, name: mon ? mon.name : '', hp: Math.round(this.def.hp * 0.35), spd: Math.round(this.def.spd * 1.1),
                    dmg: Math.round(this.def.dmg * 0.6), xp: Math.max(1, Math.round(this.def.xp * 0.25)), behavior: 'chase' };
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * 6.2832;
        const m = new Enemy(def, this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 22, this.sc || { hp: 1, spd: 1, dmg: 1 });
        G.EnemyMgr.add(m);
        this.minions.push(m);
        G.FX.burst(m.x, m.y - 8, '#c47bff', 8, 90);
      }
      this.anim.play('Charge');
      G.FX.ring(this.x, this.y, 8, 50, '#c47bff', 0.4, 3);
    }

    startFuse() {
      this.phase = 'fuse'; this.pt = 1.0;
      G.Hazards.add({ kind: 'zone', x: this.x, y: this.y, r: 62, delay: 1.0, dmg: this.dmg * 1.4, type: this.atkType, color: '#ff7b3d' });
    }

    startJump(pl) {
      const tx = pl.x, ty = pl.y;
      this.jump = { sx: this.x, sy: this.y, tx, ty, t: -0.45, dur: 0.6 };
      this.anim.play('Charge', { speed: 1.4 });
      G.Hazards.add({ kind: 'zone', x: tx, y: ty, r: 50, delay: 1.05, dmg: this.dmg * 1.2, type: this.atkType,
                      color: G.U.TYPE_COLOR[this.atkType] || '#ff7a9e' });
    }

    /** Salto: se agacha, vuela en arco y cae donde estabas. */
    updateJump(dt) {
      const j = this.jump;
      j.t += dt;
      if (j.t < 0) { this.anim.loop('Idle'); return; }
      const k = Math.min(1, j.t / j.dur);
      this.x = j.sx + (j.tx - j.sx) * k;
      this.y = j.sy + (j.ty - j.sy) * k;
      this.jumpLift = Math.sin(k * Math.PI) * 46;
      this.anim.dir = G.Sprites.dirFromAngle(Math.atan2(j.ty - j.sy, j.tx - j.sx));
      if (k >= 1) {
        this.jump = null; this.jumpLift = 0;
        if (!this.flying) G.World.collide(this);
        this.anim.play('Attack', { speed: 1.4 });
      }
    }

    /** Lo llama combat.js cuando te toca: anima el golpe. */
    strike(pl) {
      if (!this.anim.busy()) {
        this.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - this.y, pl.x - this.x));
        this.anim.play('Attack', { speed: 1.5 });
      }
    }

    /**
     * Carga de tren / embestida vista en píxeles (2026-10-16): líneas de velocidad detrás,
     * polvo en los pies y vapor por arriba. Se calcula con lo que se mueve en pantalla,
     * así que también lo ven los invitados (que no tienen ai.cast).
     */
    drawCharge(ctx) {
      const now = performance.now() / 1000, last = this._cv;
      this._cv = { x: this.x, y: this.y, t: now };
      if (!last) return;
      const dt = now - last.t;
      if (dt <= 0 || dt > 0.1) return;
      const dx = this.x - last.x, dy = this.y - last.y, v = Math.hypot(dx, dy) / dt;
      this._cs = (this._cs || 0) * 0.7 + (v > 330 && v < 1400 && !this.jumpLift ? 1 : 0) * 0.3;
      if (this._cs < 0.5) return;
      const a = Math.atan2(dy, dx), ca = Math.cos(a), sa = Math.sin(a), PX = G.Sprites.PX;
      if (now - (this._cdust || 0) > 0.05) {
        this._cdust = now;
        G.FX.sp('puff', 'ground', this.x - ca * this.r + G.U.rand(-6, 6), this.y + G.U.rand(-3, 3),
                { vx: -ca * 50, vy: -12, life: 0.45, frameRate: 7 });
        if (Math.random() < 0.35) G.FX.sp('puff', 'normal', this.x - ca * this.r * 0.4, this.y - this.bodyH - 2,
                { vx: -ca * 40, vy: -55, life: 0.6, frameRate: 5 });
      }
      // Líneas de velocidad: tramos de bloques blancos detrás del cuerpo (giro a 16 direcciones).
      ctx.save();
      ctx.translate(Math.round(this.x), Math.round(this.y - this.bodyH * 0.5));
      ctx.rotate(Math.round(a / (Math.PI / 8)) * (Math.PI / 8));
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * Math.max(6, this.bodyH * 0.22), h = G.U.hash(i, Math.floor(now * 20), 3);
        const len = Math.round((16 + h * 22) / PX) * PX, x0 = -this.r - len - Math.round(h * 10 / PX) * PX;
        ctx.globalAlpha = 0.75; ctx.fillStyle = '#ffffff';
        ctx.fillRect(x0, Math.round(off / PX) * PX, len, PX);
        ctx.globalAlpha = 0.4; ctx.fillRect(x0 - len * 0.6, Math.round(off / PX) * PX, Math.round(len * 0.4 / PX) * PX, PX);
      }
      ctx.restore();
    }

    /**
     * Iconos de estado encima de la cabeza (2026-10-16, V3.1): llama (quemado), gota morada
     * (envenenado), gota roja (sangrando). Píxeles de 2×2 dibujados con fillRect (sin imágenes
     * ni filtros), sólo si está en pantalla.
     */
    drawStatus(ctx) {
      const now = performance.now();
      const st = [];
      if (this.burn > 0 || (this.net && this.net.st & 1)) st.push('burn');
      if (this.poison > 0 || (this.net && this.net.st & 2) || (this.stPoison || 0) > now) st.push('poison');
      if ((this.stBleed || 0) > now) st.push('bleed');
      if (!st.length || !G.Camera.sees(this.x, this.y, 40)) return;
      const P = 3, y0 = Math.round(this.y - this.bodyH - (this.hp < this.maxHp || this.boss ? 32 : 24) - (this.elite ? 12 : 0));
      let x = Math.round(this.x - (st.length * 15 - 3) / 2);
      const bob = Math.floor(now / 250) % 2;
      for (const k of st) {
        const rows = STATUS_ICON[k];
        rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) {
          const c = r[i]; if (c === '.') continue;
          ctx.fillStyle = STATUS_PAL[k][c]; ctx.fillRect(x + i * P, y0 + j * P - (k === 'burn' ? bob : 0), P, P);
        } });
        x += 15;
      }
    }

    draw(ctx) {
      let alpha = this.dead ? G.U.clamp(this.fade / 0.5, 0, 1) : 1;
      if (alpha <= 0) return;
      // Sigiloso (2026-10-16): de lejos, casi transparente y parpadeando.
      const sneak = this.has('stealth') && !this.dead ? Enemy.sneakAlpha(this) : 1;
      alpha *= sneak;
      const raging = !this.dead && (this.raging || !!(this.net && this.net.st & 8));

      const gold = this.golden || this.behavior === 'thief' || (this.remote && !this.boss && G.Events.golden);
      // Élite: aro de su color latiendo bajo los pies.
      if (this.elite && !this.dead) {
        const E = raging ? Enemy.ELITE.rage : Enemy.ELITE[this.elite];
        ctx.save();
        ctx.globalAlpha = (0.3 + Math.sin(this.bob * (raging ? 2.4 : 0.8)) * 0.12) * sneak;
        ctx.fillStyle = E.color;
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.9, this.r * 0.75, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.85 * sneak; ctx.strokeStyle = E.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 2.2, this.r * 0.9, 0, 0, 6.2832); ctx.stroke();
        ctx.restore();
      }
      if (raging && sneak > 0.5) Enemy.rageSteam(this);
      if ((this.boss || this.shiny || gold) && !this.dead) {
        ctx.save();
        ctx.globalAlpha = (gold && !this.boss ? 0.32 : 0.22) + Math.sin(this.bob * 0.5) * 0.06;
        ctx.fillStyle = this.ai && this.ai.fury ? '#ff4a4a' : this.shiny ? '#9ae6ff' : gold ? '#ffd23f' : '#ffd95e';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.6, this.r * 0.6, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
      }

      if (this.boss && !this.dead) this.drawCharge(ctx);

      ctx.save();
      ctx.globalAlpha = alpha;
      G.Sprites.drawShadow(ctx, this.dex, this.x, this.y, this.scale);
      // Los que flotan ya van en el aire en su sprite: sólo se mecen un poco.
      // (Y los que saltan, en arco.)
      const lift = (this.flying && !this.boss ? 1 + Math.sin(this.bob) * 1.5 : 0) + (this.jumpLift || 0);
      // Furia: el sprite enrojecido (filtro del canvas; donde no lo hay, sólo el aura y el vapor).
      // (2026-10-16: la hoja enrojecida se hace una vez y se guarda; ctx.filter en cada dibujo iba muy lento en el móvil.)
      // Confundido: gira en el sitio (una dirección cada 0,09 s).
      const conf = !this.dead && (this.confT > 0 || !!(this.net && this.net.st & 32));
      if (conf) this.anim.dir = Math.floor(performance.now() / 90) % 8;
      const burning = this.burn > 0 || !!(this.net && this.net.st & 1);
      const burnBlink = burning && !raging && Enemy.FILTER && Math.floor(performance.now() / 140) % 2 === 0;
      this.anim.draw(ctx, this.x, this.y - lift, { flash: this.flash > 0, alpha, tint: raging && Enemy.FILTER ? RAGE_TINT : burnBlink ? BURN_TINT : null });
      ctx.restore();

      if (this.dead) return;

      // Congelado: bloque de hielo de píxeles encima (combat.js lo rompe en esquirlas al acabar).
      if (this.freezeT > 0 || (this.net && this.net.st & 16)) {
        const k = this.bodyH > 44 ? 2 : 1.5;
        G.VFX.draw(ctx, 'icecube', 'ice', this.x, this.y - lift - this.bodyH * 0.45, { scale: k * Math.max(1, this.bodyH / 40), alpha: 0.8 });
      }
      // Confundido: estrellitas girando sobre la cabeza.
      if (conf) {
        const t = performance.now() / 260, cy = this.y - lift - this.bodyH - 6;
        for (let i = 0; i < 3; i++) {
          const a = t + i * 2.094;
          G.VFX.draw(ctx, 'star', 'psychic', this.x + Math.cos(a) * (this.r + 4), cy + Math.sin(a) * 3, { frame: i, alpha: Math.sin(a) > 0 ? 1 : 0.66 });
        }
      }

      // Escudo: burbuja azul.
      if (this.shield > 0 || (this.net && this.net.st & 4)) {
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.sin(this.bob) * 0.08;
        ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(127,200,255,.14)';
        ctx.beginPath(); ctx.ellipse(this.x, this.y - this.bodyH * 0.45, this.r * 1.5, this.bodyH * 0.65, 0, 0, 6.2832);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      if (this.burn > 0 || this.poison > 0 || (this.net && this.net.st & 3)) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = this.burn > 0 || (this.net && this.net.st & 1) ? '#ff8a3d' : '#c86bdc';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.2, this.r * 0.5, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
      }

      // Élite: "Élite · afijo · afijo" encima, cada afijo en su color (2026-10-16: pueden ser dos).
      if (this.elite) {
        const parts = [[G.T('Élite'), '#ffe9c8']];
        for (const a of this.affixes || [this.elite]) parts.push([G.T(Enemy.ELITE[a].name), a === 'rage' && raging ? '#ff2a2a' : Enemy.ELITE[a].color]);
        ctx.save();
        ctx.font = '800 10px Pixelify,"Segoe UI",system-ui,sans-serif';
        ctx.globalAlpha = Math.max(0.35, sneak);
        const sup = this.behavior === 'healer' || this.behavior === 'shielder' || this.behavior === 'summoner';
        const ly = this.y - this.bodyH - (this.hp < this.maxHp ? 16 : 8) - (sup ? 14 : 0);
        const sep = ' · ', ws = parts.map(([t]) => ctx.measureText(t).width), wsep = ctx.measureText(sep).width;
        let x = this.x - (ws.reduce((a, b) => a + b, 0) + wsep * (parts.length - 1)) / 2;
        ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        parts.forEach(([t, col], i) => {
          if (i) { ctx.strokeText(sep, x, ly); ctx.fillStyle = '#c9d6ff'; ctx.fillText(sep, x, ly); x += wsep; }
          ctx.strokeText(t, x, ly); ctx.fillStyle = col; ctx.fillText(t, x, ly); x += ws[i];
        });
        ctx.restore();
      }

      // Apoyos: icono encima, para saber a quién ir primero.
      const SUP = { healer: 'heart', shielder: 'shield', summoner: 'friends' };
      if (SUP[this.behavior]) G.Icons.draw(ctx, SUP[this.behavior], Math.round(this.x - 6), Math.round(this.y - this.bodyH - (this.hp < this.maxHp ? 26 : 18)), 12);

      if (sneak > 0.5) this.drawStatus(ctx);

      if ((this.boss || this.hp < this.maxHp) && sneak > 0.5) {
        const w = this.boss ? 90 : Math.max(22, this.r * 2);
        const y = this.y - this.bodyH - 10;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(this.x - w / 2, y, w, 3.4);
        ctx.fillStyle = this.boss ? '#ffcb3d' : '#ff5f6d';
        ctx.fillRect(this.x - w / 2, y, w * Math.max(0, this.hp / this.maxHp), 3.4);
      }
    }
  }

  // Iconos de estado (4×5 píxeles): k contorno, a/b colores.
  const STATUS_ICON = {
    burn:   ['.k..', 'kakk', 'kabk', 'kbbk', '.kk.'],
    poison: ['.k..', 'kak.', 'kabk', 'kbbk', '.kk.'],
    bleed:  ['.k..', 'kak.', 'kabk', 'kbbk', '.kk.']
  };
  const STATUS_PAL = {
    burn:   { k: '#3a1206', a: '#ffe14d', b: '#ff6a1f' },
    poison: { k: '#2e0a3c', a: '#e8b8ff', b: '#a043d0' },
    bleed:  { k: '#3a0610', a: '#ff9da8', b: '#d0202e' }
  };

  // ---------------- gestor ----------------

  /** Afijos de élite: nombre (en español, se traduce) y color. (2026-10-16: +explode, stealth, rage) */
  Enemy.ELITE = {
    fast:    { name: 'Veloz', color: '#7fe0ff' },
    shield:  { name: 'Escudo', color: '#9fd8ff' },
    split:   { name: 'Divisor', color: '#5fe08a' },
    blink:   { name: 'Teletransporte', color: '#c47bff' },
    explode: { name: 'Explosivo', color: '#ff7a3d' },
    stealth: { name: 'Sigiloso', color: '#b8c4d8' },
    rage:    { name: 'Furioso', color: '#ff5f6d' }
  };
  /*
   * Números de los afijos (2026-10-16, ver docs/dev/MOD-NOTES.md):
   *   shield   burbuja = 40 % de la vida máxima, no se recarga
   *   split    2 hijos, ×0,8 de tamaño, cada uno con la mitad de la vida de uno normal
   *   explode  círculo de 70 px + su radio, explota a los 0,8 s: ×1,6 su daño de contacto
   *   stealth  se ve a menos de 160 px (5 casillas); al golpearlo, 1,5 s a la vista
   *   rage     por debajo del 30 %: ×1,4 velocidad y ×1,25 daño
   * Segundo afijo: 4 % + 7 % por piso + algo con el tiempo (desde el min 10), como mucho 40 %.
   */
  Enemy.AFX = { shield: 0.4, splitHp: 0.5, boomR: 70, boomDelay: 0.8, boomDmg: 1.6, seeR: 160, reveal: 1.5,
                rageAt: 0.3, rageSpd: 1.4, rageDmg: 1.25 };
  Enemy.FILTER = (() => { try { const c = document.createElement('canvas').getContext('2d'); return !!c && 'filter' in c; } catch (e) { return false; } })();
  /** Afijos para un élite nuevo: uno siempre; a veces un segundo distinto. */
  Enemy.rollAffixes = t => {
    const keys = Object.keys(Enemy.ELITE), a = G.U.pick(keys);
    const p2 = Math.min(0.4, 0.04 + 0.07 * ((G.Floors && G.Floors.floor) || 0) + Math.max(0, t - 600) / 3000);
    return Math.random() < p2 ? [a, G.U.pick(keys.filter(k => k !== a))] : [a];
  };
  /** Transparencia de un «Sigiloso» para TU pantalla (cada uno lo ve según lo cerca que esté). */
  Enemy.sneakAlpha = e => {
    const pl = G.Game.player;
    if ((e.revealUntil || 0) > performance.now()) return 1;
    if (!pl || G.U.dist2(e.x, e.y, pl.x, pl.y) < Enemy.AFX.seeR * Enemy.AFX.seeR) return 1;
    // Parpadeo a escalones (como el pixel art): casi invisible y, a ratos, un poco más.
    const k = Math.floor(performance.now() / 120 + e.id) % 7;
    return k === 0 ? 0.42 : k === 3 ? 0.26 : 0.13;
  };
  /** Burbuja rota: esquirlas azules y un aro. */
  Enemy.shieldPop = e => {
    if (!G.Camera.sees(e.x, e.y, 60)) return;
    const cy = e.y - e.bodyH * 0.45;
    G.FX.ring(e.x, cy, e.r, e.r * 3, '#9fd8ff', 0.4, 4);
    G.FX.burst(e.x, cy, '#cdeeff', 18, 220);
    G.FX.burst(e.x, cy, '#5fb4ff', 10, 150);
    G.FX.dmgText(e.x, e.y - e.bodyH - 18, G.T('¡Escudo roto!'), '#9fd8ff', true);
    G.Audio.sfx('break');
  };
  /** Entra en furia: estallido rojo y aviso. */
  Enemy.rageFx = e => {
    if (!G.Camera.sees(e.x, e.y, 60)) return;
    G.FX.ring(e.x, e.y, e.r, e.r * 3.4, '#ff4a4a', 0.45, 5);
    G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#ff6b4d', 22, 200);
    G.FX.dmgText(e.x, e.y - e.bodyH - 18, G.T('¡Furia!'), '#ff4a4a', true);
  };
  /** Vapor rojo que sube de un furioso (píxeles sueltos). */
  Enemy.rageSteam = e => {
    if (Math.random() > 0.45 || !G.Camera.sees(e.x, e.y, 20)) return;
    const x = e.x + G.U.rand(-e.r, e.r), y = e.y - G.U.rand(e.bodyH * 0.4, e.bodyH);
    G.FX.px(x, y, Math.random() < 0.5 ? '#ff4a4a' : '#ffb0a0', { vy: -46, life: 0.45 });
  };

  G.Enemy = Enemy;

  G.EnemyMgr = (() => {
    let list = [];            // vivos
    let corpses = [];         // cayendo / desvaneciéndose
    const CELL = 52;
    const grid = new Map();

    const byId = new Map();
    function clear() { list = []; corpses = []; grid.clear(); byId.clear(); }
    function all() { return list; }
    function add(e) {
      list.push(e);
      byId.set(e.id, e);
      if (G.Coop.isHost) G.Coop.enemyAdded(e);
      return e;
    }
    function get(id) { return byId.get(id); }

    /** Copia local de un enemigo del anfitrión (cooperativo). */
    function addRemote(o) {
      if (byId.has(o.id)) return byId.get(o.id);
      const def = { dex: o.dex, hp: o.hp, spd: 0, dmg: o.dmg, xp: 0, behavior: o.beh || 'remote', raid: !!o.raid };
      const e = new Enemy(def, o.x, o.y, { hp: 1, spd: 1, dmg: 1 }, o.boss);
      e.id = o.id;
      e.remote = true;
      if (o.shiny) e.makeShiny();
      if (o.elite) e.makeElite(o.elite, true);
      if (o.small) e.makeSmall();
      e.maxHp = o.hp; e.hp = o.hp;
      e.net = { x: o.x, y: o.y, vx: 0, vy: 0, age: 0, dir: 0, anim: 0, st: 0 };
      list.push(e);
      byId.set(e.id, e);
      return e;
    }

    // --- arena de la grieta ---
    let stashed = null;

    /** Guarda los enemigos del mapa mientras dura la arena. */
    function stash() {
      stashed = list.filter(e => !e.dead);
      for (const e of stashed) byId.delete(e.id);
      list = []; corpses = [];
    }

    /** Al volver: quita los de la arena y devuelve los del mapa (avisando a los demás). */
    function restore() {
      for (const e of list) { byId.delete(e.id); if (G.Coop.isHost) G.Coop.enemyGone(e, false); }
      list = []; corpses = [];
      for (const e of stashed || []) add(e);
      stashed = null;
    }

    /** Invitado: borra las copias (llegarán otra vez del anfitrión). */
    function clearRemote() {
      for (const e of list) if (e.remote) byId.delete(e.id);
      list = list.filter(e => !e.remote);
      corpses = corpses.filter(e => !e.remote);
    }

    /** Anfitrión/solitario: quita un enemigo sin que cuente como derrotado (el jefe de incursión que se va). */
    function remove(e) {
      const i = list.indexOf(e);
      if (i < 0) return;
      list.splice(i, 1); byId.delete(e.id);
      G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#c9d6ff', 24, 200);
      if (G.Coop.isHost) G.Coop.enemyGone(e, false);
    }

    /** Quita una copia (el anfitrión dice que ha caído o que se ha alejado). */
    function removeRemote(id, died) {
      const e = byId.get(id);
      if (!e) return;
      byId.delete(id);
      if (died) { e.die(); G.Progress.kill(e); }
      const i = list.indexOf(e);
      if (i >= 0) list.splice(i, 1);
      if (died) corpses.push(e);
    }

    function key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }

    function rebuildGrid() {
      grid.clear();
      for (const e of list) {
        if (e.dead) continue;
        const k = key(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
        let b = grid.get(k);
        if (!b) grid.set(k, b = []);
        b.push(e);
      }
    }

    /** Enemigos vivos cuyo círculo toca este círculo. */
    function queryCircle(x, y, r) {
      const out = [];
      const c0x = Math.floor((x - r) / CELL) - 1, c1x = Math.floor((x + r) / CELL) + 1;
      const c0y = Math.floor((y - r) / CELL) - 1, c1y = Math.floor((y + r) / CELL) + 1;
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const b = grid.get(key(cx, cy));
          if (!b) continue;
          for (const e of b) {
            if (e.dead) continue;
            const rr = r + e.r;
            if (G.U.dist2(x, y, e.x, e.y) <= rr * rr) out.push(e);
          }
        }
      }
      return out;
    }

    function separate(dt) {
      for (const e of list) {
        if (e.dead) continue;
        const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
        let px = 0, py = 0, n = 0;
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const b = grid.get(key(cx + i, cy + j));
            if (!b) continue;
            for (const o of b) {
              if (o === e || o.dead) continue;
              const min = (e.r + o.r) * 0.82;
              const dx = e.x - o.x, dy = e.y - o.y;
              const d2 = dx * dx + dy * dy;
              if (d2 > min * min || d2 < 1e-4) continue;
              const d = Math.sqrt(d2);
              const f = (min - d) / min;
              px += (dx / d) * f; py += (dy / d) * f;
              if (++n > 6) break;
            }
          }
        }
        if (n) {
          e.x += px * 42 * dt;
          e.y += py * 42 * dt;
          if (!e.flying) G.World.collide(e);
        }
      }
    }

    /** El jugador vivo más cercano (los caídos no atraen a nadie). */
    function nearestPlayer(players, x, y) {
      let best = null, bd = Infinity;
      for (const p of players) {
        if (p.dead) continue;
        const d = G.U.dist2(x, y, p.x, p.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }

    /**
     * @param players  [jugador local, ...compañeros]. Las estadísticas de la
     *                 run (derrotados, jefes) se apuntan en el primero.
     */
    // Segundos que un rezagado tiene que llevar fuera de la vista antes de volver por delante.
    const LAG_T = 2.5;

    function update(dt, players) {
      if (!Array.isArray(players)) players = [players];
      const pl = players[0];
      // Velocidad suavizada de cada jugador (vale también para los compañeros).
      for (const p of players) {
        if (p._px != null && dt > 0) {
          const k = Math.min(1, dt * 5);
          p._vx += ((p.x - p._px) / dt - p._vx) * k; p._vy += ((p.y - p._py) / dt - p._vy) * k;
          if (Math.abs(p.x - p._px) > 200 || Math.abs(p.y - p._py) > 200) p._vx = p._vy = 0;    // teletransporte
        } else { p._vx = 0; p._vy = 0; }
        p._px = p.x; p._py = p.y;
      }
      rebuildGrid();
      for (const e of list) {
        if (e.remote) e.netUpdate(dt);
        // «Proteger a Dazhuang» (guard.js): van a por Dazhuang (`goal`) salvo con un jugador encima.
        else if (e.goal && !e.goal.dead) {
          const np = nearestPlayer(players, e.x, e.y);
          e.update(dt, np && G.U.dist2(np.x, np.y, e.x, e.y) < 130 * 130 ? np : e.goal);
        }
        // Jefe de incursión: va a por el que ha fichado (raid.js).
        else e.update(dt, (e.lockOn && !e.lockOn.dead && players.includes(e.lockOn) && e.lockOn) || nearestPlayer(players, e.x, e.y) || pl);
      }
      if (!G.Coop.active || G.Coop.isHost) separate(dt);
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (e.remote) continue;
        if (e.dead) {
          pl.kills++;
          if (e.boss) pl.bosses++;
          G.Progress.kill(e);
          corpses.push(e);
          list.splice(i, 1);
          byId.delete(e.id);
          if (G.Coop.isHost) G.Coop.enemyGone(e, true);
          continue;
        }
        const near = nearestPlayer(players, e.x, e.y) || pl;
        // El duende del tesoro se escapa si no lo atrapas a tiempo.
        if (e.behavior === 'thief' && (e.life -= dt) <= 0) {
          G.FX.burst(e.x, e.y - 10, '#ffd23f', 16, 140);
          G.Spawner.say('¡' + e.name + ' se ha escapado!', 2.4);
          list.splice(i, 1); byId.delete(e.id);
          if (G.Coop.isHost) G.Coop.enemyGone(e, false);
          continue;
        }
        if (e.boss || e.shiny || e.dummy || e.goal || G.Rift.inArena) continue;     // (dummy: muñeco de la sala de entrenamiento; goal: oleada de guard.js)
        // Rezagados: los que se quedan atrás mientras corres y llevan un rato
        // FUERA DE LA VISTA (de todos) vuelven a salir por delante de ti. Así
        // no se puede huir sin más, y nunca desaparece uno que estés viendo.
        const d2 = G.U.dist2(e.x, e.y, near.x, near.y);
        const R = G.Camera.outerRadius() + 40;
        const unseen = d2 > R * R && !G.Camera.sees(e.x, e.y, 60);
        const sp = Math.hypot(near._vx || 0, near._vy || 0);
        const behind = sp > 40 && ((e.x - near.x) * near._vx + (e.y - near.y) * near._vy) < -0.2 * Math.sqrt(d2) * sp;
        if (unseen && behind) e.lagT += dt;
        else if (!unseen) e.lagT = 0;
        if ((unseen && e.lagT > LAG_T) || d2 > 1400 * 1400) {
          e.lagT = 0;
          if (!G.Spawner.ahead(e, near)) { list.splice(i, 1); byId.delete(e.id); if (G.Coop.isHost) G.Coop.enemyGone(e, false); }
        }
      }
      for (let i = corpses.length - 1; i >= 0; i--) {
        if (corpses[i].remote) corpses[i].netUpdate(dt); else corpses[i].update(dt, pl);
        if (corpses[i].fade <= 0) corpses.splice(i, 1);
      }
      if (corpses.length > 120) corpses.splice(0, corpses.length - 120);
    }

    /** Lo que hay que dibujar ordenado por Y junto al resto de la escena. */
    function drawables(cam) {
      const out = [];
      for (const e of corpses) if (cam.sees(e.x, e.y, 80)) out.push(e);
      for (const e of list) if (cam.sees(e.x, e.y, 80)) out.push(e);
      return out;
    }

    function bossAlive() { return list.some(e => e.boss && !e.dead); }
    function shinies() { return list.filter(e => e.shiny && !e.dead); }

    return { clear, all, add, get, remove, addRemote, removeRemote, stash, restore, clearRemote, update, drawables, queryCircle, rebuildGrid, bossAlive, shinies, nearestPlayer,
             get count() { return list.length; } };
  })();
})();
