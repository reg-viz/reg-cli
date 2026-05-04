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
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DIST = join(REPO, 'dist', 'index.mjs');
const SAMPLE_REL = 'sample';
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
  // On Windows the absolute path string `D:\…\index.mjs` is parsed as a
  // URL with scheme `d:` and rejected by the ESM loader. Convert to a
  // proper file:// URL so the loader accepts it on every OS.
  lib = await import(pathToFileURL(DIST).href);
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

test('compare() emits compare events LIVE, before complete', async () => {
  // Live per-file events ("pass"/"fail"/"new"/"delete") are wired via the
  // `__REG_CLI_EVT__` stderr channel (see `js/progress.ts`). This catches
  // regressions if the channel breaks or if we accidentally go back to
  // the pre-phase-G batched post-complete emission.
  const d = await scratch();
  const emitter = lib.compare({
    actualDir: `${SAMPLE_REL}/actual`,
    expectedDir: `${SAMPLE_REL}/expected`,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
  });
  const received = [];
  let completeSeen = false;
  emitter.on('compare', (e) => {
    received.push({ ...e, afterComplete: completeSeen });
  });
  emitter.on('complete', () => {
    completeSeen = true;
  });
  await waitForComplete(emitter);

  // Every compare event should have fired BEFORE complete.
  assert.ok(
    received.every((e) => e.afterComplete === false),
    `expected all compare events before complete; got ${JSON.stringify(received)}`,
  );
  // And we should have one event per classified image in the fixture.
  const kinds = received.map((e) => e.type).sort();
  assert.deepEqual(kinds, ['fail', 'pass']);
});

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

