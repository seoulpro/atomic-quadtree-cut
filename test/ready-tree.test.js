import assert from "node:assert/strict";
import test from "node:test";

import {resolveReadyTreeCut} from "../src/index.js";

const node = (id, level, x, y, ready = true, children = []) => ({
  id,
  address: {level, x, y},
  ready,
  children,
});

const options = (roots, overrides = {}) => ({
  roots,
  getId: ({id}) => id,
  getAddress: ({address}) => address,
  getChildren: ({children}) => children,
  isReady: ({ready}) => ready,
  ...overrides,
});

const quadrants = (parent, readiness = [true, true, true, true]) => [
  node("a", parent.address.level + 1, parent.address.x * 2, parent.address.y * 2, readiness[0]),
  node("b", parent.address.level + 1, parent.address.x * 2 + 1, parent.address.y * 2, readiness[1]),
  node("c", parent.address.level + 1, parent.address.x * 2, parent.address.y * 2 + 1, readiness[2]),
  node("d", parent.address.level + 1, parent.address.x * 2 + 1, parent.address.y * 2 + 1, readiness[3]),
];

test("a complete ready quartet replaces its parent", () => {
  const root = node("root", 2, -1, 3);
  root.children = quadrants(root);
  const result = resolveReadyTreeCut(options([root]));

  assert.deepEqual([...result.ids], ["a", "c", "b", "d"]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.transitions[0].type, "refine");
});

test("an unavailable quadrant keeps a ready parent", () => {
  const root = node("root", 1, 0, 0);
  root.children = quadrants(root, [true, true, false, true]);
  const result = resolveReadyTreeCut(options([root]));

  assert.deepEqual(result.cut, [root]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.blockedBranches[0].reason, "children-not-ready");
  assert.equal(result.transitions.at(-1).type, "retain");
});

test("retaining a ready ancestor discards superseded descendant diagnostics", () => {
  const root = node("root", 0, 0, 0);
  root.children = quadrants(root);
  const first = root.children[0];
  first.ready = false;
  first.children = quadrants(first, [true, false, true, true]).map(
    (child) => ({...child, id: `first-${child.id}`})
  );

  const result = resolveReadyTreeCut(options([root]));

  assert.deepEqual(result.cut, [root]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(
    result.blockedBranches.map(({parent}) => parent.id),
    ["root"]
  );
  assert.deepEqual(
    result.transitions.map(({type, parent}) => `${type}:${parent.id}`),
    ["retain:root"]
  );
});

test("an incomplete child partition cannot displace its parent", () => {
  const root = node("root", 1, 0, 0);
  root.children = quadrants(root).slice(0, 3);
  const result = resolveReadyTreeCut(options([root]));

  assert.deepEqual(result.cut, [root]);
  assert.equal(result.blockedBranches[0].reason, "incomplete-partition");
});

test("ready descendants can cover a parent that has no content", () => {
  const root = node("root", 1, 0, 0, false);
  root.children = quadrants(root);
  const result = resolveReadyTreeCut(options([root]));

  assert.equal(result.complete, true);
  assert.deepEqual(result.cut, [
    root.children[0],
    root.children[2],
    root.children[1],
    root.children[3],
  ]);
});

test("partial descendants are returned with an unresolved branch", () => {
  const root = node("root", 1, 0, 0, false);
  root.children = quadrants(root, [true, false, false, false]);
  const result = resolveReadyTreeCut(options([root]));

  assert.equal(result.complete, false);
  assert.deepEqual(result.cut, [root.children[0]]);
  assert.ok(result.unresolved.some(({id}) => id === "root"));
  assert.equal(result.transitions.at(-1).type, "partial");
});

test("a caller can certify a nonstandard partition", () => {
  const root = node("root", 1, 0, 0);
  root.children = [
    node("west", 2, 0, 0),
    node("east", 2, 1, 0),
  ];
  let branchChecks = 0;
  const result = resolveReadyTreeCut(options([root], {
    isBranchComplete: (_parent, children) => {
      branchChecks += 1;
      return children.length === 2;
    },
  }));

  assert.deepEqual(result.cut, root.children);
  assert.equal(branchChecks, 1);
});

test("tree accessors are cached once per node", () => {
  const root = node("root", 0, 0, 0);
  root.children = quadrants(root);
  const counts = {id: 0, address: 0, children: 0, ready: 0};
  resolveReadyTreeCut({
    roots: [root],
    getId: (value) => {
      counts.id += 1;
      return value.id;
    },
    getAddress: (value) => {
      counts.address += 1;
      return value.address;
    },
    getChildren: (value) => {
      counts.children += 1;
      return value.children;
    },
    isReady: (value) => {
      counts.ready += 1;
      return value.ready;
    },
  });
  assert.deepEqual(counts, {id: 5, address: 5, children: 5, ready: 5});
});

test("tree shape and callback violations are rejected", () => {
  assert.throws(() => resolveReadyTreeCut(), /options/);
  assert.throws(
    () => resolveReadyTreeCut({...options([]), roots: null}),
    /roots must be an array/
  );
  for (const name of ["getId", "getAddress", "getChildren", "isReady"]) {
    assert.throws(
      () => resolveReadyTreeCut({...options([]), [name]: null}),
      new RegExp(`${name} must be a function`)
    );
  }
  assert.throws(
    () => resolveReadyTreeCut({...options([]), isBranchComplete: true}),
    /isBranchComplete must be a function/
  );
  assert.throws(
    () => resolveReadyTreeCut(options([
      {...node("bad", 0, 0, 0), children: null},
    ])),
    /children.*must be an array/
  );

  const cycle = node("cycle", 0, 0, 0);
  cycle.children = [cycle];
  assert.throws(() => resolveReadyTreeCut(options([cycle])), /reused|cycles/);

  assert.throws(
    () => resolveReadyTreeCut({
      roots: [1],
      getId: (value) => String(value),
      getAddress: () => ({level: 0, x: 0, y: 0}),
      getChildren: (value) => [value],
      isReady: () => true,
    }),
    /reused|cycles/
  );

  assert.throws(
    () => resolveReadyTreeCut(options([
      node("root", 1, 0, 0, true, [node("outside", 1, 1, 0)]),
    ])),
    /strict descendant/
  );
  assert.throws(
    () => resolveReadyTreeCut(options([
      node("root", 0, 0, 0, true, [
        node("same", 1, 0, 0),
        node("same", 1, 1, 0),
      ]),
    ])),
    /duplicate id/
  );
  assert.throws(
    () => resolveReadyTreeCut(options([
      node("root", 0, 0, 0, true, [
        node("one", 1, 0, 0),
        node("two", 1, 0, 0),
      ]),
    ])),
    /duplicate address/
  );
  assert.throws(
    () => resolveReadyTreeCut(options([
      node("root", 0, 0, 0, true, [
        node("coarse", 1, 0, 0),
        node("fine", 2, 0, 0),
      ]),
    ])),
    /overlapping addresses/
  );
  assert.throws(
    () => resolveReadyTreeCut(options([
      node("coarse", 0, 0, 0),
      node("fine", 1, 0, 0),
    ])),
    /roots contains overlapping/
  );
});

test("an empty tree is complete and selects nothing", () => {
  const result = resolveReadyTreeCut(options([]));
  assert.equal(result.complete, true);
  assert.deepEqual(result.cut, []);
});
