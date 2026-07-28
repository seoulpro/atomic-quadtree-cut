import {resolveAtomicQuadtreeCut} from "../src/index.js";

const tile = (id, level, x, y) => ({id, level, x, y});
const parent = tile("overview", 2, 1, -1);
const children = [
  tile("northwest", 3, 2, -2),
  tile("northeast", 3, 3, -2),
];
const witnesses = [
  {level: 3, x: 2, y: -2},
  {level: 3, x: 3, y: -2},
];

const result = resolveAtomicQuadtreeCut({
  committed: [parent],
  ready: children,
  witnesses,
  getId: (entry) => entry.id,
  getAddress: (entry) => entry,
  locateWitness: (witness, level) => {
    const scale = 2 ** (witness.level - level);
    return {
      x: Math.floor(witness.x / scale),
      y: Math.floor(witness.y / scale),
    };
  },
});

if (!result.coverage.complete || result.cut.length !== 2) {
  throw new Error("example reconciliation failed");
}

console.log(result.cut.map((entry) => entry.id).join(", "));
