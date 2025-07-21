/* @flow */

import { fork } from 'child_process'; // $FlowIgnore
import path from 'path';
import type EventEmitter from 'events';
import type { DiffCreatorParams, DiffResult } from './diff';
import { trace, propagation, context } from '@opentelemetry/api';

export default class ProcessAdaptor {

  _isRunning: boolean;
  _process: child_process$ChildProcess;
  _emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    // 環境変数を子プロセスに渡す
    const childEnv = {
      ...process.env,
      JAEGER_ENABLED: process.env.JAEGER_ENABLED,
      JAEGER_ENDPOINT: process.env.JAEGER_ENDPOINT
    };
    
    this._process = fork(path.resolve(__dirname, './diff.js'), [], {
      env: childEnv,
      silent: false
    });
    this._isRunning = false;
    this._emitter = emitter;
  }

  isRunning() {
    return this._isRunning;
  }

  run(params: DiffCreatorParams): Promise<?DiffResult> {
    return new Promise((resolve, reject) => {
      this._isRunning = true;
      if (!this._process || !this._process.send) resolve();
      
      // 現在のトレースコンテキストをキャプチャして子プロセスに渡す
      const activeSpan = trace.getActiveSpan();
      const traceContext = {};
      if (activeSpan) {
        propagation.inject(trace.setSpanContext(context.active(), activeSpan.spanContext()), traceContext);
      }
      
      // パラメータにトレースコンテキストを追加
      const paramsWithContext = {
        ...params,
        traceContext
      };
      
      this._process.send(paramsWithContext);
      this._process.once('message', (result) => {
        this._isRunning = false;
        this._emitter.emit('compare', {
          type: result.passed ? 'pass' : 'fail', path: result.image,
        });
        
        // 子プロセスでスパンエクスポートが完了するまで少し待つ
        setTimeout(() => {
          resolve(result);
        }, 0); // 子プロセスの500ms待機 + バッファ
      });
    });
  }

  close() {
    if (!this._process || !this._process.kill) return;
    this._process.kill();
  }
}
