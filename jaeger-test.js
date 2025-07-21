// OpenTelemetry環境変数設定
process.env.JAEGER_ENABLED = 'true';
process.env.JAEGER_ENDPOINT = 'http://localhost:14268/api/traces';

const { trace } = require('@opentelemetry/api');
const reg = require('./dist/index.js');

console.log('Starting reg-cli with OpenTelemetry tracing...');
console.log('Jaeger UI: http://localhost:16686');

// reg-cli内部のトレーサーを使用
const tracer = trace.getTracer('reg-cli', '1.0.0');

// Start the main span
const mainSpan = tracer.startSpan('reg-cli-comparison');

const emitter = reg({
  actualDir: './sample/actual',
  expectedDir: './sample/expected', 
  diffDir: './sample/diff',
  json: './sample/reg.json'
  // デフォルトのconcurrency: 4を使用
});

emitter.on('start', () => {
  console.log('Started image comparison with tracing');
  const startSpan = tracer.startSpan('comparison-start', { parent: mainSpan });
  startSpan.setAttributes({
    'reg.event': 'start',
    'reg.actualDir': './sample/actual',
    'reg.expectedDir': './sample/expected'
  });
  startSpan.end();
});

emitter.on('compare', (data) => {
  console.log('Compare event:', data);
  const compareSpan = tracer.startSpan('image-compare', { parent: mainSpan });
  compareSpan.setAttributes({
    'reg.event': 'compare',
    'reg.filename': data?.filename || 'unknown'
  });
  compareSpan.end();
});

emitter.on('complete', (result) => {
  console.log('Completed with tracing spans');
  console.log('Check Jaeger UI at http://localhost:16686 for traces');
  console.log('Service name: reg-cli');
  
  // Add completion span
  const completeSpan = tracer.startSpan('comparison-complete', { parent: mainSpan });
  completeSpan.setAttributes({
    'reg.event': 'complete',
    'reg.result': JSON.stringify(result || {})
  });
  completeSpan.end();
  
  // End main span
  mainSpan.end();
  
  // Keep process alive briefly to allow traces to be sent
  setTimeout(async () => {
    console.log('Shutting down SDK...');
    // reg-cli内部のshutdownTracingを使用
    const { shutdownTracing } = require('./dist/tracing');
    await shutdownTracing();
    console.log('SDK shut down successfully');
    process.exit(0);
  }, 2000);
});

emitter.on('error', (err) => {
  console.error('Error:', err);
  const errorSpan = tracer.startSpan('comparison-error', { parent: mainSpan });
  errorSpan.setAttributes({
    'reg.event': 'error',
    'error.message': err.message,
    'error.stack': err.stack
  });
  errorSpan.recordException(err);
  errorSpan.end();
  
  mainSpan.recordException(err);
  mainSpan.end();
  
  setTimeout(async () => {
    const { shutdownTracing } = require('./dist/tracing');
    await shutdownTracing();
    process.exit(1);
  }, 1000);
});