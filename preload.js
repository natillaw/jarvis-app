const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('jarvis', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close:    () => ipcRenderer.send('window-close'),
  maximize: () => ipcRenderer.send('window-maximize'),
  onActivateMic: (callback) => ipcRenderer.on('activate-mic', callback)
})
