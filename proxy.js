// compiled from: https://github.com/toyobayashi/emnapi/blob/main/packages/wasi-threads/src/proxy.ts

'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createInstanceProxy = exports.kIsProxy = void 0;
exports.kIsProxy = Symbol('kIsProxy');
/** @public */
function createInstanceProxy(instance, memory) {
  if (instance[exports.kIsProxy]) return instance;
  // https://github.com/nodejs/help/issues/4102
  var originalExports = instance.exports;
  var createHandler = function(target) {
    var handlers = [
      'apply',
      'construct',
      'defineProperty',
      'deleteProperty',
      'get',
      'getOwnPropertyDescriptor',
      'getPrototypeOf',
      'has',
      'isExtensible',
      'ownKeys',
      'preventExtensions',
      'set',
      'setPrototypeOf',
    ];
    var handler = {};
    var _loop_1 = function(i) {
      var name_1 = handlers[i];
      handler[name_1] = function() {
        var args = Array.prototype.slice.call(arguments, 1);
        args.unshift(target);
        return Reflect[name_1].apply(Reflect, args);
      };
    };
    for (var i = 0; i < handlers.length; i++) {
      _loop_1(i);
    }
    return handler;
  };
  var handler = createHandler(originalExports);
  var _initialize = function() {};
  var _start = function() {
    return 0;
  };
  handler.get = function(_target, p, receiver) {
    var _a;
    if (p === 'memory') {
      return (_a = typeof memory === 'function' ? memory() : memory) !== null && _a !== void 0
        ? _a
        : Reflect.get(originalExports, p, receiver);
    }
    if (p === '_initialize') {
      return p in originalExports ? _initialize : undefined;
    }
    if (p === '_start') {
      return p in originalExports ? _start : undefined;
    }
    return Reflect.get(originalExports, p, receiver);
  };
  handler.has = function(_target, p) {
    if (p === 'memory') return true;
    return Reflect.has(originalExports, p);
  };
  var exportsProxy = new Proxy(Object.create(null), handler);
  return new Proxy(instance, {
    get: function(target, p, receiver) {
      if (p === 'exports') {
        return exportsProxy;
      }
      if (p === exports.kIsProxy) {
        return true;
      }
      return Reflect.get(target, p, receiver);
    },
  });
}
exports.createInstanceProxy = createInstanceProxy;
