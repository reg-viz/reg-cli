import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const isCJS = typeof __dirname !== 'undefined';

export const dir = (): string => {
  const dir = isCJS ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  return dir;
};

export const readWasm = () => {
  const file = readFile(join(dir(), './reg.wasm'));
  return file;
};

export const resolveExtention = (): string => {
  return isCJS ? 'cjs' : 'mjs';
};
