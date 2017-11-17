const instantiateCachedURL = require('./util.js');

class ModuleClass {
  constructor(opt){
    this._initCb = opt.init;
    this._version = opt.version;
  }

  locateFile(baseName) {
    return `/dist/${baseName}`;
  }

  instantiateWasm(imports, callback) {
    instantiateCachedURL(this._version, this.locateFile('cv-wasm_browser.wasm'), imports)
      .then(instance => callback(instance));
    return { };
  }

  onInit(cb) {
    this._initCb = cb;
  }

  onRuntimeInitialized() {
    if (this._initCb) {
      return this._initCb(this);
    }
  }
}

module.exports = { ModuleClass };
