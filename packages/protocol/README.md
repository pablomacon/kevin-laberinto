# @kevin/protocol

Contratos TypeScript y validación de entrada para el WebSocket de beta local.
`parseClientMessage` acepta únicamente los mensajes de versión 1 y sus campos
permitidos; el servidor sigue siendo responsable de autorización, sesiones, límites
de frecuencia e idempotencia.

Los clientes empiezan con `room.access`. Un jugador usa `player.join` o
`player.reconnect` y después envía `player.move` con una secuencia creciente. El
director autorizado puede enviar `admin.start` y `room.create`; una conexión OBS
autorizada sólo recibe `broadcast.state`.

La especificación completa, campos y errores está en
[docs/BETA_PROTOCOL.md](../../docs/BETA_PROTOCOL.md). `PROTOCOL.md` explica qué
partes de la propuesta inicial fueron sustituidas; en particular, `admin.pause` no
forma parte de beta 0.1.
