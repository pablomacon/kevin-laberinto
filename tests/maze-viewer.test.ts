import { describe, expect, it } from "vitest";
import {
  calculateMazeMetrics,
  findShortestPath,
  generateMaze,
  type Maze,
  type MazeResult,
} from "../packages/maze-engine/src/index.js";
import {
  buildTerrainCacheKey,
  calculateViewportLayout,
  computeAllOptimalPaths,
  computeMazeSignature,
  computeOptimalPath,
  computeVisibleCells,
  createViewerState,
  DEFAULT_LANTERN_RADIUS,
  DEFAULT_VIEWER_CONFIG,
  generateNextSeed,
  getCellVisibility,
  getSelectedExplorer,
  gridToScreen,
  hasMazeChanged,
  isKevinVisible,
  isWithinLantern,
  moveSelectedPlayer,
  positionKey,
  resetPlayerExploration,
  screenToGrid,
  selectPlayer,
  shouldRedrawTerrain,
} from "../apps/web/src/viewer-logic.js";

function buildControlledMazeResult(): MazeResult {
  // Matriz 9x9 controlada para pruebas deterministas de movimiento, paredes, linterna y Kevin
  const cells = [
    ["wall", "floor", "wall", "wall", "wall", "wall", "wall", "floor", "wall"],
    [
      "floor",
      "floor",
      "floor",
      "wall",
      "floor",
      "floor",
      "floor",
      "floor",
      "wall",
    ],
    ["wall", "floor", "wall", "wall", "floor", "wall", "wall", "floor", "wall"],
    [
      "wall",
      "floor",
      "floor",
      "floor",
      "floor",
      "floor",
      "wall",
      "floor",
      "wall",
    ],
    [
      "wall",
      "wall",
      "wall",
      "floor",
      "floor",
      "floor",
      "floor",
      "floor",
      "floor",
    ],
    [
      "wall",
      "floor",
      "floor",
      "floor",
      "floor",
      "wall",
      "wall",
      "floor",
      "wall",
    ],
    ["wall", "floor", "wall", "wall", "floor", "wall", "wall", "floor", "wall"],
    [
      "wall",
      "floor",
      "floor",
      "floor",
      "floor",
      "floor",
      "floor",
      "floor",
      "wall",
    ],
    ["wall", "wall", "wall", "floor", "wall", "wall", "wall", "wall", "wall"],
  ] as const;

  const maze: Maze = {
    id: "test-viewer-maze",
    config: {
      columns: 9,
      rows: 9,
      seed: "viewer-unit-test",
      entranceCount: 4,
    },
    cells,
    entrances: [
      { column: 0, row: 1 }, // J1 (borde izquierdo)
      { column: 1, row: 0 }, // J2 (borde superior)
      { column: 8, row: 4 }, // J3 (borde derecho)
      { column: 3, row: 8 }, // J4 (borde inferior)
    ],
    kevin: { column: 4, row: 4 },
  };

  return {
    maze,
    metrics: calculateMazeMetrics(maze),
  };
}

