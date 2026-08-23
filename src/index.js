export const MAX_SAFE_QUADTREE_LEVEL = 52;

const SOURCE_READY = "ready";
const SOURCE_COMMITTED = "committed";

const addressKey = ({ level, x, y }) => `${level}/${x}/${y}`;
const cellKey = ({ x, y }) => `${x}/${y}`;

const compareAddresses = (left, right) =>
  left.level - right.level || left.x - right.x || left.y - right.y;

const compareEntries = (left, right) =>
  compareAddresses(left.address, right.address);

const assertFunction = (value, name) => {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
};

const assertArray = (value, name) => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`);
  }
};

const readId = (value, context) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${context} id must be a non-empty string`);
  }
  return value;
};

const readAddress = (value, context) => {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${context} address must be an object`);
  }
  const { level, x, y } = value;
  if (!Number.isSafeInteger(level) || level < 0 || level > MAX_SAFE_QUADTREE_LEVEL) {
    throw new RangeError(
      `${context} level must be a safe integer from 0 through ${MAX_SAFE_QUADTREE_LEVEL}`
    );
  }
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new RangeError(`${context} x and y must be safe integers`);
  }
  return Object.freeze({
    level,
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  });
};

const readPoint = (value, context) => {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${context} must return an object`);
  }
  const { x, y } = value;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new RangeError(`${context} must return safe integer x and y values`);
  }
  return Object.freeze({
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  });
};

const projectAddress = (address, level) => {
  const scale = 2 ** (address.level - level);
  return {
    level,
    x: Math.floor(address.x / scale),
    y: Math.floor(address.y / scale),
  };
};

export function compareQuadtreeAddresses(left, right) {
  const a = readAddress(left, "left");
  const b = readAddress(right, "right");
  return compareAddresses(a, b);
}

export function isQuadtreeAncestor(ancestor, descendant) {
  const a = readAddress(ancestor, "ancestor");
  const b = readAddress(descendant, "descendant");
  if (a.level > b.level) return false;
  const projected = projectAddress(b, a.level);
  return projected.x === a.x && projected.y === a.y;
}

const sameAddress = (left, right) =>
  left.level === right.level && left.x === right.x && left.y === right.y;

const strictAncestor = (ancestor, descendant) =>
  ancestor.level < descendant.level && isQuadtreeAncestor(ancestor, descendant);

const toDiagnosticItem = (entry) => ({
  item: entry.item,
  id: entry.id,
  address: entry.address,
});

const makeAddressIndex = (initialEntries = []) => {
  const entries = new Map();
  const byLevel = new Map();

  const add = (entry) => {
    const key = addressKey(entry.address);
    entries.set(key, entry);
    let cells = byLevel.get(entry.address.level);
    if (!cells) {
      cells = new Map();
      byLevel.set(entry.address.level, cells);
    }
    cells.set(cellKey(entry.address), entry);
  };

  const remove = (entry) => {
    entries.delete(addressKey(entry.address));
    const cells = byLevel.get(entry.address.level);
    cells?.delete(cellKey(entry.address));
    if (cells?.size === 0) byLevel.delete(entry.address.level);
  };

  const get = (address) => entries.get(addressKey(address));

  const findAncestor = (address, strict = false) => {
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    for (const level of levels) {
      if (level > address.level || (strict && level === address.level)) break;
      const projected = projectAddress(address, level);
      const match = byLevel.get(level)?.get(cellKey(projected));
      if (match) return match;
    }
    return null;
  };

  const findDescendants = (address) => {
    const matches = [];
    for (const entry of entries.values()) {
      if (strictAncestor(address, entry.address)) matches.push(entry);
    }
    return matches.sort(compareEntries);
  };

  for (const entry of initialEntries) add(entry);

  return {
    add,
    remove,
    get,
    findAncestor,
    findDescendants,
    values: () => [...entries.values()],
  };
};

