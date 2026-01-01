/**
 * OpenTelemetry tracing utilities for reg-cli
 *
 * This module receives trace data from the Rust/WASM side and converts it
 * to OpenTelemetry spans that can be exported to Jaeger or other backends.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, SpanStatusCode, context, ROOT_CONTEXT, type Span, type Context } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;
let isInitialized = false;

// Store current root span context for propagation to Rust
let currentRootSpan: Span | null = null;
let currentRootContext: Context | null = null;

/**
 * Span data structure from Rust side
 */
export interface RustSpanData {
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time_ms: number;
  end_time_ms: number;
  duration_ms: number;
  level: string;
  target: string;
  attributes: Record<string, string>;
  status: string;
  error_message: string | null;
}

/**
 * Trace data structure from Rust side
 */
export interface RustTraceData {
  service_name: string;
  trace_id: string | null;
  js_parent_span_id: string | null;
  spans: RustSpanData[];
}

/**
 * Trace context to pass to Rust side
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
}

/**
 * Check if tracing is enabled via environment variable
 */
export const isTracingEnabled = (): boolean => {
  return process.env.OTEL_ENABLED === 'true' || process.env.JAEGER_ENABLED === 'true';
};

/**
 * Initialize OpenTelemetry SDK
 */
export const initTracing = (): void => {
  if (!isTracingEnabled()) {
    return;
  }

  if (isInitialized) {
    return;
  }

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

  const otlpExporter = new OTLPTraceExporter({
    url: otlpEndpoint,
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'reg-cli',
      [ATTR_SERVICE_VERSION]: '0.18.10',
    }),
    traceExporter: otlpExporter,
    instrumentations: [],
  });

  sdk.start();
  isInitialized = true;

  if (process.env.OTEL_DEBUG === 'true') {
    console.log('[Tracing] OpenTelemetry initialized');
    console.log(`[Tracing] OTLP endpoint: ${otlpEndpoint}`);
  }
};

/**
 * Shutdown OpenTelemetry SDK gracefully
 */
export const shutdownTracing = async (): Promise<void> => {
  if (!sdk || !isInitialized) {
    return;
  }

  if (process.env.OTEL_DEBUG === 'true') {
    console.log('[Tracing] Starting SDK shutdown...');
  }

  // Wait a bit for traces to be exported
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await sdk.shutdown();

  isInitialized = false;
  sdk = null;

  if (process.env.OTEL_DEBUG === 'true') {
    console.log('[Tracing] OpenTelemetry SDK shut down');
  }
};

/**
 * Get the tracer instance
 */
const getTracer = () => {
  return trace.getTracer('reg-cli-wasm', '0.18.10');
};

/**
 * Start a root span and return context info to pass to Rust
 */
export const startRootSpan = (name: string): TraceContext | null => {
  if (!isTracingEnabled() || !isInitialized) {
    return null;
  }

  const tracer = getTracer();
  currentRootSpan = tracer.startSpan(name);
  currentRootContext = trace.setSpan(ROOT_CONTEXT, currentRootSpan);

  // Get the span context to pass to Rust
  const spanContext = currentRootSpan.spanContext();

  if (process.env.OTEL_DEBUG === 'true') {
    console.log(`[Tracing] Started root span: ${name}`);
    console.log(`[Tracing] Trace ID: ${spanContext.traceId}`);
    console.log(`[Tracing] Span ID: ${spanContext.spanId}`);
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
};

/**
 * End the current root span
 */
export const endRootSpan = (success: boolean = true): void => {
  if (currentRootSpan) {
    if (success) {
      currentRootSpan.setStatus({ code: SpanStatusCode.OK });
    } else {
      currentRootSpan.setStatus({ code: SpanStatusCode.ERROR });
    }
    currentRootSpan.end();

    if (process.env.OTEL_DEBUG === 'true') {
      console.log('[Tracing] Ended root span');
    }

    currentRootSpan = null;
    currentRootContext = null;
  }
};

/**
 * Topologically sort spans so parents are always processed before children
 */
const topologicalSortSpans = (spans: RustSpanData[]): RustSpanData[] => {
  const spanMap = new Map<string, RustSpanData>();
  const childrenMap = new Map<string, string[]>();
  const rootSpans: string[] = [];

  // Build maps
  for (const span of spans) {
    spanMap.set(span.span_id, span);
    if (!span.parent_span_id) {
      rootSpans.push(span.span_id);
    } else {
      const children = childrenMap.get(span.parent_span_id) || [];
      children.push(span.span_id);
      childrenMap.set(span.parent_span_id, children);
    }
  }

  if (process.env.OTEL_DEBUG === 'true') {
    console.log(`[Tracing] Total spans: ${spans.length}, Unique IDs in spanMap: ${spanMap.size}`);
    console.log(`[Tracing] Root spans: ${rootSpans.join(', ')}`);
    console.log(`[Tracing] All spans:`);
    for (const span of spans) {
      console.log(`  ${span.span_id}: ${span.name} (parent: ${span.parent_span_id || 'none'})`);
    }
    console.log(`[Tracing] Parent->Children map:`);
    for (const [parent, children] of childrenMap.entries()) {
      console.log(`  ${parent} -> ${children.join(', ')}`);
    }
  }

  // BFS traversal from roots
  const result: RustSpanData[] = [];
  const queue = [...rootSpans];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const spanId = queue.shift()!;
    if (visited.has(spanId)) continue;
    visited.add(spanId);

    const span = spanMap.get(spanId);
    if (span) {
      result.push(span);
      const children = childrenMap.get(spanId) || [];
      queue.push(...children);
    }
  }

  // Add any orphaned spans (parent not in the span list)
  for (const span of spans) {
    if (!visited.has(span.span_id)) {
      if (process.env.OTEL_DEBUG === 'true') {
        console.log(`[Tracing] Orphan span: ${span.name} (id: ${span.span_id}, parent: ${span.parent_span_id})`);
      }
      result.push(span);
    }
  }

  return result;
};

