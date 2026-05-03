// Parse live `compare` progress events out of the Wasm's stderr stream.
//
// `crates/reg_core/src/lib.rs` emits one line per event while the diff
// loop runs:
//
//     __REG_CLI_EVT__\t{"type":"pass|fail|new|delete","path":"..."}\n
//
// The WASI host (entry.ts + worker.ts) installs `printErr` via
// `@tybys/wasm-util`; this module owns the parsing + forwarding logic so
// both hosts stay in sync on the wire format. Non-event stderr lines pass
// through unchanged to `console.error`, so real error output still
// reaches the user.

const MARKER = '__REG_CLI_EVT__\t';

export type CompareEventKind = 'pass' | 'fail' | 'new' | 'delete';
export type CompareEvent = { type: CompareEventKind; path: string };

/**
 * Build a WASI `printErr` hook that forwards progress events to `onEvent`
 * and everything else to `fallback` (defaults to `console.error`).
 *
 * `@tybys/wasm-util`'s `StandardOutput.write` already buffers until a
 * newline and invokes the callback with one stripped line per call (see
 * `node_modules/@tybys/wasm-util/dist/wasm-util.esm-bundler.js` line
 * ~749-779). So we can treat each invocation as a single complete line.
 */
export const createPrintErrHook = (
  onEvent: (ev: CompareEvent) => void,
  fallback: (s: string) => void = (s) => console.error(s),
): ((s: string) => void) => {
  return (line: string) => {
    if (line.startsWith(MARKER)) {
      const json = line.slice(MARKER.length);
      try {
        const ev = JSON.parse(json) as CompareEvent;
        if (ev && typeof ev.type === 'string' && typeof ev.path === 'string') {
          onEvent(ev);
          return;
        }
      } catch {
        // Malformed — fall through so the user at least sees the line.
      }
    }
    fallback(line);
  };
};
