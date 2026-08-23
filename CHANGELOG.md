# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Avoid scanning the retained cut for descendants when a ready candidate is
  already known to refine a retained ancestor.
- Report scaling distributions and per-branch cost from the reproducible
  reconciliation benchmark.

## 0.1.0

- Add witness-gated reconciliation of committed and ready quadtree cuts.
- Add deterministic validation and structured transition diagnostics.
- Add a ready-tree resolver for complete quadtree child groups.
- Add signed-coordinate support, type declarations, examples, and checks.
- Reject ambiguous duplicate payloads and scope ready-tree diagnostics to the
  selected cut path.
- Apply committed filtering before retained-state identity validation.
- Support and continuously test Node.js 20.19 and 22.
