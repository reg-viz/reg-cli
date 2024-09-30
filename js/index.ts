import EventEmitter from 'node:events';
import { Worker } from 'node:worker_threads';
import { dir, resolveExtention } from './utils';
import { join } from 'node:path';

export const run = (argv: string[]): EventEmitter => {
  const emitter = new EventEmitter();
  const worker = new Worker(join(dir(), `./entry.${resolveExtention()}`), { workerData: { argv } });

  let nextTid = 1;
  const workers = [worker];

  const spawn = (startArg: number, threadId: Int32Array, memory: WebAssembly.Memory) => {
    const worker = new Worker(join(dir(), `./worker.${resolveExtention()}`));

    workers.push(worker);

    worker.on('message', ({ cmd, startArg, threadId, memory }) => {
      if (cmd === 'loaded') {
        if (typeof worker.unref === 'function') {
          worker.unref();
        }
      } else if (cmd === 'thread-spawn') {
        spawn(startArg, threadId, memory);
      }
    });

    worker.on('error', (e: Error) => {
      workers.forEach((w) => w.terminate());
      throw new Error(e.message);
    });

    const tid = nextTid++;

    if (threadId) {
      Atomics.store(threadId, 0, tid);
      Atomics.notify(threadId, 0);
    }
    worker.postMessage({ startArg, tid, memory });
    return tid;
  };

  worker.on('message', ({ cmd, startArg, threadId, memory, data }) => {
    if (cmd === 'complete') {
      workers.forEach((w) => w.terminate());
      emitter.emit('complete', data);
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
    workers.forEach((w) => w.terminate());
    throw new Error(err.message);
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

export const compare = (input: CompareInput): EventEmitter => {
  const args = Object.entries(input).flatMap(([k, v]) => [k, String(v)]);
  return run(args);
};
