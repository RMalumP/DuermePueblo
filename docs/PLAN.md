# La aldea se duerme: estado del proyecto

App web (PWA) para jugar a *La aldea se duerme* (El pueblo duerme): asistente de narrador para jugar en la sala y modo online por WebRTC. Un solo HTML estático, sin backend.

## Estado por fases
| Fase | Contenido | Estado |
|---|---|---|
| 0 | Motor de reglas sin DOM, corrección de errores | ✅ |
| 1 | Reglas completas (§11 del libro), modo guiado, votación con Insignia doble | ✅ |
| 2 | Transporte PeerJS solo STUN, lobby, QR, diagnóstico de red | ✅ |
| 3 | Híbrido: carta privada por móvil, narrador guiado, móvil compartido | ✅ |
| 4 | Acciones de la noche desde los móviles. **Narrador humano (por defecto)** y **narrador automático** | ✅ |
| 5 | Día en los móviles: votación, Cazador, Heredera, Insignia, chat | ✅ |
| 6 | Robustez: reconexión a mitad de noche, pausa, jugadores sin conexión | ✅ |
| 7 | Puntuación del libro (§9) y marcador, accesibilidad, PWA y persistencia | ✅ |
| — | Imágenes propias o con permiso | pendiente |
| — | Servidor TURN (wifi ↔ 4G) | ✅ conectado al Worker de Impostor; falta probarlo con móviles reales |

## Cómo se juega
- **En la sala (lo habitual):** el narrador usa «Jugar online» → crea sala; cada jugador entra con su móvil y ve solo su carta; el narrador dirige de palabra con el modo guiado. El móvil se puede compartir entre hasta 3 personas.
- **A distancia con narrador humano:** activa «📱 Acciones desde los móviles». Cada jugador responde en su móvil (Vidente, Bruja, lobos, Policía…) y vota de día; el narrador ve quién ha respondido, puede corregir y salta pasos. No se comparte móvil.
- **Narrador automático:** activa «🤖 Narrador automático». El anfitrión juega como uno más; la app lleva sola noche, debate, votación y desempates con temporizadores configurables. El anfitrión tiene un menú ⚙️ (pausar, saltar, terminar).
- **Niña a distancia** (desactivada por defecto): la Niña espía desde el móvil, ve a un lobo al azar y tiene 1/3 de riesgo de ser descubierta.
- Todos los jugadores en la **misma red** (wifi o hotspot del narrador) o cada uno con datos si la operadora lo permite: ver «Conectividad».

## Estructura
```
index.html                 interfaz y paneles
js/data.js                 personajes y textos
js/engine.js               reglas (muertes, noche, votación, victoria, puntuación). Sin DOM
js/flow.js                 guion de pasos, preguntas por jugador, respuestas. Sin DOM
js/auto.js                 narrador automático (bucle de fases con reloj inyectable). Sin DOM
js/app.js                  configuración, reparto, modo guiado, votación, puntuación, persistencia, PWA
js/online.js               sala, lobby, asientos, móviles, chat, narrador automático en pantalla
js/transport-peer.js       PeerJS (solo STUN); TURN opcional vacío
js/qrcode.js               generador de QR (MIT)
sw.js, manifest.webmanifest, icons/   PWA
tests/                     ver más abajo
```
Si cambias archivos: sube `VERSION` en `sw.js` y, si cambia la forma de `game` o `cfg`, `ESTADO_V` en `js/app.js`. Añade a `ARCHIVOS` en `sw.js` cualquier archivo nuevo.

