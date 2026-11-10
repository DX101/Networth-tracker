const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  restartAndInstall: () => ipcRenderer.invoke('app:restart-and-install'),
  onUpdateStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  }
});
