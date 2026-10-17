import { describe, expect, it } from "vitest";
import {
  calculateMazeMetrics,
  findShortestPath,
  generateMaze,
  type Maze,
  type MazeResult,
} from "../packages/maze-engine/src/index.js";
import {
  calculateViewportLayout,
  computeAllOptimalPaths,
  computeOptimalPath,
  computeVisibleCells,
  createViewerState,
  DEFAULT_LANTERN_RADIUS,
  DEFAULT_VIEWER_CONFIG,
  generateNextSeed,
  getCellVisibility,
  getSelectedExplorer,
  gridToScreen,
  isKevinVisible,
  isWithinLantern,
  moveSelectedPlayer,
  positionKey,
  resetPlayerExploration,
  screenToGrid,
  selectPlayer,
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
});
