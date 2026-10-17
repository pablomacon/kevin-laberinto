# Protocolo WebSocket inicial

Todos los mensajes transportan `protocolVersion: 1` y `messageId`. El cliente añade una secuencia monotónica a `player.move`; el servidor conserva la última aceptada por conexión/participante y descarta duplicados. Los contratos exactos están en `@kevin/protocol`.

| Ámbito                       | Mensajes                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Público para el participante | `player.join`, `player.move`, `player.view`, `match.status`, `match.finished` |
| Exclusivo del administrador  | `admin.start`, `admin.pause`                                                  |
| Dirección/OBS                | `broadcast.state`                                                             |

`player.view` es privado: contiene sólo lo visible para quien lo recibe. `broadcast.state` tendrá autorización separada y puede incluir estado completo. `match.status` y `match.finished` no exponen posiciones ocultas.

Una **identidad** identifica a invitado o futuro usuario; una **sesión** representa su continuidad lógica en una partida; una **conexión** es un WebSocket temporal asociado a una sesión. Al reconectar dentro del plazo, el cliente presenta su token de sesión (mecanismo concreto pendiente) y sustituye la conexión sin crear participante nuevo. Aún no hay autenticación.

Errores se responden como `error` con código estable y mensaje legible, por ejemplo versión incompatible, sesión inválida, movimiento duplicado o acción no autorizada. El servidor es la única fuente de aceptación, idempotencia y estado.
