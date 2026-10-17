import {
  findShortestPath,
  isTraversable,
  validateMaze,
  type Maze,
  type MazeConfig,
  type MazeMetrics,
  type MazeResult,
  type MazeValidation,
} from "@kevin/maze-engine";
import type { Position } from "@kevin/shared";

export type ViewMode = "full" | "lantern";
export type MoveDirection = "up" | "down" | "left" | "right";
export type CellVisibility = "visible" | "explored" | "hidden";

export interface ParticipantStyle {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly hex: string;
  readonly color: number;
}

export const DEFAULT_LANTERN_RADIUS = 4;

export const DEFAULT_VIEWER_CONFIG: Required<
  Pick<
    MazeConfig,
    | "columns"
    | "rows"
    | "seed"
    | "entranceCount"
    | "distanceTolerance"
    | "extraConnectionRate"
  >
> = {
  columns: 80,
  rows: 45,
  seed: "integration-0",
  entranceCount: 6,
  distanceTolerance: 0.15,
  extraConnectionRate: 0.14,
};

export const PARTICIPANT_PALETTE: readonly ParticipantStyle[] = [
  {
    index: 0,
    id: "J1",
    name: "Jugador 1",
    hex: "#38bdf8",
    color: 0x38bdf8,
  },
  {
    index: 1,
    id: "J2",
    name: "Jugador 2",
    hex: "#f43f5e",
    color: 0xf43f5e,
  },
  {
    index: 2,
    id: "J3",
    name: "Jugador 3",
    hex: "#a855f7",
    color: 0xa855f7,
  },
  {
    index: 3,
    id: "J4",
    name: "Jugador 4",
    hex: "#22c55e",
    color: 0x22c55e,
  },
  {
    index: 4,
    id: "J5",
    name: "Jugador 5",
    hex: "#f59e0b",
    color: 0xf59e0b,
  },
  {
    index: 5,
    id: "J6",
    name: "Jugador 6",
    hex: "#ec4899",
    color: 0xec4899,
  },
] as const;

