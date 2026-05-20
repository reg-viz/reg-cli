// Emits the browser-side asset classic reg-cli's `-X, --additionalDetection
// client` mode relies on:
//
//   <report-dir>/worker.js    — the report-ui's worker bundle, which now
//                               embeds the img-block-match wasm as a
//                               data: URL. The HTML report's
//                               ximgdiffConfig.workerUrl points at this
//                               file; if it isn't next to the report the
//                               browser will 404 the worker and the
//                               "client" detection pass silently becomes
//                               a no-op.
//
// The previous detector (x-img-diff-js) shipped two files: a worker.js
// and a separate detector.wasm. img-block-match's wasm-bindgen / vite
// build inlines the wasm into the worker bundle as a base64 data URL, so
// no second asset is needed and there's nothing to template into the
// worker either.

import { dirname, join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export type XimgdiffOptions = {
  /** Absolute or cwd-relative path to the report HTML. Assets land next to it. */
  reportPath: string;
  /** Same prefix the HTML report received (default ''). Currently unused
   *  because the worker no longer references a sibling wasm asset, but
   *  kept for forward compatibility / call-site stability. */
  urlPrefix?: string;
  /**
   * Directory that contains the staged `shared/report-worker.js` asset
   * (produced by the unbuild hook in `build.config.ts` — copies
   * `report/ui/dist/worker.js` there during the reg-cli build). Callers
   * pass the published `dist/` directory so that unbuild's chunk
   * splitting — which moves this helper off to `dist/chunks/ximgdiff.mjs`
   * — doesn't break path resolution.
   */
  distDir: string;
};

/**
 * Write the report-ui's pre-built browser worker bundle next to the HTML
 * report. Safe to call whether or not the report dir already exists.
 */
export const writeXimgdiffAssets = async (
  opts: XimgdiffOptions,
): Promise<void> => {
  const outDir = dirname(opts.reportPath);

  // The bundle already contains the wasm payload (vite inlines it as a
  // `data:application/wasm;base64,…` URL during the report-ui worker
  // build), so this is a straight copy of one file.
  const workerJs = await readFile(
    join(opts.distDir, 'shared', 'report-worker.js'),
  );

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'worker.js'), workerJs);
};
