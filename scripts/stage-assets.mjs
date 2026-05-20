#!/usr/bin/env node
// Stage runtime assets next to the tsdown output:
//   - reg.wasm                  (rust-side image diff core, loaded by readWasm())
//   - shared/report-worker.js   (browser-side -X client worker bundle —
//                                self-contained ESM with the
//                                img-block-match wasm inlined; emitted
//                                next to the HTML report by ximgdiff.ts)
//
// Lives outside tsdown.config.ts because tsdown runs the ESM and CJS builds in
// parallel and both fire `build:done`, which races on Windows (EBUSY).
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const sharedOut = join(distDir, 'shared');

await mkdir(sharedOut, { recursive: true });
await cp(join(repoRoot, 'reg.wasm'), join(distDir, 'reg.wasm'));
await cp(
  join(repoRoot, 'report/ui/dist/worker.js'),
  join(sharedOut, 'report-worker.js'),
);
