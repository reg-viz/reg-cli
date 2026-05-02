// Emits the browser-side assets classic reg-cli's `-X, --additionalDetection
// client` mode relies on:
//
//   <report-dir>/worker.js       — mustache-rendered worker_pre.js + the
//                                  report-ui worker + the x-img-diff-js
//                                  wasm loader, concatenated in that order
//   <report-dir>/detector.wasm   — the x-img-diff-js wasm binary itself,
//                                  renamed from cv-wasm_browser.wasm
//
// The HTML report's ximgdiffConfig.workerUrl points at `./worker.js`, so if
// this pair isn't next to the report the browser will 404 the worker and
// the "client" detection pass silently becomes a no-op.
//
// Classic's src/report.js does this inline; we keep it factored out so both
// the CLI wrapper (`cli.ts`) and the library entry point (`compare()` in
// `index.ts`) can emit the same bytes.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// CommonJS fallback for `require.resolve` — unbuild emits both cjs + mjs
// variants and the library can be loaded from either.
const requireShim = createRequire(import.meta.url);

// Minimal mustache `{{&name}}` replacement — the template only uses that
// single non-escaped substitution, so a full mustache dep isn't warranted.
const renderWorkerPre = (template: string, wasmUrl: string): string =>
  template.replace(/\{\{&\s*ximgdiffWasmUrl\s*\}\}/g, wasmUrl);

export type XimgdiffOptions = {
  /** Absolute or cwd-relative path to the report HTML. Assets land next to it. */
  reportPath: string;
  /** Same prefix the HTML report received (default ''). */
  urlPrefix?: string;
  /**
   * Directory that contains the staged `shared/worker_pre.js` and
   * `shared/report-worker.js` assets (produced by the unbuild hook in
   * `build.config.ts`). Callers pass the published `dist/` directory so
   * that unbuild's chunk splitting — which moves this helper off to
   * `dist/chunks/ximgdiff.mjs` — doesn't break path resolution.
   */
  distDir: string;
};

/**
 * Concatenate worker_pre.js + report-ui worker + x-img-diff-js loader and
 * write the result + the wasm binary next to the HTML report. Safe to call
 * whether or not the report dir already exists.
 */
export const writeXimgdiffAssets = async (
  opts: XimgdiffOptions,
): Promise<void> => {
  const outDir = dirname(opts.reportPath);
  const urlPrefix = opts.urlPrefix ?? '';
  const wasmUrl = `${urlPrefix}detector.wasm`;

  // Resolve the wasm binary via x-img-diff-js's node API — matches
  // classic's `detectDiff.getBrowserWasmPath()` behaviour and keeps us
  // honest about the version pin.
  const xImgDiff: {
    getBrowserWasmPath: () => string;
    getBrowserJsPath: () => string;
  } = requireShim('x-img-diff-js');

  const sharedDir = join(opts.distDir, 'shared');
  const [workerPreTpl, reportWorkerJs, wasmLoaderJs, wasmBuf] =
    await Promise.all([
      readFile(join(sharedDir, 'worker_pre.js'), 'utf8'),
      readFile(join(sharedDir, 'report-worker.js'), 'utf8'),
      readFile(xImgDiff.getBrowserJsPath(), 'utf8'),
      readFile(xImgDiff.getBrowserWasmPath()),
    ]);

  const workerJs =
    renderWorkerPre(workerPreTpl, wasmUrl) +
    '\n' +
    reportWorkerJs +
    '\n' +
    wasmLoaderJs;

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(join(outDir, 'worker.js'), workerJs, 'utf8'),
    writeFile(join(outDir, 'detector.wasm'), wasmBuf),
  ]);
};