export interface ViewportLayout {
  readonly cellSize: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ScreenCellRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

export interface PlayerExplorationState {
  readonly playerIndex: number;
  readonly id: string;
  readonly entrance: Position;
  readonly position: Position;
  readonly exploredKeys: ReadonlySet<string>;
  readonly visibleKeys: ReadonlySet<string>;
  readonly steps: number;
  readonly reachedKevin: boolean;
}

export interface ViewerDisplayOptions {
  readonly viewMode?: ViewMode;
  readonly lanternRadius?: number;
  readonly showSelectedPath?: boolean;
  readonly showAllPaths?: boolean;
  readonly showGrid?: boolean;
  readonly showEntranceLabels?: boolean;
  readonly showArticulationPoints?: boolean;
  readonly includePathsInExport?: boolean;
}

export interface ViewerState {
  readonly maze: Maze;
  readonly mazeSignature: string;
  readonly metrics: MazeMetrics;
  readonly validation: MazeValidation;
  readonly selectedPlayerIndex: number;
  readonly viewMode: ViewMode;
  readonly lanternRadius: number;
  readonly showSelectedPath: boolean;
  readonly showAllPaths: boolean;
  readonly showGrid: boolean;
  readonly showEntranceLabels: boolean;
  readonly showArticulationPoints: boolean;
  readonly includePathsInExport: boolean;
  readonly explorers: readonly PlayerExplorationState[];
}

export interface MoveAttemptResult {
  readonly state: ViewerState;
  readonly moved: boolean;
  readonly blockedReason: "none" | "wall" | "bounds";
  readonly position: Position;
  readonly reachedKevin: boolean;
}

export function positionKey(position: Position): string {
  return `${position.column},${position.row}`;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.column === b.column && a.row === b.row;
}

/**
 * Calcula una firma determinista del contenido real del laberinto (matriz cells, entradas,
 * posición de Kevin y configuración), evitando depender únicamente de maze.id.
 */
export function computeMazeSignature(maze: Maze): string {
  let hashA = 2166136261;
  let hashB = 0x811c9dc5 ^ 0x5bd1e995;

  const mix = (value: number): void => {
    hashA = Math.imul(hashA ^ value, 16777619);
    hashB = Math.imul(hashB ^ ((value << 5) | (value >>> 27)), 1597334677);
  };

  for (let row = 0; row < maze.cells.length; row += 1) {
    const rowCells = maze.cells[row];
    if (!rowCells) continue;
    mix(row + 1);
    for (let col = 0; col < rowCells.length; col += 1) {
      mix(rowCells[col] === "floor" ? 1 : 2);
    }
  }

  mix(maze.kevin.column);
  mix(maze.kevin.row);
  for (const entrance of maze.entrances) {
    mix(entrance.column);
    mix(entrance.row);
  }

  const hexA = (hashA >>> 0).toString(16).padStart(8, "0");
  const hexB = (hashB >>> 0).toString(16).padStart(8, "0");
  const cfg = maze.config;
  const entriesTag = maze.entrances
    .map((e) => `${e.column},${e.row}`)
    .join(";");

  return [
    maze.id,
    `${cfg.columns}x${cfg.rows}`,
    cfg.seed,
    cfg.entranceCount,
    cfg.extraConnectionRate ?? "default",
    cfg.distanceTolerance ?? "default",
    `${maze.kevin.column},${maze.kevin.row}`,
    entriesTag,
    `${hexA}${hexB}`,
  ].join("|");
}

/**
 * Determina si el laberinto o su matriz cambiaron entre dos estados del visor,
 * comprobando tanto referencias de matriz/mapa como la firma estructural completa.
 */
export function hasMazeChanged(
  previousState: ViewerState | null,
  nextState: ViewerState,
): boolean {
  if (!previousState) {
    return true;
  }
  return (
    previousState.maze !== nextState.maze ||
    previousState.maze.cells !== nextState.maze.cells ||
    previousState.mazeSignature !== nextState.mazeSignature
  );
}

export function buildTerrainCacheKey(
  state: ViewerState,
  layout: ViewportLayout,
): string {
  return `${state.mazeSignature}:${layout.cellSize}:${layout.offsetX}:${layout.offsetY}:${state.showGrid}`;
}

export function shouldRedrawTerrain(
  previousState: ViewerState | null,
  nextState: ViewerState,
  previousTerrainKey: string,
  nextLayout: ViewportLayout,
): boolean {
  if (hasMazeChanged(previousState, nextState)) {
    return true;
  }
  if (previousState && previousState.showGrid !== nextState.showGrid) {
    return true;
  }
  return buildTerrainCacheKey(nextState, nextLayout) !== previousTerrainKey;
}

export function getParticipantStyle(index: number): ParticipantStyle {
  return (
    PARTICIPANT_PALETTE[index % PARTICIPANT_PALETTE.length] ??
    PARTICIPANT_PALETTE[0]!
  );
}

/**
 * Calcula un tamaño uniforme de casilla cuadrada sin deformar la proporción (16:9 para 80×45).
 */
export function calculateViewportLayout(
  containerWidth: number,
  containerHeight: number,
  columns: number,
  rows: number,
  padding = 16,
): ViewportLayout {
  const safeCols = Math.max(1, columns);
  const safeRows = Math.max(1, rows);
  const availableWidth = Math.max(64, containerWidth - padding * 2);
  const availableHeight = Math.max(64, containerHeight - padding * 2);
  const rawCellSize = Math.min(
    availableWidth / safeCols,
    availableHeight / safeRows,
  );
  const cellSize = Math.max(2, Number(rawCellSize.toFixed(4)));
  const mapWidth = cellSize * safeCols;
  const mapHeight = cellSize * safeRows;
  const offsetX = (containerWidth - mapWidth) / 2;
  const offsetY = (containerHeight - mapHeight) / 2;

  return {
    cellSize,
    mapWidth,
    mapHeight,
    offsetX,
    offsetY,
  };
}

/**
 * Convierte coordenadas de la matriz (columna, fila) a coordenadas de pantalla.
 * Respeta estrictamente cells[row][column]: column -> eje X, row -> eje Y.
 */
export function gridToScreen(
  position: Position,
  cellSize: number,
  origin: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): ScreenCellRect {
  const x = origin.x + position.column * cellSize;
  const y = origin.y + position.row * cellSize;
  return {
    x,
    y,
    width: cellSize,
    height: cellSize,
    centerX: x + cellSize / 2,
    centerY: y + cellSize / 2,
  };
}

/**
 * Convierte coordenadas de pantalla a una posición (columna, fila) de la matriz,
 * o devuelve null si cae fuera del mapa.
 */
export function screenToGrid(
  screenX: number,
  screenY: number,
  cellSize: number,
  columns: number,
  rows: number,
  origin: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): Position | null {
  if (cellSize <= 0 || columns <= 0 || rows <= 0) {
    return null;
  }
  const localX = screenX - origin.x;
  const localY = screenY - origin.y;
  if (localX < 0 || localY < 0) {
    return null;
  }
  const column = Math.floor(localX / cellSize);
  const row = Math.floor(localY / cellSize);
  if (column < 0 || column >= columns || row < 0 || row >= rows) {
    return null;
  }
  return { column, row };
}

export function euclideanDistance(a: Position, b: Position): number {
  return Math.hypot(b.column - a.column, b.row - a.row);
}

/**
 * Comprueba si una casilla está dentro del círculo de la linterna usando distancia euclidiana,
 * sin oclusión por paredes.
 */
export function isWithinLantern(
  origin: Position,
  target: Position,
  radius = DEFAULT_LANTERN_RADIUS,
): boolean {
  if (radius < 0) return false;
  const dx = target.column - origin.column;
  const dy = target.row - origin.row;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Obtiene todas las casillas del laberinto iluminadas por la linterna circular desde origin.
 * No aplica raycasting ni bloqueo por muros.
 */
export function computeVisibleCells(
  maze: Maze,
  origin: Position,
  radius = DEFAULT_LANTERN_RADIUS,
): Position[] {
  const rCeil = Math.ceil(radius);
  const minRow = Math.max(0, origin.row - rCeil);
  const maxRow = Math.min(maze.config.rows - 1, origin.row + rCeil);
  const minCol = Math.max(0, origin.column - rCeil);
  const maxCol = Math.min(maze.config.columns - 1, origin.column + rCeil);

  const visible: Position[] = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minCol; column <= maxCol; column += 1) {
      const candidate: Position = { column, row };
      if (isWithinLantern(origin, candidate, radius)) {
        visible.push(candidate);
      }
    }
  }
  return visible;
}

