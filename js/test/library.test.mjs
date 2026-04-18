// Library-level tests for the `compare()` API exported from the Wasm
// reg-cli package.
//
// Classic reg-cli exposes an `EventEmitter` with `start` / `compare` /
// `complete` / `update` / `error` events. The Wasm wrapper must honour the
// same surface so downstream consumers (reg-suit et al.) don't regress.
//
// Run with: `node --test js/test/library.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, cp, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const DIST = join(REPO, 'js', 'dist', 'index.mjs');
const SAMPLE_REL = 'js/sample';
// Per-test scratch dirs are created directly at the repo root as
// `.libtest-<tag>/…`. This matters because `computeWasiSandbox` collapses
// every positional dir + report/json parent into a single common ancestor
// preopen — and in tests where everything lives inside one scratch dir
// (update-mode, new/deleted scenarios) the common ancestor BECOMES that
// scratch dir itself. `wasm32-wasip1-threads` libstd only honours the first
// path segment of a preopen name (pre-existing prestat-enumeration bug), so
// a multi-segment ancestor like `js/test/__workspace__/tXXX` silently drops
// file lookups. Keeping the scratch dir one-segment-deep at the repo root
// avoids that trap.

// The library must be loaded with CWD at the repo root so its internal
// `join(dir(), './entry.mjs')` resolves the built worker next to it, and so
// that the relative paths we pass as `actualDir` / `expectedDir` resolve
// identically on both sides of the JS/Wasm boundary.
const origCwd = process.cwd();

let lib;
let runId = 0;
const scratchDirs = new Set();
const scratch = async () => {
  const rel = `.libtest-${process.pid}-${++runId}-${Math.random().toString(36).slice(2, 8)}`;
  const abs = join(REPO, rel);
  await mkdir(abs, { recursive: true });
  scratchDirs.add(abs);
  return { abs, rel };
};

test.before(async () => {
  await stat(DIST).catch(() => {
    throw new Error(`Build artefacts missing at ${DIST}. Run 'pnpm --filter ./js build' first.`);
  });
  process.chdir(REPO);
  lib = await import(DIST);
});

test.after(async () => {
  for (const d of scratchDirs) await rm(d, { recursive: true, force: true });
  process.chdir(origCwd);
});

const waitForComplete = (emitter) =>
  new Promise((resolve, reject) => {
    let startEmitted = false;
    const compareEvents = [];
    emitter.on('start', () => (startEmitted = true));
    emitter.on('compare', (p) => compareEvents.push(p));
    emitter.on('error', reject);
    emitter.on('complete', (data) =>
      resolve({ data, startEmitted, compareEvents }),
    );
  });

// ---------------------------------------------------------------------------
// EventEmitter surface
// ---------------------------------------------------------------------------

test('compare() fires start → compare(x N) → complete in order', async () => {
  const d = await scratch();
  const emitter = lib.compare({
    actualDir: `${SAMPLE_REL}/actual`,
    expectedDir: `${SAMPLE_REL}/expected`,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
  });
  const { data, startEmitted, compareEvents } = await waitForComplete(emitter);

  assert.equal(startEmitted, true, "expected 'start' event before 'complete'");

  // We expect one 'compare' event per classified file (pass / fail / new /
  // delete). With the sample fixture: one pass, one fail.
  const kinds = compareEvents.map((e) => e.type).sort();
  assert.deepEqual(kinds, ['fail', 'pass']);
  assert.ok(compareEvents.every((e) => typeof e.path === 'string'));

  // Complete payload uses the classic CompareOutput shape.
  for (const k of [
    'failedItems',
    'passedItems',
    'newItems',
    'deletedItems',
    'actualItems',
    'expectedItems',
    'diffItems',
    'actualDir',
    'expectedDir',
    'diffDir',
  ]) {
    assert.ok(k in data, `CompareOutput.${k} missing`);
  }
  assert.deepEqual(data.failedItems, ['sample0.png']);
  assert.deepEqual(data.passedItems, ['sample1.png']);
});

// ---------------------------------------------------------------------------
// junit + json written by Rust via `compare()`
// ---------------------------------------------------------------------------

