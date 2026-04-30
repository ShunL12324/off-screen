/**
 * Main process: owns the BrowserWindow, persistent state on disk,
 * IPC handlers for window controls, and global shortcuts.
 *
 * The window is frameless + transparent + always-on-top so it can float
 * over other apps. Click-through (setIgnoreMouseEvents) is the feature
 * that makes the renderer worth its weight: clicks pass through to apps
 * underneath, so the user can keep working while a mirrored video plays.
 */
const { app, BrowserWindow, globalShortcut, ipcMain, screen, session } = require("electron");
const path = require("path");
const fs = require("fs");

// --- Persistent state ----------------------------------------------------
// Bounds + opacity survive across launches. Stored as JSON in Electron's
// userData dir (~/Library/Application Support/off-screen on macOS).
const STATE_PATH = path.join(app.getPath("userData"), "state.json");
const DEFAULT_STATE = {
  bounds: { width: 640, height: 420 },
  opacity: 85,
};

function loadState() {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

let state = loadState();
let saveTimer = null;
function saveState() {
  // Debounce: resize/move fire at high rate while dragging.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    } catch {}
  }, 200);
}

// Saved bounds may reference a display that's no longer connected.
// Reject them so we fall back to the default centered placement.
function clampBoundsToDisplay(b) {
  if (!b) return null;
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return (
      b.x !== undefined &&
      b.y !== undefined &&
      b.x + b.width > a.x + 40 &&
      b.y + b.height > a.y + 40 &&
      b.x < a.x + a.width - 40 &&
      b.y < a.y + a.height - 40
    );
  });
  return onScreen ? b : null;
}

// --- Window --------------------------------------------------------------
let win;

function createWindow() {
  const saved = clampBoundsToDisplay(state.bounds) || {};
  win = new BrowserWindow({
    width: saved.width || 640,
    height: saved.height || 420,
    x: saved.x,
    y: saved.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    icon: path.join(__dirname, "assets", "icon.icns"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // "floating" raises above all normal windows including fullscreen ones
  // on macOS. Plain alwaysOnTop sits below fullscreen apps.
  win.setAlwaysOnTop(true, "floating");
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  const persistBounds = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    state.bounds = win.getBounds();
    saveState();
  };
  win.on("resize", persistBounds);
  win.on("move", persistBounds);
}

// --- IPC: window controls ------------------------------------------------
ipcMain.on("win:hide", () => win && win.hide());
ipcMain.on("win:close", () => win && win.close());
ipcMain.on("win:aot", (_e, v) => win && win.setAlwaysOnTop(!!v, "floating"));

let clickThrough = false;
function setClickThrough(v) {
  if (!win) return;
  clickThrough = !!v;
  // forward:true keeps mouse-move events flowing so the renderer can still
  // react to hover (we use this to fade the toolbar back in on hover).
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
  win.webContents.send("win:click-through-changed", clickThrough);
}
ipcMain.on("win:click-through", (_e, v) => setClickThrough(v));

// Resize the window so the content area matches the cropped region's
// aspect ratio. Width stays fixed; height adjusts.
ipcMain.on("win:fit-aspect", (_e, ratio) => {
  if (!win || !ratio || ratio <= 0) return;
  const CHROME_H = 44; // must match #topbar height in styles.css
  const b = win.getBounds();
  const contentH = Math.round(b.width / ratio);
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: contentH + CHROME_H });
});

// --- IPC: state read/write ----------------------------------------------
ipcMain.handle("state:get", () => state);
ipcMain.on("state:set", (_e, partial) => {
  if (partial && typeof partial === "object") {
    state = { ...state, ...partial };
    saveState();
  }
});

// --- App lifecycle -------------------------------------------------------
app.whenReady().then(() => {
  // Use macOS's native window picker for getDisplayMedia (Electron 27+).
  // The handler returns no preselection so the picker fully drives choice.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_req, cb) => cb({ video: undefined, audio: undefined }),
    { useSystemPicker: true }
  );

  createWindow();

  // Global shortcuts work even when another app has focus -- the whole
  // point of a stealth overlay tool is to control it without breaking flow.
  globalShortcut.register("CommandOrControl+Shift+H", () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else win.show();
  });
  globalShortcut.register("CommandOrControl+Shift+M", () => {
    setClickThrough(!clickThrough);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => globalShortcut.unregisterAll());
