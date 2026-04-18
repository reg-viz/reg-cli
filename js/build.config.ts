import { defineBuildConfig } from 'unbuild';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Browser-side worker sources that `ximgdiff.ts` concatenates at runtime
// when `-X client` is used. We stage them into dist/shared/ during build
// so the published package carries them without running any UI build on
// `npm install`.
async function stageXimgdiffSources(outDir: string): Promise<void> {
  const here = dirname(new URL(import.meta.url).pathname);
  const repoRoot = resolve(here, '..');
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
  entries: ['./index.ts', './cli.ts', './worker.ts', './entry.ts'],
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