const prepareEntries = (
  items,
  source,
  getId,
  getAddress,
  originalIndexes = null
) => {
  assertArray(items, source);
  const byId = new Map();
  const byAddress = new Map();
  const all = [];

  for (let position = 0; position < items.length; position += 1) {
    const item = items[position];
    const index = originalIndexes?.[position] ?? position;
    const context = `${source}[${index}]`;
    const id = readId(getId(item, index, source), context);
    const address = readAddress(getAddress(item, index, source), context);
    const priorId = byId.get(id);
    if (priorId && !sameAddress(priorId.address, address)) {
      throw new RangeError(
        `${context} reuses id "${id}" at ${addressKey(address)}; it was already used at ` +
        addressKey(priorId.address)
      );
    }
    const priorAddress = byAddress.get(addressKey(address));
    if (priorAddress && priorAddress.id !== id) {
      throw new RangeError(
        `${context} assigns address ${addressKey(address)} to both "${priorAddress.id}" and "${id}"`
      );
    }
    if (
      (priorId || priorAddress) &&
      !Object.is((priorId ?? priorAddress).item, item)
    ) {
      throw new RangeError(
        `${context} ambiguously duplicates id "${id}" and address ${addressKey(address)} ` +
        "with a different item"
      );
    }
    if (priorId || priorAddress) continue;
    const entry = { item, id, address, index, source };
    byId.set(id, entry);
    byAddress.set(addressKey(address), entry);
    all.push(entry);
  }

  return all;
};

const canonicalizeEntries = (entries, source) => {
  const index = makeAddressIndex();
  const cut = [];
  const suppressed = [];
  for (const entry of [...entries].sort(compareEntries)) {
    const covering = index.findAncestor(entry.address);
    if (covering) {
      suppressed.push({
        source,
        item: entry.item,
        id: entry.id,
        address: entry.address,
        coveredById: covering.id,
        coveredByAddress: covering.address,
      });
      continue;
    }
    index.add(entry);
    cut.push(entry);
  }

  return { cut, suppressed };
};

const validateCrossSourceIds = (committed, ready) => {
  const committedById = new Map(committed.map((entry) => [entry.id, entry]));
  for (const entry of ready) {
    const other = committedById.get(entry.id);
    if (other && !sameAddress(other.address, entry.address)) {
      throw new RangeError(
        `id "${entry.id}" refers to ${addressKey(other.address)} in committed and ` +
        `${addressKey(entry.address)} in ready`
      );
    }
  }
};

