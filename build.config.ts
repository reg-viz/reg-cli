import { defineBuildConfig } from 'unbuild';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser-side worker sources that `ximgdiff.ts` concatenates at runtime
// when `-X client` is used. We stage them into dist/shared/ during build
// so the published package carries them without running any UI build on
// `npm install`.
async function stageXimgdiffSources(outDir: string): Promise<void> {
  // After collapsing js/ into the repo root this file lives at the root,
  // so its dirname IS repoRoot. (Pre-collapse it was `js/..`.)
  // `fileURLToPath` is required on Windows — `URL.pathname` returns
  // `/D:/...` (with a leading slash that Node's path layer then folds
  // into a doubled `D:\D:\...` once it's joined). `fileURLToPath`
  // returns the canonical `D:\...` form on Windows and a normal POSIX
  // path on Linux/macOS.
  const repoRoot = dirname(fileURLToPath(import.meta.url));
  const sharedOut = join(outDir, 'shared');
  await mkdir(sharedOut, { recursive: true });
  // `report/ui/dist/worker.js` is produced by `scripts/build-ui.sh v0.3.0`
  // (also run during the wasm-test CI job before this build).
  await cp(
    join(repoRoot, 'report/ui/dist/worker.js'),
    join(sharedOut, 'report-worker.js'),
  );
  await cp(
    join(repoRoot, 'template/worker_pre.js'),
    join(sharedOut, 'worker_pre.js'),
  );
}

export default defineBuildConfig({
  entries: ['./src/index.ts', './src/cli.ts', './src/worker.ts', './src/entry.ts'],
  declaration: true,
  rollup: {
    emitCJS: true,
  },
  hooks: {
    'build:done'(ctx): Promise<void> {
      return stageXimgdiffSources(ctx.options.outDir);
    },
  },
});
