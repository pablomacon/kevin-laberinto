import { diagnoseCandidate } from '../packages/maze-engine/src/index.js';

console.log(JSON.stringify(Array.from({ length: 20 }, (_, i) => {
  const d = diagnoseCandidate({ columns: 80, rows: 45, entranceCount: 6, seed: `integration-${i}` });
  return { ...d, validation: { ...d.validation, metrics: { ...d.validation.metrics, articulationPoints: d.validation.metrics.articulationPoints.length } } };
})));
