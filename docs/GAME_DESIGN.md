# Diseño de juego

## Requisitos aprobados: ¿Dónde está Kevin?

Entre 3 y 6 participantes comienzan en entradas distintas de un laberinto configurable (inicialmente 80 × 45). Todos buscan el mismo Kevin, seleccionado antes de la carrera en una posición válida y equilibrada. Cada participante se mueve simultáneamente con flechas o WASD, con referencia inicial de un movimiento cada 150 ms. Puede compartir casilla con otros jugadores.

Cada personaje tiene una linterna circular de radio inicial 4; las paredes no bloquean la visión dentro del círculo. Las casillas descubiertas se conservan en penumbra. Las posiciones rivales no se revelan. Kevin sólo se muestra si está en el campo de visión actual, y para ganar hay que alcanzar su casilla.

Fases: sala de espera, cuenta regresiva de 3 segundos, carrera, y finalización. La carrera dura inicialmente 240 segundos, configurable. Una desconexión dispone de 30 segundos provisionales para reconectar. El servidor decide movimientos, reloj, colisiones y ganador; al agotarse el tiempo no hay ganador por encuentro y se muestran estadísticas de progreso.

La vista de dirección y OBS podrá presentar el estado completo para relato y transmisión, sin reutilizar la visibilidad restringida del participante.

## Propuestas futuras, no aprobadas para la primera versión

Nuevas modalidades, Kevin móvil, torneos, perfiles, clasificación persistente e integración con Profe Macón 2.0 quedan pendientes de diseño y aprobación explícita.
