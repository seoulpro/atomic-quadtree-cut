# Design

## Scope

The package solves one state transition:

1. a caller already displays a non-overlapping quadtree cut;
2. another set of items has become ready;
3. the caller supplies point-like witnesses for the region that matters now;
4. the resolver returns the next non-overlapping cut.

Selection policy, screen-space error, loading, retries, cache eviction,
rendering, and witness generation remain caller responsibilities.

## Address model

An address is `(level, x, y)`. Increasing the level by one divides a cell into
four children. Signed coordinates form independent roots across the plane.
For negative values, ancestry uses mathematical floor division:

```text
parentX = floor(childX / 2^(childLevel - parentLevel))
parentY = floor(childY / 2^(childLevel - parentLevel))
```

JavaScript numbers represent the public address fields, so the supported level
range ends at 52 and every coordinate must be a safe integer.

## Cut invariants

For each successful result:

1. every selected item came from `committed` or `ready`;
2. selected IDs and addresses are unique;
3. no selected address is an ancestor of another selected address;
4. a descendant replacement never removes a committed parent without reliable
   witnesses inside that parent;
5. each witness used for that replacement is covered by a ready descendant or
   explicitly settled without content;
6. a ready ancestor may replace selected descendants because its cell contains
   their complete spatial extent;
7. branches with no ancestor relationship do not block one another.

## Evidence reliability

Witness evaluation has two stages:

1. optional settlement classification;
2. conversion into a tile coordinate at each distinct input level.

Both stages are cached. An empty witness list, a thrown callback, or an invalid
coordinate marks the evidence unreliable. Unreliable evidence makes
`coverage.complete` false and blocks all descendant replacements. Safe
coarsening and unrelated joins still proceed.

Settled witnesses are still located. Their position is needed to determine
which committed branch they can help release.

## Determinism

Committed-item filtering runs before retained cut validation and cross-source
identity checks. A stale item that the caller rejects cannot suppress a usable
duplicate or conflict with a ready replacement.

Input cuts are ordered by level, x, and y. Repeated references to one item are
removed. Distinct items claiming the same ID/address pair, as well as ambiguous
address or ID assignments, throw before reconciliation, so an input-order
tie-breaker is neither needed nor observable.

The resolver does not modify input arrays or items. Diagnostic addresses are
validated snapshots rather than references returned by caller accessors.

## Ready trees

`resolveReadyTreeCut` evaluates a materialized tree bottom-up. A ready parent
remains selected until its children form a complete partition and every child
branch is covered. When neither the parent nor all child branches are ready,
ready descendants are returned as a partial cut and the result is marked
incomplete.

Diagnostics describe only the selected cut path. When a ready ancestor is
retained, speculative descendant transitions and unresolved nodes are
discarded rather than exposed as actions beside the retained ancestor.

The default partition rule requires exactly four immediate children. A caller
with a sparse or virtual tree must provide `isBranchComplete` and take
responsibility for its partition semantics.