test('compare({ junitReport }) writes junit XML matching classic', async () => {
  const d = await scratch();
  const junitRel = `${d.rel}/junit.xml`;
  const emitter = lib.compare({
    actualDir: `${SAMPLE_REL}/actual`,
    expectedDir: `${SAMPLE_REL}/expected`,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
    junitReport: junitRel,
  });
  await waitForComplete(emitter);
  const xml = await readFile(join(REPO, junitRel), 'utf8');
  // Exact byte compat — same bytes classic reg-cli would produce.
  assert.equal(
    xml,
    `<?xml version="1.0"?>
<testsuites name="reg-cli tests" tests="2" failures="1">
  <testsuite name="reg-cli" tests="2" failures="1">
    <testcase name="sample0.png">
      <failure message="failed"/>
    </testcase>
    <testcase name="sample1.png"/>
  </testsuite>
</testsuites>`,
  );
});

test('compare() writes reg.json with classic-shaped keys', async () => {
  const d = await scratch();
  const jsonRel = `${d.rel}/reg.json`;
  const emitter = lib.compare({
    actualDir: `${SAMPLE_REL}/actual`,
    expectedDir: `${SAMPLE_REL}/expected`,
    diffDir: `${d.rel}/diff`,
    json: jsonRel,
  });
  await waitForComplete(emitter);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  for (const k of [
    'actualItems',
    'expectedItems',
    'diffItems',
    'failedItems',
    'newItems',
    'deletedItems',
    'passedItems',
    'actualDir',
    'expectedDir',
    'diffDir',
  ]) {
    assert.ok(k in report, `reg.json missing key ${k}`);
  }
});

// ---------------------------------------------------------------------------
// update: true copies actual → expected (JS-side fs)
// ---------------------------------------------------------------------------

test('compare({ update: true }) copies actualDir → expectedDir and fires "update"', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  // Seed one differing pair: copy both sample0 variants so actual ≠ expected.
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, actualRel, 'sample0.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'expected/sample0.png'),
    join(REPO, expectedRel, 'sample0.png'),
  );

  const emitter = lib.compare({
    actualDir: actualRel,
    expectedDir: expectedRel,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
    update: true,
  });

  const updateEmitted = new Promise((resolve) =>
    emitter.once('update', () => resolve(true)),
  );
  await waitForComplete(emitter);
  assert.equal(await updateEmitted, true);

  // expected/sample0.png should now be byte-identical to actual/sample0.png.
  const a = await readFile(join(REPO, actualRel, 'sample0.png'));
  const e = await readFile(join(REPO, expectedRel, 'sample0.png'));
  assert.equal(Buffer.compare(a, e), 0);
});

// ---------------------------------------------------------------------------
// additionalDetection: 'client' flips ximgdiffConfig in HTML
// ---------------------------------------------------------------------------

test("compare({ additionalDetection: 'client' }) enables ximgdiffConfig", async () => {
  const d = await scratch();
  const reportRel = `${d.rel}/report.html`;
  const emitter = lib.compare({
    actualDir: `${SAMPLE_REL}/actual`,
    expectedDir: `${SAMPLE_REL}/expected`,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
    report: reportRel,
    additionalDetection: 'client',
  });
  await waitForComplete(emitter);
  const html = await readFile(join(REPO, reportRel), 'utf8');
  assert.match(html, /ximgdiffConfig[^}]*enabled["\\]+:true/);
});

// ---------------------------------------------------------------------------
// Legacy `enableClientAdditionalDetection: true` alias is translated
// ---------------------------------------------------------------------------

test('enableClientAdditionalDetection: true is translated to additionalDetection=client', async () => {
  const d = await scratch();
  const reportRel = `${d.rel}/report.html`;
  const emitter = lib.compare({
    actualDir: `${SAMPLE_REL}/actual`,
    expectedDir: `${SAMPLE_REL}/expected`,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
    report: reportRel,
    enableClientAdditionalDetection: true,
  });
  await waitForComplete(emitter);
  const html = await readFile(join(REPO, reportRel), 'utf8');
  assert.match(html, /ximgdiffConfig[^}]*enabled["\\]+:true/);
});
