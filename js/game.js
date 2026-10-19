/* ============ game.js — flujo del juego y bucle principal ============
 *
 *   login ──> test de personalidad ──> menú ──> run ──> resumen ──> menú
 *                (sólo la 1ª vez)          │
 *                                          ├─ Pokémon (colección)
 *                                          ├─ Mejoras
 *                                          └─ Gacha
 *
 * Estados del bucle: 'ui' (menús, con el mundo de fondo), 'playing',
 * 'levelup', 'paused', 'over'.
 *
 * Cooperativo (G.Coop.active): el anfitrión lleva enemigos, objetos y
 * experiencia; cada uno su Pokémon. La pausa no para el juego, las cartas de
 * nivel esperan a que elijan todos y un compañero caído se levanta si otro
 * se queda a su lado. Ver net/coop.js.
 */
G.Game = (() => {
  let cv, ctx, dpr = 1, w = 0, h = 0;
  // Capa del HUD (2026-10-17): textos e interfaz en un lienzo aparte a la resolución real de la
  // pantalla. El mundo puede ir a ×1-1,5 (es pixel art y es lo que cuesta), pero el texto escalado
  // ×2-3 en un iPhone se veía borroso.
  let hcv, hctx, hdpr = 1;
  const wantHudDpr = () => Math.min(window.devicePixelRatio || 1, lowRes ? 2 : 3);
  let state = 'ui';
  let time = 0, last = 0, pendingLevels = 0;
  let pl = null;
  let caught = [];          // shinies conseguidos en esta run
  let biome = -1;

  const st = { get time() { return time; } };

  // ---------------- arranque ----------------

  function init() {
    cv = document.getElementById('game');
    ctx = cv.getContext('2d');
    hcv = document.createElement('canvas');
    hcv.id = 'hud-cv';
    cv.insertAdjacentElement('afterend', hcv);
    hctx = hcv.getContext('2d');
    resize();
    addEventListener('resize', resize);
    // (2026-10-17, iPhone: al girarlo o al esconderse la barra de Safari, el evento 'resize'
    // llegaba antes de que cambiara el tamaño, o no llegaba: el lienzo se quedaba con el tamaño
    // viejo estirado a la pantalla nueva (todo aplastado y el joystick lejos del dedo).)
    // Se mira el tamaño de verdad: cuando cambia el del lienzo, y otra vez tras girar.
    if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(cv);
    if (window.visualViewport) visualViewport.addEventListener('resize', resize);
    addEventListener('orientationchange', () => { setTimeout(resize, 120); setTimeout(resize, 500); });
    G.Touch.init(cv);
    // En móvil: al cambiar de app o girarlo en vertical, la partida se pausa.
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); else if (pl && state !== 'over' && state !== 'ui') keepAwake(true); });
    G.RunUI.wirePause(() => { if (coopPause) { resumeCoop(); return; } state = 'playing'; G.UI.hideAll(); }, quitRun);
    Backdrop.init();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // Móvil en calidad baja (2026-10-16): resolución interna ×1 (la mitad de píxeles que ×1,5).
  // En un móvil lento lo que más cuesta es rellenar píxeles. Una vez que la calidad
  // automática baja a "baja" se queda así (si no, al ir mejor volvería a subir y a tirones).
  let lowRes = false;
  function wantDpr() {
    if (G.Settings.touch && G.Settings.fx === 0) lowRes = true;
    return Math.min(lowRes ? 1 : 1.5, window.devicePixelRatio || 1);
  }
  G.Settings.on(k => { if (k === 'quality') { lowRes = false; if (cv) resize(); } });

  function resize() {
    // Resolución interna como mucho ×1,5: en pantallas ×2 dibujar el doble de
    // píxeles era de lo que más costaba, y con el pixel art no se nota.
    dpr = wantDpr();
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    hdpr = wantHudDpr();
    hcv.width = Math.round(w * hdpr);
    hcv.height = Math.round(h * hdpr);
    G.Camera.resize(w, h, dpr);
    checkOrientation();
  }

  /** Móvil en vertical: aviso de girarlo (y pausa). */
  function checkOrientation() {
    const portrait = G.Touch.active && innerHeight > innerWidth;
    const el = document.getElementById('rotate');
    if (!el) return;
    if (portrait && !document.getElementById('rotate-ico').innerHTML) document.getElementById('rotate-ico').innerHTML = G.Icons.html('phone', 48);
    el.classList.toggle('hidden', !portrait);
    if (portrait) autoPause();
  }

  /** Móvil: que la pantalla no se apague sola mientras juegas (Wake Lock; si no hay, nada). */
  let wake = null;
  function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) {
        navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {});
      } else if (!on && wake) { wake.release().catch(() => {}); wake = null; }
    } catch (e) { /* nada */ }
  }

  /** Pausa sola (sólo en solitario: en grupo los demás siguen). */
  function autoPause() {
    G.Touch.reset();
    if (state === 'playing' && !G.Coop.active) { state = 'paused'; G.RunUI.showPause(); }
  }

  /** Pausa/continúa (tecla Esc o P, o el botón de pausa del móvil). */
  let holdBy = [];                   // grupo: quién para la partida (eligiendo o en pausa)
  let holdPaused = [];               // de ellos, los que están en pausa
  let coopPause = false;             // grupo: TÚ has pausado (la partida se para para todos)

  function togglePause() {
    // En grupo la pausa para la partida a todos (como al elegir cartas, coop.js).
    if (G.Coop.active) {
      if (coopPause) { resumeCoop(); return; }
      if (state !== 'playing' && state !== 'held') return;
      coopPause = true; state = 'held';
      G.RunUI.showPause(true); G.Audio.sfx('pause');
      G.Coop.holdStart();
      return;
    }
    if (state === 'playing') { state = 'paused'; G.RunUI.showPause(); G.Audio.sfx('pause'); }
    else if (state === 'paused') { state = 'playing'; G.UI.hideAll(); }
  }

  /** Grupo: quitas tu pausa; si nadie más para la partida, sigue. */
  function resumeCoop() {
    coopPause = false;
    G.UI.hide('scr-pause');
    if (coopCards.length) { nextCoopCard(); G.Coop.holdEnd(); return; }   // cartas que llegaron mientras tanto
    if (state === 'held') state = holdBy.length || awayBy ? 'held' : 'playing';
    if (state === 'held') { if (awayBy) G.Spawner.say(awayText(), 999, true); else holdText(); }
    else G.Spawner.say('', 0, true);
    G.Coop.holdEnd();
  }

  // ---------------- run ----------------

  /** @param coop  { seed, host, members } para una partida en grupo */
  function startRun(coop = null) {
    offerQ.length = 0; orphanT = 0; pendingItems = []; pendingUI(true); clearWin = false;
    holdBy = []; holdPaused = []; awayBy = null; coopPause = false;
    const save = G.DB.save;
    // PK con personaje al azar: el Pokémon que le ha tocado a cada uno (cfg.members), sin mejoras.
    const randomMe = coop && coop.rand ? (coop.members.find(m => m.uid === G.Net.uid) || {}).dex : null;
    // Reto diario en solitario (2026-10-16): todos con el Pokémon del día y sin mejoras.
    const dailyMon = !coop && G.Modes.run === 'daily' ? G.Modes.daily().dex : null;
    const mon = G.DEX_BY[randomMe || dailyMon || save.partner] || G.DEX_BY[G.STARTERS[0].dex];
    // Arena de PK: todos sin las mejoras de la tienda (igualdad).
    const flat = !!(coop && coop.pvp && coop.arena) || !!dailyMon;
    const perks = G.Upgrades.perks(randomMe || flat ? {} : G.DB.upgradesOf(mon.dex));

    G.UI.hideAll();
    G.UI.chrome(false);
    G.FX.clear();
    G.Projectiles.clear();
    G.Combat.clearFields(); G.Arts.reset();
    G.EnemyMgr.clear();
    G.Pickups.clear();
    G.Loot.reset();
    G.Boons.reset();
    G.Dungeon.reset();
    G.Floors.reset();
    G.RunGoals.reset();
    G.Companion.reset();
    G.Guard.reset();
    if (coop) { G.Modes.reset(); G.Modes.setRoom(coop.mods || {}); }
    // Desafíos / aventura: sus reglas (las "Reglas a medida" sólo valen en la run normal).
    G.Challenges.prepare();
    G.Stages.prepare();
    // Retos diario y semanal: el mapa y el elenco de enemigos salen de la fecha (iguales para todos).
    const fixedSeed = G.Challenges.seed();       // en grupo también: todos el mismo mapa del día/semana
    const prepare = () => {
      G.Spawner.reset();
      G.Rift.reset();
      G.Raid.reset();
      G.Events.reset();
      G.Weather.reset();
      G.Path.clear();
      G.Hazards.clear();
      G.World.reset(fixedSeed != null ? fixedSeed : coop ? coop.seed : Math.floor(Math.random() * 1e6));
    };
    if (fixedSeed != null) G.Modes.seeded(fixedSeed, prepare); else prepare();
    G.World.setBiome(0, true);
    // Escenario elegido en Modos de juego (en grupo, el del anfitrión): toda la run en él.
    fixedScene = coop ? (Number.isInteger(coop.scene) ? coop.scene : null) : G.Modes.scene();
    if (G.Stages.scene() != null) fixedScene = G.Stages.scene();      // aventura: el escenario de la fase
    if (fixedScene != null) G.World.setBiome(fixedScene, true);
    biome = 0;
    time = 0; pendingLevels = 0; coopCards = [];

    pl = new G.Player(mon, perks, !randomMe && !dailyMon && !!save.partnerShiny && G.DB.ownsShiny(mon.dex));
    pl.dailyMon = !!dailyMon;
    pl.startDex = mon.dex;      // retos del Pokédex: cuenta para el que elegiste aunque evolucione
    // Modo extremo: más premio (XP y monedas).
    pl.xpMul *= G.Modes.rewardMul(); pl.coinMul *= G.Modes.rewardMul();
    G.Challenges.applyPlayer(pl);
    banked = { t1: 0, t10: 0 };
    caught = [];
    // Atajos: movimientos con hueco fijo (save.pbind[dex] = [id del 1, id del 2, ...]),
    // antes de aprender nada: addMove ya los coloca.
    if (!dailyMon) (save.pbind && save.pbind[mon.dex] || []).forEach((id, i) => { if (id) pl.bind[id] = i; });
    pl.addMove(G.startMoveOf(mon.dex));
    // Mejora "Veto": movimientos que no quieres que te salgan.
    pl.banned = new Set(dailyMon ? [] : (save.pban && save.pban[mon.dex] || []).slice(0, perks.bans));
    // Mejora "Repertorio": un segundo movimiento de ataque al azar.
    if (perks.startMoves >= 2) {
      const pool = G.Moves.poolFor(mon).filter(id => !pl.hasMove(id) && !pl.banned.has(id) && G.Moves.BY_ID[id].kind !== 'buff');
      if (pool.length) pl.addMove(G.U.pick(pool));
      pl.setActive(0);
    }
    // Aventura: empiezas con unos niveles ya ganados (cartas al empezar), más cuanto más lejos.
    // Modo jefes (2026-10-15): empiezas con 5 niveles (y sus cartas): con un solo movimiento a
    // nivel 1, el primer jefe apenas notaba los golpes.
    const head = G.Stages.headStart() || (G.Modes.on('boss') && !G.PvP.on ? 5 : 0);
    if (head) { pl.level += head; pl.xpNext = G.Player.xpFor(pl.level); pendingLevels += head; pl.levelGrowth(); }

    if (coop) {
      G.Coop.begin(coop, pl, coopApi);
      G.Social.setPlaying(true);
    }
    G.Camera.x = pl.x; G.Camera.y = pl.y; G.Camera.shake = 0;
    // Hojas de sprites locales: el compañero y los primeros enemigos.
    G.Sprites.preload([mon.dex], 8000, pl.shiny);
    G.Audio.music(G.BIOME_MUSIC[0]);
    deathT = 0;

    state = 'playing';
    keepAwake(true);
    G.PvP.arenaStart(pl);
    if (G.Modes.run === 'training') G.Training.begin(pl);     // sala de entrenamiento (training.js)
    if (G.Modes.run === 'guard') G.Guard.begin(pl);           // «Proteger a Dazhuang» (guard.js)                 // arena de PK: elegir 3 de 5 movimientos
  }

  function quitRun() {
    if (G.Coop.active) G.Coop.leave();
    endRun(false);
  }

  /** Todos los jugadores de la partida (tú primero). */
  function everyone() { return G.Coop.active ? G.Coop.players() : [pl]; }

  /** Experiencia que hace falta para el siguiente nivel (cofres con candado). */
  function levelXp() {
    if (!pl) return 20;
    const k = (G.Coop.active ? G.Coop.xpFactor() : 1) * (pl.xpMul || 1);
    return Math.ceil((pl.xpNext - pl.xp + 1) / k);
  }

  // Destello de pantalla completa (viaje a la grieta).
  let flashT = 0, flashDur = 1, flashCol = '#fff';
  function flash(col, dur) { flashCol = col; flashDur = dur; flashT = dur; }

  function teamState() {
    return { time, level: pl.level, xp: pl.xp, xpNext: pl.xpNext, kills: pl.kills, bosses: pl.bosses, coins: pl.coins, t1: pl.t1, t10: pl.t10 };
  }
  function summary() {
    return { t: time, ki: pl.kills, bo: pl.bosses, co: pl.coins, lv: pl.level, t1: pl.t1, t10: pl.t10,
             team: G.Coop.isHost ? G.Coop.teamStats() : null };
  }
  let lastTeam = null;    // MVP del grupo para el resumen (lo calcula el anfitrión)

  /**
   * Resumen de grupo: derribos, daño y a cuántos ha levantado cada uno, y el MVP
   * (puntos = daño + 500 por cada compañero levantado).
   */
  function showTeam(team) {
    const box = document.getElementById('over-stats');
    if (!box || !team || team.length < 2) return;
    const score = r => r.dmg + r.revives * 500;
    const rows = team.slice().sort((a, b) => score(b) - score(a));
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    box.insertAdjacentHTML('beforeend', `<div style="grid-column:1/-1" class="panel">
      <span>${G.T('Equipo')}</span>
      <table style="width:100%;font-size:13px;margin-top:4px;border-collapse:collapse">
        <tr style="color:var(--muted)"><td></td><td>${G.T('Derribos')}</td><td>${G.T('Daño')}</td><td>${G.T('Levantados')}</td></tr>
        ${rows.map((r, i) => `<tr${i === 0 ? ' class="gold"' : ''}><td translate="no">${i === 0 ? '👑 MVP · ' : ''}${esc(r.name)}</td>
          <td>${r.kills}</td><td>${r.dmg.toLocaleString('es')}</td><td>${r.revives}</td></tr>`).join('')}
      </table></div>`);
  }

  /** Lo que el cooperativo necesita del juego. */
  /**
   * Los tickets recogidos se guardan en cuanto los coges (como los shinies):
   * antes sólo al acabar, y si la pestaña se cerraba de golpe se perdían.
   * `banked` = los de esta partida que ya están en la partida guardada.
   */
  let banked = { t1: 0, t10: 0 };
  function bankTickets(save_ = true) {
    const sv = G.DB.save;
    if (!sv || !pl) return;
    sv.tickets = sv.tickets || { t1: 0, t10: 0 };
    const d1 = Math.max(0, pl.t1 - banked.t1), d10 = Math.max(0, pl.t10 - banked.t10);
    if (!d1 && !d10) return;
    sv.tickets.t1 += d1; sv.tickets.t10 += d10;
    banked = { t1: pl.t1, t10: pl.t10 };
    if (save_) G.DB.commit();
  }

  const coopApi = {
    team: teamState,
    summary,
    // Invitado: el anfitrión manda el reloj y lo del equipo (el nivel no: cada uno el suyo).
    syncTeam(t) {
      if (Math.abs(t.time - time) > 0.4) time = t.time;
      pl.kills = t.kills; pl.bosses = t.bosses; pl.coins = t.coins;
      if (t.t1 > pl.t1 || t.t10 > pl.t10) G.Audio.sfx('shiny');
      pl.t1 = t.t1 || 0; pl.t10 = t.t10 || 0;
      bankTickets();
    },
    /** Invitado: experiencia recogida por el grupo (con TU bonus). */
    gainXp(v) { if (pl && state !== 'over') pendingLevels += pl.gainXp(v * G.Coop.xpFactor()); },
    levelStart(level) {
      // Las cartas se ponen en cola; mientras alguien elige, la partida se para para todos
      // (2026-10-14: antes seguía y te rodeaban mientras elegías).
      coopCards.push(level);
      if (!coopPause && !['scr-levelup', 'scr-bond', 'scr-item', 'scr-sbox', 'scr-relic', 'scr-boon', 'scr-fclear', 'scr-rest'].some(G.UI.isOpen)) nextCoopCard();
    },
    /** ¿Estás eligiendo algo? (lo manda coop.js en tu estado; si alguien elige, todo parado) */
    choosing() { return state === 'choice' || ['scr-levelup', 'scr-bond', 'scr-sbox', 'scr-relic', 'scr-boon', 'scr-fclear', 'scr-rest'].some(G.UI.isOpen) || coopCards.length > 0; },
    /** Invitado: has cogido un disco de movimientos / una poción (lo decide el anfitrión). */
    sbox() { if (pl) { pl.sboxes = (pl.sboxes || 0) + 1; offerBox(); } },
    fbox() { if (pl) offerBox(); },
    /** Hito de 10/20/30 min (lo decide el anfitrión; boons.js). */
    milestone(n) { G.Boons.milestone(n); },
    potion(id) { if (pl && !pl.dead) G.Loot.drink(pl, id); },
    /** ¿Has pausado tú? (en grupo, también para a todos) */
    paused() { return coopPause; },
    waiting(names) { G.RunUI.setWaiting(names); },
    resume() { G.RunUI.closeLevelUp(); if (state === 'levelup') state = 'playing'; },
    shiny(dex) { G.onShinyCaught({ dex, name: (G.DEX_BY[dex] || {}).name || '' }); },
    over(d) {
      if (d && 'pvpWin' in d) G.PvP.setWinner(d.pvpWin);
      if (d && d.stage) G.Stages.setResult(d.stage.win);
      if (d && d.team) lastTeam = d.team;
      if (d) Object.assign(pl, { kills: d.ki, bosses: d.bo, coins: d.co, t1: d.t1 || pl.t1, t10: d.t10 || pl.t10 });
      if (d && d.t) time = d.t;
      if (d && d.why === 'host') G.UI.toast('El anfitrión ha terminado la partida', 3200);
      if (d && d.clear) clearWin = true;                 // mazmorra superada: victoria para todos
      if (d && d.gw) G.Guard.setWave(d.gw);              // «Proteger a Dazhuang»: la oleada a la que se llegó
      // Sonido de derrota sólo si de verdad lo es (fase superada o PK ganado: no).
      endRun(!(d && d.why === 'host') && !(d && d.clear) && !(d && d.stage && d.stage.win) && !(d && 'pvpWin' in d && G.PvP.wonByMe()));
    },
    lost(msg) { G.UI.toast(msg, 3600); endRun(false); },
    item(id) { offerItem(id); },
    mateLeft() {},
    /** Grupo: quién está eligiendo fusión. Mientras haya alguien, todo parado. */
    hold(list) {
      // list = [[uid, nombre], ...] de quién está eligiendo; tú no cuentas (eso ya es 'choice').
      const me = pl && pl.uid;
      const others = (list || []).filter(x => (Array.isArray(x) ? x[0] : x) !== me);
      holdBy = others.map(x => (Array.isArray(x) ? x[1] : x));
      holdPaused = others.filter(x => Array.isArray(x) && x[2] === 2).map(x => x[1]);
      if (state === 'choice') return;                 // estás eligiendo: al terminar se mira (doneChoosing)
      if (coopPause) return;                          // estás en pausa: al seguir se mira (resumeCoop)
      if (holdBy.length) {
        if (state === 'playing') state = 'held';
        if (coopCards.length) nextCoopCard();          // tus cartas pendientes, a la vez que los demás
        else if (pl && pl.bonds > 0) offerBond(true);  // si tú también tienes vínculo, eliges a la vez
        if (state === 'held') holdText();
      } else {
        if (state === 'held' && !awayBy) state = 'playing';
        G.Spawner.say(awayBy ? awayText() : '', awayBy ? 999 : 0, true);
      }
    },
    /** Grupo (invitado): el anfitrión se ha ido de la pestaña o no responde: todo parado. */
    away(name) {
      awayBy = name || null;
      if (awayBy) {
        if (state === 'playing') state = 'held';
        G.Spawner.say(awayText(), 999, true);
      } else if (!holdBy.length && !coopPause) {
        if (state === 'held') state = 'playing';
        G.Spawner.say('', 0, true);
      }
    }
  };
  let awayBy = null;
  /** Aviso "Pausa: X está eligiendo…" (o que no hay nadie). */
  function holdText() {
    if (!holdBy.length) return;
    // Si sólo hay gente en pausa (nadie eligiendo), se dice quién la ha puesto.
    if (holdPaused.length === holdBy.length) G.Spawner.say(G.I18n.f('Pausa: {x} ha pausado la partida', holdBy.join('、')), 999, true);
    else G.Spawner.say(G.I18n.f(holdBy.length > 1 ? 'Pausa: {x} están eligiendo…' : 'Pausa: {x} está eligiendo…', holdBy.join('、')), 999, true);
  }
  /**
   * Grupo: has terminado una elección (carta, vínculo, objeto). Si te queda otra, la
   * siguiente; si no, a esperar a los demás o a jugar.
   */
  function doneChoosing() {
    if (!G.Coop.active) return;
    if (coopCards.length) { nextCoopCard(); return; }
    if (pl && pl.bonds > 0 && pl.bondOptions && pl.bondOptions()) { state = 'held'; offerBond(true); if (state === 'choice') return; }
    if (state === 'choice' || state === 'held') state = holdBy.length || awayBy || coopPause ? 'held' : 'playing';
    if (state === 'held') { if (awayBy) G.Spawner.say(awayText(), 999, true); else holdText(); }
    else G.Spawner.say('', 0, true);
    G.Coop.holdEnd();
  }
  let choiceT = 0;          // grupo: segundos que llevas eligiendo (a los 25, elige solo)
  let orphanT = 0;          // segundos eligiendo sin ninguna ventana de elección abierta (frame)
  const CHOICE_SCR = ['scr-levelup', 'scr-bond', 'scr-item', 'scr-sbox', 'scr-relic', 'scr-boon', 'scr-pkpick', 'scr-fclear', 'scr-rest'];
  /**
   * Elecciones en cola (2026-10-15): si ya hay una ventana de elección abierta, la nueva espera
   * a que se cierre (frame). Antes la segunda escondía la primera: en la casa de monstruos (mucha
   * XP + un objeto a la vez) se quedaba todo el grupo "eligiendo…" sin ninguna ventana.
   */
  const offerQ = [];
  const busyChoosing = () => CHOICE_SCR.some(G.UI.isOpen);
  const queued = fn => { if (!busyChoosing()) return false; if (offerQ.length < 20) offerQ.push(fn); return true; };
  const awayText = () => 'Pausa: esperando a ' + awayBy + ' (anfitrión)…';

  /** Has llevado a casa a un Pokémon perdido y se une a ti (events.js). */
  G.onRescue = (dex, name) => {
    if (!G.DB.save || !pl) return;
    const isNew = !G.DB.owns(dex);
    if (isNew) { G.DB.grant(dex, 'rescue'); G.DB.commit(); }
    else pl.coins += 150;
    G.Spawner.say(isNew ? '¡' + name + ' se une a tu equipo!' : '¡' + name + ' te da las gracias! (+150 monedas, ya lo tenías)', 4);
    G.Audio.sfx('shinyGet');
  };

  /** Un shiny salvaje cae: te lo quedas (y la versión normal si no la tenías). */
  G.onShinyCaught = e => {
    if (!G.DB.save || !pl) return;
    if (G.Coop.isHost) G.Coop.shinyCaught(e);
    const isNew = G.DB.grantShiny(e.dex, 'wild');
    G.DB.save.stats.shinies++;
    G.DB.commit();
    // Modo shiny: todos lo son; sólo se avisa (y se apunta) el primero de cada Pokémon, sin monedas por repetidos.
    if (!isNew && G.Modes.on('shiny')) return;
    caught.push({ dex: e.dex, isNew });
    G.Spawner.say(isNew ? '¡Has conseguido a ' + e.name + ' shiny!' : '¡Otro ' + e.name + ' shiny! (+300 monedas)', 4);
    if (!isNew) pl.coins += 300;
    G.Audio.sfx('shinyGet');
  };

  let clearWin = false;     // la run acaba como victoria (mazmorra superada, floors.js)
  function endRun(dead = true) {
    if (state === 'over' || !pl) return;
    if (G.Modes.run === 'training') { endTraining(); return; }
    const guardSm = G.Modes.run === 'guard' ? G.Guard.end() : null;      // «Proteger a Dazhuang»: hasta qué oleada
    const el = document.getElementById('scr-fclear');
    if (el) el.classList.add('hidden');
    const coop = !!pl.uid;                    // sólo las partidas en grupo le ponen uid
    const wasHost = !!pl.coopHost;
    const team = coop ? G.Coop.members.slice() : [];
    if (G.Coop.active) G.Coop.end();
    if (coop) G.Social.setPlaying(false);
    state = 'over';
    keepAwake(false);
    G.Chat.close();
    G.Tips.reset();
    // (2026-10-16: siempre; la pausa oculta la ventana de nivel pero su elección automática seguía en marcha)
    coopCards = []; G.RunUI.closeLevelUp();
    G.Audio.music(null);
    G.Audio.sfx(clearWin ? 'legend' : dead ? 'gameover' : 'back');
    const save = G.DB.save;
    const mul = pl.coinMul;
    const parts = {
      tiempo: Math.floor(time / 5),
      derrotados: Math.floor(pl.kills * 0.25),
      jefes: pl.bosses * 80,
      recogidas: pl.coins
    };
    // Regalo de Kecleon: alguna compra y ningún robo en toda la run (dungeon.js).
    if (G.Dungeon.honest) { parts.Kecleon = 40; pl.t1 = (pl.t1 || 0) + 1; }
    const coins = Math.round((parts.tiempo + parts.derrotados + parts.jefes + parts.recogidas + (parts.Kecleon || 0)) * mul);
    const record = time > save.stats.bestTime;

    save.coins += coins;
    bankTickets(false);
    save.stats.runs++;
    save.stats.totalKills += pl.kills;
    save.stats.bestTime = Math.max(save.stats.bestTime, Math.floor(time));
    if (coop) save.stats.bestGroupTime = Math.max(save.stats.bestGroupTime || 0, Math.floor(time));
    save.stats.bestLevel = Math.max(save.stats.bestLevel, pl.level);
    save.stats.coinsEarned += coins;
    // Estadísticas de los modos de esta versión (logros de "Modos y amigos").
    const xs = save.stats, add = (k, n = 1) => { xs[k] = (xs[k] || 0) + n; };
    if (G.Modes.run === 'daily') add('dailyRuns');
    if (G.Modes.run === 'legend') xs.bestRush = Math.max(xs.bestRush || 0, G.Rift.rushWins);
    // (Sólo los modos de "Reglas a medida": el reto semanal de jefes no cuenta aquí.)
    const custom = G.Modes.run === 'normal';
    if (custom && G.Modes.on('boss')) add('bossModeBosses', pl.bosses);
    if (custom && G.Modes.on('shiny')) add('shinyRuns');
    if (custom && G.Modes.on('extreme')) xs.bestExtremeTime = Math.max(xs.bestExtremeTime || 0, Math.floor(time));
    if (G.PvP.wonByMe()) add('pvpWins');
    save.scenes = save.scenes || {};
    if (G.Tiles.SCENES.includes(G.World.biome)) save.scenes[G.World.biome] = Date.now();
    // Lápida del menú (2026-10-16, menu.js): lo esencial de esta run, para verlo al volver.
    save.lastRun = { dex: pl.dex, shiny: !!pl.shiny, time: Math.floor(time), level: pl.level, kills: pl.kills, bosses: pl.bosses,
      floor: G.Floors.floor || 0, clear: !!clearWin, dead: !!dead && !clearWin, mode: G.Modes.run, group: coop, coins, at: Date.now(),
      moves: pl.moves.filter(m => !G.Moves.isPassive(m)).slice(0, 4).map(m => [m.name, m.lvl]) };
    G.Progress.event('runEnd', { time, level: pl.level, coins: pl.coins, types: pl.mon.types, group: coop });
    G.Progress.checkAch();
    G.DB.commit();
    if (G.Social.me) G.Social.publishProfile();

    // Ranking: en solitario cada uno lo suyo; en grupo lo sube el anfitrión.
    const mark = { t: Math.floor(time), lv: pl.level, kills: pl.kills };
    if (!coop) G.Ranking.submitSolo(Object.assign(mark, { dex: pl.dex, shiny: pl.shiny }));
    else if (wasHost) G.Ranking.submitGroup(Object.assign(mark, { members: team }));

    G.RunUI.showOver({
      dead: dead && !clearWin, clear: clearWin, clearTime: G.Floors.cleared ? G.Floors.clearTime : null, goals: G.RunGoals.summary(),
      time, level: pl.level, kills: pl.kills, bosses: pl.bosses, coins, record, t1: pl.t1, t10: pl.t10, floor: G.Floors.floor,
      moves: pl.moves, caught, guard: guardSm,
      breakdown: Object.entries(parts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') +
                 (mul > 1 ? ` · ×${mul.toFixed(2)} Fortuna` : '')
    }, () => { pl = null; G.Flow.afterRun(); });
    G.Stages.afterRun({ time, kills: pl.kills, pl });
    const rr = { time, level: pl.level, kills: pl.kills, dex: pl.dex, group: coop, host: wasHost, names: team.map(m => m.name) };
    G.Challenges.afterRun(rr);
    // En grupo los derribos son del equipo: a tu Pokémon le cuenta tu parte.
    const share = coop ? Math.max(1, team.length) : 1;
    // (El Pokémon del reto diario no es tuyo: no suma a sus retos del Pokédex.)
    if (!pl.dailyMon || G.DB.owns(pl.startDex)) G.DexQuests.afterRun(pl.startDex || pl.dex, { time, kills: Math.round(pl.kills / share), bosses: Math.floor(pl.bosses / share) });
    G.Modes.afterRun(rr);
    G.PvP.afterRun();
    if (lastTeam) { showTeam(lastTeam); lastTeam = null; }
  }

  /**
   * Sala de entrenamiento (training.js): al salir no se guarda nada (ni monedas, ni récords,
   * ni ranking, ni logros, ni misiones): se limpia y vuelves al menú.
   */
  function endTraining() {
    state = 'over';
    keepAwake(false);
    G.Tips.reset();
    coopCards = []; G.RunUI.closeLevelUp();
    G.Audio.music(null);
    G.Audio.sfx('back');
    G.Training.end();
    G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.Pickups.clear(); G.FX.clear();
    G.Modes.reset();
    pl = null;
    G.UI.hideAll();
    G.Flow.afterRun();
  }

  // ---------------- subida de nivel ----------------

  function maybeLevelUp() {
    if (pendingLevels <= 0 || state !== 'playing') return;
    if (G.Coop.active) {
      // En grupo cada uno sube con SU experiencia; mientras eliges, el grupo espera (coop.js).
      if (G.Coop.players().every(p => p.dead)) return;
      if (G.PvP.on && !G.PvP.teams && pl.dead) { pendingLevels = 0; return; }     // PK: caído ya no sube (no hay quien te levante)
      pendingLevels--;
      coopApi.levelStart(pl.level);
      return;
    }
    // Nunca abras cartas con el Pokémon caído (morir y recoger XP en el mismo frame).
    if (pl.dead) return;
    pendingLevels--;
    state = 'levelup';
    G.Audio.sfx('levelup');
    G.RunUI.showLevelUp(pl.level, G.LevelUp.offer(pl), card => {
      // (2026-10-16) Si la run ya ha acabado (la elección automática llegó tarde), no se vuelve a «playing»:
      // con el modo ya reiniciado a «normal», salía la bendición inicial encima del resumen y del menú.
      if (state !== 'levelup' || !pl) return;
      G.Audio.sfx('confirm');
      card.apply(pl);
      state = 'playing';
    });
  }

  // ---------------- vínculos ----------------

  /**
   * Vínculo de un legendario: eliges qué movimientos se fusionan.
   * Si ahora no se puede (no hay dos sueltos), se guarda hasta que aprendas
   * otro movimiento. Se mira en cada fotograma: si otra pantalla la tapa (cartas
   * de nivel en grupo, pausa), vuelve a salir al cerrarla.
   * @param quiet  no avisar si todavía no se puede
   */
  function offerBond(quiet = false) {
    if (!pl || pl.bonds <= 0 || pl.dead || (state !== 'playing' && state !== 'held') || G.Rift.inArena) return;
    if (['scr-bond', 'scr-pause', 'scr-item', 'scr-levelup', 'scr-sbox', 'scr-relic'].some(G.UI.isOpen)) return;
    const opt = pl.bondOptions();
    if (!opt) {
      if (!quiet) G.Spawner.say('Guardas el vínculo: aprende otro movimiento para usarlo', 3, true);
      return;
    }
    // Se para el juego; en grupo, para todos hasta que cada uno elige (G.Coop.holdStart).
    state = 'choice';
    if (G.Coop.active) G.Coop.holdStart();
    G.Audio.sfx('levelup');
    G.RunUI.showBond(opt, picked => {
      const group = pl.fuse(picked, opt.group);
      G.Audio.sfx('legend');
      G.FX.ring(pl.x, pl.y, 8, 130, '#ff8ad8', 0.8, 6);
      G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffb3e6', 40, 240);
      G.Spawner.say('¡Vínculo! ' + group.length + ' movimientos a la vez', 2.6, true);
      if (G.Coop.active) doneChoosing();
      else if (state === 'choice') state = 'playing';
    });
  }

  // ---------------- recogida ----------------

  const PICK_SFX = { xp: 'xp', xpBig: 'xp', coin: 'coin', heal: 'heal', bomb: 'break', magnet: 'confirm', ticket: 'shiny', ticket10: 'legend', item: 'legend', token: 'shiny',
                     sbox: 'legend', potion: 'confirm', egg: 'shiny' };

  /**
   * Una elección que para la partida (en grupo, para todos hasta que eligen): reliquias de
   * la torre (relics.js). show(done) abre la ventana y llama a done() al elegir.
   */
  function openChoice(show) {
    if (!pl || pl.dead) return;
    if (queued(() => openChoice(show))) return;
    let mine = false;
    if (state === 'playing' || state === 'held') {
      mine = true;
      state = 'choice';
      if (G.Coop.active) G.Coop.holdStart();
    }
    show(() => {
      if (!mine) return;
      if (G.Coop.active) doneChoosing();
      else if (state === 'choice') state = 'playing';
    });
  }

  /** Bendición inicial del modo normal (boons.js): se para el juego mientras eliges. */
  function offerBoon() {
    if (!pl || pl.dead) return;
    if (queued(offerBoon)) return;
    let mine = false;
    if (state === 'playing' || state === 'held') {
      mine = true;
      state = 'choice';
      if (G.Coop.active) G.Coop.holdStart();
    }
    G.Boons.show(pl, () => {
      if (!mine) return;
      if (G.Coop.active) doneChoosing();
      else if (state === 'choice') state = 'playing';
    });
  }

  /** Disco de movimientos (loot.js): 1-4 mejoras al azar; se para el juego mientras lo miras. */
  function offerBox() {
    if (!pl || pl.dead) return;
    if (queued(offerBox)) return;
    let mine = false;
    if (state === 'playing' || state === 'held') {
      mine = true;
      state = 'choice';
      if (G.Coop.active) G.Coop.holdStart();
    }
    G.Loot.showBox(pl, () => {
      if (!mine) return;
      if (G.Coop.active) doneChoosing();
      else if (state === 'choice') state = 'playing';
    });
  }

  /**
   * Has cogido un objeto: se pueden llevar 2 (2026-10-15). Con hueco, te lo pones; con los
   * dos ocupados, eliges cuál cambias (o te quedas como estás) entre los de su rango o peor.
   */
  /** Se vende `id` por monedas de la run, con aviso (`msg`: '{x}' nombre y '{x}' monedas). */
  function sellItem(id, msg) {
    const v = G.Items.sellValue(id);
    // (en grupo, las monedas de la run las lleva el anfitrión: el invitado se las pide, como al fusionar)
    if (G.Coop.active && !G.Coop.isHost) G.Coop.request(['dg', 'sell', v]); else pl.coins = (pl.coins || 0) + v;
    G.Spawner.say(G.I18n.f(msg, G.T(G.Items.BY[id].name), v), 2.6, true);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, '+' + v, '#ffd23f');
  }

  // ---------------- objetos pendientes (icono flotante) ----------------
  const PENDING_MAX = 3;
  let pendingItems = [];
  function stashItem(id) {
    if (pendingItems.includes(id)) { G.Spawner.say(G.I18n.f('Ya tienes {x} esperando', G.T(G.Items.BY[id].name)), 2, true); return; }
    pendingItems.push(id);
    // Más de 3: se vende el de menos rango (nunca un artefacto si hay otro que vender).
    if (pendingItems.length > PENDING_MAX) {
      const worst = pendingItems.slice().sort((a, b) => (G.Items.isArt(a) - G.Items.isArt(b)) || G.Items.tier(a) - G.Items.tier(b))[0];
      pendingItems = pendingItems.filter(x => x !== worst);
      sellItem(worst, 'Demasiados objetos esperando: {x} se vende por {x} monedas');
    }
    G.Audio.sfx('select');
    // (Móvil: sin teclado no tiene sentido «o pulsa I».)
    G.Spawner.say(G.I18n.f(G.Touch.active ? '{x}: toca el icono que brilla para cambiarlo' : '{x}: toca el icono (o pulsa I) para cambiarlo', G.T(G.Items.BY[id].name)), 2.8, true);
    pendingUI(true);
  }
  /** Abre la elección del primer objeto pendiente (si ahora se puede). */
  function openPending() {
    if (!pl || pl.dead || !pendingItems.length || busyChoosing() || (state !== 'playing' && state !== 'held')) return;
    offerItem(pendingItems.shift(), true);
    pendingUI(true);
  }
  let pendingKey = '';
  /** El icono: sobre la barra de movimientos, sólo jugando y con algo pendiente. */
  function pendingUI(force) {
    let el = document.getElementById('item-pending');
    const show = pl && !pl.dead && pendingItems.length && (state === 'playing' || state === 'held' || state === 'choice');
    const key = show ? pendingItems.join(',') : '';
    if (!force && key === pendingKey) return;
    pendingKey = key;
    if (!show) { if (el) el.classList.add('hidden'); return; }
    if (!el) {
      el = document.createElement('button');
      el.id = 'item-pending'; el.type = 'button'; el.dataset.sfx = 'click';
      el.onclick = openPending;
      document.body.appendChild(el);
    }
    const id = pendingItems[0], it = G.Items.BY[id];
    el.className = G.Items.isArt(id) ? 'art' : '';
    el.innerHTML = `${G.Icons.html(id, 28)}<span class="nm">${G.Items.tierChip ? G.Items.tierChip(id) : ''}${G.T(it.name)}</span>` +
      (pendingItems.length > 1 ? `<span class="n">+${pendingItems.length - 1}</span>` : '') + `<kbd>I</kbd>`;
  }

  function offerItem(id, now = false) {
    if (!pl || !G.Items.BY[id]) return;
    let mine = false;            // esta elección es la que ha parado el juego
    const take = replace => {    // replace: el que se quita (undefined = hay hueco, null = no lo coges)
      if (replace !== null) {
        // (un artefacto sólo lo quita otro artefacto: la ventana ya no deja elegirlo, pero por si acaso)
        if (replace && G.Items.isArt(replace) && !G.Items.isArt(id)) replace = null;
        else {
          pl.equip(id, replace);
          G.Spawner.say(G.I18n.f(G.Items.isArt(id) ? '¡Artefacto: {x}!' : '¡Llevas {x}!', G.T(G.Items.BY[id].name)), 2.6, true);
          if (G.Items.isArt(id)) { G.Audio.sfx('legend'); G.FX.ring(pl.x, pl.y, 8, 120, '#ffd23f', 0.7, 5); G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ff8ad8', 24, 200); }
          G.Progress.event('item', { id });
        }
      }
      if (!mine) return;
      if (G.Coop.active) doneChoosing();
      else if (state === 'choice') state = 'playing';
    };
    if (pl.hasItem(id)) { G.Spawner.say('Ya llevas ' + G.Items.BY[id].name, 2, true); return; }
    if (pl.items.length < G.Player.MAX_ITEMS) { take(undefined); return; }
    // Rangos (2026-10-16): si todo lo que llevas es de más rango (o un artefacto que éste no
    // puede quitar), ni se pregunta: se vende solo y te quedas como estás.
    const T = G.Items.tier(id);
    if (!pl.items.some(o => G.Items.tier(o) <= T && (!G.Items.isArt(o) || G.Items.isArt(id)))) {
      sellItem(id, 'Lo que llevas es mejor: {x} se vende por {x} monedas');
      return;
    }
    // Sin ventana (2026-10-16, feedback): se guarda y sale un icono flotante sobre los
    // movimientos; lo abres cuando quieras (clic o tecla I). El juego no se para.
    if (!now) { stashItem(id); return; }
    if (queued(() => offerItem(id, true))) return;
    // Se para el juego mientras eliges; en grupo, para todos (como con las
    // fusiones). Antes en grupo seguía y te pegaban mientras elegías.
    if (state === 'playing' || state === 'held') {
      mine = true;
      state = 'choice';
      if (G.Coop.active) G.Coop.holdStart();
    }
    G.RunUI.showItemChoice(pl.items.slice(), id, take);
  }

  /** @param who  quien lo ha cogido (en cooperativo puede ser un compañero) */
  function onCollect(p, who = pl) {
    if (G.Modes.run === 'training') return;             // sala de entrenamiento: nada se recoge
    const mine = who === pl;
    if (G.Coop.active && !G.Coop.isHost) {
      // Copia de un objeto del anfitrión: el efecto lo decide él.
      if (mine) G.Audio.sfx(PICK_SFX[p.kind]);
      return;
    }
    if (p.kind === 'sbox') who.sboxes = (who.sboxes || 0) + 1;
    if (p.kind === 'fbox') { if (G.Coop.active) G.Coop.collected(p, who); if (mine) { G.Audio.sfx('legend'); offerBox(); } return; }
    if (p.kind === 'potion') p.eff = G.Loot.rollPotion();
    if (G.Coop.active) G.Coop.collected(p, who);
    if (mine || p.kind === 'bomb') G.Audio.sfx(PICK_SFX[p.kind]);
    if (p.kind === 'sbox') { if (mine) offerBox(); return; }
    if (p.kind === 'egg') { if (mine) G.Companion.gotEgg(pl); else who.eggTaken = true; return; }
    if (p.kind === 'potion') {
      if (p.eff === 'magnet') G.Pickups.pullAll();
      if (mine) G.Loot.drink(pl, p.eff);
      else G.FX.ring(who.x, who.y, 6, 70, G.Loot.POTIONS[p.eff].color, 0.5, 3);
      return;
    }
    if (p.kind === 'xp' || p.kind === 'xpBig') {
      // Quedarse en un piso ya superado (floors.js): menos experiencia.
      const v = p.value * G.Floors.farmMul;
      if (G.Coop.active) G.Coop.xpShare(v);             // a cada uno, con su bonus
      pendingLevels += pl.gainXp(v * (G.Coop.active ? G.Coop.xpFactor() : 1));
      return;
    }
    if (p.kind === 'coin') {
      pl.coins += Math.round(p.value * G.Dungeon.mod('coins') * G.Floors.coinMul);      // avaricia ×2, más por cada piso y su tema (floors.js)
      G.FX.dmgText(who.x, who.y - who.bodyH - 6, '+' + p.value, '#ffd23f');
      return;
    }
    if (p.kind === 'item') {
      if (mine) offerItem(p.value);
      return;
    }
    if (p.kind === 'token') { G.Stages.token(who); return; }
    if (p.kind === 'ticket' || p.kind === 'ticket10') {
      if (p.kind === 'ticket') pl.t1++; else pl.t10++;
      bankTickets();
      G.FX.dmgText(who.x, who.y - who.bodyH - 8, p.kind === 'ticket' ? '+1 ticket' : '¡Ticket ×10!', p.kind === 'ticket' ? '#ffd23f' : '#d9a6ff', true);
      G.FX.ring(who.x, who.y, 6, 50, p.kind === 'ticket' ? '#ffd23f' : '#c47bff', 0.4, 3);
      return;
    }
    if (p.kind === 'heal') {
      if (mine) pl.heal(pl.maxHp * 0.3);
      G.FX.ring(who.x, who.y, 6, 60, '#5fe08a', 0.4, 3);
      return;
    }
    if (p.kind === 'magnet') {
      G.Pickups.pullAll();
      G.FX.ring(who.x, who.y, 10, 420, '#ff9ed8', 0.6, 4);
      return;
    }
    if (p.kind === 'bomb') {
      if (G.U.dist2(who.x, who.y, pl.x, pl.y) < 500 * 500) G.Camera.kick(0.8);
      const R = G.Camera.outerRadius();
      G.FX.ring(who.x, who.y, 20, R, '#ff7b3d', 0.5, 6);
      for (const e of G.EnemyMgr.all()) {
        if (mine ? !G.Camera.sees(e.x, e.y, 0) : G.U.dist2(e.x, e.y, who.x, who.y) > R * R) continue;
        e.hurt(60 + pl.level * 14, '#ff7b3d', e.x - who.x, e.y - who.y, 160);
      }
    }
  }

  // ---------------- teclado ----------------

  function handleKeys() {
    if (G.SettingsUI.isOpen) { if (G.Input.tap('escape')) G.SettingsUI.close(); return; }
    if (G.UI.isOpen('scr-pkpick')) {
      for (let i = 0; i < 5; i++) if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.PvP.pickKey(i + 1);
      if (G.Input.tap('enter')) document.getElementById('pk-ok').click();
      if (G.Input.tap('keyr')) document.getElementById('pk-reroll').click();
      return;
    }
    if (state === 'levelup' || (G.Coop.active && G.UI.isOpen('scr-levelup'))) {
      for (let i = 0; i < 3; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.RunUI.pick(i);
      }
      if (G.Input.tap('keyr')) G.RunUI.reroll();
      return;
    }
    if (G.UI.isOpen('scr-relic')) {
      for (let i = 0; i < 3; i++) if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.Relics.pick(i);
      return;
    }
    if (G.UI.isOpen('scr-boon')) {
      for (let i = 0; i < 3; i++) if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.Boons.pick(i);
      return;
    }
    if (G.UI.isOpen('scr-fclear')) {
      for (let i = 0; i < 2; i++) if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.Floors.pickClear(i);
      return;
    }
    if (G.UI.isOpen('scr-rest')) {
      for (let i = 0; i < 3; i++) if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.Rest.pick(i);
      return;
    }
    if (G.UI.isOpen('scr-sbox')) {
      if (G.Input.tap('keyr')) document.getElementById('sbox-reroll').click();
      else if (G.Input.tap('enter') || G.Input.tap('space') || G.Input.tap('digit1')) document.getElementById('sbox-ok').click();
      return;
    }
    if (G.UI.isOpen('scr-bond')) {
      for (let i = 0; i < 4; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.RunUI.pickBond(i);
      }
      return;
    }
    if (G.UI.isOpen('scr-item')) {
      for (let i = 0; i < 3; i++) {
        const c = document.querySelectorAll('#item-cards .card:not(.locked)')[i];
        if (c && (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1)))) c.click();
      }
      return;
    }
    if (state === 'ui') {
      // Esc en una subpantalla del menú vuelve al menú.
      if (G.Input.tap('escape') && !G.UI.isOpen('scr-profile') && ['scr-dex', 'scr-upgrades', 'scr-gacha', 'scr-friends', 'scr-rank', 'scr-goals'].some(G.UI.isOpen)
          && document.getElementById('pull-fx').classList.contains('hidden')) G.MenuUI.open();
      return;
    }
    // Mensajes rápidos (en grupo): T abre/cierra; con el menú abierto, 1-6 eligen.
    if (G.Coop.active && G.Chat.isOpen()) {
      for (let i = 0; i < 6; i++) if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) { G.Chat.send(i); return; }
      if (G.Input.tap('keyt') || G.Input.tap('escape')) G.Chat.close();
      return;
    }
    if (G.Coop.active && G.Input.tap('keyt')) { G.Chat.open(); return; }
    // Sala de entrenamiento: con el panel de movimientos abierto, Esc lo cierra (y las teclas no mueven nada).
    if (G.Training.isOpen()) { if (G.Input.tap('escape')) G.Training.closePanel(); return; }
    if (G.Input.tap('escape') || G.Input.tap('keyp')) { togglePause(); return; }
    if (state !== 'playing' || !pl) return;
    if (spectating() && (G.Input.tap('tab') || G.Input.tap('space'))) { nextSpec(); return; }
    for (let i = 0; i < 5; i++) {
      if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) pl.setActive(i);
    }
    if (G.Input.tap('keyi')) openPending();
    if (G.Input.tap('keyq')) pl.cycle(-1);
    if (G.Input.tap('keye') || G.Input.tap('tab')) pl.cycle(1);
  }

  // ---------------- bucle ----------------

  let deathT = 0;

  let frameDt = 0, speedK = 1;
  let fpsShown = 60, fpsAcc = 0, fpsN = 0;
  // El siguiente fotograma se pide ANTES de nada: si algo falla a mitad, el
  // juego sigue (antes se quedaba congelado para siempre y había que recargar;
  // así se perdió una partida enorme al abrirse una grieta).
  // Si falla fotograma tras fotograma (el juego ya no avanza ni se ve), la
  // partida se da por terminada a los ~3 s y se guarda: tiempo, derrotados,
  // récords y ranking. Mejor eso que una pantalla negra y perderlo todo.
  let loopErrs = 0, errRun = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    try { frame(ts); errRun = 0; }
    catch (e) {
      if (loopErrs++ < 5) console.error('[Game] fallo en un fotograma:', e);
      G.Input.endFrame();
      if (++errRun === 180 && pl && state !== 'ui' && state !== 'over') {
        try {
          G.UI.hideAll();
          quitRun();
          G.UI.toast('El juego ha fallado: tu partida se ha guardado hasta aquí', 5000);
        } catch (e2) { console.error('[Game] no se pudo cerrar la partida:', e2); }
      }
    }
  }

  function frame(ts) {
    // Por si acaso: si el lienzo ya no mide lo que creemos, se rehace (lectura barata, sin cambios de diseño).
    if (cv.clientWidth !== w || cv.clientHeight !== h) resize();
    const real = (ts - last) / 1000 || 0;
    const dt = Math.min(1 / 30, real) * speedK * (state === 'playing' ? G.PvP.timeScale(real) : 1);   // PK: parón al golpear
    last = ts;
    if (state === 'playing') G.Settings.sample(real);
    if (cv && (wantDpr() !== dpr || wantHudDpr() !== hdpr)) resize();          // (la calidad automática ha bajado a "baja" en el móvil)
    fpsAcc += real; fpsN++;
    if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    frameDt = state === 'playing' ? dt : 0;

    handleKeys();

    // Grupo (2026-10-15): eligiendo cartas la partida sigue para todos (no se espera a nadie);
    // tu Pokémon se queda quieto, no recibe daño y aparta a los enemigos (ver update).
    if (state === 'playing' || (state === 'choice' && G.Coop.active && !coopPause)) update(dt);
    else if (pl && state !== 'ui') { G.FX.update(dt * 0.25); pl.anim.update(dt * 0.25); }
    if (state !== 'playing') G.Tips.tick(0);      // (esconde el consejo encima de cartas, pausa...)
    // Red de seguridad (2026-10-15): eligiendo pero sin ninguna ventana de elección a la vista
    // (otra ventana la cerró y su aviso de "elegido" ya no llegará): la partida sigue sola
    // en vez de quedarse parada para siempre (no se movía nada ni respondía Esc).
    if (pl && (state === 'choice' || state === 'levelup') && !CHOICE_SCR.some(G.UI.isOpen)) {
      orphanT += real;
      if (orphanT > 0.5) {
        orphanT = 0;
        console.warn('[Game] elección sin ventana: se sigue jugando');
        if (G.Coop.active) { coopCards = []; doneChoosing(); } else state = 'playing';
      }
    } else orphanT = 0;
    pendingUI(false);
    // Lo que esperaba en cola (o cartas de nivel del grupo que se quedaron sin abrir), cuando no hay nada abierto.
    if (pl && !pl.dead && (state === 'playing' || state === 'held') && !busyChoosing()) {
      if (offerQ.length) offerQ.shift()();
      else if (G.Coop.active && coopCards.length && !coopPause) nextCoopCard();
    }
    // Grupo: nadie puede dejar a los demás esperando para siempre: a los 25 s se elige solo.
    if (G.Coop.active && state === 'choice') {
      choiceT += real;
      const left = Math.ceil(25 - choiceT);
      if (G.UI.isOpen('scr-levelup')) { const el = document.getElementById('lvl-wait'); if (el) { el.classList.remove('hidden'); el.textContent = G.I18n.f('Se elige solo en {x} s', Math.max(0, left)); } }
      if (choiceT > 25) {
        choiceT = 20;
        if (G.UI.isOpen('scr-levelup')) G.RunUI.pick(0);
        else if (G.UI.isOpen('scr-bond')) G.RunUI.pickBond(0);
        else if (G.UI.isOpen('scr-item')) { const c = document.querySelector('#item-cards .card:not(.locked)'); if (c) c.click(); }
        else if (G.UI.isOpen('scr-sbox')) document.getElementById('sbox-ok').click();
        else if (G.UI.isOpen('scr-relic')) G.Relics.pick(0);
        else if (G.UI.isOpen('scr-boon')) G.Boons.pick(0);
        else if (G.UI.isOpen('scr-fclear')) G.Floors.pickClear(1);     // mazmorra superada: seguir (no acabar la run de todos)
        else if (G.UI.isOpen('scr-rest')) G.Rest.pick(0);              // descanso: la hoguera
        else if (G.UI.isOpen('scr-roul')) G.Roulette.forceClose();
      }
    } else choiceT = 0;
    // La red se atiende siempre (también con las cartas de nivel abiertas).
    if (G.Coop.active && pl && state !== 'ui' && state !== 'over') G.Coop.tick(dt);

    if (pl && state !== 'ui') render(); else Backdrop.render(ctx, w, h, dpr, dt);
    G.UI.tick(dt);

    G.Input.endFrame();
  }

  function update(dt) {
    const coop = G.Coop.active;
    if (flashT > 0) flashT -= dt;
    // Tras caer, deja que se vea la animación de Faint antes del resumen.
    // (En la arena de la grieta no: allí caer sólo te echa de vuelta.)
    if (pl.dead && !coop && !G.Rift.inArena) {
      deathT += dt;
      pl.update(dt);
      G.EnemyMgr.update(dt * 0.3, pl);
      G.FX.update(dt);
      G.Camera.follow(pl.x, pl.y, dt);
      if (deathT > 1.3) { deathT = 0; endRun(true); }
      return;
    }
    time += dt;
    if (G.Modes.run === 'training') { trainingUpdate(dt); return; }

    const b = G.Floors.biomeAt(Math.floor(time / 240) + G.Floors.floor);      // cada piso, el bioma siguiente (floors.js; «en llamas»: el volcán)
    if (b !== biome && !G.Rift.inArena && !(G.Dungeon && G.Dungeon.inRoom) && fixedScene == null) {
      biome = b;
      G.World.setBiome(b);
      G.Audio.sfx('biome');
      G.Spawner.say('— ' + G.World.biomeName() + ' —', 3);
      G.FX.ring(pl.x, pl.y, 10, G.Camera.outerRadius(), '#ffffff', 0.7, 6);
    }

    const picking = coop && (state === 'choice' || ['scr-levelup', 'scr-bond', 'scr-item', 'scr-sbox', 'scr-relic', 'scr-boon', 'scr-fclear', 'scr-rest'].some(G.UI.isOpen));
    pl.frozen = coop && (G.UI.isOpen('scr-pause') || G.UI.isOpen('scr-item') || picking);
    pl.picking = picking;   // eligiendo cartas: nada te hace daño (Player.hurt)
    pl.update(dt);
    if (coop) {
      for (const p of G.Coop.puppets()) {
        p.netUpdate(dt); G.Combat.ghostOrbit(p, dt, time);
        // Grupo (no PK, o PK por equipos si es de tu equipo): aviso cuando cae un compañero.
        if (p.dead && !p.downTold && (!G.PvP.on || (G.PvP.teams && p.team === pl.team))) {
          p.downTold = true;
          G.Spawner.say(G.I18n.f('¡{x} ha caído! Ve a levantarle', p.tag), 3.2, true);
          G.Audio.sfx('error');
        } else if (!p.dead) p.downTold = false;
      }
      if (pl.dead) reviveTick(dt);
      // PK: al caer se cierran las cartas que tuvieras (2026-10-15: seguían saliendo estando fuera).
      if (pl.dead && G.PvP.on && !G.PvP.teams && (coopCards.length || G.UI.isOpen('scr-levelup'))) {
        coopCards = []; pendingLevels = 0;
        G.RunUI.closeLevelUp();
        if (state === 'choice') state = 'playing';
        G.Coop.localPicked();
      }
    }
    const cam = spectating() || pl;               // PK: caído, miras a quien siga en pie
    G.Camera.follow(cam.x, cam.y, dt);
    G.World.update(dt, G.Camera);

    const all = everyone();
    // «Proteger a Dazhuang» (guard.js): las oleadas las pone él (nada del goteo normal, jefes por tiempo ni mareas).
    const guard = G.Modes.run === 'guard';
    if (!coop || G.Coop.isHost) {
      G.Path.update(dt, all);
      if (guard) { G.Spawner.tickBanner(dt); G.Guard.tick(dt, all); }
      else G.Spawner.update(dt, all, time + G.Stages.tOffset());
    }
    else G.Spawner.tickBanner(dt);
    G.EnemyMgr.update(dt, all);
    if (coop && G.Coop.isHost) shieldPickers(all);               // los que eligen cartas apartan a los enemigos
    if (coop && G.Coop.isHost) fieldPush(all);                   // y el campo de Shaq de los invitados
    G.EnemyMgr.rebuildGrid();
    G.Combat.tick(dt, pl, time);
    G.Projectiles.update(dt, pl, G.EnemyMgr.all());
    G.Combat.resolve(dt, pl, time);
    G.Arts.update(dt, pl);                                       // artefactos: huellas de Pies de Mercurio
    G.Combat.updateFields(dt);
    G.Pickups.update(dt, all, onCollect);
    if (!coop || G.Coop.isHost) G.Loot.tick(dt, time, all);      // discos de movimientos y pociones
    if ((!coop || G.Coop.isHost) && !guard) G.Dungeon.tick(dt, all);          // casa de monstruos, tienda de Kecleon, estatua
    G.Dungeon.update(dt, pl);
    G.Relics.tick(dt, pl);                                       // reliquias de la torre
    G.Floors.update(dt, all);                                    // escaleras y ataque combinado
    G.PvP.arenaTick(dt, pl); G.PvP.pickTick(dt);                 // arena de PK: zona, bayas, elección
    G.PvPX.update(dt, pl);                                       // extras del PK: rondas, tesoro, trampas, fantasmas (pvp-extra.js)
    G.Boons.update(dt, pl);                                      // bendición inicial (modo normal)
    if (!coop || G.Coop.isHost) G.Boons.tick(time, all);         // hitos de 10/20/30 min
    if ((!coop || G.Coop.isHost) && !guard) G.Companion.tick(dt, time, all); // huevo Pokémon (en guard, se compra)
    G.Companion.update(dt, pl);
    G.Hazards.update(dt);
    G.Interact.update(dt, pl);
    if (!guard) G.Rift.update(dt, pl, time);
    G.Guard.update(dt, pl);                                      // Dazhuang, puestos y su panel (guard.js)
    G.Challenges.update(dt, time, pl);
    G.RunGoals.update(dt, time, pl);                             // retos de la run (modo normal)
    if (coop && !guard) G.Raid.update(dt, time);
    G.Evo.check(pl);
    G.Tips.tick(dt);
    G.Stages.update(dt, time, pl);
    if (!guard) G.Events.update(dt, all, time);
    G.Weather.update(dt, time, pl);
    G.FX.update(dt);

    G.Audio.music(G.Rift.inArena ? 'rift' : G.EnemyMgr.bossAlive() ? 'boss' : G.BIOME_MUSIC[biome % G.BIOME_MUSIC.length]);
    maybeLevelUp();
    if (pl.bonds > 0) offerBond(true);
    if (G.Coop.isHost) checkAllDown(dt);
    G.PvP.tick();
  }

  /**
   * Sala de entrenamiento (training.js): sólo tú, los muñecos y tus ataques. Sin aparecer
   * enemigos ni jefes, sin eventos, grietas, tienda, escaleras, clima, huevo ni bendiciones,
   * sin experiencia ni cartas de nivel.
   */
  function trainingUpdate(dt) {
    pl.frozen = G.Training.isOpen();
    pl.picking = false;
    pl.update(dt);
    G.Camera.follow(pl.x, pl.y, dt);
    G.World.update(dt, G.Camera);
    G.EnemyMgr.update(dt, [pl]);
    G.EnemyMgr.rebuildGrid();
    G.Combat.tick(dt, pl, time);
    G.Projectiles.update(dt, pl, G.EnemyMgr.all());
    G.Combat.resolve(dt, pl, time);
    G.Arts.update(dt, pl);
    G.Combat.updateFields(dt);
    G.Pickups.update(dt, [pl], onCollect);
    G.Hazards.update(dt);
    G.Training.update(dt, pl);
    G.FX.update(dt);
    G.Audio.music(G.BIOME_MUSIC[0]);
  }

  /** Caído en grupo: un compañero a tu lado te va levantando. */
  function reviveTick(dt) {
    if (G.PvP.on && !G.PvP.teams) return;         // en PK no se revive (por equipos, sí: tus compañeros)
    const helper = G.Coop.puppets().some(p => !p.dead && (!G.PvP.teams || p.team === pl.team) && G.U.dist2(p.x, p.y, pl.x, pl.y) < G.Player.REVIVE_R * G.Player.REVIVE_R);
    // Si el compañero se aparta un momento, lo avanzado se pierde despacio.
    pl.reviveT = helper ? (pl.reviveT || 0) + dt : Math.max(0, (pl.reviveT || 0) - dt * 0.25);
    if (pl.reviveT >= G.Player.REVIVE_TIME) {
      pl.revive(0.5);
      // MVP: quién te ha levantado (el compañero más cercano).
      const near = G.Coop.puppets().filter(p => !p.dead).sort((a, b) => G.U.dist2(a.x, a.y, pl.x, pl.y) - G.U.dist2(b.x, b.y, pl.x, pl.y))[0];
      if (near) G.Coop.creditRevive(near.uid);
    }
  }

  let pvpLast = null;
  // PK: cuando caes, la cámara sigue a quien siga en pie (Tab / espacio / botón para cambiar).
  let specI = 0;
  function spectating() {
    if (!pl || !pl.dead || !G.PvP.on || !G.Coop.active || state !== 'playing') return null;
    if (G.PvPX.isGhost(pl)) return null;          // fantasma (pvp-extra.js): la cámara te sigue a ti
    const alive = G.Coop.puppets().filter(p => !p.dead);
    return alive.length ? alive[specI % alive.length] : null;
  }
  function nextSpec() { specI++; G.Audio.sfx('confirm'); }
  let coopCards = [];      // grupo: subidas de nivel pendientes de elegir (en cola)

  /** Grupo: abre las cartas de la siguiente subida de nivel de la cola. */
  function nextCoopCard() {
    if (pl && pl.dead && G.PvP.on && !G.PvP.teams) { coopCards = []; return; }
    const level = coopCards.shift();
    if (level == null || !pl || state === 'over' || state === 'ui') return;
    // Eliges sin parar a nadie: la partida sigue (frame) y tu Pokémon queda quieto y protegido.
    if (state === 'playing' || state === 'held') state = 'choice';
    choiceT = 0;
    G.Audio.sfx('levelup');
    G.RunUI.showLevelUp(level, G.LevelUp.offer(pl), card => {
      G.Audio.sfx('confirm');
      card.apply(pl);
      G.Coop.localPicked();
      choiceT = 0;
      doneChoosing();
    });
    G.Coop.holdStart();
  }
  let fixedScene = null;   // índice de bioma si se eligió escenario (no se va turnando)   // PK: quién seguía en pie cuando quedó uno

  /** Anfitrión (grupo): alrededor de quien está eligiendo cartas no puede quedarse ningún enemigo. */
  const PICK_R = 110;
  function shieldPickers(all) {
    for (const p of all) {
      if (p.dead || !(p === pl ? pl.picking : p.net && p.net.ch === 1)) continue;
      for (const e of G.EnemyMgr.queryCircle(p.x, p.y, PICK_R)) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        e.x = p.x + dx / d * PICK_R; e.y = p.y + dy / d * PICK_R;
      }
    }
  }

  /**
   * Anfitrión (grupo): el campo de Shaq de los invitados (el tuyo ya lo hace combat.js).
   * Sin esto, en su pantalla los enemigos se le quedaban encima: sus copias no se pueden mover.
   */
  function fieldPush(all) {
    for (const p of all) {
      if (p === pl || p.dead || !p.bulkField) continue;
      for (const e of G.EnemyMgr.queryCircle(p.x, p.y, p.r + 40)) {
        if (e.dead || e.boss) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.max(1, Math.hypot(dx, dy)), min = p.r + 28 + e.r;   // 28 = combat.js FIELD_R
        if (d >= min) continue;
        const x = p.x + dx / d * min, y = p.y + dy / d * min;
        if (!G.World.isWall(x, y)) { e.x = x; e.y = y; }
        e.kx += dx / d * 120; e.ky += dy / d * 120;
      }
    }
  }

  /** Anfitrión: si caéis todos, se acaba (tras ver caer al último). */
  function checkAllDown(dt) {
    if (G.PvP.on) {
      // Entre rondas (al mejor de 3, pvp-extra.js) no se mira nada.
      if (G.PvPX.inBreak) { deathT = 0; pvpLast = null; return; }
      // PK: se acaba cuando queda uno en pie (o ninguno).
      const ps = G.Coop.players(), alive = ps.filter(p => !p.dead);
      if (G.PvP.teams) {
        // Por equipos: se acaba cuando sólo queda gente de un equipo (o nadie).
        const tw = G.PvP.teamWinner(alive);
        if (tw === undefined) { deathT = 0; return; }
        deathT += dt;
        if (deathT > 1.6) {
          deathT = 0;
          if (G.PvPX.hostRoundOver(tw)) return;      // al mejor de 3: otra ronda
          G.PvP.setWinner(tw);
          const sm = summary(); lastTeam = sm.team;
          G.Coop.over(Object.assign(sm, { pvpWin: tw }));
          endRun(pl.dead);
        }
        return;
      }
      if (alive.length > 1) { deathT = 0; pvpLast = null; return; }
      // El ganador es el que quedaba en pie al caer el penúltimo (aunque luego caiga él).
      if (deathT === 0) pvpLast = alive[0] || null;
      deathT += dt;
      if (deathT > 1.6) {
        deathT = 0;
        const w = pvpLast; pvpLast = null;
        if (G.PvPX.hostRoundOver(w ? w.uid || G.Net.uid : null)) return;      // al mejor de 3: otra ronda
        const name = !w ? null : w === pl ? (G.Social.me ? G.Social.me.name : G.DB.user) : w.tag;
        G.PvP.setWinner(name);
        const sm = summary(); lastTeam = sm.team;
        G.Coop.over(Object.assign(sm, { pvpWin: name }));
        endRun(pl.dead);
      }
      return;
    }
    if (G.Rift.inArena || !G.Coop.players().every(p => p.dead)) { deathT = 0; return; }
    deathT += dt;
    if (deathT > 1.6) {
      deathT = 0;
      const sm = summary(); lastTeam = sm.team;
      G.Coop.over(sm);
      endRun(true);
    }
  }

  // ---------------- dibujo ----------------

  function drawScene(cam, extra) {
    const t = performance.now() / 1000;
    G.World.drawGround(ctx, cam);
    G.World.drawLiquid(ctx, cam, t);
    G.Hazards.draw(ctx);
    G.Combat.drawGroundFields(ctx);
    G.Arts.draw(ctx);
    G.Dungeon.drawGround(ctx);
    G.Pickups.draw(ctx);
    G.PvPX.drawGround(ctx);              // PK: trampas y tesoro (pvp-extra.js)

    // Todo lo que tiene "pies" se ordena por Y: objetos, enemigos, jugador.
    const items = [];
    // Los planos (manantiales, trampas) siempre debajo de todo lo demás.
    for (const p of G.World.visibleProps(cam)) items.push({ y: p.flat ? p.y - 4000 : p.y, prop: p });
    for (const e of G.EnemyMgr.drawables(cam)) items.push({ y: e.y, ent: e });
    for (const e of extra) items.push({ y: e.y, ent: e });
    for (const c of G.Companion.drawables()) items.push({ y: c.y, ent: c });
    for (const f of G.Guard.drawables()) items.push({ y: f.y, ent: f });         // Dazhuang, sus ayudantes y los puestos
    for (const f of G.Dungeon.drawables()) items.push({ y: f.y, ent: f });      // muebles de la tienda
    for (const f of G.Funny.drawables()) items.push({ y: f.y, ent: f });       // Snorlax
    for (const f of G.Encounters.drawables()) items.push({ y: f.y, ent: f });  // encuentros (Clefairy, Gyarados, Mew…)
    const rift = G.Rift.drawable();
    if (rift) items.push({ y: rift.y, ent: rift });
    const stairs = G.Floors.drawable();
    if (stairs) items.push({ y: stairs.y, ent: stairs });
    const zone = G.Stages.drawable();
    if (zone) items.push({ y: zone.y, ent: zone });
    if (pl && state !== 'ui') for (const d of G.Events.drawables()) items.push({ y: d.y, ent: d });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.prop) G.World.drawProp(ctx, it.prop, t);
      else if (it.ent instanceof G.Player && G.PvPX.active) G.PvPX.drawPlayer(ctx, it.ent);    // PK: invisible, fantasma, racha
      else it.ent.draw(ctx);
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.scale(G.Camera.scale, G.Camera.scale);
    G.Camera.apply(ctx);
    drawScene(G.Camera, G.Coop.active ? [pl, ...G.Coop.puppets()] : [pl]);
    G.Projectiles.draw(ctx);
    G.Combat.drawAirFields(ctx);
    G.Dungeon.drawAir(ctx);
    G.Floors.drawAir(ctx);               // carteles de las escaleras y corona del jefe del piso
    G.PvP.drawWorld(ctx);                // PK: zona segura y punto de mira
    G.FX.draw(ctx);
    ctx.restore();

    G.Weather.draw(ctx, w, h, frameDt);
    G.World.drawVignette(ctx, w, h);
    // Niebla: la viñeta se cierra un poco (sin tapar el centro).
    // (Piso de niebla, floors.js: mucho más cerrada.)
    const fog = G.Weather.vignette, thick = G.Floors.thickFog;
    if (fog > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * (thick ? 0.2 : 0.32), w / 2, h / 2, Math.max(w, h) * (thick ? 0.46 : 0.62));
      g.addColorStop(0, 'rgba(200,205,220,0)');
      g.addColorStop(1, `rgba(200,205,220,${(thick ? 0.82 : 0.45) * fog})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // HUD, en su capa nítida.
    const hc = hctx;
    hc.setTransform(hdpr, 0, 0, hdpr, 0, 0);
    hc.clearRect(0, 0, w, h);
    hc.imageSmoothingEnabled = false;
    G.HUD.draw(hc, w, h, pl, st);
    G.PvP.drawHud(hc, w, h);
    G.Floors.drawFade(hc, w, h, (wt, s) => `${wt} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`);   // bajada de piso
    G.Touch.draw(hc);
    if (G.Settings.get('fps')) {
      hc.save();
      hc.font = '700 11px Pixelify, monospace';
      hc.textAlign = 'right';
      hc.fillStyle = fpsShown >= 50 ? '#5fe08a' : fpsShown >= 30 ? '#ffd23f' : '#ff5f6d';
      hc.fillText(fpsShown + ' FPS', w - 10, h - 8);
      hc.restore();
    }
    if (flashT > 0) {
      ctx.save();
      // "Menos destellos": el fogonazo de pantalla se queda en un tercio.
      ctx.globalAlpha = Math.min(1, flashT / flashDur * 1.4) * (G.Settings.get('calm') ? 0.3 : 1);
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // ---------------- fondo de los menús ----------------

  /**
   * El mundo de verdad, con Pokémon salvajes paseando y la cámara a la deriva.
   * Así el menú enseña desde el primer segundo cómo se ve el juego.
   */
  const Backdrop = (() => {
    let wanderers = [], t = 0, ready = false, biomeT = 0, bi = 0;
    const CAST = [1, 4, 7, 25, 133, 52, 39, 35, 16, 43, 60, 69, 74, 92, 129, 147, 113, 143, 54, 79];

    function init() {
      G.World.reset(4242);
      G.World.setBiome(0, true);
      G.Camera.x = 0; G.Camera.y = 0;
      wanderers = CAST.map(dex => spawn(dex, true));
      ready = true;
    }

    function spawn(dex, anywhere) {
      const a = new G.Sprites.Animator(dex, 1);
      const r = G.Sprites.bodyRadius(dex);
      let x = 0, y = 0;
      for (let i = 0; i < 20; i++) {
        x = G.Camera.x + G.U.rand(-1, 1) * (anywhere ? G.Camera.w * 0.6 : G.Camera.w * 0.7);
        y = G.Camera.y + G.U.rand(-1, 1) * (anywhere ? G.Camera.h * 0.6 : G.Camera.h * 0.7);
        if (G.World.isFree(x, y, r)) break;
      }
      return { dex, anim: a, x, y, r, vx: 0, vy: 0, t: 0, draw(ctx) {
        G.Sprites.drawShadow(ctx, this.dex, this.x, this.y);
        this.anim.draw(ctx, this.x, this.y);
      } };
    }

    function step(dt) {
      t += dt;
      G.World.update(dt, G.Camera);
      // Deriva lenta de la cámara.
      G.Camera.x += Math.cos(t * 0.05) * 14 * dt;
      G.Camera.y += Math.sin(t * 0.037) * 10 * dt;
      G.Camera.follow(G.Camera.x, G.Camera.y, dt);

      biomeT += dt;
      if (biomeT > 30) { biomeT = 0; bi = (bi + 1) % 3; G.World.setBiome(bi); }

      for (const wd of wanderers) {
        wd.t -= dt;
        if (wd.t <= 0) {
          // Pasea, se para o "ataca" al aire de vez en cuando.
          wd.t = G.U.rand(1, 3.5);
          const r = Math.random();
          if (r < 0.55) {
            const a = Math.random() * 6.2832, s = G.U.rand(25, 55);
            wd.vx = Math.cos(a) * s; wd.vy = Math.sin(a) * s;
          } else {
            wd.vx = wd.vy = 0;
            if (r > 0.85) wd.anim.play(G.U.pick(['Attack', 'Shoot', 'Charge']));
          }
        }
        wd.x += wd.vx * dt; wd.y += wd.vy * dt;
        G.World.collide(wd);
        const moving = Math.abs(wd.vx) + Math.abs(wd.vy) > 1;
        if (moving) wd.anim.dir = G.Sprites.dirFromAngle(Math.atan2(wd.vy, wd.vx));
        wd.anim.loop(moving ? 'Walk' : 'Idle');
        wd.anim.update(dt);
        // Si se queda fuera de cámara, reaparece dentro.
        if (!G.Camera.sees(wd.x, wd.y, 120)) Object.assign(wd, spawn(wd.dex, false));
      }
    }

    function render(ctx, w, h, dpr, dt) {
      if (!ready) return;
      step(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.scale(G.Camera.scale, G.Camera.scale);
      G.Camera.apply(ctx);
      drawScene(G.Camera, wanderers);
      ctx.restore();
      G.World.drawVignette(ctx, w, h);
    }

    /** Al volver de una run, recupera el mundo del menú. */
    function restore() {
      G.World.reset(4242);
      G.World.setBiome(bi, true);
      G.FX.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.EnemyMgr.clear(); G.Pickups.clear();
      wanderers = CAST.map(dex => spawn(dex, true));
    }

    return { init, render, restore };
  })();

  return {
    init, startRun, everyone, levelXp, flash, offerBond, offerItem, offerBox, openChoice, offerBoon,
    /** Para pruebas: salta el reloj de la run. */
    debugTime(t) { time = t; },
    /** PK al mejor de 3 (pvp-extra.js): el reloj vuelve atrás al empezar cada ronda. */
    setRoundTime(t) { time = t; deathT = 0; },
    /** Para grabar vídeos: cámara lenta (0,5 = mitad de velocidad). */
    debugSpeed(k) { speedK = k; },
    togglePause, spectating, nextSpec,
    /** Abandona la partida en curso (p. ej. al cerrar sesión desde Ajustes). */
    quit() { if (state !== 'ui' && state !== 'over') quitRun(); },
    /** Aventura: fase superada (win) o fallida. En grupo lo manda el anfitrión a todos. */
    stageEnd(win) {
      if (state === 'ui' || state === 'over' || !pl) return;
      G.Stages.setResult(win);
      if (G.Coop.active && G.Coop.isHost) {
        const sm = summary(); lastTeam = sm.team;
        G.Coop.over(Object.assign(sm, { stage: { win: !!win } }));
      }
      endRun(!win);
    },
    /** Mazmorra superada (floors.js): la run acaba como victoria; en grupo, para todos (lo decide el anfitrión). */
    victory() {
      if (state === 'ui' || state === 'over' || !pl) return;
      if (G.Coop.active && !G.Coop.isHost) return;
      clearWin = true;
      if (G.Coop.active) { const sm = summary(); lastTeam = sm.team; G.Coop.over(Object.assign(sm, { clear: 1 })); }
      endRun(false);
    },
    /** «Proteger a Dazhuang» (guard.js): 50 oleadas superadas (win) o Dazhuang ha caído. En grupo, el anfitrión para todos. */
    guardEnd(win) {
      if (state === 'ui' || state === 'over' || !pl) return;
      if (G.Coop.active && !G.Coop.isHost) return;
      clearWin = !!win;
      const sm0 = G.Guard.summary();
      if (G.Coop.active) { const sm = summary(); lastTeam = sm.team; G.Coop.over(Object.assign(sm, { gw: sm0 ? sm0.wave : 0 }, win ? { clear: 1 } : {})); }
      endRun(!win);
    },
    /** Acaba la run como si hubieras caído (Desafío legendario: pierdes en la arena). */
    end() { if (state !== 'ui' && state !== 'over') endRun(true); },
    /** Para grabar vídeos: abre las cartas de subir de nivel. */
    debugLevelUp() { pl.level++; pendingLevels++; pl.levelGrowth(); },
    toUI() { state = 'ui'; Backdrop.restore(); },
    get state() { return state; }, get player() { return pl; }, get fixedScene() { return fixedScene != null; }, st
  };
})();

/* ============ Flow — transiciones entre pantallas ============ */
G.Flow = {
  boot() {
    G.UI.initChrome();
    G.LoginUI.init(); G.TestUI.init(); G.MenuUI.init(); G.GachaUI.init();
    G.SocialUI.init(); G.RankingUI.init(); G.GoalsUI.init(); G.ProfileUI.init(); G.SettingsUI.init(); G.SupportUI.init(); G.NewsUI.init(); G.Updater.init();
    // Tu nombre arriba a la derecha abre tu perfil.
    document.getElementById('user-pill').onclick = () => G.GoalsUI.open('profile');
    G.Audio.music('village');     // suena tras el primer clic (lo exige el navegador)
    G.Game.init();
    // La base de datos (nube o local) recupera la sesión anterior.
    G.DB.ready().then(restored => {
      document.getElementById('boot').classList.add('hidden');
      // En otra tarea: crear el sonido para comprobarlo cuesta ~60 ms y no debe bloquear la carga.
      setTimeout(() => this.tapToStart(() => { if (restored) this.afterLogin(); else this.toLogin(); }), 0);
    });
  },
  /**
   * "Pulsa para empezar": los navegadores no dejan que una web suene hasta
   * que se toca algo. Con esta pantalla la música empieza en cuanto entras.
   * (Si el navegador ya deja sonar, no sale.)
   */
  tapToStart(then) {
    G.Audio.unlock();
    if (G.Audio.canPlay()) { then(); return; }
    const el = document.getElementById('tap-start');
    el.classList.remove('hidden');
    const go = e => {
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      G.Audio.unlock();
      el.classList.add('hidden');
      el.removeEventListener('click', go); removeEventListener('keydown', go, true);
      then();
    };
    el.addEventListener('click', go);
    addEventListener('keydown', go, true);
  },
  toLogin() {
    G.Audio.music('village');
    // Sin nube, o si ya jugabas como invitado: directo con la partida de este navegador.
    // Con nube y nada guardado aquí: pantalla para elegir invitado o Google.
    if ((G.DB.mode !== 'cloud' || G.DB.guestChosen) && G.DB.autoLocal()) this.afterLogin();
    else G.LoginUI.open();
  },
  afterLogin() {
    G.Audio.music('village');
    if (!G.DB.save.partner) G.TestUI.start();
    else this.goMenu();
  },
  goMenu() {
    if (G.Game.state !== 'ui') G.Game.toUI();
    G.Audio.music('village');
    G.MenuUI.open();
  },
  /** Al cerrar el resumen: a la sala si sigues en una, si no al menú. */
  afterRun() {
    if (G.Social.room) {
      if (G.Game.state !== 'ui') G.Game.toUI();
      G.Audio.music('village');
      if (G.Social.room.isHost) G.Social.setOpen(true);
      G.LobbyUI.open();
    } else this.goMenu();
  },
  play() { G.Game.startRun(); },
  /** Empieza la partida en grupo (el anfitrión la manda a todos). */
  startCoop(cfg) {
    // Aún mirando el resumen de la partida anterior: se cierra solo y entras con los demás
    // (2026-10-15: antes se ignoraba el aviso y te quedabas fuera; el resumen ya está guardado).
    if (G.Game.state === 'over' && G.Social.room) {
      const back = document.getElementById('btn-again');
      if (back && back.onclick) back.onclick(); else { G.UI.hideAll(); G.Game.toUI(); }
    }
    if (G.Game.state !== 'ui' || !G.Social.room) return;
    G.LobbyUI.close();
    G.Game.startRun(cfg);
  }
};
