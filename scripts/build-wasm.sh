#!/bin/bash
# Build script for WASM target with wasi-sdk
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# wasi-sdk version
WASI_VERSION=25
WASI_VERSION_FULL=${WASI_VERSION}.0

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
    WASI_SDK_ARCH="arm64-macos"
elif [ "$ARCH" = "x86_64" ]; then
    WASI_SDK_ARCH="x86_64-macos"
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

WASI_SDK_DIR="wasi-sdk-${WASI_VERSION_FULL}-${WASI_SDK_ARCH}"
WASI_SDK_PATH="${PROJECT_ROOT}/${WASI_SDK_DIR}"

# Download wasi-sdk if not exists
if [ ! -d "$WASI_SDK_PATH" ]; then
    echo "Downloading wasi-sdk ${WASI_VERSION_FULL}..."
    curl -LO "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_VERSION}/wasi-sdk-${WASI_VERSION_FULL}-${WASI_SDK_ARCH}.tar.gz"
    tar xf "wasi-sdk-${WASI_VERSION_FULL}-${WASI_SDK_ARCH}.tar.gz"
    rm "wasi-sdk-${WASI_VERSION_FULL}-${WASI_SDK_ARCH}.tar.gz"
fi

echo "Using wasi-sdk at: $WASI_SDK_PATH"

# Set environment variables for wasi-sdk
export CC="${WASI_SDK_PATH}/bin/clang"
export CXX="${WASI_SDK_PATH}/bin/clang++"
export CFLAGS="--sysroot=${WASI_SDK_PATH}/share/wasi-sysroot"

# Build
echo "Building for wasm32-wasip1-threads..."
cargo build --release --target=wasm32-wasip1-threads

# Copy to js directory
echo "Copying wasm to js/reg.wasm..."
cp target/wasm32-wasip1-threads/release/reg_cli.wasm js/reg.wasm

echo "Build complete!"
ls -la js/reg.wasm

