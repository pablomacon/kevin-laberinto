import type { Position } from "@kevin/shared";

export type Terrain = "wall" | "floor";
export type CellMatrix = readonly (readonly Terrain[])[];
export interface StructureLimits {
  readonly maxFloorRatio?: number;
  readonly minDeadEnds?: number;
  readonly minJunctions?: number;
  readonly maxStraightRun?: number;
  readonly maxStraightFraction?: number;
}

export interface MazeConfig {
  readonly columns: number;
  readonly rows: number;
  readonly seed: string;
  readonly entranceCount: number;
  readonly distanceTolerance?: number;
  readonly extraConnectionRate?: number;
  readonly maxAttempts?: number;
  readonly structure?: StructureLimits;
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
  readonly corridors: {
    readonly lengths: readonly number[];
    readonly maximum: number;
    readonly average: number;
    readonly longestStraightRun: number;
    readonly horizontalRun: number;
    readonly verticalRun: number;
  };
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
  structure: {
    maxFloorRatio: 0.6,
    minDeadEnds: 1,
    minJunctions: 1,
    maxStraightFraction: 0.9,
  },
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
    Number.isInteger(c.entranceCount) &&
    c.entranceCount >= 3 &&
    c.entranceCount <= 6 &&
    Number.isInteger(c.maxAttempts) &&
    c.maxAttempts > 0 &&
    Number.isFinite(c.distanceTolerance) &&
    c.distanceTolerance >= 0 &&
    c.distanceTolerance < 1 &&
    Number.isFinite(c.extraConnectionRate) &&
    c.extraConnectionRate >= 0 &&
    c.extraConnectionRate <= 1 &&
    typeof c.seed === "string" &&
    Object.values(c.structure).every((v) => Number.isFinite(v) && v >= 0) &&
    (c.structure.maxFloorRatio === undefined ||
      c.structure.maxFloorRatio <= 1) &&
    (c.structure.maxStraightFraction === undefined ||
      (c.structure.maxStraightFraction > 0 &&
        c.structure.maxStraightFraction <= 1))
  );
}

