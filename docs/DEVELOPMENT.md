# Desarrollo

Instale Node.js 20 LTS, abra la raíz con VS Code y habilite las extensiones ESLint, Prettier y TypeScript. Ejecute `npm install` y luego `npm run dev` para iniciar el laboratorio visual (`apps/web`), o `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` para verificar y compilar el proyecto. `npm run format` aplica el formato y `npm run format:check` lo verifica. Consulte [MAZE_VIEWER.md](MAZE_VIEWER.md) para los detalles del visor interactivo.

Trabaje en ramas `feature/KEL-###-descripcion` desde `main`. Mantenga cada cambio acotado a su misión, ejecute las comprobaciones relevantes y prepare un pull request contra `main` con contexto, pruebas y cambios de contrato. La revisión confirma alcance, ADR aplicables, aislamiento del dominio, cobertura pertinente y documentación. No se fusiona sin aprobación.

Antes de añadir una función, lea los contratos y ADR afectados. Si necesita cambiar un contrato público, documente compatibilidad, actualice su especificación y coordine a los consumidores; no use cambios silenciosos.
