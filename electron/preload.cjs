// Exposes the desktop shell's settings and live updates to the web app as `window.desktop`
// (see src/lib/servers.ts and src/lib/updates.ts). Absent in the browser build.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (config) => ipcRenderer.invoke("config:set", config),
  updates: {
    ready: () => ipcRenderer.invoke("update:ready"),
    status: () => ipcRenderer.invoke("update:status"),
    check: () => ipcRenderer.invoke("update:check"),
    apply: () => ipcRenderer.invoke("update:apply"),
    getPrerelease: () => ipcRenderer.invoke("update:get-prerelease"),
    setPrerelease: (value) => ipcRenderer.invoke("update:set-prerelease", value),
    /** Calls `listener` with every status change; returns an unsubscribe function. */
    onStatus: (listener) => {
      const handler = (_event, status) => listener(status);
      ipcRenderer.on("update:status-changed", handler);
      return () => ipcRenderer.removeListener("update:status-changed", handler);
    },
  },
});
