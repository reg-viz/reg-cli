/* @flow */

import { fork } from 'child_process'; // $FlowIgnore
import path from 'path';
import type EventEmitter from 'events';
import type { DiffCreatorParams, DiffResult } from './diff';

export default class ProcessAdaptor {

  _isRunning: boolean;
  _process: child_process$ChildProcess;
  _emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this._process = fork(path.resolve(__dirname, './diff.js'));
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
      this._process.send(params);
      this._process.once('message', (result) => {
        this._isRunning = false;
        this._emitter.emit('compare', {
          type: result.passed ? 'pass' : 'fail', 
          path: result.image,
          diffDetails: result.diffDetails
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
