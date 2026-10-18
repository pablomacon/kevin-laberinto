# Desarrollo

## Entorno

Use Node.js 20.19+ o 22.12+ y npm. La CI usa Node 20. Desde la raíz, `npm ci`
instala el árbol bloqueado; `npm install` es útil sólo cuando se modifican
dependencias. En Windows, `npm.cmd` evita la restricción habitual de `npm.ps1`.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run smoke:local
npm.cmd run test:canvas-stability
npm.cmd run format:check
npm.cmd audit
```

`build` incluye `typecheck` y compila `apps/web`. `smoke:local` crea un proceso
del servidor real y seis clientes WebSocket; no inicia una sesión que deba cerrar
manualmente. `test:canvas-stability` requiere Microsoft Edge disponible y ejecuta
un navegador headless; por eso conviene ejecutarlo en Windows antes de cambios en
las vistas canvas. La CI de pull requests contra `main` ejecuta todas las
comprobaciones salvo la prueba de estabilidad visual.

Para desarrollar el laboratorio de mapas, use `npm run dev` y abra la URL de Vite.
Para operar la beta multijugador, compile primero y ejecute `npm run start:local`.
Véanse [MAZE_VIEWER.md](MAZE_VIEWER.md) y [LOCAL_BETA.md](LOCAL_BETA.md).

## Convenciones de cambios

Trabaje desde `main` en una rama con prefijo acorde al tipo de cambio, por ejemplo
`feature/KEL-###-descripcion`, `fix/KEL-###-descripcion` o
`docs/KEL-###-descripcion`. Mantenga cada cambio acotado a su misión y cree un PR
contra `main`; no se fusiona sin aprobación.

Antes de modificar un contrato público, lea los ADR y la documentación afectada,
documente la compatibilidad y actualice a sus consumidores. Los paquetes de dominio
no deben importar Node.js, WebSocket, Phaser ni proveedores. El navegador no decide
resultados oficiales ni recibe datos ocultos de otros participantes.

Una entrega debe indicar las comprobaciones ejecutadas y sus resultados. Las pruebas
automatizadas complementan, pero no reemplazan, la partida manual y la prueba LAN
en dispositivos físicos.
