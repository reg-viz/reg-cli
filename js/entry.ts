import fs from 'node:fs';
import { WASI, type IFs } from '@tybys/wasm-util';
import { env } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { readWasm } from './utils';
import { type RustTraceData } from './tracing';

// Check if tracing is enabled via environment variable
const isTracingEnabled = (): boolean => {
  return env.OTEL_ENABLED === 'true' || env.JAEGER_ENABLED === 'true';
};

export type CompareOutput = {
  failedItems: string[];
  newItems: string[];
  deletedItems: string[];
  passedItems: string[];
  expectedItems: string[];
  actualItems: string[];
  diffItems: string[];
  actualDir: string;
  expectedDir: string;
  diffDir: string;
};

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

/**
 * Read a string from WASM memory using WasmOutput structure
 */
const readWasmString = (
  exports: any,
  memory: WebAssembly.Memory,
  outputPtr: number,
): string => {
  const view = new DataView(memory.buffer, outputPtr);
  const len = view.getUint32(0, true);
  const bufPtr = view.getUint32(4, true);
  const stringData = new Uint8Array(memory.buffer, bufPtr, len);
  const decoder = new TextDecoder('utf-8');
  const str = decoder.decode(stringData);
  exports.free_wasm_output(outputPtr);
  return str;
};

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

    const exports = instance.exports as any;

    wasi.start(instance);

    // Initialize tracing in WASM if enabled
    if (isTracingEnabled() && typeof exports.init_tracing === 'function') {
      exports.init_tracing();
    }

    // Run the main WASM function
    const m = exports.wasm_main();
    const reportString = readWasmString(exports, memory, m);
    const report = JSON.parse(reportString);

    // Get trace data from WASM if tracing is enabled
    let traceData: RustTraceData | null = null;
    if (isTracingEnabled() && typeof exports.get_trace_data === 'function') {
      const tracePtr = exports.get_trace_data();
      const traceJson = readWasmString(exports, memory, tracePtr);
      try {
        traceData = JSON.parse(traceJson) as RustTraceData;
      } catch (e) {
        console.error('[Tracing] Failed to parse trace data:', e);
      }

      // Clear trace data in WASM
      if (typeof exports.clear_trace_data === 'function') {
        exports.clear_trace_data();
      }
    }

    parentPort?.postMessage({ cmd: 'complete', data: report, traceData });
  } catch (e) {
    throw e;
  }
})();

