# off-screen

A frameless, transparent, always-on-top macOS window that mirrors a
user-cropped region of any other window in real time.

Built on Electron. Uses the system's native window picker
(`getDisplayMedia` with `useSystemPicker`) so it works against any app
without entitlements or SIP changes.

## Features

- **Pick any window** via the macOS native screen picker.
- **Crop a region** with a drag-to-select rectangle. Live pixel
  dimensions appear during drag.
- **Auto-fit aspect ratio** — the window resizes to match the cropped
  region's ratio so there are no black bars.
- **Variable opacity** (20%–100%) for both chrome and content,
  controlled by a slider in the toolbar or `⌘⇧↑/↓`.
- **Click-through mode** (`⌘⇧M`) — mouse events pass through to apps
  underneath while the mirrored video stays on top. Toolbar fades to
  25% and reappears on hover.
- **Always on top** including over fullscreen apps (`floating` window
  level on macOS).
- **Persistent state** — window bounds and opacity survive restarts.
- **Global show/hide** via `⌘⇧H`.

## Run

```sh
npm install
npm start
```

First launch on macOS will trigger a Screen Recording permission
prompt — grant it under
*System Settings → Privacy & Security → Screen Recording*.

## Build (mac dmg)

```sh
npm run dist
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘⇧H` | Show / hide window (global) |
| `⌘⇧M` | Toggle click-through (global) |
| `⌘⇧↑/↓` | Bump opacity ±5 |
| `⌘H` | Hide window (when focused) |
| `Enter` | Confirm crop selection |
| `Esc` | Discard current crop drag |

## Files

```
main.js             Electron main process (window, IPC, persistence)
preload.js          contextBridge -> exposes window.api to renderer
renderer/
  index.html        Toolbar markup + content stage
  styles.css        Chrome styling + crop overlay + click-through state
  renderer.js       State machine: idle / picking / active
  icons.js          Inline SVG icon strings (subset of lucide)
```

## Caveats

- The mirror is **read-only**: clicks/keys land on the mirror, not on
  the source. Click-through mode lets clicks reach apps *underneath*
  the mirror, but never the mirror's source window.
- macOS PiP windows hosted by `com.apple.PIPAgent` (Apple's system
  Picture-in-Picture) cannot be picked from `getDisplayMedia` —
  they're owned by the agent process and do not appear in the picker.
  Apps that host their own floating window (Douyin, Spotify, IINA,
  etc.) work fine.
