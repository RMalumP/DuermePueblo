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
| 1 | Motor de reglas completo (§11 del libro) y votación con Insignia doble | pendiente |
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

## Pendiente conocido para la fase 1
Rata, Heredera, Inquisidor, Jabalí (vecinos), Niña, Bruja (pociones), Policía (un uso de cada), Zorra, Vidente (maldito = Lobo), Lobo Alfa (una vez, suma poder), Lobo Rojo,
Médium, Niño Salvaje (gana si llega al final), Borracho Enamorado, Judas Enamorado, empate técnico, votación con Insignia doble, puntuación (la tabla del libro está incompleta).
