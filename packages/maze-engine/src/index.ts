import type { Position } from "@kevin/shared";

export type Terrain = "wall" | "floor";
export type CellMatrix = readonly (readonly Terrain[])[];

export interface MazeConfig {
  readonly columns: number;
  readonly rows: number;
  readonly seed: string;
  readonly entranceCount: number;
  readonly distanceTolerance?: number;
  readonly extraConnectionRate?: number;
  readonly maxAttempts?: number;
}

export interface Maze {
  readonly id: string;
  readonly config: MazeConfig;
  readonly cells: CellMatrix;
  readonly entrances: readonly Position[];
  readonly kevin: Position;
}

export interface DistanceMetrics {
  readonly byEntrance: readonly number[];
  readonly minimum: number;
  readonly maximum: number;
  readonly average: number;
  readonly relativeDifference: number;
}
export interface MazeMetrics {
  readonly isConnected: boolean;
  readonly entranceDistanceTolerance: number;
  readonly distance: DistanceMetrics;
  readonly traversableCells: number;
  readonly wallCells: number;
  readonly traversablePercentage: number;
  readonly junctions: number;
  readonly deadEnds: number;
  readonly independentCycles: number;
  readonly articulationPoints: readonly Position[];
  readonly hasSharedBottleneck: boolean;
  readonly kevinRegionEntrances: number;
}
export interface MazeValidation {
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly metrics: MazeMetrics;
}
export interface MazeResult {
  readonly maze: Maze;
  readonly metrics: MazeMetrics;
}
export interface GenerationError {
  readonly code: "INVALID_CONFIG" | "MAX_ATTEMPTS_EXHAUSTED";
  readonly message: string;
  readonly attempts: number;
  readonly reasons: readonly string[];
}
export type GenerateMazeResult = MazeResult | GenerationError;
export interface ValidationOptions {
  readonly distanceTolerance?: number;
  readonly rejectSharedBottleneck?: boolean;
}

const dirs = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const defaults = {
  distanceTolerance: 0.15,
  extraConnectionRate: 0.14,
  maxAttempts: 12,
} as const;
const key = (p: Position): string => `${p.column},${p.row}`;
const same = (a: Position, b: Position): boolean =>
  a.column === b.column && a.row === b.row;

/** FNV-1a + mulberry32: PRNG determinista, serializable y sin Math.random. */
function createRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1)
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function validConfig(c: Required<MazeConfig>): boolean {
  return (
    Number.isInteger(c.columns) &&
    Number.isInteger(c.rows) &&
    c.columns >= 7 &&
    c.rows >= 7 &&
    c.entranceCount >= 3 &&
    c.entranceCount <= 6 &&
    c.maxAttempts > 0 &&
    c.distanceTolerance >= 0
  );
}

