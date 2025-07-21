/* @flow */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, context, propagation } from '@opentelemetry/api';

let sdk = null;
let isInitialized = false;

const createSDK = () => {
  const isJaegerEnabled = process.env.JAEGER_ENABLED === 'true';
  
  if (isJaegerEnabled) {
    const otlpExporter = new OTLPTraceExporter({
      url: 'http://localhost:4318/v1/traces', // Jaeger OTLP endpoint
    });

    return new NodeSDK({
      traceExporter: otlpExporter,
      serviceName: 'reg-cli',
      instrumentations: [],
    });
  } else {
    return new NodeSDK({
      serviceName: 'reg-cli',
      instrumentations: [],
    });
  }
};

export const initTracing = () => {
  if (!isInitialized) {
    sdk = createSDK();
    sdk.start();
    isInitialized = true;
    console.log('[Tracing] OpenTelemetry initialized with Jaeger enabled:', process.env.JAEGER_ENABLED);
  }
};

export const shutdownTracing = async () => {
  if (sdk && isInitialized) {
    console.log('[Tracing] Starting SDK shutdown...');
    console.log('[Tracing] Waiting for traces to be exported...');
    
    // より長い時間を待ってからシャットダウンする
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await sdk.shutdown();
    isInitialized = false;
    sdk = null;
    console.log('[Tracing] OpenTelemetry SDK shut down');
  }
};

export const getTracer = () => {
  return trace.getTracer('reg-cli', '0.18.10');
};

export const createSpan = async (name, fn) => {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      console.log(`[Tracing] Starting span: ${name}`);
      const startTime = process.hrtime.bigint();
      
      const result = await fn();
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      span.setStatus({ code: 1 }); // Success
      span.setAttributes({
        'reg.operation': name,
        'reg.duration': durationMs
      });
      
      console.log(`[Tracing] Completed span: ${name} (${durationMs.toFixed(2)}ms)`);
      return result;
    } catch (err) {
      console.log(`[Tracing] Error in span: ${name}`, err);
      span.setStatus({ code: 2, message: err.message }); // Error
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
};

export const createSyncSpan = (name, fn) => {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, (span) => {
    try {
      console.log(`[Tracing] Starting sync span: ${name}`);
      const startTime = process.hrtime.bigint();
      
      const result = fn();
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      span.setStatus({ code: 1 }); // Success
      span.setAttributes({
        'reg.operation': name,
        'reg.duration': durationMs,
        'reg.type': 'sync'
      });
      
      console.log(`[Tracing] Completed sync span: ${name} (${durationMs.toFixed(2)}ms)`);
      return result;
    } catch (err) {
      console.log(`[Tracing] Error in sync span: ${name}`, err);
      span.setStatus({ code: 2, message: err.message }); // Error
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
};