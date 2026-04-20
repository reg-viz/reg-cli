/* @flow */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, SpanStatusCode, context, ROOT_CONTEXT } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

let sdk = null;
let isInitialized = false;
let currentRootSpan = null;
let currentRootContext = null;

export const isTracingEnabled = () => {
  return process.env.OTEL_ENABLED === 'true' || process.env.JAEGER_ENABLED === 'true';
};

export const initTracing = () => {
  if (!isTracingEnabled() || isInitialized) {
    return;
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

  const exporter = new OTLPTraceExporter({
    url: endpoint,
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'reg-cli-js',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    }),
    traceExporter: exporter,
  });

  sdk.start();
  isInitialized = true;

  if (process.env.OTEL_DEBUG === 'true') {
    console.log('[Tracing-JS] OpenTelemetry initialized');
    console.log(`[Tracing-JS] OTLP endpoint: ${endpoint}`);
  }
};

export const shutdownTracing = async () => {
  if (sdk && isInitialized) {
    if (process.env.OTEL_DEBUG === 'true') {
      console.log('[Tracing-JS] Starting SDK shutdown...');
    }
    await sdk.shutdown();
    if (process.env.OTEL_DEBUG === 'true') {
      console.log('[Tracing-JS] OpenTelemetry SDK shut down');
    }
  }
};

export const getTracer = () => {
  return trace.getTracer('reg-cli-js', '1.0.0');
};

export const startRootSpan = (name) => {
  if (!isTracingEnabled() || !isInitialized) {
    return null;
  }

  const tracer = getTracer();
  currentRootSpan = tracer.startSpan(name);
  currentRootContext = trace.setSpan(ROOT_CONTEXT, currentRootSpan);

  if (process.env.OTEL_DEBUG === 'true') {
    const spanContext = currentRootSpan.spanContext();
    console.log(`[Tracing-JS] Started root span: ${name}`);
    console.log(`[Tracing-JS] Trace ID: ${spanContext.traceId}`);
    console.log(`[Tracing-JS] Span ID: ${spanContext.spanId}`);
  }

  return {
    traceId: currentRootSpan.spanContext().traceId,
    spanId: currentRootSpan.spanContext().spanId,
  };
};

export const endRootSpan = (success = true) => {
  if (currentRootSpan) {
    if (success) {
      currentRootSpan.setStatus({ code: SpanStatusCode.OK });
    } else {
      currentRootSpan.setStatus({ code: SpanStatusCode.ERROR });
    }
    currentRootSpan.end();

    if (process.env.OTEL_DEBUG === 'true') {
      console.log('[Tracing-JS] Ended root span');
    }

    currentRootSpan = null;
    currentRootContext = null;
  }
};

export const startSpan = (name, attributes = {}) => {
  if (!isTracingEnabled() || !isInitialized) {
    return { end: () => {}, setStatus: () => {}, setAttribute: () => {} };
  }

  const tracer = getTracer();
  const parentContext = currentRootContext || ROOT_CONTEXT;
  const span = tracer.startSpan(name, { attributes }, parentContext);
  const startTime = Date.now();

  if (process.env.OTEL_DEBUG === 'true') {
    console.log(`[Tracing-JS] Started span: ${name}`);
  }

  // Wrap the end method to log when span ends
  const originalEnd = span.end.bind(span);
  span.end = () => {
    originalEnd();
    if (process.env.OTEL_DEBUG === 'true') {
      const duration = Date.now() - startTime;
      console.log(`[Tracing-JS] Ended span: ${name} (${duration}ms)`);
    }
  };

  return span;
};

export const withSpan = async (name, attributes, fn) => {
  if (!isTracingEnabled() || !isInitialized) {
    return fn();
  }

  const tracer = getTracer();
  const parentContext = currentRootContext || ROOT_CONTEXT;

  return tracer.startActiveSpan(name, { attributes }, parentContext, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
      if (process.env.OTEL_DEBUG === 'true') {
        console.log(`[Tracing-JS] Ended span: ${name}`);
      }
    }
  });
};

// For child processes - context propagation
export const getTraceContext = () => {
  if (currentRootSpan) {
    return {
      traceId: currentRootSpan.spanContext().traceId,
      spanId: currentRootSpan.spanContext().spanId,
    };
  }
  return null;
};