function makeEntrances(columns: number, rows: number, count: number): Position[] {
  return [{ column: 0, row: 1 }, { column: columns - 1, row: 1 }, { column: 1, row: 0 }, { column: columns - 2, row: rows - 1 }, { column: 0, row: rows - 2 }, { column: columns - 1, row: rows - 2 }].slice(0, count);
}
export interface CandidateDiagnostic {
  seed: string;
  attempt: number;
  kevinCandidates: number;
  entranceCombinations: number;
  candidateDistances: number[];
  validation: MazeValidation;
}
export function diagnoseCandidate(input: MazeConfig, attempt = 0): CandidateDiagnostic {
  const detail = { kevinCandidates: 1, entranceCombinations: 0, candidateDistances: [] as number[] };
  const maze = buildCandidate({ ...defaults, ...input }, attempt, detail);
  return { seed: input.seed, attempt, ...detail, validation: validateMaze(maze, maze.entrances, maze.kevin) };
}
function buildCandidate(config: Required<MazeConfig>, attempt: number, diagnostic?: { kevinCandidates: number; entranceCombinations: number; candidateDistances: number[] }): Maze {
  /* real DFS rasterized maze */
  const rng = createRandom(`${config.seed}:${attempt}`);
  const cells: Terrain[][] = Array.from({ length: config.rows }, () => Array.from({ length: config.columns }, () => "wall"));
  const lc = Math.floor((config.columns - 1) / 2), lr = Math.floor((config.rows - 1) / 2);
  const node = (x: number, y: number): Position => ({ column: x * 2 + 1, row: y * 2 + 1 });
  const seen = new Set<string>(), stack = [node(Math.floor(rng() * lc), Math.floor(rng() * lr))];
  while (stack.length) { const current = stack[stack.length - 1]!; if (!seen.has(key(current))) { seen.add(key(current)); cells[current.row]![current.column] = "floor"; }
    const options = dirs.map(([x, y]) => ({ column: current.column + x * 2, row: current.row + y * 2 })).filter((p) => p.column > 0 && p.row > 0 && p.column < config.columns - 1 && p.row < config.rows - 1 && !seen.has(key(p)));
    if (!options.length) { stack.pop(); } else { const next = options[Math.floor(rng() * options.length)]!; cells[(current.row + next.row) / 2]![((current.column + next.column) / 2)] = "floor"; stack.push(next); }
  }
  for (let y = 0; y < lr; y += 1) for (let x = 0; x < lc; x += 1) for (const [dx, dy] of [[1, 0], [0, 1]] as const) if (x + dx < lc && y + dy < lr && rng() < config.extraConnectionRate) { const a = node(x, y), b = node(x + dx, y + dy); cells[(a.row + b.row) / 2]![((a.column + b.column) / 2)] = "floor"; }
  const nodes: Position[] = []; for (let y = 0; y < lr; y += 1) for (let x = 0; x < lc; x += 1) nodes.push(node(x, y));
  const inner = nodes.filter((p) => p.column > 5 && p.row > 5 && p.column < config.columns - 6 && p.row < config.rows - 6); const kevin = inner[Math.floor(rng() * inner.length)]!;
  const candidates: { entry: Position; inner: Position; side: string }[] = [];
  for (let x = 0; x < lc; x += 1) { const top = node(x, 0), bottom = node(x, lr - 1); candidates.push({ entry: { column: top.column, row: 0 }, inner: top, side: "top" }, { entry: { column: bottom.column, row: config.rows - 1 }, inner: bottom, side: "bottom" }); }
  for (let y = 0; y < lr; y += 1) { const left = node(0, y), right = node(lc - 1, y); candidates.push({ entry: { column: 0, row: left.row }, inner: left, side: "left" }, { entry: { column: config.columns - 1, row: right.row }, inner: right, side: "right" }); }
  const provisional: Maze = { id: "candidate", config, cells, entrances: [], kevin }; const fromKevin = distancesFrom(provisional, kevin); const scored = candidates.map((c) => ({ ...c, distance: (fromKevin.get(key(c.inner)) ?? -1) + 1 })).filter((c) => c.distance > 0).sort((a, b) => a.distance - b.distance);
  const selected: typeof scored = []; for (const base of scored) { const pool = scored.filter((c) => c.distance <= base.distance / (1 - config.distanceTolerance)); if (pool.length >= config.entranceCount && new Set(pool.map((c) => c.side)).size === 4) { for (const side of ["top", "bottom", "left", "right"]) { const choices = pool.filter((c) => c.side === side); selected.push(choices[Math.floor(rng() * choices.length)]!); } for (const c of pool) if (selected.length < config.entranceCount && !selected.includes(c)) selected.push(c); break; } }
  if (diagnostic) { diagnostic.candidateDistances = scored.map((c) => c.distance); diagnostic.entranceCombinations = selected.length ? 1 : 0; }
  if (selected.length === config.entranceCount) { for (const e of selected) { cells[e.entry.row]![e.entry.column] = "floor"; const gap = Math.abs(e.entry.column - e.inner.column) + Math.abs(e.entry.row - e.inner.row); if (gap === 2) cells[(e.entry.row + e.inner.row) / 2]![((e.entry.column + e.inner.column) / 2)] = "floor"; } return { id: `maze-${config.seed}-${attempt}`, config, cells, entrances: selected.map((e) => e.entry), kevin }; }
  return { id: "invalid", config, cells, entrances: [], kevin };
  {
  // legacy candidate retained only while replacing generator
  for (let row = 2; row < config.rows - 2; row += 1)
    for (let column = 2; column < config.columns - 2; column += 1)
      if (
        row % 3 === 1 &&
        column % 3 === 1 &&
        rng() > config.extraConnectionRate
      )
        cells[row]![column] = "wall";
  const midColumn = Math.floor(config.columns / 2),
    midRow = Math.floor(config.rows / 2);
  for (let row = 0; row < config.rows; row += 1) {
    cells[row]![0] = "floor";
    cells[row]![config.columns - 1] = "floor";
    cells[row]![midColumn] = "floor";
  }
  // Dos callejones controlados conectados al corredor general; son variedad, no restricciones de validez.
  for (const deadEnd of [
    { column: 3, row: 3 },
    { column: config.columns - 4, row: config.rows - 4 },
  ]) {
    cells[deadEnd.row]![deadEnd.column] = "floor";
    cells[deadEnd.row - 1]![deadEnd.column] = "wall";
    cells[deadEnd.row + 1]![deadEnd.column] = "wall";
    cells[deadEnd.row]![deadEnd.column - 1] = "wall";
    cells[deadEnd.row]![deadEnd.column + 1] = "floor";
  }
  for (let column = 0; column < config.columns; column += 1) {
    cells[0]![column] = "floor";
    cells[config.rows - 1]![column] = "floor";
    cells[midRow]![column] = "floor";
  }
  const entrances = makeEntrances(
    config.columns,
    config.rows,
    config.entranceCount,
  );
  // Kevin varía con la semilla en la franja central transitables, lejos del perímetro.
  const kevin = {
    column: Math.max(
      2,
      Math.min(config.columns - 3, midColumn + Math.floor((rng() - 0.5) * 8)),
    ),
    row: midRow,
  };
  cells[kevin.row]![kevin.column] = "floor";
  return {
    id: `maze-${config.seed}-${attempt}`,
    config,
    cells,
    entrances,
    kevin,
  };
  }
}

