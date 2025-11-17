const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helpAPI', {
  openPdf: (filename) => ipcRenderer.invoke('open-pdf', filename),
});