export function getCellVisibility(
  cell: Position,
  explorerPosition: Position,
  exploredKeys: ReadonlySet<string>,
  viewMode: ViewMode,
  radius = DEFAULT_LANTERN_RADIUS,
): CellVisibility {
  if (viewMode === "full") {
    return "visible";
  }
  if (isWithinLantern(explorerPosition, cell, radius)) {
    return "visible";
  }
  if (exploredKeys.has(positionKey(cell))) {
    return "explored";
  }
  return "hidden";
}

/**
 * En modo linterna, Kevin es visible únicamente cuando su casilla está actualmente iluminada.
 */
export function isKevinVisible(
  maze: Maze,
  explorerPosition: Position,
  viewMode: ViewMode,
  radius = DEFAULT_LANTERN_RADIUS,
): boolean {
  if (viewMode === "full") {
    return true;
  }
  return isWithinLantern(explorerPosition, maze.kevin, radius);
}

function createInitialExplorerState(
  maze: Maze,
  playerIndex: number,
  radius: number,
): PlayerExplorationState {
  const entrance = maze.entrances[playerIndex];
  if (!entrance) {
    throw new RangeError(`No existe entrada para el índice ${playerIndex}.`);
  }
  const initialPosition: Position = {
    column: entrance.column,
    row: entrance.row,
  };
  const visible = computeVisibleCells(maze, initialPosition, radius);
  const keys = new Set<string>(visible.map(positionKey));
  return {
    playerIndex,
    id: getParticipantStyle(playerIndex).id,
    entrance: { column: entrance.column, row: entrance.row },
    position: initialPosition,
    exploredKeys: keys,
    visibleKeys: new Set<string>(keys),
    steps: 0,
    reachedKevin: samePosition(initialPosition, maze.kevin),
  };
}

export function createViewerState(
  result: MazeResult,
  options: ViewerDisplayOptions = {},
): ViewerState {
  const lanternRadius = options.lanternRadius ?? DEFAULT_LANTERN_RADIUS;
  const validation = validateMaze(
    result.maze,
    result.maze.entrances,
    result.maze.kevin,
  );
  const explorers: PlayerExplorationState[] = result.maze.entrances.map(
    (_, index) => createInitialExplorerState(result.maze, index, lanternRadius),
  );

  return {
    maze: result.maze,
    mazeSignature: computeMazeSignature(result.maze),
    metrics: result.metrics,
    validation,
    selectedPlayerIndex: 0,
    viewMode: options.viewMode ?? "full",
    lanternRadius,
    showSelectedPath: options.showSelectedPath ?? true,
    showAllPaths: options.showAllPaths ?? false,
    showGrid: options.showGrid ?? false,
    showEntranceLabels: options.showEntranceLabels ?? true,
    showArticulationPoints: options.showArticulationPoints ?? false,
    includePathsInExport: options.includePathsInExport ?? true,
    explorers,
  };
}

export function getSelectedExplorer(
  state: ViewerState,
): PlayerExplorationState {
  return state.explorers[state.selectedPlayerIndex] ?? state.explorers[0]!;
}

