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
      } else if (cmd === 'compare-event') {
        // Rayon thread workers forward tagged progress lines here.
        if (msg.event) emitter.emit('compare', msg.event);
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

  worker.on('message', async ({ cmd, startArg, threadId, memory, data, traceData, workerSpans, event }) => {
    if (cmd === 'compare-event') {
      // The main entry worker (`entry.ts`) forwards events from any
      // non-threaded progress (e.g. `find_images` emitting new/delete
      // up front). Rayon thread workers' events are handled in `spawn()`.
      if (event) emitter.emit('compare', event);
      return;
    }
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

      // Per-file `compare` events now fire live from Rust's diff loop via
      // the `progress.ts` stderr event channel (see `createPrintErrHook`),
      // matching classic reg-cli's `ProcessAdaptor` behaviour. No need to
      // replay them here.

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
  /** Re-render HTML from an existing reg.json (classic `-F/--from`). */
  from?: string,
  /** "none" (default) | "client" — enable the report's browser-side
   *  second-pass detector (classic `-X/--additionalDetection`). */
  additionalDetection?: 'none' | 'client',
  update?: boolean,
  extendedErrors?: boolean,
  /** Classic reg-cli's `-I/--ignoreChange` — governs the CLI's exit code
   *  only. Accepted and silently dropped by `compare()` for drop-in
   *  compat with reg-suit's `processor.ts:107`. */
  ignoreChange?: boolean,
  urlPrefix?: string,
  matchingThreshold?: number,
  threshold?: number, // alias to thresholdRate.
  thresholdRate?: number,
  thresholdPixel?: number,
  concurrency?: number,
  enableAntialias?: boolean,
  enableClientAdditionalDetection?: boolean,
  /** Classic reg-cli's CLI-side x-img-diff extra detection pass. The
   *  Wasm pipeline's diff already includes the equivalent classification,
   *  so this is a no-op but accepted for drop-in compat with reg-suit's
   *  `processor.ts:114`. */
  enableCliAdditionalDetection?: boolean,
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
 *  the Wasm binary. `extendedErrors` WAS here but now also feeds the
 *  Rust-side junit generator, so it's forwarded below via KEY_REMAP.
 *
 *  `ignoreChange` and `enableCliAdditionalDetection` are stripped because
 *  reg-suit unconditionally passes them (see
 *  reg-viz/reg-suit `packages/reg-suit-core/src/processor.ts` `compare({…})`)
 *  and the Rust clap layer doesn't recognise them — forwarding would abort
 *  the binary with "unexpected argument". Semantically both are no-ops at
 *  the library-event layer:
 *    - `ignoreChange` only governs classic reg-cli's process exit code;
 *      the EventEmitter surface never needed it.
 *    - `enableCliAdditionalDetection` was classic's flag for running an
 *      extra CLI-side x-img-diff pass; the Wasm port's diff pipeline
 *      already produces the final pass/fail classification, so toggling
 *      it changes nothing. (The *client*-side variant is handled via
 *      `additionalDetection: 'client'` / the legacy
 *      `enableClientAdditionalDetection: true` alias further down.) */
const CLI_ONLY_KEYS = new Set<keyof CompareInput | string>([
  'update',
  'ignoreChange',
  'enableCliAdditionalDetection',
]);

/** Library option names that must be forwarded to the Wasm binary under a
 *  different flag name (Rust uses `--junit`, callers pass `junitReport`). */
const KEY_REMAP: Record<string, string> = {
  junitReport: 'junit',
};

export const compare = (input: CompareInput): EventEmitter => {
  const { actualDir, expectedDir, diffDir, threshold, update, ...rest } = input;

  // Default `diffFormat` to png so the JSON/HTML report refers to `*.png`
  // files — matching classic reg-cli's output and letting downstream
  // tooling (reg-notify-* / reg-suit) keep working.
  if ((rest as Record<string, unknown>).diffFormat == null) {
    (rest as Record<string, unknown>).diffFormat = 'png';
  }

  // Default `json` to './reg.json' so callers that don't care still get
  // the persisted report.
  if (rest.json == null) {
    rest.json = './reg.json';
  }

  // Translate `threshold` → `thresholdRate` (classic's alias).
  if (threshold != null && rest.thresholdRate == null) {
    rest.thresholdRate = threshold;
  }

  // Translate the historical boolean `enableClientAdditionalDetection` to the
  // new `additionalDetection: "client"` form that the Rust CLI understands.
  const restAny = rest as Record<string, unknown>;
  if (restAny.enableClientAdditionalDetection && restAny.additionalDetection == null) {
    restAny.additionalDetection = 'client';
  }
  delete restAny.enableClientAdditionalDetection;

  // Strip CLI-only entries before forwarding.
  for (const k of CLI_ONLY_KEYS) {
    delete (rest as Record<string, unknown>)[k];
  }

  const args = [
    '--',
    actualDir,
    expectedDir,
    diffDir,
    ...Object.entries(rest).flatMap(([k, v]) => {
      if (v == null || v === '') return [];
      const flag = KEY_REMAP[k] ?? k;
      return [`--${flag}`, String(v)];
    }),
  ];
  const inner = run(args);

  // reg.json + junit.xml are written by the Rust/Wasm side. We only handle
  // the side-effecting bits here that need host fs access beyond the WASI
  // preopen: `update` (cross-dir copy) and the `-X client` worker/wasm
  // assets (classic puts them next to the HTML report).
  const outer = new EventEmitter();
  inner.on('start', () => outer.emit('start'));
  inner.on('compare', (p) => outer.emit('compare', p));
  inner.on('error', (e) => outer.emit('error', e));
  inner.on('complete', async (data: CompareOutput) => {
    try {
      if (restAny.additionalDetection === 'client' && typeof input.report === 'string') {
        // Lazy-load so the ximgdiff helper (pulls in x-img-diff-js + fs
        // reads of the worker_pre.js/report-worker.js shared assets) isn't
        // in `compare()`'s hot path for users who never enable `-X client`.
        const { writeXimgdiffAssets } = await import('./ximgdiff');
        await writeXimgdiffAssets({
          reportPath: input.report,
          urlPrefix: typeof input.urlPrefix === 'string' ? input.urlPrefix : '',
          // `dir()` returns the published `dist/` directory regardless of
          // which chunk unbuild places this call into, because `dir()` is
          // defined in a module that always inlines into the entry.
          distDir: dir(),
        });
      }
      if (update) {
        await updateExpected(actualDir, expectedDir, {
          newItems: data.newItems ?? [],
          failedItems: data.failedItems ?? [],
          deletedItems: data.deletedItems ?? [],
        });
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

export async function writeRegJson(path: string, data: CompareOutput): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// Match classic reg-cli's `-U` semantics (see src/index.js:134-146 and the
// same function in cli.ts for context): prune deleted+failed baselines from
// `expectedDir`, then copy new+failed from `actualDir`. Passed items are
// left alone so their mtime and git status don't churn.
async function updateExpected(
  actualDir: string,
  expectedDir: string,
  items: {
    newItems: string[];
    failedItems: string[];
    deletedItems: string[];
  },
): Promise<void> {
  const { mkdir, copyFile, rm } = await import('node:fs/promises');
  const { dirname, join } = await import('node:path');
  const toRemove = [...items.deletedItems, ...items.failedItems];
  for (const img of toRemove) {
    await rm(join(expectedDir, img), { force: true });
  }
  const toCopy = [...items.newItems, ...items.failedItems];
  for (const img of toCopy) {
    const src = join(actualDir, img);
    const dst = join(expectedDir, img);
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
  }
}
