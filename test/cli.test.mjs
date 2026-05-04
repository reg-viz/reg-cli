// End-to-end tests for the Wasm reg-cli wrapper.
//
// These spawn the built CLI the same way a user or CI pipeline would, then
// inspect the on-disk artefacts (reg.json / junit.xml / report.html). The
// goal is twofold:
//
//   1. Catch regressions in the JS→Wasm plumbing (flag forwarding, WASI
//      sandbox preopens, EventEmitter surface, exit codes).
//   2. Pin **byte-for-byte compatibility** with classic reg-cli's JUnit XML
//      and reg.json schemas so that downstream tooling (reg-suit,
//      reg-notify-*, CI JUnit parsers) keeps working when users migrate.
//
// Paths throughout are relative to the repo root (which is used as `cwd`
// when spawning the CLI). Real users invoke reg-cli this way in CI too, and
// it avoids a known limitation where absolute paths don't round-trip
// cleanly through `glob` inside the WASI sandbox.
//
// Run with: `node --test js/test/cli.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, cp, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CLI = join(REPO, 'dist', 'cli.mjs');
const SAMPLE_REL = 'sample'; // repo-relative
// Unique scratch dir per test, rooted under the repo so the WASI preopen
// computed from positional dirs comfortably covers it.
const TMP_ROOT_ABS = join(REPO, 'test', '__workspace__');
const TMP_ROOT_REL = relative(REPO, TMP_ROOT_ABS); // 'test/__workspace__'

let runId = 0;
// Returns { abs, rel } for a fresh scratch dir.
const scratch = async () => {
  const tag = `t${process.pid}-${++runId}-${Math.random().toString(36).slice(2, 8)}`;
  const abs = join(TMP_ROOT_ABS, tag);
  await mkdir(abs, { recursive: true });
  return { abs, rel: join(TMP_ROOT_REL, tag) };
};

const runCli = (args, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [CLI, ...args], {
      cwd: opts.cwd ?? REPO,
      env: { ...process.env, ...opts.env },
    });
    const out = [];
    const err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      }),
    );
  });

test.before(async () => {
  await mkdir(TMP_ROOT_ABS, { recursive: true });
  // Guard: dist must exist. We never rebuild from here — that belongs to CI.
  await stat(CLI).catch(() => {
    throw new Error(
      `Built CLI not found at ${CLI}. Run 'pnpm --filter ./js build' first.`,
    );
  });
});

test.after(async () => {
  await rm(TMP_ROOT_ABS, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Basic exit-code semantics
// ---------------------------------------------------------------------------

test('exit 1 when images differ and no -I', async () => {
  const d = await scratch();
  const { code } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
  ]);
  assert.equal(code, 1);
});

test('exit 0 when -I is set despite differences', async () => {
  const d = await scratch();
  const { code } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-I',
  ]);
  assert.equal(code, 0);
});

test('exit 1 when -E and only a new image exists', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, actualRel, 'sample0.png'),
  );
  // No file in expected → sample0 appears as "new".
  const { code } = await runCli([actualRel, expectedRel, `${d.rel}/diff`, '-E']);
  assert.equal(code, 1);
});

test('missing positional dirs prints error and exits non-zero', async () => {
  const { code, stderr } = await runCli(['only-one-dir']);
  assert.notEqual(code, 0);
  assert.match(stderr, /actual.*expected.*diff/i);
});

// ---------------------------------------------------------------------------
// reg.json schema compat
// ---------------------------------------------------------------------------

test('reg.json schema matches classic shape (failed case)', async () => {
  const d = await scratch();
  const jsonRel = `${d.rel}/reg.json`;
  await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
    '-I',
  ]);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  // Keys classic reg-cli guarantees (see src/report.js).
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
    assert.ok(k in report, `missing key ${k} in reg.json`);
  }
  assert.deepEqual(report.failedItems, ['sample0.png']);
  assert.deepEqual(report.passedItems, ['sample1.png']);
  assert.deepEqual(report.newItems, []);
  assert.deepEqual(report.deletedItems, []);
});

