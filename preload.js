/**
 * Preload script: the only bridge between renderer and main.
 * contextIsolation is on, nodeIntegration is off — the renderer cannot
 * touch Node directly, so anything privileged is funneled through here.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  hide: () => ipcRenderer.send("win:hide"),
  close: () => ipcRenderer.send("win:close"),
  toggleAlwaysOnTop: (v) => ipcRenderer.send("win:aot", v),
  setClickThrough: (v) => ipcRenderer.send("win:click-through", v),
  fitAspect: (ratio) => ipcRenderer.send("win:fit-aspect", ratio),
  getState: () => ipcRenderer.invoke("state:get"),
  setState: (partial) => ipcRenderer.send("state:set", partial),
  // Main pushes click-through changes (e.g. via global shortcut) back to
  // the renderer so the toolbar UI stays in sync.
  onClickThrough: (cb) => ipcRenderer.on("win:click-through-changed", (_e, v) => cb(v)),
});
