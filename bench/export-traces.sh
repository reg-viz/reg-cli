#!/usr/bin/env bash
# Fetch the most recent traces from Jaeger for both services and write them to
# bench/out/*/trace.json. Also writes a combined bench/out/traces.json for the
# HTML visualizer.
#
# Usage:
#   ./export-traces.sh                   # grab latest 1 trace per service
#   JAEGER_UI=http://localhost:16686 ... # override Jaeger UI base URL

set -euo pipefail

cd "$(dirname "$0")"

UI="${JAEGER_UI:-http://localhost:16686}"
LOOKBACK="${LOOKBACK:-1h}"

fetch() {
  local service=$1
  local out=$2
  curl -s "${UI}/api/traces?service=${service}&limit=1&lookback=${LOOKBACK}" > "$out"
  if [[ ! -s "$out" ]] || grep -q '"data":\s*\[\s*\]' "$out"; then
    echo "warn: no traces for service=$service" >&2
    return 1
  fi
  local span_count
  span_count=$(python3 -c "import json; d=json.load(open('$out')); print(len(d['data'][0]['spans']))")
  echo "  $service: $span_count spans -> $out"
}

mkdir -p out/js out/wasm
fetch reg-cli-js out/js/trace.json || true
fetch reg-cli     out/wasm/trace.json || true

# Combine into one file the visualizer can consume directly.
python3 - <<'PY'
import json, os, sys

def load(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        d = json.load(f)
    if not d.get('data'):
        return None
    return d['data'][0]

out = {
    'js':   load('out/js/trace.json'),
    'wasm': load('out/wasm/trace.json'),
}

with open('out/traces.json', 'w') as f:
    json.dump(out, f, indent=2)

print(f"combined -> out/traces.json ({os.path.getsize('out/traces.json')} bytes)")
PY