// ---------------------------------------------------------------------------
// JUnit XML byte-for-byte compat with classic reg-cli
// ---------------------------------------------------------------------------

test('junit XML matches classic format (single failure)', async () => {
  const d = await scratch();
  const junitRel = `${d.rel}/junit.xml`;
  await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '--junit',
    junitRel,
    '-I',
  ]);
  const xml = await readFile(join(REPO, junitRel), 'utf8');
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

test('junit XML: new/deleted without -E are passed testcases', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample1.png'),
    join(REPO, actualRel, 'added.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'expected/sample1.png'),
    join(REPO, expectedRel, 'gone.png'),
  );
  const junitRel = `${d.rel}/junit.xml`;
  await runCli([actualRel, expectedRel, `${d.rel}/diff`, '--junit', junitRel]);
  const xml = await readFile(join(REPO, junitRel), 'utf8');
  assert.equal(
    xml,
    `<?xml version="1.0"?>
<testsuites name="reg-cli tests" tests="2" failures="0">
  <testsuite name="reg-cli" tests="2" failures="0">
    <testcase name="added.png"/>
    <testcase name="gone.png"/>
  </testsuite>
</testsuites>`,
  );
});

test('junit XML: new/deleted with -E become <failure> entries', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample1.png'),
    join(REPO, actualRel, 'added.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'expected/sample1.png'),
    join(REPO, expectedRel, 'gone.png'),
  );
  const junitRel = `${d.rel}/junit.xml`;
  await runCli([
    actualRel,
    expectedRel,
    `${d.rel}/diff`,
    '-E',
    '-I',
    '--junit',
    junitRel,
  ]);
  const xml = await readFile(join(REPO, junitRel), 'utf8');
  assert.equal(
    xml,
    `<?xml version="1.0"?>
<testsuites name="reg-cli tests" tests="2" failures="2">
  <testsuite name="reg-cli" tests="2" failures="2">
    <testcase name="added.png">
      <failure message="newItem"/>
    </testcase>
    <testcase name="gone.png">
      <failure message="deletedItem"/>
    </testcase>
  </testsuite>
</testsuites>`,
  );
});

// ---------------------------------------------------------------------------
// Report / -X client / -F from
// ---------------------------------------------------------------------------

test('-R writes an HTML report file', async () => {
  const d = await scratch();
  const reportRel = `${d.rel}/report.html`;
  await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-R',
    reportRel,
    '-I',
  ]);
  const html = await readFile(join(REPO, reportRel), 'utf8');
  assert.ok(html.length > 1000);
  // ximgdiffConfig.enabled defaults to false.
  assert.match(html, /ximgdiffConfig[^}]*enabled["\\]+:false/);
});

test('-X client flips ximgdiffConfig.enabled in the HTML report', async () => {
  const d = await scratch();
  const reportRel = `${d.rel}/report.html`;
  await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-R',
    reportRel,
    '-X',
    'client',
    '-I',
  ]);
  const html = await readFile(join(REPO, reportRel), 'utf8');
  assert.match(html, /ximgdiffConfig[^}]*enabled["\\]+:true/);
});

test('-F regenerates HTML + junit from an existing reg.json without diffing', async () => {
  const d = await scratch();
  const jsonRel = `${d.rel}/reg.json`;

  // Step 1: run a normal comparison to get a reg.json.
  await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
    '-I',
  ]);
  const jsonBefore = await readFile(join(REPO, jsonRel), 'utf8');

  // Step 2: wipe diff dir, run -F mode. It must NOT re-create any diff image.
  await rm(join(REPO, d.rel, 'diff'), { recursive: true, force: true });
  const reportRel = `${d.rel}/from.html`;
  const junitRel = `${d.rel}/from.xml`;
  const { code } = await runCli([
    '-F',
    jsonRel,
    '-R',
    reportRel,
    '--junit',
    junitRel,
    '-I',
  ]);

  assert.equal(code, 0);
  assert.ok((await stat(join(REPO, reportRel))).size > 1000);
  assert.ok((await stat(join(REPO, junitRel))).size > 0);
  // -F shouldn't mutate the source reg.json…
  assert.equal(await readFile(join(REPO, jsonRel), 'utf8'), jsonBefore);
  // …and shouldn't have re-created diff/.
  await assert.rejects(() => stat(join(REPO, d.rel, 'diff')));
});