export function isTraversable(maze: Maze, p: Position): boolean {
  return (
    p.column >= 0 &&
    p.row >= 0 &&
    p.column < maze.config.columns &&
    p.row < maze.config.rows &&
    maze.cells[p.row]?.[p.column] === "floor"
  );
}
function neighbours(maze: Maze, p: Position): Position[] {
  return dirs
    .map(([x, y]) => ({ column: p.column + x, row: p.row + y }))
    .filter((next) => isTraversable(maze, next));
}

export function generateMaze(input: MazeConfig): GenerateMazeResult {
  const config: Required<MazeConfig> = { ...defaults, ...input };
  if (!validConfig(config))
    return {
      code: "INVALID_CONFIG",
      message: "Configuración inválida.",
      attempts: 0,
      reasons: ["Dimensiones, entradas o límites inválidos."],
    };
  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    const maze = buildCandidate(config, attempt);
    const validation = validateMaze(maze, maze.entrances, maze.kevin);
    if (validation.valid) return { maze, metrics: validation.metrics };
  }
  return {
    code: "MAX_ATTEMPTS_EXHAUSTED",
    message: "No se encontró un candidato válido.",
    attempts: config.maxAttempts,
    reasons: ["Los candidatos no cumplieron validación."],
  };
}

/** BFS ortogonal; un único mapa de distancias se reutiliza para todas las entradas. */
export function distancesFrom(
  maze: Maze,
  start: Position,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!isTraversable(maze, start)) return result;
  const queue = [start];
  result.set(key(start), 0);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const distance = result.get(key(current))!;
    for (const next of neighbours(maze, current))
      if (!result.has(key(next))) {
        result.set(key(next), distance + 1);
        queue.push(next);
      }
  }
  return result;
}
export function findShortestPath(
  maze: Maze,
  start: Position,
  goal: Position,
): Position[] | null {
  if (!isTraversable(maze, start) || !isTraversable(maze, goal)) return null;
  const previous = new Map<string, Position>();
  const queue = [start];
  previous.set(key(start), start);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    if (same(current, goal)) {
      const path: Position[] = [goal];
      let cursor = goal;
      while (!same(cursor, start)) {
        cursor = previous.get(key(cursor))!;
        path.push(cursor);
      }
      return path.reverse();
    }
    for (const next of neighbours(maze, current))
      if (!previous.has(key(next))) {
        previous.set(key(next), current);
        queue.push(next);
      }
  }
  return null;
}

