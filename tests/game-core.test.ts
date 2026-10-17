import { describe, it, expect } from "vitest";
import { MatchEngine } from "../packages/game-core/src/index.js";
import type { Maze } from "../packages/maze-engine/src/index.js";
const maze: Maze = {
  id: "fixture",
  config: { columns: 20, rows: 12, seed: "private-seed", entranceCount: 6 },
  cells: Array.from({ length: 12 }, () =>
    Array.from({ length: 20 }, () => "floor"),
  ),
  entrances: [
    { column: 0, row: 0 },
    { column: 0, row: 2 },
    { column: 0, row: 4 },
    { column: 0, row: 6 },
    { column: 0, row: 8 },
    { column: 0, row: 10 },
  ],
  kevin: { column: 12, row: 4 },
};
function setup(count = 3, override: Partial<Maze> = {}) {
  let now = 0;
  const engine = new MatchEngine(
    "test",
    { ...maze, ...override },
    { now: () => now },
  );
  for (let i = 0; i < count; i++) engine.join("p" + i, "Alias " + i);
  return {
    engine,
    set: (n: number) => {
      now = n;
    },
  };
}
describe("motor autoritativo", () => {
  it.each([3, 6])(
    "inicia simultáneamente %i participantes tras tres segundos",
    (count) => {
      const { engine, set } = setup(count);
      expect(
        new Set(
          engine.fullState().positions.map((p) => JSON.stringify(p.position)),
        ).size,
      ).toBe(count);
      engine.start();
      expect(engine.summary().phase).toBe("countdown");
      set(2999);
      expect(() => engine.move("p0", "right")).toThrow("NOT_RUNNING");
      set(3000);
      expect(engine.summary().phase).toBe("running");
      engine.move("p0", "right");
      engine.move("p1", "right");
      expect(engine.view("p0").position.column).toBe(1);
      expect(engine.view("p1").position.column).toBe(1);
    },
  );
  it("rechaza séptimo, alias duplicados de identidad e inicio prematuro", () => {
    const { engine } = setup(6);
    expect(() => engine.join("p6", "Extra")).toThrow("ROOM_FULL");
    expect(() => engine.join("p0", "Otro")).toThrow("ALREADY_JOINED");
    expect(() => setup(2).engine.start()).toThrow("NOT_READY");
  });
  it("impone paredes, límites y la frecuencia por participante", () => {
    const cells = maze.cells.map((r) => [...r]);
    cells[0]![2] = "wall";
    const { engine, set } = setup(3, { cells });
    engine.start();
    set(3000);
    engine.move("p0", "right");
    expect(() => engine.move("p0", "right")).toThrow("MOVE_TOO_FAST");
    set(3149);
    expect(() => engine.move("p0", "right")).toThrow("MOVE_TOO_FAST");
    set(3150);
    expect(() => engine.move("p0", "right")).toThrow("BLOCKED");
    expect(() => engine.move("p1", "left")).toThrow("BLOCKED");
    set(3300);
    engine.move("p0", "down");
    expect(engine.view("p0").position).toEqual({ column: 1, row: 1 });
  });
  it("mantiene luz euclidiana sin oclusión y memoria privada", () => {
    const cells = maze.cells.map((r) => [...r]);
    cells[0]![1] = "wall";
    const { engine, set } = setup(3, { cells });
    engine.start();
    set(3000);
    const initial = engine.view("p0");
    expect(initial.visible).toContainEqual({
      column: 2,
      row: 0,
      terrain: "floor",
    });
    expect(initial.visible.some((p) => p.column === 4 && p.row === 1)).toBe(
      false,
    );
    expect(initial).not.toHaveProperty("kevin");
    expect(initial).not.toHaveProperty("maze");
    expect(initial).not.toHaveProperty("participants");
    for (let i = 0; i < 5; i++) {
      set(3000 + i * 150);
      engine.move("p0", "down");
    }
    const view = engine.view("p0");
    expect(view.explored).toContainEqual({
      column: 0,
      row: 0,
      terrain: "floor",
    });
    expect(view.visible.some((p) => p.column === 0 && p.row === 0)).toBe(false);
    expect(engine.view("p1").position).toEqual({ column: 0, row: 2 });
  });
  it("ver a Kevin no gana; llegar sí y desempata por orden del servidor", () => {
    const { engine, set } = setup(3, {
      kevin: { column: 1, row: 1 },
      entrances: [
        { column: 0, row: 1 },
        { column: 2, row: 1 },
        ...maze.entrances.slice(2),
      ],
    });
    expect(engine.view("p0")).toHaveProperty("kevin");
    engine.start();
    set(3000);
    expect(engine.summary()).not.toHaveProperty("winnerId");
    engine.move("p0", "right");
    expect(() => engine.move("p1", "left")).toThrow("NOT_RUNNING");
    expect(engine.summary().winnerId).toBe("p0");
    expect(engine.summary().results![0]!.steps).toBe(1);
  });
  it("agota 240 s según reloj oficial, incluso sin ticks intermedios", () => {
    const { engine, set } = setup();
    engine.start();
    set(243000);
    expect(engine.summary().phase).toBe("finished");
    expect(engine.summary()).not.toHaveProperty("winnerId");
    expect(() => engine.move("p0", "right")).toThrow("NOT_RUNNING");
  });
  it("reconecta dentro de 30 s y rechaza desde el límite", () => {
    const { engine, set } = setup();
    engine.disconnect("p0");
    set(29999);
    engine.reconnect("p0");
    expect(engine.summary().participants[0]!.connected).toBe(true);
    engine.disconnect("p0");
    set(59999);
    expect(() => engine.reconnect("p0")).toThrow("UNKNOWN_PLAYER");
    const active = setup();
    active.engine.start();
    active.engine.disconnect("p0");
    active.set(30000);
    expect(() => active.engine.reconnect("p0")).toThrow("RECONNECT_EXPIRED");
  });
});
