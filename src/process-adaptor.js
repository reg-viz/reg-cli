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
    
    // Set max listeners to prevent warning
    this._process.setMaxListeners(50);
  }

  isRunning() {
    return this._isRunning;
  }

  run(params: DiffCreatorParams): Promise<?DiffResult> {
    const debug = process.env.REG_DEBUG || false;
    if (debug) console.log(`[PROCESS-ADAPTOR] Starting diff process for image: ${params.image}`);
    
    return new Promise((resolve, reject) => {
      this._isRunning = true;
      
      // Add timeout to detect hanging processes
      const timeout = setTimeout(() => {
        console.error(`[PROCESS-ADAPTOR] Timeout after 30s for image: ${params.image}`);
        this._isRunning = false;
        reject(new Error(`Diff process timeout for ${params.image}`));
      }, 30000);
      
      if (!this._process || !this._process.send) {
        clearTimeout(timeout);
        resolve();
      }
      
      this._process.send(params);
      
      this._process.once('message', (result) => {
        clearTimeout(timeout);
        if (debug) console.log(`[PROCESS-ADAPTOR] Received result for ${params.image}: passed=${result.passed}`);
        
        this._isRunning = false;
        this._emitter.emit('compare', {
          type: result.passed ? 'pass' : 'fail', 
          path: result.image,
          diffDetails: result.diffDetails
        });
        resolve(result);
      });
      
      this._process.once('error', (error) => {
        clearTimeout(timeout);
        console.error(`[PROCESS-ADAPTOR] Process error for ${params.image}:`, error);
        this._isRunning = false;
        reject(error);
      });
    });
  }

  close() {
    if (!this._process || !this._process.kill) return;
    this._process.kill();
  }
}
