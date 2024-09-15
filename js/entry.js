const { readFile } = require('node:fs/promises');
const fs = require('node:fs');
const { WASI } = require('@tybys/wasm-util');
const { argv, env } = require('node:process');
const { join } = require('node:path');
const { parentPort } = require('node:worker_threads');

const wasi = new WASI({
  version: 'preview1',
  args: argv,
  env,
  returnOnExit: true,
  preopens: {
    './': './',
  },
  fs,
});

const imports = wasi.getImportObject();
const file = readFile(join(__dirname, './reg.wasm'));

(async () => {
  try {
    const wasm = await WebAssembly.compile(await file);
    const opts = { initial: 100, maximum: 16384, shared: true };
    const memory = new WebAssembly.Memory(opts);
    let instance = await WebAssembly.instantiate(wasm, {
      ...imports,
      wasi: {
        'thread-spawn': startArg => {
          const threadIdBuffer = new SharedArrayBuffer(4);
          const id = new Int32Array(threadIdBuffer);
          Atomics.store(id, 0, -1);
          parentPort.postMessage({
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
    parentPort.postMessage({ cmd: 'complete' });
  } catch (e) {
    throw e;
  }
})();
