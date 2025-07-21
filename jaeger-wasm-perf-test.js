// OpenTelemetry環境変数設定
process.env.JAEGER_ENABLED = 'true';
process.env.JAEGER_ENDPOINT = 'http://localhost:14268/api/traces';

import { compare, shutdownTracing } from './js/dist/index.mjs';
import { trace, context, propagation } from '@opentelemetry/api';

console.log('Starting reg-cli WASM PERFORMANCE TEST with OpenTelemetry tracing...');
console.log('Testing with 50 files to measure glob processing impact');
console.log('Jaeger UI: http://localhost:16686');

// Create main span for the entire test
const tracer = trace.getTracer('reg-cli-wasm-perf-test', '1.0.0');

// 親スパンを作成してコンテキストを設定
tracer.startActiveSpan('reg-cli-wasm-perf-test', async (mainSpan) => {
  try {
    // 現在のコンテキストをキャプチャして環境変数として渡す
    const traceContext = {};
    propagation.inject(context.active(), traceContext);
    
    // Worker に渡すための環境変数設定
    process.env.OTEL_TRACE_PARENT = traceContext.traceparent || '';
    process.env.OTEL_BAGGAGE = traceContext.baggage || '';

    console.log('Testing performance with 50 files vs 2 files comparison');
    const startTime = performance.now();

    const emitter = compare({
      actualDir: './test_perf/actual',
      expectedDir: './test_perf/expected', 
      diffDir: './test_perf/diff',
      json: './test_perf/reg.json'
    });

    emitter.on('complete', async (result) => {
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log('='.repeat(60));
      console.log('PERFORMANCE TEST COMPLETED');
      console.log('='.repeat(60));
      console.log('Files processed:', result.expectedItems.length);
      console.log('Total time:', totalTime.toFixed(2) + 'ms');
      console.log('Time per file:', (totalTime / result.expectedItems.length).toFixed(2) + 'ms');
      console.log('Expected impact from glob processing with 50 vs 2 files');
      console.log('Check Jaeger UI at http://localhost:16686 for detailed traces');
      console.log('Service name: reg-cli-wasm');
      console.log('Result summary:');
      console.log('- Expected items:', result.expectedItems.length);
      console.log('- Actual items:', result.actualItems.length);
      console.log('- Failed items:', result.failedItems.length);
      console.log('- Passed items:', result.passedItems.length);
      console.log('='.repeat(60));
      
      // Add completion span as child
      await tracer.startActiveSpan('wasm-perf-test-complete', async (completeSpan) => {
        completeSpan.setAttributes({
          'reg.event': 'complete',
          'reg.fileCount': result.expectedItems.length,
          'reg.totalTime': totalTime,
          'reg.timePerFile': totalTime / result.expectedItems.length
        });
        completeSpan.end();
      });
      
      // End main span
      mainSpan.end();
      
      // Keep process alive briefly to allow traces to be sent
      setTimeout(async () => {
        console.log('Shutting down SDK...');
        await shutdownTracing();
        console.log('SDK shut down successfully');
        process.exit(0);
      }, 3000); // Increased delay
    });

    emitter.on('error', async (err) => {
      console.error('WASM performance test error:', err);
      
      // Add error span as child
      await tracer.startActiveSpan('wasm-perf-test-error', async (errorSpan) => {
        errorSpan.setAttributes({
          'reg.event': 'error',
          'error.message': err.message,
          'error.stack': err.stack
        });
        errorSpan.recordException(err);
        errorSpan.end();
      });
      
      mainSpan.recordException(err);
      mainSpan.end();
      
      setTimeout(async () => {
        await shutdownTracing();
        process.exit(1);
      }, 1000);
    });

  } catch (error) {
    mainSpan.recordException(error);
    mainSpan.end();
    console.error('Performance test error:', error);
    process.exit(1);
  }
}); 