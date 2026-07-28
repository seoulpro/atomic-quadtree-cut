# Service adapter

A renderer commonly stores addresses as `{z, x, y}`, identities as `key`, and
coverage probes as coordinates in its own world space. Keep that representation
outside the package:

```js
import {resolveAtomicQuadtreeCut} from "atomic-quadtree-cut";

export function resolveDisplayCut({
  readyTiles,
  previousTiles,
  probePoints,
  worldPointToTile,
  isPreviousTileUsable,
  isKnownBlank,
}) {
  const result = resolveAtomicQuadtreeCut({
    ready: readyTiles,
    committed: previousTiles,
    witnesses: probePoints,
    getId: (tile) => tile.key,
    getAddress: (tile) => ({
      level: tile.z,
      x: tile.x,
      y: tile.y,
    }),
    locateWitness: (point, level) => {
      const tile = worldPointToTile(point.worldX, point.worldY, level);
      return {x: tile.x, y: tile.y};
    },
    keepCommitted: isPreviousTileUsable,
    isWitnessSettledWithoutContent: isKnownBlank,
  });

  return {
    renderKeys: result.ids,
    renderTiles: result.cut,
    coverageComplete: result.coverage.complete,
    diagnostics: result,
  };
}
```

This mapping preserves three boundaries:

- the service owns coordinate conversion and probe generation;
- the service decides whether cached content remains usable;
- the package only reconciles spatial identities.

Keep any camera epoch, no-data expiration time, frame-level coverage probe, and
minimum witness count in the service. A second frame-level check can remain in
place as defense in depth.
