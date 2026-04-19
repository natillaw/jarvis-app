// ============================================================
//  JARVIS — preload.js
//  Puente seguro entre Electron y el renderer (React UI)
//  Archivo: jarvis-app/preload.js
// ============================================================

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jarvis', {
  // Controles de ventana
  minimize: () => ipcRenderer.send('window-minimize'),
  close:    () => ipcRenderer.send('window-close'),
  maximize: () => ipcRenderer.send('window-maximize'),
})
