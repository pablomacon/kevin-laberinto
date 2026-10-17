# Kevin en su laberinto

Monorepositorio de **Kevin en su laberinto**, un juego competitivo de exploración cenital. La primera modalidad será **¿Dónde está Kevin?**: de tres a seis participantes exploran el mismo laberinto y gana quien alcance antes a Kevin.

## Estado actual

Beta 0.1 local (KEL-004): ejecutar `npm run build` y `npm run start:local`. Rutas /play, /admin y /broadcast; [guía LAN](docs/LOCAL_BETA.md) y [contrato para Antigravity](docs/BETA_PROTOCOL.md).

KEL-001 prepara la arquitectura; KEL-002 incorpora el [motor de laberintos](packages/maze-engine/README.md) y KEL-003 el [laboratorio visual](docs/MAZE_VIEWER.md). KEL-004 añade el motor autoritativo y servidor multijugador local, con páginas provisionales de jugador, dirección y transmisión.

## Arquitectura y estructura

El dominio se mantiene independiente de Node.js, Cloudflare, Phaser, WebSocket y almacenamiento. `packages/game-core` expresa la partida, `maze-engine` sus contratos de mapa, `protocol` el transporte, `identity` las identidades y `shared` los tipos transversales. `apps/web` contiene el laboratorio visual interactivo de laberintos.

Las carpetas principales son `apps/` (laboratorio y servidor local), `packages/` (dominio y protocolo), `docs/` (contratos, guías y ADR) y `tests/` (pruebas automatizadas).

## Entorno local

Se requiere Node.js 20 LTS o posterior y npm. En VS Code se recomienda activar ESLint, Prettier y TypeScript.

Ejecute `npm install`, `npm run dev` (para abrir el laboratorio visual en Vite), `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.

Consulte [DEVELOPMENT.md](docs/DEVELOPMENT.md) para el flujo de trabajo y [MAZE_VIEWER.md](docs/MAZE_VIEWER.md) para la guía de uso del laboratorio de laberintos.

## Pendiente

La interfaz final de Antigravity, cuentas, persistencia, Cloudflare, rankings y torneos permanecen pendientes. La transmisión actual usa una página provisional autorizada para OBS.
