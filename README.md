# DuermePueblo

**La aldea se duerme** (El pueblo duerme): asistente de narrador y juego online. App web instalable (PWA), sin backend. Abre `index.html` para el modo local; el online necesita https (p. ej. GitHub Pages).

Estado, modos de juego, estructura, pruebas y conectividad: [`docs/PLAN.md`](docs/PLAN.md).

- Reglas, flujo y narrador automático están en `js/engine.js`, `js/flow.js` y `js/auto.js` (sin DOM, con tests en Node).
- `npm run test:all` ejecuta toda la batería (necesita `npm install` y Chromium para las de navegador).
- Si cambias archivos de la app, sube `VERSION` en `sw.js`.

## Créditos
Las ilustraciones de las cartas son de [Estamin Estudio](https://aaldeiadormece.estaminestudio.com/) (licencia open source) y se cargan desde su web. Comprueba en su página los términos exactos de atribución.
