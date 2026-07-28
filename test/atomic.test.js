import assert from "node:assert/strict";
import test from "node:test";

import {resolveAtomicQuadtreeCut} from "../src/index.js";

const tile = (id, level, x, y) => ({id, level, x, y});
const witness = (level, x, y, settled = false) => ({level, x, y, settled});

const locate = (sample, level) => {
  const scale = 2 ** (sample.level - level);
  return {
    x: Math.floor(sample.x / scale),
    y: Math.floor(sample.y / scale),
  };
};

const resolve = (overrides = {}) => resolveAtomicQuadtreeCut({
  ready: [],
  committed: [],
  witnesses: [],
  getId: (entry) => entry.id,
  getAddress: (entry) => entry,
  locateWitness: locate,
  ...overrides,
});

test("a covered branch advances while an uncovered branch keeps its parent", () => {
  const leftParent = tile("left-parent", 4, -2, 1);
  const rightParent = tile("right-parent", 4, -1, 1);
  const leftChildren = [
    tile("left-a", 5, -4, 2),
    tile("left-b", 5, -3, 2),
  ];
  const rightChild = tile("right-a", 5, -2, 2);
  const result = resolve({
    committed: [rightParent, leftParent],
    ready: [rightChild, ...leftChildren],
    witnesses: [
      witness(5, -4, 2),
      witness(5, -3, 2),
      witness(5, -1, 2),
    ],
  });

  assert.deepEqual([...result.ids], ["right-parent", "left-a", "left-b"]);
  assert.equal(result.coverage.complete, true);
  assert.equal(result.blockedBranches.length, 1);
  assert.equal(result.blockedBranches[0].parent.id, "right-parent");
  assert.equal(result.blockedBranches[0].reason, "uncovered-witnesses");
  assert.deepEqual(result.blockedBranches[0].uncoveredWitnessIndexes, [2]);
  assert.equal(result.transitions.filter(({type}) => type === "refine").length, 1);
});

test("a ready ancestor replaces finer committed cells without witness authority", () => {
  const overview = tile("overview", 3, 2, -1);
  const result = resolve({
    committed: [
      tile("detail-a", 5, 8, -4),
      tile("detail-b", 5, 9, -4),
    ],
    ready: [overview],
  });

  assert.deepEqual(result.cut, [overview]);
  assert.equal(result.coverage.reliable, false);
  assert.equal(result.coverage.complete, false);
  assert.equal(result.transitions.at(-1).type, "coarsen");
  assert.deepEqual(
    result.transitions.at(-1).removed.map(({id}) => id),
    ["detail-a", "detail-b"]
  );
});

test("same-address committed identity wins and a separate ready cell joins", () => {
  const stable = tile("stable", 6, 5, 7);
  const replacement = tile("replacement", 6, 5, 7);
  const arrival = tile("arrival", 6, 6, 7);
  const result = resolve({
    committed: [stable],
    ready: [arrival, replacement],
    witnesses: [witness(6, 5, 7), witness(6, 6, 7)],
  });

  assert.deepEqual(result.cut, [stable, arrival]);
  assert.deepEqual(result.transitions.map(({type}) => type), ["retain", "join"]);
  assert.equal(result.transitions[0].reason, "same-address");
  assert.equal(result.coverage.complete, true);
});

test("known blank witnesses can release a partially populated branch", () => {
  const parent = tile("parent", 1, 0, 0);
  const available = tile("available", 2, 0, 0);
  const blank = witness(2, 1, 0, true);
  const result = resolve({
    committed: [parent],
    ready: [available],
    witnesses: [witness(2, 0, 0), blank],
    isWitnessSettledWithoutContent: (sample) => sample.settled,
  });

  assert.deepEqual(result.cut, [available]);
  assert.equal(result.coverage.covered, 2);
  assert.equal(result.coverage.complete, true);
  assert.deepEqual(result.transitions.at(-1).witnessIndexes, [0, 1]);
});

test("missing witnesses keep refinements closed but still permit first content", () => {
  const parent = tile("parent", 2, 0, 0);
  const child = tile("child", 3, 0, 0);
  const retained = resolve({committed: [parent], ready: [child]});
  assert.deepEqual(retained.cut, [parent]);
  assert.equal(retained.blockedBranches[0].reason, "unreliable-witnesses");
  assert.equal(retained.coverage.issues[0].code, "empty-witness-set");

  const initial = resolve({ready: [child]});
  assert.deepEqual(initial.cut, [child]);
  assert.equal(initial.coverage.complete, false);
});

test("a reliable set with no witness in the parent does not authorize refinement", () => {
  const parent = tile("parent", 2, 0, 0);
  const child = tile("child", 3, 0, 0);
  const result = resolve({
    committed: [parent],
    ready: [child],
    witnesses: [witness(3, 7, 7)],
  });

  assert.deepEqual(result.cut, [parent]);
  assert.equal(result.blockedBranches[0].reason, "no-witnesses-in-branch");
  assert.deepEqual(result.blockedBranches[0].witnessIndexes, []);
  assert.deepEqual(result.coverage.uncoveredWitnessIndexes, [0]);
});

test("committed filtering happens before cut normalization", () => {
  const coarse = tile("coarse", 2, 0, 0);
  const fine = tile("fine", 3, 0, 0);
  const result = resolve({
    committed: [coarse, fine],
    witnesses: [witness(3, 0, 0)],
    keepCommitted: (entry) => entry !== coarse,
  });

  assert.deepEqual(result.cut, [fine]);
  assert.equal(result.transitions[0].type, "drop");
  assert.equal(result.transitions[0].removed.id, "coarse");
  assert.deepEqual(result.diagnostics.suppressedCommitted, []);
});

test("committed filtering precedes duplicate and cross-source validation", () => {
  const stale = {...tile("shared", 1, 0, 0), revision: "stale"};
  const usable = {...tile("shared", 1, 0, 0), revision: "usable"};
  const retained = resolve({
    committed: [stale, usable],
    keepCommitted: ({revision}) => revision === "usable",
    witnesses: [witness(1, 0, 0)],
  });
  assert.deepEqual(retained.cut, [usable]);
  assert.equal(retained.transitions[0].type, "drop");
  assert.equal(retained.transitions[0].removed.item, stale);

  const replacement = tile("shared", 1, 1, 0);
  const replaced = resolve({
    committed: [stale],
    ready: [replacement],
    keepCommitted: () => false,
    witnesses: [witness(1, 1, 0)],
  });
  assert.deepEqual(replaced.cut, [replacement]);
});

test("coarser inputs suppress their descendants deterministically", () => {
  const coarse = tile("coarse", 1, -1, -1);
  const fine = tile("fine", 2, -2, -2);
  const result = resolve({
    ready: [fine, coarse, coarse],
    witnesses: [witness(2, -2, -2)],
  });

  assert.deepEqual(result.cut, [coarse]);
  assert.equal(result.diagnostics.suppressedReady.length, 1);
  assert.equal(result.diagnostics.suppressedReady[0].id, "fine");
  assert.equal(result.diagnostics.suppressedReady[0].coveredById, "coarse");
});

test("settled evidence can prove an intentionally empty cut", () => {
  const result = resolve({
    witnesses: [witness(0, 0, 0, true)],
    isWitnessSettledWithoutContent: ({settled}) => settled,
  });

  assert.deepEqual(result.cut, []);
  assert.equal(result.coverage.reliable, true);
  assert.equal(result.coverage.complete, true);
  assert.deepEqual(result.coverage.coveredWitnessIndexes, [0]);
});
