import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { WASI, type IFs } from '@tybys/wasm-util';
import { argv, env } from 'node:process';
import { readWasm, resolveExtention } from './utils';
// https://github.com/toyobayashi/emnapi/blob/5ab92c706c7cd4a0a30759e58f26eedfb0ded591/packages/wasi-threads/src/wasi-threads.ts#L288-L335
import { createInstanceProxy } from './proxy';

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

const handler = async ({ startArg, tid, memory }: { startArg: number, tid: number, memory: WebAssembly.Memory }) => {
  try {
    const wasm = await WebAssembly.compile(await file);
    let instance = await WebAssembly.instantiate(wasm, {
      ...imports,
      wasi: {
        'thread-spawn': (startArg: number) => {
          const threadIdBuffer = new SharedArrayBuffer(4);
          const id = new Int32Array(threadIdBuffer);
          Atomics.store(id, 0, -1);
          postMessage({ cmd: 'thread-spawn', startArg, threadId: id, memory });
          Atomics.wait(id, 0, -1);
          const tid = Atomics.load(id, 0);
          return tid;
        },
      },
      env: { memory },
    });
    instance = createInstanceProxy(instance, memory);
    wasi.start(instance);
    // @ts-expect-error wasi_thread_start not defined
    instance.exports.wasi_thread_start(tid, startArg);
  } catch (e) {
    throw e;
  }
};

parentPort?.addListener('message', handler);
