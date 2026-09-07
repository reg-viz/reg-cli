import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSharedWasmMemory,
  toUnsignedWasmPointer,
} from '../dist/wasm-memory.mjs';

const WASM_PAGE_SIZE_BYTES = 64 * 1024;
const INITIAL_MEMORY_PAGES = 256;
const ONE_GIB_PAGES = 16_384;

test('shared Wasm memory can grow beyond 1 GiB', () => {
  const memory = createSharedWasmMemory();
  const initialPages = memory.buffer.byteLength / WASM_PAGE_SIZE_BYTES;

  assert.equal(memory.buffer instanceof SharedArrayBuffer, true);
  assert.equal(initialPages, INITIAL_MEMORY_PAGES);
  assert.equal(memory.grow(ONE_GIB_PAGES + 1 - initialPages), initialPages);
  assert.equal(
    memory.buffer.byteLength,
    (ONE_GIB_PAGES + 1) * WASM_PAGE_SIZE_BYTES,
  );

  const firstByteBeyondOneGib = new Uint8Array(
    memory.buffer,
    ONE_GIB_PAGES * WASM_PAGE_SIZE_BYTES,
    1,
  );
  firstByteBeyondOneGib[0] = 1;
  assert.equal(firstByteBeyondOneGib[0], 1);
});

test('signed Wasm pointers are converted to unsigned memory offsets', () => {
  assert.equal(toUnsignedWasmPointer(-2_147_483_648), 2_147_483_648);
});
