// compiled from: https://github.com/toyobayashi/emnapi/blob/main/packages/wasi-threads/src/proxy.ts
// MIT License
//
// Copyright (c) 2021-present Toyobayashi
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
export const kIsProxy = Symbol('kIsProxy')

export const createInstanceProxy = (
  instance: WebAssembly.Instance,
  memory?: WebAssembly.Memory | (() => WebAssembly.Memory)
): WebAssembly.Instance => {
  if ((instance as any)[kIsProxy]) return instance

  // https://github.com/nodejs/help/issues/4102
  const originalExports = instance.exports
  const createHandler = function (target: WebAssembly.Exports): ProxyHandler<WebAssembly.Exports> {
    const handlers = [
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
      'setPrototypeOf'
    ]
    const handler: ProxyHandler<WebAssembly.Exports> = {}
    for (let i = 0; i < handlers.length; i++) {
      const name = handlers[i] as keyof ProxyHandler<WebAssembly.Exports>
      handler[name] = function () {
        const args = Array.prototype.slice.call(arguments, 1)
        args.unshift(target)
        return (Reflect[name] as any).apply(Reflect, args)
      }
    }
    return handler
  }
  const handler = createHandler(originalExports)
  const _initialize = (): void => {}
  const _start = (): number => 0
  handler.get = function (_target, p, receiver) {
    if (p === 'memory') {
      return (typeof memory === 'function' ? memory() : memory) ?? Reflect.get(originalExports, p, receiver)
    }
    if (p === '_initialize') {
      return p in originalExports ? _initialize : undefined
    }
    if (p === '_start') {
      return p in originalExports ? _start : undefined
    }
    return Reflect.get(originalExports, p, receiver)
  }
  handler.has = function (_target, p) {
    if (p === 'memory') return true
    return Reflect.has(originalExports, p)
  }
  const exportsProxy = new Proxy(Object.create(null), handler)
  return new Proxy(instance, {
    get (target, p, receiver) {
      if (p === 'exports') {
        return exportsProxy
      }
      if (p === kIsProxy) {
        return true
      }
      return Reflect.get(target, p, receiver)
    }
  })
}