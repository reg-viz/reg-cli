# JS vs Wasm fair benchmark

Environment: macOS (Apple Silicon) / Node v20.19.0 / warm median / `time` command.
Fixture: `bench/fixtures/` via `./generate.sh` (20 pairs, 5 mutation types).

## Setup caveats surfaced during investigation

Before the numbers below are trustworthy, the following gaps had to be closed
(otherwise the comparison was apples-to-oranges):

1. **Output format mismatch** — JS classic always writes PNG diff images; Wasm
   always wrote WebP. WebP encode is cheaper for diff images (mostly solid
   colour + a few red pixels), so some of the Wasm wall-clock win came from
   the encoder, not compute.
   **Fix:** add `EncodeFormat::{Webp, Png}` to `image-diff-rs`, expose it as
   `--diffFormat {webp,png}` on `reg-cli`.
2. **WASI preopen sandbox** — mixing absolute paths (e.g. `/tmp/...`) with
   relative preopens causes a trap. Not a bug, but invalidated some earlier
   ad-hoc measurements that used `/tmp` directories.
   **Fix:** all measurements below use relative paths (under `bench/`).
3. **`pathdiff::diff_paths` panic** — when native `reg-cli` was invoked with
   a mix of absolute report paths and relative fixture paths, `resolve_dir`
   called `.expect(...)` on `None` and panicked. Replaced with canonicalize-
   through-CWD + graceful fallback. Unit tested.
4. **`postMessage` in `worker_threads`** — bare `postMessage` is a Web Worker
   global, not exposed in Node's `worker_threads`. `parentPort?.postMessage`
   is the correct form.
5. **`sdk.shutdown()` + 2 s sleep** — an OTel workaround added 2000 ms to
   every run when `OTEL_ENABLED=true`. Removed.
6. **`reg.json` write** — JS writes it to disk; Wasm returns it as a string.
   Tiny diff, left as-is.

## Final numbers — apples-to-apples (both PNG)

| workload | JS (PNG) | Wasm `--diffFormat png` | ratio |
|---|---:|---:|---:|
| 20 × 1280×720 | 0.71 s | **0.46 s** | **1.54× faster** |
| 1 × 1280×720 | 0.31 s | 0.27 s | 1.15× faster |
| 1 × 3840×2160 (4K) | 0.92 s | **0.42 s** | **2.19× faster** |
| identical × 20 (skip path) | 0.30 s | 0.29 s | ~equal |

The `identical × 20` row confirms the pure startup / module-load baseline is
close between JS and Wasm on this host. The other rows show Wasm's compute
win when there is actual diff work to do, scaling with image size.

## Default behaviour — JS PNG vs Wasm WebP

| workload | JS (PNG) | Wasm (WebP default) | ratio |
|---|---:|---:|---:|
| 20 × 1280×720 | 0.71 s | 0.54 s | 1.31× faster |

i.e. even with the format-cost confound left in, Wasm is 1.3× faster out of
the box.

## Interesting side finding

On `wasm32-wasip1-threads` with our current libwebp build, the **PNG encoder
from the `image` crate is faster than the libwebp FFI encoder** for diff
images of this shape:

```
Wasm 20 × 1280×720, warm median:
  --diffFormat png   0.46 s
  (default webp)     0.54 s
```

Suggests the libwebp cc build is missing `-msimd128` or similar; follow-up
task.

## Reproduce

```sh
# 0. prerequisites: Docker, ImageMagick (`brew install imagemagick`)

# 1. fixtures
cd reg-cli/bench
./generate.sh

# 2. build
cd ..
npm i && npm run build             # JS
./scripts/build-wasm.sh            # wasm
cd js && pnpm i && pnpm build      # JS bridge (copies reg.wasm into dist/shared)

# 3. OTel (optional — only needed for traces + visualizer)
docker run --rm -d -p 4318:4318 -p 16686:16686 jaegertracing/jaeger:latest

# 4. benchmark
cd ../bench
OTEL_ENABLED=true ./run.sh         # captures traces
./export-traces.sh                 # -> out/traces.json

# 5. visualize (in another shell)
python3 -m http.server 8766
open http://localhost:8766/viz/compare.html
```

## Span breakdown (Wasm, 20 × 1280×720, PNG output)

4-worker parallel totals:

- `compare_pixels` (pixelmatch) — dominant
- `encode_png` or `encode_webp_ffi` — second
- `decode_image_crate` (PNG) — small (~8%)
- `worker.wasm_compile` × 4 — ~22 ms
- `build_thread_pool` — ~1 ms
- boot overhead (`main.*`, `entry.wasm_*`) — ~35 ms

CPU is in pixel compare + encode; Wasm / thread / boundary overhead is not
dominant at this scale.
