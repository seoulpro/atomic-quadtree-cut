# atomic-quadtree-cut

`atomic-quadtree-cut` keeps streamed quadtree content visually coherent while
new levels become ready. It reconciles a previously displayed cut with ready
items and only replaces an ancestor when caller-provided coverage witnesses
prove that the replacement is safe.

The package is:

- independent of map projections, renderers, caches, and request schedulers;
- deterministic for a given set of inputs;
- safe for signed tile coordinates;
- side-effect free and dependency free;
- explicit about incomplete or unreliable coverage evidence.

## Installation

```sh
npm install atomic-quadtree-cut
```

Node.js 20.19 or newer is required.

## Atomic reconciliation

```js
import {resolveAtomicQuadtreeCut} from "atomic-quadtree-cut";

const parent = {id: "parent", level: 3, x: -1, y: 2};
const west = {id: "west", level: 4, x: -2, y: 4};
const east = {id: "east", level: 4, x: -1, y: 4};

const result = resolveAtomicQuadtreeCut({
  committed: [parent],
  ready: [west, east],
  witnesses: [
    {atLevel4: {x: -2, y: 4}},
    {atLevel4: {x: -1, y: 4}},
  ],
  getId: (tile) => tile.id,
  getAddress: ({level, x, y}) => ({level, x, y}),
  locateWitness: (witness, level) => {
    const scale = 2 ** (4 - level);
    return {
      x: Math.floor(witness.atLevel4.x / scale),
      y: Math.floor(witness.atLevel4.y / scale),
    };
  },
});

console.log([...result.ids]); // ["west", "east"]
console.log(result.coverage.complete); // true
```

`ready` means the items are already usable. This package does not start
requests or decide which level of detail should be requested.

### Replacement rules

The result is an antichain: no returned address contains another returned
address.

- A ready ancestor may replace committed descendants immediately.
- Ready descendants replace a committed ancestor only when at least one
  witness falls inside that ancestor and every such witness is covered.
- A witness accepted by `isWitnessSettledWithoutContent` counts as covered.
- A missing, empty, invalid, or failing witness set cannot authorize
  descendant replacement.
- A ready item in an unrelated branch can join the result immediately.
- At the same address, the committed item remains selected. This keeps its
  public identity stable while equivalent content is offered again.

Coverage is evidence over the supplied witnesses, not a geometric proof over
every point in a region. The caller controls witness placement and density.

### Diagnostics

The result includes:

- `coverage`, including reliability, counts, uncovered indexes, and issues;
- `blockedBranches`, explaining why committed ancestors remain;
- `transitions`, describing joins, refinement, coarsening, filtering, and
  same-address retention;
- `diagnostics`, listing inputs suppressed by coarser inputs in the same cut.

Callback results are cached during one call. `getId` and `getAddress` run once
for each unique input position, settlement runs once per witness, and
`locateWitness` runs once per witness and distinct level.

## Resolving a ready tree

`resolveReadyTreeCut` selects a cut directly from a tree:

```js
import {resolveReadyTreeCut} from "atomic-quadtree-cut";

const result = resolveReadyTreeCut({
  roots,
  getId: (node) => node.id,
  getAddress: (node) => node.address,
  getChildren: (node) => node.children,
  isReady: (node) => node.ready,
});
```

By default, a branch is complete only when it has the four immediate
quadtree children. Until all four child branches are covered, a ready parent
is retained. Custom tree representations can supply `isBranchComplete`.

## Input validation

IDs must be non-empty strings. Levels must be integers from 0 through 52.
Coordinates must be safe integers; negative values are supported.

Within one input cut:

- repeated references with the same ID/address are deduplicated;
- distinct items claiming the same ID/address pair are rejected as ambiguous;
- two IDs at one address are rejected;
- one ID at two addresses is rejected;
- a coarse item suppresses its descendants deterministically.

Across committed and ready inputs, one ID still cannot identify different
addresses. Different IDs at the same address are allowed because committed
identity intentionally wins.

## Integration

See [Service adapter](docs/service-adapter.md) for a projection adapter and
[Design](docs/design.md) for the complete invariants. The
[related-concepts review](docs/prior-art.md) records conceptual prior art and
the clean licensing boundary.

## License

ISC
