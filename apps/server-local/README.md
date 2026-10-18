# @kevin/server-local

Adaptador local de la beta: sirve HTTP, WebSocket y las páginas de jugador,
dirección y OBS. Mantiene una sola sala en memoria y utiliza los paquetes
`@kevin/game-core`, `@kevin/maze-engine` y `@kevin/protocol`.

Desde la raíz del monorepositorio, primero compile el laboratorio y luego ejecute:

```powershell
npm.cmd run build
npm.cmd run start:local
```

El puerto predeterminado es 3000; puede cambiarse con `PORT`, por ejemplo:

```powershell
$env:PORT = "3001"
npm.cmd run start:local
```

El CLI imprime enlaces de jugador, LAN, Director y OBS. Los dos últimos contienen
capacidades privadas distintas. Las rutas HTTP son `/play`, `/admin`, `/broadcast`,
`/lab` y `/health`; WebSocket usa `/ws`.

El proceso se destina a una LAN confiable, no a Internet: HTTP/WebSocket no tienen
TLS y el estado no persiste. Consulte [la guía de operación](../../docs/LOCAL_BETA.md)
y [el protocolo](../../docs/BETA_PROTOCOL.md).
