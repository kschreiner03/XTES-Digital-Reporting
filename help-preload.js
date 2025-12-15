
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helpAPI', {
  openPdf: (filename) => ipcRenderer.invoke('open-pdf', filename),
  getAssetPath: (filename) => ipcRenderer.invoke('get-asset-path', filename),
});