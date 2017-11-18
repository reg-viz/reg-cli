const { EventEmitter } = require('events');

function fromCanvas(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  var { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, data };
}

function loadImage(src) {
  const img = new Image();
  const p = new Promise(resolve => {
    img.addEventListener('load', () => {
      resolve(fromCanvas(img));
    });
  });
  img.src = src;
  return p;
}

class WorkerClient {
  constructor() {
    this._cache = { };
    this._seq = 0;
    this._emitter = new EventEmitter();
  }

  requestCalc(req) {
    const seq =  ++this._seq;
    if (this._cache[req.raw]) {
      setTimeout(() => this._emitter.emit('result', { ...this._cache[req.raw], seq }), 10);
      return seq;
    }
    Promise.all([
      loadImage(req.actualSrc),
      loadImage(req.expectedSrc),
    ]).then(([img1, img2]) => {
      this.worker.postMessage({
        type: 'req_calc',
        img1,
        img2,
        seq,
        ...req,
      }, [img1.data.buffer, img2.data.buffer]);
    });
    return seq;
  }

  subscribe(cb) {
    return this._emitter.on('result', cb);
  }

  pushResult(data) {
    this._cache[data.raw] = data;
    this._emitter.emit('result', data);
  }

  start(config) {
    this._config = config;
    const { enabled, workerUrl } = config;
    if (!enabled || !workerUrl) {
      return;
    }
    this.worker = new Worker(workerUrl);
    this.worker.addEventListener('message', (ev) => {
      const meta = ev.data;
      switch (meta.type) {
        case 'init':
          break;
        case 'res_calc':
          this.pushResult(ev.data);
          break;
        default:
      }
    });
  }
}

const client = new WorkerClient();
export default client;
