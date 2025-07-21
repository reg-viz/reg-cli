import fs from 'node:fs';
import { WASI, type IFs } from '@tybys/wasm-util';
import { env } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { readWasm } from './utils';
import { initTracing, createSpan } from './tracing';

// Initialize tracing in worker
initTracing();

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

(async () => {
  try {
    // WASM ファイル読み込み
    const wasmBytes = await createSpan('wasm-file-read', async () => {
      return await file;
    });

    // WASM コンパイル
    const wasm = await createSpan('wasm-compilation', async () => {
      return await WebAssembly.compile(wasmBytes);
    });
    
    // メモリ作成とインスタンス化
    const { instance, memory } = await createSpan('wasm-instantiation', async () => {
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

      return { instance, memory };
    });

    // WASI初期化とメイン実行
    const rawResult = await createSpan('wasm-execution', async () => {
      return await createSpan('wasi-start', async () => {
        wasi.start(instance);
        return Promise.resolve();
      }).then(() => createSpan('wasm-main-call', async () => {
        const m = (instance.exports as any).wasm_main();
        return m;
      }));
    });

    // 結果処理
    const report = await createSpan('wasm-result-processing', async () => {
      const view = new DataView(memory.buffer, rawResult);
      const len = view.getUint32(0, true);
      const bufPtr = view.getUint32(4, true);
      const stringData = new Uint8Array(memory.buffer, bufPtr, len);
      const decoder = new TextDecoder('utf-8');
      const string = decoder.decode(stringData);
      
      return await createSpan('wasm-memory-cleanup', async () => {
        (instance.exports as any).free_wasm_output(rawResult);
        const report = JSON.parse(string);
        return report;
      });
    });
    
    // 完了処理
    await createSpan('wasm-completion', async () => {
      parentPort?.postMessage({ cmd: 'complete', data: report });
      return Promise.resolve();
    });

  } catch (e) {
    await createSpan('wasm-error', async () => {
      console.error('[WASM Entry] Error:', e);
      throw e;
    });
    throw e;
  }
})();
