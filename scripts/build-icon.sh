#!/usr/bin/env bash
# Regenerate assets/icon.icns from assets/icon-master.png by downscaling
# to every size the macOS .icns format expects. Uses macOS-built-in `sips`
# and `iconutil` only — no Homebrew dependency.
set -euo pipefail

MASTER="assets/icon-master.png"
SET="assets/icon.iconset"
ICNS="assets/icon.icns"

[ -f "$MASTER" ] || { echo "missing $MASTER" >&2; exit 1; }

rm -rf "$SET" "$ICNS"
mkdir -p "$SET"

# px:filename suffix, per Apple's icns layout.
sizes=(16:16x16 32:16x16@2x 32:32x32 64:32x32@2x 128:128x128 256:128x128@2x 256:256x256 512:256x256@2x 512:512x512 1024:512x512@2x)

for s in "${sizes[@]}"; do
  px="${s%%:*}"
  name="${s##*:}"
  sips -z "$px" "$px" "$MASTER" --out "$SET/icon_${name}.png" >/dev/null
done

iconutil -c icns "$SET" -o "$ICNS"
rm -rf "$SET"
echo "built $ICNS ($(du -h "$ICNS" | cut -f1))"
