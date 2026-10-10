// Exposes the desktop shell's settings to the web app as `window.desktop`
// (see src/lib/desktop.ts). Absent in the browser build.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (config) => ipcRenderer.invoke("config:set", config),
});
