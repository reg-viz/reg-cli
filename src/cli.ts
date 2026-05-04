#!/usr/bin/env node
//
// CLI wrapper around the Wasm `run()` entry point.
//
// Goal: match the surface of classic reg-cli (`src/cli.js`) closely enough
// that existing `reg-cli` users do not have to change their CI invocation.
// Specifically this handles:
//
//   - POSIX short-flag aliases (-R, -J, -M, -T, -S, -C, -A, -I, -E, -U, -D)
//   - Non-zero exit code on pixel diff (`process.exitCode = 1`)
//   - Per-file progress log + summary line
//   - `-U / --update` baseline refresh
//   - `-I / --ignoreChange` overrides the non-zero exit code
//   - `-E / --extendedErrors` escalates new/deleted counts to failure
//   - `-D / --customDiffMessage` custom trailer line
//
// Still handled in the Wasm (Rust) side via clap short aliases:
//
//   -R/--report, -J/--json, -M/--matchingThreshold, -T/--thresholdRate,
//   -S/--thresholdPixel, -P/--urlPrefix, -C/--concurrency, -A/--enableAntialias,
//   --diffFormat, --junit, -F/--from, -X/--additionalDetection
//
// reg.json and junit.xml are now written on the Rust/Wasm side so that they
// land inside the WASI sandbox's preopened directory and so the non-wasm
// `cargo run` CLI produces identical artefacts.
//
import { parseArgs } from 'node:util';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { run, dir as distDir, type CompareOutput } from './';
import { writeXimgdiffAssets } from './ximgdiff';

const HELP = `
  Usage
    $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir
  Options
    -U, --update              Update expected images (copy actual → expected).
    -R, --report              Output html report to specified path.
    -J, --json                Output json report to specified path (default ./reg.json).
    -I, --ignoreChange        Exit 0 even when image changes are detected.
    -E, --extendedErrors      Also treat added/deleted images as failures.
    -F, --from                Render HTML report from an existing reg.json (no diff).
    -X, --additionalDetection "none" | "client" — enable browser-side second-pass detection.
    -P, --urlPrefix           Prefix for image src in html report.
    -M, --matchingThreshold   YIQ threshold (0-1). Default 0.
    -T, --thresholdRate       Ratio of pixels that may differ before failing.
    -S, --thresholdPixel      Absolute pixel count that may differ before failing.
    -C, --concurrency         Parallel worker count. Default 4.
    -A, --enableAntialias     Count anti-aliased pixels as different.
    -D, --customDiffMessage   Trailing message printed on diff.
        --junit               Path to write a JUnit XML test report.
        --diffFormat          webp (default) | png
`;

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (process.argv.includes('--version')) {
  // Read from the package.json next to dist/. reg-suit and downstream
  // tooling probe `reg-cli --version` to decide which compat shim to use,
  // so this needs to report a real semver.
  try {
    const requireShim = createRequire(import.meta.url);
    const pkg = requireShim('../package.json') as { version?: string };
    process.stdout.write(`${pkg.version ?? 'unknown'}\n`);
  } catch {
    process.stdout.write('unknown\n');
  }
  process.exit(0);
}

let parsed;
try {
  parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      update: { type: 'boolean', short: 'U' },
      json: { type: 'string', short: 'J' },
      ignoreChange: { type: 'boolean', short: 'I' },
      extendedErrors: { type: 'boolean', short: 'E' },
      report: { type: 'string', short: 'R' },
      urlPrefix: { type: 'string', short: 'P' },
      matchingThreshold: { type: 'string', short: 'M' },
      thresholdRate: { type: 'string', short: 'T' },
      thresholdPixel: { type: 'string', short: 'S' },
      concurrency: { type: 'string', short: 'C' },
      enableAntialias: { type: 'boolean', short: 'A' },
      customDiffMessage: { type: 'string', short: 'D' },
      diffFormat: { type: 'string' },
      junit: { type: 'string' },
      from: { type: 'string', short: 'F' },
      additionalDetection: { type: 'string', short: 'X' },
    },
    allowPositionals: true,
  });
} catch (err) {
  process.stderr.write(`reg-cli: ${(err as Error).message}\n`);
  process.stderr.write(HELP);
  process.exit(1);
}

const { values, positionals } = parsed;
const [actualDir, expectedDir, diffDir] = positionals;
const fromPath = typeof values.from === 'string' ? values.from : undefined;

// `-F/--from` re-renders HTML from an existing reg.json and does not need
// the positional dirs; classic reg-cli accepts that mode without them.
if (!fromPath && (!actualDir || !expectedDir || !diffDir)) {
  process.stderr.write('reg-cli: please specify actual, expected and diff directories.\n');
  process.stderr.write(HELP);
  process.exit(1);
}

// CLI-only semantics (not forwarded to Wasm).
const update = !!values.update;
const ignoreChange = !!values.ignoreChange;
const extendedErrors = !!values.extendedErrors;
// Default to matching classic reg-cli: diff images are written as PNG,
// `./reg.json` is always persisted to disk (in `run()` on the Rust side).
const diffFormat = typeof values.diffFormat === 'string' ? values.diffFormat : 'png';
const jsonPath = typeof values.json === 'string' ? values.json : './reg.json';
const customDiffMessage =
  typeof values.customDiffMessage === 'string'
    ? values.customDiffMessage
    : `\nInspect your code changes, re-run with \`-U\` to update them. `;

