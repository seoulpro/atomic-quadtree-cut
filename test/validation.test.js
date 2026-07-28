import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SAFE_QUADTREE_LEVEL,
  compareQuadtreeAddresses,
  isQuadtreeAncestor,
  resolveAtomicQuadtreeCut,
} from "../src/index.js";

const validOptions = () => ({
  ready: [],
  committed: [],
  witnesses: [],
  getId: (item) => item.id,
  getAddress: (item) => item.address,
  locateWitness: (point) => point,
});

test("address utilities support signed cells and deterministic ordering", () => {
  assert.equal(
    isQuadtreeAncestor(
      {level: 1, x: -1, y: -1},
      {level: 3, x: -1, y: -4}
    ),
    true
  );
  assert.equal(
    isQuadtreeAncestor(
      {level: 4, x: 0, y: 0},
      {level: 3, x: 0, y: 0}
    ),
    false
  );
  assert.ok(
    compareQuadtreeAddresses(
      {level: 2, x: -1, y: 8},
      {level: 2, x: 0, y: -8}
    ) < 0
  );
  assert.equal(MAX_SAFE_QUADTREE_LEVEL, 52);
});

test("ambiguous IDs and addresses are rejected", () => {
  const options = validOptions();
  assert.throws(
    () => resolveAtomicQuadtreeCut({
      ...options,
      ready: [
        {id: "same", address: {level: 2, x: 0, y: 0}},
        {id: "same", address: {level: 2, x: 1, y: 0}},
      ],
    }),
    /reuses id/
  );
  assert.throws(
    () => resolveAtomicQuadtreeCut({
      ...options,
      ready: [
        {id: "a", address: {level: 2, x: 0, y: 0}},
        {id: "b", address: {level: 2, x: 0, y: 0}},
      ],
    }),
    /assigns address/
  );
  assert.throws(
    () => resolveAtomicQuadtreeCut({
      ...options,
      committed: [{id: "same", address: {level: 1, x: 0, y: 0}}],
      ready: [{id: "same", address: {level: 2, x: 0, y: 0}}],
    }),
    /refers to/
  );
  assert.throws(
    () => resolveAtomicQuadtreeCut({
      ...options,
      ready: [
        {id: "same", address: {level: 2, x: 0, y: 0}, version: 1},
        {id: "same", address: {level: 2, x: 0, y: 0}, version: 2},
      ],
    }),
    /ambiguously duplicates/
  );

  const repeated = {id: "same", address: {level: 2, x: 0, y: 0}};
  const deduplicated = resolveAtomicQuadtreeCut({
    ...options,
    ready: [repeated, repeated],
  });
  assert.deepEqual(deduplicated.cut, [repeated]);
});

test("malformed addresses and IDs fail before reconciliation", () => {
  const badAddresses = [
    null,
    {level: -1, x: 0, y: 0},
    {level: MAX_SAFE_QUADTREE_LEVEL + 1, x: 0, y: 0},
    {level: 1.5, x: 0, y: 0},
    {level: 1, x: Number.NaN, y: 0},
    {level: 1, x: 0, y: Number.POSITIVE_INFINITY},
    {level: 1, x: Number.MAX_SAFE_INTEGER + 1, y: 0},
  ];
  for (const address of badAddresses) {
    assert.throws(
      () => resolveAtomicQuadtreeCut({
        ...validOptions(),
        ready: [{id: "bad", address}],
      }),
      /address|level|safe integer/
    );
  }
  for (const id of ["", null, 4]) {
    assert.throws(
      () => resolveAtomicQuadtreeCut({
        ...validOptions(),
        ready: [{id, address: {level: 0, x: 0, y: 0}}],
      }),
      /non-empty string/
    );
  }
});

test("invalid option containers and callbacks are rejected", () => {
  assert.throws(() => resolveAtomicQuadtreeCut(), /options/);
  assert.throws(
    () => resolveAtomicQuadtreeCut({...validOptions(), ready: null}),
    /ready must be an array/
  );
  assert.throws(
    () => resolveAtomicQuadtreeCut({...validOptions(), committed: {}}),
    /committed must be an array/
  );
  assert.throws(
    () => resolveAtomicQuadtreeCut({...validOptions(), witnesses: {}}),
    /witnesses must be an array/
  );
  for (const name of ["getId", "getAddress", "locateWitness"]) {
    assert.throws(
      () => resolveAtomicQuadtreeCut({...validOptions(), [name]: null}),
      new RegExp(`${name} must be a function`)
    );
  }
  assert.throws(
    () => resolveAtomicQuadtreeCut({...validOptions(), keepCommitted: true}),
    /keepCommitted must be a function/
  );
  assert.throws(
    () => resolveAtomicQuadtreeCut({
      ...validOptions(),
      isWitnessSettledWithoutContent: true,
    }),
    /isWitnessSettledWithoutContent must be a function/
  );
});

test("public address utilities validate their inputs", () => {
  assert.throws(
    () => compareQuadtreeAddresses(null, {level: 0, x: 0, y: 0}),
    /left address/
  );
  assert.throws(
    () => isQuadtreeAncestor(
      {level: 0, x: 0, y: 0},
      {level: 1, x: 0.1, y: 0}
    ),
    /safe integers/
  );
});
