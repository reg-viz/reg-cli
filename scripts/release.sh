#!/bin/bash
# One-shot publish-prep: from a clean checkout, produce a tarball that's
# ready for `npm publish`. Used both for local verification and for any
# CI job that wants to gate on a successful pack.
#
# What it runs (in order):
#   1. scripts/build-ui.sh <REPORT_UI_TAG>   → report/ui/dist/{report.js,style.css}
#                                              (consumed by reg_core via
#                                               include_str! at compile time)
#   2. scripts/build-wasm.sh                 → ./reg.wasm   (wasi-sdk + cargo)
#   3. pnpm install --frozen-lockfile        → node_modules
#   4. pnpm build                            → dist/   (unbuild + reg.wasm staging)
#   5. npm pack [--dry-run]                  → tarball
#
# Usage:
#   scripts/release.sh                       # builds + dry-run pack
#   scripts/release.sh --pack                # builds + writes the .tgz
#   REPORT_UI_TAG=v0.6.0 scripts/release.sh  # override the UI version
#
# Env vars:
#   REPORT_UI_TAG   default v0.5.0           (passed to build-ui.sh)
#   SKIP_UI=1       skip the UI build (assumes report/ui/dist/ already exists)
#   SKIP_WASM=1     skip the wasm rebuild   (assumes ./reg.wasm already exists)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

REPORT_UI_TAG="${REPORT_UI_TAG:-v0.5.0}"
PACK_MODE="--dry-run"
if [ "${1:-}" = "--pack" ]; then
  PACK_MODE=""
fi

echo "==> [1/5] report-ui ${REPORT_UI_TAG}"
if [ "${SKIP_UI:-0}" = "1" ]; then
  echo "    (skipped — SKIP_UI=1)"
else
  sh "$SCRIPT_DIR/build-ui.sh" "$REPORT_UI_TAG"
fi

echo "==> [2/5] wasm bundle (wasi-sdk + cargo build --release)"
if [ "${SKIP_WASM:-0}" = "1" ]; then
  echo "    (skipped — SKIP_WASM=1)"
else
  bash "$SCRIPT_DIR/build-wasm.sh"
fi

echo "==> [3/5] pnpm install"
pnpm install --frozen-lockfile

echo "==> [4/5] pnpm build (dist + bundled reg.wasm)"
pnpm build

echo "==> [5/5] npm pack ${PACK_MODE}"
# Run pack from the repo root (the published package).
npm pack ${PACK_MODE}

echo
echo "Release prep complete."
if [ -z "$PACK_MODE" ]; then
  ls -la *.tgz
fi
