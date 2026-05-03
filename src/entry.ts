import fs from 'node:fs';
import { WASI, type IFs } from '@tybys/wasm-util';
import { env } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { computeWasiSandbox, readWasm } from './utils';
import { createPrintErrHook } from './progress';
import { type RustTraceData, type WorkerSpan } from './tracing';

// Check if tracing is enabled via environment variable
const isTracingEnabled = (): boolean => {
  return env.OTEL_ENABLED === 'true' || env.JAEGER_ENABLED === 'true';
};

// Collect timing spans on the worker side to be sent back with 'complete'.
const workerSpans: WorkerSpan[] = [];
const tSpan = async <T>(
  name: string,
  fn: () => Promise<T> | T,
  attributes?: WorkerSpan['attributes'],
): Promise<T> => {
  if (!isTracingEnabled()) return fn();
  const start_ms = Date.now();
  const result = await fn();
  workerSpans.push({
    name,
    start_ms,
    end_ms: Date.now(),
    attributes,
    worker_label: 'entry',
  });
  return result;
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

// Build the narrowest WASI sandbox this run needs. See `computeWasiSandbox`
// in utils.ts for the policy.
const sandbox = computeWasiSandbox(workerData.argv);

// Live `compare` events: Rust emits tagged stderr lines as each image
// finishes diffing (or is detected as new/deleted). Forward them to the
// main process so `EventEmitter#emit('compare', …)` can fire live instead
// of batched-post-complete.
const printErr = createPrintErrHook((ev) => {
  parentPort?.postMessage({ cmd: 'compare-event', event: ev });
});

const wasi = new WASI({
  version: 'preview1',
  args: workerData.argv,
  env: sandbox.env,
  returnOnExit: true,
  preopens: sandbox.preopens,
  fs: fs as IFs,
  printErr,
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
    const entry_start_ms = Date.now();

    const wasm = await tSpan(
      'entry.wasm_compile',
      async () => WebAssembly.compile(await file),
    );

    const opts = { initial: 256, maximum: 16384, shared: true };
    const memory = new WebAssembly.Memory(opts);

    let instance = await tSpan('entry.wasm_instantiate', async () =>
      WebAssembly.instantiate(wasm, {
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
      }),
    );

    const exports = instance.exports as any;

    await tSpan('entry.wasi_start', async () => {
      wasi.start(instance);
    });

    // Initialize tracing in WASM if enabled
    if (isTracingEnabled() && typeof exports.init_tracing === 'function') {
      await tSpan('entry.init_tracing_rust', async () => {
        exports.init_tracing();
      });
    }

    // Run the main WASM function
    const m = await tSpan('entry.wasm_main', async () => exports.wasm_main());
    const reportString = await tSpan('entry.read_report_string', async () =>
      readWasmString(exports, memory, m),
    );
    const report = JSON.parse(reportString);

    // Get trace data from WASM if tracing is enabled
    let traceData: RustTraceData | null = null;
    if (isTracingEnabled() && typeof exports.get_trace_data === 'function') {
      await tSpan('entry.collect_rust_traces', async () => {
        const tracePtr = exports.get_trace_data();
        const traceJson = readWasmString(exports, memory, tracePtr);
        try {
          traceData = JSON.parse(traceJson) as RustTraceData;
        } catch (e) {
          console.error('[Tracing] Failed to parse trace data:', e);
        }

        if (typeof exports.clear_trace_data === 'function') {
          exports.clear_trace_data();
        }
      });
    }

    // Overall span for this main worker
    if (isTracingEnabled()) {
      workerSpans.push({
        name: 'entry.worker_total',
        start_ms: entry_start_ms,
        end_ms: Date.now(),
        worker_label: 'entry',
      });
    }

    parentPort?.postMessage({
      cmd: 'complete',
      data: report,
      traceData,
      workerSpans,
    });
  } catch (e) {
    throw e;
  }
})();

