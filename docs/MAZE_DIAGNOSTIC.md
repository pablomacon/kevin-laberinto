# KEL-002-C: diagnóstico y corrección

Evidencia histórica de KEL-002-C con tolerancia del 15 %. La beta KEL-004 cambia los valores predeterminados a 30 % y mínimo 40 pasos, seleccionando entre varias posiciones válidas; véanse [LOCAL_BETA.md](LOCAL_BETA.md) y [KEVIN_DISTRIBUTION.json](KEVIN_DISTRIBUTION.json). Estos informes anteriores no se sustituyeron ni se presentan como resultados de la beta.

## Evidencia previa a la corrección

El commit `75f882b` conserva el DFS local de KEL-002-B y la instrumentación antes de corregirlo. [diagnostic-before.json](diagnostic-before.json) registra el primer candidato de `integration-0` a `integration-19`: casillas, ciclos, bifurcaciones, callejones, todas las distancias perimetrales candidatas, distancia de la combinación seleccionada y motivos.

Las 20 topologías eran conexas. Las 20 combinaciones incumplían el 15 %; la diferencia relativa estaba entre 45,57 % y 85,12 % (media 72,57 %). Una combinación también tenía un cuello común. Se evaluaba una sola ubicación de Kevin y una sola combinación por topología.

El defecto principal estaba en el filtro: `distance <= base / (1 - tolerance)` no exigía `distance >= base`. Así incorporaba entradas demasiado cercanas. El objetivo tampoco se reconsideraba después del rechazo. Otro defecto corregido es la longitud del acceso al borde derecho en dimensiones pares: suma dos pasos, en lugar de uno. El diagnóstico no justificó modificar ni el 15 % ni la densidad de conexiones.

## Selección y topología final

Se conserva el DFS auténtico sobre nodos lógicos y sus aperturas locales de paredes, eliminando el código anterior inalcanzable de islas y callejones artificiales. La búsqueda conjunta recorre posiciones interiores barajadas de Kevin y ventanas BFS con ambas cotas. Para seis entradas, cuatro bordes, máximo dos por borde y separación mínima. Cada combinación se valida después de abrir los accesos puntuales, con BFS y Tarjan. No existe anillo exterior de suelo.

El máximo de intentos de topología sigue en 12. Las ubicaciones de Kevin se agotan antes de cambiar de topología. No se hizo una apertura dirigida adicional: la selección corregida resolvió las 100 semillas. Sólo se descartó una topología por un tramo recto superior al perfil del 90 % del eje; `integration-2` se aceptó en su segundo intento.

El perfil estructural inicial del [paquete](../packages/maze-engine/README.md) es configurable y queda sujeto a calibración/revisión del arquitecto. El 60 % máximo de suelo discrimina la superficie abierta anterior; bifurcaciones y callejones se originan en el DFS. El perfil no pretende medir dificultad humana.

## Baterías y rechazos

Se verificó primero un mapa de 80×45 con seis entradas, después 20 semillas y finalmente 100 (`integration-0` a `integration-99`). Todas se generan, sin agotamientos. Se agregaron pruebas de reproducción íntegra y rutas mínimas por entrada, además de rechazo de mapas abiertos, islas, desconexión, desequilibrio y cuello común.

| Nivel de búsqueda                       | 20 semillas | 100 semillas |
| --------------------------------------- | ----------: | -----------: |
| Generaciones aceptadas                  |          20 |          100 |
| Agotamientos                            |           0 |            0 |
| Topologías examinadas                   |          21 |          101 |
| Topologías rechazadas                   |           1 |            1 |
| Ubicaciones de Kevin examinadas         |          57 |          247 |
| Combinaciones de entradas examinadas    |         120 |          622 |
| Combinaciones rechazadas                |         100 |          522 |
| Rechazo por cuello común                |          74 |          402 |
| Rechazo por entradas demasiado próximas |          26 |          120 |

Por separado, los prefiltros descartaron 19.934 ventanas por distribución de bordes y 2.621 por distancias en las 100 semillas. Son ventanas, que pueden superponerse: no se suman como topologías rechazadas ni como combinaciones materializadas. Se descartaron 147 ubicaciones de Kevin antes de hallar las 100 aceptadas. Todas las aceptadas cumplen una diferencia relativa ≤15 % y carecen de cuello común.

Los resúmenes [de 20](diagnostic-after20.json) y [de 100](diagnostic-after100.json) incluyen métricas y distancias de las seis entradas por semilla, intentos y tiempos. Las trazas [de 20](diagnostic-after20.ndjson) y [de 100](diagnostic-after100.ndjson) conservan cada ubicación y todos los candidatos perimetrales como tuplas `[columna, fila, distancia]`, cada combinación materializada con sus motivos y los contadores de ventanas descartadas. Una línea NDJSON corresponde a una semilla.

## Métricas agregadas de las 100 aceptadas

| Métrica                             |  Mínimo |   Media |  Máximo |
| ----------------------------------- | ------: | ------: | ------: |
| Suelo transitable                   | 50,31 % | 51,00 % | 51,61 % |
| Callejones                          |      52 |   61,93 |      84 |
| Bifurcaciones                       |     221 |  263,02 |     298 |
| Ciclos independientes               |      89 |  113,77 |     135 |
| Diferencia relativa                 |  7,23 % | 13,31 % | 15,00 % |
| Distancia de la entrada más cercana |      55 |   70,70 |     115 |
| Distancia de la entrada más lejana  |      63 |   81,60 |     135 |
| Mayor tramo recto (casillas)        |      15 |   25,87 |      45 |
| Generación (ms)                     |   10,72 |   38,08 |  336,42 |

Medición secuencial en Windows x64, Node v24.16.0, AMD Ryzen 5 7535HS; incluye instrumentación y búsqueda, excluye escritura de archivos. Los tramos se comparan con su propio eje: un tramo horizontal de 45 no atraviesa el ancho de 80. Los tiempos fluctúan según carga y equipo. CI usa Node 20 LTS configurado en el workflow.

## Mapa de ejemplo

[maze-example.txt](maze-example.txt) contiene las 45 filas y 80 columnas completas; `#` pared, espacio suelo, `1`–`6` entradas y `K` objetivo. [maze-example.json](maze-example.json) conserva las coordenadas y métricas de `integration-0`.

Kevin está en `(57, 9)`; entradas `(75,44)`, `(79,37)`, `(5,0)`, `(0,1)`, `(19,44)`, `(0,7)`. Sus distancias son **73, 74, 77, 81, 81, 83** (diferencia 12,05 %). El mapa tiene 1.838 casillas transitables (51,06 %), 265 bifurcaciones, 54 callejones, 116 ciclos y 215 articulaciones. Ninguna articulación distinta de Kevin es paso obligado para todos. Longitud máxima de corredor: 30 aristas; tramo recto máximo: 33 casillas.

## Límites pendientes

La calibración humana, regiones explícitas y simuladores permanecen pendientes. `kevinRegionEntrances` mide grado local, no entradas independientes de una región biconexa. La búsqueda es determinista y acotada, pero no exhaustiva sobre todas las combinaciones posibles; configuraciones extremas pueden fallar con un informe estructurado. Los valores de calidad iniciales requieren revisión del arquitecto. No se afirma equidad de exploración sólo por distancias equilibradas.