test('compare({ update: true }) prunes deleted baselines (classic -U semantics)', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  // One file in both that match (passed). Plus a stale-only-in-expected
  // baseline that -U should remove.
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample1.png'),
    join(REPO, actualRel, 'sample1.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample1.png'),
    join(REPO, expectedRel, 'sample1.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, expectedRel, 'stale.png'),
  );

  const emitter = lib.compare({
    actualDir: actualRel,
    expectedDir: expectedRel,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
    update: true,
  });
  await waitForComplete(emitter);

  // stale.png pruned.
  await assert.rejects(() =>
    stat(join(REPO, expectedRel, 'stale.png')),
  );
  // sample1.png still present.
  await stat(join(REPO, expectedRel, 'sample1.png'));
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

// ---------------------------------------------------------------------------
// Phase-I: reg-suit drop-in compatibility
// ---------------------------------------------------------------------------
//
// reg-suit's `packages/reg-suit-core/src/processor.ts` invokes `compare(…)`
// with a specific option bag every time. Historically we didn't strip
// `ignoreChange` or `enableCliAdditionalDetection` from the library surface
// before forwarding args to the Wasm binary, so Rust clap would abort with
// "unexpected argument" the moment reg-suit tried to invoke us. This test
// mirrors reg-suit's exact call shape so that regression is caught at the
// library level.
//
// If this test fails, check whether someone removed a key from
// `CLI_ONLY_KEYS` in `js/index.ts` — those are the keys reg-suit passes
// unconditionally but our Rust CLI doesn't understand.
test('reg-suit compat: compare() accepts reg-suit-shaped options without aborting', async () => {
  const d = await scratch();
  const emitter = lib.compare({
    actualDir: `${SAMPLE_REL}/actual`,
    expectedDir: `${SAMPLE_REL}/expected`,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
    report: `${d.rel}/report.html`,
    // Verbatim from `reg-suit-core/processor.ts:105-116`:
    update: false,
    ignoreChange: true,
    urlPrefix: '',
    threshold: undefined,
    thresholdPixel: undefined,
    thresholdRate: undefined,
    matchingThreshold: 0,
    enableAntialias: undefined,
    enableCliAdditionalDetection: true, // ximgdiff.invocationType === 'cli'
    enableClientAdditionalDetection: true, // ximgdiff.invocationType !== 'none'
    concurrency: 4,
  });
  // The original bug: this would never fire — `error` would fire first with
  // a clap "unexpected argument" abort. Now we strip those keys in
  // `CLI_ONLY_KEYS` and `compare()` completes cleanly.
  const { data } = await waitForComplete(emitter);
  assert.deepEqual(data.failedItems, ['sample0.png']);
  assert.deepEqual(data.passedItems, ['sample1.png']);
});

// ---------------------------------------------------------------------------
// reg-suit drop-in: full processor.ts surface
// (https://github.com/reg-viz/reg-suit/blob/5c09c8e/packages/reg-suit-core/src/processor.ts#L18)
//
// Pin every key reg-suit's `processor.ts` actually passes, every event it
// subscribes to, and every CompareOutput field it accesses. If wasm
// reg-cli ever stops being a drop-in, this test fires first.
// ---------------------------------------------------------------------------

test('reg-suit drop-in: every event + CompareOutput field consumed by processor.ts is honoured', async () => {
  const d = await scratch();
  const emitter = lib.compare({
    actualDir: `${SAMPLE_REL}/actual`,
    expectedDir: `${SAMPLE_REL}/expected`,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
    report: `${d.rel}/report.html`,
    update: false,
    ignoreChange: true,
    urlPrefix: '',
    threshold: 0,
    thresholdPixel: 0,
    thresholdRate: 0,
    matchingThreshold: 0,
    enableAntialias: false,
    enableCliAdditionalDetection: true,
    enableClientAdditionalDetection: false,
    concurrency: 4,
  });

  let errorFired = false;
  emitter.on('error', () => (errorFired = true));

  const { data, startEmitted, compareEvents } = await waitForComplete(emitter);

  // Events processor.ts listens for: 'start', 'compare', 'complete', 'error'.
  assert.equal(startEmitted, true, "'start' event must fire (processor logs spinner from it)");
  assert.equal(errorFired, false, "'error' must NOT fire when inputs are clean");
  assert.ok(compareEvents.length > 0, "'compare' events must fire per file");
  for (const ev of compareEvents) {
    assert.equal(typeof ev.type, 'string', "compare event missing string `type`");
    assert.equal(typeof ev.path, 'string', "compare event missing string `path`");
  }

  // CompareOutput keys processor.ts reads (see processor.ts lines ~132-137).
  for (const k of ['failedItems', 'newItems', 'deletedItems', 'passedItems']) {
    assert.ok(Array.isArray(data[k]), `data.${k} must be an array, got ${typeof data[k]}`);
  }
});

// ---------------------------------------------------------------------------
// Per-image failure tolerance at the library level (mirror of
// crates/reg_core/src/lib.rs::per_image_failure_tests::corrupt_png_…).
//
// reg-suit calls compare() and expects `complete` to fire with a normal
// CompareOutput even when individual files are unreadable — it surfaces
// those via `failedItems`. If we regress to firing `error` on the first
// bad PNG, the whole pipeline aborts.
// ---------------------------------------------------------------------------

test('compare() does NOT fire `error` when a single image fails to decode', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });

  const { writeFile } = await import('node:fs/promises');
  // One valid pair so the run produces normal events too.
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, actualRel, 'good.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, expectedRel, 'good.png'),
  );
  // …and a corrupt pair the decoder will reject (different bytes so the
  // diff lib doesn't byte-eq fast-path).
  await writeFile(join(REPO, actualRel, 'bad.png'), 'not a png AAA');
  await writeFile(join(REPO, expectedRel, 'bad.png'), 'not a png BBB');

  const emitter = lib.compare({
    actualDir: actualRel,
    expectedDir: expectedRel,
    diffDir: `${d.rel}/diff`,
    json: `${d.rel}/reg.json`,
  });

  const { data, compareEvents } = await waitForComplete(emitter);
  assert.ok(
    data.failedItems.includes('bad.png'),
    `bad.png must be in failedItems, got ${JSON.stringify(data.failedItems)}`,
  );
  assert.ok(
    data.passedItems.includes('good.png'),
    `good.png must still pass; got ${JSON.stringify(data.passedItems)}`,
  );
  // We also got a 'fail' compare-event for bad.png so live spinners update.
  assert.ok(
    compareEvents.some((e) => e.path === 'bad.png' && e.type === 'fail'),
    `expected a fail compare-event for bad.png; got ${JSON.stringify(compareEvents)}`,
  );
});

// reg-suit's `processor.ts` does `require.resolve('reg-cli')` to locate this
// package, and its CLI is invoked as `reg-cli`. Lock the published name and
// bin so a future rename can't silently break the drop-in story.
test('package.json publishes as `reg-cli` with a `reg-cli` bin', async () => {
  const pkg = JSON.parse(await readFile(join(REPO, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'reg-cli', 'npm name must be `reg-cli`');
  assert.ok(pkg.bin && pkg.bin['reg-cli'], 'must expose a `reg-cli` bin');
});
