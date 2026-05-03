#!/bin/bash
# Build the wasm32-wasip1-threads bundle (`reg.wasm`) using a pinned
# wasi-sdk. Idempotent: downloads wasi-sdk on first run, reuses it
# afterwards. Supports macOS (arm64 / x86_64) and Linux (x86_64 / arm64).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# wasi-sdk version (kept in sync with the rust-toolchain.toml nightly pin
# so wasm symbols line up with rustc's intrinsics).
WASI_VERSION=25
WASI_VERSION_FULL=${WASI_VERSION}.0

# OS + arch detection → wasi-sdk asset name. Supported triples:
#   arm64-macos   x86_64-macos   x86_64-linux   arm64-linux
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS-$ARCH" in
  Darwin-arm64|Darwin-aarch64) WASI_SDK_ARCH="arm64-macos"   ;;
  Darwin-x86_64)               WASI_SDK_ARCH="x86_64-macos"  ;;
  Linux-x86_64)                WASI_SDK_ARCH="x86_64-linux"  ;;
  Linux-aarch64|Linux-arm64)   WASI_SDK_ARCH="arm64-linux"   ;;
  *)
    echo "Unsupported OS/arch combination: $OS / $ARCH" >&2
    echo "wasi-sdk pre-built assets only ship for macOS and Linux on x86_64/arm64." >&2
    exit 1
    ;;
esac

WASI_SDK_DIR="wasi-sdk-${WASI_VERSION_FULL}-${WASI_SDK_ARCH}"
WASI_SDK_PATH="${PROJECT_ROOT}/${WASI_SDK_DIR}"

# Download wasi-sdk if missing. ~80 MB; cached under PROJECT_ROOT and
# gitignored via .gitignore (`wasi-sdk-*`).
if [ ! -d "$WASI_SDK_PATH" ]; then
  echo "Downloading wasi-sdk ${WASI_VERSION_FULL} for ${WASI_SDK_ARCH}..."
  curl -fLO "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_VERSION}/wasi-sdk-${WASI_VERSION_FULL}-${WASI_SDK_ARCH}.tar.gz"
  tar xf "wasi-sdk-${WASI_VERSION_FULL}-${WASI_SDK_ARCH}.tar.gz"
  rm "wasi-sdk-${WASI_VERSION_FULL}-${WASI_SDK_ARCH}.tar.gz"
fi

echo "Using wasi-sdk at: $WASI_SDK_PATH"

# Make sure the rustup target is installed for whichever toolchain the
# project pins (rust-toolchain.toml). Cheap if already added.
if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-wasip1-threads >/dev/null
fi

# wasi-sdk's clang + sysroot — required because some transitive crates
# pull in a bundled C library that needs a working WASI libc.
export CC="${WASI_SDK_PATH}/bin/clang"
export CXX="${WASI_SDK_PATH}/bin/clang++"
export CFLAGS="--sysroot=${WASI_SDK_PATH}/share/wasi-sysroot"

echo "Building for wasm32-wasip1-threads..."
cargo build --release --target=wasm32-wasip1-threads

# Place reg.wasm at the repo root — `build.config.ts` picks it up from
# here and stages it into `dist/shared/reg.wasm` during `pnpm build`.
echo "Copying wasm to ./reg.wasm..."
cp target/wasm32-wasip1-threads/release/reg_cli.wasm reg.wasm

echo "Build complete!"
ls -la reg.wasm
