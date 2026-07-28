import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";

import {
  isQuadtreeAncestor,
  resolveAtomicQuadtreeCut,
} from "../src/index.js";

const smoke = process.argv.includes("--smoke");
const branchCount = smoke ? 24 : 512;
const runs = smoke ? 2 : 8;
const committed = [];
const ready = [];
const witnesses = [];

for (let branch = 0; branch < branchCount; branch += 1) {
  const x = branch - Math.floor(branchCount / 2);
  committed.push({id: `p-${branch}`, level: 10, x, y: 0});
  for (let child = 0; child < 4; child += 1) {
    ready.push({
      id: `c-${branch}-${child}`,
      level: 11,
      x: x * 2 + child % 2,
      y: Math.floor(child / 2),
    });
    witnesses.push({
      level: 11,
      x: x * 2 + child % 2,
      y: Math.floor(child / 2),
    });
  }
}

const locateWitness = (sample, level) => {
  const scale = 2 ** (sample.level - level);
  return {
    x: Math.floor(sample.x / scale),
    y: Math.floor(sample.y / scale),
  };
};

let result;
const started = performance.now();
for (let run = 0; run < runs; run += 1) {
  result = resolveAtomicQuadtreeCut({
    committed,
    ready,
    witnesses,
    getId: ({id}) => id,
    getAddress: ({level, x, y}) => ({level, x, y}),
    locateWitness,
  });
}
const elapsedMs = performance.now() - started;

assert.equal(result.coverage.complete, true);
assert.equal(result.cut.length, ready.length);
for (let index = 1; index < result.cut.length; index += 1) {
  assert.equal(isQuadtreeAncestor(result.cut[index - 1], result.cut[index]), false);
}
if (smoke) assert.ok(elapsedMs < 10_000);

console.log(JSON.stringify({
  mode: smoke ? "smoke" : "default",
  branches: branchCount,
  ready: ready.length,
  witnesses: witnesses.length,
  runs,
  elapsedMs: Number(elapsedMs.toFixed(3)),
}));
