import EventEmitter from 'node:events';
import { Worker } from 'node:worker_threads';
import { isCJS, resolveExtention } from './utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import {
  initTracing,
  shutdownTracing,
  processRustTraceData,
  processWorkerSpans,
  isTracingEnabled,
  startRootSpan,
  endRootSpan,
  type RustTraceData,
  type WorkerSpan,
} from './tracing';

export const dir = (): string => {
  const dir = isCJS ? __dirname : dirname(fileURLToPath(import.meta.url));
  return dir;
};

// Record a span in the main process' WorkerSpan format for later conversion.
const mainSpans: WorkerSpan[] = [];
const recordMainSpan = (name: string, start_ms: number, attributes?: WorkerSpan['attributes']) => {
  if (!isTracingEnabled()) return;
  mainSpans.push({ name, start_ms, end_ms: Date.now(), attributes, worker_label: 'main' });
};

export const run = (argv: string[]): EventEmitter => {
  const run_start_ms = Date.now();

  // Initialize tracing if enabled (may be ~tens of ms on first run).
  const t_init = Date.now();
  if (isTracingEnabled()) {
    initTracing();
    recordMainSpan('main.init_tracing', t_init);
  }

  // Start root span for the entire operation
  const traceContext = isTracingEnabled() ? startRootSpan('reg-cli') : null;

  const emitter = new EventEmitter();

  // Classic reg-cli fires a 'start' event on the next tick of the run so
  // subscribers (e.g. spinners) can latch on. Mirror that behaviour.
  setImmediate(() => emitter.emit('start'));

  const t_new_entry = Date.now();
  const worker = new Worker(join(dir(), `./entry.${resolveExtention()}`), { workerData: { argv } });
  recordMainSpan('main.new_entry_worker', t_new_entry);

  let nextTid = 1;
  const workers = [worker];
  const threadWorkerSpans: WorkerSpan[] = [];

  const spawn = (startArg: number, threadId: Int32Array, memory: WebAssembly.Memory) => {
    const t_new_worker = Date.now();
    const worker = new Worker(join(dir(), `./worker.${resolveExtention()}`), { workerData: { argv } });
    const tid = nextTid++;
    recordMainSpan('main.new_thread_worker', t_new_worker, { tid });

    workers.push(worker);

    worker.on('message', (msg) => {
      const { cmd } = msg;
      if (cmd === 'loaded') {
        if (typeof worker.unref === 'function') {
          worker.unref();
        }
      } else if (cmd === 'thread-spawn') {
        spawn(msg.startArg, msg.threadId, msg.memory);
      } else if (cmd === 'worker-spans') {
        if (Array.isArray(msg.workerSpans)) {
          threadWorkerSpans.push(...msg.workerSpans);
        }
      }
    });

    worker.on('error', (e: Error) => {
      workers.forEach((w) => w.terminate());
      // Forward as an `error` event on the parent emitter so callers can
      // `emitter.on('error', ...)` instead of wrapping in a global handler.
      // (Parity with classic reg-cli's EventEmitter surface.)
      emitter.emit('error', e);
    });

    if (threadId) {
      Atomics.store(threadId, 0, tid);
      Atomics.notify(threadId, 0);
    }
    worker.postMessage({ startArg, tid, memory });
    return tid;
  };

  worker.on('message', async ({ cmd, startArg, threadId, memory, data, traceData, workerSpans }) => {
    if (cmd === 'complete') {
      const t_post_complete = Date.now();

      // Process JS worker spans (entry.ts + thread workers)
      if (isTracingEnabled()) {
        if (Array.isArray(workerSpans)) {
          processWorkerSpans(workerSpans as WorkerSpan[], 'entry');
        }
        if (threadWorkerSpans.length) {
          processWorkerSpans(threadWorkerSpans, 'thread');
        }
        // Process trace data from Rust/WASM if available
        if (traceData) {
          processRustTraceData(traceData as RustTraceData);
        }
        // Record wall-clock around processing
        recordMainSpan('main.process_trace_and_spans', t_post_complete);
        // Also record total time
        mainSpans.push({
          name: 'main.run_total',
          start_ms: run_start_ms,
          end_ms: Date.now(),
          worker_label: 'main',
        });
        processWorkerSpans(mainSpans, 'main');
        // End root span after processing spans
        endRootSpan(true);
        // Wait for traces to be exported before shutting down
        await shutdownTracing();
      }

      workers.forEach((w) => w.terminate());

      // Synthesise per-file `compare` events from the final report so that
      // classic reg-cli subscribers (`emitter.on('compare', ...)`) keep
      // working. We don't have live per-image timing from the Wasm side
      // (the diff runs as one batch inside Rust's rayon pool), so fire them
      // all before `complete`.
      if (data && typeof data === 'object') {
        for (const path of data.passedItems ?? [])
          emitter.emit('compare', { type: 'pass', path });
        for (const path of data.newItems ?? [])
          emitter.emit('compare', { type: 'new', path });
        for (const path of data.deletedItems ?? [])
          emitter.emit('compare', { type: 'delete', path });
        for (const path of data.failedItems ?? [])
          emitter.emit('compare', { type: 'fail', path });
      }

      // Emit complete and ensure we don't exit before traces are sent
      emitter.emit('complete', data);
      return; // Prevent further processing
    }

    if (cmd === 'loaded') {
      if (typeof worker.unref === 'function') {
        worker.unref();
      }
      return;
    }

    if (cmd === 'thread-spawn') {
      spawn(startArg, threadId, memory);
    }
  });

  worker.on('error', (err: Error) => {
    if (traceContext) {
      endRootSpan(false);
    }
    workers.forEach((w) => w.terminate());
    emitter.emit('error', err);
  });

  return emitter;
};

