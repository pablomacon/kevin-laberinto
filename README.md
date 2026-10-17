# Kevin en su laberinto

Monorepositorio de **Kevin en su laberinto**, un juego competitivo de exploración cenital. La primera modalidad será **¿Dónde está Kevin?**: de tres a seis participantes exploran el mismo laberinto y gana quien alcance antes a Kevin.

## Estado actual

KEL-001 deja preparada la arquitectura, los contratos y la documentación. KEL-002 incorpora el [motor de laberintos](packages/maze-engine/README.md), con DFS determinista, BFS, validación y métricas, junto con el [informe de diagnóstico](docs/MAZE_DIAGNOSTIC.md). KEL-003 añade el [laboratorio visual de laberintos](docs/MAZE_VIEWER.md) en `apps/web` (Vite + Phaser 3) para inspeccionar, validar, visualizar rutas óptimas y simular exploración con linterna circular. No existe aún servidor WebSocket ni partida multijugador en red.

## Arquitectura y estructura

El dominio se mantiene independiente de Node.js, Cloudflare, Phaser, WebSocket y almacenamiento. `packages/game-core` expresa la partida, `maze-engine` sus contratos de mapa, `protocol` el transporte, `identity` las identidades y `shared` los tipos transversales. `apps/web` contiene el laboratorio visual interactivo de laberintos.

Las carpetas principales son `apps/` (`apps/web` con el laboratorio visual y `apps/server-local` reservado), `packages/` (contratos y motor), `docs/` (diseño, guía del visor y ADR) y `tests/` (pruebas automatizadas).

## Entorno local

Se requiere Node.js 20 LTS o posterior y npm. En VS Code se recomienda activar ESLint, Prettier y TypeScript.

Ejecute `npm install`, `npm run dev` (para abrir el laboratorio visual en Vite), `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.

Consulte [DEVELOPMENT.md](docs/DEVELOPMENT.md) para el flujo de trabajo y [MAZE_VIEWER.md](docs/MAZE_VIEWER.md) para la guía de uso del laboratorio de laberintos.

## Pendiente

Las reglas de partida en red, servidor autoritativo WebSocket, reconexión, OBS, autenticación y servicios Cloudflare están deliberadamente fuera de esta entrega.
