# Plan: de asistente de narrador a juego online

## Decisiones tomadas
- **Transporte online:** solo PeerJS/WebRTC con **STUN**. Sin Firebase, sin TURN, sin modo LAN sin internet.
- **Arquitectura:** el móvil del **anfitrión es el servidor** (estrella). Cada jugador solo recibe su vista privada. Quien sea **narrador** tiene el panel de opciones.
- **Escenario objetivo:** todos juntos, cada uno con su 4G; y que también funcione si todos (o varios) comparten wifi, incluido un hotspot.
- **Referencia:** el modo online de la rama `impostor-online` de 1MP0ST0R (`js/transport-peer.js`): token de sesión, snapshot del anfitrión, lista blanca de mensajes, limitador.
- **Riesgo asumido:** con STUN solo, algunas redes móviles (NAT simétrico/CGNAT) no conectarán. Mitigación: diagnóstico en el lobby y modo híbrido (móvil compartido).

## Fases
| Fase | Contenido | Estado |
|---|---|---|
| 0 | Motor sin DOM (`js/engine.js`), datos (`js/data.js`), corrección de bugs y tests | ✅ |
| 1 | Motor de reglas completo (§11 del libro), pasos de la noche con acciones y votación con Insignia doble | ✅ |
| 2a | Spike de conectividad (anfitrión + 2-3 móviles: router, hotspot, 4G) | pendiente (necesita móviles reales) |
| 2b | Transporte PeerJS sin TURN (`js/transport-peer.js`), probado de extremo a extremo con navegadores | ✅ |
| 2c | Pantallas online: crear/unirse, lobby, QR, diagnóstico de red | ✅ |
| 3 | Híbrido: carta privada por móvil + narrador guiado + móvil compartido | ✅ |
| 4 | Remoto: acciones nocturnas por móvil, canal de lobos, fases con cronómetro | pendiente |
| 5 | Día online: votación, chat, interrupciones (Cazador, Heredera, Insignia) | pendiente |
| 6 | Robustez: snapshot completo del motor, reconexión a mitad de noche | pendiente |
| 7 | Puntuación §9, pruebas con móviles reales, accesibilidad, imágenes propias | pendiente |

## Fase 0: lo hecho
Bugs corregidos: narrador aleatorio contado como jugador; Borracho ganaba al morir de noche; la pena del Enamorado no encadenaba (Cazador, Modelo, Insignia);
ganador fijado antes de resolver cascadas y sin recalcularse; Ladrón «intercambio» no daba la carta robada; Ladrón externo podía dejar fuera al Narrador o al propio Ladrón;
la Insignia no tenía sucesor; inmune/preso no se limpiaban; la carta se reconstruía al voltearla; nombres sin escapar (XSS); tope de lobos mal calculado; «Zorro» → «Zorra».

## Fase 1: lo hecho
- `Engine.resolveNight` aplica el orden de la noche del libro (manada, Alfa, Niña, Rojo, Judas, Bruja, Vidente, Zorra, Policía, Inquisidor, Careto) y devuelve muertes, información privada y el anuncio de la mañana (sin explicar causas).
- Rata e infección, Jabalí por vecinos vivos, Niño Salvaje que gana al final, Inquisidor que gana con la aldea, Heredera, empate técnico (aviso), votación con Insignia doble, desempate, inmune/preso/Modelo.
- Modo guiado: cada paso pide sus objetivos, la noche se resuelve de una vez al «despertar» y la votación tiene su propio modal. 57 tests del motor + 3 recorridos de interfaz.
- El modo «Reparto» sigue siendo manual (marcas), con el modal de votación disponible.

## Simplificaciones de reglas (decididas donde el libro es ambiguo)
- «Izquierda» = índice creciente en la mesa; los muertos no cuentan como vecinos. En la fase 2 el orden de mesa será editable.
- La Niña descubierta muere en lugar de la víctima; si además el Alfa maldecía, la Niña muere y no se aplica la maldición (el poder del Alfa no se gasta).
- La Bruja puede curar a cualquier devorado de la noche (manada, Rojo o Judas), salvo la Bruja/Lobo devorada por el Judas.
- Un maldito por el Alfa no se anuncia: la aldea oye «Nadie ha muerto esta noche».
- Borracho Enamorado nunca gana por linchamiento (su pareja muere de pena).
- Ladrón que roba al Niño Salvaje (variante «intercambio») no pregunta Modelo.
- Careto que cambia su propia carta: el poder se da por gastado.

## Pendiente
Puntuación §9 (falta la tabla impresa del libro, que no se lee en el PDF), pasos «automáticos» para el modo «Reparto», revisión de derechos de las imágenes.

