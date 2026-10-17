import { describe, expect, it } from "vitest";
import type { MatchConfig } from "../packages/game-core/src/index.js";
import type { MazeConfig } from "../packages/maze-engine/src/index.js";
import { PROTOCOL_VERSION } from "../packages/protocol/src/index.js";
import type { Position } from "../packages/shared/src/index.js";

describe("contratos iniciales", () => {
  it("resuelve paquetes internos y conserva sus tipos", () => {
    const position: Position = { column: 0, row: 0 };
    const maze: MazeConfig = {
      columns: 80,
      rows: 45,
      seed: "test",
      entranceCount: 6,
    };
    const match: MatchConfig = {
      maxParticipants: 6,
      movementIntervalMs: 150,
      visibilityRadius: 4,
      raceDurationSeconds: 240,
      countdownSeconds: 3,
      reconnectionGraceSeconds: 30,
    };
    expect([position, maze, match]).toHaveLength(3);
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
