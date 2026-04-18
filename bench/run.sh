#!/usr/bin/env bash
# Run JS reg-cli and Wasm reg-cli against the same fixtures, with OTel tracing enabled.
#
# Prerequisites:
#   1. ./generate.sh        # create bench/fixtures/{expected,actual}
#   2. OTLP collector listening on $OTEL_EXPORTER_OTLP_ENDPOINT (default http://localhost:4318)
#      (e.g. `docker run -p 4318:4318 -p 16686:16686 jaegertracing/jaeger:latest`)
#
# Outputs under bench/out/:
#   - js/{diff,reg.json,report.html,stdout,stderr,time.txt}
#   - wasm/{diff,reg.json,report.html,stdout,stderr,time.txt}

set -euo pipefail

cd "$(dirname "$0")"

FIXTURES_DIR="fixtures"
EXPECTED="$FIXTURES_DIR/expected"
ACTUAL="$FIXTURES_DIR/actual"

if [[ ! -d "$EXPECTED" || ! -d "$ACTUAL" ]]; then
  echo "fixtures not found — run ./generate.sh first" >&2
  exit 1
fi

export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://localhost:4318/v1/traces}"
export OTEL_ENABLED="${OTEL_ENABLED:-true}"

mkdir -p out/js out/wasm

run_one() {
  local label=$1
  shift
  local diff_dir="out/$label/diff"
  local reg_json="out/$label/reg.json"
  local report="out/$label/report.html"

  rm -rf "out/$label"
  mkdir -p "out/$label" "$diff_dir"

  echo "=== $label: $* ==="
  # high-resolution wall-clock via /usr/bin/time -l
  /usr/bin/time -l "$@" \
    "$ACTUAL" "$EXPECTED" "$diff_dir" \
    --json "$reg_json" --report "$report" \
    > "out/$label/stdout" 2> "out/$label/time.txt" \
    || echo "  (exited non-zero)"

  echo "  stdout tail:"
  tail -5 "out/$label/stdout" | sed 's/^/    /'
  echo "  time summary:"
  grep -E "(real|elapsed|user|sys|maximum resident|wall clock)" "out/$label/time.txt" | sed 's/^/    /' || true
  echo
}

REPO_ROOT="$(cd .. && pwd)"

# --- JS (classic) version -----------------------------------------------------
JS_CLI="$REPO_ROOT/dist/cli.js"
if [[ -f "$JS_CLI" ]]; then
  run_one js node "$JS_CLI"
else
  echo "WARN: $JS_CLI not found. Skip JS run. (npm run build at repo root first)"
fi

# --- Wasm version -------------------------------------------------------------
WASM_CLI="$REPO_ROOT/js/dist/cli.mjs"
if [[ -f "$WASM_CLI" ]]; then
  run_one wasm node "$WASM_CLI"
else
  echo "WARN: $WASM_CLI not found. Skip Wasm run. (cd js && pnpm build first)"
fi

echo "Done. Inspect traces at your OTLP backend (default: Jaeger http://localhost:16686)."
echo "Services expected in Jaeger: reg-cli-js, reg-cli-wasm"
