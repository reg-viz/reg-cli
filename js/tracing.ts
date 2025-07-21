import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, context, propagation } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;
let isInitialized = false;

const createSDK = (): NodeSDK => {
  const isJaegerEnabled = process.env.JAEGER_ENABLED === 'true';
  
  if (isJaegerEnabled) {
    const otlpExporter = new OTLPTraceExporter({
      url: 'http://localhost:4318/v1/traces', // Jaeger OTLP endpoint
    });

    return new NodeSDK({
      traceExporter: otlpExporter,
      serviceName: 'reg-cli-wasm',
      // OTLPを明示的に設定
      instrumentations: [],
    });
  } else {
    // Jaegerが無効の場合、デフォルトの設定（traces are not exported）
    return new NodeSDK({
      serviceName: 'reg-cli-wasm',
      instrumentations: [],
    });
  }
};

export const initTracing = (): void => {
  if (!isInitialized) {
    sdk = createSDK();
    sdk.start();
    isInitialized = true;
    console.log('[WASM Tracing] OpenTelemetry initialized with Jaeger enabled:', process.env.JAEGER_ENABLED);
    
    // 親コンテキストを復元
    if (process.env.OTEL_TRACE_PARENT) {
      const traceContext = {
        traceparent: process.env.OTEL_TRACE_PARENT,
        baggage: process.env.OTEL_BAGGAGE || ''
      };
      const parentContext = propagation.extract(context.active(), traceContext);
      context.with(parentContext, () => {
        console.log('[WASM Tracing] Parent context restored from environment variables');
      });
    }
  }
};

export const shutdownTracing = async (): Promise<void> => {
  if (sdk && isInitialized) {
    await sdk.shutdown();
    isInitialized = false;
    sdk = null;
    console.log('[WASM Tracing] OpenTelemetry SDK shut down');
  }
};

export const getTracer = () => {
  return trace.getTracer('reg-cli-wasm', '0.0.0-experimental3');
};

export const createSpan = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const tracer = getTracer();
  
  // 親コンテキストがある場合は復元
  let activeContext = context.active();
  if (process.env.OTEL_TRACE_PARENT && !trace.getSpanContext(activeContext)) {
    const traceContext = {
      traceparent: process.env.OTEL_TRACE_PARENT,
      baggage: process.env.OTEL_BAGGAGE || ''
    };
    activeContext = propagation.extract(context.active(), traceContext);
  }

  return context.with(activeContext, () => {
    return tracer.startActiveSpan(name, async (span) => {
      try {
        console.log(`[WASM Tracing] Starting span: ${name}`);
        const result = await fn();
        span.setStatus({ code: 1 }); // Success
        console.log(`[WASM Tracing] Completed span: ${name}`);
        return result;
      } catch (err) {
        console.log(`[WASM Tracing] Error in span: ${name}`, err);
        span.setStatus({ code: 2, message: err instanceof Error ? err.message : 'Unknown error' }); // Error
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        span.end();
      }
    });
  });
}; 