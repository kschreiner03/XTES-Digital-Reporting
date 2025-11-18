const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  saveProject: (data, defaultPath) => ipcRenderer.invoke('save-project', data, defaultPath),
  loadProject: (fileType) => ipcRenderer.invoke('load-project', fileType),
  loadMultipleProjects: () => ipcRenderer.invoke('load-multiple-projects'),
  savePdf: (defaultPath) => ipcRenderer.invoke('save-pdf', defaultPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  onOpenFile: (callback) => ipcRenderer.on('open-file-path', (_event, value) => callback(value)),
  onDownloadPhotos: (callback) => ipcRenderer.on('download-photos', callback),
  removeDownloadPhotosListener: (callback) => ipcRenderer.removeListener('download-photos', callback),
  removeAllDownloadPhotosListeners: () => ipcRenderer.removeAllListeners('download-photos'),
  saveZipFile: (data, defaultPath) => ipcRenderer.invoke('save-zip-file', data, defaultPath),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', () => callback()),
  removeUpdateAvailableListener: () => ipcRenderer.removeAllListeners('update-available'),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),
  removeOpenSettingsListener: () => ipcRenderer.removeAllListeners('open-settings'),
});