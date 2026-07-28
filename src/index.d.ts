export const MAX_SAFE_QUADTREE_LEVEL: 52;

export interface QuadtreeAddress {
  readonly level: number;
  readonly x: number;
  readonly y: number;
}

export interface QuadtreePoint {
  readonly x: number;
  readonly y: number;
}

export type CutInputSource = "ready" | "committed";

export interface CutDiagnosticItem<Tile> {
  readonly item: Tile;
  readonly id: string;
  readonly address: QuadtreeAddress;
}

export interface SuppressedCutItem<Tile> extends CutDiagnosticItem<Tile> {
  readonly source: CutInputSource;
  readonly coveredById: string;
  readonly coveredByAddress: QuadtreeAddress;
}

export interface WitnessIssue {
  readonly code:
    | "empty-witness-set"
    | "settlement-callback-error"
    | "location-callback-error"
    | "invalid-witness-location";
  readonly witnessIndex: number | null;
  readonly level?: number;
  readonly message: string;
}

export interface CutCoverage {
  readonly reliable: boolean;
  readonly complete: boolean;
  readonly covered: number;
  readonly total: number;
  readonly coveredWitnessIndexes: readonly number[];
  readonly uncoveredWitnessIndexes: readonly number[];
  readonly issues: readonly WitnessIssue[];
}

export interface BlockedCutBranch<Tile> {
  readonly parent: CutDiagnosticItem<Tile>;
  readonly readyDescendants: readonly CutDiagnosticItem<Tile>[];
  readonly witnessIndexes: readonly number[];
  readonly uncoveredWitnessIndexes: readonly number[];
  readonly reason:
    | "unreliable-witnesses"
    | "no-witnesses-in-branch"
    | "uncovered-witnesses";
}

export type CutTransition<Tile> =
  | {
      readonly type: "drop";
      readonly reason: "not-kept";
      readonly removed: CutDiagnosticItem<Tile>;
    }
  | {
      readonly type: "retain";
      readonly reason: "same-address";
      readonly kept: CutDiagnosticItem<Tile>;
      readonly ignored: CutDiagnosticItem<Tile>;
    }
  | {
      readonly type: "coarsen";
      readonly added: CutDiagnosticItem<Tile>;
      readonly removed: readonly CutDiagnosticItem<Tile>[];
    }
  | {
      readonly type: "join";
      readonly added: CutDiagnosticItem<Tile>;
    }
  | {
      readonly type: "refine";
      readonly removed: CutDiagnosticItem<Tile>;
      readonly added: readonly CutDiagnosticItem<Tile>[];
      readonly witnessIndexes: readonly number[];
    };

export interface ResolveAtomicQuadtreeCutOptions<Tile, Witness> {
  readonly ready: readonly Tile[];
  readonly committed?: readonly Tile[] | null;
  readonly witnesses?: readonly Witness[] | null;
  readonly getId: (
    tile: Tile,
    index: number,
    source: CutInputSource
  ) => string;
  readonly getAddress: (
    tile: Tile,
    index: number,
    source: CutInputSource
  ) => QuadtreeAddress;
  readonly locateWitness: (
    witness: Witness,
    level: number,
    index: number
  ) => QuadtreePoint;
  readonly keepCommitted?: (tile: Tile, index: number) => boolean;
  readonly isWitnessSettledWithoutContent?: (
    witness: Witness,
    index: number
  ) => boolean;
}

export interface AtomicQuadtreeCutResult<Tile> {
  readonly cut: readonly Tile[];
  readonly ids: ReadonlySet<string>;
  readonly coverage: CutCoverage;
  readonly blockedBranches: readonly BlockedCutBranch<Tile>[];
  readonly transitions: readonly CutTransition<Tile>[];
  readonly diagnostics: {
    readonly suppressedReady: readonly SuppressedCutItem<Tile>[];
    readonly suppressedCommitted: readonly SuppressedCutItem<Tile>[];
  };
}

export function resolveAtomicQuadtreeCut<Tile, Witness>(
  options: ResolveAtomicQuadtreeCutOptions<Tile, Witness>
): AtomicQuadtreeCutResult<Tile>;

export interface ResolveReadyTreeCutOptions<Node> {
  readonly roots: readonly Node[];
  readonly getId: (node: Node, index: number) => string;
  readonly getAddress: (node: Node, index: number) => QuadtreeAddress;
  readonly getChildren: (node: Node, index: number) => readonly Node[];
  readonly isReady: (node: Node, index: number) => boolean;
  readonly isBranchComplete?: (
    parent: Node,
    children: readonly Node[],
    index: number
  ) => boolean;
}

export interface ReadyTreeBlockedBranch<Node> {
  readonly parent: CutDiagnosticItem<Node>;
  readonly selectedDescendants: readonly CutDiagnosticItem<Node>[];
  readonly reason: "children-not-ready" | "incomplete-partition";
}

export type ReadyTreeTransition<Node> =
  | {
      readonly type: "refine";
      readonly parent: CutDiagnosticItem<Node>;
      readonly selected: readonly CutDiagnosticItem<Node>[];
    }
  | {
      readonly type: "retain";
      readonly parent: CutDiagnosticItem<Node>;
      readonly reason: "children-not-ready" | "incomplete-partition";
    }
  | {
      readonly type: "partial";
      readonly parent: CutDiagnosticItem<Node>;
      readonly selected: readonly CutDiagnosticItem<Node>[];
      readonly reason: "children-not-ready" | "incomplete-partition";
    };

export interface ReadyTreeCutResult<Node> {
  readonly cut: readonly Node[];
  readonly ids: ReadonlySet<string>;
  readonly complete: boolean;
  readonly unresolved: readonly CutDiagnosticItem<Node>[];
  readonly blockedBranches: readonly ReadyTreeBlockedBranch<Node>[];
  readonly transitions: readonly ReadyTreeTransition<Node>[];
}

export function resolveReadyTreeCut<Node>(
  options: ResolveReadyTreeCutOptions<Node>
): ReadyTreeCutResult<Node>;

export function compareQuadtreeAddresses(
  left: QuadtreeAddress,
  right: QuadtreeAddress
): number;

export function isQuadtreeAncestor(
  ancestor: QuadtreeAddress,
  descendant: QuadtreeAddress
): boolean;
