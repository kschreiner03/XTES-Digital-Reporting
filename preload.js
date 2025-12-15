const path = require("path");
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /* =========================
     EXISTING METHODS
     ========================= */
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

  onOpenSettings: (callback) =>
    ipcRenderer.on("open-settings", () => callback()),

  /* =========================
     ✅ ADD THIS
     ========================= */
  getAssetPath: (fileName) => {
    const assetPath = path.join(
      process.resourcesPath,
      "assets",
      fileName
    );

    return `file://${assetPath.replace(/\\/g, "/")}`;
  }
});



