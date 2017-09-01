import { fork } from 'child_process'; // $FlowIgnore
import path from 'path';

export default class ProcessAdaptor {
  constructor() {
    this.process = fork(path.resolve(__dirname, './diff.js'));
    this._isRunning = false;
  }

  get isRunning() {
    return this._isRunning;
  }

  run(params) {
    return new Promise((resolve, reject) => {
      this._isRunning = true;
      this.process.send(params);
      this.process.once("message", (result) => {
        this._isRunning = false;
        resolve(result);
      });
    })
  }

  close() {
    this.process.kill();
  }
}
