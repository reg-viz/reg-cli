import { defineConfig } from 'tsdown';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser-side worker sources that `ximgdiff.ts` concatenates at runtime
// when `-X client` is used. Staged into dist/shared/ so the published
// package carries them without running any UI build on `npm install`.
async function stageXimgdiffSources(outDir: string): Promise<void> {
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

export default defineConfig({
  entry: ['./src/index.ts', './src/cli.ts', './src/worker.ts', './src/entry.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  outDir: 'dist',
  hooks: {
    'build:done'(ctx) {
      return stageXimgdiffSources(ctx.options.outDir ?? 'dist');
    },
  },
});
