import { it, expect } from "vitest";
import { diagnoseGeneration } from "../packages/maze-engine/src/index.js";
it("elige entre varias ubicaciones válidas con mínimo 40 y tolerancia 30 %", () => {
  let differsFromFirst = false;
  for (let i = 0; i < 10; i++) {
    const report = diagnoseGeneration({
      columns: 80,
      rows: 45,
      entranceCount: 6,
      seed: "beta-" + i,
    });
    if ("code" in report.result) throw new Error(JSON.stringify(report));
    expect(report.result.metrics.distance.minimum).toBeGreaterThanOrEqual(40);
    expect(
      report.result.metrics.distance.relativeDifference,
    ).toBeLessThanOrEqual(0.3);
    const accepted = report.candidates
      .at(-1)!
      .selections.filter((s) =>
        s.evaluations.some((e) => e.reasons.length === 0),
      );
    expect(accepted.length).toBeGreaterThan(1);
    differsFromFirst ||=
      JSON.stringify(accepted[0]!.kevin) !==
      JSON.stringify(report.result.maze.kevin);
  }
  expect(differsFromFirst).toBe(true);
}, 30000);