// ---------------------------------------------------------------------------
// CLI stdout formatting (per-file + summary lines)
// ---------------------------------------------------------------------------

test('stdout shows per-file status lines and summary', async () => {
  const d = await scratch();
  const { stdout } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-I',
  ]);
  assert.match(stdout, /change\s+.*sample0\.png/);
  assert.match(stdout, /pass\s+.*sample1\.png/);
  assert.match(stdout, /1 file\(s\) changed/);
  assert.match(stdout, /1 file\(s\) passed/);
});

test('-D custom diff message shows up on failure', async () => {
  const d = await scratch();
  const { stdout } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-D',
    'custom-trailer-msg',
    '-I',
  ]);
  assert.ok(stdout.includes('custom-trailer-msg'));
});

// ---------------------------------------------------------------------------
// Phase-F: --version / favicon / -X client assets / -U semantics
// ---------------------------------------------------------------------------

test('--version prints the package.json version', async () => {
  const { code, stdout } = await runCli(['--version']);
  assert.equal(code, 0);
  // Must look like semver-ish (at least digits + dot), not a placeholder.
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('HTML report embeds a favicon data URL', async () => {
  const d = await scratch();
  const reportRel = `${d.rel}/report.html`;
  await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-R',
    reportRel,
    '-I',
  ]);
  const html = await readFile(join(REPO, reportRel), 'utf8');
  // `<link rel="shortcut icon" href="data:image/png;base64,...">` — check
  // the placeholder was replaced with real PNG bytes.
  assert.match(
    html,
    /<link rel="shortcut icon" href="data:image\/png;base64,[A-Za-z0-9+/=]{20,}"/,
  );
});

test('-X client emits worker.js + detector.wasm next to report', async () => {
  const d = await scratch();
  const reportRel = `${d.rel}/report.html`;
  await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-R',
    reportRel,
    '-X',
    'client',
    '-I',
  ]);
  const reportDir = dirname(join(REPO, reportRel));
  // Classic reg-cli test asserts on the *existence* of these files
  // (test/cli.test.mjs:250-275). Match that at minimum; also sanity-check
  // sizes so we catch an empty-write regression.
  const workerStat = await stat(join(reportDir, 'worker.js'));
  const wasmStat = await stat(join(reportDir, 'detector.wasm'));
  assert.ok(workerStat.size > 10_000, 'worker.js should contain the concatenated bundle');
  assert.ok(wasmStat.size > 100_000, 'detector.wasm should be the x-img-diff wasm');
});

