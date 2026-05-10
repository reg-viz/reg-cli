// Generic WASI runner used as both the main entry worker and the rayon
// thread workers. Mode is selected via `workerData.mode` ('entry' | 'thread').
//
// Both modes share: WASI sandbox construction, wasm compile/instantiate,
// `thread-spawn` host import, printErr → live `compare` event forwarding.
//
// Entry mode owns the shared `WebAssembly.Memory`, calls `wasm_main`, and
// posts the report back as `cmd: 'complete'`. Thread mode receives memory
// from the parent and runs `wasi_thread_start(tid, startArg)`.
import fs from 'node:fs';
import { WASI, type IFs } from '@tybys/wasm-util';
import { env } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { computeWasiSandbox, filterWasiImports, readWasm } from './utils';
import { createInstanceProxy } from './proxy';
import { createPrintErrHook } from './progress';
import { type RustTraceData, type WorkerSpan } from './tracing';

type Mode = 'entry' | 'thread';
const mode: Mode = workerData.mode;

const isTracingEnabled = (): boolean =>
  env.OTEL_ENABLED === 'true' || env.JAEGER_ENABLED === 'true';

const sandbox = computeWasiSandbox(workerData.argv);

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

const wasmFile = readWasm();

const readWasmString = (
  exports: any,
  memory: WebAssembly.Memory,
  outputPtr: number,
): string => {
  const view = new DataView(memory.buffer, outputPtr);
  const len = view.getUint32(0, true);
  const bufPtr = view.getUint32(4, true);
  const bytes = new Uint8Array(memory.buffer, bufPtr, len);
  const s = new TextDecoder('utf-8').decode(bytes);
  exports.free_wasm_output(outputPtr);
  return s;
};

const makeSpanRecorder = (workerLabel: string) => {
  const workerSpans: WorkerSpan[] = [];
  const tSpan = async <T>(
    name: string,
    fn: () => Promise<T> | T,
    attributes?: WorkerSpan['attributes'],
  ): Promise<T> => {
    if (!isTracingEnabled()) return fn();
    const start_ms = Date.now();
    const r = await fn();
    workerSpans.push({
      name,
      start_ms,
      end_ms: Date.now(),
      attributes,
      worker_label: workerLabel,
    });
    return r;
  };
  return { workerSpans, tSpan };
};

const makeThreadSpawnImport =
  (memory: WebAssembly.Memory) => (startArg: number) => {
    const buf = new SharedArrayBuffer(4);
    const id = new Int32Array(buf);
    Atomics.store(id, 0, -1);
    parentPort?.postMessage({ cmd: 'thread-spawn', startArg, threadId: id, memory });
    Atomics.wait(id, 0, -1);
    return Atomics.load(id, 0);
  };

const compileAndInstantiate = async (
  memory: WebAssembly.Memory,
  tSpan: ReturnType<typeof makeSpanRecorder>['tSpan'],
  prefix: 'entry' | 'worker',
): Promise<WebAssembly.Instance> => {
  const wasm = await tSpan(`${prefix}.wasm_compile`, async () =>
    WebAssembly.compile(await wasmFile),
  );
  const wasi_snapshot_preview1 = filterWasiImports(
    wasm,
    wasi.getImportObject().wasi_snapshot_preview1,
  );
  return tSpan(`${prefix}.wasm_instantiate`, async () =>
    WebAssembly.instantiate(wasm, {
      wasi_snapshot_preview1,
      wasi: { 'thread-spawn': makeThreadSpawnImport(memory) },
      env: { memory },
    }),
  );
};

if (mode === 'entry') {
  void (async () => {
    const entry_start_ms = Date.now();
    const { workerSpans, tSpan } = makeSpanRecorder('entry');

    const memory = new WebAssembly.Memory({
      initial: 256,
      maximum: 16384,
      shared: true,
    });
    const instance = await compileAndInstantiate(memory, tSpan, 'entry');
    const exports = instance.exports as any;

    await tSpan('entry.wasi_start', async () => {
      wasi.start(instance);
    });

    if (isTracingEnabled() && typeof exports.init_tracing === 'function') {
      await tSpan('entry.init_tracing_rust', async () => {
        exports.init_tracing();
      });
    }

    const m = await tSpan('entry.wasm_main', async () => exports.wasm_main());
    const reportString = await tSpan('entry.read_report_string', async () =>
      readWasmString(exports, memory, m),
    );
    const report = JSON.parse(reportString);

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
  })();
} else {
  parentPort?.addListener(
    'message',
    async ({
      startArg,
      tid,
      memory,
    }: {
      startArg: number;
      tid: number;
      memory: WebAssembly.Memory;
    }) => {
      const workerLabel = `thread-${tid}`;
      const handler_start_ms = Date.now();
      const { workerSpans, tSpan } = makeSpanRecorder(workerLabel);

      let instance = await compileAndInstantiate(memory, tSpan, 'worker');
      instance = createInstanceProxy(instance, memory);

      await tSpan('worker.wasi_start', async () => {
        wasi.start(instance);
      });

      await tSpan(
        'worker.wasi_thread_start',
        async () => {
          // @ts-expect-error wasi_thread_start not declared on Exports
          instance.exports.wasi_thread_start(tid, startArg);
        },
        { tid },
      );

      if (isTracingEnabled()) {
        workerSpans.push({
          name: 'worker.thread_total',
          start_ms: handler_start_ms,
          end_ms: Date.now(),
          worker_label: workerLabel,
          attributes: { tid },
        });
        parentPort?.postMessage({ cmd: 'worker-spans', workerSpans });
      }
    },
  );
}
