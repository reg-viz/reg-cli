// Host `fs` adapter handed to `@tybys/wasm-util`'s WASI.
//
// wasm-util's `path_open` translates WASI `oflags` / `fdflags` into *Linux*
// `fcntl` bit values (`O_CREAT=0x40`, `O_TRUNC=0x200`, `O_APPEND=0x400`, ...)
// and passes that number straight to `fs.openSync`. Node forwards numeric
// flags to the platform `open(2)` untouched, and it only remaps them for
// win32. On macOS / BSD the bits mean something else — Darwin's
// `O_CREAT=0x200`, `O_TRUNC=0x400` — so Rust's `File::create` (Linux
// `WRONLY|CREAT|TRUNC = 0x241`) reaches the kernel as `WRONLY|O_CREAT`:
// the file is created but never truncated, and a shorter second write
// leaves stale bytes from the first run behind (a truncated reg.json /
// junit.xml / diff image). Remap the bits to whatever `fs.constants`
// reports for the running host before they reach `open(2)`.
import fs from 'node:fs';
import type { IFs } from '@tybys/wasm-util';

// Linux fcntl values, as emitted by wasm-util's `pathOpen()`.
const LINUX_O_CREAT = 0x40;
const LINUX_O_EXCL = 0x80;
const LINUX_O_TRUNC = 0x200;
const LINUX_O_APPEND = 0x400;
const LINUX_O_NONBLOCK = 0x800;
const LINUX_O_DIRECTORY = 0x10000;
const LINUX_O_SYNC = 0x101000;
const LINUX_ACCMODE = 0x3;

type OpenFlagConstants = Partial<
  Pick<
    typeof fs.constants,
    | 'O_CREAT'
    | 'O_EXCL'
    | 'O_TRUNC'
    | 'O_APPEND'
    | 'O_NONBLOCK'
    | 'O_DIRECTORY'
    | 'O_SYNC'
  >
>;

/**
 * Translate Linux-encoded `open(2)` flags into the host's encoding using
 * the constants Node exposes for the running platform. Non-numeric flags
 * (`'r'`, `'w'`, ...) are returned untouched.
 */
export const toHostOpenFlags = (
  flags: number | string,
  constants: OpenFlagConstants = fs.constants,
): number | string => {
  if (typeof flags !== 'number') return flags;
  let r = flags & LINUX_ACCMODE;
  if (flags & LINUX_O_CREAT) r |= constants.O_CREAT ?? 0;
  if (flags & LINUX_O_EXCL) r |= constants.O_EXCL ?? 0;
  if (flags & LINUX_O_TRUNC) r |= constants.O_TRUNC ?? 0;
  if (flags & LINUX_O_APPEND) r |= constants.O_APPEND ?? 0;
  if (flags & LINUX_O_NONBLOCK) r |= constants.O_NONBLOCK ?? 0;
  if (flags & LINUX_O_DIRECTORY) r |= constants.O_DIRECTORY ?? 0;
  if ((flags & LINUX_O_SYNC) === LINUX_O_SYNC) r |= constants.O_SYNC ?? 0;
  return r;
};

/**
 * `node:fs` with `openSync` / `promises.open` remapping Linux flag bits to
 * the host's. wasm-util already does its own Linux→Windows translation, so
 * on win32 the flags it passes are not Linux-encoded and must pass through.
 */
export const createHostFs = (): IFs => {
  if (process.platform === 'win32') return fs as unknown as IFs;
  const openSync: typeof fs.openSync = (path, flags, mode) =>
    fs.openSync(path, toHostOpenFlags(flags as number | string), mode);
  const open: typeof fs.promises.open = (path, flags, mode) =>
    fs.promises.open(path, toHostOpenFlags(flags as number | string), mode);
  const promises = Object.create(fs.promises, {
    open: { value: open, enumerable: true },
  });
  return Object.create(fs, {
    openSync: { value: openSync, enumerable: true },
    promises: { value: promises, enumerable: true },
  }) as IFs;
};
