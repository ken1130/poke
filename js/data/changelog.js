/* ============ changelog.js — novedades del juego ============
 * Lo que ve la gente en el botón "Novedades" de la barra de arriba: cambios
 * de juego y fallos arreglados (nada de servidores ni bases de datos).
 * La fecha más nueva, arriba. En cada fecha, por apartados:
 *   new  lo nuevo · chg  cambios y ajustes · fix  fallos arreglados
 * Cada línea en español y en inglés.
 */
G.CHANGELOG = [
  { d: '2026-10-17', title: ['Modo fiesta: Big Two', 'Party mode: Big Two'], new: [
    ['Modo fiesta en las salas con amigos: el anfitrión elige el juego y puede añadir jugadores de la CPU (hasta 4). El primero es el Big Two (reglas de Taiwán, cartas con Pokémon): cada uno sólo ve sus cartas, turnos de 25 s, pistas, ordenar, otra ronda y puntos acumulados; si alguien se desconecta juega la CPU por él y recupera su sitio al volver con la misma cuenta.',
     'Party mode in friends rooms: the host picks the game and can add CPU players (up to 4). The first one is Big Two (Taiwan rules, Pokémon cards): everyone only sees their own hand, 25 s turns, hints, sorting, play again and cumulative points; if someone disconnects the CPU plays for them and they get their seat back by rejoining with the same account.']
  ] },
  { d: '2026-10-17', title: ['Arceus y el móvil rediseñado', 'Arceus and a redesigned mobile'], new: [
    ['El jefe final de la mazmorra es siempre Arceus (y ya no sale en ningún otro sitio): al 66 % llama a guardianes élite (3, +2 por cada jugador más) y al 33 % a dos jefes menores y se enfurece; al caer él, caen todos.',
     'The final dungeon boss is always Arceus (and no longer appears anywhere else): at 66% it calls elite guardians (3, +2 per extra player) and at 33% two lesser bosses and becomes enraged; when it falls, they all fall.'],
    ['Rediseño completo para el móvil en horizontal: Pokédex con cuadrícula a todo el ancho y ficha a pantalla completa; menús, ajustes, sala, retos y entrenamiento con cabecera fija y dos columnas; cartas en fila dentro de la partida y la tienda como panel inferior con los 5 artículos a la vista.',
     'Full landscape phone redesign: a full-width Pokédex grid with a full-screen detail sheet; menus, settings, lobby, challenges and training with sticky headers and two columns; in-run cards in a row and the shop as a bottom panel showing all 5 wares.']
  ], chg: [
    ['Escudo de Llamas y Flecha Psíquica con efectos de píxeles: un aro de llamas que gira a tu alrededor y una flecha rosa con estela de cuadraditos.',
     'Fire Shield and Psy Arrow get pixel-art effects: a ring of flames orbiting you and a pink arrow with a blocky trail.']
  ], fix: [
    ['Móvil: el texto del HUD se veía borroso; ahora va en una capa aparte a la resolución real de la pantalla.',
     'Mobile: HUD text looked blurry; it now uses its own layer at the screen\'s real resolution.'],
    ['Móvil: la barra de movimientos y los objetos van a la derecha para dejar abajo a la izquierda el joystick.',
     'Mobile: the move bar and items sit on the right, leaving the bottom left for the joystick.'],
    ['En el iPhone, al girarlo a horizontal (o al esconderse la barra de direcciones) el juego se veía aplastado y el joystick salía lejos del dedo: ahora el lienzo se vuelve a medir cada vez que cambia de tamaño.',
     'On iPhone, after rotating to landscape (or when the address bar hid) the game looked squashed and the joystick appeared away from your finger: the canvas now re-measures whenever its size changes.'],
    ['Pokédex en el móvil en horizontal: los botones de «Mi equipo» y de elegir compañero se montaban y tapaban el Pokémon; en pantallas muy bajas todo es más compacto.',
     'Pokédex on phones in landscape: the "My team" and choose-partner buttons overlapped and covered the Pokémon; on very short screens everything is more compact.']
  ] },
  { d: '2026-10-16', title: ['Subir de nivel te hace más fuerte', 'Levelling up makes you stronger'], new: [
    ['PK: una ronda o al mejor de 3 (vida llena entre rondas y marcador arriba). Con 2: premio en el centro cada 30 s (ataque ×2, velocidad o 3 s de invisibilidad: los rivales no te apuntan ni te ven en el minimapa), suelo trampa que estalla (−15 % de vida) y el que pierde la ronda puede cambiar sus movimientos. Con 3 o más: los caídos son fantasmas que lanzan piedras que frenan, rachas de K.O. y duelo final con la zona cerrándose. Todo se activa o no en la sala.',
     'PvP: one round or best of 3 (full HP between rounds, score on top). With 2: a center power-up every 30 s (×2 attack, speed or 3 s invisibility: rivals cannot target you or see you on the minimap), exploding trap floors (−15% HP) and the round loser may change moves. With 3+: downed players are ghosts throwing slowing pebbles, K.O. streaks and a final duel with the zone closing. Each one can be turned on or off in the room.'],
    ['PK: la zona segura se ve desde el principio (mapa y minimapa, con el círculo final en blanco), cuenta atrás de 30 s, aviso al empezar, flecha hacia el centro con los metros y pantalla en rojo fuera de la zona (−8 % de vida por segundo).',
     'PvP: the safe zone is visible from the start (map and minimap, with the final circle in white), a 30 s countdown, an announcement when it starts, an arrow to the center with the distance, and a red screen outside the zone (−8% HP per second).'],
    ['Ataque combinado: cuando está lleno lo avisa («¡Pulsa F!» o el botón en el móvil) y lo recuerda encima de tu Pokémon.',
     'Combo attack: when it is full you are told («Press F!» or the button on mobile) and reminded above your Pokémon.'],
    ['Siete encuentros nuevos en el mapa (el primero hacia el minuto 3, luego cada 2,5-4 min): altar lunar de Clefairy, la venganza de Magikarp (30 golpes y se vuelve un Gyarados aliado 20 s), cofre-Ditto (un jefe con tu aspecto), Slowpoke pescando, enfermera Chansey (cura y levanta a todo el grupo), huellas de Mew (una mejora de movimiento) y el robo de Electrode (15 % de las monedas; vencedlo en 20 s para recuperar el 150 %).',
     'Seven new map encounters (the first around minute 3, then every 2.5-4 min): Clefairy\'s moon altar, Magikarp\'s revenge (30 hits and it becomes an allied Gyarados for 20 s), the Ditto chest (a boss that looks like you), Slowpoke fishing, nurse Chansey (heals and revives the whole team), Mew\'s footprints (one move upgrade) and the Electrode heist (15% of coins; beat it within 20 s to get 150% back).'],
    ['Sala de entrenamiento (al final de Retos): 5 muñecos de Pikachu en corro que no se mueven ni caen; eliges hasta 5 movimientos de todos, con su nivel o evolucionados, y ves el daño total y por segundo. Sin enemigos ni premios.',
     'Training Room (end of Challenges): 5 Pikachu dummies in a ring that never move or fall; pick up to 5 moves from all of them, at any level or evolved, and see total and per-second damage. No enemies, no rewards.'],
    ['Jerry (normal/hada) en la pestaña «Otros», con su movimiento exclusivo Sartenazo: golpea al enemigo más cercano y a veces lo aturde. Evoluciona en Sartén Furiosa: 3 golpes a 3 enemigos, siempre aturde y salpica.',
     'Jerry (Normal/Fairy) in the "Others" tab, with his exclusive Frying Pan Counter: whacks the nearest enemy and sometimes stuns it. Evolves into Frying Pan Frenzy: 3 whacks on 3 enemies, always stuns and splashes.'],
    ['Al coger un objeto ya no sale una ventana que para el juego: aparece un icono que brilla sobre los movimientos y lo cambias cuando quieras (tócalo o pulsa I). Esperan hasta 3; si llega otro, se vende el de menos rango. Lo comprado en la tienda o regalado por una bendición abre la ventana al momento.',
     'Picking up an item no longer pauses the game with a window: a glowing icon appears above your moves and you swap it whenever you like (tap it or press I). Up to 3 can wait; another one sells the lowest tier. Items bought in the shop or given by a boon open the window right away.'],
    ['Ruleta de Kecleon: cuando alguien gira, los demás ven la misma ruleta girando arriba de la pantalla, con quién gira y el resultado (sin tapar nada).',
     'Kecleon roulette: when someone spins, everyone else sees the same wheel spinning at the top of the screen, with who spins and the result (without blocking anything).'],
    ['Cada nivel: +2 % de vida máxima (y te cura eso) y +1 % de ataque, hasta el nivel 50 (en PK no).',
     'Each level: +2% max HP (healed too) and +1% attack, up to level 50 (not in PvP).'],
    ['Nuevo truco levelup30: +30 niveles desde el que tengas (en partida), eligiendo las cartas.',
     'New cheat levelup30: +30 levels from your current one (while playing), picking your cards.']
  ], chg: [
    ['Móvil y tableta: el HUD de la partida es más grande (mínimo 11 px), la información de arriba a la izquierda y el minimapa evitan la muesca del iPhone, el ataque combinado es un botón grande abajo a la derecha y en pantallas bajas hay como mucho 3 flechas de borde.',
     'Phones and tablets: bigger in-run HUD (at least 11 px), the top-left info and the minimap avoid the iPhone notch, the combo attack is a big bottom-right button, and short screens show at most 3 edge arrows.'],
    ['Más fluido en el móvil: el tinte rojo de los élite enfurecidos ya no se recalcula cada fotograma, menos resolución interna con muchos enemigos, los sprites se precargan por partes y el minimapa y los iconos de la tienda cuestan menos.',
     'Smoother on phones: the red tint of enraged elites is no longer recomputed every frame, lower internal resolution when crowded, sprites preload in batches, and the minimap and shop icons are cheaper.'],
    ['Móvil: la ruleta, la pausa, el resumen, el gacha y las ventanas de elección caben en pantallas bajas; el título del menú no se parte; márgenes para la muesca del iPhone; los campos no hacen zoom en iOS; controles y enlaces más fáciles de tocar.',
     'Mobile: the roulette, pause, summary, gacha and choice windows fit short screens; the menu title no longer wraps; iPhone notch margins; inputs do not zoom on iOS; easier-to-tap controls and links.'],
    ['Tienda de Kecleon: precios ×2; en grupo, +35 % por cada jugador más (las monedas son de todos).',
     'Kecleon shop: prices ×2; in a group, +35% per extra player (coins are shared).'],
    ['La primera tienda sale a los 4:00 (antes 4:30).',
     'The first shop appears at 4:00 (was 4:30).'],
    ['Mascotas siempre vende huevos: uno por jugador, cada uno puede comprar sólo uno (y no si ya tiene compañero o huevo). La sección normal ya no los vende.',
     'The Pets section always sells eggs: one per player, each can buy only one (and not with a partner or egg already). The normal section no longer sells them.'],
    ['Si ya vencisteis a Kecleon, sus tiendas tienen dos guardaespaldas (Machamp) que pelean con él si robáis otra vez.',
     'Once you beat Kecleon, his shops have two bodyguards (Machamp) who fight with him if you steal again.'],
    ['Ruleta de 10 casillas (cada una del tamaño de su probabilidad, la misma de antes), más grande y con números más grandes.',
     'Roulette with 10 slots (each sized by its chance, same odds as before), bigger and with bigger numbers.'],
    ['Poder Púrpura (Rayo Destructor evolucionado): el rayo mide un 60 % de lo que medía (11,5 → 6,9 casillas).',
     'Purple Power (evolved Destruction Beam): the beam is 60% as long as before (11.5 → 6.9 tiles).'],
    ['Rayo Destructor y Peso Pesado (movimientos normales de esta versión) sólo salen a Pokémon de tipo normal; Danza Espada, Fortaleza, Agilidad y los demás de siempre siguen para todos.',
     'Destruction Beam and Heavyweight (this version\'s own Normal moves) only appear for Normal-type Pokémon; Swords Dance, Harden, Agility and the other originals stay for everyone.'],
    ['Cruzada: las dos cuchillas que salen al partirse se vuelven a partir una vez.',
     'Crusade: the two blades from the split split once more.'],
    ['Colmillo Vampiro: un mordisco en cada enemigo en vez de una línea.',
     'Vampire Fang: a bite on each enemy instead of a line.'],
    ['Nuevo aspecto de la ruleta de Kecleon: verde oscuro y oro, como una mesa de casino, sin tantos colores.',
     'New look for the Kecleon roulette: dark green and gold, like a casino table, without so many colours.'],
    ['Kecleon (al robar) se hace más fuerte con vuestro nivel y con cuántos sois: +5 % de vida y +2 % de daño por nivel y +25 % de vida por cada jugador más.',
     'Kecleon (after stealing) gets stronger with your level and party size: +5% HP and +2% damage per level and +25% HP per extra player.'],
    ['Desafío legendario: cada vez más duro: desde la 7.ª victoria, +8 % de vida por victoria (antes se quedaba igual) y +4 % de daño por victoria.',
     'Legend rush keeps getting harder: from the 7th win on, +8% HP per win (it used to stop growing) and +4% damage per win.'],
    ['Torre sin fin: las maldiciones tienen tope (vida y daño 4, velocidad, número, curas y oscuridad 3; con todas al máximo sólo salen jefes) y sus jefes son un poco más fuertes en cada piso (+5 % de vida, +3 % de daño).',
     'Endless Tower: curses are capped (HP and damage 4; speed, count, healing and darkness 3; once all are maxed only bosses appear) and its bosses get a bit stronger each floor (+5% HP, +3% damage).'],
    ['En grupo, la dificultad va según cuántos sois (solo, igual que siempre): por cada jugador más, +60 % de enemigos, +30 % de vida (+40 % en Aventura, retos, torre y desafío legendario), +10 % de daño y +30 % de enemigos a la vez. En la mazmorra con 3, a los 9 minutos ya todo era élite y no se acababa nunca.',
     'In a group, difficulty depends on how many you are (solo is unchanged): per extra player, +60% enemies, +30% HP (+40% in Adventure, challenges, tower and legend rush), +10% damage and +30% enemies at once. In the dungeon with 3, after 9 minutes everything was elite and it never ended.']
  ], fix: [
    ['En el mapa, la caseta de la tienda y la estatua tapaban a quien estaba delante; y llegando por un lado se atravesaba la caseta antes de entrar.',
     'On the map, the shop hut and the statue covered whoever stood in front; and coming from the side you walked through the hut before entering.'],
    ['En la tienda, a un Pokémon alto (Tom) delante del mostrador se le tapaba la cabeza: los muebles y Kecleon se dibujan ahora por profundidad.',
     'In the shop, a tall Pokémon (Tom) in front of the counter had its head covered: furniture and Kecleon are now drawn by depth.'],
    ['Al volver al mostrador desde la estantería de mascotas, la tienda se quedaba en la pestaña de mascotas.',
     'Walking back to the counter from the pet shelf left the shop on the Pets tab.'],
    ['La ruleta cambiaba las monedas al pulsar: ahora se cobra y se avisa cuando la rueda se para.',
     'The roulette changed your coins as soon as you pressed: now it pays and announces when the wheel stops.'],
    ['La Tormenta de Cuchillas lanzaba la cuchilla gigante de los jefes (dos dibujos con el mismo nombre) y parecía un golpe; ahora dispara una espada pequeña en línea recta.',
     'Blade Storm fired the giant boss cleaver (two drawings shared a name) and looked like a slam; it now shoots a small sword in a straight line.'],
    ['En la tienda de Kecleon se podía atravesar el mostrador, las estanterías y la ruleta corriendo o con un acelerón.',
     'In Kecleon\'s shop you could pass through the counter, shelves and roulette when running or dashing.'],
    ['La sala misteriosa, la tienda, la estatua y las escaleras vuelven a aparecer cerca si todos os alejáis más de 100 m (en el minimapa salían a miles de metros).',
     'The mystery room, shop, statue and stairs reappear nearby if everyone gets more than 100 m away (the minimap showed them thousands of metres away).']
  ] },
  { d: '2026-10-15', title: ['Cambio de objetos más claro', 'Clearer item swaps'], new: [
    ['«Mi equipo» en la colección: añade tus Pokémon de siempre y encuéntralos al momento con el filtro «★ Mi equipo».',
     '"My team" in the collection: add your usual Pokémon and find them instantly with the "★ My team" filter.']
  ], chg: [
    ['Al encontrar un objeto llevando ya dos, cada opción muestra el efecto del objeto que dejas y el del nuevo (antes sólo se veía el del nuevo).',
     'When you find an item while already carrying two, each option now shows the effect of the item you give up and of the new one (before, only the new one was shown).']
  ], fix: [
    ['La frase de arriba de esa ventana ("Llevas dos: elige cuál cambias") salía siempre en español.',
     'The line at the top of that window ("You carry two: choose which to swap") always showed in Spanish.'],
    ['En la mazmorra la partida podía quedarse parada ("eligiendo…" sin ninguna ventana): si salían a la vez cartas de nivel y un objeto (casa de monstruos), la segunda ventana escondía la primera. Ahora se eligen una detrás de otra y, si aun así se queda parada, sigue sola.',
     'In the dungeon the run could freeze ("choosing…" with no window): when level-up cards and an item came at once (Monster House), the second window hid the first. Now they come one after another and, if it still gets stuck, the game recovers by itself.'],
    ['Tienda de Kecleon: mientras eliges no se puede comprar, robar ni usar la ruleta (comprar dos cosas seguidas podía dejar la partida parada).',
     'Kecleon shop: while choosing you cannot buy, steal or use the roulette (buying two things in a row could freeze the run).'],
    ['Las escaleras ya no salen en sitios a los que no se puede llegar.',
     'Stairs no longer appear in places you cannot reach.'],
    ['Lluvia Corrosiva y Nanolluvia no hacían daño ni frenaban (y el sangrado de Puño Lee tampoco funcionaba).',
     'Corrosive Rain and Nano Rain dealt no damage and did not slow (and Lee Fist bleeding did not work either).'],
    ['El campo de Shaq no frenaba a los enemigos: ahora rebotan y se quedan fuera del anillo, que se ve siempre (también en grupo, siendo invitado).',
     'Shaq\'s field did not stop enemies: they now bounce off and stay outside the ring, which is always visible (also in co-op as a guest).'],
    ['Las púas del árbol caído ahora se ven salir del suelo.',
     'The fallen tree\'s spikes can now be seen sprouting from the ground.'],
    ['Con Descanso dentro de un vínculo te quedabas dormido para siempre.',
     'With Rest inside a bond you stayed asleep forever.'],
    ['En PK, tocar al rival hacía fallar el juego en cada fotograma.',
     'In PvP, touching your rival made the game error every frame.'],
    ['El aviso de huevo eclosionado salía a medio traducir.',
     'The egg-hatched message was half translated.']
  ] },
  { d: '2026-10-13', title: ['Todas las partidas cuentan', 'Every run counts'], chg: [
    ['Ya no hay comprobaciones contra trampas: todas las partidas cuentan para el ranking y los récords, y no se pierde nada de lo ganado.',
     'No more anti-cheat checks: every run counts for the leaderboard and your records, and nothing you earn is taken away.']
  ] },
  { d: '2026-10-12', title: ['Tiempo extra y grietas con menos azar', 'Overtime and less random rifts'], new: [
    ['Tiempo extra: desde el minuto 60 los Pokémon salvajes se vuelven cada vez más fuertes (más vida y más daño), y cada vez más deprisa. Antes, con las mejoras al máximo, algunas partidas no acababan nunca; ahora las mejores rondarán la hora y media.',
     'Overtime: from minute 60 on, wild Pokémon keep getting stronger (more HP and more damage), faster and faster. Before, with maxed upgrades, some runs never ended; now the best ones will last about an hour and a half.'],
    ['El juego se actualiza solo cuando sale una versión nueva: si estás en el menú, a los 5 segundos; si estás jugando, al acabar la partida (sin perder nada).',
     'The game now updates itself when a new version is out: within 5 seconds if you are in the menu, or after your run if you are playing (without losing anything).'],
    ['Botón de Novedades (esta ventana) con todos los cambios del juego.',
     'A "What\'s new" button (this window) with every change to the game.'],
    ['Números más fáciles de leer: el 2, el 5 y el 8 ya no se confunden.',
     'Easier to read numbers: 2, 5 and 8 no longer look alike.'],
    ['Elige la versión normal o shiny de tu compañero desde el menú principal, debajo de él.',
     'Pick the normal or shiny version of your partner right from the main menu, under it.'],
    ['Mejoras nuevas para cada Pokémon: Golpe Crítico (+3 % de críticos por nivel, que hacen x1,5 de daño), Cambio de cartas (+1 cambio de las cartas de nivel por run) y Veto (bloquea movimientos para que no te salgan en las cartas; se eligen en Mejoras).',
     'New upgrades for each Pokémon: Critical Hit (+3% critical chance per level, crits deal x1.5 damage), Card reroll (+1 level-up card reroll per run) and Ban (block moves so they never show up in your cards; pick them in Upgrades).'],
    ['Atajos de movimientos (en Mejoras, para cada Pokémon): elige qué movimiento va siempre en cada hueco, por ejemplo Confusión siempre en el 1, para la memoria muscular.',
     'Move shortcuts (in Upgrades, for each Pokémon): choose which move always goes in each slot, for example Confusion always on 1, for muscle memory.']
  ], chg: [
    ['Avalancha hace menos daño (21 en vez de 26): derrotaba casi el doble que la media de los movimientos.',
     'Rock Slide deals less damage (21 instead of 26): it defeated almost twice as many as the average move.'],
    ['Los cambios de cartas de nivel ya no se ganan venciendo jefes: tienes 1 gratis por run y el resto se compra en Mejoras.',
     'Level-up card rerolls are no longer earned by defeating bosses: you get 1 free per run and can buy more in Upgrades.'],
    ['Los legendarios de grieta ya no dan siempre tickets x10: dan uno la mitad de las veces (antes daban 2 siempre y salían demasiados).',
     'Rift legendaries no longer always drop x10 tickets: they drop one half of the time (they used to always drop 2, which was too many).'],
    ['Cooperativo: si vuestras redes no consiguen conectar entre sí, la sala lo avisa y lo reintenta sola, en vez de jugar a tirones por un servidor lento.',
     'Co-op: if your networks cannot connect to each other, the room says so and keeps retrying, instead of playing laggy through a slow server.'],
    ['Hemos cambiado de servidores para que el juego siga siendo gratis: puede que tengas que volver a iniciar sesión (con la misma cuenta y contraseña, o con Google). Tu partida y tus Pokémon siguen igual.',
     'We moved to new servers so the game can stay free: you may need to sign in again (with the same account and password, or with Google). Your save and your Pokémon are unchanged.'],
    ['Gacha: los shiny ya no salen repetidos. Si te toca uno que ya tienes, sale otro de la misma rareza que te falte.',
     'Gacha: shinies no longer come out as duplicates. If you roll one you already have, you get another of the same rarity that you are missing.'],
    ['Grietas con menos azar: cada vez que no sale una, la siguiente es más probable (como mucho 2,5 minutos sin grieta).',
     'Less random rifts: every time one does not show up, the next one is more likely (at most 2.5 minutes without a rift).'],
    ['Los legendarios que aún no has vencido salen 4 veces más en las grietas.',
     'Legendaries you have not beaten yet show up 4 times as often in rifts.'],
    ['Los curanderos curan más cuanto más fuerte pegas, pero cada vez menos y con un tope (como mucho el 2,5x).',
     'Healers heal more the harder you hit, but with diminishing returns and a cap (2.5x at most).'],
    ['Ataques cuerpo a cuerpo más fuertes: mientras llevas uno activo recibes un 25 % menos de daño, llegan un 25 % más lejos y hacen un 20 % más de daño.',
     'Stronger melee attacks: while one is active you take 25% less damage, and they reach 25% further and deal 20% more damage.'],
    ['Cooperativo: al elegir con qué objeto quedarte, la partida se para para todos (antes seguía y te pegaban mientras elegías).',
     'Co-op: choosing which held item to keep now pauses the run for everyone (it used to keep going and you got hit while choosing).'],
    ['Cooperativo: mientras alguien elige una fusión, la partida se para para todos.',
     'Co-op: while someone is choosing a fusion, the run pauses for everyone.'],
    ['Cooperativo: si el anfitrión cambia de pestaña o se le para el juego, la partida se pausa para todos hasta que vuelva.',
     'Co-op: if the host switches tabs or their game stalls, the run pauses for everyone until they are back.'],
    ['Las runs de menos de 1 minuto ya no cuentan para el ranking.',
     'Runs shorter than 1 minute no longer count for the leaderboard.']
  ], fix: [
    ['Quitadas del ranking las marcas rotas por el fallo del minuto 84 (el reloj seguía corriendo con el juego parado) y alguna imposible. Si tenías una, tu próxima partida vuelve a contar.',
     'Removed broken records from the leaderboard caused by the minute 84 bug (the clock kept running while the game was frozen) and a few impossible ones. If you had one, your next run counts again.'],
    ['iPhone (Safari y Chrome): a veces no se podía cambiar de movimiento tocando los iconos, sobre todo con el otro dedo en el joystick. Además los botones quedan por encima de la barra de inicio.',
     'iPhone (Safari and Chrome): sometimes you could not switch moves by tapping the icons, especially with your other finger on the joystick. Buttons also sit above the home bar now.'],
    ['En las partidas de más de 84 minutos la pantalla se quedaba en negro, el juego se paraba o empezabas a subir de nivel sin fin. Ya puedes jugar todo lo que aguantes.',
     'In runs longer than 84 minutes the screen went black, the game froze or you kept levelling up forever. Now you can play for as long as you survive.'],
    ['Si el juego fallara, la partida se cierra sola y se guarda (tiempo, derrotados, récords y ranking) en vez de perderse.',
     'If the game ever crashes, the run ends by itself and is saved (time, defeated, records and leaderboard) instead of being lost.'],
    ['Las partidas muy largas a veces se tomaban por trampas y no contaban para el ranking.',
     'Very long runs were sometimes flagged as cheating and did not count for the leaderboard.'],
    ['Cooperativo: si el anfitrión cambiaba de pestaña, los enemigos se quedaban quietos y los demás jugaban con ventaja.',
     'Co-op: if the host switched tabs, enemies stood still and everyone else got a free advantage.'],
    ['iPhone: mantener el dedo en el joystick sacaba "Copiar / Seleccionar todo".',
     'iPhone: holding your finger on the joystick brought up "Copy / Select all".'],
    ['iPhone: a veces no salía la pantalla completa. Ahora el botón explica cómo tenerla (Compartir y "Añadir a pantalla de inicio").',
     'iPhone: fullscreen sometimes did not show up. Now the button explains how to get it (Share and "Add to Home Screen").']
  ] },
  { d: '2026-10-11', title: ['Vínculos', 'Bonds'], new: [
    ['Vínculos: al vencer a un legendario fusionas movimientos que se lanzan a la vez desde un solo hueco (hasta 4).',
     'Bonds: defeating a legendary lets you fuse moves that fire at the same time from a single slot (up to 4).'],
    ['Botón para cambiar las cartas de subir de nivel.',
     'A button to reroll the level-up cards.']
  ], chg: [
    ['Más grietas.', 'More rifts.'],
    ['Movimientos psíquicos y curanderos más flojos.', 'Weaker psychic moves and healers.'],
    ['Las mejoras de las cartas de nivel (velocidad, recarga, experiencia, imán, coraza y potencia) tienen un tope de veces.',
     'Level-up card upgrades (speed, cooldown, experience, magnet, armor and power) can only be taken a limited number of times.'],
    ['En el móvil, la ficha del Pokémon sale al lado; entrar es más rápido y el gacha x10 se puede cerrar.',
     'On mobile, the Pokémon details show alongside; logging in is faster and the x10 gacha can be closed.']
  ], fix: [
    ['Pantalla negra en partidas de más de una hora por llenarse la memoria de imágenes.',
     'Black screen in runs longer than an hour because image memory filled up.'],
    ['Los tickets se perdían si se cerraba la pestaña antes de acabar la partida: ahora se guardan al cogerlos.',
     'Tickets were lost if the tab closed before the run ended: now they are saved as soon as you pick them up.'],
    ['Una mejora comprada justo después de guardar se cobraba y no se apuntaba.',
     'An upgrade bought right after saving was charged but not applied.'],
    ['El juego se quedaba congelado para siempre si algo fallaba a mitad de partida.',
     'The game froze forever if something went wrong mid-run.']
  ] },
  { d: '2026-10-10', title: ['Más reto', 'More challenge'], new: [
    ['Jefes y legendarios con 4 ataques avisados que se enfurecen a media vida.',
     'Bosses and legendaries with 4 telegraphed attacks that get enraged at half health.'],
    ['12 movimientos nuevos y 8 formas de atacar nuevas: bumerán, cadena, minas, meteoros, torreta, embestida, rastro y abanico.',
     '12 new moves and 8 new ways to attack: boomerang, chain, mines, meteors, turret, dash, trail and spray.'],
    ['Eventos a mitad de partida (hordas de un tipo, hora dorada, Pokémon perdidos) y Meowth y Gholdengo que huyen cargados de monedas.',
     'Mid-run events (single-type hordes, golden hour, lost Pokémon) and Meowth and Gholdengo running away loaded with coins.'],
    ['Estatuas para los Pokémon grandes.', 'Statues for big Pokémon.']
  ], chg: [
    ['Más difícil: menos enemigos pero más duros.', 'Harder: fewer but tougher enemies.'],
    ['Subir de nivel es más lento, los tickets son más raros y los jefes dan ticket x10 una de cada tres veces.',
     'Levelling up is slower, tickets are rarer and bosses drop a x10 ticket one time in three.'],
    ['Carga más rápida.', 'Faster loading.']
  ], fix: [
    ['Los enemigos rezagados desaparecían delante de ti: ahora sólo fuera de la vista.',
     'Straggling enemies vanished in front of you: now only off-screen.'],
    ['Los menús y pantallas se montaban encima de la barra de arriba.',
     'Menus and screens overlapped the top bar.']
  ] },
  { d: '2026-10-09', title: ['Móvil e inglés', 'Mobile and English'], new: [
    ['Se puede jugar en móvil y tablet con joystick táctil, e instalar como app.',
     'Play on phones and tablets with a touch joystick, and install it as an app.'],
    ['El juego, en español y en inglés.', 'The game in English and Spanish.'],
    ['Pantalla de ajustes con calidad gráfica automática.', 'Settings screen with automatic graphics quality.']
  ], chg: [
    ['Menos enemigos en pantalla pero más fuertes.', 'Fewer but stronger enemies on screen.'],
    ['Gigadrenado pasa a ser Hierba Lazo (ya no cura).', 'Giga Drain becomes Grass Knot (no more healing).']
  ] },
  { d: '2026-10-08', title: ['Misiones, grietas y cooperativo', 'Missions, rifts and co-op'], new: [
    ['Misiones diarias y semanales, logros con medallas y títulos, y perfil público.',
     'Daily and weekly missions, achievements with medals and titles, and a public profile.'],
    ['Objetos equipables, evoluciones de movimientos y enemigos que curan, protegen, invocan o explotan.',
     'Held items, move evolutions and enemies that heal, shield, summon or explode.'],
    ['Grietas que llevan a 18 arenas legendarias, una por tipo, y clima que cambia la batalla.',
     'Rifts leading to 18 legendary arenas, one per type, and weather that changes the fight.'],
    ['Cooperativo con tu lista de amigos y ranking.', 'Co-op with your friends list and leaderboards.'],
    ['Mejoras para cada Pokémon, gacha tragaperras con tickets y tabla de tipos.',
     'Upgrades for each Pokémon, a slot-machine ticket gacha and a type chart.']
  ], chg: [
    ['Cámara más lejos y enemigos que rodean los obstáculos.', 'Camera further out and enemies that walk around obstacles.']
  ] },
  { d: '2026-10-07', title: ['Primera versión', 'First version'], new: [
    ['Primera versión pública de PokéSurvivor.', 'First public version of PokéSurvivor.']
  ] }
];