// Forward to Wasm: only flags that Rust/clap understands.
const wasmArgv: string[] = ['--'];
if (actualDir) wasmArgv.push(actualDir);
if (expectedDir) wasmArgv.push(expectedDir);
if (diffDir) wasmArgv.push(diffDir);
const pushFlag = (name: string, v: unknown): void => {
  if (v == null || v === false) return;
  if (v === true) wasmArgv.push(`--${name}`);
  else wasmArgv.push(`--${name}`, String(v));
};
pushFlag('report', values.report);
pushFlag('json', jsonPath);
pushFlag('junit', values.junit);
// `-E` is both a CLI exit-code knob (handled in JS below) AND input to the
// junit XML generator on the Rust side — forward it so the XML matches
// classic reg-cli's extendedErrors behaviour.
pushFlag('extendedErrors', values.extendedErrors);
pushFlag('from', fromPath);
pushFlag('additionalDetection', values.additionalDetection);
pushFlag('matchingThreshold', values.matchingThreshold);
pushFlag('thresholdRate', values.thresholdRate);
pushFlag('thresholdPixel', values.thresholdPixel);
pushFlag('urlPrefix', values.urlPrefix);
pushFlag('concurrency', values.concurrency);
pushFlag('enableAntialias', values.enableAntialias);
pushFlag('diffFormat', diffFormat);

const CHECK = '\u2714'; // ✔
const CROSS = '\u2718'; // ✘
const PLUS = '\u271A'; // ✚
const MINUS = '\u2212'; // −

// `--from` mode doesn't require a positional actualDir; fall back to just the
// path when we have no prefix to join.
const formatPath = (p: string) => (actualDir ? join(actualDir, p) : p);

const emitter = run(wasmArgv);

emitter.once('complete', async (data: CompareOutput) => {
  const failed = data.failedItems ?? [];
  const passed = data.passedItems ?? [];
  const added = data.newItems ?? [];
  const deleted = data.deletedItems ?? [];

  // NOTE: reg.json and junit.xml are written by the Rust/Wasm side (see
  // `reg_core::run` + `reg_core::run_from_json`). Doing it there keeps the
  // files inside the WASI sandbox's preopened root and avoids a duplicate
  // serialize/write from JS.

  // `-X client` emits worker.js + detector.wasm next to the HTML report so
  // the browser's second-pass pixel detector can actually load. We do it in
  // JS (not Rust) because the x-img-diff-js wasm binary lives in node_modules
  // and shouldn't be linked into the Wasm bundle.
  if (values.additionalDetection === 'client' && typeof values.report === 'string') {
    try {
      await writeXimgdiffAssets({
        reportPath: values.report,
        urlPrefix: typeof values.urlPrefix === 'string' ? values.urlPrefix : '',
        distDir: distDir(),
      });
    } catch (e) {
      process.stderr.write(`reg-cli: failed to write ximgdiff assets — ${(e as Error).message}\n`);
      process.exitCode = 1;
    }
  }

  // Per-file lines (ordering roughly follows classic reg-cli).
  for (const img of passed) process.stdout.write(`${CHECK} pass    ${formatPath(img)}\n`);
  for (const img of added) process.stdout.write(`${PLUS} append  ${formatPath(img)}\n`);
  for (const img of deleted) process.stdout.write(`${MINUS} delete  ${formatPath(img)}\n`);
  for (const img of failed) process.stdout.write(`${CROSS} change  ${formatPath(img)}\n`);

  // Summary lines.
  process.stdout.write('\n');
  if (failed.length) process.stdout.write(`${CROSS} ${failed.length} file(s) changed.\n`);
  if (deleted.length) process.stdout.write(`${MINUS} ${deleted.length} file(s) deleted.\n`);
  if (added.length) process.stdout.write(`${PLUS} ${added.length} file(s) appended.\n`);
  if (passed.length) process.stdout.write(`${CHECK} ${passed.length} file(s) passed.\n`);

  if (update) {
    if (!actualDir || !expectedDir) {
      process.stderr.write(`reg-cli: --update requires actual/expected dirs (incompatible with --from).\n`);
      process.exitCode = 1;
      return;
    }
    try {
      await updateExpected(actualDir, expectedDir, {
        newItems: added,
        failedItems: failed,
        deletedItems: deleted,
      });
      process.stdout.write('\u2728 your expected images are updated \u2728\n');
    } catch (e) {
      process.stderr.write(`reg-cli: failed to update expected — ${(e as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  const hasFailure =
    failed.length > 0 || (extendedErrors && (added.length > 0 || deleted.length > 0));

  if (hasFailure) {
    process.stdout.write(`${customDiffMessage}\n`);
    if (!ignoreChange) process.exitCode = 1;
  }
});

emitter.once('error', (err: Error) => {
  process.stderr.write(`reg-cli: ${err?.message ?? String(err)}\n`);
  process.exitCode = 1;
});

// Match classic reg-cli's `-U` semantics (src/index.js:134-146):
//
//   1. rm from expected: deletedItems ∪ failedItems — first so stale
//      baselines don't linger and so overwrites are clean.
//   2. copy actual→expected: newItems ∪ failedItems — only the images the
//      user actually wanted to refresh; passed items are untouched.
//
// This differs from a naive `copy every actualItem` (what we shipped
// pre-phase-F) in two ways that matter for reg-suit workflows:
//   - deleted baselines are actually pruned
//   - unchanged images aren't needlessly rewritten (preserves mtime, keeps
//     git status clean)
async function updateExpected(
  actualDir: string,
  expectedDir: string,
  items: {
    newItems: string[];
    failedItems: string[];
    deletedItems: string[];
  },
): Promise<void> {
  const { rm } = await import('node:fs/promises');
  const toRemove = [...items.deletedItems, ...items.failedItems];
  for (const img of toRemove) {
    await rm(join(expectedDir, img), { force: true });
  }
  const toCopy = [...items.newItems, ...items.failedItems];
  for (const img of toCopy) {
    const src = join(actualDir, img);
    const dst = join(expectedDir, img);
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
  }
}
