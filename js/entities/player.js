/* ============ player.js — el Pokémon que controlas ============
 * (x, y) son los PIES. Sólo UN movimiento está activo a la vez: se dispara
 * solo y se cambia con 1-4 / Q / E. Cada disparo reproduce la animación de
 * ataque de Mundo Misterioso que le toca (Attack, Shoot o Charge).
 */
G.Player = class Player {
  /**
   * @param mon   entrada de G.DEX
   * @param perks mejoras permanentes ya resueltas (ver data/upgrades.js)
   */
  constructor(mon, perks = {}, shiny = false) {
    this.mon = mon;
    this.dex = mon.dex;
    this.shiny = shiny && G.Sprites.hasShiny(mon.dex);
    this.anim = new G.Sprites.Animator(mon.dex, 1, this.shiny);
    this.x = 0; this.y = 0;
    this.r = G.Sprites.bodyRadius(mon.dex);
    this.bodyH = G.Sprites.bodyHeight(mon.dex);

    this.atkMul = perks.atkMul || 1;
    this.spdMul = perks.spdMul || 1;
    this.cdMul = perks.cdMul || 1;
    this.dmgReduce = perks.dmgReduce || 0;
    this.regenFlat = perks.regen || 0;
    this.magnet = 78 * (perks.magnetMul || 1);
    this.xpMul = perks.xpMul || 1;
    this.coinMul = perks.coinMul || 1;

    this.maxHp = mon.hp + (perks.hp || 0);
    this.hp = this.maxHp;
    this.baseSpd = mon.spd;
    this.baseAtk = mon.atk;

    this.moves = [];           // todos los movimientos aprendidos
    this.slots = [];           // huecos: cada uno, una lista de movimientos que se lanzan a la vez
    this.active = 0;           // hueco activo
    this.maxMoves = 5;         // huecos (2026-10-15: antes 4; los de apoyo y pasivos también ocupan)
    this.bonds = 0;            // vínculos por usar (premio de los legendarios)

    this.buffs = {
      atk: { n: 0, t: 0, amount: 0 },
      spd: { n: 0, t: 0, amount: 0 },
      def: { n: 0, t: 0, amount: 0 },
      regen: { n: 0, t: 0, amount: 0 }
    };

    this.level = 1;
    this.xp = 0;
    this.xpNext = Player.xpFor(1);
    this.kills = 0;
    this.bosses = 0;
    this.rerolls = 0;          // veces que ha cambiado las cartas de nivel en esta run
    this.rerollBonus = perks.rerolls || 0;   // cambios comprados en Mejoras (más el gratis)
    this.critChance = perks.crit || 0;       // probabilidad de golpe crítico (Mejoras)
    this.healCut = perks.healCut || 0;       // Anticura: cuánto menos curan los curanderos enemigos
    this.shieldBreak = !!perks.shieldBreak;  // Rompescudos: los escudos enemigos no paran nada
    this.banned = new Set();                 // movimientos vetados (Mejoras → Veto): no salen en las cartas
    this.bind = {};                          // movimiento -> hueco fijo (0-3), elegido en Mejoras
    this.coins = 0;            // monedas recogidas en esta run
    this.t1 = 0; this.t10 = 0; // tickets del gacha recogidos en esta run
    this.dmgDealt = 0;

    this.invuln = 0;
    this.flash = 0;
    this.aim = Math.PI / 2;
    this.moveAngle = Math.PI / 2;
    this.walking = false;
    this.inLiquid = false;
    this.lavaTick = 0;
    this.attackFace = 0;       // tiempo que sigue mirando al objetivo tras atacar
    this.dead = false;
    this.power = null;         // poder de altar activo: { def, t, dur }
    this.slowT = 0;            // pegado por una trampa
    this.items = [];           // objetos equipados (data/items.js): hasta MAX_ITEMS (2 desde 2026-10-15)
    this.sashT = -999;         // última vez que salvó la Banda Focus
    this.bellHeal = 0;         // curación pendiente del Cascabel Concha
    this.statsTaken = {};      // mejoras de stat cogidas (condición de evolución)
  }

  /** Segundos que hay que estar junto a un compañero caído para levantarlo. */
  // (2026-10-15: antes 3 s y a 56 px; a partir de media partida te rodeaban y no daba tiempo.)
  static get REVIVE_TIME() { return 1.5; }
  static get REVIVE_R() { return 80; }

  // (×2 y luego ×4 el 2026-10-10: se subía de nivel demasiado rápido.)
  static xpFor(level) {
    return Math.floor((8 + level * 6 + Math.pow(level, 1.75) * 1.6) * 4);
  }

  cy() { return this.y; }

  // ---------------- stats efectivos ----------------
  // calmN/calmAmt: Paz Mental (apoyo, combat.js)
  get atk() { return this.baseAtk * this.atkMul * (1 + this.buffs.atk.n * this.buffs.atk.amount) * (1 + (this.calmN || 0) * (this.calmAmt || 0)); }
  get spd() {
    const s = this.baseSpd * this.spdMul * (1 + this.buffs.spd.n * this.buffs.spd.amount) * (this.slowT > 0 ? 0.5 : 1);
    const w = G.Weather.speedFor(this.mon.types);
    const slow = this.inLiquid ? G.World.liquidEffect(this.mon.types).slow || 1 : 1;
    return s * slow * w;
  }
  // bulkRed: Peso Pesado (combat.js), que también da bulkArmor contra los choques.
  // + Paz Mental y Velo Sagrado evolucionado (apoyo)
  get reduction() { return Math.min(0.8, this.dmgReduce + (this.bulkRed || 0) + (this.potionRed || 0) + this.buffs.def.n * this.buffs.def.amount + (this.calmN || 0) * (this.calmAmt || 0) + (this.supRed || 0)); }
  get regen() { return this.regenFlat + this.buffs.regen.n * this.buffs.regen.amount; }

  // ---------------- movimientos ----------------
  addMove(id) {
    if (this.slots.length >= this.maxMoves || this.hasMove(id)) return false;
    // Reto semanal "Un solo ataque": sólo un movimiento que no sea potenciador.
    if (G.Modes.rule('oneMove') && G.Moves.BY_ID[id] && G.Moves.BY_ID[id].kind !== 'buff' && this.moves.some(m => m.kind !== 'buff')) return false;
    const m = G.Moves.instance(id, 1);
    this.moves.push(m);
    const group = [m];
    this.slots.push(group);
    this.arrange();
    // Se cambia al nuevo, salvo si estás usando un vínculo (no te quita el grupo).
    if (!(this.slots[this.active] && this.slots[this.active].length > 1)) this.setActive(this.slots.indexOf(group));
    return true;
  }

  /**
   * Huecos fijos (Mejoras → Atajos): cada movimiento con hueco elegido se pone
   * en ese número para la memoria muscular (Confusión siempre en el 1...).
   * Mientras no tengas tantos movimientos, va al más cercano; los demás
   * rellenan los huecos libres en el orden en que los aprendiste.
   */
  arrange() {
    const n = this.slots.length;
    const cur = this.slots[this.active];
    // Pasivos y de apoyo, siempre a la derecha (2026-10-15: un ataque nuevo se ponía detrás de
    // ellos). Los ataques, a la izquierda en su orden (o en su hueco fijo, abajo).
    const isP = g => g.length > 0 && g.every(m => G.Moves.isPassive(m));
    const passivesLast = () => {
      this.slots = this.slots.filter(g => !isP(g)).concat(this.slots.filter(isP));
      if (cur) this.active = this.slots.indexOf(cur);
    };
    if (n < 2 || !this.bind) { passivesLast(); return; }
    const want = g => { let k = Infinity; for (const m of g) if (this.bind[m.id] != null) k = Math.min(k, this.bind[m.id]); return k; };
    const out = new Array(n).fill(null);
    const bound = this.slots.filter(g => want(g) < Infinity).sort((a, b) => want(a) - want(b));
    for (const g of bound) {
      let p = Math.min(want(g), n - 1);
      while (p >= 0 && out[p]) p--;                          // ocupado: el de antes
      if (p < 0) { p = 0; while (out[p]) p++; }              // o el primero libre
      out[p] = g;
    }
    for (const g of this.slots) if (!out.includes(g)) out[out.indexOf(null)] = g;
    this.slots = out;
    passivesLast();
  }

  hasMove(id) { return this.moves.some(m => m.id === id); }

  /** ¿Ese hueco es sólo de pasivos? (funcionan siempre: no se eligen como ataque) */
  passiveSlot(i) { const g = this.slots[i]; return !!g && g.length > 0 && g.every(m => G.Moves.isPassive(m)); }

  setActive(i) {
    if (i < 0 || i >= this.slots.length || i === this.active || this.passiveSlot(i)) return;
    // Cinta Elección: no se puede cambiar de movimiento.
    if (this.hasItem('choiceband') && this.slots[this.active]) {
      G.FX.dmgText(this.x, this.y - this.bodyH - 8, 'Cinta Elección', '#ff8ad8');
      return;
    }
    this.active = i;
    G.Projectiles.clearOrbs(this);
    G.Audio.sfx('select');
    for (const m of this.slots[i]) m.t = Math.min(m.t, m.cd * 0.35);
    const m = this.slots[i][0];
    G.FX.ring(this.x, this.y - G.LIFT * 0.5, 6, this.r * 3.4, G.U.TYPE_COLOR[m.type], 0.3, 3);
  }

  cycle(dir) {
    const n = this.slots.length;
    if (!n) return;
    // Se saltan los huecos de pasivos.
    for (let k = 1; k < n; k++) {
      const i = ((this.active + dir * k) % n + n) % n;
      if (!this.passiveSlot(i)) { this.setActive(i); return; }
    }
  }

  // ---------------- vínculos (fusiones) ----------------
  // Cada legendario vencido da un vínculo. Con él se juntan movimientos en un
  // solo hueco y se lanzan a la vez. Sólo crece un grupo (hasta BOND_MAX); si
  // no hay ninguno a medias, el vínculo une dos movimientos sueltos.
  static get BOND_MAX() { return 5; }      // 2026-10-15: antes 4 (lo pidió el dueño)

  /** Lo que se puede hacer ahora con un vínculo: añadir a un grupo o unir dos sueltos. */
  bondOptions() {
    const loose = this.slots.filter(s => s.length === 1).map(s => s[0]);
    const grow = this.slots.find(s => s.length > 1 && s.length < Player.BOND_MAX);
    if (grow) return loose.length ? { mode: 'add', group: grow, loose } : null;
    return loose.length >= 2 ? { mode: 'pair', group: null, loose } : null;
  }

  /** Junta `moves` (sueltos) en el grupo `group` (o en uno nuevo) y gasta un vínculo. */
  fuse(moves, group = null) {
    const target = group || this.slots.find(s => s[0] === moves[0]);
    const cur = this.slots[this.active];
    for (const m of moves) {
      if (target.includes(m)) continue;
      const i = this.slots.findIndex(s => s.length === 1 && s[0] === m);
      if (i < 0) continue;
      this.slots.splice(i, 1);
      target.push(m);
    }
    this.arrange();
    // Se pasa al grupo, salvo con la Cinta Elección (sigues en el hueco que tenías, si queda).
    const a = this.slots.indexOf(cur);
    this.active = this.hasItem('choiceband') && a >= 0 ? a : this.slots.indexOf(target);
    this.bonds = Math.max(0, this.bonds - 1);
    G.Projectiles.clearOrbs(this);
    return target;
  }

  /** Movimientos que se lanzan ahora (el grupo del hueco activo). */
  activeGroup() { return this.slots[this.active] || []; }

  activeMove() { return this.activeGroup()[0]; }

  /**
   * Lo llama combat.js al lanzar un movimiento. Elige la animación de PMD y la
   * acelera si la recarga es más corta que la animación, para que encadene.
   */
  cast(m) {
    // Vidasfera: cada ataque cuesta un poco de vida (nunca te deja KO).
    if (this.hasItem('lifeorb') && m.kind !== 'orbit' && m.kind !== 'trail' && !this.remote) {
      this.hp = Math.max(1, this.hp - Math.max(1, this.maxHp * 0.01));
    }
    const anim = { melee: 'Attack', beam: 'Shoot', projectile: 'Shoot', nova: 'Attack',
                   aura: 'Charge', buff: 'Charge', orbit: 'Charge', boomerang: 'Shoot', chain: 'Shoot',
                   mine: 'Charge', meteor: 'Charge', turret: 'Charge', dash: 'Attack', trail: 'Walk', cone: 'Shoot',
                   lightning: 'Charge', drain: 'Attack', psyarrow: 'Shoot',
                   acidrain: 'Charge', fist: 'Attack', spear: 'Shoot', treefall: 'Charge' }[m.kind] || 'Attack';
    // Las familias nuevas suenan como la parecida de las de siempre.
    const SND = { boomerang: 'projectile', chain: 'beam', mine: 'nova', meteor: 'nova', turret: 'buff', dash: 'melee', trail: 'aura', cone: 'projectile',
                  lightning: 'beam', drain: 'melee', flameshield: 'aura', psyarrow: 'projectile',
                  acidrain: 'aura', fist: 'melee', spear: 'projectile', treefall: 'nova' };
    // El rastro no suena a cada charco (sería un zumbido constante).
    if (m.kind !== 'trail') G.Audio.sfx('shot', { kind: SND[m.kind] || m.kind, type: m.type });
    if (m.kind === 'trail') return;
    // No reinicies una animación que va por la mitad: se vería a tirones.
    if (this.anim.busy() && this.anim.progress() < 0.65) return;
    const meta = G.Sprites.animMeta(this.dex, anim);
    const len = meta ? meta.d.reduce((a, b) => a + b, 0) / 60 : 0.4;
    const cd = Math.max(0.12, m.cd * this.cdMul);
    this.anim.play(anim, { speed: Math.max(1, len / (cd * 0.9)) });
    this.attackFace = 0.35;
  }

  // ---------------- daño y curación ----------------
  /** @param type  tipo del ataque (tabla de tipos y clima); sin tipo, daño tal cual */
  hurt(amount, type = null) {
    // god: truco de invencible · picking: eligiendo cartas en grupo (no le llega nada, ni los ataques con aviso)
    // (won: fase de la Aventura ya superada, en los 2 s antes del resumen)
    // star: poción de estrella (loot.js)
    // safe: dentro del refugio de la tienda de Kecleon (dungeon.js)
    if (this.invuln > 0 || this.dead || this.god || this.picking || this.star || this.safe || G.Stages.won) return;
    // Polvo Brillo: a veces el golpe no te da.
    if (this.hasItem('brightpowder') && Math.random() < 0.2) {
      this.invuln = 0.3;
      G.FX.dmgText(this.x, this.y - this.bodyH - 4, G.T('¡Esquivado!'), '#bff3ff');
      return;
    }
    // Mineral Evolutivo: menos daño si aún puede evolucionar.
    if (this.hasItem('eviolite') && G.Evo.levelFor(this.dex) != null) amount *= 0.65;
    let eff = null;
    if (type) {
      const k = G.Types.mult(type, this.mon.types);
      eff = G.Types.label(k);
      amount *= k * G.Weather.mult(type);
    }
    // Con un ataque cuerpo a cuerpo activo se recibe un 25 % menos: hay que
    // estar encima de los enemigos para pegar (iban muy por detrás).
    const close = this.activeGroup().some(m => m.kind === 'melee') ? 0.75 : 1;
    // Levantando a un compañero caído: la mitad de daño (para poder rescatarle aunque te rodeen).
    const rescuing = G.Coop.active && !this.remote && G.Coop.puppets().some(p => p.dead && G.U.dist2(p.x, p.y, this.x, this.y) < Player.REVIVE_R * Player.REVIVE_R) ? 0.5 : 1;
    // curseTaken: maldición de cristal (dungeon.js)
    // taken: reto semanal "Todo o nada" (×2)
    // Pantalla de Luz (apoyo): para parte del daño mientras dura.
    const screen = this.screenT > 0 ? 1 - (this.screenCut || 0.5) : 1;
    const d = Math.max(1, amount * (1 - this.reduction) * close * rescuing * screen * (1 + (this.curseTaken || 0)) * (G.Modes.rule('taken') || 1));
    this.hp -= d;
    // Globo Helio: al recibir un golpe explota (vuelve a los 30 s, ver update).
    if (this.hasItem('airballoon') && this.balloon) {
      this.balloon = false; this.balloonT = 30; this.spdMul /= 1.25;
      G.FX.burst(this.x, this.y - this.bodyH, '#ff5f6d', 14, 160);
      G.FX.dmgText(this.x, this.y - this.bodyH - 16, G.T('¡El globo ha explotado!'), '#ff8a95');
    }
    this.invuln = 0.45;
    this.flash = 0.14;
    G.Audio.sfx('hurt');
    G.Camera.kick(0.28);
    G.FX.dmgText(this.x, this.y - this.bodyH - 4, '-' + Math.round(d), eff === 'super' ? '#ff3048' : eff === 'weak' ? '#c9a0a8' : '#ff6b7a', eff === 'super');
    G.FX.burst(this.x, this.y - this.bodyH * 0.5, '#ff5f6d', 6, 90);
    // Banda Focus: aguanta el golpe con 1 de vida (una vez cada 60 s).
    if (this.hp <= 0 && this.hasItem('focussash') && performance.now() - this.sashT > 60000) {
      this.sashT = performance.now();
      this.hp = 1; this.invuln = 1.2;
      G.FX.dmgText(this.x, this.y - this.bodyH - 16, '¡Banda Focus!', '#ff9a3d', true);
      G.FX.ring(this.x, this.y, 6, 70, '#ff9a3d', 0.5, 4);
    }
    // Semilla Revivir (tienda de Kecleon): al caer, vuelves con la mitad de la vida (una vez).
    if (this.hp <= 0 && this.reviveSeed) {
      this.reviveSeed = false;
      this.hp = this.maxHp * 0.5; this.invuln = 2;
      G.FX.dmgText(this.x, this.y - this.bodyH - 16, G.T('¡Semilla Revivir!'), '#5fe08a', true);
      G.FX.ring(this.x, this.y, 6, 110, '#5fe08a', 0.7, 5);
      G.Audio.sfx('legend');
    }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true;
      this.anim.play('Faint', { hold: true });
      G.Projectiles.clearOrbs(this);
      this.reviveT = 0;
    }
  }

  /** Poción (loot.js): su efecto dura def.dur s; la que tuvieras antes se acaba. */
  drinkPotion(id, def) {
    this.endPotion();
    def.on(this);
    if (def.dur > 0) this.potion = { id, def, t: def.dur };
    else def.off(this);
  }
  endPotion() {
    if (!this.potion) return;
    const d = this.potion.def;
    this.potion = null;
    d.off(this);
  }

  heal(amount) {
    amount *= G.Modes.healMul();
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const got = Math.round(this.hp - before);
    if (got >= 1) G.FX.dmgText(this.x, this.y - this.bodyH - 6, '+' + got, '#5fe08a');
  }

  addMaxHp(amount) { this.maxHp += amount; this.hp += amount; }

  /**
   * Evoluciona (evo.js): stats y sprite de la evolución; se quedan los movimientos y las mejoras.
   * @param visual  sólo el aspecto (la copia de un compañero en grupo)
   */
  evolveTo(dex, visual = false) {
    const old = this.mon, mon = G.DEX_BY[dex];
    if (!mon) return;
    this.mon = mon; this.dex = dex;
    this.shiny = this.shiny && G.Sprites.hasShiny(dex);
    this.anim = new G.Sprites.Animator(dex, 1, this.shiny);
    this.r = G.Sprites.bodyRadius(dex);
    this.bodyH = G.Sprites.bodyHeight(dex);
    if (visual) return;
    // Además de los stats de la evolución, un empujón: +8% de vida y +6% de ataque.
    const dHp = (Math.max(0, mon.hp - old.hp) + this.maxHp * 0.08) * (this.glassK || 1);
    this.atkMul *= 1.06;
    this.maxHp += dHp; this.hp = Math.min(this.maxHp, this.hp + (dHp + this.maxHp * 0.25) * G.Modes.healMul());
    this.baseSpd = Math.max(this.baseSpd, this.baseSpd + (mon.spd - old.spd));
    this.baseAtk = Math.max(this.baseAtk, this.baseAtk + (mon.atk - old.atk));
  }

  /** Devuelve cuántos niveles ha subido (pueden ser varios de golpe). */
  gainXp(amount) {
    this.xp += amount * this.xpMul;
    let leveled = 0;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = Player.xpFor(this.level);
      leveled++;
    }
    return leveled;
  }

  // ---------------- objeto equipado ----------------
  static get MAX_ITEMS() { return 2; }
  /** El primero (compatibilidad con lo que sólo miraba uno). */
  get item() { return this.items[0] || null; }
  hasItem(id) { return this.items.includes(id); }

  /** Se pone un objeto: si hay hueco, se añade; si no, sustituye a `replace` (o al primero). */
  equip(id, replace = null) {
    if (!id || this.items.includes(id)) return;
    if (this.items.length >= Player.MAX_ITEMS) {
      const i = Math.max(0, this.items.indexOf(replace));
      G.Items.BY[this.items[i]].off(this);
      this.items[i] = id;
    } else this.items.push(id);
    G.Items.BY[id].on(this);
  }

  /** Cascabel Concha: un poco de vida por el daño que haces (tope 4/s). */
  onDealt(dmg) {
    if (this.hasItem('shellbell')) this.bellHeal = Math.min(4, this.bellHeal + dmg * 0.04);
    // Reliquia Colmillo Sediento (torre): un poco de vida por golpe (como mucho el 1 % por golpe).
    if (this.relicLeech && !this.dead) this.hp = Math.min(this.maxHp, this.hp + Math.min(dmg * this.relicLeech, this.maxHp * 0.01));
  }

  /** Poder de un altar (ver systems/interact.js): se aplica y se quita solo. */
  addPower(def, dur) {
    if (this.power) this.power.def.off(this);
    def.on(this);
    this.power = { def, t: dur, dur };
  }

  addBuff(stat, amount, dur, maxStacks) {
    const b = this.buffs[stat];
    if (!b) return;
    b.amount = amount;
    b.n = Math.min(maxStacks, b.n + 1);
    b.t = dur;
  }

  // ---------------- ciclo ----------------
  update(dt) {
    this.anim.update(dt);
    this.anim.scale = this.sizeK || 1;            // gigante / diminuto (pociones)
    if (this.dead) { if (this.potion) this.endPotion(); return; }
    if (this.potion) {
      this.potion.t -= dt;
      if (this.toxic) this.hp = Math.max(1, this.hp - this.maxHp * 0.03 * dt);
      if (this.potion.t <= 0) this.endPotion();
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.attackFace > 0) this.attackFace -= dt;
    if (this.hasItem('airballoon') && !this.balloon && this.balloonT > 0 && (this.balloonT -= dt) <= 0) {
      this.balloon = true; this.spdMul *= 1.25;
      G.FX.ring(this.x, this.y, 6, 50, '#ff5f6d', 0.4, 3);
    }
    // Si el hueco activo se ha quedado sólo con pasivos (p. ej. Colmillo Vampiro al
    // evolucionar), se pasa a un ataque de verdad: los pasivos funcionan igual.
    if (this.passiveSlot(this.active)) {
      const i = this.slots.findIndex((g, k) => !this.passiveSlot(k));
      if (i >= 0) this.active = i;
    }

    for (const k in this.buffs) {
      const b = this.buffs[k];
      if (b.n > 0) { b.t -= dt; if (b.t <= 0) b.n = 0; }
    }
    if (this.slowT > 0) this.slowT -= dt;
    if (this.bellHeal > 0) { const h = Math.min(this.bellHeal, 4 * dt); this.hp = Math.min(this.maxHp, this.hp + h); this.bellHeal -= h; }
    if (this.power && (this.power.t -= dt) <= 0) { this.power.def.off(this); this.power = null; }
    if (this.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt * G.Modes.healMul());

    // --- movimiento con colisiones ---
    // (En cooperativo la pausa no para el juego: sólo te quedas quieto.)
    let [ax, ay] = this.frozen || this.sleepT > 0 ? [0, 0] : G.Input.axis();      // (sleepT: Descanso)
    if (this.reversed) { ax = -ax; ay = -ay; }        // poción del revés (loot.js)
    // Confusión (Enfado, moves.js): la dirección se tuerce un poco, a vaivén.
    if (this.confuseT > 0) {
      this.confuseT -= dt;
      const a = Math.sin(performance.now() / 160) * 1.1, c = Math.cos(a), s = Math.sin(a);
      [ax, ay] = [ax * c - ay * s, ax * s + ay * c];
    }
    this.walking = ax !== 0 || ay !== 0;
    const s = this.spd;
    // Hielo: resbalas (la velocidad cambia despacio).
    const slide = this.inLiquid && G.World.liquidEffect(this.mon.types).slide;
    this.svx = slide ? G.U.damp(this.svx || 0, ax * s * 1.15, 1.6, dt) : ax * s;
    this.svy = slide ? G.U.damp(this.svy || 0, ay * s * 1.15, 1.6, dt) : ay * s;
    this.x += this.svx * dt;
    this.y += this.svy * dt;
    G.World.collide(this);
    if (this.walking) this.moveAngle = Math.atan2(ay, ax);

    // --- terreno líquido ---
    this.inLiquid = G.World.isLiquid(this.x, this.y);
    if (this.inLiquid) {
      const le = G.World.liquidEffect(this.mon.types);
      if (le.dmg) {
        this.lavaTick -= dt;
        if (this.lavaTick <= 0) {
          this.lavaTick = le.every; this.invuln = 0;
          this.hurt(Math.max(le.flat, this.maxHp * le.dmg * 0.5));
          G.FX.burst(this.x, this.y - 4, le.color, 5, 70);
        }
      } else if (this.walking && Math.random() < dt * 8) {
        G.FX.burst(this.x, this.y, le.slide ? '#ffffff' : '#b3defa', 2, 40);
      }
    }

    // --- apuntado: enemigo más cercano; si no hay, hacia donde caminas ---
    // Prioridad de blanco según el ataque activo:
    //   a distancia (proyectil, rayo): el jefe si está a tiro > lo que te toca > el más cercano
    //   cuerpo a cuerpo y el resto:   lo que te toca > el jefe > el más cercano
    // Con una horda encima casi siempre te toca algo; si eso ganara siempre,
    // los ataques a distancia no le darían nunca al jefe.
    // Sin enemigos, apunta a la roca o cofre más cercano.
    const all = G.EnemyMgr.all();
    const m = this.activeMove();
    const ranged = !!m && (m.kind === 'projectile' || m.kind === 'beam');
    const threat = G.Projectiles.nearest(all, this.x, this.y, this.r + 24);
    const boss = all.find(e => e.boss && !e.dead && G.U.dist(this.x, this.y, e.x, e.y) < 330);
    const tg = (ranged ? boss || threat : threat || boss)
            || G.Projectiles.nearest(all, this.x, this.y, 520)
            || G.World.nearestBreakable(this.x, this.y, 200);
    this.target = tg;
    // PK: un rival a tiro tiene prioridad (sólo se apunta; el daño lo decide él en su pantalla).
    const foe = G.PvP.on ? G.PvP.foe(this, 420) : null;
    if (foe) this.aim = Math.atan2(foe.y - this.y, foe.x - this.x);
    else if (tg) this.aim = Math.atan2(tg.y - this.y, tg.x - this.x);
    else if (this.walking) this.aim = this.moveAngle;
    // PK: apuntas tú (ratón o pulgar derecho), ver pvp.js.
    const ma = G.PvP.manualAim(this);
    if (ma != null) { this.aim = ma; this.manualAim = ma; }

    // --- animación: mira al objetivo al atacar, si no a donde camina ---
    const face = this.attackFace > 0 || !this.walking ? this.aim : this.moveAngle;
    this.anim.dir = G.Sprites.dirFromAngle(face);
    this.anim.loop(this.walking ? 'Walk' : 'Idle', this.walking ? s / 110 : 1);
  }

  /** Vuelve a levantarse (lo revive un compañero en cooperativo). */
  revive(frac = 0.5) {
    this.dead = false;
    this.hp = Math.max(1, this.maxHp * frac);
    this.invuln = 2;
    this.reviveT = 0;
    this.anim._start('Idle', false);
    G.FX.ring(this.x, this.y, 6, 70, '#5fe08a', 0.5, 4);
    G.FX.burst(this.x, this.y - this.bodyH * 0.5, '#9dffb8', 18, 150);
    G.Audio.sfx('heal');
  }

  // ---------------- compañero (cooperativo) ----------------

  /**
   * Un compañero en otro ordenador: su dueño manda su estado (posición, vida,
   * movimiento activo...) y aquí se sigue con suavidad.
   * n = { x, y, ang, walk, hp, maxHp, dead, mv, ml, mag, aim, rev }
   */
  netUpdate(dt) {
    this.anim.update(dt);
    const n = this.net;
    if (!n) return;
    this.anim.scale = n.sz || 1;                  // gigante / diminuto (pociones)
    if (this.flash > 0) this.flash -= dt;
    if (this.attackFace > 0) this.attackFace -= dt;
    // Predicción: entre paquete y paquete sigue andando a la velocidad que llevaba
    // (si no, se ve a los demás siempre un poco por detrás y a saltos).
    this.netAge = (this.netAge || 0) + dt;
    if (n !== this.netPrev && n.t) {
      // Interpolación (2026-10-16): posiciones con el reloj de quien las manda y su desfase
      // con el nuestro (el más pequeño visto, bajando despacio si la red se vuelve lenta).
      G.Coop.clockTrack(this.netClk || (this.netClk = {}), n.t);
      G.Coop.pushSnap(this.netBuf || (this.netBuf = []), n.t, n.x, n.y);
    }
    if (n !== this.netPrev) {
      // Con el reloj de quien lo manda (n.t) el hueco es el de verdad, no el de llegada.
      const p = this.netPrev, gap = p && n.t && p.t && n.t > p.t ? n.t - p.t : this.netAge;
      if (p && gap > 0.01 && n.walk && !n.dead) { this.netVx = (n.x - p.x) / gap; this.netVy = (n.y - p.y) / gap; }
      else { this.netVx = 0; this.netVy = 0; }
      const vmax = 900;   // un salto (teletransporte, revivir) no es velocidad
      if (this.netVx * this.netVx + this.netVy * this.netVy > vmax * vmax) { this.netVx = 0; this.netVy = 0; }
      this.netPrev = n; this.netAge = 0;
    }
    const ip = n.t && this.netBuf && this.netBuf.length > 1
      ? G.Coop.interp(this.netBuf, G.Coop.clockRender(this.netClk)) : null;
    const lead = n.walk ? Math.min(this.netAge, 0.25) : 0;
    const tx = ip ? ip[0] : n.x + (this.netVx || 0) * lead, ty = ip ? ip[1] : n.y + (this.netVy || 0) * lead;
    if (G.U.dist2(this.x, this.y, tx, ty) > 300 * 300) { this.x = tx; this.y = ty; }
    else { const k = ip ? 30 : 18; this.x = G.U.damp(this.x, tx, k, dt); this.y = G.U.damp(this.y, ty, k, dt); }
    if (n.hp < this.hp - 0.5 && !n.dead) this.flash = 0.14;
    this.hp = n.hp; this.maxHp = n.maxHp;
    this.magnet = n.mag || this.magnet;
    this.reviveT = n.rev || 0;
    if (n.dex && n.dex !== this.dex && G.DEX_BY[n.dex]) { this.evolveTo(n.dex, true); G.Sprites.preload([n.dex], 8000, this.shiny); }
    if (n.dead && !this.dead) { this.dead = true; this.anim.play('Faint', { hold: true }); G.Projectiles.clearOrbs(this); }
    else if (!n.dead && this.dead) this.revive(n.hp / (n.maxHp || 1));
    // Movimiento activo (para el halo, el HUD y los orbes).
    if (n.mv && (!this.moves[0] || this.moves[0].id !== n.mv || this.moves[0].lvl !== n.ml) && G.Moves.BY_ID[n.mv]) {
      this.moves = [G.Moves.instance(n.mv, n.ml || 1)];
      this.slots = [this.moves.slice()];
      this.active = 0;
      G.Projectiles.clearOrbs(this);
    }
    if (this.dead) return;
    this.walking = !!n.walk;
    this.moveAngle = n.ang;
    this.aim = n.aim;
    const face = this.attackFace > 0 || !this.walking ? this.aim : this.moveAngle;
    this.anim.dir = G.Sprites.dirFromAngle(face);
    this.anim.loop(this.walking ? 'Walk' : 'Idle', this.walking ? this.baseSpd / 110 : 1);
  }

  draw(ctx) {
    // Halo del tipo del movimiento activo, en el suelo.
    const m = this.activeMove();
    if (m && !this.dead) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = G.U.TYPE_COLOR[m.type];
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.5, this.r * 0.6, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
    G.Sprites.drawShadow(ctx, this.dex, this.x, this.y);
    // Poder de altar: aro de su color latiendo bajo los pies.
    if (this.power && !this.dead) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 120) * 0.15;
      ctx.strokeStyle = this.power.def.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 2.1, this.r * 0.85, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    // Apoyo (2026-10-15): pantalla de luz (anillo de bloques dorados), protección (cúpula
    // verde), concentración (orbes rosas) y dormido (Zzz).
    if (!this.dead) {
      const t = performance.now() / 1000;
      if (this.screenT > 0) {
        ctx.save(); ctx.globalAlpha = 0.6;
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * 6.2832 + t;
          ctx.fillStyle = i % 2 ? '#ffe9a0' : '#ffd23f';
          ctx.fillRect(Math.round(this.x + Math.cos(a) * this.r * 1.9) - 3, Math.round(this.y - this.bodyH * 0.45 + Math.sin(a) * this.r * 1.3) - 3, 6, 6);
        }
        ctx.restore();
      }
      if (this.protectT > 0) {
        ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(t * 12) * 0.1; ctx.fillStyle = '#7dffb0'; ctx.strokeStyle = '#2f9a52'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.x, this.y - this.bodyH * 0.45, this.r * 2.1, this.bodyH * 0.85, 0, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 0.9; ctx.stroke();
        ctx.restore();
      }
      if (this.calmN > 0) {
        for (let i = 0; i < this.calmN; i++) {
          const a = t * 2.5 + i * 6.2832 / this.calmN;
          ctx.fillStyle = '#ff8ad8';
          ctx.fillRect(Math.round(this.x + Math.cos(a) * this.r * 1.6) - 3, Math.round(this.y - this.bodyH - 6 + Math.sin(a) * 6) - 3, 6, 6);
        }
      }
      if (this.sleepT > 0) {
        ctx.save(); ctx.font = '800 14px Pixelify,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#bfe8ff';
        const zt = 'Zz' + (Math.floor(t * 3) % 2 ? 'z' : '');
        ctx.strokeText(zt, this.x + 14, this.y - this.bodyH - 10); ctx.fillText(zt, this.x + 14, this.y - this.bodyH - 10);
        ctx.restore();
      }
    }
    // Poción de estrella (2026-10-15: más vistosa): halo arcoíris que late, aro que gira,
    // el Pokémon parpadea de colores y suelta chispas.
    const starOn = this.star && !this.dead, now = performance.now();
    const hue = (now / 4) % 360;
    if (starOn) {
      const cy = this.y - this.bodyH * 0.45, R = Math.max(46, this.bodyH * 1.5) * (1 + Math.sin(now / 110) * 0.1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(this.x, cy, R * 0.15, this.x, cy, R);
      g.addColorStop(0, `hsla(${hue},100%,80%,0.95)`);
      g.addColorStop(0.55, `hsla(${(hue + 60) % 360},100%,65%,0.5)`);
      g.addColorStop(1, `hsla(${(hue + 120) % 360},100%,60%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.x, cy, R, 0, 6.2832); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = `hsl(${hue},90%,65%)`;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.9, this.r * 0.8, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
      if (!this._sparkT || now - this._sparkT > 90) {
        this._sparkT = now;
        G.FX.burst(this.x + G.U.rand(-this.r, this.r), cy + G.U.rand(-this.bodyH * 0.4, this.bodyH * 0.3), `hsl(${(hue + G.U.rand(0, 180)) % 360},100%,72%)`, 2, 70);
      }
    }
    // Grupo: eligiendo cartas (la partida sigue): burbuja que aparta a los enemigos y "Eligiendo…".
    const choosing = !this.dead && G.Coop.active && (this.remote ? this.net && this.net.ch === 1 : this.picking);
    if (choosing) {
      const R = 110, pulse = 0.85 + Math.sin(now / 200) * 0.15;
      ctx.save();
      ctx.globalAlpha = 0.16 * pulse; ctx.fillStyle = '#7fe0ff';
      ctx.beginPath(); ctx.arc(this.x, this.y - 8, R, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.lineWidth = 3; ctx.strokeStyle = '#bff3ff'; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(this.x, this.y - 8, R, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.font = '800 12px Pixelify,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(G.T('Eligiendo…'), this.x, this.y - this.bodyH - 26);
      ctx.fillStyle = '#bff3ff'; ctx.fillText(G.T('Eligiendo…'), this.x, this.y - this.bodyH - 26);
      ctx.restore();
    }
    const alpha = this.invuln > 0 && !this.dead && !starOn ? (Math.floor(this.invuln * 18) % 2 ? 0.45 : 1) : 1;
    const starFlash = starOn && Math.floor(now / 120) % 3 !== 2;
    this.anim.draw(ctx, this.x, this.y, { flash: this.flash > 0 || starFlash, softFlash: true, alpha, color: starFlash ? `hsl(${hue},100%,70%)` : '#ffcb3d' });

    // Arcos de buff alrededor de los pies.
    const COL = { atk: '#ff6b4d', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
    let i = 0;
    for (const k in this.buffs) {
      const b = this.buffs[k];
      if (b.n <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = COL[k];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r * 1.8 + i * 5, (this.r * 1.8 + i * 5) * 0.42, 0, 0, 6.2832 * (b.n / 5));
      ctx.stroke();
      ctx.restore();
      i++;
    }

    // Cooperativo: anillo de "reviviendo" y nombre encima.
    if (this.dead && this.reviveT > 0) {
      ctx.save();
      ctx.strokeStyle = '#5fe08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r * 2.4, this.r * 1.0, 0, -Math.PI / 2, -Math.PI / 2 + 6.2832 * Math.min(1, this.reviveT / G.Player.REVIVE_TIME));
      ctx.stroke();
      ctx.restore();
    }
    if (this.tag) {
      ctx.save();
      ctx.font = '700 7px Pixelify,"Segoe UI",sans-serif';
      ctx.textAlign = 'center';
      const y = this.y - this.bodyH - 8;
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(this.tag, this.x, y);
      ctx.fillStyle = this.dead ? '#ff8a96' : this.tagColor || '#fff';
      ctx.fillText(this.tag, this.x, y);
      // "Quédate a su lado" sólo si se le puede levantar (en PK, sólo los de tu equipo).
      const me = G.Coop.local;
      if (this.dead && (!G.PvP.on || (G.PvP.teams && me && this.team === me.team))) {
        ctx.font = '700 6px Pixelify,"Segoe UI",sans-serif';
        ctx.strokeText(this.revLabel || '', this.x, y - 8);
        ctx.fillText(this.revLabel || '', this.x, y - 8);
      }
      ctx.restore();
    }
  }
};
