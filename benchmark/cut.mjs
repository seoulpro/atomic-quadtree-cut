import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { resolveAtomicQuadtreeCut } from "../src/index.js";

const optionValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(
    prefix.length,
  );
};

const parsePositiveIntegers = (value, fallback, label) => {
  if (value === undefined) return fallback;
  const entries = value.split(",");
  const parsed = entries.map(Number);
  if (
    entries.length === 0 ||
    parsed.some((entry) => !Number.isInteger(entry) || entry < 1)
  ) {
    throw new TypeError(`${label} must contain positive integers`);
  }
  return parsed;
};

const percentile = (values, fraction) =>
  values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];

const smoke = process.argv.includes("--smoke");
const branchCounts = parsePositiveIntegers(
  optionValue("branches"),
  smoke ? [24] : [64, 256, 512, 1_024],
  "branches",
);
const runs = Number(optionValue("runs") ?? (smoke ? 2 : 9));
const warmupRuns = Number(optionValue("warmup") ?? (smoke ? 0 : 2));

if (!Number.isInteger(runs) || runs < 1) {
  throw new TypeError("runs must be a positive integer");
}
if (!Number.isInteger(warmupRuns) || warmupRuns < 0) {
  throw new TypeError("warmup must be a non-negative integer");
}

const buildFixture = (branchCount) => {
  const committed = [];
  const ready = [];
  const witnesses = [];

  for (let branch = 0; branch < branchCount; branch += 1) {
    const x = branch - Math.floor(branchCount / 2);
    committed.push({ id: `p-${branch}`, level: 10, x, y: 0 });
    for (let child = 0; child < 4; child += 1) {
      const address = {
        level: 11,
        x: x * 2 + (child % 2),
        y: Math.floor(child / 2),
      };
      ready.push({ id: `c-${branch}-${child}`, ...address });
      witnesses.push(address);
    }
  }

  return { committed, ready, witnesses };
};

const locateWitness = (sample, level) => {
  const scale = 2 ** (sample.level - level);
  return {
    x: Math.floor(sample.x / scale),
    y: Math.floor(sample.y / scale),
  };
};

const measure = (fixture) =>
  resolveAtomicQuadtreeCut({
    ...fixture,
    getId: ({ id }) => id,
    getAddress: ({ level, x, y }) => ({ level, x, y }),
    locateWitness,
  });

const results = [];
for (const branches of branchCounts) {
  const fixture = buildFixture(branches);
  for (let run = 0; run < warmupRuns; run += 1) measure(fixture);

  const samples = [];
  let result;
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    result = measure(fixture);
    samples.push(performance.now() - startedAt);
  }
  samples.sort((left, right) => left - right);

  assert.equal(result.coverage.complete, true);
  assert.equal(result.cut.length, fixture.ready.length);
  assert.equal(result.blockedBranches.length, 0);

  const medianMs = percentile(samples, 0.5);
  results.push({
    branches,
    committed: fixture.committed.length,
    ready: fixture.ready.length,
    witnesses: fixture.witnesses.length,
    runs,
    medianMs: Number(medianMs.toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    minMs: Number(samples[0].toFixed(3)),
    maxMs: Number(samples.at(-1).toFixed(3)),
    microsecondsPerBranch: Number(((medianMs * 1_000) / branches).toFixed(3)),
  });
}

if (smoke) assert.ok(results[0].maxMs < 10_000);

console.log(
  JSON.stringify(
    {
      mode: smoke ? "smoke" : "default",
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      warmupRuns,
      results,
    },
    null,
    2,
  ),
);