export interface SelectionDiagnostic {
  readonly kevin: Position;
  readonly candidateDistances: readonly {
    entry: Position;
    side: string;
    distance: number;
  }[];
  readonly combinationsEvaluated: number;
  readonly rejectionCounts: Readonly<Record<string, number>>;
  readonly evaluations: readonly {
    readonly entrances: readonly Position[];
    readonly reasons: readonly string[];
    readonly distances: readonly number[];
  }[];
}
export interface CandidateDiagnostic {
  readonly seed: string;
  readonly attempt: number;
  readonly kevinCandidates: number;
  readonly availableKevinCandidates: number;
  readonly entranceCombinations: number;
  readonly selections: readonly SelectionDiagnostic[];
  readonly validation: MazeValidation;
}
export interface GenerationDiagnostic {
  readonly result: GenerateMazeResult;
  readonly candidates: readonly CandidateDiagnostic[];
}
interface EntranceCandidate {
  entry: Position;
  inner: Position;
  side: string;
}
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
function carveTopology(
  config: Required<MazeConfig>,
  rng: () => number,
): {
  cells: Terrain[][];
  interior: Position[];
  entries: EntranceCandidate[];
} {
  const cells: Terrain[][] = Array.from({ length: config.rows }, () =>
    Array<Terrain>(config.columns).fill("wall"),
  );
  const columns = Math.floor((config.columns - 1) / 2),
    rows = Math.floor((config.rows - 1) / 2);
  const node = (x: number, y: number): Position => ({
    column: x * 2 + 1,
    row: y * 2 + 1,
  });
  const visited = new Set<string>();
  const stack = [node(Math.floor(rng() * columns), Math.floor(rng() * rows))];
  const nodes: Position[] = [];
  // DFS iterativo de retroceso: cada nodo nuevo abre exactamente una arista.
  while (stack.length) {
    const current = stack[stack.length - 1]!;
    if (!visited.has(key(current))) {
      visited.add(key(current));
      nodes.push(current);
      cells[current.row]![current.column] = "floor";
    }
    const next = dirs
      .map(([dx, dy]) => ({
        column: current.column + dx * 2,
        row: current.row + dy * 2,
      }))
      .filter(
        (p) =>
          p.column >= 1 &&
          p.row >= 1 &&
          p.column <= columns * 2 - 1 &&
          p.row <= rows * 2 - 1 &&
          !visited.has(key(p)),
      );
    if (!next.length) {
      stack.pop();
      continue;
    }
    const chosen = next[Math.floor(rng() * next.length)]!;
    cells[(current.row + chosen.row) / 2]![
      (current.column + chosen.column) / 2
    ] = "floor";
    stack.push(chosen);
  }
  // Sólo paredes entre dos nodos lógicos. Nunca se abre el perímetro ni intersecciones 2x2.
  for (let y = 0; y < rows; y += 1)
    for (let x = 0; x < columns; x += 1) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        if (x + dx >= columns || y + dy >= rows) continue;
        const a = node(x, y),
          b = node(x + dx, y + dy);
        const row = (a.row + b.row) / 2,
          column = (a.column + b.column) / 2;
        const draw = rng(); // Se consume también para aristas ya abiertas: comparabilidad entre densidades.
        if (cells[row]![column] === "wall" && draw < config.extraConnectionRate)
          cells[row]![column] = "floor";
      }
    }
  const entries: EntranceCandidate[] = [];
  for (let x = 0; x < columns; x += 1) {
    const top = node(x, 0),
      bottom = node(x, rows - 1);
    entries.push(
      { entry: { column: top.column, row: 0 }, inner: top, side: "top" },
      {
        entry: { column: bottom.column, row: config.rows - 1 },
        inner: bottom,
        side: "bottom",
      },
    );
  }
  for (let y = 0; y < rows; y += 1) {
    const left = node(0, y),
      right = node(columns - 1, y);
    entries.push(
      { entry: { column: 0, row: left.row }, inner: left, side: "left" },
      {
        entry: { column: config.columns - 1, row: right.row },
        inner: right,
        side: "right",
      },
    );
  }
  const marginX = Math.max(1, Math.floor(config.columns * 0.15));
  const marginY = Math.max(1, Math.floor(config.rows * 0.15));
  const interior = nodes.filter(
    (p) =>
      p.column >= marginX &&
      p.column < config.columns - marginX &&
      p.row >= marginY &&
      p.row < config.rows - marginY,
  );
  return { cells, entries, interior: shuffle(interior, rng) };
}
function openEntries(base: Maze, entries: readonly EntranceCandidate[]): Maze {
  const cells = base.cells.map((row) => [...row]);
  for (const { entry, inner } of entries) {
    const dx = Math.sign(inner.column - entry.column),
      dy = Math.sign(inner.row - entry.row);
    let column = entry.column,
      row = entry.row;
    while (column !== inner.column || row !== inner.row) {
      cells[row]![column] = "floor";
      column += dx;
      row += dy;
    }
  }
  return { ...base, cells, entrances: entries.map((e) => e.entry) };
}
function evaluateCandidate(
  config: Required<MazeConfig>,
  attempt: number,
): { maze: Maze; diagnostic: CandidateDiagnostic } {
  const rng = createRandom(`${config.seed}:${attempt}`);
  const topology = carveTopology(config, rng);
  const selections: SelectionDiagnostic[] = [];
  let combinations = 0;
  let last: Maze = {
    id: `maze-${config.seed}-${attempt}`,
    config,
    cells: topology.cells,
    entrances: [],
    kevin: topology.interior[0]!,
  };
  const topologyMetrics = calculateMazeMetrics(last);
  const topologyReasons = structureReasons(last, topologyMetrics);
  if (topologyReasons.length)
    return {
      maze: last,
      diagnostic: {
        seed: config.seed,
        attempt,
        availableKevinCandidates: topology.interior.length,
        kevinCandidates: 0,
        entranceCombinations: 0,
        selections,
        validation: {
          valid: false,
          reasons: topologyReasons,
          metrics: topologyMetrics,
        },
      },
    };
  for (const kevin of topology.interior) {
    const base = { ...last, cells: topology.cells, entrances: [], kevin };
    const distances = distancesFrom(base, kevin);
    const scored = topology.entries
      .map((e) => ({
        ...e,
        distance:
          (distances.get(key(e.inner)) ?? -Infinity) +
          Math.abs(e.inner.column - e.entry.column) +
          Math.abs(e.inner.row - e.entry.row),
      }))
      .filter((e) => e.distance > 0)
      .sort((a, b) => a.distance - b.distance);
    const rejectionCounts: Record<string, number> = {};
    const reject = (reason: string): void => {
      rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
    };
    let evaluated = 0;
    const evaluations: {
      entrances: readonly Position[];
      reasons: readonly string[];
      distances: readonly number[];
    }[] = [];
    for (const lower of scored) {
      // Ambas cotas son necesarias. No se admiten entradas menores que la distancia base.
      const pool = scored.filter(
        (e) =>
          e.distance >= lower.distance &&
          (e.distance - lower.distance) / e.distance <=
            config.distanceTolerance,
      );
      if (pool.length < config.entranceCount) {
        reject("distance-window");
        continue;
      }
      const sides = [...new Set(pool.map((e) => e.side))];
      if (sides.length < Math.min(4, config.entranceCount)) {
        reject("perimeter-distribution");
        continue;
      }
      const chosen: typeof scored = [];
      // Primero un representante por borde, después maximizar separación entre las restantes.
      for (const side of shuffle(sides, rng).slice(0, config.entranceCount)) {
        const options = pool.filter((e) => e.side === side);
        chosen.push(options[Math.floor(rng() * options.length)]!);
      }
      while (chosen.length < config.entranceCount) {
        const remaining = pool.filter(
          (e) =>
            !chosen.includes(e) &&
            chosen.filter((c) => c.side === e.side).length <
              Math.ceil(config.entranceCount / 4),
        );
        if (!remaining.length) break;
        remaining.sort(
          (a, b) =>
            separation(
              b.entry,
              chosen.map((e) => e.entry),
            ) -
            separation(
              a.entry,
              chosen.map((e) => e.entry),
            ),
        );
        chosen.push(remaining[0]!);
      }
      if (chosen.length < config.entranceCount) {
        reject("perimeter-capacity");
        continue;
      }
      evaluated += 1;
      combinations += 1;
      const minSpacing = Math.max(
        2,
        Math.floor(Math.min(config.columns, config.rows) / 8),
      );
      if (
        chosen.some(
          (e, i) =>
            separation(
              e.entry,
              chosen.filter((_, j) => i !== j).map((p) => p.entry),
            ) < minSpacing,
        )
      ) {
        reject("entrance-spacing");
        evaluations.push({
          entrances: chosen.map((e) => e.entry),
          distances: chosen.map((e) => e.distance),
          reasons: ["entrance-spacing"],
        });
        continue;
      }
      last = openEntries(base, chosen);
      const validation = validateMaze(last, last.entrances, last.kevin);
      evaluations.push({
        entrances: last.entrances,
        reasons: validation.reasons,
        distances: validation.metrics.distance.byEntrance,
      });
      if (!validation.valid) {
        for (const reason of validation.reasons) reject(reason);
        continue;
      }
      selections.push({
        kevin,
        candidateDistances: scored.map(({ entry, side, distance }) => ({
          entry,
          side,
          distance,
        })),
        combinationsEvaluated: evaluated,
        rejectionCounts,
        evaluations,
      });
      return {
        maze: last,
        diagnostic: {
          seed: config.seed,
          attempt,
          availableKevinCandidates: topology.interior.length,
          kevinCandidates: selections.length,
          entranceCombinations: combinations,
          selections,
          validation,
        },
      };
    }
    selections.push({
      kevin,
      candidateDistances: scored.map(({ entry, side, distance }) => ({
        entry,
        side,
        distance,
      })),
      combinationsEvaluated: evaluated,
      rejectionCounts,
      evaluations,
    });
  }
  const validation = validateMaze(last, last.entrances, last.kevin);
  return {
    maze: last,
    diagnostic: {
      seed: config.seed,
      attempt,
      availableKevinCandidates: topology.interior.length,
      kevinCandidates: selections.length,
      entranceCombinations: combinations,
      selections,
      validation: {
        ...validation,
        valid: false,
        reasons: [
          ...validation.reasons,
          "No se encontró selección conjunta válida.",
        ],
      },
    },
  };
}
function separation(position: Position, others: readonly Position[]): number {
  return Math.min(
    ...others.map(
      (other) =>
        Math.abs(position.column - other.column) +
        Math.abs(position.row - other.row),
    ),
  );
}
export function diagnoseCandidate(
  input: MazeConfig,
  attempt = 0,
): CandidateDiagnostic {
  const config = { ...defaults, ...input };
  if (!validConfig(config))
    throw new RangeError("Configuración inválida para diagnóstico.");
  return evaluateCandidate(config, attempt).diagnostic;
}
/** Inspección de la topología previa a la selección, útil para comparar tasas de conexiones. */
export function inspectTopology(input: MazeConfig, attempt = 0): Maze {
  const config = { ...defaults, ...input };
  if (!validConfig(config))
    throw new RangeError("Configuración inválida para diagnóstico.");
  const topology = carveTopology(
    config,
    createRandom(`${config.seed}:${attempt}`),
  );
  return {
    id: `topology-${config.seed}-${attempt}`,
    config,
    cells: topology.cells,
    entrances: [],
    kevin: topology.interior[0]!,
  };
}
export function exportMazeAscii(maze: Maze): string {
  return maze.cells
    .map((row, y) =>
      row
        .map((cell, x) => {
          const p = { column: x, row: y },
            entry = maze.entrances.findIndex((e) => same(e, p));
          return same(maze.kevin, p)
            ? "K"
            : entry >= 0
              ? String(entry + 1)
              : cell === "wall"
                ? "#"
                : " ";
        })
        .join(""),
    )
    .join("\n");
}

