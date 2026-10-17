# Contrato para Antigravity: beta local 0.1

Contrato implementado en `packages/protocol/src/index.ts`. WebSocket estándar en `/ws`, misma dirección/puerto que HTTP. Una única sala local, varias carreras sucesivas. No requiere Internet.

Todos los mensajes incluyen `protocolVersion: 1`, `messageId` (1–96 caracteres alfanuméricos, guion o guion bajo) y `type`. Ejemplo: `{"protocolVersion":1,"messageId":"c1","type":"room.access","role":"player"}`. Sólo JSON de texto, máximo 4096 bytes. El servidor valida tipos y campos y rechaza campos adicionales. Este documento reemplaza la propuesta inicial de payloads de KEL-001; la versión 1 de beta queda definida aquí.

## Cliente → servidor

| type             | Campos además del sobre                                         | Permiso                                                                |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| room.access      | role: player / director / broadcast; token?: string             | Primera acción. Director y OBS necesitan sus respectivas capacidades   |
| player.join      | displayName: string (1–24 caracteres, sin controles)            | Conexión player sin participante, sólo espera                          |
| player.reconnect | token: string                                                   | Conexión player sin participante                                       |
| player.move      | direction: up / down / left / right; sequence: entero seguro ≥0 | Participante conectado, carrera activa                                 |
| admin.start      | Ninguno                                                         | Director                                                               |
| room.create      | Ninguno                                                         | Director; reemplaza la carrera por otra y vacía participantes/sesiones |

No enviar coordenadas, tiempos, ganador, semilla ni configuraciones desde el cliente. Tampoco `participantId` en movimientos: se obtiene de la sesión autenticada de esa conexión. El visitante puede acceder a la sala como player para recibir espera sin unirse aún. Una conexión no cambia de rol; abrir otra conexión si hace falta. `admin.pause` no forma parte de esta beta.

## Servidor → cliente

| type            | Payload                                                  | Destino                                              |
| --------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| room.accessed   | role                                                     | Confirmación del acceso                              |
| player.joined   | participantId, reconnectToken, nextSequence, matchId     | Únicamente al participante que se une/reconecta      |
| match.status    | status: MatchSummary                                     | Jugadores/visitantes de sala                         |
| player.view     | view: PrivateView                                        | Sólo al dueño de esa sesión                          |
| match.finished  | status: MatchSummary, winnerId opcional dentro de status | Jugadores/visitantes                                 |
| broadcast.state | state: { summary, maze, positions }                      | Sólo director y OBS autorizados                      |
| error           | code, message, requestId?                                | Conexión solicitante; sin stack ni detalles internos |

`MatchSummary`: matchId, phase (waiting/countdown/running/finished), participants [{id,displayName,connected,expired}], remainingMs, countdownMs; tras finalizar, results [{participantId,displayName,steps,exploredCells,exploredPercent}] y winnerId sólo si hubo encuentro. No contiene coordenadas, entradas ni semilla. Tiempo restante se publica cada 250 ms.

`PrivateView`: matchId, participantId, phase, position propia, columns, rows, visible y explored (listas de {column,row,terrain}), remainingMs, countdownMs; kevin {column,row} sólo cuando está en visible en ese instante. El radio euclidiano es cuatro; incluye paredes y no tiene oclusión. Las casillas exploradas permanecen en memoria; Kevin no queda memorizado. No contiene posiciones rivales, matriz completa, semilla o config. `exploredPercent` es una fracción 0–1 de todas las casillas (incluye paredes descubiertas).

`broadcast.state`: maze completo y positions [{participantId,position}], más resumen. Nunca enviar ni reutilizar este objeto para construir mensajes de jugador. Los cambios de posición actualizan vistas privadas; el temporizador actualiza resúmenes. Renderizar alias y errores como texto, sin HTML.

## Secuencias y reconexión

Cada conexión conserva hasta 4096 messageId procesados. Duplicados: DUPLICATE_MESSAGE. A partir del límite se cierra con RECONNECT_REQUIRED; abrir otra conexión y reconectar. Hasta 80 mensajes por segundo por conexión; exceso cierra con RATE_LIMIT. Máximo 4096 bytes por mensaje.

Cada sesión conserva su última secuencia de movimiento, incluidos intentos bloqueados o demasiado rápidos. Usar nextSequence recibido en player.joined y aumentar en cada intención. Repeticiones o secuencias menores se rechazan como DUPLICATE_SEQUENCE incluso tras reconectar. La frecuencia de movimientos es adicional a esta validación y depende sólo del reloj servidor.

Guardar reconnectToken por pestaña (sessionStorage, no en el mapa público). Tras perder la conexión, abrir /ws, enviar room.access de player y luego player.reconnect. La reconexión conserva posición, exploración y secuencia. Gracia de 30 segundos desde la desconexión detectada; en el límite se rechaza. Heartbeat ping/pong detecta conexiones interrumpidas en aproximadamente 5–10 s antes de empezar esa gracia. Un token de sesión conectado no permite apropiarse de otra conexión. Al crear otra carrera se invalidan todos los tokens; al cambiar matchId, vaciar vista y volver a unirse.

## Autorización y errores

Director y OBS usan capacidades aleatorias independientes de 256 bits generadas al arrancar. La consola anfitriona imprime enlaces con fragmento: /admin#TOKEN y /broadcast#TOKEN. El fragmento no se envía por HTTP; la página lo entrega en room.access y lo retira de la barra. Las capacidades se conservan por pestaña en sessionStorage para recarga. Conocer la ruta no da privilegios.

Errores habituales: INVALID_MESSAGE, INVALID_JSON, UNAUTHORIZED, FORBIDDEN, ROOM_FULL, MATCH_STARTED, ALREADY_JOINED, NOT_READY, NOT_RUNNING, MOVE_TOO_FAST, BLOCKED, DUPLICATE_MESSAGE, DUPLICATE_SEQUENCE, INVALID_SESSION, RECONNECT_EXPIRED, ALREADY_CONNECTED, UNKNOWN_PLAYER. Después de un error se puede continuar salvo cierre explícito. Los errores de mensajes válidos incorporan requestId para correlación; las respuestas de estado son snapshots con su propio messageId.

El orden de recepción/procesamiento del servidor desempata llegadas, incluso si comparten el mismo valor del reloj. La primera llegada válida termina la carrera; movimientos posteriores se rechazan. Se permite compartir casillas. Sin encuentro al vencer 240 s: finished sin winnerId, con estadísticas.

HTTP y ws en LAN no cifran ni autentican al anfitrión: alguien con acceso al tráfico puede capturar capacidades o tokens. No publicar este puerto en Internet; usar una LAN confiable y firewall. No hay cuentas, almacenamiento persistente ni seguridad frente a un anfitrión malicioso.
