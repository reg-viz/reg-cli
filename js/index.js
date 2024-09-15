const { Worker } = require('node:worker_threads');

const worker = new Worker('./entry.js');

let nextTid = 1;
const workers = [worker];

const spawn = (startArg, threadId, memory) => {
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

  worker.on('error', e => {
    workers.forEach(w => w.terminate());
    throw new Error(e);
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
    workers.forEach(w => w.terminate());
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

worker.on('error', err => {
  workers.forEach(w => w.terminate());
  throw new Error(err);
});