export function isTraversable(maze: Maze, p: Position): boolean {
  return (
    Number.isInteger(p.column) &&
    Number.isInteger(p.row) &&
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
  return diagnoseGeneration(input).result;
}
export function diagnoseGeneration(input: MazeConfig): GenerationDiagnostic {
  const config: Required<MazeConfig> = { ...defaults, ...input };
  const candidates: CandidateDiagnostic[] = [];
  if (!validConfig(config))
    return {
      candidates,
      result: {
        code: "INVALID_CONFIG",
        message: "Configuración inválida.",
        attempts: 0,
        reasons: ["Dimensiones, entradas o límites inválidos."],
      },
    };
  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    const { maze, diagnostic } = evaluateCandidate(config, attempt);
    candidates.push(diagnostic);
    if (diagnostic.validation.valid)
      return {
        candidates,
        result: { maze, metrics: diagnostic.validation.metrics },
      };
  }
  return {
    candidates,
    result: {
      code: "MAX_ATTEMPTS_EXHAUSTED",
      message: "No se encontró un candidato válido.",
      attempts: config.maxAttempts,
      reasons: [...new Set(candidates.flatMap((c) => c.validation.reasons))],
    },
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
  if (!entrances.length || !isTraversable(maze, kevin)) return false;
  // Tarjan enraizado en Kevin. Suma las entradas separadas del objetivo al quitar cada vértice.
  const entryKeys = new Set(entrances.map(key));
  const discovery = new Map<string, number>(),
    low = new Map<string, number>();
  let clock = 0,
    shared = false;
  const visit = (p: Position, parent?: string): number => {
    const id = key(p),
      time = ++clock;
    discovery.set(id, time);
    low.set(id, time);
    const own = entryKeys.has(id) ? 1 : 0;
    let subtree = own,
      separated = own;
    for (const next of neighbours(maze, p)) {
      const nid = key(next);
      if (!discovery.has(nid)) {
        const count = visit(next, id);
        subtree += count;
        low.set(id, Math.min(low.get(id)!, low.get(nid)!));
        if (low.get(nid)! >= time) separated += count;
      } else if (nid !== parent)
        low.set(id, Math.min(low.get(id)!, discovery.get(nid)!));
    }
    if (!same(p, kevin) && separated === entrances.length) shared = true;
    return subtree;
  };
  const reachable = visit(kevin);
  return reachable === entrances.length && shared;
}
function corridorMetrics(maze: Maze): MazeMetrics["corridors"] {
  const used = new Set<string>(),
    lengths: number[] = [];
  const edgeKey = (a: Position, b: Position): string =>
    [key(a), key(b)].sort().join("|");
  const follow = (start: Position, next: Position): void => {
    if (used.has(edgeKey(start, next))) return;
    let previous = start,
      current = next,
      length = 1;
    used.add(edgeKey(start, next));
    while (neighbours(maze, current).length === 2) {
      const onward = neighbours(maze, current).find((p) => !same(p, previous))!;
      if (used.has(edgeKey(current, onward))) break;
      used.add(edgeKey(current, onward));
      previous = current;
      current = onward;
      length += 1;
    }
    lengths.push(length);
  };
  const floors: Position[] = [];
  for (let row = 0; row < maze.config.rows; row += 1)
    for (let column = 0; column < maze.config.columns; column += 1)
      if (isTraversable(maze, { column, row })) floors.push({ column, row });
  for (const p of floors)
    if (neighbours(maze, p).length !== 2)
      for (const next of neighbours(maze, p)) follow(p, next);
  // Incluye componentes que forman un ciclo sin bifurcaciones.
  for (const p of floors)
    for (const next of neighbours(maze, p)) follow(p, next);
  let horizontalRun = 0,
    verticalRun = 0;
  for (let row = 0; row < maze.config.rows; row += 1) {
    let run = 0;
    for (let column = 0; column < maze.config.columns; column += 1) {
      run = isTraversable(maze, { column, row }) ? run + 1 : 0;
      horizontalRun = Math.max(horizontalRun, run);
    }
  }
  for (let column = 0; column < maze.config.columns; column += 1) {
    let run = 0;
    for (let row = 0; row < maze.config.rows; row += 1) {
      run = isTraversable(maze, { column, row }) ? run + 1 : 0;
      verticalRun = Math.max(verticalRun, run);
    }
  }
  return {
    lengths,
    maximum: lengths.length ? Math.max(...lengths) : 0,
    average: lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length),
    longestStraightRun: Math.max(horizontalRun, verticalRun),
    horizontalRun,
    verticalRun,
  };
}
function structureReasons(maze: Maze, metrics: MazeMetrics): string[] {
  const limits = { ...defaults.structure, ...maze.config.structure },
    reasons: string[] = [];
  if (metrics.traversablePercentage > limits.maxFloorRatio)
    reasons.push("Suelo excesivo: no conserva estructura de corredores.");
  if (metrics.deadEnds < limits.minDeadEnds)
    reasons.push("Faltan callejones genuinos.");
  if (metrics.junctions < limits.minJunctions)
    reasons.push("Faltan bifurcaciones.");
  if (
    metrics.corridors.horizontalRun / maze.config.columns >
      limits.maxStraightFraction ||
    metrics.corridors.verticalRun / maze.config.rows >
      limits.maxStraightFraction
  )
    reasons.push("Corredor recto que cruza casi todo el mapa.");
  if (
    maze.config.structure?.maxStraightRun !== undefined &&
    metrics.corridors.longestStraightRun > maze.config.structure.maxStraightRun
  )
    reasons.push("Corredor recto excesivo.");
  return reasons;
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
  const componentsVisited = new Set<string>();
  let components = 0;
  for (let row = 0; row < maze.config.rows; row += 1)
    for (let column = 0; column < maze.config.columns; column += 1) {
      const p = { column, row };
      if (!isTraversable(maze, p) || componentsVisited.has(key(p))) continue;
      components += 1;
      for (const id of distancesFrom(maze, p).keys()) componentsVisited.add(id);
    }
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
      relativeDifference: maximum ? (maximum - minimum) / maximum : 1,
    },
    traversableCells: floors,
    wallCells: maze.config.columns * maze.config.rows - floors,
    traversablePercentage: floors / (maze.config.columns * maze.config.rows),
    junctions,
    deadEnds,
    independentCycles: degreeTotal / 2 - floors + components,
    articulationPoints: points,
    hasSharedBottleneck: hasSharedBottleneck(maze, entrances, kevin),
    kevinRegionEntrances: neighbours(maze, kevin).length,
    corridors: corridorMetrics(maze),
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
    maze.cells.length !== maze.config.rows ||
    maze.cells.some(
      (row) =>
        row.length !== maze.config.columns ||
        row.some((cell) => cell !== "wall" && cell !== "floor"),
    )
  )
    reasons.push(
      "La matriz no coincide con las dimensiones o el terreno declarado.",
    );
  if (
    entrances.length !== maze.config.entranceCount ||
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
  const sideOf = (p: Position): string =>
    p.column === 0
      ? "left"
      : p.column === maze.config.columns - 1
        ? "right"
        : p.row === 0
          ? "top"
          : p.row === maze.config.rows - 1
            ? "bottom"
            : "interior";
  const sides = entrances.map(sideOf);
  if (
    sides.includes("interior") ||
    new Set(sides).size < Math.min(4, entrances.length) ||
    sides.some(
      (side) =>
        sides.filter((s) => s === side).length >
        Math.ceil(entrances.length / 4),
    )
  )
    reasons.push("Las entradas no se distribuyen por los bordes.");
  if (entrances.some((p) => same(p, kevin)))
    reasons.push("Kevin coincide con una entrada.");
  reasons.push(...structureReasons(maze, metrics));
  if (metrics.distance.relativeDifference > tolerance)
    reasons.push("Las distancias no están equilibradas.");
  if (options.rejectSharedBottleneck !== false && metrics.hasSharedBottleneck)
    reasons.push("Existe un cuello de botella común.");
  return { valid: reasons.length === 0, reasons, metrics };
}
