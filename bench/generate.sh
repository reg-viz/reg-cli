#!/usr/bin/env bash
# Generate 20 pairs of slightly different PNG images for JS vs Wasm trace comparison.
#
# Layout:
#   bench/fixtures/expected/001.png ... 020.png   (baseline)
#   bench/fixtures/actual/001.png   ... 020.png   (slightly modified)
#
# Approach:
#   1. For each index, render a "baseline" UI-like PNG.
#   2. expected/NNN.png = baseline
#   3. actual/NNN.png   = baseline + small mutation (composite on top, or re-render shifted)
#
# Requires: ImageMagick (`magick` command). No fonts needed.

set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR="fixtures"
EXPECTED="$OUT_DIR/expected"
ACTUAL="$OUT_DIR/actual"
DIFF="$OUT_DIR/diff"

rm -rf "$OUT_DIR"
mkdir -p "$EXPECTED" "$ACTUAL" "$DIFF"

W=1280
H=720

seeded_hue()  { echo $(( ($1 * 137) % 360 )); }
seeded_gray() { echo $(( 30 + ($1 * 7) % 60 )); }

# Render a baseline "UI-like" image at the given path.
# Args: <out_path> <index> <dx>
#   dx: horizontal shift for inner cards (used by mutation=shift)
render_base() {
  local out=$1
  local i=$2
  local dx=${3:-0}

  local hue
  hue=$(seeded_hue "$i")
  local hue2=$(( (hue + 40) % 360 ))
  local gray
  gray=$(seeded_gray "$i")

  local bg1="hsl($hue, 40%, ${gray}%)"
  local bg2="hsl($hue2, 50%, $((gray + 10))%)"
  local accent="hsl($hue, 80%, 50%)"
  local progress_col="hsl($hue, 50%, 45%)"
  local line_col="hsl($hue2, 30%, 70%)"

  local c1x1=$(( 80 + dx ))  ; local c1x2=$(( 420 + dx ))
  local c2x1=$(( 460 + dx )) ; local c2x2=$(( 800 + dx ))
  local c3x1=$(( 840 + dx )) ; local c3x2=$(( 1180 + dx ))

  local pw=$(( 200 + (i * 9) % 180 ))

  magick -size ${W}x${H} \
    gradient:"${bg1}-${bg2}" \
    -fill "rgba(0,0,0,0.6)" -draw "rectangle 0,0 ${W},96" \
    -fill "rgba(255,255,255,0.95)" \
      -draw "roundrectangle ${c1x1},160 ${c1x2},560 12,12" \
      -draw "roundrectangle ${c2x1},160 ${c2x2},560 12,12" \
      -draw "roundrectangle ${c3x1},160 ${c3x2},560 12,12" \
    -fill "$accent" \
      -draw "roundrectangle ${c1x1},160 ${c1x2},240 12,12" \
      -draw "roundrectangle ${c2x1},160 ${c2x2},240 12,12" \
      -draw "roundrectangle ${c3x1},160 ${c3x2},240 12,12" \
    -fill "$progress_col" \
      -draw "rectangle $((c1x1 + 24)),420 $((c1x1 + 24 + pw)),440" \
      -draw "rectangle $((c2x1 + 24)),420 $((c2x1 + 24 + pw)),440" \
      -draw "rectangle $((c3x1 + 24)),420 $((c3x1 + 24 + pw)),440" \
    -fill "$line_col" \
      -draw "rectangle $((c1x1 + 24)),470 $((c1x2 - 24)),480" \
      -draw "rectangle $((c2x1 + 24)),470 $((c2x2 - 24)),480" \
      -draw "rectangle $((c3x1 + 24)),470 $((c3x2 - 24)),480" \
      -draw "rectangle $((c1x1 + 24)),500 $((c1x2 - 60)),510" \
      -draw "rectangle $((c2x1 + 24)),500 $((c2x2 - 60)),510" \
      -draw "rectangle $((c3x1 + 24)),500 $((c3x2 - 60)),510" \
    -fill "rgba(255,255,255,0.6)" -draw "rectangle 40,40 300,64" \
    -depth 8 -define png:color-type=6 -define png:bit-depth=8 \
    "$out"
}

