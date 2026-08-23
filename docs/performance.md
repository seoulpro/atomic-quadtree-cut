# Performance

The benchmark models the package's primary reconciliation path: independent
committed branches are refined into four ready children after one coverage
witness is supplied for each child.

Run the default scaling matrix:

```sh
npm run benchmark
```

Run the bounded verification fixture used by `npm run check`:

```sh
npm run benchmark:smoke
```

The JSON result records the Node.js version, platform, warm-up count, sample
count, median, p95, range, and median microseconds per committed branch. Treat
the figures as comparative evidence for the recorded environment, not as a
cross-device latency guarantee. The benchmark excludes loading, network,
projection, renderer, and caller callback costs.

The resolver checks for a retained ancestor before searching for retained
descendants. Because a valid cut is an antichain, both relationships cannot be
present for one candidate. This preserves reconciliation semantics while
avoiding a full retained-cut scan on the common refinement path.