describe("KEL-003 viewer-logic", () => {
  it("convierte coordenadas entre matriz (columna, fila) y pantalla sin intercambiar ejes ni deformar casillas", () => {
    const layout = calculateViewportLayout(1600, 900, 80, 45, 0);
    expect(layout.cellSize).toBe(20);
    expect(layout.mapWidth / layout.mapHeight).toBeCloseTo(16 / 9, 5);

    const origin = { x: 10, y: 20 };
    const rect = gridToScreen({ column: 5, row: 3 }, 20, origin);
    expect(rect).toEqual({
      x: 110,
      y: 80,
      width: 20,
      height: 20,
      centerX: 120,
      centerY: 90,
    });

    const backToGrid = screenToGrid(
      rect.centerX,
      rect.centerY,
      20,
      80,
      45,
      origin,
    );
    expect(backToGrid).toEqual({ column: 5, row: 3 });

    // Fuera de los límites devuelve null
    expect(screenToGrid(5, 5, 20, 80, 45, origin)).toBeNull();
    expect(screenToGrid(2000, 1000, 20, 80, 45, origin)).toBeNull();
  });

  it("selecciona jugadores válidos y descarta índices fuera de rango", () => {
    const state = createViewerState(buildControlledMazeResult());
    expect(state.selectedPlayerIndex).toBe(0);
    expect(getSelectedExplorer(state).id).toBe("J1");

    const stateJ3 = selectPlayer(state, 2);
    expect(stateJ3.selectedPlayerIndex).toBe(2);
    expect(getSelectedExplorer(stateJ3).id).toBe("J3");

    // Índices inválidos no alteran el estado
    expect(selectPlayer(stateJ3, -1).selectedPlayerIndex).toBe(2);
    expect(selectPlayer(stateJ3, 99).selectedPlayerIndex).toBe(2);
  });

  it("valida movimientos ortogonales de una casilla y bloquea paredes o salidas del mapa", () => {
    let state = createViewerState(buildControlledMazeResult(), {
      viewMode: "lantern",
    });
    // J1 inicia en (0, 1)
    expect(getSelectedExplorer(state).position).toEqual({ column: 0, row: 1 });

    // Intentar salir del mapa hacia la izquierda (-1, 1)
    const outOfBounds = moveSelectedPlayer(state, "left");
    expect(outOfBounds.moved).toBe(false);
    expect(outOfBounds.blockedReason).toBe("bounds");
    expect(getSelectedExplorer(outOfBounds.state).position).toEqual({
      column: 0,
      row: 1,
    });

    // Intentar atravesar pared hacia arriba (0, 0 es wall)
    const hitWall = moveSelectedPlayer(state, "up");
    expect(hitWall.moved).toBe(false);
    expect(hitWall.blockedReason).toBe("wall");
    expect(getSelectedExplorer(hitWall.state).position).toEqual({
      column: 0,
      row: 1,
    });

    // Movimiento válido hacia la derecha (1, 1 es floor)
    const validMove = moveSelectedPlayer(state, "right");
    expect(validMove.moved).toBe(true);
    expect(validMove.blockedReason).toBe("none");
    state = validMove.state;
    expect(getSelectedExplorer(state).position).toEqual({ column: 1, row: 1 });
    // La entrada original en el mapa permanece intacta en (0, 1)
    expect(getSelectedExplorer(state).entrance).toEqual({ column: 0, row: 1 });
    expect(getSelectedExplorer(state).steps).toBe(1);
  });

  it("calcula visibilidad circular de radio 4 con distancia euclidiana y sin oclusión por paredes", () => {
    const result = buildControlledMazeResult();
    const origin = { column: 4, row: 4 };

    expect(DEFAULT_LANTERN_RADIUS).toBe(4);
    // Distancia exactamente 4 en eje ortogonal -> visible
    expect(isWithinLantern(origin, { column: 8, row: 4 }, 4)).toBe(true);
    expect(isWithinLantern(origin, { column: 4, row: 0 }, 4)).toBe(true);
    // (3, 2) desde (0, 0) -> sqrt(9 + 4) = sqrt(13) <= 4 -> visible
    expect(isWithinLantern(origin, { column: 7, row: 6 }, 4)).toBe(true);
    // Esquina (4, 4) -> sqrt(16 + 16) = sqrt(32) > 4 -> fuera del círculo
    expect(isWithinLantern(origin, { column: 8, row: 8 }, 4)).toBe(false);
    // (3, 3) -> sqrt(9 + 9) = sqrt(18) > 4 -> fuera del círculo
    expect(isWithinLantern(origin, { column: 7, row: 7 }, 4)).toBe(false);

    // Verifica ausencia de oclusión por paredes:
    // Desde (0, 1), la casilla (3, 1) es una pared, pero (4, 1) está a distancia 4 y debe ser visible
    const visibleFromJ1 = computeVisibleCells(
      result.maze,
      { column: 0, row: 1 },
      4,
    );
    const visibleKeys = new Set(visibleFromJ1.map(positionKey));
    expect(result.maze.cells[1]?.[3]).toBe("wall");
    expect(visibleKeys.has("4,1")).toBe(true);
  });

  it("conserva memoria persistente de exploración y separa la memoria entre jugadores", () => {
    let state = createViewerState(buildControlledMazeResult(), {
      viewMode: "lantern",
    });

    const j2InitialMemorySize = state.explorers[1]!.exploredKeys.size;
    // En (0,1), la casilla (0,4) está a distancia 3 -> inicialmente visible y explorada por J1
    expect(getSelectedExplorer(state).exploredKeys.has("0,4")).toBe(true);

    // Movemos a J1 varias casillas hacia el interior: (0,1)->(1,1)->(1,2)->(1,3)->(2,3)->(3,3)->(4,3)
    for (const dir of [
      "right",
      "down",
      "down",
      "right",
      "right",
      "right",
    ] as const) {
      const step = moveSelectedPlayer(state, dir);
      expect(step.moved).toBe(true);
      state = step.state;
    }

    const j1AfterMoves = getSelectedExplorer(state);
    expect(j1AfterMoves.position).toEqual({ column: 4, row: 3 });

    // (0, 1) ya quedó a distancia sqrt(16 + 4) = sqrt(20) > 4 de (4, 3):
    // Ya no está actualmente iluminada, pero sigue en la memoria explorada (penumbra)
    expect(
      getCellVisibility(
        { column: 0, row: 1 },
        j1AfterMoves.position,
        j1AfterMoves.exploredKeys,
        "lantern",
        4,
      ),
    ).toBe("explored");

    // Una casilla nunca alcanzada como (8, 8) sigue oculta
    expect(
      getCellVisibility(
        { column: 8, row: 8 },
        j1AfterMoves.position,
        j1AfterMoves.exploredKeys,
        "lantern",
        4,
      ),
    ).toBe("hidden");

    // Al cambiar a J2, su memoria y su posición permanecen intactas e independientes de J1
    state = selectPlayer(state, 1);
    const j2Explorer = getSelectedExplorer(state);
    expect(j2Explorer.position).toEqual({ column: 1, row: 0 });
    expect(j2Explorer.steps).toBe(0);
    expect(j2Explorer.exploredKeys.size).toBe(j2InitialMemorySize);
    expect(j2Explorer.exploredKeys.has("7,3")).toBe(false);
  });

  it("muestra a Kevin únicamente cuando está actualmente iluminado en modo linterna", () => {
    let state = createViewerState(buildControlledMazeResult(), {
      viewMode: "lantern",
    });
    // J1 inicia en (0, 1) y Kevin está en (4, 4). Distancia = sqrt(16 + 9) = 5 > 4 -> oculto
    expect(
      isKevinVisible(
        state.maze,
        getSelectedExplorer(state).position,
        "lantern",
        4,
      ),
    ).toBe(false);

    // En modo mapa completo siempre es visible
    expect(
      isKevinVisible(
        state.maze,
        getSelectedExplorer(state).position,
        "full",
        4,
      ),
    ).toBe(true);

    // Si J1 avanza un paso a (1, 1), la distancia a Kevin (4, 4) es sqrt(9 + 9) = sqrt(18) > 4 -> aún oculto
    state = moveSelectedPlayer(state, "right").state;
    expect(
      isKevinVisible(
        state.maze,
        getSelectedExplorer(state).position,
        "lantern",
        4,
      ),
    ).toBe(false);

    // Si J1 baja a (1, 2), la distancia a Kevin (4, 4) es sqrt(9 + 4) = sqrt(13) <= 4 -> ¡Kevin iluminado!
    state = moveSelectedPlayer(state, "down").state;
    expect(
      isKevinVisible(
        state.maze,
        getSelectedExplorer(state).position,
        "lantern",
        4,
      ),
    ).toBe(true);
    // La casilla de Kevin (4, 4) queda registrada en la memoria de casillas exploradas
    expect(getSelectedExplorer(state).exploredKeys.has("4,4")).toBe(true);

    // Si J1 retrocede a (1, 1), la casilla (4, 4) sigue en penumbra pero Kevin deja de mostrarse
    state = moveSelectedPlayer(state, "up").state;
    expect(getSelectedExplorer(state).exploredKeys.has("4,4")).toBe(true);
    expect(
      isKevinVisible(
        state.maze,
        getSelectedExplorer(state).position,
        "lantern",
        4,
      ),
    ).toBe(false);
  });

  it("reinicia la exploración del participante seleccionado sin borrar la de otros", () => {
    let state = createViewerState(buildControlledMazeResult(), {
      viewMode: "lantern",
    });
    const initialSizeJ1 = getSelectedExplorer(state).exploredKeys.size;

    // Movemos a J1
    state = moveSelectedPlayer(state, "right").state;
    state = moveSelectedPlayer(state, "down").state;
    expect(getSelectedExplorer(state).steps).toBe(2);
    expect(getSelectedExplorer(state).exploredKeys.size).toBeGreaterThan(
      initialSizeJ1,
    );

    // Cambiamos a J3 (8, 4) y lo movemos a la izquierda (7, 4)
    state = selectPlayer(state, 2);
    state = moveSelectedPlayer(state, "left").state;
    expect(getSelectedExplorer(state).steps).toBe(1);

    // Reiniciamos solo a J3
    state = resetPlayerExploration(state);
    expect(getSelectedExplorer(state).position).toEqual({ column: 8, row: 4 });
    expect(getSelectedExplorer(state).steps).toBe(0);

    // J1 conserva su avance previo
    state = selectPlayer(state, 0);
    expect(getSelectedExplorer(state).steps).toBe(2);

    // Reiniciamos a J1
    state = resetPlayerExploration(state);
    expect(getSelectedExplorer(state).position).toEqual({ column: 0, row: 1 });
    expect(getSelectedExplorer(state).steps).toBe(0);
    expect(getSelectedExplorer(state).exploredKeys.size).toBe(initialSizeJ1);
  });

  it("utiliza el motor real @kevin/maze-engine para laberinto 80×45 y rutas óptimas", () => {
    const generated = generateMaze(DEFAULT_VIEWER_CONFIG);
    expect("maze" in generated).toBe(true);
    if ("code" in generated) return;

    const state = createViewerState(generated);
    expect(state.maze.config.columns).toBe(80);
    expect(state.maze.config.rows).toBe(45);
    expect(state.maze.entrances).toHaveLength(6);
    expect(state.validation.valid).toBe(true);

    const path0 = computeOptimalPath(state.maze, 0);
    const enginePath0 = findShortestPath(
      state.maze,
      state.maze.entrances[0]!,
      state.maze.kevin,
    );
    expect(path0).toEqual(enginePath0);

    const allPaths = computeAllOptimalPaths(state.maze);
    expect(allPaths).toHaveLength(6);
    expect(allPaths.every((p) => p !== null && p.length > 1)).toBe(true);

    const nextSeed = generateNextSeed("integration-0", 1);
    expect(nextSeed).not.toBe("integration-0");
  });

  it("invalida el caché de terreno al regenerar con igual semilla y dimensiones pero distinta densidad, conservando la optimización al mover exploradores", () => {
    const lowDensityResult = generateMaze({
      ...DEFAULT_VIEWER_CONFIG,
      seed: "integration-0",
      extraConnectionRate: 0.05,
    });
    const highDensityResult = generateMaze({
      ...DEFAULT_VIEWER_CONFIG,
      seed: "integration-0",
      extraConnectionRate: 0.35,
    });

    expect("maze" in lowDensityResult).toBe(true);
    expect("maze" in highDensityResult).toBe(true);
    if ("code" in lowDensityResult || "code" in highDensityResult) return;

    // Ambos candidatos se aceptan en el intento 0 y comparten el mismo maze.id en el motor
    expect(lowDensityResult.maze.id).toBe(highDensityResult.maze.id);
    expect(lowDensityResult.maze.cells).not.toEqual(
      highDensityResult.maze.cells,
    );

    const layout = calculateViewportLayout(1600, 900, 80, 45, 14);
    const stateLow = createViewerState(lowDensityResult, {
      viewMode: "lantern",
    });
    const stateHigh = createViewerState(highDensityResult, {
      viewMode: "lantern",
    });

    // La firma y la clave de caché deben diferir aunque maze.id sea idéntico
    expect(computeMazeSignature(lowDensityResult.maze)).not.toBe(
      computeMazeSignature(highDensityResult.maze),
    );
    const lowKey = buildTerrainCacheKey(stateLow, layout);
    const highKey = buildTerrainCacheKey(stateHigh, layout);
    expect(lowKey).not.toBe(highKey);

    // Al regenerar con distinta densidad debe exigir redibujo del terreno
    expect(hasMazeChanged(stateLow, stateHigh)).toBe(true);
    expect(shouldRedrawTerrain(stateLow, stateHigh, lowKey, layout)).toBe(true);

    // En cambio, al mover un explorador o cambiar de jugador en el mismo mapa NO se redibuja el terreno
    const dirs = ["up", "down", "left", "right"] as const;
    let movedState = stateLow;
    for (const dir of dirs) {
      const attempt = moveSelectedPlayer(stateLow, dir);
      if (attempt.moved) {
        movedState = attempt.state;
        break;
      }
    }
    expect(movedState).not.toBe(stateLow);
    expect(hasMazeChanged(stateLow, movedState)).toBe(false);
    expect(shouldRedrawTerrain(stateLow, movedState, lowKey, layout)).toBe(
      false,
    );

    const switchedPlayerState = selectPlayer(movedState, 2);
    expect(hasMazeChanged(movedState, switchedPlayerState)).toBe(false);
    expect(
      shouldRedrawTerrain(movedState, switchedPlayerState, lowKey, layout),
    ).toBe(false);

    // Verifica que rutas, paredes, entradas y Kevin correspondan íntegramente al nuevo mapa regenerado
    for (const activeState of [stateLow, stateHigh]) {
      const { maze, explorers } = activeState;
      expect(maze.cells[maze.kevin.row]?.[maze.kevin.column]).toBe("floor");
      expect(explorers).toHaveLength(maze.entrances.length);

      const allPaths = computeAllOptimalPaths(maze);
      allPaths.forEach((path, idx) => {
        const entrance = maze.entrances[idx]!;
        expect(explorers[idx]?.entrance).toEqual(entrance);
        expect(explorers[idx]?.position).toEqual(entrance);
        expect(maze.cells[entrance.row]?.[entrance.column]).toBe("floor");

        expect(path).not.toBeNull();
        expect(path![0]).toEqual(entrance);
        expect(path![path!.length - 1]).toEqual(maze.kevin);
        for (const step of path!) {
          expect(maze.cells[step.row]?.[step.column]).toBe("floor");
        }
      });
    }
  });

  it("actualiza correctamente la visibilidad al alternar entre mapa completo y linterna sin invalidar el terreno estático", () => {
    const layout = calculateViewportLayout(1280, 720, 9, 9, 14);
    const fullState = createViewerState(buildControlledMazeResult(), {
      viewMode: "full",
    });
    const terrainKey = buildTerrainCacheKey(fullState, layout);

    // En modo mapa completo todas las casillas y Kevin son visibles
    expect(
      getCellVisibility(
        { column: 8, row: 8 },
        getSelectedExplorer(fullState).position,
        getSelectedExplorer(fullState).exploredKeys,
        fullState.viewMode,
        fullState.lanternRadius,
      ),
    ).toBe("visible");
    expect(
      isKevinVisible(
        fullState.maze,
        getSelectedExplorer(fullState).position,
        fullState.viewMode,
        fullState.lanternRadius,
      ),
    ).toBe(true);

    // Cambiar a modo linterna conserva el mismo terreno estático pero restringe la visibilidad
    const lanternState = { ...fullState, viewMode: "lantern" as const };
    expect(hasMazeChanged(fullState, lanternState)).toBe(false);
    expect(
      shouldRedrawTerrain(fullState, lanternState, terrainKey, layout),
    ).toBe(false);
    expect(
      getCellVisibility(
        { column: 8, row: 8 },
        getSelectedExplorer(lanternState).position,
        getSelectedExplorer(lanternState).exploredKeys,
        lanternState.viewMode,
        lanternState.lanternRadius,
      ),
    ).toBe("hidden");
    expect(
      isKevinVisible(
        lanternState.maze,
        getSelectedExplorer(lanternState).position,
        lanternState.viewMode,
        lanternState.lanternRadius,
      ),
    ).toBe(false);
  });
});
