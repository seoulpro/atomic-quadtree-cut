import assert from "node:assert/strict";
import test from "node:test";

import {resolveAtomicQuadtreeCut} from "../src/index.js";

const adaptDisplayCut = ({
  readyTiles,
  previousTiles,
  probes,
  usable = () => true,
  blank = () => false,
}) => {
  const result = resolveAtomicQuadtreeCut({
    ready: readyTiles,
    committed: previousTiles,
    witnesses: probes,
    getId: ({key}) => key,
    getAddress: ({z, x, y}) => ({level: z, x, y}),
    locateWitness: ({worldX, worldY}, level) => {
      const tileWorld = 2 ** (8 - level);
      return {
        x: Math.floor(worldX / tileWorld),
        y: Math.floor(worldY / tileWorld),
      };
    },
    keepCommitted: usable,
    isWitnessSettledWithoutContent: blank,
  });
  return {
    renderKeys: result.ids,
    renderTiles: result.cut,
    complete: result.coverage.complete,
  };
};

test("a z/x/y and world-point adapter preserves display-oriented shapes", () => {
  const parent = {key: "parent", z: 3, x: -1, y: 0};
  const children = [
    {key: "west", z: 4, x: -2, y: 0},
    {key: "east", z: 4, x: -1, y: 0},
  ];
  const result = adaptDisplayCut({
    previousTiles: [parent],
    readyTiles: children,
    probes: [
      {worldX: -24, worldY: 8},
      {worldX: -8, worldY: 8},
    ],
  });

  assert.deepEqual(result.renderTiles, children);
  assert.deepEqual([...result.renderKeys], ["west", "east"]);
  assert.equal(result.complete, true);
});
