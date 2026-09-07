import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/cli.ts',
    './src/runner.ts',
    './src/wasm-memory.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  outDir: 'dist',
  deps: {
    alwaysBundle: ['@tybys/wasm-util'],
  },
});
