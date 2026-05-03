import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts', './src/cli.ts', './src/worker.ts', './src/entry.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  outDir: 'dist',
});
