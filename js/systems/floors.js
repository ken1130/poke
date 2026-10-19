/* ============ floors.js — pisos del dungeon y ataque combinado (2026-10-15, 2026-10-16) ============
 *
 * Partida normal (2026-10-16, "el modo normal no tiene meta"): la mazmorra tiene 5 pisos.
 *
 *   Jefe del piso  B1F a los 4:00; en los demás, 3:30 después de llegar. Sale cerca del
 *                  grupo (nunca con el grupo dentro de una tienda/sala ni en la grieta: espera).
 *                  Las escaleras sólo aparecen al vencerlo. En B5F es el Señor del Laberinto
 *                  (un legendario): vencerlo = MAZMORRA SUPERADA (premio grande y una ventana:
 *                  «凱旋結算» acaba la run como victoria; «繼續挑戰» sigue sin fin en B6F, B7F...).
 *   Dos escaleras  ruta segura (tema suave) y ruta peligrosa (tema duro con más premio y un
 *                  regalo al llegar). Todo el grupo encima de LA MISMA 2 s para bajar.
 *   Temas de piso  THEMES: cambian generación, daño, velocidad, monedas, experiencia, élites,
 *                  clima (niebla) y el tipo de los salvajes (fuego).
 *   Dificultad     con las escaleras ya fuera, la dificultad del piso deja de subir
 *                  (diffTime: el reloj de los enemigos se queda donde salieron) y si el grupo
 *                  se queda más de 3 min, la experiencia y las monedas bajan (×0,5; a los 5 min ×0,25).
 *
 * Al bajar: mapa nuevo (otra semilla), el bioma siguiente (o el volcán si es «en llamas»),
 * fuera enemigos, disparos y objetos del suelo (los discos y pociones de cada uno se
 * vuelven a dejar cerca). Cada piso: enemigos con +8 % de vida y +20 % de experiencia y
 * monedas (acumulativo), 30 % de vida y un disco de regalo.
 *
 * Descanso (2026-10-16, reststop.js): al llegar a B2F y siguientes, cada uno elige hoguera,
 * mercader u entrenamiento (G.Game.openChoice: en grupo todos parados hasta que eligen).
 *
 * Piso del tesoro (2026-10-16): al bajar (hacia B2F–B4F), un 12 % de las veces (una por run,
 * nunca después de superar la mazmorra) se pasa antes por un piso lleno de monedas y algún
 * ticket, sin enemigos ni jefe. A los 60 s el grupo baja solo al piso que tocaba (el número de
 * piso no cambia). Lo decide el anfitrión: ['ftr', semilla, piso, tema, peligrosa, semillaDespués].
 *
 * Ataque combinado (sólo en grupo): la barra se llena mientras estás cerca de un
 * compañero (~20 s); llena, con F (o el botón en móvil) estalla una gran explosión
 * entre los dos.
 *
 * Cooperativo: todo lo decide el anfitrión:
 *   ['fbs', id, piso, señor]                 ha salido el jefe del piso
 *   ['st2', x1, y1, x2, y2, temaA, temaB]    escaleras (A segura, B peligrosa)
 *   ['fl', semilla, piso, tema, peligrosa]   bajada
 *   ['fclr', t]                              mazmorra superada (premio para todos)
 *   ['fcn']                                  el anfitrión sigue jugando (sin fin)
 * El ataque combinado lo hace cada uno (su daño va al anfitrión como cualquier golpe) y
 * los demás sólo ven el efecto (['cb', ...]).
 */