const prepareWitnesses = ({
  witnesses,
  levels,
  locateWitness,
  isWitnessSettledWithoutContent,
}) => {
  assertArray(witnesses, "witnesses");
  const issues = [];
  const settled = new Array(witnesses.length).fill(false);
  const locations = witnesses.map(() => new Map());
  let reliable = witnesses.length > 0;

  for (let index = 0; index < witnesses.length; index += 1) {
    try {
      settled[index] = isWitnessSettledWithoutContent
        ? isWitnessSettledWithoutContent(witnesses[index], index) === true
        : false;
    } catch (error) {
      reliable = false;
      issues.push({
        code: "settlement-callback-error",
        witnessIndex: index,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (let index = 0; index < witnesses.length; index += 1) {
    for (const level of levels) {
      let rawPoint;
      try {
        rawPoint = locateWitness(witnesses[index], level, index);
      } catch (error) {
        reliable = false;
        issues.push({
          code: "location-callback-error",
          witnessIndex: index,
          level,
          message: error instanceof Error ? error.message : String(error),
        });
        locations[index].set(level, { valid: false, point: null });
        continue;
      }

      try {
        const point = readPoint(
          rawPoint,
          `locateWitness for witness ${index} at level ${level}`
        );
        locations[index].set(level, { valid: true, point });
      } catch (error) {
        reliable = false;
        issues.push({
          code: "invalid-witness-location",
          witnessIndex: index,
          level,
          message: error instanceof Error ? error.message : String(error),
        });
        locations[index].set(level, { valid: false, point: null });
      }
    }
  }

  if (witnesses.length === 0) {
    issues.push({
      code: "empty-witness-set",
      witnessIndex: null,
      message: "at least one witness is required to prove coverage",
    });
  }

  return { reliable, settled, locations, issues };
};

const locationInside = (witnessState, witnessIndex, address) => {
  const record = witnessState.locations[witnessIndex].get(address.level);
  return Boolean(
    record?.valid &&
    record.point.x === address.x &&
    record.point.y === address.y
  );
};

const witnessCoveredBy = (witnessState, witnessIndex, entries) => {
  if (witnessState.settled[witnessIndex]) return true;
  return entries.some((entry) => locationInside(witnessState, witnessIndex, entry.address));
};

const summarizeCoverage = (witnessState, witnesses, entries) => {
  const coveredWitnessIndexes = [];
  const uncoveredWitnessIndexes = [];
  for (let index = 0; index < witnesses.length; index += 1) {
    const target = witnessCoveredBy(witnessState, index, entries)
      ? coveredWitnessIndexes
      : uncoveredWitnessIndexes;
    target.push(index);
  }
  return {
    reliable: witnessState.reliable,
    complete:
      witnessState.reliable &&
      witnesses.length > 0 &&
      uncoveredWitnessIndexes.length === 0,
    covered: coveredWitnessIndexes.length,
    total: witnesses.length,
    coveredWitnessIndexes,
    uncoveredWitnessIndexes,
    issues: witnessState.issues,
  };
};

export function resolveAtomicQuadtreeCut(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("options must be an object");
  }
  const {
    ready,
    committed = [],
    witnesses = [],
    getId,
    getAddress,
    locateWitness,
    keepCommitted,
    isWitnessSettledWithoutContent,
  } = options;
  assertArray(ready, "ready");
  assertArray(committed ?? [], "committed");
  assertArray(witnesses ?? [], "witnesses");
  assertFunction(getId, "getId");
  assertFunction(getAddress, "getAddress");
  assertFunction(locateWitness, "locateWitness");
  if (keepCommitted !== undefined) assertFunction(keepCommitted, "keepCommitted");
  if (isWitnessSettledWithoutContent !== undefined) {
    assertFunction(isWitnessSettledWithoutContent, "isWitnessSettledWithoutContent");
  }

  const transitions = [];
  const retainedCommittedItems = [];
  const retainedCommittedIndexes = [];
  const committedItems = committed ?? [];
  for (let index = 0; index < committedItems.length; index += 1) {
    const item = committedItems[index];
    if (!keepCommitted || keepCommitted(item, index) === true) {
      retainedCommittedItems.push(item);
      retainedCommittedIndexes.push(index);
      continue;
    }
    const [entry] = prepareEntries(
      [item],
      SOURCE_COMMITTED,
      getId,
      getAddress,
      [index]
    );
    transitions.push({
      type: "drop",
      reason: "not-kept",
      removed: toDiagnosticItem(entry),
    });
  }

  const allCommitted = prepareEntries(
    retainedCommittedItems,
    SOURCE_COMMITTED,
    getId,
    getAddress,
    retainedCommittedIndexes
  );
  const allReady = prepareEntries(ready, SOURCE_READY, getId, getAddress);
  validateCrossSourceIds(allCommitted, allReady);
  const preparedReady = canonicalizeEntries(allReady, SOURCE_READY);

  const preparedCommitted = canonicalizeEntries(
    allCommitted,
    SOURCE_COMMITTED
  );
  const keptCommitted = preparedCommitted.cut;

  const levels = [...new Set([
    ...preparedReady.cut.map((entry) => entry.address.level),
    ...keptCommitted.map((entry) => entry.address.level),
  ])].sort((a, b) => a - b);
  const witnessState = prepareWitnesses({
    witnesses: witnesses ?? [],
    levels,
    locateWitness,
    isWitnessSettledWithoutContent,
  });

  const effective = makeAddressIndex(keptCommitted);
  const pendingRefinements = new Map();

  for (const candidate of preparedReady.cut) {
    const equal = effective.get(candidate.address);
    if (equal) {
      transitions.push({
        type: "retain",
        reason: "same-address",
        kept: toDiagnosticItem(equal),
        ignored: toDiagnosticItem(candidate),
      });
      continue;
    }

    const ancestor = effective.findAncestor(candidate.address, true);
    if (ancestor) {
      const key = addressKey(ancestor.address);
      const pending = pendingRefinements.get(key) ?? {
        parent: ancestor,
        candidates: [],
      };
      pending.candidates.push(candidate);
      pendingRefinements.set(key, pending);
      continue;
    }

    const descendants = effective.findDescendants(candidate.address);
    if (descendants.length > 0) {
      for (const descendant of descendants) effective.remove(descendant);
      effective.add(candidate);
      transitions.push({
        type: "coarsen",
        added: toDiagnosticItem(candidate),
        removed: descendants.map(toDiagnosticItem),
      });
      continue;
    }

    effective.add(candidate);
    transitions.push({
      type: "join",
      added: toDiagnosticItem(candidate),
    });
  }

  const blockedBranches = [];
  for (const pending of [...pendingRefinements.values()].sort(
    (left, right) => compareEntries(left.parent, right.parent)
  )) {
    const { parent } = pending;
    const candidates = pending.candidates.sort(compareEntries);
    if (!witnessState.reliable) {
      blockedBranches.push({
        parent: toDiagnosticItem(parent),
        readyDescendants: candidates.map(toDiagnosticItem),
        witnessIndexes: [],
        uncoveredWitnessIndexes: [],
        reason: "unreliable-witnesses",
      });
      continue;
    }

    const witnessIndexes = [];
    for (let index = 0; index < (witnesses ?? []).length; index += 1) {
      if (locationInside(witnessState, index, parent.address)) witnessIndexes.push(index);
    }
    if (witnessIndexes.length === 0) {
      blockedBranches.push({
        parent: toDiagnosticItem(parent),
        readyDescendants: candidates.map(toDiagnosticItem),
        witnessIndexes,
        uncoveredWitnessIndexes: [],
        reason: "no-witnesses-in-branch",
      });
      continue;
    }

    const uncoveredWitnessIndexes = witnessIndexes.filter(
      (index) => !witnessCoveredBy(witnessState, index, candidates)
    );
    if (uncoveredWitnessIndexes.length > 0) {
      blockedBranches.push({
        parent: toDiagnosticItem(parent),
        readyDescendants: candidates.map(toDiagnosticItem),
        witnessIndexes,
        uncoveredWitnessIndexes,
        reason: "uncovered-witnesses",
      });
      continue;
    }

    effective.remove(parent);
    for (const candidate of candidates) effective.add(candidate);
    transitions.push({
      type: "refine",
      removed: toDiagnosticItem(parent),
      added: candidates.map(toDiagnosticItem),
      witnessIndexes,
    });
  }

  const cutEntries = effective.values().sort(compareEntries);
  const cut = cutEntries.map((entry) => entry.item);
  const ids = new Set(cutEntries.map((entry) => entry.id));
  return {
    cut,
    ids,
    coverage: summarizeCoverage(witnessState, witnesses ?? [], cutEntries),
    blockedBranches,
    transitions,
    diagnostics: {
      suppressedReady: preparedReady.suppressed,
      suppressedCommitted: preparedCommitted.suppressed,
    },
  };
}

const assertAntichain = (entries, context) => {
  const sorted = [...entries].sort(compareEntries);
  for (let index = 0; index < sorted.length; index += 1) {
    for (let other = index + 1; other < sorted.length; other += 1) {
      if (
        isQuadtreeAncestor(sorted[index].address, sorted[other].address) ||
        isQuadtreeAncestor(sorted[other].address, sorted[index].address)
      ) {
        throw new RangeError(
          `${context} contains overlapping addresses ${addressKey(sorted[index].address)} and ` +
          addressKey(sorted[other].address)
        );
      }
    }
  }
};

const defaultBranchComplete = (parent, children) => {
  if (children.length !== 4) return false;
  const childLevel = parent.address.level + 1;
  const expected = new Set([
    `${parent.address.x * 2}/${parent.address.y * 2}`,
    `${parent.address.x * 2 + 1}/${parent.address.y * 2}`,
    `${parent.address.x * 2}/${parent.address.y * 2 + 1}`,
    `${parent.address.x * 2 + 1}/${parent.address.y * 2 + 1}`,
  ]);
  return children.every(
    (child) =>
      child.address.level === childLevel &&
      expected.delete(cellKey(child.address))
  ) && expected.size === 0;
};

export function resolveReadyTreeCut(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("options must be an object");
  }
  const {
    roots,
    getId,
    getAddress,
    getChildren,
    isReady,
    isBranchComplete,
  } = options;
  assertArray(roots, "roots");
  assertFunction(getId, "getId");
  assertFunction(getAddress, "getAddress");
  assertFunction(getChildren, "getChildren");
  assertFunction(isReady, "isReady");
  if (isBranchComplete !== undefined) {
    assertFunction(isBranchComplete, "isBranchComplete");
  }

  const seenNodes = new Set();
  const byId = new Map();
  const byAddress = new Map();
  let order = 0;

  const build = (item, parent = null) => {
    if (seenNodes.has(item)) {
      throw new RangeError("tree nodes must not be reused or form cycles");
    }
    seenNodes.add(item);
    const index = order++;
    const id = readId(getId(item, index), `tree node ${index}`);
    const address = readAddress(getAddress(item, index), `tree node ${index}`);
    if (byId.has(id)) throw new RangeError(`tree contains duplicate id "${id}"`);
    const key = addressKey(address);
    if (byAddress.has(key)) throw new RangeError(`tree contains duplicate address ${key}`);
    if (parent && !strictAncestor(parent.address, address)) {
      throw new RangeError(
        `tree node ${key} must be a strict descendant of ${addressKey(parent.address)}`
      );
    }

    const children = getChildren(item, index);
    assertArray(children, `children of "${id}"`);
    const entry = {
      item,
      id,
      address,
      index,
      ready: isReady(item, index) === true,
      children: [],
      branchComplete: false,
    };
    byId.set(id, entry);
    byAddress.set(key, entry);
    entry.children = children.map((child) => build(child, entry)).sort(compareEntries);
    assertAntichain(entry.children, `children of "${id}"`);
    entry.branchComplete = entry.children.length > 0 && (
      isBranchComplete
        ? isBranchComplete(
          entry.item,
          entry.children.map((child) => child.item),
          entry.index
        ) === true
        : defaultBranchComplete(entry, entry.children)
    );
    return entry;
  };

  const rootEntries = roots.map((root) => build(root)).sort(compareEntries);
  assertAntichain(rootEntries, "roots");

  const select = (entry) => {
    if (entry.children.length === 0) {
      if (entry.ready) {
        return {
          cut: [entry],
          covered: true,
          unresolved: [],
          blockedBranches: [],
          transitions: [],
        };
      }
      return {
        cut: [],
        covered: false,
        unresolved: [toDiagnosticItem(entry)],
        blockedBranches: [],
        transitions: [],
      };
    }

    const childResults = entry.children.map(select);
    const childrenCovered = childResults.every((result) => result.covered);
    const descendantCut = childResults.flatMap((result) => result.cut);
    const childDiagnostics = {
      unresolved: childResults.flatMap((result) => result.unresolved),
      blockedBranches: childResults.flatMap((result) => result.blockedBranches),
      transitions: childResults.flatMap((result) => result.transitions),
    };
    if (entry.branchComplete && childrenCovered) {
      return {
        cut: descendantCut,
        covered: true,
        unresolved: childDiagnostics.unresolved,
        blockedBranches: childDiagnostics.blockedBranches,
        transitions: [
          ...childDiagnostics.transitions,
          {
            type: "refine",
            parent: toDiagnosticItem(entry),
            selected: descendantCut.map(toDiagnosticItem),
          },
        ],
      };
    }

    const reason = entry.branchComplete
      ? "children-not-ready"
      : "incomplete-partition";
    const blockedBranch = {
      parent: toDiagnosticItem(entry),
      selectedDescendants: descendantCut.map(toDiagnosticItem),
      reason,
    };
    if (entry.ready) {
      return {
        cut: [entry],
        covered: true,
        unresolved: [],
        blockedBranches: [blockedBranch],
        transitions: [{
          type: "retain",
          parent: toDiagnosticItem(entry),
          reason,
        }],
      };
    }

    return {
      cut: descendantCut,
      covered: false,
      unresolved: [
        ...childDiagnostics.unresolved,
        toDiagnosticItem(entry),
      ],
      blockedBranches: [
        ...childDiagnostics.blockedBranches,
        blockedBranch,
      ],
      transitions: [
        ...childDiagnostics.transitions,
        {
          type: "partial",
          parent: toDiagnosticItem(entry),
          selected: descendantCut.map(toDiagnosticItem),
          reason,
        },
      ],
    };
  };

  const results = rootEntries.map(select);
  const cutEntries = results.flatMap((result) => result.cut).sort(compareEntries);
  return {
    cut: cutEntries.map((entry) => entry.item),
    ids: new Set(cutEntries.map((entry) => entry.id)),
    complete: results.every((result) => result.covered),
    unresolved: results.flatMap((result) => result.unresolved),
    blockedBranches: results.flatMap((result) => result.blockedBranches),
    transitions: results.flatMap((result) => result.transitions),
  };
}
