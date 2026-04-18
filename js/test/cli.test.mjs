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
const REPO = join(HERE, '..', '..');
const CLI = join(REPO, 'js', 'dist', 'cli.mjs');
const SAMPLE_REL = 'js/sample'; // repo-relative
// Unique scratch dir per test, rooted under the repo so the WASI preopen
// computed from positional dirs comfortably covers it.
const TMP_ROOT_ABS = join(REPO, 'js', 'test', '__workspace__');
const TMP_ROOT_REL = relative(REPO, TMP_ROOT_ABS); // 'js/test/__workspace__'

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
  // Must look like semver-ish (at least digits + dot), not the classic
  // "reg-cli-wasm" placeholder.
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
