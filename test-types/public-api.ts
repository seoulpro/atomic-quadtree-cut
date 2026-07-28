import {
  MAX_SAFE_QUADTREE_LEVEL,
  compareQuadtreeAddresses,
  isQuadtreeAncestor,
  resolveAtomicQuadtreeCut,
  resolveReadyTreeCut,
  type AtomicQuadtreeCutResult,
  type QuadtreeAddress,
  type ReadyTreeCutResult,
} from "atomic-quadtree-cut";

interface Tile {
  readonly id: string;
  readonly address: QuadtreeAddress;
  readonly ready: boolean;
  readonly children: readonly Tile[];
}

interface Witness {
  readonly x: number;
  readonly y: number;
}

const tiles: readonly Tile[] = [];
const result: AtomicQuadtreeCutResult<Tile> = resolveAtomicQuadtreeCut({
  committed: null,
  ready: tiles,
  witnesses: [] as readonly Witness[],
  getId: (tile, index, source) => `${source}:${index}:${tile.id}`,
  getAddress: (tile) => tile.address,
  locateWitness: (witness, level, index) => ({
    x: witness.x + level - level + index - index,
    y: witness.y,
  }),
  keepCommitted: (tile, index) => tile.ready || index >= 0,
  isWitnessSettledWithoutContent: (_witness, index) => index < 0,
});

const tree: ReadyTreeCutResult<Tile> = resolveReadyTreeCut({
  roots: tiles,
  getId: (tile) => tile.id,
  getAddress: (tile) => tile.address,
  getChildren: (tile) => tile.children,
  isReady: (tile) => tile.ready,
  isBranchComplete: (_parent, children) => children.length === 4,
});

const addressOrder: number = compareQuadtreeAddresses(
  {level: 0, x: 0, y: 0},
  {level: 1, x: 0, y: 0}
);
const contains: boolean = isQuadtreeAncestor(
  {level: 0, x: 0, y: 0},
  {level: 1, x: 0, y: 0}
);
const maximum: 52 = MAX_SAFE_QUADTREE_LEVEL;

void result;
void tree;
void addressOrder;
void contains;
void maximum;
