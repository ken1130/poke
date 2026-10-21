/* ============ changelog.js — novedades del juego ============
 * Lo que ve la gente en el botón "Novedades" de la barra de arriba: cambios
 * de juego y fallos arreglados (nada de servidores ni bases de datos).
 * La fecha más nueva, arriba. En cada fecha, por apartados:
 *   new  lo nuevo · chg  cambios y ajustes · fix  fallos arreglados
 * Cada línea en español y en inglés.
 */
G.CHANGELOG = [
  { d: '2026-10-21', title: ['Arreglos del grupo y del móvil', 'Co-op and phone fixes'], new: [
    ["Zona de fiesta: nuevo rincón «Balón prisionero», 3 contra 3 (las CPU completan) y al mejor de 3 rondas de 60 s. Lanza la pelota (F o el botón) al otro campo: si alcanza a uno, cae a la banda de detrás (desde allí puede recoger las pelotas que lleguen y lanzarlas). Pulsa lanzar/plancha justo cuando te llegue para atraparla: cae quien la lanzó y vuelve uno de los tuyos. También desde la sala (Fiesta → Balón prisionero).", "Party Plaza: new “Dodgeball” corner, 3 vs 3 (CPUs fill in), best of 3 rounds of 60 s. Throw the ball (F or the button) at the other side: whoever it hits goes to the back strip (from there they can pick up balls that roll in and throw them back). Press throw/dive right as it reaches you to catch it: the thrower is out and one of yours comes back. Also from the room (Party → Dodgeball)."]
  ], fix: [
    ["Zona de fiesta: la tira de arriba (pista, marcador, «Dejar el partido») tapaba la barra de vida y el reloj en el móvil, y la línea de debajo del reloj en el ordenador. Ahora va más abajo.", "Party Plaza: the top strip (court, score, “Leave match”) covered the HP bar and clock on phones, and the line under the clock on desktop. It now sits lower."],
    ["Proteger a Dazhuang: el botón «Empezar la oleada ya» tapaba el aviso grande y a Dazhuang. Ahora está abajo, encima de los movimientos.", "Guard Dazhuang: the “Start the wave now” button covered the big notice and Dazhuang. It is now at the bottom, above the moves."],
    ["Si el guardado se quedaba sin compañero elegido, al volver al menú se rompía la pantalla; ahora se elige el primero que tengas.", "If the save ended up with no partner selected, returning to the menu broke the screen; it now picks the first one you own."],
    ["En grupo, el grito del Héroe de un compañero hacía parpadear en blanco y temblar la pantalla de todos, con el sonido de jefe: ahora sólo el tuyo.", "In co-op, a teammate's Hero scream flashed and shook everyone's screen with the boss sound: now only your own does."],
    ["En grupo, los avisos de Arceus (Sentencia, Juicio de las 18 tablas, escudo roto) les llegaban dos veces a los compañeros.", "In co-op, Arceus's announcements (Judgment, Judgment of the 18 Plates, shield broken) reached teammates twice."],
    ["En grupo, al teletransportarse Arceus los compañeros lo veían deslizarse hasta el sitio, sin el estallido ni el aro: ahora aparece de golpe, con sus efectos.", "In co-op, when Arceus teleported, teammates saw it slide to the spot without the burst or ring: now it appears instantly, with its effects."],
    ["Arceus podía empezar a cargar un ataque con un teletransporte ya avisado: el círculo blanco explotaba pero él no llegaba. Ahora primero se completa el teletransporte.", "Arceus could start charging an attack with a teleport already marked: the white circle went off but it never arrived. The teleport now completes first."],
    ["Los dos jefes menores de Arceus podían salir Dinamax y sus maldiciones se saltaban el tope de dos a la vez (podías llevar tres). Ya no se Dinamaxean, y las maldiciones de cualquier jefe Dinamax respetan el tope.", "Arceus's two lesser bosses could spawn Dynamaxed and their curses bypassed the two-at-once cap (you could have three). They no longer Dynamax, and any Dynamax boss's curses respect the cap."],
    ["En grupo, los avisos que el anfitrión monta con un nombre (\"¡X salvaje apareció!\", \"¡Un X shiny anda cerca!\"…) les llegaban en español a los compañeros: ahora cada uno los ve en su idioma. Y en inglés, algún aviso traducido dos veces salía raro (\"Kecleon’s thanks has opened…\").", "In co-op, announcements the host builds with a name (\"A wild X appeared!\", \"A shiny X is nearby!\"…) reached teammates in Spanish: everyone now sees them in their own language. And in English, some announcements translated twice came out garbled (\"Kecleon’s thanks has opened…\")."],
    ["Tienda y salas misteriosas en grupo: el aviso «Quédate en la puerta» se repetía cada vez que alguien rozaba la puerta; ahora una vez por sala.", "Shop and mystery rooms in co-op: the “Stay at the door” notice repeated every time someone brushed the door; now once per room."],
  ] },
  { d: '2026-10-20', title: ['Proteger a Dazhuang: monedas de cada uno', 'Guard Dazhuang: your own coins'], chg: [
    ["Pelos de Punta (Héroe) rediseñado: una barra de miedo bajo sus pies se llena más deprisa cuantos más enemigos tenga cerca; mientras, ondas pequeñas (más alcance y ya no apartan tanto a los enemigos); con la barra llena, un GRITO enorme que pega mucho, deja a los enemigos paralizados de miedo y le hace invulnerable un momento (evolucionado: dos gritos).", "Hair-Raiser (Hero) redesigned: a fear bar under his feet fills faster the more enemies are nearby; meanwhile, small shockwaves (longer reach, no longer push enemies out of range); when full, a huge SCREAM that hits hard, freezes enemies in fear and makes him briefly invulnerable (evolved: two screams)."],
    ["Personajes originales más fuertes (no evolucionan, así que ahora tienen stats de evolucionado): Ataque ×1,24-1,30 (antes ×1,04-1,12) y algo más de vida. Movimientos exclusivos: Pregunta Curiosa pega más (sobre todo evolucionada, contra jefes); Boniato Rodante manda cada bola a un enemigo distinto y contra uno solo aciertan todas (evolucionado, la descarga salta a los 3 más cercanos); Pelos de Punta pega más aunque haya pocos enemigos; Turbo Fantasma, si nadie toca a la abuela, va y vuelve hasta un enemigo cercano y le deja una sombra (más floja); Lengüetazo Látigo evolucionado: las lenguas que no tienen blanco propio barren a los lados.", "Original characters are stronger (they do not evolve, so they now get evolved-level stats): Attack ×1.24–1.30 (was ×1.04–1.12) and a bit more HP. Exclusive moves: Curious Question hits harder (especially evolved, against bosses); Rolling Sweet Potato sends each ball at a different enemy and all of them hit a lone target (evolved, the zap jumps to the 3 nearest); Hair-Raiser hits harder even with few enemies around; Ghost Turbo: if nobody is touching Granny, she zips to a nearby enemy and back and leaves a (weaker) afterimage on it; evolved Tongue Lash: tongues without a target of their own sweep to the sides."],
    ["Jefes Dinamax: si ya tenían más vida por lo fuerte que sois, ya no se les dobla encima (aguantan ~30 s de vuestro daño en vez de ~40). Con un equipo flojo, igual que antes (×2).", "Dynamax bosses: if they already had extra HP because your team is strong, it is no longer doubled on top (they last ~30 s of your damage instead of ~40). For weaker teams, same as before (×2)."],
    ["Arceus, Señor del Laberinto, más duro: Sentencia más grande y algo más rápida, Castigo en cadena de 5 tandas; desde el 66 % se teletransporta junto a un jugador (aviso en el suelo); enfurecido lanza las dos a la vez y el «Juicio de las 18 tablas» (pilares de luz de los 18 tipos); sus maldiciones llegan a todo el mapa y, enfurecido, de dos en dos. Su vida base no cambia, pero aguanta al menos ~55 s del daño de vuestro equipo: a quien lo arrasa todo ya no se le cae en 20 s.", "Arceus, Lord of the Labyrinth, is tougher: bigger, slightly faster Judgment, 5-wave Chain Punishment; from 66% it teleports next to a player (marked on the ground); enraged it uses both at once plus “Judgment of the 18 Plates” (light pillars of all 18 types); its curses reach the whole map and, enraged, come in pairs. Base HP is unchanged, but it lasts at least ~55 s of your team’s damage, so very strong teams no longer melt it in 20 s."],
    ["Jefes y élite según lo fuerte que seáis: los jefes aguantan al menos ~20 s de vuestro daño y los élite ~1,5 s (con un equipo flojo no cambia nada). Desde el minuto 15 hay más élite (5 %, antes 3 %) y desde el minuto 10 los enemigos pegan algo más (+15 % hacia el minuto 20).", "Bosses and elites scale with how strong you are: bosses last at least ~20 s of your damage and elites ~1.5 s (no change for weaker teams). From minute 15 there are more elites (5%, was 3%) and from minute 10 enemies hit a bit harder (+15% around minute 20)."],
    ["Patata caliente: la CPU con la bomba ya no se pega a quien se la acaba de pasar (va a por otro o espera a un paso), corre menos (como un Pokémon normal) y se la puedes devolver antes (1 s, antes 1,5).", "Hot Potato: a CPU holding the bomb no longer sticks to whoever just passed it (it goes for someone else or waits a step away), runs slower (like a normal Pokémon), and you can pass it back sooner (1 s, was 1.5)."],
    ['Los enemigos también tienen Defensa y Defensa Esp.: los movimientos físicos dependen de su Defensa y los especiales de su Defensa Esp. (Steelix teme los especiales, Alakazam los físicos), así que llevar de los dos ayuda. De media no cambia nada y los muñecos de entrenamiento no se ven afectados.', 'Enemies now have Defense and Sp. Def too: physical moves depend on their Defense and special ones on their Sp. Def (Steelix fears special moves, Alakazam physical ones), so carrying both helps. On average nothing changes and training dummies are unaffected.'],
    ['Patata caliente: arena más grande con 4 rocas (no se pasan y la bomba rebota) y 2 aceleradores; al lanzar se apunta sola al más cercano de delante y lo persigue un poco; en los 3 últimos segundos, aro rojo, cuenta atrás grande y un pitido por segundo.', 'Hot Potato: bigger arena with 4 rocks (they block and the bomb bounces) and 2 speed pads; throws aim at the nearest player ahead and curve toward them; in the last 3 seconds, a red ring, a big countdown and a beep each second.'],
    ['Tenis y voleibol: devolver la pelota funciona mejor (ya no pasa de largo si va rápida, algo más de alcance y de altura, y un poco más para los invitados) y se marca dónde va a caer cuando viene a tu campo.', 'Tennis and volleyball: returns work better (fast balls no longer slip past, a bit more reach and height, a bit more for guests) and the landing spot is marked when the ball comes to you.'],
    ['Ataque Esp., Defensa y Defensa Esp.: la Pokédex enseña los seis stats y el tipo de ataque que domina cada uno. Los movimientos son físicos o especiales (se ve en las cartas de nivel y en la información del movimiento, con ★ si es el tuyo): el físico usa el Ataque y el especial el Ataque Esp.; el lado fuerte pega como antes y el otro menos. Los golpes de contacto usan la Defensa y los disparos y rayos la Defensa Esp. Objetos, pociones y mejoras siguen valiendo (el «+ataque» cuenta para los dos). Los personajes originales también tienen los suyos.', 'Sp. Atk, Defense and Sp. Def: the dex shows all six stats and the attack class each one is best at. Moves are physical or special (shown on level-up cards and move info, with a ★ if it is yours): physical uses Attack and special Sp. Atk; your strong side hits as before and the other less. Contact hits use Defense, shots and beams Sp. Def. Items, potions and upgrades still apply (attack boosts count for both). Original characters have theirs too.'],
    ['Proteger a Dazhuang: cada uno tiene sus monedas de la tienda (100 al empezar, la misma paga de oleada para todos y cada derrota para quien la remata); pagas con las tuyas y, si otro lo compra antes, te las devuelven. Lo que sobra cuenta al acabar.', 'Guard Dazhuang: everyone has their own shop coins (100 at the start, the same wave reward for all and each kill for whoever finishes it); you pay with yours and get refunded if someone buys it first. Leftovers count at the end.'],
    ['Proteger a Dazhuang: los precios ya no suben con las oleadas ni con lo que compres (mejoras 200/220/200, ayudante 260).', 'Guard Dazhuang: prices no longer rise with waves or with what you buy (upgrades 200/220/200, helper 260).'],
    ['Los movimientos exclusivos de los personajes originales se ven mucho mejor (píxel, más grandes y más claros; el evolucionado, más todavía): interrogaciones que vuelan y un bocadillo de «pensando» (Panda), bolas de boniato doradas con chispas (Pollito), puño que estalla en espuma (Didi), pelos de punta, «¡¡!!» y onda de medias lunas (Héroe), sombras violetas con fuegos fantasma (Turbo Abuela), arañazos en X (Tom), lengua gruesa que babea veneno (Lika) y sartén que cae con «¡PAM!» y estrellas de aturdido (Jerry).', 'The original characters\' exclusive moves look much better (pixel art, bigger and clearer; the evolved versions even more): flying question marks and a “thinking” bubble (Panda), golden sweet-potato balls with sparks (Pollito), a punch that bursts into foam (Didi), hair on end, a “!!” and a crescent shockwave (Hero), violet afterimages with ghost flames (Turbo Granny), X-shaped claw marks (Tom), a thick tongue dripping poison (Lika) and a pan that drops with a “POW” and stun stars (Jerry).'],
  ], fix: [
    ["El veneno quitaba un porcentaje de la vida máxima sin límite: a un jefe con mucha vida (la que sale de lo fuerte que sois) le hacía decenas de miles por segundo, y Lengüetazo Látigo marcaba 15 000/s en el entrenamiento. Ahora, a jefes y muñecos, el veneno tiene un tope que sube con tu nivel (a los enemigos normales, igual que antes); Lengüetazo Látigo pone menos acumulaciones por golpe. Los charcos de lava, veneno y chispas también hacen a los jefes sólo la cuarta parte.", "Poison took a percentage of max HP with no limit: against a boss with lots of HP (scaled to how strong you are) it dealt tens of thousands per second, and Tongue Lash showed 15,000/s in training. Now poison on bosses and dummies has a cap that grows with your level (normal enemies unchanged), and Tongue Lash applies fewer stacks per hit. Lava, poison and spark pools also deal only a quarter to bosses."],
    ["Turbo Fantasma sin evolucionar casi no hacía daño si los enemigos no tocaban a la abuela (jefes a distancia, muñecos de entrenamiento).", "Unevolved Ghost Turbo did almost no damage unless enemies touched Granny (ranged bosses, training dummies)."],
    ["Tienda de Kecleon y salas misteriosas: al tocar una flecha nada más entrar ya no te saca (y la sala ya no se pierde). Entras un poco más lejos de la puerta y para salir hay que quedarse un momento en ella (o pulsar «Salir»).", "Kecleon's shop and mystery rooms: tapping an arrow right after entering no longer throws you out (and the room is no longer lost). You now enter a bit further from the door, and to leave you must stay at it for a moment (or press “Leave”)."],
    ["Los curanderos curaban a los jefes el mismo porcentaje de vida que a cualquiera: devolvían a Arceus del 60 % al 100 % en 20 s. Ahora a los jefes sólo la cuarta parte.", "Healers healed bosses by the same percentage as anyone else, taking Arceus from 60% back to 100% in 20 s. Bosses now get a quarter of it."],
    ["El botón «Elegir solo» encendido (verde) y la pestaña elegida de la tienda se veían borrosos: letra oscura con sombra oscura.", "The “Auto pick” button when on (green) and the selected shop tab looked blurry: dark text with a dark shadow."],
    ['Al volver al menú después de una partida ya no se quedan la vida, las monedas, los movimientos ni los retos de la partida en la esquina.', 'Back on the menu after a run, the HP bar, coins, moves and run goals no longer stay in the corner.'],
  ] },
  { d: '2026-10-19', title: ['Jefes Dinamax y habilidades Mega', 'Dynamax bosses and Mega abilities'], new: [
    ['El Dinamax pasa a ser cosa de los jefes (tú tienes la Megaevolución): pueden salir jefes Dinamax en la partida normal y en la torre sin fin, en Proteger a Dazhuang desde la oleada 10 y uno de cada 3 legendarios en el Desafío legendario. Son más grandes, con ×2 de vida y nubes rojas, y cada 6-8 s te lanzan su «Maxi» (antes sale un círculo rojo de aviso: apártate). 32 Pokémon como Charizard, Pikachu o Snorlax usan su movimiento Gigamax propio; te pueden dejar el suelo ardiendo, frenarte, bajarte el ataque o impedir que te cures. En Proteger a Dazhuang también apuntan a Dazhuang si está más cerca que tú.', 'Dynamax is now a boss thing (you have Mega Evolution): Dynamax bosses can appear in normal runs and the endless tower, in Guard Dazhuang from wave 10, and every 3rd legendary in the Legend Rush. They are bigger, with ×2 HP and red clouds, and every 6-8 s fire their Max Move at you (a red warning circle appears first: move away). 32 Pokémon such as Charizard, Pikachu or Snorlax use their own G-Max Move; it can leave burning ground, slow you, lower your attack or stop your healing. In Guard Dazhuang they also aim at Dazhuang when he is closer than you.'],
    ['La Megaevolución trae una habilidad Mega (Garra Dura, Adaptable, Sombra Trampa, Amor Filial, Chorro Arena, Impulso, Sequía, Piel Feérica...) y despierta tu movimiento inicial: +30% de daño y 15% menos de recarga, con borde arcoíris.', 'Mega Evolution brings a Mega ability (Tough Claws, Adaptability, Shadow Tag, Parental Bond, Sand Stream, Speed Boost, Drought, Pixilate...) and awakens your starting move: +30% damage and 15% less recharge, with a rainbow frame.'],
  ], chg: [
    ['Tenis y voleibol: tu equipo es la mitad de la pista donde estés al empezar (la cuenta atrás enseña las dos mitades) y se puede cambiar la dificultad de las CPU (Fácil, Normal, Difícil).', 'Tennis and volleyball: your team is the half of the court you stand in at the start (the countdown shows both halves), and CPU difficulty can be changed (Easy, Normal, Hard).'],
    ['Tenis y voleibol: si alguien se va a mitad, una CPU ocupa su sitio y el partido sigue; al acabar, «Otra partida» repite con los mismos y los mismos equipos.', 'Tennis and volleyball: if someone leaves mid-match a CPU takes their place and play goes on; afterwards, Play again repeats with the same players and teams.'],
    ['Plancha: los demás te ven tirarte, y es un poco más corta.', 'Dive: others now see you dive, and it is a bit shorter.'],
    ['Quitado «Tenis Pokémon · próximamente» de la lista de la sala: el tenis está en la zona de fiesta.', 'Removed "Pokémon Tennis · coming soon" from the room list: tennis is in the Party Plaza.'],
    ['Zona de fiesta: en grupo, al pulsar empezar hay 5 s para juntarse (cuenta atrás en la pista, «Empezar ya» o «Cancelar»); juega todo el que entre y las CPU sólo completan. Solo, empieza al momento.', 'Party Plaza: in a group, pressing start gives 5 s to gather (countdown on the court, Start now or Cancel); everyone who walks in plays and CPUs only fill the gaps. Solo, it starts at once.'],
    ['Tenis y voleibol: quien entra en la pista a mitad de partido ocupa el sitio de una CPU en el siguiente saque (sigue el marcador).', 'Tennis and volleyball: whoever walks onto the court mid-match takes a CPU spot at the next serve (score kept).'],
    ['Tenis y voleibol: plancha con espacio (en el móvil, el botón azul «Plancha»): te lanzas hacia donde vas para salvar la pelota; luego 0,45 s en el suelo y 1,5 s de espera.', 'Tennis and volleyball: dive with Space (the blue Dive button on phones) toward where you move to save the ball; then 0.45 s on the ground and a 1.5 s recharge.'],
    ['Mejoras → Veto: ahora se pueden vetar hasta 8 movimientos por Pokémon (antes 3). Los niveles nuevos cuestan menos de lo que habrían costado: de 300 a 5130 Pokémonedas.', 'Upgrades → Ban: you can now ban up to 8 moves per Pokémon (was 3). The new levels cost less than they would have: from 300 to 5,130 coins.'],
    ['Los disparos sueltos (Ascuas, Pistola Agua, Residuos, Lanzarrocas, Bola Sombra...) curvan un poco hacia el enemigo y fallan menos; Ascuas va más rápida.', 'Single shots (Ember, Water Gun, Sludge, Rock Throw, Shadow Ball...) curve slightly toward enemies and miss less; Ember is faster.'],
    ['Patata caliente: la bomba explota entre 8 y 15 s (antes 5-10 s, muy poco).', 'Hot Potato: the bomb blows up after 8–15 s (was 5–10 s, too short).'],
  ], fix: [
    ['Voltorb travieso 2 contra 2: el Berrinche ya no cae en tu compañero (con un rival fuera le tocaba a él, y se acumulaba): va al siguiente rival. Y el Voltorb metido por tiempo ya no va donde lo robaría tu compañero.', 'Naughty Voltorb 2 vs 2: Thrash no longer hits your teammate (with an opponent out it fell on them and stacked): it goes to the next opponent. A Voltorb put back on timeout no longer goes where your teammate would draw it.'],
    ['Cartas de tipos y Voltorb travieso 2 contra 2: la mano del compañero, más grande (×0,5 → ×0,8; en el móvil ×0,34 → ×0,8).', 'Type Cards and Naughty Voltorb 2 vs 2: your teammate\'s hand is bigger (×0.5 → ×0.8; ×0.34 → ×0.8 on phones).'],
    ['Si tu compañero era un personaje original (pestaña «Otros» del Pokédex: Panda, Pollito, Didi, Tom...), al recargar la página o sincronizar con la nube volvía a ser el Pokémon de antes. Ahora se queda.', 'If your partner was an original character (the Pokédex\'s "Others" tab: Panda, Chick, Didi, Tom...), reloading the page or syncing with the cloud switched it back to your previous Pokémon. It now stays.'],
    ['Los movimientos que disparan (Ascuas, Pistola Agua, Impactrueno, Residuos...) no recibían la habilidad Mega ni el movimiento despertado.', 'Projectile moves (Ember, Water Gun, Thunder Shock, Sludge...) did not get the Mega ability or the awakened move.'],
    ['Sala de entrenamiento: Dominio del Viento no hacía daño a los muñecos (no se pueden atrapar); ahora los que están dentro del muro reciben un enemigo lanzado en cada lanzamiento.', 'Training room: Wind Domain did no damage to dummies (they cannot be grabbed); dummies inside the wall now take a thrown enemy on every cast.'],
  ] },
  { d: '2026-10-19', title: ['Formas regionales y Megaevolución', 'Regional forms and Mega Evolution'], new: [
    ['56 formas regionales (Alola, Galar, Hisui y Paldea, junto a su especie en la Pokédex) y 5 Pokémon nuevos (Jellicent, Sirfetch\'d, Copperajah, Toedscool y Pecharunt), también en el gacha. El logro de todos los Pokémon sigue contando los 966 de antes.', '56 regional forms (Alola, Galar, Hisui and Paldea, next to their species in the Pokédex) and 5 new Pokémon (Jellicent, Sirfetch\'d, Copperajah, Toedscool and Pecharunt), also in the gacha. The every-Pokémon achievement still counts the original 966.'],
    ['Las evoluciones con varias ramas abren una ventana para elegir (formas regionales incluidas), con los tipos y los cambios de PS, ataque y velocidad.', 'Branching evolutions open a window to choose (regional forms included), showing types and HP, attack and speed changes.'],
    ['Megaevolución en partida: 39 megas con animación completa desde el Nv. 35 (se puede dejar para luego con M, el botón arcoíris o la pausa); PS y ataque ×1,3 y velocidad ×1,1 hasta el final de la partida.', 'In-run Mega Evolution: 39 fully animated Megas from Lv. 35 (you can leave it for later with M, the rainbow button or the pause menu); HP and attack ×1.3 and speed ×1.1 for the rest of the run.'],
  ], fix: [
    ['Pokédex: con un tipo elegido o una búsqueda, pulsar otra región no hacía nada; ahora quita el tipo y la búsqueda y enseña esa región.', 'Pokédex: with a type picked or a search, tapping another region did nothing; it now clears the type and search and shows that region.'],
    ['Dominio del Viento atrapa a todos los que están dentro del muro (antes sólo en el borde, y los rápidos lo cruzaban) y los atrapados ya no tiemblan.', 'Wind Domain grabs everyone inside the wall (before only at the edge, so fast enemies slipped through) and grabbed enemies no longer jitter.'],
    ['Puño de Piedra: el puño se hunde nada más pegar y el Pokémon sube más alto, así se ve cómo sale volando.', 'Rock Fist: the fist sinks right after hitting and the Pokémon flies higher, so you can see it launch.'],
  ] },
  { d: '2026-10-19', title: ['Sala de entrenamiento y Puño de Piedra', 'Training room and Rock Fist'], chg: [
    ['El Puño de Piedra ahora es un puño cerrado (cuatro nudillos y el pulgar) que sale de un montón de piedras, en vez de una columna alta y fina.', 'Rock Fist now looks like a clenched fist (four knuckles and a thumb) rising from a pile of rubble instead of a tall thin pillar.'],
  ], fix: [
    ['Sala de entrenamiento: los muñecos Pikachu congelados por Agonía de Escarcha (o confundidos) ya no se quedan para siempre en el hielo, y Dominio del Viento ya no los atrapa.', 'Training room: Pikachu dummies frozen by Frost Agony (or confused) no longer stay stuck in the ice forever, and Wind Domain no longer grabs them.'],
  ] },
  { d: '2026-10-17', title: ['Modo fiesta: 2 contra 2', 'Party mode: 2 vs 2'], new: [
    ['Cartas de tipos y Voltorb travieso se pueden jugar 2 contra 2 (con 4 jugadores en la mesa, CPU incluidas): el anfitrión elige «2 contra 2» en la sala y puede rehacer los equipos. El compañero se sienta enfrente y los equipos se turnan. En Cartas de tipos, si uno de los dos se queda sin cartas gana el equipo (los dos se llevan los puntos) y no puedes pillar a tu compañero; en Voltorb travieso, el equipo cae cuando explotan los dos. Colores de equipo, «Compañero» y final de ronda por equipos.',
     'Type Cards and Naughty Voltorb can be played 2 vs 2 (4 seats at the table, CPUs included): the host picks "2 vs 2" in the room and can reshuffle teams. Your partner sits opposite and teams alternate turns. In Type Cards, when either partner empties their hand the team wins (both get the points) and you can\'t catch your partner; in Naughty Voltorb, a team is out when both have exploded. Team colours, a "Partner" tag and team results.']
  ] },
  { d: '2026-10-17', title: ['Modo fiesta: ajustes', 'Party mode: tweaks'], chg: [
    ['La CPU tarda un poco más en jugar (1,4-2,2 s) para que dé tiempo a ver qué ha echado cada una.', 'CPUs take a bit longer to play (1.4-2.2 s) so you can see what each one played.'],
    ['Voltorb travieso: con 2 jugadores el mazo es más corto (28 cartas de acción) y, si vas a dar tu única Goma aislante con Carantoña, se te avisa antes.', 'Naughty Voltorb: with 2 players the deck is shorter (28 action cards), and you get a warning before giving away your only Insulating Rubber.']
  ], fix: [
    ['Tu reloj del turno ya no vuelve a 30 s cuando otro jugador avisa, pilla o anula una carta.', 'Your turn timer no longer resets to 30 s when another player calls, catches or cancels a card.'],
    ['Voltorb travieso: en móviles muy bajos la barra de Detección ya no tapa el mazo; en chino ya no salen espacios de más alrededor de «你».', 'Naughty Voltorb: on very short phones the See Through bar no longer covers the deck; no extra spaces around «你» in Chinese.']
  ] },
  { d: '2026-10-17', title: ['Modo fiesta: Voltorb travieso', 'Party mode: Naughty Voltorb'], new: [
    ['Nuevo juego de fiesta: Voltorb travieso. Echa cartas de acción y termina robando; si robas un Voltorb sin Goma aislante, ¡explotas y quedas fuera! Con la Goma lo desactivas y lo vuelves a meter en secreto donde quieras. Cartas: Alboroto (el siguiente juega 2 turnos), Siesta, Teletransporte (barajar), Premonición (ver las 3 de arriba), Carantoña (te dan una carta), Calar (anula una acción en 3 s, también la de otro Calar) y parejas de Pokémon para robar. Gana el último que quede. Con CPU, juego automático, 30 s por turno y reconexión.',
     'New party game: Naughty Voltorb. Play action cards and end your turn by drawing; draw a Voltorb without an Insulating Rubber and you blow up and are out! With the Rubber you defuse it and secretly put it back wherever you like. Cards: Rampage (next player takes 2 turns), Nap, Teleport (shuffle), Premonition (peek the top 3), Charm (they give you a card), See Through (cancel an action within 3 s, even another See Through) and Pokémon pairs to steal. Last one standing wins. With CPUs, auto-play, 30 s turns and reconnection.']
  ] },
  { d: '2026-10-17', title: ['Modo fiesta: Cartas de tipos', 'Party mode: Type Cards'], new: [
    ['Nuevo juego de fiesta: Cartas de tipos (108 cartas de fuego, agua, planta y eléctrico; Polvo sueño, Ida y vuelta, Doble ataque +2, Ditto y Poder de Mewtwo +4). Echa una carta del mismo tipo o número; el primero que se queda sin cartas gana los puntos de los demás. Pulsa «¡Última carta!» al quedarte con una (se oye una voz); si no lo haces, los demás pueden pillarte y robas 2. Con CPU, pista, juego automático, 30 s por turno y reconexión.',
     'New party game: Type Cards (108 fire, water, grass and electric cards; Sleep Powder, U-turn, Double Hit +2, Ditto and Mewtwo Power +4). Play a card of the same type or number; the first to empty their hand wins the others\' points. Press "Last card!" when you have one left (a voice calls it out); if you don\'t, others can catch you and you draw 2. With CPUs, hints, auto-play, 30 s turns and reconnection.']
  ] },
  { d: '2026-10-17', title: ['Modo fiesta: Big Two', 'Party mode: Big Two'], new: [
    ['Big Two con mesa nueva, como los juegos de cartas del móvil: cuadros grandes con cada Pokémon y su nombre, el tiempo como un aro, abanicos de cartas boca abajo, cartas y letras más grandes, botones redondos; lo que puedes echar se ilumina y la pista sube las cartas en tu mano. 30 s por turno, «Juego automático» (la CPU juega por ti hasta que lo quites) y un final de ronda con cartel, puntos y podio. Los Pokémon van impresos en la carta (se ven aunque se solapen) y los 7 fondos son nuevos: una mesa ovalada con su borde en cada sala. Las cartas de la mesa ya no vuelven a saltar cuando alguien pasa.',
     'Big Two gets a new table in the style of mobile card games: big portraits with each Pokémon and name, the timer as a ring, fans of face-down cards, bigger cards and text, round buttons; playable cards light up and the hint raises the cards in your hand. 30 s per turn, Auto-play (the CPU plays for you until you turn it off) and an end-of-round banner with points and podium. Pokémon are printed on the card (visible even when overlapped) and all 7 backgrounds are new: an oval table with its rim in each room. Cards on the table no longer jump again when someone passes.'],
    ['Big Two: 60 s por turno; la pista enseña todas las jugadas posibles por tipo (tocas una y se elige); las cartas de los rivales se ven boca abajo; y puedes elegir el fondo de la mesa.',
     'Big Two: 60 s per turn; the hint shows every possible play by type (tap one to pick it); rivals\' cards are shown face down; and you can choose the table background.'],
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