// ---------------------------------------------------------------------------
// Phase-H regression test: multi-segment preopen + sandboxed intermediate
// directories
// ---------------------------------------------------------------------------
//
// The bug being guarded here: `computeWasiSandbox` registers ONE preopen
// covering the common ancestor of every touched dir. When that ancestor is
// deep (e.g. `./packages/app/screenshots`), the filesystem walker inside
// `reg_core::find_images` must not try to open intermediate dirs like `.`
// or `packages/` (they're OUTSIDE the sandbox and return EBADF). Earlier
// reg_core used `glob::glob`, which walks from cwd and trips on those
// intermediate opendirs, silently returning ZERO matches — reg.json ends
// up empty, exit code 0, HTML "success". CI goes green while no images
// were actually compared.
//
// The fix in phase-H replaced `glob::glob` with a direct recursive
// `std::fs::read_dir(actual_dir)` walker that starts AT the sandboxed
// root instead of traversing to it. This test uses a deliberately deep
// scratch path to make sure we never regress to the broken glob walker.
//
// If this test ever fires, images were silently dropped. Don't mark it
// as flaky — go read `walk_images` in `crates/reg_core/src/lib.rs` and
// make sure it's still being called instead of falling back to
// pattern-based globbing.
test('multi-segment positional dirs still discover images', async () => {
  // Scratch path with ≥3 segments so the preopen ends up multi-segment
  // (the other tests use `.libtest-*` at the repo root which is already
  // single-segment and wouldn't exercise the previously-broken path).
  const leaf = `.phase-h-deep/${process.pid}-${++runId}/nested/level`;
  const actualRel = `${leaf}/actual`;
  const expectedRel = `${leaf}/expected`;
  const diffRel = `${leaf}/diff`;
  const jsonRel = `${leaf}/reg.json`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, actualRel, 'sample0.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'expected/sample0.png'),
    join(REPO, expectedRel, 'sample0.png'),
  );

  try {
    await runCli([actualRel, expectedRel, diffRel, '-J', jsonRel, '-I']);
    const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
    // The critical assertion: images ARE discovered despite the deep path.
    // If this ever goes back to `[]`, someone reintroduced a walker that
    // opens intermediate dirs outside the WASI preopen.
    assert.deepEqual(report.actualItems, ['sample0.png']);
    assert.deepEqual(report.expectedItems, ['sample0.png']);
  } finally {
    await rm(join(REPO, '.phase-h-deep'), { recursive: true, force: true });
  }
});

test('multi-segment positional dirs: nested subdirs still discover images', async () => {
  // Extra guard: images under a SUBDIRECTORY of actual_dir (not just top
  // level). The walker must recurse correctly, and the returned paths
  // must be relative to actual_dir (`sub/a.png`, not an absolute path).
  const leaf = `.phase-h-subdir/${process.pid}-${++runId}/nested`;
  const actualRel = `${leaf}/actual`;
  const expectedRel = `${leaf}/expected`;
  await mkdir(join(REPO, actualRel, 'sub'), { recursive: true });
  await mkdir(join(REPO, expectedRel, 'sub'), { recursive: true });
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, actualRel, 'sub/a.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'expected/sample0.png'),
    join(REPO, expectedRel, 'sub/a.png'),
  );

  try {
    await runCli([
      actualRel,
      expectedRel,
      `${leaf}/diff`,
      '-J',
      `${leaf}/reg.json`,
      '-I',
    ]);
    const report = JSON.parse(await readFile(join(REPO, leaf, 'reg.json'), 'utf8'));
    // Path should be actual_dir-relative with forward slashes.
    assert.deepEqual(report.actualItems, ['sub/a.png']);
  } finally {
    await rm(join(REPO, '.phase-h-subdir'), { recursive: true, force: true });
  }
});

test('-U prunes deleted baselines and keeps passed files untouched', async () => {
  // Seed a scenario: expected has stale.png (not in actual) → deleted.
  // actual has sample0.png differing from expected → failed/changed.
  // expected has sample1.png identical to actual → passed.
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });

  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, actualRel, 'sample0.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample1.png'),
    join(REPO, actualRel, 'sample1.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'expected/sample0.png'),
    join(REPO, expectedRel, 'sample0.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample1.png'),
    join(REPO, expectedRel, 'sample1.png'),
  );
  // Stale baseline only in expected → should be removed by -U.
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, expectedRel, 'stale.png'),
  );
  // Capture pre-update mtime for the passed file so we can assert we
  // didn't needlessly rewrite it.
  const passedBefore = await stat(join(REPO, expectedRel, 'sample1.png'));

  const { code } = await runCli([
    actualRel,
    expectedRel,
    `${d.rel}/diff`,
    '-U',
  ]);
  assert.equal(code, 0);

  // stale.png: pruned.
  await assert.rejects(() => stat(join(REPO, expectedRel, 'stale.png')));

  // sample0.png: overwritten with actual/sample0.png — bytes now match.
  const a0 = await readFile(join(REPO, actualRel, 'sample0.png'));
  const e0 = await readFile(join(REPO, expectedRel, 'sample0.png'));
  assert.equal(Buffer.compare(a0, e0), 0);

  // sample1.png (passed): bytes unchanged AND mtime unchanged.
  const passedAfter = await stat(join(REPO, expectedRel, 'sample1.png'));
  assert.equal(
    passedAfter.mtimeMs,
    passedBefore.mtimeMs,
    'passed file should not be rewritten by -U',
  );
});

