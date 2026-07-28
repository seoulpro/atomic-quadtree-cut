import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const temporary = mkdtempSync(join(tmpdir(), "atomic-quadtree-cut-"));

try {
  const packed = JSON.parse(execFileSync(
    "npm",
    ["pack", ".", "--json", "--pack-destination", temporary],
    {encoding: "utf8"}
  ));
  assert.equal(packed.length, 1);
  const record = packed[0];
  const paths = record.files.map(({path}) => path).sort();
  assert.ok(paths.includes("src/index.js"));
  assert.ok(paths.includes("src/index.d.ts"));
  assert.ok(paths.includes("docs/design.md"));
  assert.ok(paths.includes("docs/prior-art.md"));
  assert.ok(paths.includes("docs/service-adapter.md"));
  assert.ok(paths.includes("LICENSE"));
  assert.equal(paths.some((path) => path.startsWith("test/")), false);
  assert.equal(paths.some((path) => path.startsWith(".github/")), false);

  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  assert.deepEqual(manifest.dependencies, undefined);
  assert.equal(manifest.license, "ISC");
  assert.equal(manifest.engines.node, ">=20.19.0");

  const archive = join(temporary, record.filename);
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive],
    {cwd: temporary, stdio: "pipe"}
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'import {resolveAtomicQuadtreeCut} from "atomic-quadtree-cut";',
        "const result = resolveAtomicQuadtreeCut({",
        "  ready: [{id: 'one', level: 0, x: 0, y: 0}],",
        "  witnesses: [{x: 0, y: 0}],",
        "  getId: (item) => item.id,",
        "  getAddress: (item) => item,",
        "  locateWitness: (point) => point,",
        "});",
        "if (!result.coverage.complete) process.exit(1);",
      ].join("\n"),
    ],
    {cwd: temporary, stdio: "pipe"}
  );
} finally {
  rmSync(temporary, {recursive: true, force: true});
}
