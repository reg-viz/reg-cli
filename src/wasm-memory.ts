// Keep the host-created memory aligned with .cargo/config.toml's 4 GiB limit.
const WASM32_MAX_MEMORY_PAGES = 65_536;

export const createSharedWasmMemory = (): WebAssembly.Memory =>
  new WebAssembly.Memory({
    initial: 256,
    maximum: WASM32_MAX_MEMORY_PAGES,
    shared: true,
  });

export const toUnsignedWasmPointer = (pointer: number): number => pointer >>> 0;
