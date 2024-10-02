import fs from 'node:fs';
import { WASI, type IFs } from '@tybys/wasm-util';
import { env } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { readWasm } from './utils';

export type CompareOutput = {
  failedItems: string[],
  newItems: string[],
  deletedItems: string[],
  passedItems: string[],
  expectedItems: string[],
  actualItems: string[],
  diffItems: string[],
  actualDir: string,
  expectedDir: string,
  diffDir: string,
};

console.log(workerData.argv, 'arg')

const wasi = new WASI({
  version: 'preview1',
  args: workerData.argv,
  env: env as Record<string, string>,
  returnOnExit: true,
  preopens: { './': './' },
  fs: fs as IFs,
});

const imports = wasi.getImportObject();
const file = readWasm();

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

    const m = (instance.exports as any).wasm_main();
    const view = new DataView(memory.buffer, m);
    const len = view.getUint32(0, true);
    const bufPtr = view.getUint32(4, true);
    const stringData = new Uint8Array(memory.buffer, bufPtr, len);
    const decoder = new TextDecoder('utf-8');
    const string = decoder.decode(stringData);
    (instance.exports as any).free_wasm_output(m);
    const report = JSON.parse(string);
    
    console.log(report);

    parentPort?.postMessage({ cmd: 'complete', data: report });
  } catch (e) {
    throw e;
  }
})();
