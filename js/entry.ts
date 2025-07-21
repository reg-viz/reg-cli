import fs from 'node:fs';
import { WASI, type IFs } from '@tybys/wasm-util';
import { env } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { readWasm } from './utils';
import { initTracing, createSpan } from './tracing';

console.log(`[WASM Entry] Worker started at:`, new Date().toISOString());

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

(async () => {
  try {
    // Initialize tracing in worker
    await createSpan('entry-tracing-init', async () => {
      initTracing();
      return Promise.resolve();
    });

    // WASI初期化
    const wasi = await createSpan('wasi-initialization', async () => {
      console.log(`[WASM Entry] Initializing WASI at:`, new Date().toISOString());
      return new WASI({
        version: 'preview1',
        args: workerData.argv,
        env: env as Record<string, string>,
        returnOnExit: true,
        preopens: { './': './' },
        fs: fs as IFs,
      });
    });

    // Imports作成
    const imports = await createSpan('wasi-imports-creation', async () => {
      console.log(`[WASM Entry] Creating WASI imports at:`, new Date().toISOString());
      return wasi.getImportObject();
    });

    // WASMファイル準備
    const file = await createSpan('wasm-file-preparation', async () => {
      console.log(`[WASM Entry] Preparing WASM file at:`, new Date().toISOString());
      return readWasm();
    });

    // 引数の詳細表示
    console.log(`[WASM Entry] Arguments:`, workerData.argv);
    console.log(`[WASM Entry] Starting main execution at:`, new Date().toISOString());

    // WASM ファイル読み込み
    const wasmBytes = await createSpan('wasm-file-read', async () => {
      console.log(`[WASM Entry] Reading WASM bytes at:`, new Date().toISOString());
      const bytes = await file;
      console.log(`[WASM Entry] WASM bytes loaded, size:`, bytes.byteLength, 'bytes');
      console.log(`[WASM Entry] WASM file size: ${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB`);
      return bytes;
    });

    // WASM コンパイル
    const wasm = await createSpan('wasm-compilation', async () => {
      console.log(`[WASM Entry] Starting WASM compilation at:`, new Date().toISOString());
      const compiled = await WebAssembly.compile(wasmBytes);
      console.log(`[WASM Entry] WASM compilation completed at:`, new Date().toISOString());
      return compiled;
    });
    
    // メモリ作成とインスタンス化
    const { instance, memory } = await createSpan('wasm-instantiation', async () => {
      console.log(`[WASM Entry] Starting WASM instantiation at:`, new Date().toISOString());
      
      const opts = { initial: 256, maximum: 16384, shared: true };
      const memory = new WebAssembly.Memory(opts);
      console.log(`[WASM Entry] Memory created at:`, new Date().toISOString());
      
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

      console.log(`[WASM Entry] WASM instantiation completed at:`, new Date().toISOString());
      return { instance, memory };
    });

    // WASI初期化とメイン実行
    const rawResult = await createSpan('wasm-execution', async () => {
      
      // WASI開始処理
      await createSpan('wasi-start', async () => {
        console.log(`[WASM Entry] Starting WASI at:`, new Date().toISOString());
        wasi.start(instance);
        console.log(`[WASM Entry] WASI started at:`, new Date().toISOString());
        return Promise.resolve();
      });

      // WASM メイン関数呼び出しをより詳細に分割
      return await createSpan('wasm-main-call', async () => {
        console.log(`[WASM Entry] Calling WASM main at:`, new Date().toISOString());
        
        // パフォーマンス測定開始
        const startTime = performance.now();
        
        // WASM関数呼び出し前の準備
        await createSpan('wasm-pre-execution', async () => {
          console.log(`[WASM Entry] WASM pre-execution setup at:`, new Date().toISOString());
          return Promise.resolve();
        });

        // 実際のWASM関数呼び出し
        const wasmResult = await createSpan('wasm-core-execution', async () => {
          console.log(`[WASM Entry] Starting WASM core execution at:`, new Date().toISOString());
          
          // Rust処理の推測される段階を測定
          const stages = {
            start: performance.now(),
            findImages: 0,
            threadPool: 0,
            parallelProcessing: 0,
            reportGeneration: 0,
            end: 0
          };
          
          console.log(`[WASM Entry] Expected Rust stages:`);
          console.log(`[WASM Entry] 1. find_images() - File discovery with glob patterns`);
          console.log(`[WASM Entry] 2. ThreadPoolBuilder - Create thread pool`);
          console.log(`[WASM Entry] 3. Parallel processing - Image comparison`);
          console.log(`[WASM Entry] 4. Report generation - Create JSON report`);
          
          // WASM関数は同期的だが、Promise.resolveでラップ
          const result = (instance.exports as any).wasm_main();
          
          stages.end = performance.now();
          const totalTime = stages.end - stages.start;
          
          console.log(`[WASM Entry] WASM core execution completed at:`, new Date().toISOString());
          console.log(`[WASM Entry] Total WASM execution time: ${totalTime.toFixed(2)}ms`);
          console.log(`[WASM Entry] This includes:`);
          console.log(`[WASM Entry] - find_images() glob processing`);
          console.log(`[WASM Entry] - ThreadPoolBuilder::new().build()`);
          console.log(`[WASM Entry] - pool.install() parallel execution`);
          console.log(`[WASM Entry] - Report generation`);
          
          return Promise.resolve(result);
        });

        // パフォーマンス測定終了  
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        await createSpan('wasm-post-execution', async () => {
          console.log(`[WASM Entry] WASM execution time: ${executionTime.toFixed(2)}ms`);
          console.log(`[WASM Entry] WASM post-execution at:`, new Date().toISOString());
          return Promise.resolve();
        });

        console.log(`[WASM Entry] WASM main completed at:`, new Date().toISOString());
        return wasmResult;
      });
    });

    // 結果処理
    const report = await createSpan('wasm-result-processing', async () => {
      console.log(`[WASM Entry] Processing results at:`, new Date().toISOString());
      const view = new DataView(memory.buffer, rawResult);
      const len = view.getUint32(0, true);
      const bufPtr = view.getUint32(4, true);
      const stringData = new Uint8Array(memory.buffer, bufPtr, len);
      const decoder = new TextDecoder('utf-8');
      const string = decoder.decode(stringData);
      
      return await createSpan('wasm-memory-cleanup', async () => {
        (instance.exports as any).free_wasm_output(rawResult);
        const report = JSON.parse(string);
        console.log(`[WASM Entry] Results processed at:`, new Date().toISOString());
        return report;
      });
    });
    
    // 完了処理
    await createSpan('wasm-completion', async () => {
      console.log(`[WASM Entry] Sending completion message at:`, new Date().toISOString());
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
