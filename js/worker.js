const { parentPort } = require('node:worker_threads');
const { readFile } = require('node:fs/promises');
const fs = require('node:fs');
const { WASI } = require('@tybys/wasm-util');
const { argv, env } = require('node:process');
const { join } = require('node:path');

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

const handler = async ({ startArg, tid, memory }) => {
  try {
    const wasm = await WebAssembly.compile(await file);
    let instance = await WebAssembly.instantiate(wasm, {
      ...imports,
      wasi: {
        'thread-spawn': startArg => {
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
    // https://github.com/toyobayashi/emnapi/blob/5ab92c706c7cd4a0a30759e58f26eedfb0ded591/packages/wasi-threads/src/wasi-threads.ts#L288-L335
    const { createInstanceProxy } = require('./proxy.js');
    instance = createInstanceProxy(instance, memory);
    wasi.start(instance);
    try {
      const symbols = Object.getOwnPropertySymbols(wasi);
      const selectDescription = description => s => {
        if (s.description) {
          return s.description === description;
        }
        return s.toString() === `Symbol(${description})`;
      };
      if (Array.isArray(description)) {
        return description.map(d => symbols.filter(selectDescription(d))[0]);
      }
      const kStarted = symbols.filter(selectDescription('kStarted'))[0];
      wasi[kStarted] = false;
    } catch (_) {}
    instance.exports.wasi_thread_start(tid, startArg);
  } catch (e) {
    throw e;
  }
};

parentPort.addListener('message', handler);