G.Floors = (() => {
  const T = () => G.Game.st.time;
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const STAND = 2, STAIRS_R = 50;
  const FIRST_BOSS = 240, NEXT_BOSS = 210, WARN = 10;   // jefe del piso: B1F 4:00, luego 3:30 tras llegar
  const LAST = 4;                                        // B5F (índice 4): el Señor del Laberinto
  const REMIND = 60;                                     // recordatorio de las escaleras
  const FARM_A = 180, FARM_B = 300;                      // quedarse: ×0,5 y ×0,25 de experiencia y monedas
  // Señor del Laberinto: legendarios grandes (el primero con sprite).
  // Señor del Laberinto (2026-10-17, pedido del dueño): siempre Arceus, y Arceus no sale en ningún
  // otro sitio de la run (rift.js lo quita de los legendarios). Antes, uno al azar de esta lista.
  const LORD_DEX = 493;
  const LORDS = [150, 384, 487, 483, 484, 249, 250, 382, 383, 644, 643, 716, 717, 800, 890];   // (por si faltara su sprite)

  /*
   * Temas de piso. safe: ruta segura. Multiplicadores (1 si no está):
   *   spawn/cap  generación y tope · dmg/spd  enemigos · coin/xp  premios · elite  probabilidad
   *   heal  bayas curativas · fire  parte de los salvajes que son de tipo Fuego · fog  niebla
   */
  const THEMES = {
    std:     { name: 'Piso estándar', safe: true, color: '#cfe4ff', desc: 'Sin cambios.' },
    calm:    { name: 'Piso sereno', safe: true, color: '#9fe0b0', desc: '−25 % de Pokémon salvajes.', spawn: 0.75, cap: 0.85 },
    harvest: { name: 'Piso de cosecha', safe: true, color: '#ffe08a', desc: 'Bayas curativas ×3 y monedas ×1,3.', coin: 1.3, heal: 3 },
    fire:    { name: 'Piso en llamas', color: '#ff7a3d', desc: 'Casi todos los salvajes son de tipo Fuego; enemigos +15 % de daño; monedas ×1,5.', dmg: 1.15, coin: 1.5, fire: 0.75 },
    fog:     { name: 'Piso de niebla', color: '#c9cfdc', desc: 'Niebla densa: ves mucho menos; experiencia ×2.', xp: 2, fog: true },
    gold:    { name: 'Piso dorado', color: '#ffd23f', desc: 'Monedas ×2; enemigos +10 % de velocidad.', coin: 2, spd: 1.1 },
    horde:   { name: 'Piso del ejército', color: '#ff8a96', desc: '+40 % de Pokémon salvajes; experiencia ×1,5.', spawn: 1.4, cap: 1.25, xp: 1.5 },
    elite:   { name: 'Piso de élite', color: '#ffb84d', desc: 'Élites ×4 y siempre sueltan un objeto.', elite: 4, eliteItem: true }
  };
  const SAFE = ['std', 'calm', 'harvest'], DANGER = ['fire', 'fog', 'gold', 'horde', 'elite'];
  const th = () => THEMES[theme] || THEMES.std;
  const k = (key, def = 1) => { const v = normal() ? th()[key] : null; return v == null ? def : v; };

  // Tregua al bajar (2026-10-15): 6 s sin enemigos y luego van saliendo poco a poco
  // (hasta 30 s, y con un tope que también va subiendo), sin mareas ni jefes.
  const GRACE = 30, GRACE_EMPTY = 6;
  let floor = 0, stairs = [], standT = [0, 0], fadeT = 0, graceT = 0;
  let theme = 'std', route = null, arriveT = 0, bossAt = FIRST_BOSS, bossState = 'wait', bossId = 0, bossDex = 0, warned = false;
  let bossLord = false;
  let stairsAt = null, remindT = 0, farmTold = 0, promptT = 0, bossBanner = null, clearBanner = 0;
  let cleared = false, endless = false, clearPending = false, clearT = 0, dangerRuns = 0, fireDefs = null;
  const FAR = 3200;          // 100 m (32 px = 1 m): más lejos, las escaleras se acercan
  let farT = 1;
  let combo = 0, comboFlash = 0;
  // Piso del tesoro y descanso (2026-10-16).
  const TREASURE_P = 0.12, TREASURE_TIME = 60;
  let treasure = null, treasureT = 0, treasureUsed = false, treasureBanner = 0, treasureWarn = false, restPending = false;

  function reset() {
    floor = 0; stairs = []; standT = [0, 0]; fadeT = 0; graceT = 0; combo = 0; comboFlash = 0;
    theme = 'std'; route = null; arriveT = 0; bossAt = FIRST_BOSS; bossState = 'wait'; bossId = 0; bossDex = 0; warned = false; bossLord = false; lordPh = 0;
    stairsAt = null; remindT = 0; farmTold = 0; promptT = 0; bossBanner = null; clearBanner = 0;
    cleared = false; endless = false; clearPending = false; clearT = 0; dangerRuns = 0; fireDefs = null;
    treasure = null; treasureT = 0; treasureUsed = false; treasureBanner = 0; treasureWarn = false; restPending = false;
    lordUltT = 0; lordDebT = 0; lordCast = null; lordUltN = 0; lordDebN = 0; lstT = 0; lordView = { id: 0, sh: 0, inv: 0 };
    const el = document.getElementById('scr-fclear');
    if (el) el.classList.add('hidden');
  }
  /** Spawner: 0 = no sale nada, 1 = normal (la tregua del piso nuevo). */
  const graceMul = () => graceT <= 0 ? 1 : graceT > GRACE - GRACE_EMPTY ? 0 : Math.pow(1 - graceT / (GRACE - GRACE_EMPTY), 2);
  const normal = () => G.Modes.run === 'normal' && !G.PvP.on;
  const allowed = () => normal() && !G.Rift.inArena && !(G.Dungeon && G.Dungeon.inRoom);

  /** Reloj de la dificultad (spawner): con las escaleras fuera, se queda parado. */
  const diffTime = t => stairsAt != null && normal() ? Math.min(t, stairsAt) : t;
  /** Segundos desde que salieron las escaleras (o -1). */
  const stairsAge = () => stairsAt == null ? -1 : Math.max(0, T() - stairsAt);
  /** Quedarse en un piso ya superado: la experiencia y las monedas bajan. */
  const farmMul = () => { const a = stairsAge(); return a >= FARM_B ? 0.25 : a >= FARM_A ? 0.5 : 1; };

  // ---------------- jefe del piso ----------------

  /** Anfitrión: elige quién será el jefe del piso (para precargar su sprite). */
  function pickBossDex() {
    const lord = floor === LAST && !cleared;
    if (lord) {
      if (G.SPRITE_META[LORD_DEX] && G.DEX_BY[LORD_DEX]) return LORD_DEX;
      const ok = LORDS.filter(d => G.SPRITE_META[d] && G.DEX_BY[d]);
      return ok.length ? G.U.pick(ok) : 150;
    }
    const slot = G.Enemies.BOSS_SLOTS[Math.min(G.Enemies.BOSS_SLOTS.length - 1, floor)];
    const used = new Set(G.Enemies.BOSSES.map(b => b.dex));
    let pool = G.DEX.filter(p => !p.leg && p.rarity < 5 && G.SPRITE_META[p.dex] && !used.has(p.dex) && p.bst >= slot.bst[0] && p.bst <= slot.bst[1]);
    if (!pool.length) pool = G.DEX.filter(p => !p.leg && G.SPRITE_META[p.dex] && p.bst >= 500);
    return G.U.pick(pool).dex;
  }

  function spawnFloorBoss(live) {
    const t = T(), lord = floor === LAST && !cleared;
    const slots = G.Enemies.BOSS_SLOTS, slot = slots[Math.min(slots.length - 1, floor)];
    // Más duro que un jefe normal de su hueco (×1,3); el Señor ×1,2 del último hueco más su
    // suelo de vida (×2,5 del de jefe); sin fin (B6F+): +10 % por piso.
    // (2026-10-19, V3.1 «el jefe final con más vida»: el Señor ×1,2 → ×1,5 y su suelo ×2,5 → ×3.)
    const hpMul = lord ? LORD.hpMul : floor > LAST ? 1.3 * (1 + 0.1 * (floor - LAST)) : 1.3;
    const def = G.Enemies.bossFor(bossDex || pickBossDex(), slot, hpMul);
    const n = G.Game.everyone().length;
    const near = live.slice().sort((a, b) => G.U.dist2(a.x, a.y, cx(live), cy(live)) - G.U.dist2(b.x, b.y, cx(live), cy(live)))[0];
    const e = G.Spawner.spawnBossNow(near, t, def, e => {
      const minHp = Math.round(G.Enemies.bossFloor(t) * (lord ? LORD.hpFloor : 1.6) * G.Coop.scaleHp(n) * (n > 1 ? 1.4 : 1));
      if (e.maxHp < minHp) e.maxHp = e.hp = minHp;
      e.dmg *= lord ? 1.3 : 1.15;
      e.floorBoss = floor + 1; e.lord = lord;
    });
    if (!e) return;
    bossId = e.id; bossState = 'alive'; lordPh = 0;
    // Escudo Divino (enemy.js hurt): sobre la vida ya definitiva (después de la escala del piso).
    if (lord) e.lordShield = Math.round(e.maxHp * LORD.shield0);
    if (lord) { lordUltT = LORD.ultFirst; lordDebT = LORD.debFirst; lordCast = null; lordUltN = 0; lordDebN = 0; lstT = 0; }
    if (G.Coop.active) G.Coop.broadcast(['fbs', e.id, floor, lord ? 1 : 0]);
    announceBoss(e.id, lord);
  }
  /*
   * Combate final por fases (2026-10-17): Arceus empieza solo; al 66 % de vida llama a unos élite
   * (3 y +2 por cada jugador más); al 33 % a dos jefes menores (la mitad de vida que un jefe de
   * piso) y se enfurece (más rápido y más fuerte). Al caer él, caen todos sus refuerzos.
   */
  let lordPh = 0;
  function lordPhases(e, live) {
    const f = e.hp / e.maxHp, t = T(), n = G.Game.everyone().length;
    const ring = (k, i, r) => { const a = i / k * 6.2832 + Math.random() * 0.4; return [e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.7]; };
    if (lordPh < 1 && f <= 0.66) {
      lordPh = 1;
      const k = 3 + 2 * Math.max(0, n - 1);
      for (let i = 0; i < k; i++) {
        const [x, y] = ring(k, i, 170);
        const m = G.Spawner.spawnAt(x, y, t);
        if (!m) continue;
        m.lordMinion = true;
        if (!m.elite) m.makeElite(G.Enemy.rollAffixes(t));
      }
      G.Spawner.say(G.T('¡Arceus llama a sus guardianes!'), 3.2);
      shieldUp(e);
      G.Audio.sfx('boss'); G.Camera.kick(0.9);
      G.FX.ring(e.x, e.y, 20, 260, '#f2e6b0', 0.7, 6);
    }
    if (lordPh < 2 && f <= 0.33) {
      lordPh = 2;
      const slots = G.Enemies.BOSS_SLOTS, slot = slots[Math.max(0, Math.min(slots.length - 1, floor - 1))];
      const cand = (lo, hi) => G.DEX.filter(p => !p.leg && p.rarity < 5 && G.SPRITE_META[p.dex] && p.bst >= lo && p.bst <= hi);
      let pool = cand(slot.bst[0], slot.bst[1]);
      if (!pool.length) pool = cand(540, 600);           // (los de 580+ son casi todos ★5: no quedaba ninguno)
      if (!pool.length) pool = cand(450, 700);
      const near = live[0];
      for (let i = 0; i < 2 && pool.length; i++) {
        const def = G.Enemies.bossFor(G.U.pick(pool).dex, slot, 0.65);
        const [x, y] = ring(2, i, 200);
        G.Spawner.spawnBossNow(near, t, def, b => { b.lordMinion = true; b.x = x; b.y = y; b.maxHp = b.hp = Math.round(b.maxHp * 0.5); });
      }
      // Furia: más rápido y más fuerte.
      e.spd *= 1.2; e.dmg *= 1.15;
      G.Spawner.say(G.T('¡Arceus se enfurece! Llegan dos jefes más'), 3.4);
      shieldUp(e);
      G.Audio.sfx('legend'); G.Camera.kick(1.4);
      G.FX.ring(e.x, e.y, 20, 320, '#ffd23f', 0.8, 8);
    }
  }
  /** Arceus ha caído: sus refuerzos también. */
  function lordMinionsDown() {
    let k = 0;
    // (sin escudo y de un golpe: un élite con burbuja se quedaba vivo)
    for (const m of G.EnemyMgr.all()) if (m.lordMinion && !m.dead) { m.shield = 0; m.shieldT = 0; m.hurt(m.maxHp * 10 + m.hp, '#ffffff'); k++; }
    if (k) G.Spawner.say(G.T('¡Sus guardianes huyen con él!'), 2.6);
  }
  /*
   * Arceus más duro (2026-10-19, V3.1, pedido del dueño):
   *   - Escudo Divino: un 25 % de su vida al salir y +15 % en cada fase. Sólo lo bajan los golpes
   *     (enemy.js hurt: aparte del escudo normal; el Rompescudos no le afecta).
   *   - Ataques cargados, invulnerable mientras: «Sentencia» (círculo enorme a su alrededor tras
   *     2,2 s: hay que salir) y «Castigo en cadena» (3 tandas de círculos donde estáis). Se alternan.
   *   - Maldiciones a los jugadores cercanos, una cada 11 s durante 6 s: lentitud (−30 % de
   *     velocidad), debilidad (−25 % de ataque) y sin curación. Icono encima de tu Pokémon.
   * Lo decide el anfitrión: los círculos van por G.Hazards ('hz'), las maldiciones con 'ldb' y el
   * escudo/la invulnerabilidad (para dibujarlos) con 'lst'. Números en LORD, para ajustarlos.
   */
  const LORD = { hpMul: 1.5, hpFloor: 3.0, shield0: 0.25, shieldPh: 0.15,
                 ultFirst: 10, ultEvery: 16, ultEveryRage: 12, chargeT: 2.2, judgeR: 260, judgeK: 1.8,
                 comboWaves: 3, comboGap: 0.6, comboDelay: 1.0, comboR: 95, comboK: 1.1,
                 debFirst: 6, debEvery: 11, debDur: 6, debR: 700 };
  const CURSES = ['slow', 'weak', 'noheal'];
  let lordUltT = 0, lordDebT = 0, lordCast = null, lordUltN = 0, lordDebN = 0, lstT = 0, lordView = { id: 0, sh: 0, inv: 0 };
  function shieldUp(e) {
    e.lordShield = (e.lordShield || 0) + Math.round(e.maxHp * LORD.shieldPh);
    G.FX.ring(e.x, e.y, 10, 150, '#ffe9a0', 0.6, 5);
    G.Spawner.say(G.T('¡El Escudo Divino de Arceus se renueva!'), 2.8);
  }
  /** enemy.js (anfitrión): se le ha roto el Escudo Divino. */
  function lordShieldBroken(e) {
    G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#ffe9a0', 40, 300);
    G.FX.ring(e.x, e.y, 10, 220, '#fff6d0', 0.6, 6);
    G.Camera.kick(0.9); G.Audio.sfx('break');
    G.Spawner.say(G.T('¡El Escudo Divino se ha roto!'), 2.6);
    if (G.Coop.active) G.Coop.say(G.T('¡El Escudo Divino se ha roto!'), 2.6);
  }
  /** Anfitrión, cada fotograma con Arceus vivo: ataques cargados, maldiciones y sincronía. */
  function lordTick(e, dt, live) {
    if (lordCast) castStep(e, dt, live);
    else if ((lordUltT -= dt) <= 0) startCast(e, live);
    if (!lordCast && (lordDebT -= dt) <= 0) { lordDebT = LORD.debEvery; curse(e); }
    // Escudo e invulnerabilidad para los demás (sólo si cambian, como mucho 4 veces por segundo).
    const sh = Math.round(Math.max(0, e.lordShield || 0) / e.maxHp * 100), inv = e.lordInv ? 1 : 0;
    lordView = { id: e.id, sh: sh / 100, inv };
    if ((lstT -= dt) <= 0 && (sh !== lordView.sent || inv !== lordView.sentInv)) {
      lstT = 0.25; lordView.sent = sh; lordView.sentInv = inv;
      if (G.Coop.active) G.Coop.broadcast(['lst', e.id, sh, inv]);
    }
  }
  function startCast(e, live) {
    const kind = lordUltN % 2 === 0 ? 'judge' : 'combo';
    const dur = kind === 'judge' ? LORD.chargeT : LORD.comboGap * (LORD.comboWaves - 1) + LORD.comboDelay + 0.2;
    lordCast = { kind, t: 0, dur, wave: 0 };
    e.lordInv = true; e.rootT = Math.max(e.rootT || 0, dur);
    if (kind === 'judge') {
      G.Hazards.add({ kind: 'zone', x: e.x, y: e.y, r: LORD.judgeR, delay: LORD.chargeT, dmg: e.dmg * LORD.judgeK, type: 'normal', color: '#ffe9a0' });
      G.Spawner.say(G.T('¡Arceus carga la Sentencia! ¡Sal del círculo!'), 2.6);
      if (G.Coop.active) G.Coop.say(G.T('¡Arceus carga la Sentencia! ¡Sal del círculo!'), 2.6);
    } else {
      G.Spawner.say(G.T('¡Castigo en cadena! No te quedes quieto'), 2.6);
      if (G.Coop.active) G.Coop.say(G.T('¡Castigo en cadena! No te quedes quieto'), 2.6);
    }
    G.Audio.sfx('surge');
  }
  function castStep(e, dt, live) {
    const c = lordCast;
    c.t += dt;
    e.lordInv = true;
    if (c.kind === 'combo') {
      while (c.wave < LORD.comboWaves && c.t >= c.wave * LORD.comboGap) {
        for (const p of live) G.Hazards.add({ kind: 'zone', x: p.x, y: p.y, r: LORD.comboR, delay: LORD.comboDelay, dmg: e.dmg * LORD.comboK, type: 'normal', color: '#ffd23f' });
        c.wave++;
      }
    }
    if (c.t < c.dur) return;
    e.lordInv = false;
    lordCast = null; lordUltN++;
    lordUltT = lordPh >= 2 ? LORD.ultEveryRage : LORD.ultEvery;
    G.FX.ring(e.x, e.y, 10, c.kind === 'judge' ? LORD.judgeR : 120, '#fff6d0', 0.4, 5);
  }
  /** Una maldición a los que estén cerca (anfitrión: la suya ya; a los demás, 'ldb'). */
  function curse(e) {
    const kind = CURSES[lordDebN++ % CURSES.length];
    if (G.Coop.active) G.Coop.broadcast(['ldb', kind, LORD.debDur, Math.round(e.x), Math.round(e.y), LORD.debR]);
    applyCurse(kind, LORD.debDur, e.x, e.y, LORD.debR);
  }
  const CURSE_MSG = { slow: '¡Maldición de Arceus: más lento!', weak: '¡Maldición de Arceus: menos ataque!', noheal: '¡Maldición de Arceus: no puedes curarte!' };
  /** Cada uno, a su Pokémon: la maldición si está a su alcance. */
  function applyCurse(kind, dur, x, y, r) {
    const pl = G.Game.player;
    if (!pl || pl.dead || G.U.dist2(pl.x, pl.y, x, y) > r * r) return;
    const k = { slow: 'lordSlowT', weak: 'lordWeakT', noheal: 'lordNoHealT' }[kind];
    if (!k) return;
    pl[k] = Math.max(pl[k] || 0, dur);
    G.FX.ring(pl.x, pl.y, 6, 70, '#b07cff', 0.5, 4);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.6, '#d9b8ff', 12, 120);
    G.Spawner.say(G.T(CURSE_MSG[kind]), 2.4, true);
    G.Audio.sfx('error');
  }

  const cx = l => l.reduce((s, p) => s + p.x, 0) / l.length;
  const cy = l => l.reduce((s, p) => s + p.y, 0) / l.length;

  /** Todos: el cartel grande del jefe del piso. */
  function announceBoss(id, lord) {
    bossId = id; bossState = 'alive'; bossLord = !!lord;
    const e = G.EnemyMgr.get(id);
    bossBanner = { lord, name: e ? e.name : '', until: performance.now() + 3600 };
    G.Spawner.say('', 0, true);          // (el cartel grande ya lo dice; que no se pisen)
    G.Audio.sfx('boss');
    G.Camera.kick(1.2);
  }

  /** Anfitrión: el jefe del piso ha caído → escaleras (y, en B5F, mazmorra superada). */
  function bossDown(live) {
    bossState = 'dead';
    if (floor === LAST && !cleared) {
      cleared = true;
      const t = Math.floor(T());
      if (G.Coop.active) G.Coop.broadcast(['fclr', t]);
      onClear(t);
      clearPending = true;
    }
    const [a, b] = rollThemes();
    spawnStairs(live, a, b);
  }

  /** Temas de las dos rutas del piso siguiente (desde B6F, las dos son «peligrosas»). */
  function rollThemes() {
    if (floor + 1 > LAST) { const two = G.U.pickN(DANGER, 2); return two; }
    return [G.U.pick(SAFE), G.U.pick(DANGER)];
  }

  // ---------------- escaleras ----------------

  /** Anfitrión: dos escaleras, cerca del grupo y en sentidos opuestos (las dos accesibles a pie). */
  function spawnStairs(live, ta, tb, quiet = false) {
    const mx = cx(live), my = cy(live);
    const p = live.slice().sort((a, b) => G.U.dist2(a.x, a.y, mx, my) - G.U.dist2(b.x, b.y, mx, my))[0];
    const reach = reachable(p);
    const spot = (ang, k) => {
      const d = G.U.rand(300, 450) + (k > 40 ? 200 : 0);
      const x = p.x + Math.cos(ang) * d, y = p.y + Math.sin(ang) * d;
      let ok = G.World.isFree(x, y, 30);
      for (let j = 0; ok && j < 8; j++) ok = G.World.isFree(x + Math.cos(j * 0.785) * 44, y + Math.sin(j * 0.785) * 32, 10);
      // Que se pueda llegar andando (2026-10-15: a veces salían en un hueco rodeado de paredes).
      if (ok && k < 50 && !reach(x, y)) ok = false;
      return ok ? [Math.round(x), Math.round(y)] : null;
    };
    for (let k = 0; k < 70; k++) {
      const a = Math.random() * 6.2832;
      const A = spot(a + G.U.rand(-0.4, 0.4), k);
      if (!A) continue;
      let B = null;
      for (let j = 0; j < 12 && !B; j++) B = spot(a + Math.PI + G.U.rand(-0.7, 0.7), k);
      if (!B) continue;
      setStairs(A[0], A[1], B[0], B[1], ta, tb, quiet);
      if (G.Coop.active) G.Coop.broadcast(['st2', A[0], A[1], B[0], B[1], ta, tb, quiet ? 1 : 0]);
      return true;
    }
    // Sin sitio (rarísimo): encima del grupo.
    setStairs(Math.round(p.x - 120), Math.round(p.y), Math.round(p.x + 120), Math.round(p.y), ta, tb, quiet);
    if (G.Coop.active) G.Coop.broadcast(['st2', stairs[0].x, stairs[0].y, stairs[1].x, stairs[1].y, ta, tb, quiet ? 1 : 0]);
    return false;
  }
  /**
   * Casillas a las que se llega andando desde `p` (BFS por G.World.walkable, 36 casillas
   * alrededor). Devuelve reach(x, y).
   */
  function reachable(p) {
    const TS = G.World.TS, R = 36, N = R * 2 + 1;
    const ox = Math.floor(p.x / TS) - R, oy = Math.floor(p.y / TS) - R;
    const seen = new Uint8Array(N * N), q = new Int32Array(N * N);
    let head = 0, tail = 0;
    seen[R * N + R] = 1; q[tail++] = R * N + R;
    while (head < tail) {
      const c = q[head++], cx0 = c % N, cy0 = (c - cx0) / N;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx0 + dx, ny = cy0 + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const n = ny * N + nx;
        if (seen[n] || !G.World.walkable(ox + nx, oy + ny)) continue;
        seen[n] = 1; q[tail++] = n;
      }
    }
    return (x, y) => {
      const i = Math.floor(x / TS) - ox, j = Math.floor(y / TS) - oy;
      return i >= 0 && j >= 0 && i < N && j < N && seen[j * N + i] === 1;
    };
  }

  /** Todos: ponen las dos escaleras (quiet = sólo se han recolocado). */
  function setStairs(x1, y1, x2, y2, ta, tb, quiet) {
    const first = !stairs.length;
    stairs = [{ x: x1, y: y1, t: 0, route: floor + 1 > LAST ? 'danger' : 'safe', theme: THEMES[ta] ? ta : 'std' },
              { x: x2, y: y2, t: 0, route: 'danger', theme: THEMES[tb] ? tb : 'fog' }];
    standT = [0, 0];
    if (quiet || !first) return;
    bossState = 'dead'; bossBanner = null;
    stairsAt = T(); remindT = REMIND; farmTold = 0;
    promptT = 5;
    G.Audio.sfx('surge');
    if (G.RunGoals) G.RunGoals.onEvent('floorBoss');
  }

  /** Quién está encima de una escalera (de los que siguen en pie). */
  function onStairs(players, s) {
    const live = players.filter(p => !p.dead);
    const on = live.filter(p => G.U.dist2(p.x, p.y, s.x, s.y) < STAIRS_R * STAIRS_R);
    return [on.length, live.length, live.filter(p => !on.includes(p))];
  }

  /** Cada fotograma de juego, en todos los ordenadores. */
  function update(dt, players) {
    if (fadeT > 0) fadeT -= dt;
    if (graceT > 0) graceT -= dt;
    if (comboFlash > 0) comboFlash -= dt;
    if (promptT > 0) promptT -= dt;
    comboTick(dt, players);
    for (const s of stairs) s.t += dt;
    if (normal() && stairs.length && !(G.Dungeon && G.Dungeon.inRoom) && !G.Rift.inArena) remindTick(dt);
    // Descanso: cuando ya casi se ha ido el cartel del piso nuevo (cada uno el suyo).
    const me = G.Game.player;
    if (restPending && fadeT < 1.4 && me && !me.dead && (G.Game.state === 'playing' || G.Game.state === 'held')) {
      restPending = false;
      G.Game.openChoice(G.Rest.show);
    }
    if (treasure) { treasureTick(dt); return; }
    if (!authority()) return;
    if (clearPending && G.Game.player && !G.Game.player.dead && (G.Game.state === 'playing' || G.Game.state === 'held')) {
      clearPending = false;
      G.Game.openChoice(showClear);
    }
    if (!allowed()) return;
    const live = players.filter(p => !p.dead);
    if (!live.length) return;
    // --- jefe del piso ---
    if (bossState === 'wait') {
      if (!bossDex && T() >= bossAt - 25) { bossDex = pickBossDex(); G.Sprites.preload([bossDex]); }
      if (!warned && T() >= bossAt - WARN) { warned = true; G.Spawner.say(G.T(floor === LAST && !cleared ? '¡El Señor del Laberinto se acerca! (10 s)' : '¡El jefe del piso llega en 10 s!'), 3); }
      if (T() >= bossAt && graceT <= 0) spawnFloorBoss(live);
    } else if (bossState === 'alive') {
      const e = G.EnemyMgr.get(bossId);
      if (!e || e.dead) { if (bossLord) lordMinionsDown(); bossDown(live); }
      else if (bossLord) { lordPhases(e, live); lordTick(e, dt, live); }
    }
    if (!stairs.length) return;
    // A más de 100 m de todos (te has ido lejos): se vuelven a poner cerca (2026-10-16:
    // en el minimapa salían a miles de metros).
    farT -= dt;
    if (farT <= 0) {
      farT = 1;
      if (live.every(p => stairs.every(s => G.U.dist2(p.x, p.y, s.x, s.y) > FAR * FAR))) spawnStairs(live, stairs[0].theme, stairs[1].theme, true);
    }
    stairs.forEach((s, i) => {
      const [on, n] = onStairs(players, s);
      if (on >= n && n > 0) {
        standT[i] += dt;
        if (standT[i] >= STAND) {
          const seed = Math.floor(Math.random() * 1e6) + 1, next = floor + 1, danger = s.route === 'danger' ? 1 : 0;
          // Piso del tesoro: antes de B2F–B4F, una vez por run.
          if (!treasureUsed && !cleared && next < LAST && Math.random() < TREASURE_P) {
            const tseed = Math.floor(Math.random() * 1e6) + 1;
            if (G.Coop.active) G.Coop.broadcast(['ftr', tseed, next, s.theme, danger, seed]);
            enterTreasure(tseed, next, s.theme, danger, seed);
            return;
          }
          if (G.Coop.active) G.Coop.broadcast(['fl', seed, next, s.theme, danger]);
          descend(seed, next, s.theme, danger);
        }
      } else standT[i] = Math.max(0, standT[i] - dt * 2);
    });
  }

  /** Todos: recordatorio cada minuto y aviso de que el piso ya no da tanto. */
  function remindTick(dt) {
    remindT -= dt;
    const age = stairsAge();
    if (farmTold < 1 && age >= FARM_A - 30) { farmTold = 1; G.Spawner.say(G.T('En 30 s este piso dará la mitad de experiencia y monedas: ¡baja ya!'), 3.4, true); G.Audio.sfx('error'); remindT = REMIND; return; }
    if (farmTold < 2 && age >= FARM_A) { farmTold = 2; G.Spawner.say(G.T('Lleváis mucho en este piso: experiencia y monedas ×0,5'), 3.4, true); remindT = REMIND; return; }
    if (farmTold < 3 && age >= FARM_B) { farmTold = 3; G.Spawner.say(G.T('Experiencia y monedas ×0,25: ¡bajad al siguiente piso!'), 3.4, true); remindT = REMIND; return; }
    if (remindT <= 0) { remindT = REMIND; G.Spawner.say(G.T('¡Las escaleras al siguiente piso ya están abiertas!'), 3, true); G.Audio.sfx('confirm'); }
  }

  /** Bajar al piso n (todos lo hacen igual; el anfitrión además recoloca discos y pociones). */
  function descend(seed, n, th0 = 'std', danger = 0) {
    const host = authority();
    // Discos y pociones de cada uno: se vuelven a dejar cerca en el piso nuevo.
    const keep = host ? G.Pickups.all().filter(p => p.kind === 'sbox' || p.kind === 'fbox' || p.kind === 'potion' || p.kind === 'egg').map(p => [p.kind, p.value]) : [];
    const was = theme;
    treasure = null; treasureT = 0;
    if (normal() && n >= 1) restPending = true;          // descanso (reststop.js) al llegar
    floor = n; stairs = []; standT = [0, 0];
    theme = THEMES[th0] ? th0 : 'std'; route = danger ? 'danger' : 'safe';
    arriveT = T(); bossAt = arriveT + NEXT_BOSS; bossState = 'wait'; bossId = 0; bossDex = 0; warned = false; bossLord = false;
    stairsAt = null; promptT = 0; bossBanner = null; fireDefs = null;
    if (danger) dangerRuns++;
    G.Progress.event('floor', { n: n + 1 });             // B2F = 2
    if (G.RunGoals) G.RunGoals.onEvent('route', { danger: !!danger, n });
    G.World.reset(seed);
    if (!G.Game.fixedScene) G.World.setBiome(biomeAt(Math.floor(T() / 240) + floor), true);
    G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.Pickups.clear(); G.FX.clear();
    G.Path.clear(); G.Hazards.clear(); G.Rift.reset(); G.Dungeon.clearSites();
    if (G.Raid.clear && host) G.Raid.clear();
    // Niebla densa todo el piso (cada uno la suya: no hace falta mandarla).
    if (th().fog) G.Weather.force('fog', 99999);
    else if (THEMES[was] && THEMES[was].fog) G.Weather.onEvent(['wx']);
    // En llamas: los salvajes de tipo Fuego del tramo de ahora.
    if (host && th().fire) {
      fireDefs = G.Enemies.hordeDefs('fire', T());
      if (fireDefs.length) G.Sprites.preload(fireDefs.map(d => d.dex)); else fireDefs = null;
    }
    // Todos al centro del piso nuevo (cada uno el suyo, un poco separados).
    const pl = G.Game.player;
    if (pl) {
      const i = G.Coop.active ? Math.max(0, G.Coop.players().indexOf(pl)) : 0;
      pl.x = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 40; pl.y = 0;
      G.Camera.x = pl.x; G.Camera.y = pl.y;
      pl.invuln = Math.max(pl.invuln || 0, 2);
      // Premio por bajar (2026-10-16): recuperas un 30 % de la vida.
      if (!pl.dead) { pl.heal(pl.maxHp * 0.3); G.FX.ring(pl.x, pl.y, 6, 80, '#5fe08a', 0.6, 4); }
    }
    // ...y cada uno tiene un disco de movimientos de regalo cerca (no cuenta para los 3 por run).
    // Ruta peligrosa: además un ticket y una poción para cada uno.
    if (host) for (const p of G.Game.everyone()) {
      if (p.dead) continue;
      const near = (r0, r1, fn) => {
        for (let k = 0; k < 30; k++) {
          const a = Math.random() * 6.2832, d = G.U.rand(r0, r1), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          if (G.World.isFree(x, y, 16)) { fn(x, y); return; }
        }
      };
      near(120, 220, (x, y) => G.Pickups.drop('fbox', x, y, G.Loot.ownerKey(p)));
      if (danger) {
        near(60, 120, (x, y) => G.Pickups.drop('ticket', x, y, 1));
        near(60, 140, (x, y) => G.Pickups.drop('potion', x, y, G.Loot.ownerKey(p)));
      }
    }
    if (host) for (const [kind, owner] of keep) {
      for (let k = 0; k < 30; k++) {
        const a = Math.random() * 6.2832, d = G.U.rand(260, 480), x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (G.World.isFree(x, y, 16)) { G.Pickups.drop(kind, x, y, owner); break; }
      }
    }
    graceT = GRACE;
    fadeT = 2.6;                       // el cartel "B2F" del fundido (drawFade)
    G.Audio.sfx('biome');
  }

  // ---------------- piso del tesoro (2026-10-16) ----------------

  /** Todos: viaje al piso del tesoro (luego se baja al piso `next` con la semilla `seed2`). */
  function enterTreasure(tseed, next, th0, danger, seed2) {
    const host = authority();
    const keep = host ? G.Pickups.all().filter(p => p.kind === 'sbox' || p.kind === 'fbox' || p.kind === 'potion' || p.kind === 'egg').map(p => [p.kind, p.value]) : [];
    const wasFog = th().fog;
    treasure = { next, th: th0, danger, seed: seed2 }; treasureUsed = true;
    treasureT = TREASURE_TIME; treasureBanner = performance.now() + 4200; treasureWarn = false;
    stairs = []; standT = [0, 0]; theme = 'std';
    bossState = 'treasure'; bossId = 0; bossDex = 0; warned = false; bossLord = false;
    stairsAt = null; promptT = 0; bossBanner = null; fireDefs = null;
    G.World.reset(tseed);
    if (!G.Game.fixedScene) G.World.setBiome(Math.floor(T() / 240) + floor, true);
    G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.Pickups.clear(); G.FX.clear();
    G.Path.clear(); G.Hazards.clear(); G.Rift.reset(); G.Dungeon.clearSites();
    if (G.Raid.clear && host) G.Raid.clear();
    if (wasFog) G.Weather.onEvent(['wx']);
    const pl = G.Game.player;
    if (pl) {
      const i = G.Coop.active ? Math.max(0, G.Coop.players().indexOf(pl)) : 0;
      pl.x = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 40; pl.y = 0;
      G.Camera.x = pl.x; G.Camera.y = pl.y;
      pl.invuln = Math.max(pl.invuln || 0, 2);
    }
    if (host) {
      // El tesoro: monedas por todas partes, tickets (uno por cabeza y dos más) y alguna baya.
      const n = G.Game.everyone().length;
      const spot = (r0, r1, fn) => {
        for (let k = 0; k < 30; k++) {
          const a = Math.random() * 6.2832, d = G.U.rand(r0, r1), x = Math.cos(a) * d, y = Math.sin(a) * d;
          if (G.World.isFree(x, y, 14)) { fn(x, y); return; }
        }
      };
      for (let i = 0; i < 50 + 10 * n; i++) spot(110, 900, (x, y) => G.Pickups.drop('coin', x, y, 4));
      for (let i = 0; i < 2 + n; i++) spot(200, 700, (x, y) => G.Pickups.drop('ticket', x, y, 1));
      if (Math.random() < 0.2) spot(300, 700, (x, y) => G.Pickups.drop('ticket10', x, y, 1));
      for (let i = 0; i < 3; i++) spot(200, 600, (x, y) => G.Pickups.drop('heal', x, y, 0));
      for (const [kind, owner] of keep) spot(260, 480, (x, y) => G.Pickups.drop(kind, x, y, owner));
    }
    graceT = GRACE;
    fadeT = 2.6;
    G.Audio.sfx('shiny');
  }

  /** Cada fotograma en el piso del tesoro: nada sale; a los 60 s, al piso que tocaba. */
  function treasureTick(dt) {
    graceT = GRACE;                                      // tregua todo el rato: ni enemigos ni jefes
    if (G.Rift.inArena || (G.Dungeon && G.Dungeon.inRoom)) return;      // (por si acaso: el reloj espera)
    treasureT -= dt;
    if (!treasureWarn && treasureT <= 10) { treasureWarn = true; G.Spawner.say(G.T('¡10 s para dejar el piso del tesoro!'), 2.6, true); G.Audio.sfx('error'); }
    if (treasureT > 0 || !authority()) return;
    const t = treasure;
    if (G.Coop.active) G.Coop.broadcast(['fl', t.seed, t.next, t.th, t.danger]);
    descend(t.seed, t.next, t.th, t.danger);
  }

  /** Bioma de un piso (game.js también lo usa): «en llamas» siempre en el volcán. */
  function biomeAt(b) { return normal() && th().fire ? 2 : b; }

  // ---------------- mazmorra superada ----------------

  /** Todos: premio y celebración (el premio del grupo lo pone el anfitrión). */
  function onClear(t) {
    cleared = true; clearT = t; clearBanner = performance.now() + 6000;
    G.Progress.event('clear', { t });
    const pl = G.Game.player;
    if (authority() && pl) {
      // Monedas de la run y un ticket ×10 (los dos son del grupo: cada uno se los lleva).
      pl.coins = (pl.coins || 0) + 300;
      pl.t10 = (pl.t10 || 0) + 1;
    }
    if (pl) {
      for (const col of ['#ffd23f', '#ff8ad8', '#7fe0ff', '#5fe08a']) G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, col, 26, 300);
      G.FX.ring(pl.x, pl.y, 8, 260, '#ffd23f', 0.9, 8);
      G.Camera.kick(1.4);
    }
    G.Audio.sfx('legend');
    G.Spawner.say('', 0, true);
  }

  /** Anfitrión / solitario: la ventana de «mazmorra superada». */
  function showClear(done) {
    const box = document.getElementById('fclear-cards'), scr = document.getElementById('scr-fclear');
    const sub = document.getElementById('fclear-sub');
    if (!box || !scr) { done(); return; }
    sub.textContent = G.I18n.f('Has vencido al Señor del Laberinto en {x}. Premio: +300 monedas y un ticket ×10.', G.U.mmss(clearT));
    box.innerHTML = '';
    let chosen = false;
    const opts = [
      { icon: 'crown', name: 'Celebrar la victoria', desc: 'Termina la run ahora como victoria y ve el resumen.', fin: true },
      { icon: 'up', name: 'Seguir (modo sin fin)', desc: 'Bajas a B6F y sigues: pisos cada vez más duros, sin otra victoria.', fin: false }
    ];
    opts.forEach((o, i) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div class="ico" style="background:#ffd23f22">${G.Icons.html(o.icon, 32)}</div>
        <div class="txt"><div class="nm">${G.T(o.name)}</div><div class="ds">${G.T(o.desc)}</div></div>
        <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => {
        if (chosen) return;
        chosen = true;
        scr.classList.add('hidden');
        G.Audio.sfx('confirm');
        done();
        if (o.fin) setTimeout(() => G.Game.victory(), 0);
        else {
          endless = true;
          if (G.Coop.active) G.Coop.broadcast(['fcn']);
          G.Spawner.say(G.T('¡Sigue la aventura! Modo sin fin: los pisos se endurecen'), 3.4, true);
        }
      };
      box.appendChild(el);
    });
    scr.classList.remove('hidden');
  }
  /** Teclas 1-2 y elección automática del grupo (game.js). */
  function pickClear(i) { const c = document.querySelectorAll('#fclear-cards .card')[i]; if (c) c.click(); }

  // ---------------- efectos de los temas (hooks) ----------------

  /** Spawner: un enemigo recién creado en este piso. */
  function scaleEnemy(e) {
    if (!e) return;
    if (floor) {
      const kf = 1 + 0.08 * floor;       // 2026-10-15: antes +15 % por piso (se disparaba)
      e.maxHp = e.hp = Math.round(e.maxHp * kf);
      e.xp = Math.round(e.xp * (1 + 0.2 * floor));
    }
    if (!normal()) return;
    e.dmg *= k('dmg'); e.spd *= k('spd');
    e.xp = Math.round(e.xp * k('xp'));
    // (2026-10-19, V3.1 «más difícil y menos experiencia; poca de los pequeños, mucha de los grandes»)
    if (!e.boss) {
      e.maxHp = e.hp = Math.round(e.maxHp * NORMAL.hp);
      e.dmg *= NORMAL.dmg;
      e.xp = Math.max(1, Math.round(e.xp * NORMAL.xp * sizeXp(e)));
    }
  }
  /*
   * Partida normal más dura (2026-10-19, V3.1). Ajustables:
   *   hp/dmg  vida y daño de los salvajes        spawn/cap  ritmo y tope de aparición
   *   xp      experiencia (×0,75 de media: −25 %) repartida según el tamaño: sizeXp compara su
   *           radio con la media de los de su tramo (×0,6 los pequeños … ×1,7 los grandes), así
   *           que de media el tramo da lo mismo y la diferencia está entre pequeños y grandes.
   */
  const NORMAL = { hp: 1.15, dmg: 1.1, spawn: 1.12, cap: 1.1, xp: 0.75 };
  let sizeCast = null, sizeRef = null;
  function sizeXp(e) {
    const cast = G.Enemies.cast;
    if (cast !== sizeCast) {
      sizeCast = cast; sizeRef = {};
      for (const tier of cast) {
        const avg = tier.list.reduce((a, d) => a + G.Sprites.bodyRadius(d.dex, 1), 0) / Math.max(1, tier.list.length);
        for (const d of tier.list) sizeRef[d.dex] = avg;
      }
    }
    const ref = sizeRef[e.dex];
    return ref ? G.U.clamp(G.Sprites.bodyRadius(e.dex, 1) / ref, 0.6, 1.7) : 1;
  }
  const coinMul = () => (1 + 0.2 * floor) * k('coin') * (normal() ? farmMul() : 1);
  /** Spawner, «en llamas»: un salvaje de tipo Fuego (o null = el de siempre). */
  function pickDef() { return fireDefs && Math.random() < k('fire', 0) ? G.U.pick(fireDefs) : null; }
  /**
   * Spawner: ¿se aplaza el jefe de siempre? (con el jefe del piso vivo, escaleras fuera o el
   * jefe del piso a menos de 60 s, se aplaza para que no se junten).
   */
  function holdBoss(t) {
    if (!normal()) return false;
    return bossState === 'alive' || stairs.length > 0 || (bossState === 'wait' && bossAt - t < 60);
  }

  // ---------------- ataque combinado ----------------

  const COMBO_R = 140, COMBO_FILL = 20, BLAST_R = 300;
  const nearestMate = pl => {
    let best = null, bd = Infinity;
    for (const o of G.Coop.puppets()) {
      if (o.dead) continue;
      const d = G.U.dist2(o.x, o.y, pl.x, pl.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { o: best, d: Math.sqrt(bd) } : null;
  };

  function comboTick(dt, players) {
    const pl = G.Game.player;
    if (!G.Coop.active || G.PvP.on || !pl || pl.dead) return;
    const m = nearestMate(pl);
    const was = combo >= 1;
    if (m && m.d < COMBO_R) combo = Math.min(1, combo + dt / COMBO_FILL);
    else combo = Math.max(0, combo - dt / 60);
    // Recién lleno: aviso claro de cómo se usa (2026-10-16: el dueño no sabía que era la F).
    if (combo >= 1 && !was) {
      G.Spawner.say(G.T(G.Touch.active ? '¡Ataque combinado listo! Toca el botón para lanzarlo' : '¡Ataque combinado listo! Pulsa F para lanzarlo'), 3.5, true);
      G.Audio.sfx('surge');
    }
    if (combo >= 1 && G.Input.tap('keyf')) fireCombo();
  }

  function fireCombo() {
    const pl = G.Game.player;
    if (combo < 1 || !pl || pl.dead) return;
    const m = nearestMate(pl);
    const mate = m ? m.o : pl;
    const x = (pl.x + mate.x) / 2, y = (pl.y + mate.y) / 2;
    combo = 0;
    G.Progress.event('combo');
    const dmg = 250 * pl.atk * (1 + 0.04 * pl.level);
    for (const e of G.EnemyMgr.queryCircle(x, y, BLAST_R)) {
      if (e.dead) continue;
      e.hurt(dmg, '#ffe14d', e.x - x, e.y - y, 260, 'crit');
      pl.dmgDealt += dmg;
    }
    const ca = typeColor(pl), cb = typeColor(mate);
    comboFx(x, y, ca, cb);
    if (G.Coop.isHost) G.Coop.broadcast(['cb', Math.round(x), Math.round(y), ca, cb]);
    else G.Coop.toHost(['cb', Math.round(x), Math.round(y), ca, cb]);
  }
  const typeColor = p => G.U.TYPE_COLOR[(p.mon && p.mon.types && p.mon.types[0]) || 'normal'] || '#ffffff';

  /** Lo que se ve del ataque combinado (también para los demás). */
  function comboFx(x, y, ca, cb) {
    comboFlash = 0.5;
    G.FX.ring(x, y, 10, BLAST_R, ca, 0.7, 8);
    G.FX.ring(x, y, 30, BLAST_R * 0.8, cb, 0.9, 6);
    G.FX.ring(x, y, 4, BLAST_R * 1.15, '#ffffff', 0.5, 3);
    G.FX.burst(x, y - 20, ca, 40, 320);
    G.FX.burst(x, y - 20, cb, 40, 280);
    G.FX.burst(x, y - 20, '#fff3b0', 24, 200);
    if (G.U.dist2(x, y, G.Camera.x, G.Camera.y) < 900 * 900) G.Camera.kick(1.1);
    G.Audio.sfx('legend');
    G.Spawner.say(G.T('¡ATAQUE COMBINADO!'), 1.8, true);
  }

  // ---------------- red ----------------

  function onNet(ev) {
    switch (ev[0]) {
      case 'st': setStairs(ev[1], ev[2], ev[1] + 200, ev[2], 'std', 'fog'); break;     // (formato viejo)
      case 'st2': setStairs(ev[1], ev[2], ev[3], ev[4], ev[5], ev[6], !!ev[7]); break;
      case 'fl': descend(ev[1], ev[2], ev[3], ev[4]); break;
      case 'ftr': enterTreasure(ev[1], ev[2], ev[3], ev[4], ev[5]); break;
      case 'fbs': floor = ev[2]; announceBoss(ev[1], !!ev[3]); break;
      case 'fclr': onClear(ev[1]); break;
      case 'fcn': endless = true; G.Spawner.say(G.T('¡Sigue la aventura! Modo sin fin: los pisos se endurecen'), 3.4, true); break;
      case 'cb': comboFx(ev[1], ev[2], ev[3], ev[4]); break;
      case 'lst': lordView = { id: ev[1], sh: (ev[2] || 0) / 100, inv: ev[3] ? 1 : 0 }; break;     // escudo/invulnerable de Arceus
      case 'ldb': applyCurse(ev[1], ev[2], ev[3], ev[4], ev[5]); break;                             // maldición de Arceus
    }
  }

  // ---------------- dibujo ----------------

  const F = (wt, s) => `${wt} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const routeName = s => G.T(s.route === 'danger' ? 'Ruta peligrosa' : 'Ruta segura');
  const stairsLabel = s => routeName(s) + '・' + G.T(THEMES[s.theme].name);
  /** Texto con contorno oscuro (se lee sobre cualquier suelo). */
  function outlined(ctx, txt, x, y, col, lw = 4) {
    ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(0,0,0,.88)'; ctx.lineJoin = 'round';
    ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
  }

  /** Las escaleras, para ordenarlas con lo demás del suelo (game.js drawScene). */
  function drawable() {
    if (!stairs.length) return null;
    return { y: Math.min(...stairs.map(s => s.y)) - 4000, draw: drawStairs };   // planas: debajo de todo
  }
  function drawStairs(ctx) {
    const now = performance.now() / 1000;
    for (const s of stairs) {
      if (!G.Camera.sees(s.x, s.y, 120)) continue;
      const danger = s.route === 'danger';
      const img = G.Tiles.propSprite(G.World.biome, 'stairs', danger ? 1 : 0), kk = 2;
      ctx.save();
      // Halo que late para que se vean desde lejos (azul la segura, rojo la peligrosa).
      ctx.globalAlpha = 0.18 + Math.sin(now * 3) * 0.08;
      ctx.fillStyle = danger ? '#ff5a3d' : '#7fb8ff';
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 58, 40, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(s.x - img.width * kk / 2), Math.round(s.y - img.height * kk / 2), img.width * kk, img.height * kk);
      if (Math.random() < 0.06) G.FX.twinkle(s.x + G.U.rand(-30, 30), s.y + G.U.rand(-24, 20));
      ctx.restore();
    }
  }

  /** Encima de todo (game.js render): carteles de las escaleras y la corona del jefe del piso. */
  function drawAir(ctx) {
    const now = performance.now() / 1000;
    const pls = G.Coop.active ? G.Coop.players() : [G.Game.player];
    // Ataque combinado listo: recordatorio encima de tu Pokémon hasta que lo lances.
    const me = G.Game.player;
    if (combo >= 1 && G.Coop.active && !G.PvP.on && me && !me.dead) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = F(800, 13);
      ctx.globalAlpha = 0.65 + Math.sin(now * 8) * 0.35;
      outlined(ctx, G.T(G.Touch.active ? '¡Toca Combo!' : '¡Pulsa F: Combo!'), me.x, me.y - me.bodyH - 30, '#ffe14d');
      ctx.restore();
    }
    stairs.forEach((s, i) => {
      if (!G.Camera.sees(s.x, s.y, 160)) return;
      const danger = s.route === 'danger', th0 = THEMES[s.theme];
      const [on, n, missing] = onStairs(pls, s);
      ctx.save();
      ctx.textAlign = 'center';
      const ly = s.y - 52 - Math.abs(Math.sin(now * 2.5 + i)) * 4;
      ctx.font = F(800, 13);
      outlined(ctx, stairsLabel(s), s.x, ly, danger ? '#ffb08a' : '#cfe4ff');
      ctx.font = F(700, 10);
      const sub = on > 0 && n > 1 ? G.I18n.f('Todos a las escaleras: {x}/{x}', on, n) + (missing.length ? ' · ' + G.T('Faltan') + ': ' + missing.map(p => p.tag || G.T('Tú')).join('、') : '')
        : danger ? G.T('Más difícil · regalo al llegar') : G.T('BAJAR AL SIGUIENTE PISO');
      outlined(ctx, sub, s.x, ly + 14, on > 0 ? '#ffe9a0' : th0.color, 3);
      if (on > 0 && on >= n) {
        const f = Math.min(1, standT[i] / STAND);
        ctx.strokeStyle = danger ? '#ff7a5a' : '#7fb8ff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(s.x, s.y, 46, -Math.PI / 2, -Math.PI / 2 + 6.2832 * (authority() ? f : (now % 1))); ctx.stroke();
      }
      ctx.restore();
    });
    // Corona sobre el jefe del piso.
    const e = floorBoss();
    if (e && bossLord && G.Camera.sees(e.x, e.y, 300)) drawLordAura(ctx, e, now);
    if (e && G.Camera.sees(e.x, e.y, 120)) {
      const img = G.Tiles.propSprite(0, 'crown', bossLord ? 1 : 0), kk = 2;
      const y = e.y - e.bodyH - 18 - Math.abs(Math.sin(now * 3)) * 3;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(e.x - img.width * kk / 2), Math.round(y - img.height * kk), img.width * kk, img.height * kk);
      ctx.textAlign = 'center'; ctx.font = F(800, 11);
      outlined(ctx, G.T(bossLord ? 'Señor del Laberinto' : 'Jefe del piso'), e.x, y - img.height * kk - 4, bossLord ? '#ffb0ff' : '#ffd23f', 3);
      ctx.restore();
    }
  }
  /**
   * Escudo Divino (anillo de rombos dorados que gira, más denso cuanto más escudo) y, cargando,
   * rayos de luz que convergen en Arceus. Todo en píxeles. Lo ven todos (lordView en invitados).
   */
  function drawLordAura(ctx, e, now) {
    const sh = authority() ? Math.max(0, e.lordShield || 0) / e.maxHp : (lordView.id === e.id ? lordView.sh : 0);
    const inv = authority() ? !!e.lordInv : lordView.id === e.id && !!lordView.inv;
    const cy = e.y - e.bodyH * 0.5, R = Math.max(e.r * 1.7, 40);
    ctx.save();
    if (sh > 0) {
      const n = Math.max(6, Math.round(10 + sh * 40));
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.2832 + now * 0.9;
        const x = Math.round(e.x + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R * 0.75);
        ctx.fillStyle = i % 2 ? '#ffe9a0' : '#fff6d0';
        ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x - 1, y - 1, 3, 3);
      }
      ctx.font = F(800, 10); ctx.textAlign = 'center';
      outlined(ctx, G.I18n.f('Escudo Divino {x}%', Math.round(sh * 100)), e.x, e.y + 16, '#ffe9a0', 3);
    }
    if (inv) {
      // Carga: rayos que entran hacia él y un halo que late.
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.2832 + now * 2, d = R * (1.6 - ((now * 1.8 + i * 0.37) % 1));
        ctx.fillStyle = i % 3 ? '#fff3c0' : '#ffffff';
        ctx.fillRect(Math.round(e.x + Math.cos(a) * d) - 1, Math.round(cy + Math.sin(a) * d * 0.75) - 1, 3, 3);
      }
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(now * 14);
      ctx.fillStyle = '#fff6d0';
      ctx.beginPath(); ctx.ellipse(e.x, cy, R * 0.9, R * 0.7, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = F(800, 11); ctx.textAlign = 'center';
      outlined(ctx, G.T('¡Invulnerable!'), e.x, e.y + 30, '#ffffff', 3);
    }
    ctx.restore();
  }
  /** El jefe del piso vivo (también la copia del invitado). */
  function floorBoss() {
    if (bossState !== 'alive' || !bossId) return null;
    const e = G.EnemyMgr.get(bossId);
    return e && !e.dead ? e : null;
  }

  function comboBar(ctx, x, y, bw, roundRect) {
    roundRect(ctx, x, y, bw, 8, 4); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
    if (combo > 0) {
      ctx.save(); roundRect(ctx, x, y, bw, 8, 4); ctx.clip();
      const g = ctx.createLinearGradient(x, 0, x + bw, 0);
      g.addColorStop(0, '#ff8ad8'); g.addColorStop(1, '#ffe14d');
      ctx.fillStyle = combo >= 1 && Math.sin(performance.now() / 90) > 0 ? '#ffffff' : g;
      ctx.fillRect(x, y, bw * Math.min(1, combo), 8);
      ctx.restore();
    }
  }
  /** Móvil (hud.js, dentro del bloque escalado): «Combo» y su barra en una fila. Devuelve el ancho. */
  function drawComboRow(ctx, x, y, Fh, roundRect) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = Fh(800, 9);
    ctx.fillStyle = combo >= 1 ? '#ffe14d' : '#cfd8ea';
    const t = G.T('Combo') + (combo >= 1 ? '!' : ''), tw = ctx.measureText(t).width;
    ctx.fillText(t, x, y + 9);
    comboBar(ctx, x + tw + 6, y + 2, 74, roundRect);
    ctx.restore();
    return tw + 6 + 74;
  }

  /** HUD (coordenadas de pantalla): piso y tema, barra del combinado, avisos grandes. */
  function drawHud(ctx, w, h, pl, Fh, roundRect) {
    ctx.save();
    const boss = G.EnemyMgr.bossAlive();
    if (allowed() && treasure) {
      // Piso del tesoro: «Piso del tesoro · 0:42» en dorado (rojo los últimos 10 s).
      const txt = G.T('Piso del tesoro'), st = G.I18n.f('Siguiente piso en {x}', G.U.mmss(Math.max(0, Math.ceil(treasureT))));
      ctx.font = Fh(800, 12); const w1 = ctx.measureText(txt).width;
      ctx.font = Fh(700, 11); const w2 = ctx.measureText(st).width + 10;
      const tw = w1 + w2 + 16, x0 = Math.round(G.HUD.laneX(tw, w) - tw / 2), y0 = boss ? 87 : 64;
      roundRect(ctx, x0, y0, tw, 19, 9);
      ctx.fillStyle = 'rgba(40,28,4,.85)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = Fh(800, 12); ctx.fillStyle = '#ffd23f'; ctx.fillText(txt, x0 + 8, y0 + 14);
      ctx.font = Fh(700, 11); ctx.fillStyle = treasureT <= 10 ? '#ff8a96' : '#fff3c8'; ctx.fillText(st, x0 + 8 + w1 + 10, y0 + 14);
      G.HUD.tapInfo(x0, y0, tw, 19, 'floor', () => ({ title: G.T('Piso del tesoro'), color: '#ffd23f',
        lines: [G.T('Un piso escondido lleno de monedas y tickets, sin Pokémon salvajes ni jefe.'),
                G.I18n.f('A los 60 s todo el grupo baja solo a B{x}F.', treasure.next + 1)] }));
    } else if (allowed()) {
      // Pastilla «B2F · Niebla · Jefe del piso en 1:20» debajo del reloj (tocar = qué hace el tema).
      const t0 = th(), txt = 'B' + (floor + 1) + 'F · ' + G.T(t0.name) + (endless ? ' ∞' : '');
      const age = stairsAge(), fm = farmMul();
      let st = null, col = '#cfd8ea';
      if (fm < 1) { st = G.I18n.f('Exp. y monedas ×{x}', fm === 0.5 ? '0.5' : '0.25'); col = '#ff8a96'; }
      else if (stairs.length) { st = G.T('Escaleras abiertas'); col = '#9fc8ff'; }
      else if (bossState === 'alive') { st = G.T(bossLord ? 'Señor del Laberinto: ¡véncelo!' : 'Jefe del piso: ¡véncelo!'); col = '#ffd23f'; }
      else if (bossState === 'wait' && T() < bossAt) st = G.I18n.f('Jefe del piso en {x}', G.U.mmss(Math.max(0, bossAt - T())));
      ctx.font = Fh(800, 12);
      const w1 = ctx.measureText(txt).width;
      ctx.font = Fh(700, 11);
      const w2 = st ? ctx.measureText(st).width + 10 : 0;
      const tw = w1 + w2 + 16, x0 = Math.round(G.HUD.laneX(tw, w) - tw / 2), y0 = boss ? 87 : 64;
      roundRect(ctx, x0, y0, tw, 19, 9);
      ctx.fillStyle = 'rgba(8,12,24,.78)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = t0.color; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = Fh(800, 12); ctx.fillStyle = t0.color; ctx.fillText(txt, x0 + 8, y0 + 14);
      if (st) { ctx.font = Fh(700, 11); ctx.fillStyle = col; ctx.fillText(st, x0 + 8 + w1 + 10, y0 + 14); }
      G.HUD.tapInfo(x0, y0, tw, 19, 'floor', () => ({ title: 'B' + (floor + 1) + 'F · ' + G.T(t0.name), color: t0.color,
        lines: [G.T(t0.desc),
                route ? G.T(route === 'danger' ? 'Llegaste por la ruta peligrosa.' : 'Llegaste por la ruta segura.') : '',
                G.T('Mazmorra de 5 pisos: vence al jefe de cada piso para abrir dos escaleras (ruta segura o peligrosa). En B5F espera el Señor del Laberinto.'),
                G.T('Con las escaleras abiertas el piso deja de endurecerse; si os quedáis más de 3 min, experiencia y monedas ×0,5 (5 min: ×0,25).'),
                age >= 0 ? G.I18n.f('Escaleras abiertas hace {x}', G.U.mmss(age)) : ''] }));
    }
    if (G.Coop.active && !G.PvP.on && pl && !pl.dead) {
      const touch = G.Touch.active;
      // A la derecha de las monedas de la run (hud.js), no encima (2026-10-15: se tapaban).
      // (Móvil: la dibuja hud.js en su propia fila del bloque de la izquierda, drawComboRow.)
      if (!G.HUD.comboRow) {
        const x = (G.HUD.coinEnd || 16 + 48 + 168 + 8) + 12, y = 37;
        ctx.textAlign = 'left';
        ctx.font = Fh(800, 9);
        ctx.fillStyle = combo >= 1 ? '#ffe14d' : '#cfd8ea';
        ctx.fillText(G.T('Combo') + (combo >= 1 ? (touch ? '!' : ' [F]') : ''), x, y - 3);
        comboBar(ctx, x, y, 74, roundRect);
      }
      // Móvil: botón grande cuando está lleno. Abajo a la derecha, junto a la barra de
      // movimientos (antes, a media altura, tapaba la lista del minimapa en horizontal).
      if (combo >= 1 && touch) {
        const S = 64;
        const bx = w - S - 16 - G.HUD.SR;
        let by = h - S - 18 - G.HUD.SB;
        if (bx < G.HUD.barRight + 10) by -= S + 34;          // (no cabe al lado: encima)
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(bx + S / 2, by + S / 2, S / 2, 0, 6.2832);
        ctx.fillStyle = Math.sin(performance.now() / 120) > 0 ? '#ffd23f' : '#ff8ad8'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#2a1a08'; ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center'; ctx.font = Fh(800, 13); ctx.fillStyle = '#1a1208';
        ctx.fillText(G.T('Combo'), bx + S / 2, by + S / 2 + 5);
        G.Touch.addButton(bx, by, S, S, fireCombo, 8);
      }
    }
    // Carteles grandes: escaleras abiertas, jefe del piso, mazmorra superada.
    ctx.textAlign = 'center';
    const big = (t1, t2, c1, c2, a, y) => {
      ctx.globalAlpha = a;
      ctx.font = Fh(800, Math.min(30, w / 22));
      outlined(ctx, t1, w / 2, y, c1, 6);
      if (t2) { ctx.font = Fh(800, Math.min(13, w / 50)); outlined(ctx, t2, w / 2, y + 22, c2, 4); }
      ctx.globalAlpha = 1;
    };
    const yb = Math.max(boss ? 150 : 140, h * 0.3 - 46);      // (encima del aviso del spawner, h·0,3)
    if (treasureBanner && performance.now() < treasureBanner && treasure) {
      const left = (treasureBanner - performance.now()) / 1000;
      big(G.T('¡PISO DEL TESORO!'), G.T('¡Coge todas las monedas y tickets que puedas en 60 s!'), '#ffe14d', '#fff3c8', Math.min(1, left, (4.2 - left) * 3), yb);
    } else if (clearBanner && performance.now() < clearBanner) {
      const left = (clearBanner - performance.now()) / 1000;
      big(G.T('¡MAZMORRA SUPERADA!'), G.I18n.f('Tiempo: {x} · +300 monedas · ticket ×10', G.U.mmss(clearT)), '#ffe14d', '#fff3c8', Math.min(1, left, (6 - left) * 3), yb);
      if (G.Coop.active && !G.Coop.isHost) { ctx.font = Fh(700, 11); outlined(ctx, G.T('El anfitrión decide: terminar o seguir'), w / 2, yb + 40, '#cfe4ff', 3); }
    } else if (bossBanner && performance.now() < bossBanner.until) {
      const left = (bossBanner.until - performance.now()) / 1000;
      big(G.T(bossBanner.lord ? '¡SEÑOR DEL LABERINTO!' : '¡JEFE DEL PISO!'), G.T(bossBanner.name) + ' · ' + G.T('Véncelo para abrir las escaleras'),
          bossBanner.lord ? '#ffb0ff' : '#ffd23f', '#ffe9c8', Math.min(1, left, (3.6 - left) * 3), yb);
    } else if (promptT > 0 && stairs.length) {
      big(G.T('¡Las escaleras al siguiente piso ya están abiertas!'),
          stairsLabel(stairs[0]) + '  /  ' + stairsLabel(stairs[1]) + ' — ' + G.T('todo el grupo sobre la misma 2 s'),
          '#cfe4ff', '#ffe9c8', Math.min(1, promptT, (5 - promptT) * 3), yb);
    }
    ctx.restore();
  }

  /** Fundido al bajar: lo último que se dibuja (encima del HUD y el minimapa; game.js render). */
  function drawFade(ctx, w, h, Fh) {
    ctx.save();
    if (fadeT > 0) {
      // Fundido a negro al bajar, con el piso nuevo en grande (como en Mundo Misterioso).
      const a = Math.min(1, fadeT / 0.8), t0 = th();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.font = Fh(800, 40); ctx.fillStyle = treasure ? '#ffd23f' : '#cfe4ff';
      ctx.fillText(treasure ? G.T('Piso del tesoro') : 'B' + (floor + 1) + 'F', w / 2, h / 2 - 8);
      if (treasure) {
        ctx.font = Fh(700, 14); ctx.fillStyle = '#fff3c8';
        ctx.fillText(G.T('Monedas y tickets por todas partes · sin enemigos · 60 s'), w / 2, h / 2 + 24);
      } else if (normal()) {
        ctx.font = Fh(800, 18); ctx.fillStyle = t0.color;
        ctx.fillText((route ? G.T(route === 'danger' ? 'Ruta peligrosa' : 'Ruta segura') + '・' : '') + G.T(t0.name), w / 2, h / 2 + 20);
        ctx.font = Fh(700, 12); ctx.fillStyle = '#9fc8ff';
        ctx.fillText(G.T(t0.desc), w / 2, h / 2 + 42);
        if (route === 'danger') { ctx.fillStyle = '#ffd23f'; ctx.fillText(G.T('Regalo de la ruta peligrosa: un ticket y una poción para cada uno'), w / 2, h / 2 + 60); }
      } else {
        ctx.font = Fh(700, 14); ctx.fillStyle = '#9fc8ff';
        ctx.fillText(G.T('Enemigos más fuertes, más premios'), w / 2, h / 2 + 30);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  return { reset, update, onNet, scaleEnemy, graceMul, get inGrace() { return graceT > 0; }, drawable, drawAir, drawHud, drawComboRow, drawFade, fireCombo, comboFx, descend,
           diffTime, holdBoss, pickDef, biomeAt, pickClear, floorBoss, THEMES, LAST,
           get floor() { return floor; }, get coinMul() { return coinMul(); },
           /** Compatibilidad: la primera escalera (tips.js). Todas: stairsAll. */
           get stairs() { return stairs[0] || null; }, get stairsAll() { return stairs; },
           get theme() { return theme; }, get route() { return route; }, get cleared() { return cleared; }, get endless() { return endless; },
           get clearTime() { return clearT; }, get dangerRuns() { return dangerRuns; },
           get spawnMul() { return k('spawn') * (normal() ? NORMAL.spawn : 1); }, get capMul() { return k('cap') * (normal() ? NORMAL.cap : 1); }, lordShieldBroken, get eliteMul() { return k('elite'); },
           get eliteItem() { return !!k('eliteItem', false); }, get healMul() { return k('heal'); }, get thickFog() { return !!k('fog', false); },
           get farmMul() { return normal() ? farmMul() : 1; }, get stairsAge() { return stairsAge(); },
           get bossState() { return bossState; }, get bossAt() { return bossAt; },
           get treasure() { return !!treasure; }, get treasureLeft() { return treasure ? treasureT : 0; },
           get combo() { return combo; }, set combo(v) { combo = v; } };
})();
