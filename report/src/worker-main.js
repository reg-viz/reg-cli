const { ModuleClass } = require('./detector-wrapper/module');
const ximgdiffVersionString = require('x-img-diff-js/package.json').version;

function version2number(versionString) {
  const [_, major, minor, patch] = versionString.match(/^(\d*)\.(\d*)\.(\d*)/);
  return ((+major) * 10000) + ((+minor) * 100) + (+patch);
}

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
  version: version2number(ximgdiffVersionString),
  wasmUrl: self.wasmUrl,
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
