# maze-engine

Biblioteca TypeScript estricta sin dependencias de ejecución. `Position` se importa de `shared`; coordenadas enteras desde cero: columna hacia la derecha, fila hacia abajo. `cells[row][column]` contiene `wall` o `floor`. La matriz y los resultados de generación son serializables a JSON.

## Generación y selección

1. Se inicializa una matriz de paredes con las dimensiones exactas solicitadas.
2. DFS iterativo con retroceso construye un árbol conectado sobre nodos lógicos en coordenadas impares. Cada arista se rasteriza abriendo una sola pared intermedia. Las dimensiones pares conservan su fila/columna sobrante como pared hasta abrir una entrada puntual.
3. Se recorren las paredes que separan nodos lógicos vecinos y se abre cada una con probabilidad `extraConnectionRate`. Son conexiones locales: no se abren bloques 2×2 ni avenidas o anillos perimetrales. Un árbol con tasa cero tiene cero ciclos; las aperturas añaden ciclos independientes y reducen algunos callejones.
4. Se comprueba el perfil estructural de la topología antes de buscar posiciones.
5. Se barajan las posiciones interiores de Kevin (margen aproximado del 15 % por eje). Para cada posición, una BFS calcula todas las distancias. Se suman uno o dos pasos hasta el borde según la paridad de las dimensiones.
6. Se buscan ventanas de distancias con ambas cotas y `(máxima − mínima) / máxima <= distanceTolerance`. Para seis entradas se exigen los cuatro bordes, como máximo dos por borde y separación Manhattan entre entradas de al menos cinco casillas en 80×45. La distancia usada para el equilibrio siempre es BFS, no Manhattan.
7. Se abren únicamente las entradas elegidas, se recalculan distancias reales y se valida conectividad, equilibrio y ausencia de cuello común. Si falla una combinación se intenta otra ventana/posición; sólo después de agotar las posiciones se pasa a otra topología determinista. `maxAttempts` sigue siendo 12.

Las bifurcaciones y los callejones surgen del árbol DFS; no se colocan callejones fijos. La distribución de entradas, fila y columna de Kevin y topología varían con la semilla. La dificultad humana no se deduce sólo de las distancias.

## Configuración

```typescript
const config: MazeConfig = {
  columns: 80,
  rows: 45,
  seed: "integration-0",
  entranceCount: 6,
  distanceTolerance: 0.15,
  extraConnectionRate: 0.14,
  maxAttempts: 12,
  structure: {
    maxFloorRatio: 0.6,
    minDeadEnds: 1,
    minJunctions: 1,
    maxStraightFraction: 0.9,
  },
};
```

Dimensiones: enteros desde 7; participantes: enteros de 3 a 6; tolerancia finita en `[0, 1)`; tasa de aperturas en `[0, 1]`; intentos enteros positivos. Los campos opcionales usan los valores del ejemplo. Un perfil `structure` parcial conserva los valores predeterminados de los campos omitidos. `maxStraightRun` permite además un límite absoluto en casillas. No hay relajación automática cuando falla una restricción.

El perfil estructural es una propuesta inicial configurable para revisión del arquitecto: una rasterización de corredores ocupa aproximadamente la mitad de las casillas, por lo que el límite del 60 % deja margen para conexiones y rechaza superficies abiertas o con islas. Exigir al menos un callejón y una bifurcación es una salvaguarda mínima; no define dificultad. El límite del 90 % de cada eje rechaza avenidas que cruzan casi toda la dimensión respectiva. Estos valores necesitan calibración humana; no son verdades universales ni cambios de las ADR.

## Reproducibilidad y API

FNV-1a mezcla la semilla textual; mulberry32 produce decisiones pseudoaleatorias. La semilla de cada topología combina semilla original e índice de intento. No se usa `Math.random`, fecha ni reloj en el dominio. La misma configuración produce idénticos mapa, posiciones, métricas y diagnóstico. El formato/algoritmo debe versionarse si en el futuro se requiere reproducir mapas entre distintas versiones del motor.