## Pruebas (`npm run …`)
| Comando | Qué cubre |
|---|---|
| `test` | motor, flujo y 80 partidas completas con bots y cartas aleatorias (Node) |
| `test:ui` | interfaz local: reparto, guiado, noche, puntuación |
| `test:pwa` | manifest, iconos, service worker, arranque sin conexión |
| `test:persistencia` | configuración y partida local al recargar |
| `test:net` | transporte PeerJS con servidor de señalización local |
| `test:online` | narrador + 5 jugadores, cartas privadas, móvil compartido, Niña, recarga |
| `test:moviles` | narrador humano con acciones y votación en móviles |
| `test:auto` | narrador automático de punta a punta (con chat y pausa) |
| `test:reconexion` | jugador y anfitrión recargando a mitad de partida |
Los de navegador necesitan `npm install` (playwright, peer, peerjs) y Chromium.

## Puntuación (§9 del libro)
Equipo 2 · supervivencia según carta (Lobeco 5, Alfa 10, Rojo 8, Judas 30 solo si queda solo, Aldeano 1, Jabalí/Médium/Policía/Rata 2, Vidente 3, Niño Salvaje 1 o 5 según su estado) · poder (Bruja −5/+8, Cazador −2/+5, Inquisidor −3/+30, Niña −1/+3, Zorra +1 por ronda acertada, Judas +1 por lobo muerto, Borracho +20 si gana solo) · pareja 10. Los 9 ejemplos del libro son tests. Panel de puntuación al terminar, con − y + para casos dudosos, y marcador acumulado por nombre.
Supuestos donde el libro no concreta: quien llega vivo cobra supervivencia aunque su equipo pierda; un maldito o convertido puntúa como Lobeco; el Ladrón puntúa por la carta que tiene ahora; «La Niña denuncia (+3)» lo marca el narrador.

## Conectividad
- Misma red (wifi, también compartido o hotspot): conexión directa.
- **Relé (TURN) para wifi ↔ 4G:** al crear o unirse a una sala el transporte pide credenciales al Worker de Cloudflare de «El Impostor» (`TURN_PROXY_URL` en `js/transport-peer.js`; el Worker solo responde a `https://rmalump.github.io`). Si el Worker no responde, la sala funciona igual solo con STUN y se avisa. Con TURN basta con que lo use un extremo. En el lobby cada conexión muestra 📶 red local, 🌐 internet o 🔁 relé.
- Otro Worker: cambia la URL, o `globalThis.PUEBLO_TURN_PROXY` (cadena vacía = sin relé). Credenciales fijas sin Worker: `localStorage 'pueblo.peer.turn'`.
- Señalización: servidor público de PeerJS (sin garantías) y STUN de Google y Cloudflare.
- En modo automático quien aloja la partida podría ver todos los roles (herramientas del navegador). En modo humano el narrador ya los ve por definición.

## Simplificaciones de reglas (donde el libro es ambiguo)
- «Izquierda» = índice creciente en la mesa; los muertos no cuentan como vecinos. El orden de mesa se edita en el lobby (▲▼).
- La Niña descubierta muere en lugar de la víctima; si el Alfa maldecía, muere y no se aplica la maldición.
- La Bruja puede curar a cualquier devorado (manada, Rojo o Judas), salvo la Bruja/Lobo devorada por el Judas.
- Un maldito por el Alfa no se anuncia: la aldea oye «Nadie ha muerto esta noche».
- Borracho enamorado nunca gana por linchamiento. Ladrón que roba al Niño Salvaje no pregunta Modelo. Careto que cambia su propia carta: poder gastado.
- Lobos: gana la víctima más votada; el empate lo decide el azar (narrador automático) o el narrador (humano). Se dice qué personajes se despiertan, pero cada paso de noche dura un mínimo para no revelar por el tiempo quién sigue vivo.
- Tras el recuento de votos con empate: decide la Insignia; sin Insignia se repite entre los empatados y, si sigue, no se elimina a nadie.

## Pendiente
Arte propio o con permiso (las imágenes están hotlinkeadas desde `estaminestudio.com` y sin conexión se ven emojis hasta haberlas visto una vez), decisión sobre TURN y pruebas con móviles reales de todo lo anterior (todo se ha probado con navegadores de pruebas).
