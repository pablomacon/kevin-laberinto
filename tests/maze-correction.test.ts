import { describe, expect, it } from "vitest";
import {
  calculateMazeMetrics,
  diagnoseCandidate,
  diagnoseGeneration,
  distancesFrom,
  exportMazeAscii,
  findShortestPath,
  generateMaze,
  hasSharedBottleneck,
  inspectTopology,
  isTraversable,
  validateMaze,
  type Maze,
  type MazeConfig,
} from "../packages/maze-engine/src/index.js";

const standard: MazeConfig = {
  columns: 80,
  rows: 45,
  entranceCount: 6,
  seed: "integration-0",
};
const getMaze = (config = standard): Maze => {
  const result = generateMaze(config);
  if ("code" in result) throw new Error(JSON.stringify(result));
  return result.maze;
};
function fixture(
  lines: string[],
  entrances = [
    { column: 1, row: 1 },
    { column: 3, row: 1 },
    { column: 1, row: 3 },
  ],
  kevin = { column: 3, row: 3 },
): Maze {
  return {
    id: "fixture",
    config: {
      ...standard,
      columns: lines[0]!.length,
      rows: lines.length,
      entranceCount: entrances.length,
    },
    cells: lines.map((row) =>
      [...row].map((c) => (c === "#" ? "wall" : "floor")),
    ),
    entrances,
    kevin,
  };
}