export type CompareInput = {
  actualDir: string,
  expectedDir: string,
  diffDir: string,
  report?: string,
  junitReport?: string,
  json?: string,
  update?: boolean,
  extendedErrors?: boolean,
  urlPrefix?: string,
  matchingThreshold?: number,
  threshold?: number, // alias to thresholdRate.
  thresholdRate?: number,
  thresholdPixel?: number,
  concurrency?: number,
  enableAntialias?: boolean,
  enableClientAdditionalDetection?: boolean,
};

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

/** Flags that `compare()` handles itself in JS; they are NOT forwarded to
 *  the Wasm binary (which doesn't understand them). */
const CLI_ONLY_KEYS = new Set<keyof CompareInput>([
  'update',
  'junitReport',
  'extendedErrors', // meta for exit codes only — Wasm doesn't care
]);

export const compare = (input: CompareInput): EventEmitter => {
  const { actualDir, expectedDir, diffDir, threshold, update, junitReport, ...rest } = input;

  // Translate `threshold` → `thresholdRate` (classic's alias).
  if (threshold != null && rest.thresholdRate == null) {
    rest.thresholdRate = threshold;
  }

  // Strip CLI-only entries before forwarding.
  for (const k of CLI_ONLY_KEYS) {
    delete (rest as Record<string, unknown>)[k];
  }

  const args = [
    '--',
    actualDir,
    expectedDir,
    diffDir,
    ...Object.entries(rest).flatMap(([k, v]) => (v == null || v === '' ? [] : [`--${k}`, String(v)])),
  ];
  const inner = run(args);

  // If the caller supplied `update: true` or `junitReport`, we need to do
  // those side effects AFTER the Wasm run completes but BEFORE emitting
  // `complete` to the caller — so their handler can observe the final state
  // on disk. Wrap the inner emitter with one that interposes on `complete`.
  if (!update && !junitReport) {
    return inner;
  }

  const outer = new EventEmitter();
  inner.on('start', () => outer.emit('start'));
  inner.on('compare', (p) => outer.emit('compare', p));
  inner.on('error', (e) => outer.emit('error', e));
  inner.on('complete', async (data: CompareOutput) => {
    try {
      if (junitReport) {
        const { writeJunit } = await import('./junit');
        await writeJunit(junitReport, data);
      }
      if (update) {
        await updateExpected(actualDir, expectedDir, data.actualItems ?? []);
        outer.emit('update');
      }
    } catch (e) {
      outer.emit('error', e);
      return;
    }
    outer.emit('complete', data);
  });

  return outer;
};

async function updateExpected(
  actualDir: string,
  expectedDir: string,
  images: string[],
): Promise<void> {
  const { mkdir, copyFile } = await import('node:fs/promises');
  const { dirname, join } = await import('node:path');
  for (const img of images) {
    const src = join(actualDir, img);
    const dst = join(expectedDir, img);
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
  }
}
