# Protocolo WebSocket

Este documento conserva el contexto de la propuesta inicial. El contrato normativo
e implementado de beta 0.1 está en [BETA_PROTOCOL.md](BETA_PROTOCOL.md) y en
`packages/protocol/src/index.ts`; prevalece sobre cualquier ejemplo histórico de
esta página.

## Estado actual

Todos los mensajes usan `protocolVersion: 1`, `messageId` y `type`. La conexión
WebSocket está en `/ws` y comparte origen con el servidor HTTP local. El servidor
rechaza JSON inválido, campos no permitidos, mensajes superiores a 4096 bytes y
frecuencias superiores a 80 mensajes por segundo.

| Ámbito                    | Mensajes implementados                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| Acceso                    | `room.access`, `room.accessed`                                                   |
| Jugador                   | `player.join`, `player.reconnect`, `player.move`, `player.joined`, `player.view` |
| Partida                   | `match.status`, `match.finished`                                                 |
| Dirección                 | `admin.start`, `room.create`                                                     |
| Dirección/OBS autorizados | `broadcast.state`                                                                |
| Errores                   | `error`                                                                          |

`admin.pause` fue parte de la propuesta inicial y **no está implementado**. No se
deben construir clientes nuevos a partir de ese mensaje.

Un participante es una presencia en la carrera; una sesión es su continuidad
reconectable y una conexión es un WebSocket temporal. El `reconnectToken` permite
recuperar una sesión dentro de 30 segundos. No existen cuentas ni autenticación de
usuario. Director y OBS se autorizan con capacidades independientes generadas por
el servidor al arrancar; conocer una ruta sin su token no concede privilegios.

El servidor es la única fuente de aceptación, idempotencia, tiempo y estado. Una
vista `player.view` es privada y nunca contiene mapa completo, semilla o posiciones
rivales. `broadcast.state` contiene el mapa completo y sólo puede enviarse a
Director u OBS autorizados. Los detalles de secuencias, reconexión y errores están
en el contrato normativo.
