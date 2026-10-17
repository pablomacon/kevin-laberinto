# Modelo conceptual de datos

| Entidad          | Propósito                                                               |
| ---------------- | ----------------------------------------------------------------------- |
| User             | Cuenta registrada opcional y futura.                                    |
| GuestIdentity    | Identidad efímera del invitado, con alias.                              |
| MatchParticipant | Participación de una identidad en una partida y su entrada.             |
| Connection       | Canal WebSocket temporal.                                               |
| Session          | Continuidad reconectable que puede asociar varias conexiones sucesivas. |
| Match            | Configuración, fase y estado autorizado de una carrera.                 |
| Maze             | Mapa identificado por configuración y semilla.                          |
| KevinObjective   | Objetivo inmóvil de la modalidad inicial y posición válida.             |
| MatchResult      | Resultado final, ganador opcional y métricas de progreso.               |

El estado temporal contiene conexiones, fase activa, posiciones y reloj de una partida; en la primera versión reside en memoria. Persisten potencialmente usuarios, resultados, semillas/configuraciones y estadísticas, pero no se implementa almacenamiento en esta misión. Una `GuestIdentity` no requiere `User`.
