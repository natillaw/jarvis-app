// ============================================================
//  JARVIS — main.js  (Electron entry point)
//  Archivo: jarvis-app/main.js
// ============================================================

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { startBackend } = require('./backend/server')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    frame: false,           // Sin bordes, look futurista
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'jarvis-icon.png')
  })

  // Carga la UI
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  // DevTools solo en modo desarrollo
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(() => {
  startBackend()   // Inicia el servidor Express interno
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Controles de ventana desde la UI ─────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize())
ipcMain.on('window-close',    () => mainWindow.close())
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
