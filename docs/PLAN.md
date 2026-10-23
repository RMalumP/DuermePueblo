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
| 2a | Spike de conectividad (anfitrión + 2-3 móviles: router, hotspot, 4G) | pendiente |
| 2b | Modularizar, copiar/adaptar el transporte PeerJS (sin TURN), lobby, QR, diagnóstico | pendiente |
| 3 | Híbrido: carta privada por móvil + narrador guiado + móvil compartido | pendiente |
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
