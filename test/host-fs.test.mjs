import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHostFs, toHostOpenFlags } from '../dist/host-fs.mjs';

// Linux fcntl encoding, as emitted by @tybys/wasm-util's pathOpen().
const L = {
  O_WRONLY: 0x1,
  O_RDWR: 0x2,
  O_CREAT: 0x40,
  O_EXCL: 0x80,
  O_TRUNC: 0x200,
  O_APPEND: 0x400,
  O_NONBLOCK: 0x800,
  O_DIRECTORY: 0x10000,
  O_SYNC: 0x101000,
};

// Darwin values, so the test is meaningful regardless of the host we run on.
const DARWIN = {
  O_CREAT: 0x200,
  O_EXCL: 0x800,
  O_TRUNC: 0x400,
  O_APPEND: 0x8,
  O_NONBLOCK: 0x4,
  O_DIRECTORY: 0x100000,
  O_SYNC: 0x80,
};

test('toHostOpenFlags remaps Linux bits to the given host constants', () => {
  // Rust File::create → WRONLY|CREAT|TRUNC
  assert.equal(
    toHostOpenFlags(L.O_WRONLY | L.O_CREAT | L.O_TRUNC, DARWIN),
    L.O_WRONLY | DARWIN.O_CREAT | DARWIN.O_TRUNC,
  );
  assert.equal(
    toHostOpenFlags(L.O_RDWR | L.O_CREAT | L.O_EXCL, DARWIN),
    L.O_RDWR | DARWIN.O_CREAT | DARWIN.O_EXCL,
  );
  assert.equal(
    toHostOpenFlags(L.O_WRONLY | L.O_APPEND | L.O_NONBLOCK, DARWIN),
    L.O_WRONLY | DARWIN.O_APPEND | DARWIN.O_NONBLOCK,
  );
  assert.equal(
    toHostOpenFlags(L.O_DIRECTORY | L.O_SYNC, DARWIN),
    DARWIN.O_DIRECTORY | DARWIN.O_SYNC,
  );
  assert.equal(toHostOpenFlags(0, DARWIN), 0);
});

test('toHostOpenFlags is the identity on Linux constants', () => {
  const LINUX = {
    O_CREAT: 0x40,
    O_EXCL: 0x80,
    O_TRUNC: 0x200,
    O_APPEND: 0x400,
    O_NONBLOCK: 0x800,
    O_DIRECTORY: 0x10000,
    O_SYNC: 0x101000,
  };
  const all = L.O_RDWR | L.O_CREAT | L.O_EXCL | L.O_TRUNC | L.O_APPEND | L.O_NONBLOCK | L.O_DIRECTORY | L.O_SYNC;
  assert.equal(toHostOpenFlags(all, LINUX), all);
});

test('toHostOpenFlags passes string flags through', () => {
  assert.equal(toHostOpenFlags('r', DARWIN), 'r');
});

test('createHostFs().openSync honours O_TRUNC on this host', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reg-cli-hostfs-'));
  try {
    const file = join(dir, 'f.txt');
    fs.writeFileSync(file, 'long long long content');
    const hostFs = createHostFs();
    const fd = hostFs.openSync(file, L.O_WRONLY | L.O_CREAT | L.O_TRUNC, 0o666);
    hostFs.writeSync(fd, 'short');
    hostFs.closeSync(fd);
    assert.equal(await readFile(file, 'utf8'), 'short');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
