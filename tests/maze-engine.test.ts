import { describe, expect, it } from "vitest";
import { calculateMazeMetrics, findShortestPath, generateMaze, hasSharedBottleneck, type Maze } from "../packages/maze-engine/src/index.js";

const config = { columns: 80, rows: 45, entranceCount: 6, seed: "kel-002-example" };
function result(seed = config.seed) { const value = generateMaze({ ...config, seed }); if ("code" in value) throw new Error(value.message); return value; }

describe("maze-engine", () => {
  it("es determinista y conserva dimensiones exactas", () => {
    const first = result(), second = result();
    expect(first.maze).toEqual(second.maze); expect(first.maze.cells).toHaveLength(45); expect(first.maze.cells[0]).toHaveLength(80);
  });
  it("selecciona seis entradas únicas y un Kevin alcanzable", () => {
    const { maze, metrics } = result(); expect(new Set(maze.entrances.map((p) => `${p.column},${p.row}`)).size).toBe(6); expect(metrics.distance.byEntrance.every((d) => d > 0)).toBe(true); expect(metrics.distance.relativeDifference).toBeLessThanOrEqual(0.15);
  });
  it("recupera un camino BFS óptimo ortogonal", () => {
    const { maze } = result(); const path = findShortestPath(maze, maze.entrances[0]!, maze.kevin); expect(path).not.toBeNull(); for (let i = 1; i < path!.length; i += 1) expect(Math.abs(path![i]!.column - path![i - 1]!.column) + Math.abs(path![i]!.row - path![i - 1]!.row)).toBe(1);
  });
  it("distingue un cuello de botella común", () => {
    const cells = [["floor", "floor", "floor"], ["wall", "floor", "wall"], ["wall", "floor", "wall"]] as const;
    const maze: Maze = { id: "manual", config: { columns: 3, rows: 3, seed: "x", entranceCount: 3 }, cells, entrances: [{ column: 0, row: 0 }, { column: 2, row: 0 }, { column: 1, row: 0 }], kevin: { column: 1, row: 2 } };
    expect(hasSharedBottleneck(maze, maze.entrances, maze.kevin)).toBe(true); expect(calculateMazeMetrics(maze).articulationPoints.length).toBeGreaterThan(0);
  });
  it("rechaza configuraciones inválidas", () => { expect(generateMaze({ ...config, columns: 6 })).toMatchObject({ code: "INVALID_CONFIG" }); });
  it("valida 100 semillas estándar reproducibles", () => {
    for (let i = 0; i < 100; i += 1) { const value = result(`integration-${i}`); expect(value.metrics.isConnected).toBe(true); expect(value.metrics.hasSharedBottleneck).toBe(false); expect(value.metrics.distance.relativeDifference).toBeLessThanOrEqual(0.15); }
  });
});
