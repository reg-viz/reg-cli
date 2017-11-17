const instantiateCachedURL = require('./util.js');

class ModuleClass {
  constructor(opt){
    this._initCb = opt.init;
    this._version = opt.version;
    this._wasmUrl = opt.wasmUrl;
  }

  locateFile(baseName) {
    return self.location.pathname.replace(/\/[^\/]*$/, '/') + baseName;
  }

  instantiateWasm(imports, callback) {
    instantiateCachedURL(this._version, this._wasmUrl, imports)
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
