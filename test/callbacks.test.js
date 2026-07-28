import assert from "node:assert/strict";
import test from "node:test";

import {resolveAtomicQuadtreeCut} from "../src/index.js";

const entry = (id, level, x, y) => ({id, address: {level, x, y}});

test("accessors and evidence callbacks are evaluated once per required key", () => {
  const committed = [entry("parent", 2, 0, 0)];
  const ready = [
    entry("child-a", 3, 0, 0),
    entry("child-b", 4, 2, 0),
  ];
  const witnesses = [{x: 0, y: 0}, {x: 2, y: 0}];
  let idCalls = 0;
  let addressCalls = 0;
  let keepCalls = 0;
  let settledCalls = 0;
  let locationCalls = 0;

  resolveAtomicQuadtreeCut({
    committed,
    ready,
    witnesses,
    getId: (tile) => {
      idCalls += 1;
      return tile.id;
    },
    getAddress: (tile) => {
      addressCalls += 1;
      return tile.address;
    },
    keepCommitted: () => {
      keepCalls += 1;
      return true;
    },
    isWitnessSettledWithoutContent: () => {
      settledCalls += 1;
      return false;
    },
    locateWitness: (sample, level) => {
      locationCalls += 1;
      const scale = 2 ** (4 - level);
      return {
        x: Math.floor(sample.x / scale),
        y: Math.floor(sample.y / scale),
      };
    },
  });

  assert.equal(idCalls, 3);
  assert.equal(addressCalls, 3);
  assert.equal(keepCalls, 1);
  assert.equal(settledCalls, 2);
  assert.equal(locationCalls, 6, "two witnesses at three distinct levels");
});

test("a location failure is reported and cannot release a parent", () => {
  const parent = entry("parent", 2, 0, 0);
  const child = entry("child", 3, 0, 0);
  const result = resolveAtomicQuadtreeCut({
    committed: [parent],
    ready: [child],
    witnesses: [{kind: "valid"}, {kind: "fractional"}, {kind: "missing"}],
    getId: ({id}) => id,
    getAddress: ({address}) => address,
    locateWitness: ({kind}) => {
      if (kind === "valid") return {x: 0, y: 0};
      if (kind === "fractional") return {x: 0.5, y: 0};
      return null;
    },
  });

  assert.deepEqual(result.cut, [parent]);
  assert.equal(result.coverage.reliable, false);
  assert.equal(result.coverage.issues.length, 4);
  assert.ok(result.coverage.issues.every(
    ({code}) => code === "invalid-witness-location"
  ));
  assert.equal(result.blockedBranches[0].reason, "unreliable-witnesses");
});

test("thrown locator and settlement values become fail-closed issues", () => {
  const parent = entry("parent", 1, 0, 0);
  const child = entry("child", 2, 0, 0);
  const locationFailure = resolveAtomicQuadtreeCut({
    committed: [parent],
    ready: [child],
    witnesses: [{}],
    getId: ({id}) => id,
    getAddress: ({address}) => address,
    locateWitness: () => {
      throw new TypeError("projection unavailable");
    },
  });
  assert.equal(locationFailure.coverage.issues[0].code, "location-callback-error");
  assert.match(locationFailure.coverage.issues[0].message, /projection unavailable/);

  const settlementFailure = resolveAtomicQuadtreeCut({
    committed: [parent],
    ready: [child],
    witnesses: [{}],
    getId: ({id}) => id,
    getAddress: ({address}) => address,
    locateWitness: () => ({x: 0, y: 0}),
    isWitnessSettledWithoutContent: () => {
      throw "settlement unavailable";
    },
  });
  assert.equal(
    settlementFailure.coverage.issues[0].code,
    "settlement-callback-error"
  );
  assert.equal(settlementFailure.coverage.issues[0].message, "settlement unavailable");
  assert.deepEqual(settlementFailure.cut, [parent]);
});

test("diagnostic addresses are snapshots rather than accessor-owned objects", () => {
  const address = {level: 2, x: -0, y: 1};
  const stable = entry("stable", 2, 0, 1);
  const offered = {id: "offered", address};
  const result = resolveAtomicQuadtreeCut({
    committed: [stable],
    ready: [offered],
    witnesses: [{x: 0, y: 1}],
    getId: ({id}) => id,
    getAddress: ({address: value}) => value,
    locateWitness: (sample) => sample,
  });

  address.x = 99;
  assert.equal(result.transitions[0].ignored.address.x, 0);
  assert.equal(Object.is(result.transitions[0].ignored.address.x, -0), false);
});
