# @kevin/game-core

Reglas puras de una carrera de **¿Dónde está Kevin?**. El paquete no importa Node,
WebSocket, DOM ni proveedores; recibe un `Clock` inyectable y un laberinto ya
generado.

`MatchEngine` conserva el estado autoritativo: admite de 3 a 6 participantes con
entradas distintas, controla espera, cuenta atrás, carrera y finalización, limita
movimiento a 150 ms por jugador y decide el ganador al alcanzar a Kevin. La
configuración por defecto está en `DEFAULT_MATCH_CONFIG`: 3 s de cuenta atrás,
240 s de carrera, radio de visibilidad euclidiano 4 y 30 s de reconexión.

Las vistas se separan por intención:

- `summary()` expone fase, participantes y reloj, sin coordenadas.
- `view(participantId)` expone sólo la posición, visibilidad y memoria de ese
  participante; Kevin aparece únicamente si está visible.
- `fullState()` se reserva para adaptadores autorizados de dirección y emisión.

El adaptador de red debe procesar las órdenes en serie, llamar a `tick()` con su
reloj y no aceptar coordenadas, tiempo ni resultado enviados por un cliente. Véanse
[la arquitectura](../../docs/ARCHITECTURE.md) y [el contrato WebSocket](../../docs/BETA_PROTOCOL.md).
