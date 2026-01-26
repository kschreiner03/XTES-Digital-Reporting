"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");

contextBridge.exposeInMainWorld("electronAPI", {
  /* -----------------------------
     FILE / PROJECT OPERATIONS
  ----------------------------- */

  saveProject: (data, defaultPath) =>
    ipcRenderer.invoke("save-project", data, defaultPath),

  loadProject: (fileType) =>
    ipcRenderer.invoke("load-project", fileType),

  loadMultipleProjects: () =>
    ipcRenderer.invoke("load-multiple-projects"),

  savePdf: (data, defaultPath) =>
    ipcRenderer.invoke("save-pdf", data, defaultPath),

  saveZipFile: (data, defaultPath) =>
    ipcRenderer.invoke("save-zip-file", data, defaultPath),

  readFile: (filePath) =>
    ipcRenderer.invoke("read-file", filePath),

  /* -----------------------------
     MENU EVENTS (MAIN → RENDERER)
  ----------------------------- */

  onOpenFile: (callback) => {
    ipcRenderer.on("open-file-path", (_event, filePath) => callback(filePath));
  },

  onOpenSettings: (callback) => {
    ipcRenderer.on("open-settings", () => callback());
  },

  onDownloadPhotos: (callback) => {
    ipcRenderer.on("download-photos", () => callback());
  },

  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update-available", () => callback());
  },

  /* -----------------------------
     LISTENER CLEANUP
  ----------------------------- */

  removeDownloadPhotosListener: (callback) => {
    ipcRenderer.removeListener("download-photos", callback);
  },

  removeAllDownloadPhotosListeners: () => {
    ipcRenderer.removeAllListeners("download-photos");
  },

  removeOpenSettingsListener: () => {
    ipcRenderer.removeAllListeners("open-settings");
  },

  removeUpdateAvailableListener: () => {
    ipcRenderer.removeAllListeners("update-available");
  },

  /* -----------------------------
     ASSETS
  ----------------------------- */

  getAssetPath: (filename) =>
    ipcRenderer.invoke("get-asset-path", filename),

  /* -----------------------------
     THEME CONTROL (FIXED)
  ----------------------------- */

  setThemeSource: (theme) =>
    ipcRenderer.invoke("set-theme-source", theme),
});

/* --------------------------------
   HELP WINDOW API (SEPARATE)
--------------------------------- */

contextBridge.exposeInMainWorld("helpAPI", {
  openPdf: (filename) =>
    ipcRenderer.invoke("open-pdf", filename),

  getAssetPath: (filename) =>
    ipcRenderer.invoke("get-asset-path", filename),
});
