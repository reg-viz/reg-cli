/* @flow */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-node';
import { trace } from '@opentelemetry/api';

let sdk;
let isInitialized = false;

const createSDK = () => {
  const isJaegerEnabled = process.env.JAEGER_ENABLED === 'true';
  
  if (isJaegerEnabled) {
    const jaegerExporter = new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    });

    return new NodeSDK({
      traceExporter: jaegerExporter,
      serviceName: 'reg-cli',
    });
  } else {
    // Jaegerが無効の場合、デフォルトの設定（traces are not exported）
    return new NodeSDK({
      serviceName: 'reg-cli',
    });
  }
};

export const initTracing = () => {
  if (!isInitialized) {
    sdk = createSDK();
    sdk.start();
    isInitialized = true;
  }
};

export const shutdownTracing = async () => {
  if (sdk && isInitialized) {
    await sdk.shutdown();
    isInitialized = false;
  }
};

export const getTracer = () => {
  return trace.getTracer('reg-cli', '0.18.10');
};

export const createSpan = (name: string, fn: Function) => {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, (span) => {
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        return result
          .then((res) => {
            span.setStatus({ code: 1 });
            return res;
          })
          .catch((err) => {
            span.setStatus({ code: 2, message: err.message });
            span.recordException(err);
            throw err;
          })
          .finally(() => {
            span.end();
          });
      } else {
        span.setStatus({ code: 1 });
        span.end();
        return result;
      }
    } catch (err) {
      span.setStatus({ code: 2, message: err.message });
      span.recordException(err);
      span.end();
      throw err;
    }
  });
};