import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { WASI, type IFs } from '@tybys/wasm-util';
import { argv, env } from 'node:process';
import { computeWasiSandbox, readWasm, resolveExtention } from './utils';
// https://github.com/toyobayashi/emnapi/blob/5ab92c706c7cd4a0a30759e58f26eedfb0ded591/packages/wasi-threads/src/wasi-threads.ts#L288-L335
import { createInstanceProxy } from './proxy';
import { createPrintErrHook } from './progress';
import { type WorkerSpan } from './tracing';

const isTracingEnabled = (): boolean =>
  env.OTEL_ENABLED === 'true' || env.JAEGER_ENABLED === 'true';

// Each rayon worker thread (Node Worker) has its own WASI instance and fd
// table, so we must narrow its sandbox too — not just the main entry one.
const sandbox = computeWasiSandbox(workerData.argv);

// Live `compare` events from rayon worker threads: Rust's `eprintln!`
// inside the per-image par_iter closure runs on whichever thread worker
// is executing that slice. Each worker has its own WASI instance, so each
// needs its own `printErr` hook to forward progress to the parent.
const printErr = createPrintErrHook((ev) => {
  parentPort?.postMessage({ cmd: 'compare-event', event: ev });
});

// Per-handler buffer. Sent to parent on completion.
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

const handler = async ({ startArg, tid, memory }: { startArg: number, tid: number, memory: WebAssembly.Memory }) => {
  const workerSpans: WorkerSpan[] = [];
  const workerLabel = `thread-${tid}`;
  const handler_start_ms = Date.now();

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

  try {
    const wasm = await tSpan('worker.wasm_compile', async () =>
      WebAssembly.compile(await file),
    );

    let instance = await tSpan('worker.wasm_instantiate', async () =>
      WebAssembly.instantiate(wasm, {
        ...imports,
        wasi: {
          'thread-spawn': (startArg: number) => {
            const threadIdBuffer = new SharedArrayBuffer(4);
            const id = new Int32Array(threadIdBuffer);
            Atomics.store(id, 0, -1);
            parentPort?.postMessage({ cmd: 'thread-spawn', startArg, threadId: id, memory });
            Atomics.wait(id, 0, -1);
            const tid = Atomics.load(id, 0);
            return tid;
          },
        },
        env: { memory },
      }),
    );

    instance = createInstanceProxy(instance, memory);

    await tSpan('worker.wasi_start', async () => {
      wasi.start(instance);
    });

    await tSpan('worker.wasi_thread_start', async () => {
      // @ts-expect-error wasi_thread_start not defined
      instance.exports.wasi_thread_start(tid, startArg);
    }, { tid });

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
  } catch (e) {
    throw e;
  }
};

parentPort?.addListener('message', handler);
