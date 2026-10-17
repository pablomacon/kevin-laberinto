import { generateMaze } from "../packages/maze-engine/src/index.js";
import { writeFileSync } from "node:fs";
const sectors = Array<number>(9).fill(0);
const records = Array.from({ length: 200 }, (_, i) => {
  const seed = `beta-distribution-${i}`,
    started = performance.now();
  const result = generateMaze({
    columns: 80,
    rows: 45,
    entranceCount: 6,
    seed,
  });
  if ("code" in result) return { seed, error: result };
  const { maze, metrics } = result;
  if (
    metrics.distance.minimum < 40 ||
    metrics.distance.relativeDifference > 0.3 ||
    metrics.hasSharedBottleneck
  )
    throw new Error(seed);
  const sector =
    Math.floor((maze.kevin.row * 3) / 45) * 3 +
    Math.floor((maze.kevin.column * 3) / 80);
  sectors[sector]!++;
  return {
    seed,
    sector,
    kevin: maze.kevin,
    distances: metrics.distance,
    ms: performance.now() - started,
  };
});
const report = {
  seeds: 200,
  failures: records.filter((r) => "error" in r).length,
  sectors,
  records,
};
writeFileSync(
  "docs/KEVIN_DISTRIBUTION.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({ seeds: report.seeds, failures: report.failures, sectors }),
);
if (report.failures) process.exitCode = 1;