/**
 * Convert Rust trace data to OpenTelemetry spans
 *
 * Since Rust spans have already ended by the time we receive them,
 * we reconstruct them with their recorded timestamps.
 */
export const processRustTraceData = (traceData: RustTraceData): void => {
  if (!isTracingEnabled() || !isInitialized) {
    return;
  }

  const tracer = getTracer();

  if (process.env.OTEL_DEBUG === 'true') {
    console.log(`[Tracing] Processing ${traceData.spans.length} spans from Rust`);
    console.log(`[Tracing] JS parent context available: ${currentRootContext !== null}`);
  }

  // Topologically sort spans so parents are processed before children
  const sortedSpans = topologicalSortSpans(traceData.spans);

  // Map to store span contexts by their IDs for parent-child linking
  const spanContextMap = new Map<string, Context>();

  for (const rustSpan of sortedSpans) {
    // Convert milliseconds to nanoseconds for OpenTelemetry
    const startTimeNs = rustSpan.start_time_ms * 1_000_000;
    const endTimeNs = rustSpan.end_time_ms * 1_000_000;

    // Determine parent context
    let parentContext: Context;
    let parentInfo: string;
    
    if (rustSpan.parent_span_id && spanContextMap.has(rustSpan.parent_span_id)) {
      // Has a Rust parent span that was already processed
      parentContext = spanContextMap.get(rustSpan.parent_span_id)!;
      parentInfo = `rust parent: ${rustSpan.parent_span_id}`;
    } else if (!rustSpan.parent_span_id && currentRootContext) {
      // Root-level Rust span - attach to JS root span
      parentContext = currentRootContext;
      parentInfo = `js parent: ${currentRootSpan?.spanContext().spanId}`;
    } else {
      // No parent available (orphan or parent not found)
      parentContext = currentRootContext || ROOT_CONTEXT;
      parentInfo = rustSpan.parent_span_id 
        ? `orphan (parent ${rustSpan.parent_span_id} not found)` 
        : 'root (no js context)';
    }

    // Start span with parent context
    const span = tracer.startSpan(
      rustSpan.name,
      {
        startTime: [Math.floor(startTimeNs / 1_000_000_000), startTimeNs % 1_000_000_000],
      },
      parentContext,
    );

    // Set attributes
    span.setAttribute('rust.target', rustSpan.target);
    span.setAttribute('rust.level', rustSpan.level);
    span.setAttribute('rust.span_id', rustSpan.span_id);
    span.setAttribute('duration_ms', rustSpan.duration_ms);

    for (const [key, value] of Object.entries(rustSpan.attributes)) {
      span.setAttribute(`rust.${key}`, value);
    }

    // Set status
    if (rustSpan.status === 'error') {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: rustSpan.error_message || 'Unknown error',
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // End span with recorded end time
    span.end([Math.floor(endTimeNs / 1_000_000_000), endTimeNs % 1_000_000_000]);

    // Store context for child spans
    const ctx = trace.setSpan(parentContext, span);
    spanContextMap.set(rustSpan.span_id, ctx);

    if (process.env.OTEL_DEBUG === 'true') {
      console.log(`[Tracing] Created span: ${rustSpan.name} (${rustSpan.duration_ms}ms) [${parentInfo}] start=${rustSpan.start_time_ms}, end=${rustSpan.end_time_ms}`);
    }
  }
};

/**
 * Create a wrapper span for the entire reg-cli operation
 */
export const createRootSpan = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  if (!isTracingEnabled() || !isInitialized) {
    return fn();
  }

  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
};

