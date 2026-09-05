import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CLI = join(REPO, 'dist', 'cli.mjs');

const COUNT = 60;
const WIDTH = 1280;
const HEIGHT = 8000;

const crcTable = new Uint32Array(256);
for (let n = 0; n < crcTable.length; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[n] = value >>> 0;
}

const crc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksumInput = Buffer.concat([typeBuffer, data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(checksumInput));
  return Buffer.concat([length, checksumInput, checksum]);
};

const stripedPng = (period, seed) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 2;

  const rowLength = 1 + WIDTH * 3;
  const pixels = Buffer.allocUnsafe(rowLength * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const offset = y * rowLength;
    pixels[offset] = 0;
    const inLine = y % period < period * 0.6;
    const shade = inLine ? 40 + ((y + seed) % 60) : 255;
    pixels.fill(shade, offset + 1, offset + rowLength);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels, { level: 1 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const runCli = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: REPO });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (data) => stdout.push(data));
    child.stderr.on('data', (data) => stderr.push(data));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });

test(
  'large tall-image batch completes without exhausting Wasm memory (#668)',
  { timeout: 180_000 },
  async () => {
    const root = join(REPO, 'test', `__wasm_oom_${process.pid}`);
    const actual = join(root, 'actual');
    const expected = join(root, 'expected');
    const diff = join(root, 'diff');
    const report = join(root, 'report.html');
    const json = join(root, 'report.json');

    await rm(root, { recursive: true, force: true });
    await Promise.all([
      mkdir(actual, { recursive: true }),
      mkdir(expected, { recursive: true }),
    ]);

    try {
      for (let index = 0; index < COUNT; index++) {
        const name = `page-${String(index).padStart(3, '0')}.png`;
        await Promise.all([
          writeFile(join(actual, name), stripedPng(21, index)),
          writeFile(join(expected, name), stripedPng(20, index)),
        ]);
      }

      const result = await runCli([
        relative(REPO, actual),
        relative(REPO, expected),
        relative(REPO, diff),
        '-R',
        relative(REPO, report),
        '-J',
        relative(REPO, json),
      ]);

      assert.equal(
        result.code,
        1,
        `expected the normal differences exit code; stderr:\n${result.stderr}`,
      );
      assert.doesNotMatch(result.stderr, /memory allocation|unreachable/i);

      const jsonReport = JSON.parse(await readFile(json, 'utf8'));
      const failedImages = jsonReport.failedItems.filter(
        (path) => !path.split('/').at(-1).startsWith('._'),
      );
      const diffImages = (await readdir(diff)).filter(
        (name) => !name.startsWith('._'),
      );
      assert.equal(failedImages.length, COUNT);
      assert.equal(diffImages.length, COUNT);
      await readFile(report);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
