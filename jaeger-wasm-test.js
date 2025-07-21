// OpenTelemetry環境変数設定
process.env.JAEGER_ENABLED = 'true';
process.env.JAEGER_ENDPOINT = 'http://localhost:14268/api/traces';

import { compare, shutdownTracing } from './js/dist/index.mjs';
import { trace, context, propagation } from '@opentelemetry/api';

console.log('Starting reg-cli WASM with OpenTelemetry tracing...');
console.log('Jaeger UI: http://localhost:16686');

// Create main span for the entire test
const tracer = trace.getTracer('reg-cli-wasm-test', '1.0.0');

// 親スパンを作成してコンテキストを設定
tracer.startActiveSpan('reg-cli-wasm-test', async (mainSpan) => {
  try {
    // 現在のコンテキストをキャプチャして環境変数として渡す
    const traceContext = {};
    propagation.inject(context.active(), traceContext);
    
    // Worker に渡すための環境変数設定
    process.env.OTEL_TRACE_PARENT = traceContext.traceparent || '';
    process.env.OTEL_BAGGAGE = traceContext.baggage || '';

    const emitter = compare({
      actualDir: './sample/actual',
      expectedDir: './sample/expected', 
      diffDir: './sample/diff',
      json: './sample/reg.json'
    });

    emitter.on('complete', async (result) => {
      console.log('WASM comparison completed with tracing spans');
      console.log('Check Jaeger UI at http://localhost:16686 for traces');
      console.log('Service name: reg-cli-wasm');
      console.log('Result:', result);
      
      // Add completion span as child
      await tracer.startActiveSpan('wasm-test-complete', async (completeSpan) => {
        completeSpan.setAttributes({
          'reg.event': 'complete',
          'reg.result': JSON.stringify(result || {})
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
      console.error('WASM comparison error:', err);
      
      // Add error span as child
      await tracer.startActiveSpan('wasm-test-error', async (errorSpan) => {
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
    console.error('Test error:', error);
    process.exit(1);
  }
}); 