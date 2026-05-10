import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts', './src/cli.ts', './src/runner.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  outDir: 'dist',
});
