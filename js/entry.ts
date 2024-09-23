import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { WASI, type IFs } from '@tybys/wasm-util';
import { env } from 'node:process';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

const wasi = new WASI({
  version: 'preview1',
  args: workerData.argv,
  env: env as Record<string, string>,
  returnOnExit: true,
  preopens: { './': './' },
  fs: fs as IFs,
});

const imports = wasi.getImportObject();
const file = readFile(join(__dirname, './reg.wasm'));

(async () => {
  try {
    const wasm = await WebAssembly.compile(await file);
    const opts = { initial: 256, maximum: 16384, shared: true };
    const memory = new WebAssembly.Memory(opts);
    let instance = await WebAssembly.instantiate(wasm, {
      ...imports,
      wasi: {
        'thread-spawn': (startArg: number) => {
          const threadIdBuffer = new SharedArrayBuffer(4);
          const id = new Int32Array(threadIdBuffer);
          Atomics.store(id, 0, -1);
          parentPort?.postMessage({
            cmd: 'thread-spawn',
            startArg,
            threadId: id,
            memory,
          });
          Atomics.wait(id, 0, -1);
          const tid = Atomics.load(id, 0);
          return tid;
        },
      },
      env: { memory },
    });
    wasi.start(instance);
    parentPort?.postMessage({ cmd: 'complete' });
  } catch (e) {
    throw e;
  }
})();
