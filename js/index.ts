import { Worker } from 'node:worker_threads';

// process.argv.slice(2)
export const start = (argv: string[]) => {
  const worker = new Worker('./entry.js', { workerData: { argv } });

  let nextTid = 1;
  const workers = [worker];

  const spawn = (startArg: number, threadId: Int32Array, memory: WebAssembly.Memory) => {
    const worker = new Worker('./worker.js');

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

  worker.on('message', ({ cmd, startArg, threadId, memory }) => {
    if (cmd === 'complete') {
      workers.forEach((w) => w.terminate());
      process.exit(0);
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
  passed: boolean,
  image: string,
};

export const compare = async (input: CompareInput): Promise<CompareOutput[]> => {
  return [];
};
