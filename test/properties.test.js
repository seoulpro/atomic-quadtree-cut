import assert from "node:assert/strict";
import test from "node:test";

import {
  isQuadtreeAncestor,
  resolveAtomicQuadtreeCut,
} from "../src/index.js";

const coverageCount = (seed, branch, lane) => (
  1 + (seed * (branch + lane) + branch ** 2 + lane) % 4
);

const permutedFor = (items, seed, lane) => {
  const remaining = [...items];
  const permutation = [];
  let cursor = (seed * lane + remaining.length) % remaining.length;
  while (remaining.length > 0) {
    cursor = (
      cursor
      + seed
      + lane
      + permutation.length ** 2
    ) % remaining.length;
    permutation.push(remaining.splice(cursor, 1)[0]);
  }
  return permutation;
};

const locate = (sample, level) => {
  const scale = 2 ** (sample.level - level);
  return {
    x: Math.floor(sample.x / scale),
    y: Math.floor(sample.y / scale),
  };
};

const run = (committed, ready, witnesses) => resolveAtomicQuadtreeCut({
  committed,
  ready,
  witnesses,
  getId: ({id}) => id,
  getAddress: ({level, x, y}) => ({level, x, y}),
  locateWitness: locate,
});

const assertCut = (result, inputs) => {
  const inputSet = new Set(inputs);
  assert.ok(result.cut.every((item) => inputSet.has(item)));
  assert.equal(result.ids.size, result.cut.length);
  for (let left = 0; left < result.cut.length; left += 1) {
    for (let right = left + 1; right < result.cut.length; right += 1) {
      const a = result.cut[left];
      const b = result.cut[right];
      assert.equal(isQuadtreeAncestor(a, b), false);
      assert.equal(isQuadtreeAncestor(b, a), false);
    }
  }
};

test("seeded permutations preserve the cut, coverage, and invariants", () => {
  for (let seed = 1; seed <= 80; seed += 1) {
    const committed = [];
    const ready = [];
    const witnesses = [];
    for (let branch = 0; branch < 8; branch += 1) {
      const x = branch - 4;
      committed.push({id: `p-${branch}`, level: 3, x, y: 0});
      const childCount = coverageCount(seed, branch, 3);
      const cells = [
        [x * 2, 0],
        [x * 2 + 1, 0],
        [x * 2, 1],
        [x * 2 + 1, 1],
      ];
      for (let index = 0; index < childCount; index += 1) {
        const [childX, childY] = cells[index];
        ready.push({
          id: `c-${branch}-${index}`,
          level: 4,
          x: childX,
          y: childY,
        });
      }
      const witnessCount = coverageCount(seed, branch, 5);
      for (let index = 0; index < witnessCount; index += 1) {
        const [witnessX, witnessY] = cells[index];
        witnesses.push({level: 4, x: witnessX, y: witnessY});
      }
    }

    const baseline = run(committed, ready, witnesses);
    const permuted = run(
      permutedFor(committed, seed, 7),
      permutedFor(ready, seed, 11),
      permutedFor(witnesses, seed, 13)
    );
    assert.deepEqual([...permuted.ids].sort(), [...baseline.ids].sort());
    assert.equal(permuted.coverage.complete, baseline.coverage.complete);
    assert.equal(permuted.coverage.covered, baseline.coverage.covered);
    assertCut(baseline, [...committed, ...ready]);

    const repeated = run(baseline.cut, ready, witnesses);
    assert.deepEqual([...repeated.ids], [...baseline.ids]);
  }
});

test("an uncovered witness cannot make a committed branch refine", () => {
  const parent = {id: "parent", level: 2, x: 0, y: 0};
  const child = {id: "child", level: 3, x: 0, y: 0};
  const covered = run([parent], [child], [{level: 3, x: 0, y: 0}]);
  const guarded = run(
    [parent],
    [child],
    [
      {level: 3, x: 0, y: 0},
      {level: 3, x: 1, y: 0},
    ]
  );
  assert.deepEqual(covered.cut, [child]);
  assert.deepEqual(guarded.cut, [parent]);
});

test("changes in one signed branch do not alter another branch", () => {
  const left = {id: "left", level: 2, x: -1, y: 0};
  const right = {id: "right", level: 2, x: 1, y: 0};
  const leftChild = {id: "left-child", level: 3, x: -2, y: 0};
  const rightChild = {id: "right-child", level: 3, x: 2, y: 0};
  const first = run(
    [left, right],
    [leftChild],
    [{level: 3, x: -2, y: 0}, {level: 3, x: 3, y: 0}]
  );
  const second = run(
    [left, right],
    [leftChild, rightChild],
    [{level: 3, x: -2, y: 0}, {level: 3, x: 3, y: 0}]
  );
  assert.equal(first.ids.has("left-child"), true);
  assert.equal(second.ids.has("left-child"), true);
});
