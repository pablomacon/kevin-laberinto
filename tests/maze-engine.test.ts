import { describe, expect, it } from "vitest";
import {
  calculateMazeMetrics,
  findShortestPath,
  generateMaze,
  hasSharedBottleneck,
  validateMaze,
  type Maze,
} from "../packages/maze-engine/src/index.js";

const config = {
  columns: 80,
  rows: 45,
  entranceCount: 6,
  seed: "kel-002-example",
  distanceTolerance: 0.15,
};
function result(seed = config.seed) {
  const value = generateMaze({ ...config, seed });
  if ("code" in value) throw new Error(value.message);
  return value;
}

describe("maze-engine", () => {
  it("es determinista y conserva dimensiones exactas", () => {
    const first = result(),
      second = result();
    expect(first.maze).toEqual(second.maze);
    expect(first.maze.cells).toHaveLength(45);
    expect(first.maze.cells[0]).toHaveLength(80);
  });
  it("selecciona seis entradas únicas y un Kevin alcanzable", () => {
    const { maze, metrics } = result();
    expect(
      new Set(maze.entrances.map((p) => `${p.column},${p.row}`)).size,
    ).toBe(6);
    expect(metrics.distance.byEntrance.every((d) => d > 0)).toBe(true);
    expect(metrics.distance.relativeDifference).toBeLessThanOrEqual(0.15);
    expect(metrics.deadEnds).toBeGreaterThan(0);
  });
  it("recupera un camino BFS óptimo ortogonal", () => {
    const { maze } = result();
    const path = findShortestPath(maze, maze.entrances[0]!, maze.kevin);
    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i += 1)
      expect(
        Math.abs(path![i]!.column - path![i - 1]!.column) +
          Math.abs(path![i]!.row - path![i - 1]!.row),
      ).toBe(1);
  });
  it("distingue un cuello de botella común", () => {
    const cells = [
      ["floor", "floor", "floor"],
      ["wall", "floor", "wall"],
      ["wall", "floor", "wall"],
    ] as const;
    const maze: Maze = {
      id: "manual",
      config: { columns: 3, rows: 3, seed: "x", entranceCount: 3 },
      cells,
      entrances: [
        { column: 0, row: 0 },
        { column: 2, row: 0 },
        { column: 1, row: 0 },
      ],
      kevin: { column: 1, row: 2 },
    };
    expect(hasSharedBottleneck(maze, maze.entrances, maze.kevin)).toBe(true);
    expect(
      calculateMazeMetrics(maze).articulationPoints.length,
    ).toBeGreaterThan(0);
  });
  it("mide ciclos y evita marcar como cuello una red con rutas alternativas", () => {
    const cells = [
      ["floor", "floor", "floor"],
      ["floor", "floor", "floor"],
      ["floor", "floor", "floor"],
    ] as const;
    const maze: Maze = {
      id: "cycle",
      config: { columns: 3, rows: 3, seed: "y", entranceCount: 3 },
      cells,
      entrances: [
        { column: 0, row: 0 },
        { column: 2, row: 0 },
        { column: 0, row: 2 },
      ],
      kevin: { column: 2, row: 2 },
    };
    const metrics = calculateMazeMetrics(maze);
    expect(metrics.independentCycles).toBeGreaterThan(0);
    expect(metrics.articulationPoints).toHaveLength(0);
    expect(metrics.hasSharedBottleneck).toBe(false);
  });
  it("rechaza configuraciones inválidas", () => {
    expect(generateMaze({ ...config, columns: 6 })).toMatchObject({
      code: "INVALID_CONFIG",
    });
  });
  it(
    "valida 100 semillas estándar reproducibles",
    () => {
      const failures: string[] = [],
        positions = new Set<string>(),
        layouts = new Set<string>();
      for (let i = 0; i < 100; i += 1) {
        const seed = `integration-${i}`;
        const value = generateMaze({ ...config, seed });
        if ("code" in value) {
          failures.push(`${seed}: ${JSON.stringify(value)}`);
          continue;
        }
        expect.soft(generateMaze({ ...config, seed }), seed).toEqual(value);
        const { maze, metrics } = value;
        positions.add(`${maze.kevin.column},${maze.kevin.row}`);
        layouts.add(JSON.stringify(maze.entrances));
        expect
          .soft(validateMaze(maze, maze.entrances, maze.kevin).valid, seed)
          .toBe(true);
        expect
          .soft(
            new Set(
              maze.entrances.map((p) =>
                p.column === 0
                  ? "left"
                  : p.column === 79
                    ? "right"
                    : p.row === 0
                      ? "top"
                      : "bottom",
              ),
            ).size,
            seed,
          )
          .toBe(4);
        const sides = maze.entrances.map((p) =>
          p.column === 0
            ? "left"
            : p.column === 79
              ? "right"
              : p.row === 0
                ? "top"
                : "bottom",
        );
        expect
          .soft(
            Math.max(
              ...sides.map((side) => sides.filter((s) => s === side).length),
            ),
            seed,
          )
          .toBeLessThanOrEqual(2);
        expect
          .soft(metrics.traversablePercentage, seed)
          .toBeLessThanOrEqual(0.6);
        expect.soft(metrics.deadEnds, seed).toBeGreaterThan(0);
        expect.soft(metrics.junctions, seed).toBeGreaterThan(0);
        expect.soft(metrics.independentCycles, seed).toBeGreaterThan(0);
        expect
          .soft(metrics.corridors.horizontalRun / 80, seed)
          .toBeLessThanOrEqual(0.9);
        expect
          .soft(metrics.corridors.verticalRun / 45, seed)
          .toBeLessThanOrEqual(0.9);
        expect
          .soft(
            metrics.corridors.lengths.reduce((a, b) => a + b, 0),
            seed,
          )
          .toBe(metrics.independentCycles + metrics.traversableCells - 1);
        for (const [entryIndex, entry] of maze.entrances.entries()) {
          const path = findShortestPath(maze, entry, maze.kevin)!;
          expect
            .soft(path.length - 1, seed)
            .toBe(metrics.distance.byEntrance[entryIndex]);
        }
        expect(value.metrics.isConnected).toBe(true);
        expect(value.metrics.hasSharedBottleneck).toBe(false);
        expect(value.metrics.distance.relativeDifference).toBeLessThanOrEqual(
          0.15,
        );
      }
      expect(failures, failures.join("\n")).toEqual([]);
      expect(positions.size).toBeGreaterThan(1);
      expect(layouts.size).toBeGreaterThan(1);
      expect(
        new Set([...positions].map((p) => p.split(",")[0])).size,
      ).toBeGreaterThan(1);
      expect(
        new Set([...positions].map((p) => p.split(",")[1])).size,
      ).toBeGreaterThan(1);
    },
    Number(
      Reflect.get(globalThis, "process")?.env?.MAZE_TEST_TIMEOUT_MS ?? 30_000,
    ),
  );
});