// ---------------------------------------------------------------------------
// Threshold-rate / threshold-pixel boundary parity with classic reg-cli
// (mirrors `test/cli.test.mjs` "fail with -T 0.00", "pass with -T 1.00",
//  "fail with -S 0", "pass with -S 10000000" on the JS branch).
// ---------------------------------------------------------------------------

test('-T 0.00 (strict thresholdRate) fails on any pixel difference', async () => {
  const d = await scratch();
  const { code } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-T',
    '0.00',
  ]);
  assert.equal(code, 1);
});

test('-T 1.00 (lax thresholdRate) accepts everything', async () => {
  const d = await scratch();
  const { code } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-T',
    '1.00',
  ]);
  assert.equal(code, 0);
});

test('-S 0 (strict thresholdPixel) fails on any pixel difference', async () => {
  const d = await scratch();
  const { code } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-S',
    '0',
  ]);
  assert.equal(code, 1);
});

test('-S 10000000 (lax thresholdPixel) accepts everything', async () => {
  const d = await scratch();
  const { code } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-S',
    '10000000',
  ]);
  assert.equal(code, 0);
});

// ---------------------------------------------------------------------------
// Identical / disjoint directory shapes (parity gaps from the JS branch's
// "success report", "new item report", "deleted item report" tests).
// ---------------------------------------------------------------------------

test('identical dirs → passedItems populated, failedItems empty, exit 0', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  // Same bytes on both sides → guaranteed pass.
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, actualRel, 'sample0.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, expectedRel, 'sample0.png'),
  );

  const jsonRel = `${d.rel}/reg.json`;
  const { code } = await runCli([
    actualRel,
    expectedRel,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
  ]);
  assert.equal(code, 0);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  assert.deepEqual(report.failedItems, []);
  assert.deepEqual(report.newItems, []);
  assert.deepEqual(report.deletedItems, []);
  assert.deepEqual(report.passedItems, ['sample0.png']);
});

test('actual empty → all expected items appear in deletedItems', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, expectedRel, 'sample0.png'),
  );

  const jsonRel = `${d.rel}/reg.json`;
  await runCli([actualRel, expectedRel, `${d.rel}/diff`, '-J', jsonRel, '-I']);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  assert.deepEqual(report.deletedItems, ['sample0.png']);
  assert.deepEqual(report.newItems, []);
});

// ---------------------------------------------------------------------------
// Edge cases the JS branch never had: corrupt / non-image inputs.
// Backed by reg_core's per-image failure tolerance (see
// `crates/reg_core/src/lib.rs::per_image_failure_tests`).
// ---------------------------------------------------------------------------

test('corrupt PNG → failedItems entry, run continues for siblings, exit 1', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });

  // One valid pair (will pass)…
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, actualRel, 'good.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, expectedRel, 'good.png'),
  );
  // …plus a corrupt pair the decoder will reject.
  await import('node:fs/promises').then(({ writeFile }) =>
    Promise.all([
      writeFile(join(REPO, actualRel, 'bad.png'), 'not a png AAA'),
      writeFile(join(REPO, expectedRel, 'bad.png'), 'not a png BBB'),
    ]),
  );

  const jsonRel = `${d.rel}/reg.json`;
  const { code, stderr } = await runCli([
    actualRel,
    expectedRel,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
  ]);
  assert.equal(code, 1, `expected exit 1 due to bad.png; stderr: ${stderr}`);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  assert.ok(
    report.failedItems.includes('bad.png'),
    `bad.png should be in failedItems; got ${JSON.stringify(report.failedItems)}`,
  );
  assert.ok(
    report.passedItems.includes('good.png'),
    `good.png should still pass; got ${JSON.stringify(report.passedItems)}`,
  );
  assert.match(
    stderr,
    /bad\.png/,
    'stderr should name the failing file so users can find it',
  );
});