- `generateMaze(config)`: devuelve `MazeResult | GenerationError`. No lanza para configuraciones inválidas; el error distingue `INVALID_CONFIG` y `MAX_ATTEMPTS_EXHAUSTED` con motivos reales.
- `validateMaze(maze, entrances, kevin, options)`: verifica la matriz, ubicaciones, distribución, conectividad, distancias, perfil estructural y cuello común.
- `distancesFrom(maze, start)`: mapa BFS de claves `columna,fila` a distancia; devuelve un `Map`, que el consumidor debe convertir si desea serializarlo.
- `findShortestPath(maze, start, goal)`: camino óptimo incluyendo extremos, o `null`. Sólo movimiento ortogonal; paredes, coordenadas fraccionarias y diagonales no se aceptan.
- `calculateMazeMetrics(...)`: suelo, paredes, porcentaje (fracción 0–1), grados, distancias, ciclos, articulaciones y corredores.
- `hasSharedBottleneck(...)`: función independiente que detecta una casilla distinta de Kevin cuya eliminación impide llegar a todas las entradas. Tarjan enraizado en Kevin contabiliza las entradas separadas en O(V+E), sin copias de matrices ni BFS por articulación.
- `diagnoseCandidate(config, attempt)`: inspecciona una topología y sus selecciones aunque no sean válidas; expone todos los candidatos perimetrales y sus distancias, ventanas descartadas, combinaciones evaluadas y motivos. Lanza `RangeError` si la configuración del diagnóstico es inválida.
- `diagnoseGeneration(config)`: resultado público más historial de todos los intentos; diferencia topologías, ubicaciones de Kevin y combinaciones. `availableKevinCandidates` es la cantidad disponible y `kevinCandidates` la cantidad examinada.
- `inspectTopology(config, attempt)`: cuadrícula anterior a la selección, con entradas vacías, para comparar densidades; no representa un resultado aceptado.
- `exportMazeAscii(maze)`: mapa completo con `#` para pared, espacios para suelo, `1`–`6` para entradas y `K` para Kevin.

Las APIs de generación y validación existentes se conservan. Se amplían `MazeConfig`, `MazeMetrics` y las funciones de diagnóstico dentro de este paquete. No hay cambios en protocolo ni contratos de otros paquetes. Las funciones no modifican sus entradas.

## Métricas y límites

Los ciclos se calculan como `E − V + C`, incluyendo grafos desconectados. Una bifurcación tiene grado al menos 3 y un callejón grado 1. Los corredores son cadenas máximas entre vértices de grado distinto de 2; se registran longitudes en aristas, incluidos anillos aislados. También se mide el tramo recto máximo por eje en casillas. Articulación por sí sola no invalida un mapa.

`kevinRegionEntrances` conserva el nombre del contrato anterior pero mide únicamente el grado local de Kevin: no es un recuento de entradas de una región biconexa ni de rutas independientes. Esa región queda pendiente de definición. Una distancia `-1` indica entrada inaccesible; sin distancias positivas la diferencia relativa se informa como 1 y el mapa se rechaza.

DFS genera inicialmente toda la región como un grafo; no existe aún una composición explícita de sectores/habitaciones ni simulación de exploradores. El perfil y el presupuesto de búsqueda pueden rechazar configuraciones pequeñas o extremas; se informa el fallo y nunca se relajan condiciones. Tarjan es recursivo y su profundidad puede limitar mapas muy superiores al tamaño estándar. No se promete dificultad o equidad humana sólo con estas métricas.

## Evidencias y rendimiento

Consulte [el diagnóstico completo](../../docs/MAZE_DIAGNOSTIC.md), los informes de 20/100 semillas y [el mapa ASCII](../../docs/maze-example.txt). Las pruebas de 100 semillas incluyen reproducción, validación, distribución y caminos mínimos. Su presupuesto por defecto es 30 segundos, configurable con `MAZE_TEST_TIMEOUT_MS` para equipos más lentos. Los tiempos observados no se usan como garantía universal.

El adaptador de diagnóstico usa Node sólo fuera del motor:

```bash
npx --yes tsx scripts/maze-diagnostic.ts 20
npx --yes tsx scripts/maze-diagnostic.ts 100
```

`tsx` se usa como ejecutor temporal de desarrollo; no se añadió al dominio ni a las dependencias del proyecto. El comando puede necesitar acceso al registro npm. Produce resúmenes JSON, trazas NDJSON completas y un mapa de ejemplo; devuelve código de salida no cero si alguna semilla agota intentos.