function articulationPoints(maze: Maze): Position[] {
  const discovery = new Map<string, number>(),
    low = new Map<string, number>(),
    parent = new Map<string, string | undefined>(),
    points = new Map<string, Position>();
  let clock = 0;
  const visit = (p: Position): void => {
    const id = key(p);
    discovery.set(id, ++clock);
    low.set(id, clock);
    let children = 0;
    for (const next of neighbours(maze, p)) {
      const nextId = key(next);
      if (!discovery.has(nextId)) {
        parent.set(nextId, id);
        children += 1;
        visit(next);
        low.set(id, Math.min(low.get(id)!, low.get(nextId)!));
        if (
          (parent.get(id) === undefined && children > 1) ||
          (parent.get(id) !== undefined &&
            low.get(nextId)! >= discovery.get(id)!)
        )
          points.set(id, p);
      } else if (nextId !== parent.get(id))
        low.set(id, Math.min(low.get(id)!, discovery.get(nextId)!));
    }
  };
  for (let row = 0; row < maze.config.rows; row += 1)
    for (let column = 0; column < maze.config.columns; column += 1) {
      const p = { column, row };
      if (isTraversable(maze, p) && !discovery.has(key(p))) visit(p);
    }
  return [...points.values()];
}
export function hasSharedBottleneck(
  maze: Maze,
  entrances: readonly Position[],
  kevin: Position,
): boolean {
  for (const point of articulationPoints(maze)) {
    if (same(point, kevin)) continue;
    const cells = maze.cells.map((row, y) =>
      row.map((terrain, x) =>
        x === point.column && y === point.row ? "wall" : terrain,
      ),
    );
    const blocked = { ...maze, cells };
    if (
      entrances.every(
        (entry) => findShortestPath(blocked, entry, kevin) === null,
      )
    )
      return true;
  }
  return false;
}
export function calculateMazeMetrics(
  maze: Maze,
  entrances = maze.entrances,
  kevin = maze.kevin,
): MazeMetrics {
  const fromKevin = distancesFrom(maze, kevin);
  const byEntrance = entrances.map((entry) => fromKevin.get(key(entry)) ?? -1);
  const distances = byEntrance.filter((distance) => distance > 0);
  const minimum = distances.length ? Math.min(...distances) : 0,
    maximum = distances.length ? Math.max(...distances) : 0;
  let floors = 0,
    degreeTotal = 0,
    junctions = 0,
    deadEnds = 0;
  for (let row = 0; row < maze.config.rows; row += 1)
    for (let column = 0; column < maze.config.columns; column += 1) {
      const p = { column, row };
      if (isTraversable(maze, p)) {
        floors += 1;
        const degree = neighbours(maze, p).length;
        degreeTotal += degree;
        if (degree >= 3) junctions += 1;
        if (degree === 1) deadEnds += 1;
      }
    }
  const points = articulationPoints(maze);
  const connected =
    fromKevin.size === floors && distances.length === entrances.length;
  return {
    isConnected: connected,
    entranceDistanceTolerance:
      maze.config.distanceTolerance ?? defaults.distanceTolerance,
    distance: {
      byEntrance,
      minimum,
      maximum,
      average:
        distances.reduce((sum, value) => sum + value, 0) /
        Math.max(1, distances.length),
      relativeDifference: maximum ? (maximum - minimum) / maximum : Infinity,
    },
    traversableCells: floors,
    wallCells: maze.config.columns * maze.config.rows - floors,
    traversablePercentage: floors / (maze.config.columns * maze.config.rows),
    junctions,
    deadEnds,
    independentCycles: Math.max(0, degreeTotal / 2 - floors + (floors ? 1 : 0)),
    articulationPoints: points,
    hasSharedBottleneck: hasSharedBottleneck(maze, entrances, kevin),
    kevinRegionEntrances: neighbours(maze, kevin).length,
  };
}
export function validateMaze(
  maze: Maze,
  entrances: readonly Position[],
  kevin: Position,
  options: ValidationOptions = {},
): MazeValidation {
  const metrics = calculateMazeMetrics(maze, entrances, kevin);
  const tolerance =
    options.distanceTolerance ??
    maze.config.distanceTolerance ??
    defaults.distanceTolerance;
  const reasons: string[] = [];
  if (
    entrances.length < 3 ||
    entrances.length > 6 ||
    new Set(entrances.map(key)).size !== entrances.length
  )
    reasons.push("Las entradas no son válidas.");
  if (
    !isTraversable(maze, kevin) ||
    entrances.some((entry) => !isTraversable(maze, entry))
  )
    reasons.push("Kevin o una entrada no son transitables.");
  if (!metrics.isConnected) reasons.push("No existe conectividad completa.");
  if (metrics.distance.relativeDifference > tolerance)
    reasons.push("Las distancias no están equilibradas.");
  if (options.rejectSharedBottleneck !== false && metrics.hasSharedBottleneck)
    reasons.push("Existe un cuello de botella común.");
  return { valid: reasons.length === 0, reasons, metrics };
}