test('non-image files in actual/expected dirs are silently skipped', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, actualRel, 'sample0.png'),
  );
  await cp(
    join(REPO, SAMPLE_REL, 'actual/sample0.png'),
    join(REPO, expectedRel, 'sample0.png'),
  );
  await import('node:fs/promises').then(({ writeFile }) =>
    Promise.all([
      writeFile(join(REPO, actualRel, 'README.md'), '# notes\n'),
      writeFile(join(REPO, expectedRel, 'data.json'), '{}'),
    ]),
  );

  const jsonRel = `${d.rel}/reg.json`;
  const { code } = await runCli([
    actualRel,
    expectedRel,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
  ]);
  assert.equal(code, 0);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  for (const bucket of [
    report.passedItems,
    report.failedItems,
    report.newItems,
    report.deletedItems,
  ]) {
    assert.ok(
      bucket.every((n) => !n.endsWith('.md') && !n.endsWith('.json')),
      `non-image leaked into bucket: ${JSON.stringify(bucket)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Real-world fixture edge cases — captured ahead of v0.1 publish so that a
// regression in any of these reaches us before reg-suit / CI users do.
//
// All fixtures are inlined as base64 (≤300 bytes each) so the tests are
// hermetic — no ImageMagick required on the runner.
// ---------------------------------------------------------------------------

// 2×2 solid red, 4×4 solid red, 2×2 solid white. Hand-generated via
// ImageMagick; tiny enough to embed.
const PNG_2x2_RED   = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAABlBMVEX/AAD///9BHTQRAAAADElEQVQI12NgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC';
const PNG_4x4_RED   = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQMAAACTPww9AAAABlBMVEX/AAD///9BHTQRAAAACyJREFUCNdjYIAAAAAIAAEvIN0xAAAAAElFTkSuQmCC';
const PNG_2x2_WHITE = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQAAAABazTCJAAAAC0lEQVQI12NgaGAAAAMEAQGBxbqiqQAAAABJRU5ErkJggg==';

const writeBin = async (path, b64) => {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, Buffer.from(b64, 'base64'));
};

test('different-dimensions pair (2×2 vs 4×4) → fail without panicking', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  await writeBin(join(REPO, actualRel, 'mismatch.png'), PNG_2x2_RED);
  await writeBin(join(REPO, expectedRel, 'mismatch.png'), PNG_4x4_RED);

  const jsonRel = `${d.rel}/reg.json`;
  const { code, stderr } = await runCli([
    actualRel,
    expectedRel,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
  ]);
  // Either failedItems (treated as differing) OR a per-image error
  // counted as failed — both are acceptable, the run must NOT crash.
  assert.notStrictEqual(code, null, `process should exit cleanly; stderr: ${stderr}`);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  assert.ok(
    report.failedItems.includes('mismatch.png'),
    `mismatch.png should be in failedItems; got ${JSON.stringify(report)}`,
  );
});

test('filename with spaces and Unicode is preserved end-to-end', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });

  // Two fixtures: one with a space, one with non-ASCII bytes.
  // Same-bytes pair → must show up in passedItems verbatim.
  for (const name of ['my image.png', '画像テスト.png']) {
    await writeBin(join(REPO, actualRel, name), PNG_2x2_RED);
    await writeBin(join(REPO, expectedRel, name), PNG_2x2_RED);
  }

  const jsonRel = `${d.rel}/reg.json`;
  const { code } = await runCli([
    actualRel,
    expectedRel,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
  ]);
  assert.equal(code, 0);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  assert.ok(
    report.passedItems.includes('my image.png'),
    `space filename lost — got passedItems=${JSON.stringify(report.passedItems)}`,
  );
  assert.ok(
    report.passedItems.includes('画像テスト.png'),
    `Unicode filename lost — got passedItems=${JSON.stringify(report.passedItems)}`,
  );
});

test('nested subdirectories (actual/foo/bar/baz.png) are traversed', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel, 'foo/bar'), { recursive: true });
  await mkdir(join(REPO, expectedRel, 'foo/bar'), { recursive: true });
  // Identical bytes → must pass.
  await writeBin(join(REPO, actualRel, 'foo/bar/baz.png'), PNG_2x2_RED);
  await writeBin(join(REPO, expectedRel, 'foo/bar/baz.png'), PNG_2x2_RED);
  // Differing bytes at a different depth → must fail.
  await mkdir(join(REPO, actualRel, 'foo'), { recursive: true });
  await writeBin(join(REPO, actualRel, 'foo/sibling.png'), PNG_2x2_RED);
  await writeBin(join(REPO, expectedRel, 'foo/sibling.png'), PNG_2x2_WHITE);

  const jsonRel = `${d.rel}/reg.json`;
  await runCli([actualRel, expectedRel, `${d.rel}/diff`, '-J', jsonRel, '-I']);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  // Path separator is `/` regardless of host OS — we run the CLI under
  // WASI which normalises to forward slashes.
  assert.ok(
    report.passedItems.includes('foo/bar/baz.png'),
    `nested baz.png missing — got passedItems=${JSON.stringify(report.passedItems)}`,
  );
  assert.ok(
    report.failedItems.includes('foo/sibling.png'),
    `nested sibling.png missing — got failedItems=${JSON.stringify(report.failedItems)}`,
  );
});

test('non-PNG image formats (.jpg) are accepted and diffed', async () => {
  // Tiny 8×8 JPEG (grey). Same bytes both sides → identical pair pass.
  const JPG_8x8_GREY = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAAIAAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAABf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVf/Z';
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });
  await writeBin(join(REPO, actualRel, 'a.jpg'), JPG_8x8_GREY);
  await writeBin(join(REPO, expectedRel, 'a.jpg'), JPG_8x8_GREY);

  const jsonRel = `${d.rel}/reg.json`;
  const { code, stderr } = await runCli([
    actualRel,
    expectedRel,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
  ]);
  assert.equal(code, 0, `JPG pair should pass; stderr: ${stderr}`);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  assert.ok(
    report.passedItems.includes('a.jpg'),
    `a.jpg should pass; got passedItems=${JSON.stringify(report.passedItems)}`,
  );
});

// ---------------------------------------------------------------------------
// Output / option flag coverage
// ---------------------------------------------------------------------------

test('--diffFormat png writes .png diff (and reg.json diffItems uses .png)', async () => {
  const d = await scratch();
  const { code } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-J',
    `${d.rel}/reg.json`,
    '-I',
    '--diffFormat',
    'png',
  ]);
  assert.equal(code, 0);
  // sample0 differs → diff written. Filename keeps the basename, only ext changes.
  await stat(join(REPO, `${d.rel}/diff/sample0.png`));
  await assert.rejects(() =>
    stat(join(REPO, `${d.rel}/diff/sample0.webp`)),
  );
  const report = JSON.parse(await readFile(join(REPO, `${d.rel}/reg.json`), 'utf8'));
  assert.ok(
    report.diffItems.every((p) => p.endsWith('.png')),
    `diffItems must all be .png with --diffFormat png; got ${JSON.stringify(report.diffItems)}`,
  );
});

test('--diffFormat webp writes .webp diff (and reg.json diffItems uses .webp)', async () => {
  const d = await scratch();
  const { code } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-J',
    `${d.rel}/reg.json`,
    '-I',
    '--diffFormat',
    'webp',
  ]);
  assert.equal(code, 0);
  await stat(join(REPO, `${d.rel}/diff/sample0.webp`));
  const report = JSON.parse(await readFile(join(REPO, `${d.rel}/reg.json`), 'utf8'));
  assert.ok(
    report.diffItems.every((p) => p.endsWith('.webp')),
    `diffItems must all be .webp with --diffFormat webp; got ${JSON.stringify(report.diffItems)}`,
  );
});

test('-P / --urlPrefix is applied to actualDir/expectedDir/diffDir in reg.json', async () => {
  // Note: the prefix is consumed by `create_dir_for_json_report` in
  // crates/reg_core/src/report.rs — it only kicks in when reg.json is
  // being written, not in the HTML-embedded payload (which still uses
  // relative paths). reg-suit + downstream notify plugins read reg.json,
  // so the reg.json path is the one that has to honour `-P`.
  const d = await scratch();
  const jsonRel = `${d.rel}/reg.json`;
  await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
    '-I',
    '-P',
    'https://cdn.example.com/regs/',
  ]);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  for (const k of ['actualDir', 'expectedDir', 'diffDir']) {
    assert.ok(
      typeof report[k] === 'string' && report[k].startsWith('https://cdn.example.com/'),
      `${k} should start with the URL prefix; got ${report[k]}`,
    );
  }
});

test('-A / --enableAntialias is accepted and produces a usable run', async () => {
  // Constructing a fixture where antialiased pixels actually flip
  // pass/fail is fragile (exact thresholds depend on the diff lib's
  // YIQ heuristic). At minimum, lock in that the flag parses, the run
  // exits cleanly, and writes a usable reg.json.
  const d = await scratch();
  const jsonRel = `${d.rel}/reg.json`;
  const { code, stderr } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-J',
    jsonRel,
    '-I',
    '-A',
  ]);
  assert.equal(code, 0, `--enableAntialias should not abort: ${stderr}`);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  assert.ok(Array.isArray(report.passedItems), 'reg.json keys still present with -A');
});

test('-M / --matchingThreshold is accepted', async () => {
  const d = await scratch();
  const { code, stderr } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-I',
    '-M',
    '0.1',
  ]);
  assert.equal(code, 0, `--matchingThreshold should not abort: ${stderr}`);
});

test('-C / --concurrency accepts an explicit thread count', async () => {
  const d = await scratch();
  const { code, stderr } = await runCli([
    `${SAMPLE_REL}/actual`,
    `${SAMPLE_REL}/expected`,
    `${d.rel}/diff`,
    '-I',
    '-C',
    '2',
  ]);
  assert.equal(code, 0, `--concurrency 2 should not abort: ${stderr}`);
});

// ---------------------------------------------------------------------------
// Argv / dir shape edge cases
// ---------------------------------------------------------------------------

test('trailing slash on positional dirs is accepted (`actual/` ≡ `actual`)', async () => {
  const d = await scratch();
  const { code } = await runCli([
    `${SAMPLE_REL}/actual/`,   // ← trailing slash
    `${SAMPLE_REL}/expected/`, // ← trailing slash
    `${d.rel}/diff/`,          // ← trailing slash
    '-I',
    '-J',
    `${d.rel}/reg.json`,
  ]);
  assert.equal(code, 0);
  const report = JSON.parse(await readFile(join(REPO, `${d.rel}/reg.json`), 'utf8'));
  // sample1 is identical; assert that something landed in passedItems.
  assert.ok(
    report.passedItems.length > 0,
    `expected at least one passed item; got ${JSON.stringify(report)}`,
  );
});

test('both actual and expected dirs empty → all-empty report, exit 0', async () => {
  const d = await scratch();
  const actualRel = `${d.rel}/actual`;
  const expectedRel = `${d.rel}/expected`;
  await mkdir(join(REPO, actualRel), { recursive: true });
  await mkdir(join(REPO, expectedRel), { recursive: true });

  const jsonRel = `${d.rel}/reg.json`;
  const { code } = await runCli([actualRel, expectedRel, `${d.rel}/diff`, '-J', jsonRel]);
  assert.equal(code, 0);
  const report = JSON.parse(await readFile(join(REPO, jsonRel), 'utf8'));
  assert.deepEqual(report.failedItems, []);
  assert.deepEqual(report.passedItems, []);
  assert.deepEqual(report.newItems, []);
  assert.deepEqual(report.deletedItems, []);
});
