# maze-engine

Motor de dominio puro para laberintos rectangulares serializables. La matriz se indexa como `cells[row][column]`; sus coordenadas empiezan en cero desde arriba a la izquierda y cada casilla es `wall` o `floor`.

`generateMaze` conserva exactamente las dimensiones solicitadas, incluidas las pares. Mezcla la semilla textual con FNV-1a y usa mulberry32, por lo que no depende de `Math.random()` y reproduce mapa, entradas, Kevin y métricas. La red de corredores preserva el perímetro y ejes interiores, usa islas de pared deterministas y deja ciclos y rutas alternativas; es una base evolutiva para regiones y Prim/DFS de ADR-008.

`findShortestPath` y `distancesFrom` usan BFS ortogonal. La validación reutiliza las distancias desde Kevin, exige conectividad, distancias positivas y diferencia relativa máxima configurable (15 % por defecto), y rechaza cuellos comunes. Las métricas incluyen suelo, paredes, bifurcaciones, callejones, ciclos, puntos de articulación mediante Tarjan y entradas de la región de Kevin.

La calibración de dificultad humana y los exploradores con visibilidad limitada quedan deliberadamente fuera de KEL-002.
