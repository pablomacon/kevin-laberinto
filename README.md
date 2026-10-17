# Kevin en su laberinto

Monorepositorio de **Kevin en su laberinto**, un juego competitivo de exploración cenital. La primera modalidad será **¿Dónde está Kevin?**: de tres a seis participantes exploran el mismo laberinto y gana quien alcance antes a Kevin.

## Estado actual

KEL-001 deja preparada la arquitectura, los contratos y la documentación. KEL-002 incorpora el [motor de laberintos](packages/maze-engine/README.md), con DFS determinista, BFS, validación y métricas. El [informe de diagnóstico](docs/MAZE_DIAGNOSTIC.md) incluye 100 semillas y un mapa completo. No existe aún juego, servidor WebSocket ni interfaz visual.

## Arquitectura y estructura

El dominio se mantiene independiente de Node.js, Cloudflare, Phaser, WebSocket y almacenamiento. `packages/game-core` expresa la partida, `maze-engine` sus contratos de mapa, `protocol` el transporte, `identity` las identidades y `shared` los tipos transversales. Las aplicaciones serán adaptadores.

Las carpetas principales son `apps/` (adaptadores aún vacíos), `packages/` (contratos), `docs/` (diseño y ADR) y `tests/` (configuración).

## Entorno local

Se requiere Node.js 20 LTS o posterior y npm. En VS Code se recomienda activar ESLint, Prettier y TypeScript.

Ejecute `npm install`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.

`build` equivale por ahora a la comprobación de tipos: no hay artefactos de producción hasta que las aplicaciones tengan implementación. Consulte [DEVELOPMENT.md](docs/DEVELOPMENT.md) para el flujo de trabajo.

## Pendiente

Las reglas de partida, visibilidad, red, reconexión, OBS, autenticación y servicios Cloudflare están deliberadamente fuera de esta entrega.
