import {
  diagnoseGeneration,
  exportMazeAscii,
} from "../packages/maze-engine/src/index.js";
import { writeFileSync } from "node:fs";
import { cpus, platform, arch } from "node:os";

const count = Number(process.argv[2] ?? 20);
if (!Number.isInteger(count) || count < 1 || count > 1000)
  throw new Error("Use un número de semillas entre 1 y 1000.");
const records = Array.from({ length: count }, (_, i) => {
  const seed = `integration-${i}`,
    started = performance.now();
  const report = diagnoseGeneration({
    columns: 80,
    rows: 45,
    entranceCount: 6,
    distanceTolerance: 0.15,
    seed,
  });
  const elapsedMs = performance.now() - started;
  if (i === 0 && !("code" in report.result)) {
    writeFileSync(
      "docs/maze-example.txt",
      exportMazeAscii(report.result.maze) + "\n",
    );
    writeFileSync(
      "docs/maze-example.json",
      JSON.stringify(
        {
          seed,
          kevin: report.result.maze.kevin,
          entrances: report.result.maze.entrances,
          metrics: compactMetrics(report.result.metrics),
        },
        null,
        2,
      ) + "\n",
    );
  }
  return {
    seed,
    elapsedMs,
    success: !("code" in report.result),
    candidates: report.candidates.map((c) => ({
      attempt: c.attempt,
      availableKevinCandidates: c.availableKevinCandidates,
      kevinCandidates: c.kevinCandidates,
      entranceCombinations: c.entranceCombinations,
      valid: c.validation.valid,
      reasons: c.validation.reasons,
      metrics: compactMetrics(c.validation.metrics),
      selections: c.selections.map((s) => ({
        kevin: s.kevin,
        // Tuplas columna/fila/distancia: todos los candidatos, incluidos los descartados.
        candidateDistances: s.candidateDistances.map((d) => [
          d.entry.column,
          d.entry.row,
          d.distance,
        ]),
        combinationsEvaluated: s.combinationsEvaluated,
        rejectionCounts: s.rejectionCounts,
        evaluations: s.evaluations,
      })),
    })),
  };
});
function compactMetrics(
  m: import("../packages/maze-engine/src/index.js").MazeMetrics,
) {
  return {
    ...m,
    articulationPoints: m.articulationPoints.length,
    corridors: { ...m.corridors, lengths: undefined },
  };
}
function aggregate(values: number[]) {
  return {
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((a, b) => a + b, 0) / values.length,
  };
}
const successes = records.filter((r) => r.success);
const metrics = successes.map(
  (r) => r.candidates[r.candidates.length - 1]!.metrics,
);
const rejectionCounts: Record<string, number> = {};
for (const r of records)
  for (const c of r.candidates) {
    for (const reason of c.reasons)
      rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
    for (const s of c.selections)
      for (const [reason, value] of Object.entries(s.rejectionCounts))
        rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + value;
  }
const summary = {
  count,
  successful: successes.length,
  exhausted: count - successes.length,
  topologyCandidates: records.reduce((n, r) => n + r.candidates.length, 0),
  rejectedTopologies: records
    .flatMap((r) => r.candidates)
    .filter((c) => !c.valid).length,
  kevinCandidates: records
    .flatMap((r) => r.candidates)
    .reduce((n, c) => n + c.kevinCandidates, 0),
  entryCombinations: records
    .flatMap((r) => r.candidates)
    .reduce((n, c) => n + c.entranceCombinations, 0),
  rejectedEntryCombinations: records
    .flatMap((r) => r.candidates)
    .flatMap((c) => c.selections)
    .flatMap((s) => s.evaluations)
    .filter((e) => e.reasons.length).length,
  rejectionCounts,
  generationMs: aggregate(records.map((r) => r.elapsedMs)),
  floorRatio: aggregate(metrics.map((m) => m.traversablePercentage)),
  deadEnds: aggregate(metrics.map((m) => m.deadEnds)),
  junctions: aggregate(metrics.map((m) => m.junctions)),
  cycles: aggregate(metrics.map((m) => m.independentCycles)),
  relativeDifference: aggregate(
    metrics.map((m) => m.distance.relativeDifference),
  ),
  shortestDistance: aggregate(metrics.map((m) => m.distance.minimum)),
  longestDistance: aggregate(metrics.map((m) => m.distance.maximum)),
  straightRun: aggregate(metrics.map((m) => m.corridors.longestStraightRun)),
};
const environment = {
  node: process.version,
  platform: platform(),
  arch: arch(),
  cpu: cpus()[0]?.model,
};
// Trazas completas en NDJSON; el resumen JSON conserva métricas por semilla sin duplicar los detalles.
writeFileSync(
  `docs/diagnostic-after${count}.ndjson`,
  records.map((record) => JSON.stringify(record)).join("\n") + "\n",
);
writeFileSync(
  `docs/diagnostic-after${count}.json`,
  JSON.stringify(
    {
      environment,
      summary,
      records: records.map((record) => ({
        ...record,
        candidates: record.candidates.map(({ selections, ...candidate }) => ({
          ...candidate,
          rejectedLocations: selections.filter(
            (s) => !s.evaluations.some((e) => !e.reasons.length),
          ).length,
        })),
      })),
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
if (successes.length !== count) process.exitCode = 1;