# Render a baseline with hue shifted by +delta degrees (for mutation=hue)
render_hue_shifted() {
  local out=$1
  local i=$2
  local delta=$3

  local hue
  hue=$(seeded_hue "$i")
  local new_i=$(( i + delta ))  # unused; we rebuild via manual hue shift
  local hue_shift=6

  # Re-run render_base but with hue shifted. Simpler: reuse render_base on a virtual index
  # whose seeded_hue() would give (hue + 6). Instead let's duplicate render_base with override.
  local hue2=$(( (hue + hue_shift + 40) % 360 ))
  local hue_new=$(( (hue + hue_shift) % 360 ))
  local gray
  gray=$(seeded_gray "$i")

  local bg1="hsl($hue_new, 40%, ${gray}%)"
  local bg2="hsl($hue2, 50%, $((gray + 10))%)"
  local accent="hsl($hue_new, 80%, 50%)"
  local progress_col="hsl($hue_new, 50%, 45%)"
  local line_col="hsl($hue2, 30%, 70%)"

  local c1x1=80  ; local c1x2=420
  local c2x1=460 ; local c2x2=800
  local c3x1=840 ; local c3x2=1180
  local pw=$(( 200 + (i * 9) % 180 ))

  magick -size ${W}x${H} \
    gradient:"${bg1}-${bg2}" \
    -fill "rgba(0,0,0,0.6)" -draw "rectangle 0,0 ${W},96" \
    -fill "rgba(255,255,255,0.95)" \
      -draw "roundrectangle ${c1x1},160 ${c1x2},560 12,12" \
      -draw "roundrectangle ${c2x1},160 ${c2x2},560 12,12" \
      -draw "roundrectangle ${c3x1},160 ${c3x2},560 12,12" \
    -fill "$accent" \
      -draw "roundrectangle ${c1x1},160 ${c1x2},240 12,12" \
      -draw "roundrectangle ${c2x1},160 ${c2x2},240 12,12" \
      -draw "roundrectangle ${c3x1},160 ${c3x2},240 12,12" \
    -fill "$progress_col" \
      -draw "rectangle $((c1x1 + 24)),420 $((c1x1 + 24 + pw)),440" \
      -draw "rectangle $((c2x1 + 24)),420 $((c2x1 + 24 + pw)),440" \
      -draw "rectangle $((c3x1 + 24)),420 $((c3x1 + 24 + pw)),440" \
    -fill "$line_col" \
      -draw "rectangle $((c1x1 + 24)),470 $((c1x2 - 24)),480" \
      -draw "rectangle $((c2x1 + 24)),470 $((c2x2 - 24)),480" \
      -draw "rectangle $((c3x1 + 24)),470 $((c3x2 - 24)),480" \
      -draw "rectangle $((c1x1 + 24)),500 $((c1x2 - 60)),510" \
      -draw "rectangle $((c2x1 + 24)),500 $((c2x2 - 60)),510" \
      -draw "rectangle $((c3x1 + 24)),500 $((c3x2 - 60)),510" \
    -fill "rgba(255,255,255,0.6)" -draw "rectangle 40,40 300,64" \
    -depth 8 -define png:color-type=6 -define png:bit-depth=8 \
    "$out"
}

# Apply a single localized mutation to an existing image.
# Args: <in_path> <out_path> <mutation>
apply_mutation() {
  local in=$1
  local out=$2
  local mut=$3

  case "$mut" in
    badge)
      magick "$in" -fill "#ff5252" -draw "circle 1200,60 1200,84" \
        -depth 8 -define png:color-type=6 -define png:bit-depth=8 "$out"
      ;;
    rect)
      magick "$in" -fill "#4caf50" -draw "rectangle 1120,640 1240,680" \
        -depth 8 -define png:color-type=6 -define png:bit-depth=8 "$out"
      ;;
    stripe)
      magick "$in" -fill "#ffeb3b" -draw "rectangle 0,120 ${W},124" \
        -depth 8 -define png:color-type=6 -define png:bit-depth=8 "$out"
      ;;
    *)
      cp "$in" "$out"
      ;;
  esac
}

MUTATIONS=(none none none none \
           shift shift shift shift \
           hue hue hue hue \
           badge badge badge badge \
           rect rect stripe stripe)

for i in $(seq 1 20); do
  idx=$(printf "%03d" "$i")
  mut=${MUTATIONS[$((i - 1))]}

  # Expected: always the plain baseline.
  render_base "$EXPECTED/${idx}.png" "$i" 0

  # Actual: depends on mutation.
  case "$mut" in
    none)   cp "$EXPECTED/${idx}.png" "$ACTUAL/${idx}.png" ;;
    shift)  render_base        "$ACTUAL/${idx}.png" "$i" 4 ;;
    hue)    render_hue_shifted "$ACTUAL/${idx}.png" "$i" 6 ;;
    badge|rect|stripe) apply_mutation "$EXPECTED/${idx}.png" "$ACTUAL/${idx}.png" "$mut" ;;
  esac

  printf "  [%s] mutation=%-7s\n" "$idx" "$mut"
done

echo
echo "Generated:"
echo "  expected: $(ls "$EXPECTED" | wc -l | tr -d ' ') images"
echo "  actual:   $(ls "$ACTUAL" | wc -l | tr -d ' ') images"
echo "  resolution: ${W}x${H}"
du -sh "$EXPECTED" "$ACTUAL"
