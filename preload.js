const { contextBridge, ipcRenderer } = require("electron");

/* ============================================================
   THEME API — CONNECTS RENDERER → MAIN
============================================================ */
contextBridge.exposeInMainWorld("themeAPI", {
  // Set theme: "light", "dark", "system"
  setTheme: (mode) => ipcRenderer.invoke("set-theme-source", mode),

  // Returns: "light" or "dark"
  getTheme: () => ipcRenderer.invoke("get-current-theme"),

  // Listen when OS theme changes
  onThemeUpdated: (callback) => {
    ipcRenderer.on("theme-updated", (_event, theme) => callback(theme));
  }
});

/* ============================================================
   GENERAL IPC BRIDGE FOR YOUR APP
============================================================ */
contextBridge.exposeInMainWorld("electronAPI", {
  openPDF: (filename) => ipcRenderer.invoke("open-pdf", filename),

  saveProject: (data, defaultPath) =>
    ipcRenderer.invoke("save-project", data, defaultPath),

  loadProject: (type) => ipcRenderer.invoke("load-project", type),

  savePDF: (data, defaultPath) =>
    ipcRenderer.invoke("save-pdf", data, defaultPath),

  saveZip: (data, defaultPath) =>
    ipcRenderer.invoke("save-zip-file", data, defaultPath),

  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),

  importMultipleProjects: () =>
    ipcRenderer.invoke("load-multiple-projects"),

  onOpenFilePath: (callback) =>
    ipcRenderer.on("open-file-path", (_event, path) => callback(path)),

  onUpdateAvailable: (callback) =>
    ipcRenderer.on("update-available", callback),

  /* ========================================================
     🌟 MISSING SETTINGS API — THIS FIXES YOUR SETTINGS TAB
     ======================================================== */
  onOpenSettings: (callback) =>
    ipcRenderer.on("open-settings", () => callback())
});


