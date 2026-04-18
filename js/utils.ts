import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { env as procEnv, cwd as procCwd } from 'node:process';

export const isCJS = typeof __dirname !== 'undefined';

export const readWasm = () => {
  const dir = isCJS ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  const file = readFile(join(dir, './reg.wasm'));
  return file;
};

export const resolveExtention = (): string => {
  return isCJS ? 'cjs' : 'mjs';
};

/**
 * Host environment variables intentionally forwarded into the Wasm sandbox.
 * Everything else (shell secrets, CI credentials, AWS_*, NPM_TOKEN, ...) is
 * filtered out.
 */
const FORWARDED_ENV = [
  'OTEL_ENABLED',
  'JAEGER_ENABLED',
  'OTEL_DEBUG',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_PROTOCOL',
  'OTEL_SERVICE_NAME',
  'OTEL_TRACES_EXPORTER',
  'OTEL_RESOURCE_ATTRIBUTES',
] as const;

/**
 * Longest directory path that every input in `paths` lives under. Treats
 * each path as a sequence of "/"-separated segments; absolute-vs-relative
 * mixes fall back to '.'.
 */
const commonAncestor = (paths: string[]): string => {
  const defined = paths.filter(Boolean);
  if (defined.length === 0) return '.';
  if (defined.length === 1) return defined[0];
  // If absolute and relative are mixed we can't compute a meaningful common
  // ancestor without risking opening "/". Bail to CWD.
  const isAbs = (p: string) => p.startsWith('/');
  const anyAbs = defined.some(isAbs);
  const allAbs = defined.every(isAbs);
  if (anyAbs && !allAbs) return '.';
  const split = defined.map((p) => p.split('/').filter(Boolean));
  const shortest = Math.min(...split.map((s) => s.length));
  const common: string[] = [];
  for (let i = 0; i < shortest; i++) {
    const seg = split[0][i];
    if (split.every((s) => s[i] === seg)) common.push(seg);
    else break;
  }
  if (common.length === 0) return allAbs ? '/' : '.';
  return (allAbs ? '/' : '') + common.join('/');
};

export type WasiSandbox = {
  /** Directories mapped into the Wasm sandbox. Everything else is invisible. */
  preopens: Record<string, string>;
  /** Allowlist-filtered environment variables. */
  env: Record<string, string>;
};

/**
 * Compute the minimum-capability WASI sandbox for a given reg-cli invocation:
 *
 *   - preopen only the smallest ancestor directory that covers every path
 *     this run touches (actualDir, expectedDir, diffDir, and the parents
 *     of --report / --json)
 *   - forward only an allowlisted subset of host env into Wasm
 *
 * Before this, entry.ts / worker.ts did `preopens: { './': './' }` which
 * exposed the entire cwd (and therefore `.npmrc`, `.env`, `node_modules`,
 * etc.) to whatever runs inside Wasm. Narrowing matters because reg-cli
 * deliberately ingests untrusted images from CI and image decoders
 * (libpng, libwebp, libjpeg) have a long history of RCE-class CVEs.
 *
 * Why a single common-ancestor and not one preopen per directory:
 *   On the `wasm32-wasip1-threads` target, Rust's libstd only enumerates
 *   the first preopen returned by WASI (`fd_prestat_get(3)` is queried but
 *   `fd_prestat_get(4)` is never issued). Until that's fixed upstream,
 *   registering one preopen per dir effectively hides every dir but the
 *   first. Picking the narrowest *single* ancestor that still contains
 *   every touched path gives us a real-world win without tripping the bug.
 *
 * Caveats (follow-ups, not in this PR):
 *   - Symlinks and FIFOs inside the preopened directory are still resolved
 *     by the host, so an attacker who can plant files under `./diff/` could
 *     still exfiltrate via an evil symlink pointing outside the sandbox.
 *     Addressing this needs host-side WASI changes.
 *   - `@tybys/wasm-util`'s WASI still runs on top of Node's `fs` with full
 *     privilege (`fs: fs as IFs`); we only constrain *what paths Wasm is
 *     allowed to name*, not what the host fs underneath could do.
 *   - One-preopen-per-dir limitation above.
 */
export const computeWasiSandbox = (argv: string[]): WasiSandbox => {
  // run() in index.ts wraps argv with a leading "--" sentinel before passing
  // it through WASI. Strip that so we see the user's original args.
  const args = argv[0] === '--' ? argv.slice(1) : argv;

  // Positional args (up to 3) = actualDir, expectedDir, diffDir.
  const positional: string[] = [];
  for (let i = 0; i < args.length && positional.length < 3; i++) {
    if (args[i].startsWith('--')) break;
    positional.push(args[i]);
  }

  const flagValue = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
  };

  const dirs: string[] = [];
  for (const p of positional) if (p) dirs.push(p);
  const report = flagValue('--report');
  const json = flagValue('--json');
  const junit = flagValue('--junit');
  const from = flagValue('--from') ?? flagValue('-F');
  if (report) dirs.push(dirname(report) || '.');
  if (json) dirs.push(dirname(json) || '.');
  if (junit) dirs.push(dirname(junit) || '.');
  // `-F/--from` reads an existing reg.json, so its parent dir must be in the
  // sandbox even when no positional dirs are supplied.
  if (from) dirs.push(dirname(from) || '.');

  // Collapse every requested directory into a single shared ancestor.
  //
  // We originally tried to register 3-5 individual preopens (actual / expected
  // / diff / report / json). Problem: `wasm32-wasip1-threads` libstd's
  // preopen-enumeration appears to stop enumerating after fd 3 (only the
  // first preopen is actually visible to the Rust side), so only one preopen
  // becomes usable per run. Until that is fixed upstream, fall back to the
  // narrowest *single* directory that contains every path this run touches.
  //
  // That's still a large improvement over `{'./': './'}`: on a typical
  // invocation (`reg-cli <repo>/actual <repo>/expected <repo>/diff ...`) the
  // preopen becomes `<repo>` rather than the entire CWD.
  const preopenRoot = commonAncestor(dirs) || '.';
  const mapWasm = (p: string): string =>
    p === '.' || p === './' || p.startsWith('/') || p.startsWith('./')
      ? p
      : `./${p}`;
  const preopens: Record<string, string> = {
    [mapWasm(preopenRoot)]: preopenRoot,
  };

  // Fallback: if argv doesn't carry any dirs (--help, --version), let the
  // binary still render to stderr by preopening the current directory.
  if (!preopenRoot || preopenRoot === '.' || preopenRoot === './') {
    preopens['./'] = './';
  }

  const env: Record<string, string> = {};
  for (const k of FORWARDED_ENV) {
    const v = procEnv[k];
    if (v !== undefined) env[k] = v;
  }

  return { preopens, env };
};
