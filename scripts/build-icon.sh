#!/usr/bin/env bash
# Regenerate assets/icon.icns from assets/icon.svg.
# Requires: librsvg (`brew install librsvg`) and macOS `iconutil`.
set -euo pipefail

SVG="assets/icon.svg"
SET="assets/icon.iconset"
ICNS="assets/icon.icns"

command -v rsvg-convert >/dev/null || {
  echo "rsvg-convert not found — install with: brew install librsvg" >&2
  exit 1
}

rm -rf "$SET" "$ICNS"
mkdir -p "$SET"

sizes=(16:16x16 32:16x16@2x 32:32x32 64:32x32@2x 128:128x128 256:128x128@2x 256:256x256 512:256x256@2x 512:512x512 1024:512x512@2x)
for s in "${sizes[@]}"; do
  px="${s%%:*}"
  name="${s##*:}"
  rsvg-convert -w "$px" -h "$px" "$SVG" -o "$SET/icon_${name}.png"
done

iconutil -c icns "$SET" -o "$ICNS"
rm -rf "$SET"
echo "built $ICNS ($(du -h "$ICNS" | cut -f1))"
