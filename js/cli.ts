#!/usr/bin/env node
//
// CLI wrapper around the Wasm `run()` entry point.
//
// Goal: match the surface of classic reg-cli (`src/cli.js`) closely enough
// that users migrating from `reg-cli` to `@bokuweb/reg-cli-wasm` do not have
// to change their CI invocation. Specifically this handles:
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
//   --diffFormat
//
// Not yet supported (follow-up PR):
//   -F/--from, --junit, -X/--additionalDetection
//
import { parseArgs } from 'node:util';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { run, type CompareOutput } from './';

const HELP = `
  Usage
    $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir
  Options
    -U, --update              Update expected images (copy actual → expected).
    -R, --report              Output html report to specified path.
    -J, --json                Output json report to specified path (default ./reg.json).
    -I, --ignoreChange        Exit 0 even when image changes are detected.
    -E, --extendedErrors      Also treat added/deleted images as failures.
    -P, --urlPrefix           Prefix for image src in html report.
    -M, --matchingThreshold   YIQ threshold (0-1). Default 0.
    -T, --thresholdRate       Ratio of pixels that may differ before failing.
    -S, --thresholdPixel      Absolute pixel count that may differ before failing.
    -C, --concurrency         Parallel worker count. Default 4.
    -A, --enableAntialias     Count anti-aliased pixels as different.
    -D, --customDiffMessage   Trailing message printed on diff.
        --diffFormat          webp (default) | png
`;

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (process.argv.includes('--version')) {
  // Keep in sync with package.json via build if we care; fine as a placeholder.
  process.stdout.write('reg-cli-wasm\n');
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

if (!actualDir || !expectedDir || !diffDir) {
  process.stderr.write('reg-cli: please specify actual, expected and diff directories.\n');
  process.stderr.write(HELP);
  process.exit(1);
}

// CLI-only semantics (not forwarded to Wasm).
const update = !!values.update;
const ignoreChange = !!values.ignoreChange;
const extendedErrors = !!values.extendedErrors;
const customDiffMessage =
  typeof values.customDiffMessage === 'string'
    ? values.customDiffMessage
    : `\nInspect your code changes, re-run with \`-U\` to update them. `;

// Forward to Wasm: only flags that Rust/clap understands.
const wasmArgv: string[] = ['--', actualDir, expectedDir, diffDir];
const pushFlag = (name: string, v: unknown): void => {
  if (v == null || v === false) return;
  if (v === true) wasmArgv.push(`--${name}`);
  else wasmArgv.push(`--${name}`, String(v));
};
pushFlag('report', values.report);
pushFlag('json', values.json);
pushFlag('matchingThreshold', values.matchingThreshold);
pushFlag('thresholdRate', values.thresholdRate);
pushFlag('thresholdPixel', values.thresholdPixel);
pushFlag('urlPrefix', values.urlPrefix);
pushFlag('concurrency', values.concurrency);
pushFlag('enableAntialias', values.enableAntialias);
pushFlag('diffFormat', values.diffFormat);

const CHECK = '\u2714'; // ✔
const CROSS = '\u2718'; // ✘
const PLUS = '\u271A'; // ✚
const MINUS = '\u2212'; // −

const formatPath = (p: string) => join(actualDir, p);

const emitter = run(wasmArgv);

emitter.once('complete', async (data: CompareOutput) => {
  const failed = data.failedItems ?? [];
  const passed = data.passedItems ?? [];
  const added = data.newItems ?? [];
  const deleted = data.deletedItems ?? [];

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
    try {
      await updateExpected(actualDir, expectedDir, data.actualItems ?? []);
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

async function updateExpected(
  actualDir: string,
  expectedDir: string,
  images: string[],
): Promise<void> {
  for (const img of images) {
    const src = join(actualDir, img);
    const dst = join(expectedDir, img);
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
  }
}
