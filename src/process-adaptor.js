/* @flow */

import { fork } from 'child_process'; // $FlowIgnore
import path from 'path';
import type EventEmitter from 'events';
import type { DiffCreatorParams, DiffResult } from './diff';
import { startSpan } from './tracing';

export default class ProcessAdaptor {

  _isRunning: boolean;
  _process: child_process$ChildProcess;
  _emitter: EventEmitter;
  _traceContext: ?{ traceId: string, spanId: string };

  constructor(emitter: EventEmitter, traceContext: ?{ traceId: string, spanId: string }) {
    this._process = fork(path.resolve(__dirname, './diff.js'));
    this._isRunning = false;
    this._emitter = emitter;
    this._traceContext = traceContext;
  }

  isRunning() {
    return this._isRunning;
  }

  run(params: DiffCreatorParams): Promise<?DiffResult> {
    return new Promise((resolve, reject) => {
      this._isRunning = true;
      if (!this._process || !this._process.send) resolve();
      
      // Start span for this image diff
      const span = startSpan('diff_single_image', { image: params.image });
      
      // Pass trace context to child process
      this._process.send({ ...params, traceContext: this._traceContext });
      this._process.once('message', (result) => {
        this._isRunning = false;
        span.end();
        this._emitter.emit('compare', {
          type: result.passed ? 'pass' : 'fail', path: result.image,
        });
        resolve(result);
      });
    });
  }

  close() {
    if (!this._process || !this._process.kill) return;
    this._process.kill();
  }
}
