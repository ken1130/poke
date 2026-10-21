/* ============ tips.js — consejos la primera vez ============
 * La primera vez que juegas cada cosa (cada tipo de fase de la Aventura, la torre,
 * el reto semanal, el jefe de incursión, el PK por equipos, el grupo...) sale un
 * consejo corto abajo, encima de los ataques. Uno cada vez; se cierra solo (9 s)
 * o con "Entendido". Se recuerda en este dispositivo (localStorage 'ps.tips').
 * Sólo se enseñan con la partida en marcha (no encima de las cartas o la pausa).
 */
G.Tips = (() => {
  const KEY = 'ps.tips', SHOW = 9;
  const TEXT = {
    stage: 'Aventura: cumple el objetivo de arriba. ★ superarla · ★ acabar con la mitad de la vida o más · ★ el reto de la fase.',
    'stage-collect': 'Recoge las bayas doradas: la flecha amarilla del borde de la pantalla te lleva a la más cercana.',
    'stage-zone': 'Quédate dentro del círculo amarillo (se pone verde). Cada poco se mueve: sigue la flecha.',
    'stage-boss': 'El líder saca a sus Pokémon de uno en uno: derrótalos a todos (arriba ves cuál va).',
    'stage-kills': 'Derrota a los Pokémon que pide antes de que se acabe el tiempo.',
    'stage-survive': 'Aguanta hasta que se acabe el tiempo. Derrotar a muchos da la tercera estrella.',
    tower: 'Torre sin fin: cada minuto subes un piso y cae una maldición nueva (arriba ves las que llevas).',
    weekly: 'Reto semanal: la regla de esta semana está arriba. Tu mejor tiempo va a la clasificación.',
    raid: 'Jefe de incursión: va a por quien tiene la diana 🎯. Si eres tú, ¡corre! Los demás, ¡a pegarle!',
    teams: 'PK por equipos: no puedes herir a los de tu equipo y puedes levantarlos si caen.',
    group: 'En grupo: pulsa T (o 💬 en el móvil) para mandar mensajes rápidos a tus compañeros.',
    evolve: 'Tu Pokémon evoluciona al llegar a Nv. 10, 20 y 30 y se hace más fuerte (se puede apagar en Ajustes).',
    // (2026-10-16) lo nuevo del mapa
    disc: 'Ha aparecido tu disco de movimientos (sigue la flecha celeste): da de 1 a 4 mejoras al azar.',
    potion: 'Las pociones dan un efecto al azar unos segundos: gigante, diminuto, furia, estrella... o una mala.',
    egg: 'Recoge tu huevo Pokémon: tras derrotar a 120, nace un compañero que lucha contigo.',
    mhouse: 'El "?" del minimapa es una sala misteriosa: puede ser una casa de monstruos. ¡Aguanta 30 s y llévate el botín!',
    shop: 'Tienda de Kecleon: quédate encima de algo para comprarlo con las monedas de la run. Sin dinero... lo robas, y Kecleon se enfada.',
    statue: 'Toca la estatua misteriosa: bendición (o maldición con premio) para todo el grupo durante 3 minutos.',
    stairs: 'Escaleras: si os quedáis todos encima, bajáis al piso siguiente (más difícil, pero con más premios).',
    elite: 'Enemigo de élite (aro de color): más fuerte y con una habilidad especial, pero suelta mucha más experiencia.',
    combo: 'En grupo: quedaos cerca para cargar el ataque combinado y pulsa F (o el botón) cuando esté lleno.'
  };
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  const queue = [];
  let box = null, cur = null, t = 0;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* nada */ } }
  /** Pide un consejo (si nunca se vio). */
  function once(k) { if (!TEXT[k] || seen[k] || queue.includes(k) || cur === k) return; queue.push(k); }

  function el() {
    if (box) return box;
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;bottom:118px;transform:translateX(-50%);z-index:22;max-width:min(560px,calc(100% - 32px));' +
      'display:none;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(10,16,28,.92);border:2px solid #ffd23f;' +
      'box-shadow:0 4px 18px #0008;color:#f4f8ff;font-size:14px;line-height:1.35';
    box.innerHTML = '<span style="font-size:20px">💡</span><span data-t style="flex:1"></span><button class="btn small gold" data-ok></button>';
    box.querySelector('[data-ok]').onclick = hide;
    document.body.appendChild(box);
    return box;
  }
  function hide() { if (box) box.style.display = 'none'; cur = null; }

  /** Cada fotograma: mira qué toca y enseña uno. */
  function tick(dt) {
    const playing = G.Game.state === 'playing' && !['scr-levelup', 'scr-pause', 'scr-item', 'scr-bond', 'scr-sbox', 'scr-boon', 'scr-relic', 'scr-shop', 'scr-roul', 'scr-pkpick', 'scr-fclear'].some(G.UI.isOpen);
    if (!playing) { if (cur) { box.style.display = 'none'; } return; }
    if (G.Floors.floorBoss && G.Floors.floorBoss()) { if (cur) box.style.display = 'none'; return; }   // (2026-10-21: con el jefe del piso vivo tapaba al jefe)
    const pl = G.Game.player, run = G.Modes.run;
    if (run === 'stage' && G.Stages.goal) { once('stage'); once('stage-' + G.Stages.goal); }
    if (run === 'tower') once('tower');
    if (run === 'weekly') once('weekly');
    if (G.Coop.active && !G.PvP.on) once('group');
    if (G.PvP.teams) once('teams');
    if (G.Raid.active) once('raid');
    if (pl && pl.level >= 4 && G.Settings.get('evolve') !== false && G.Evo.levelFor(pl.dex) != null) once('evolve');
    // Lo nuevo del mapa: la primera vez que aparece cerca (o es tuyo).
    for (const p of G.Pickups.all()) {
      if ((p.kind === 'sbox' || p.kind === 'fbox' || p.kind === 'potion' || p.kind === 'egg') && G.Loot.visible(p)) once(p.kind === 'sbox' || p.kind === 'fbox' ? 'disc' : p.kind);
    }
    for (const s of G.Dungeon.sites) once(s.type);
    if (G.Floors.stairs) once('stairs');
    if (G.Coop.active && !G.PvP.on) once('combo');
    if (pl && G.EnemyMgr.all().some(e => e.elite && !e.dead && G.Camera.sees(e.x, e.y, 0))) once('elite');
    if (cur) {
      el().style.display = 'flex';
      if ((t -= dt) <= 0) hide();
      return;
    }
    const k = queue.shift();
    if (!k) return;
    cur = k; t = SHOW; seen[k] = 1; save();
    const b = el();
    b.querySelector('[data-t]').textContent = G.T(TEXT[k]);
    b.querySelector('[data-ok]').textContent = G.T('Entendido');
    b.style.display = 'flex';
  }
  /** Al acabar la partida: fuera lo que hubiera en pantalla. */
  function reset() { hide(); queue.length = 0; }

  return { tick, once, reset };
})();
