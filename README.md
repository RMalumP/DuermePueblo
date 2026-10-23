# DuermePueblo

Asistente para narrar *La aldea se duerme* (abre `index.html`; no necesita servidor).

- `js/data.js` personajes y textos · `js/engine.js` motor de reglas (sin DOM)
- Tests del motor: `npm test` (Node 18+). Tests de interfaz: `npm run test:ui` (Playwright + Chromium).
- Plan y decisiones del modo online: [`docs/PLAN.md`](docs/PLAN.md)

- Modo online (PeerJS, solo STUN): `js/online.js` + `js/transport-peer.js`. Necesita abrirse desde https (p. ej. GitHub Pages); el modo local funciona con doble clic.
- Tests de red y de interfaz online: `npm run test:net`, `npm run test:online` (necesitan `npm install` para `peer` y `peerjs`).
- App instalable (PWA): ver `docs/PLAN.md`. Si cambias archivos de la app, sube `VERSION` en `sw.js`.