export function selectPlayer(
  state: ViewerState,
  playerIndex: number,
): ViewerState {
  if (
    !Number.isInteger(playerIndex) ||
    playerIndex < 0 ||
    playerIndex >= state.explorers.length
  ) {
    return state;
  }
  if (playerIndex === state.selectedPlayerIndex) {
    return state;
  }
  return {
    ...state,
    selectedPlayerIndex: playerIndex,
  };
}

const DIRECTION_DELTAS: Readonly<
  Record<MoveDirection, { readonly dx: number; readonly dy: number }>
> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * Intenta desplazar al participante seleccionado una casilla ortogonal.
 * Conserva inmutable la entrada original del mapa y actualiza solo la posición de prueba
 * y la memoria de exploración individual del jugador.
 */
export function moveSelectedPlayer(
  state: ViewerState,
  direction: MoveDirection,
): MoveAttemptResult {
  const explorer = getSelectedExplorer(state);
  const delta = DIRECTION_DELTAS[direction];
  const candidate: Position = {
    column: explorer.position.column + delta.dx,
    row: explorer.position.row + delta.dy,
  };

  if (
    candidate.column < 0 ||
    candidate.row < 0 ||
    candidate.column >= state.maze.config.columns ||
    candidate.row >= state.maze.config.rows
  ) {
    return {
      state,
      moved: false,
      blockedReason: "bounds",
      position: explorer.position,
      reachedKevin: explorer.reachedKevin,
    };
  }

  if (!isTraversable(state.maze, candidate)) {
    return {
      state,
      moved: false,
      blockedReason: "wall",
      position: explorer.position,
      reachedKevin: explorer.reachedKevin,
    };
  }

  const visibleCells = computeVisibleCells(
    state.maze,
    candidate,
    state.lanternRadius,
  );
  const nextVisibleKeys = new Set<string>(visibleCells.map(positionKey));
  const nextExploredKeys = new Set<string>(explorer.exploredKeys);
  for (const key of nextVisibleKeys) {
    nextExploredKeys.add(key);
  }

  const reachedKevin = samePosition(candidate, state.maze.kevin);
  const updatedExplorer: PlayerExplorationState = {
    ...explorer,
    position: candidate,
    exploredKeys: nextExploredKeys,
    visibleKeys: nextVisibleKeys,
    steps: explorer.steps + 1,
    reachedKevin,
  };

  const nextExplorers = state.explorers.map((item, idx) =>
    idx === state.selectedPlayerIndex ? updatedExplorer : item,
  );

  return {
    state: {
      ...state,
      explorers: nextExplorers,
    },
    moved: true,
    blockedReason: "none",
    position: candidate,
    reachedKevin,
  };
}

/**
 * Reinicia la posición de prueba y la memoria de exploración del jugador indicado
 * (o del jugador actualmente seleccionado), sin alterar la memoria de los demás jugadores.
 */
export function resetPlayerExploration(
  state: ViewerState,
  playerIndex = state.selectedPlayerIndex,
): ViewerState {
  if (
    !Number.isInteger(playerIndex) ||
    playerIndex < 0 ||
    playerIndex >= state.explorers.length
  ) {
    return state;
  }
  const resetExplorer = createInitialExplorerState(
    state.maze,
    playerIndex,
    state.lanternRadius,
  );
  const nextExplorers = state.explorers.map((item, idx) =>
    idx === playerIndex ? resetExplorer : item,
  );
  return {
    ...state,
    explorers: nextExplorers,
  };
}

/**
 * Obtiene el camino óptimo real usando exclusivamente findShortestPath del motor.
 */
export function computeOptimalPath(
  maze: Maze,
  playerIndex: number,
): Position[] | null {
  const entrance = maze.entrances[playerIndex];
  if (!entrance) {
    return null;
  }
  return findShortestPath(maze, entrance, maze.kevin);
}

/**
 * Obtiene los caminos óptimos de todas las entradas hacia Kevin usando findShortestPath.
 */
export function computeAllOptimalPaths(maze: Maze): (Position[] | null)[] {
  return maze.entrances.map((_, index) => computeOptimalPath(maze, index));
}

/**
 * Genera una nueva semilla reproducible distinta de la actual.
 */
export function generateNextSeed(
  currentSeed: string,
  sequence: number,
): string {
  const trimmed = currentSeed.trim();
  const baseCandidate = `kel-003-semilla-${sequence}`;
  if (baseCandidate !== trimmed) {
    return baseCandidate;
  }
  return `kel-003-semilla-${sequence + 1}`;
}
