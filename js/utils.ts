import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const isESM = typeof import.meta !== 'undefined';

export const readWasm = () => {
  const dir = isESM ? path.dirname(fileURLToPath(import.meta.url)) : __dirname;

  const file = readFile(join(dir, './reg.wasm'));
  return file;
};

export const resolveExtention = (): string => {
  return isESM ? 'mjs' : 'cjs';
};
