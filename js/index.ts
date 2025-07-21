import EventEmitter from 'node:events';
import { Worker } from 'node:worker_threads';
import { isCJS, resolveExtention } from './utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { initTracing, createSpan, shutdownTracing } from './tracing';

// Initialize tracing on module load
initTracing();

export const dir = (): string => {
  const dir = isCJS ? __dirname : dirname(fileURLToPath(import.meta.url));
  return dir;
};

export const run = (argv: string[]): EventEmitter => {
  const emitter = new EventEmitter();
  
  // Start tracing span for the main run operation
  const runWithTracing = async () => {
    return createSpan('reg-cli-wasm-main', async () => {
      
      // 引数解析
      await createSpan('args-parsing', async () => {
        console.log(`[WASM] Parsing arguments:`, argv);
        return Promise.resolve();
      });

      // Worker初期化
      const { worker, workers } = await createSpan('worker-initialization', async () => {
        const worker = new Worker(join(dir(), `./entry.${resolveExtention()}`), { workerData: { argv } });
        const workers = [worker];
        console.log(`[WASM] Worker created at:`, new Date().toISOString());
        return { worker, workers };
      });

      let nextTid = 1;
      let firstMessageReceived = false;

      // Worker spawn 関数の定義
      const spawn = (startArg: number, threadId: Int32Array, memory: WebAssembly.Memory) => {
        createSpan('worker-spawn', async () => {
          const worker = new Worker(join(dir(), `./worker.${resolveExtention()}`), { workerData: { argv } });
          workers.push(worker);

          worker.on('message', ({ cmd, startArg, threadId, memory }) => {
            if (cmd === 'loaded') {
              if (typeof worker.unref === 'function') {
                worker.unref();
              }
            } else if (cmd === 'thread-spawn') {
              createSpan('thread-spawn-message-handling', async () => {
                console.log(`[WASM] Handling thread-spawn message at:`, new Date().toISOString());
                spawn(startArg, threadId, memory);
                return Promise.resolve();
              }).catch(() => {}); // Silently handle tracing errors
            }
          });

          worker.on('error', (e: Error) => {
            workers.forEach((w) => w.terminate());
            emitter.emit('error', e);
            throw new Error(e.message);
          });

          const tid = nextTid++;

          if (threadId) {
            Atomics.store(threadId, 0, tid);
            Atomics.notify(threadId, 0);
          }
          worker.postMessage({ startArg, tid, memory });
          return Promise.resolve(tid);
        }).catch(() => {}); // Silently handle tracing errors

        return nextTid - 1;
      };

      // メインワーカーのイベント処理
      await createSpan('worker-event-setup', async () => {
        
        // 最初のメッセージ受信時間を測定
        const measureFirstMessage = (cmd: string) => {
          if (!firstMessageReceived) {
            firstMessageReceived = true;
            console.log(`[WASM] First message '${cmd}' received at:`, new Date().toISOString());
            createSpan('first-message-received', async () => {
              return Promise.resolve({ cmd, receivedAt: new Date().toISOString() });
            }).catch(() => {});
          }
        };

        worker.on('message', ({ cmd, startArg, threadId, memory, data }) => {
          measureFirstMessage(cmd);
          
          if (cmd === 'complete') {
            createSpan('worker-completion', async () => {
              workers.forEach((w) => w.terminate());
              emitter.emit('complete', data);
              return Promise.resolve();
            }).catch(() => {});
          }

          if (cmd === 'loaded') {
            createSpan('worker-loaded', async () => {
              if (typeof worker.unref === 'function') {
                worker.unref();
              }
              return Promise.resolve();
            }).catch(() => {});
            return;
          }

          if (cmd === 'thread-spawn') {
            createSpan('main-worker-thread-spawn-handling', async () => {
              console.log(`[WASM] Main worker handling thread-spawn at:`, new Date().toISOString());
              spawn(startArg, threadId, memory);
              return Promise.resolve();
            }).catch(() => {}); // Silently handle tracing errors
          }
        });

        worker.on('error', (err: Error) => {
          createSpan('worker-error', async () => {
            workers.forEach((w) => w.terminate());
            emitter.emit('error', err);
            throw new Error(err.message);
          }).catch(() => {});
        });

        return Promise.resolve();
      });

      return new Promise<void>((resolve) => {
        emitter.once('complete', resolve);
        emitter.once('error', resolve);
      });
    });
  };

  // Execute tracing asynchronously without blocking return
  runWithTracing().catch((err) => {
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

export const compare = (input: CompareInput): EventEmitter => {
  const emitter = new EventEmitter();

  // 非同期でトレーシング処理を実行
  const executeComparison = async () => {
    try {
      await createSpan('reg-cli-wasm-compare', async () => {
        // 入力検証
        await createSpan('input-validation', async () => {
          console.log(`[WASM] Validating input:`, input);
          return Promise.resolve();
        });

        // 引数構築
        const args = await createSpan('args-construction', async () => {
          const { actualDir, expectedDir, diffDir, ...rest } = input;
          const args = [
            '--',
            actualDir,
            expectedDir,
            diffDir,
            ...Object.entries(rest).flatMap(([k, v]) => (v == null || v === '' ? [] : [`--${k}`, String(v)])),
          ];
          console.log(`[WASM] Constructed args:`, args);
          return args;
        });
        
        const runEmitter = run(args);
        
        // Add tracing spans for compare events
        runEmitter.on('complete', (data) => {
          createSpan('reg-cli-wasm-comparison-complete', async () => {
            console.log(`[WASM] Comparison completed with data:`, data);
            // Add attributes to the span
            return Promise.resolve(data);
          }).catch(() => {}); // Silently handle tracing errors
          
          emitter.emit('complete', data);
        });

        runEmitter.on('error', (err) => {
          createSpan('reg-cli-wasm-comparison-error', async () => {
            console.error(`[WASM] Comparison error:`, err);
            throw err;
          }).catch(() => {}); // Silently handle tracing errors
          
          emitter.emit('error', err);
        });

        return Promise.resolve();
      });
    } catch (err) {
      emitter.emit('error', err);
    }
  };

  // 非同期実行開始
  executeComparison().catch((err) => {
    emitter.emit('error', err);
  });

  return emitter;
};

// Export shutdown function for proper cleanup
export { shutdownTracing };
