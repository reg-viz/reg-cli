const version = 100000; // TODO convert from package.json version
const { ModuleClass } = require('./worker/module');

let loaded = false;
let lastRequestEvent = null;

function calc(ev) {
  const { raw, img1, img2, actualSrc, expectedSrc, seq } = ev.data;
  const diffResult = self.Module.detectDiff(Module, img1, img2, { });
  self.postMessage({
    type: 'res_calc',
    seq,
    raw,
    actualSrc,
    expectedSrc,
    result: {
      ...diffResult,
      images: [{ width: img1.width, height: img1.height }, { width: img2.width, height: img2.height }],
    },
  });
}

self.Module = new ModuleClass({
  version,
  init: () => {
    loaded = true;
    if (lastRequestEvent) calc(lastRequestEvent);
    self.postMessage({ type: 'init' });
  },
});

self.addEventListener('message', (ev) => {
  const meta = ev.data;
  switch (meta.type) {
    case 'req_calc':
      if (loaded) {
        calc(ev);
      } else {
        lastRequestEvent = ev;
      }
      break;
    default:
  }
});

importScripts('/dist/cv-wasm_browser.js'); // TODO concatnate 