## Fase 2b: transporte
- `js/transport-peer.js` adaptado del de Impostor: solo STUN, sala = SHA-256(nombre+contraseña), identidad por token, snapshot del anfitrión, lista blanca de mensajes, limitador.
- Añadido: eventos efímeros a un jugador o a un grupo (chat de lobos…), snapshot del estado del juego (`guardarExtra/leerExtra`), tipo de conexión por jugador (`local` / `internet`), aviso `pausa` al cerrar el anfitrión.
- `npm run test:net` levanta un servidor de señalización local y 4 navegadores: contraseña incorrecta, nombre repetido, vistas privadas, acciones con remitente verdadero, recarga de jugador y de anfitrión, expulsar y cerrar.
- Dos fallos del transporte original de Impostor corregidos aquí: el rechazo por nombre repetido/sala llena/partida en curso llegaba como «conexión cerrada» (se cerraba antes de registrar el motivo), y el anfitrión tardaba ~30 s en notarse al recargar.

## Fases 2c y 3: modo online híbrido
- `js/online.js`: el anfitrión es el **narrador** (no juega); crea la sala por nombre + contraseña, los jugadores entran con su móvil. Lobby con estado de conexión (🟢/🔴, 📶 red local / 🌐 internet), expulsar, compartir enlace y QR (`js/qrcode.js`, MIT).
- El narrador usa el modo guiado de siempre; cada cambio (muertes, noche, día, Insignia, conversiones…) se difunde: estado público (vivos/muertos, noche/día, ganador) + vista privada por jugador (sus cartas, si es Lobo y su manada, su pareja, su Modelo). El estado público no incluye las cartas de los vivos.
- El narrador guarda la partida en cada cambio: si recarga la página, **recupera la partida** y los jugadores se reconectan solos.
- Un jugador que recarga vuelve a su sala con su identidad (token) y recupera su vista.
- Al terminar, el narrador puede **volver al lobby** con los mismos jugadores o cerrar la sala.
- `npm run test:online`: narrador + 5 jugadores en navegadores reales.
- Pendiente de esta fase: móvil compartido (varios jugadores en un móvil). Las acciones nocturnas que hoy se dicen en voz alta (Ladrón, Cupido, Niño Salvaje, pulgares) pasan a los móviles en la fase 4.

## PWA
- `manifest.webmanifest` + iconos (`icons/`, media luna sobre el pueblo; 192, 512, maskable y Apple) + `sw.js`: la app se instala en pantalla de inicio (Android/Chrome: botón «📲 Instalar la app»; iPhone: Compartir → Añadir a pantalla de inicio, con aviso en la app).
- El modo local funciona **sin conexión** una vez abierta con internet. El online siempre usa la red (nunca se cachea PeerJS).
- Estrategia de caché: se sirve lo guardado y se actualiza en segundo plano; la versión nueva se ve a la siguiente apertura (aviso en pantalla). **Al cambiar archivos de la app, sube `VERSION` en `sw.js`** y añade a `ARCHIVOS` cualquier archivo nuevo.
- Durante una partida online se pide que la pantalla no se apague (Wake Lock).
- `npm run test:pwa`.

## Resultado de la primera prueba con móviles reales
- **Misma red (wifi, también compartido): funciona bien.**
- **Anfitrión en wifi y jugador con 4G: no conecta.** Es el límite esperado de usar solo STUN: el NAT del operador móvil (CGNAT) no permite la conexión directa. Lo único que lo arregla de verdad es un servidor de relé (TURN).
- Hecho: el mensaje de error aconseja usar el mismo wifi; el transporte acepta TURN **opcional y vacío por defecto** (`localStorage 'pueblo.peer.turn'` o `globalThis.PUEBLO_TURN`, lista `[{urls:'turn:…',username,credential}]`; basta con que lo use uno de los dos extremos).
- Decisión pendiente: añadir o no un TURN. Por ahora la regla es: **todos en la misma red** (wifi o hotspot del narrador).

## Cambios tras esa prueba
- **Opciones de partida en un desplegable dentro del lobby** (lobos, cartas, modo, Niña a distancia), con resumen en la cabecera. Ya no se abre otra pantalla. El número de jugadores y los nombres salen de la sala.
- **Móvil compartido** (copiado del modo online de Impostor): el narrador puede añadir hasta 2 invitados por móvil (👥 +1), renombrar, quitar y **ordenar la mesa** (▲▼; el orden importa para vecinos del Jabalí/Zorra y la izquierda de la Rata). Cada móvil alterna sus cartas con «Pasar el móvil a …»; la información privada (lobo, pareja, Modelo) solo se ve con la carta destapada. Solo en el modo híbrido (cartas), no en el de acciones individuales de la fase 4.
- **Niña a distancia** (opcional, **desactivada por defecto**; el juego está pensado para jugar en una sala, donde la Niña abre los ojos de verdad): solo en online + modo guiado y solo durante el paso «La manada». La Niña espía desde su móvil, ve a un lobo al azar y tiene 1/3 de probabilidad de ser descubierta (entonces muere en lugar de la víctima). Una vez por noche. Es la primera acción de jugador → narrador (mensaje `accion` con el remitente verificado).
