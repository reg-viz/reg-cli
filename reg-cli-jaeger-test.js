// reg-cli Jaegerトレーシングテスト
process.env.JAEGER_ENABLED = 'true';

// reg-cliを直接require
const regCliMain = require('./dist/index.js');

console.log('='.repeat(50));
console.log('reg-cli Jaeger Tracing Test (Direct Mode)');
console.log('='.repeat(50));
console.log('Jaeger UI: http://localhost:16686');

async function runTest() {
  try {
    console.log('[Test] Starting reg-cli with concurrency: 0 (direct mode)...');
    
    const emitter = regCliMain({
      actualDir: './sample/actual',
      expectedDir: './sample/expected',
      diffDir: './sample/diff',
      concurrency: 0 // IPCを使わず直接実行
    });

    // Promiseでwrap
    const result = await new Promise((resolve, reject) => {
      let hasStarted = false;
      
      emitter.on('start', () => {
        console.log('[Test] reg-cli process started');
        hasStarted = true;
      });

      emitter.on('compare', (data) => {
        console.log(`[Test] Compare: ${data.type} - ${data.path}`);
      });

      emitter.on('complete', (result) => {
        console.log('[Test] reg-cli completed successfully');
        resolve(result);
      });

      emitter.on('error', (err) => {
        console.error('[Test] reg-cli error:', err.message);
        reject(err);
      });

      // タイムアウト対策
      setTimeout(() => {
        if (!hasStarted) {
          reject(new Error('reg-cli did not start within timeout'));
        }
      }, 10000);
    });

    console.log('[Test] reg-cli result:', result);
    console.log('[Test] Waiting for traces to be exported...');
    
    // さらに長い時間待つ
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (regCliMain.shutdownTracing) {
      console.log('[Test] Shutting down tracing...');
      await regCliMain.shutdownTracing();
      console.log('[Test] Tracing shutdown completed');
    }

    console.log('='.repeat(50));
    console.log('Check Jaeger UI at: http://localhost:16686');
    console.log('Expected service name: reg-cli');
    console.log('Expected spans:');
    console.log('- reg-cli-main');
    console.log('- find-images');
    console.log('- findImages');
    console.log('- find-expected-images');
    console.log('- find-actual-images');
    console.log('- calculate-differences');
    console.log('- create-directories');
    console.log('- compareImages');
    console.log('- createDiff-sample.png');
    console.log('- aggregate-results');
    console.log('- createReport');
    console.log('- process-results');
    console.log('='.repeat(50));
    
    process.exit(0);
    
  } catch (error) {
    console.error('[Test] Test failed:', error);
    
    if (regCliMain.shutdownTracing) {
      try {
        await regCliMain.shutdownTracing();
      } catch (shutdownErr) {
        console.error('[Test] Error during shutdown:', shutdownErr);
      }
    }
    
    process.exit(1);
  }
}

// テスト実行
runTest(); 