describe("regresiones del generador DFS y selección conjunta", () => {
  it("BFS encuentra el rodeo óptimo, no Manhattan, y no acepta diagonales", () => {
    const maze = fixture(["#####", "# # #", "# # #", "#   #", "#####"]);
    const start = { column: 1, row: 1 },
      goal = { column: 3, row: 1 };
    expect(findShortestPath(maze, start, goal)).toHaveLength(7);
    expect(distancesFrom(maze, start).get("3,1")).toBe(6);
    expect(findShortestPath(maze, start, start)).toEqual([start]);
    expect(findShortestPath(maze, start, { column: 2, row: 1 })).toBeNull();
    const diagonal = fixture([" #", "# "], [], { column: 1, row: 1 });
    expect(
      findShortestPath(diagonal, { column: 0, row: 0 }, diagonal.kevin),
    ).toBeNull();
  });
  it("rechaza expresamente superficies abiertas y paredes aisladas", () => {
    for (const islands of [false, true]) {
      const cells = Array.from({ length: 45 }, (_, y) =>
        Array.from({ length: 80 }, (_, x) =>
          islands && x % 3 === 1 && y % 3 === 1
            ? ("wall" as const)
            : ("floor" as const),
        ),
      );
      const maze = { ...getMaze(), cells };
      expect(validateMaze(maze, maze.entrances, maze.kevin).reasons).toContain(
        "Suelo excesivo: no conserva estructura de corredores.",
      );
    }
  });
  it("rechaza a Kevin inaccesible y entradas desconectadas", () => {
    const original = getMaze();
    for (const position of [original.kevin, original.entrances[0]!]) {
      const cells = original.cells.map((row) => [...row]);
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]) {
        const x = position.column + dx!,
          y = position.row + dy!;
        if (cells[y]?.[x] !== undefined) cells[y]![x] = "wall";
      }
      const maze = { ...original, cells };
      expect(validateMaze(maze, maze.entrances, maze.kevin).reasons).toContain(
        "No existe conectividad completa.",
      );
    }
  });
  it("rechaza desequilibrio sin cambiar la tolerancia del 15 %", () => {
    const maze = getMaze();
    const adjacent = [
      { column: maze.kevin.column + 1, row: maze.kevin.row },
      { column: maze.kevin.column - 1, row: maze.kevin.row },
      { column: maze.kevin.column, row: maze.kevin.row + 1 },
      { column: maze.kevin.column, row: maze.kevin.row - 1 },
    ].find((p) => isTraversable(maze, p))!;
    expect(
      validateMaze(maze, [adjacent, ...maze.entrances.slice(1)], maze.kevin)
        .reasons,
    ).toContain("Las distancias no están equilibradas.");
  });
  it("detecta cuellos comunes incluidos los situados en una entrada y excluye Kevin", () => {
    const maze = fixture(
      ["   ", "# #", "# #"],
      [
        { column: 0, row: 0 },
        { column: 1, row: 0 },
        { column: 2, row: 0 },
      ],
      { column: 1, row: 2 },
    );
    expect(hasSharedBottleneck(maze, maze.entrances, maze.kevin)).toBe(true);
    expect(validateMaze(maze, maze.entrances, maze.kevin).reasons).toContain(
      "Existe un cuello de botella común.",
    );
    expect(
      hasSharedBottleneck(
        { ...maze, kevin: { column: 1, row: 0 } },
        [maze.entrances[0]!, maze.entrances[2]!],
        { column: 1, row: 0 },
      ),
    ).toBe(false);
  });
  it("calcula E−V+C también para componentes desconectadas", () => {
    const maze = fixture(["  #  ", "  #  "], [], { column: 0, row: 0 });
    const metrics = calculateMazeMetrics(maze);
    expect(metrics.independentCycles).toBe(2);
    expect(metrics.articulationPoints).toHaveLength(0);
    expect(metrics.corridors.lengths).toEqual([4, 4]);
  });
  it("contrasta el cuello común con eliminación de vértices en grafos pequeños", () => {
    for (let sample = 0; sample < 40; sample++) {
      const lines = Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 6 }, (_, x) =>
          (x * 17 + y * 13 + sample * 7) % 11 < 3 ? "#" : " ",
        ).join(""),
      );
      const available = lines.flatMap((row, y) =>
        [...row].flatMap((cell, x) =>
          cell === " " ? [{ column: x, row: y }] : [],
        ),
      );
      const kevin = available[available.length - 1]!,
        entries = available.slice(0, 3);
      const maze = fixture(lines, entries, kevin);
      if (!entries.every((entry) => findShortestPath(maze, entry, kevin)))
        continue;
      const expected = available
        .filter((p) => p.column !== kevin.column || p.row !== kevin.row)
        .some((blocked) => {
          const cells = maze.cells.map((row) => [...row]);
          cells[blocked.row]![blocked.column] = "wall";
          return entries.every(
            (entry) =>
              findShortestPath({ ...maze, cells }, entry, kevin) === null,
          );
        });
      expect(
        hasSharedBottleneck(maze, entries, kevin),
        `sample-${sample}`,
      ).toBe(expected);
    }
  });
  it("las aperturas adicionales cambian la topología del mismo árbol DFS", () => {
    const tree = inspectTopology({ ...standard, extraConnectionRate: 0 });
    const loops = inspectTopology({ ...standard, extraConnectionRate: 0.25 });
    expect(calculateMazeMetrics(tree).independentCycles).toBe(0);
    expect(calculateMazeMetrics(loops).independentCycles).toBeGreaterThan(0);
    expect(calculateMazeMetrics(loops).traversablePercentage).toBeLessThan(0.6);
    for (let y = 0; y < 45; y++)
      for (let x = 0; x < 80; x++)
        if (tree.cells[y]![x] === "floor")
          expect(loops.cells[y]![x]).toBe("floor");
  });
  it("admite 3 a 6 entradas y dimensiones pares o impares sin mutar configuración", () => {
    for (const entranceCount of [3, 4, 5, 6]) {
      const input = Object.freeze({
        ...standard,
        columns: 79 + (entranceCount % 2),
        rows: 44 + (entranceCount % 2),
        entranceCount,
      });
      const maze = getMaze(input);
      expect(maze.entrances).toHaveLength(entranceCount);
      expect(maze.cells).toHaveLength(input.rows);
      expect(maze.cells.every((row) => row.length === input.columns)).toBe(
        true,
      );
      expect(input).not.toHaveProperty("structure");
    }
  });
  it.each([
    { maxAttempts: 0 },
    { maxAttempts: 1.2 },
    { entranceCount: 3.5 },
    { extraConnectionRate: -1 },
    { distanceTolerance: NaN },
    { distanceTolerance: 1 },
  ])("rechaza límites inválidos: %j", (overrides) => {
    expect(generateMaze({ ...standard, ...overrides })).toMatchObject({
      code: "INVALID_CONFIG",
      attempts: 0,
    });
  });
  it("registra un agotamiento real y todos sus motivos sin relajar condiciones", () => {
    const report = diagnoseGeneration({
      ...standard,
      maxAttempts: 1,
      structure: { maxFloorRatio: 0 },
    });
    expect(report.result).toMatchObject({
      code: "MAX_ATTEMPTS_EXHAUSTED",
      attempts: 1,
    });
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]!.validation.reasons).toContain(
      "Suelo excesivo: no conserva estructura de corredores.",
    );
    expect(
      diagnoseCandidate({ ...standard, structure: { maxFloorRatio: 0 } }),
    ).toEqual(report.candidates[0]);
  });
  it("permite inspeccionar un candidato sin aceptarlo y exportar el mapa completo", () => {
    const maze = getMaze();
    const text = exportMazeAscii(maze);
    expect(text.split("\n")).toHaveLength(45);
    expect(text.split("\n").every((line) => line.length === 80)).toBe(true);
    expect(text.match(/K/g)).toHaveLength(1);
    for (const entry of ["1", "2", "3", "4", "5", "6"])
      expect(text).toContain(entry);
    const before = JSON.stringify(maze);
    calculateMazeMetrics(maze);
    findShortestPath(maze, maze.entrances[0]!, maze.kevin);
    validateMaze(maze, maze.entrances, maze.kevin);
    expect(JSON.stringify(maze)).toBe(before);
  });
});
