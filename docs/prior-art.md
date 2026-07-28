# Related concepts and licensing

This package contains no vendored third-party code and has no runtime
dependencies. Its implementation and tests were written for this package.

The underlying problem is shared by several public specifications and
rendering libraries:

- [OGC 3D Tiles 1.1](https://docs.ogc.org/cs/22-025r4/22-025r4.pdf)
  defines replacement and additive hierarchical refinement. The standard is a
  conceptual reference; no specification text or schema is included here.
- [CesiumJS](https://github.com/CesiumGS/cesium) implements 3D Tiles traversal
  under Apache-2.0.
- [deck.gl TileLayer](https://deck.gl/docs/api-reference/geo-layers/tile-layer)
  documents cached ancestor and descendant refinement strategies. deck.gl is
  MIT licensed.
- [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) handles
  multi-level tile fallback under a BSD-3-Clause-based license file containing
  additional notices.
- [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) provides
  another Apache-2.0 implementation of hierarchical tile traversal.

Those projects combine traversal, loading, caching, visibility, or renderer
state. `atomic-quadtree-cut` instead exposes a small immutable reconciliation
operation driven by caller-owned witnesses. Their source code is not needed to
build or use this package.

When proposing changes, do not transplant code or comments from these projects.
A contribution that incorporates third-party material must preserve every
applicable copyright, license, modification, and NOTICE requirement.
