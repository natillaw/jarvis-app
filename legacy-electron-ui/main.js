require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const AutoLaunch = require('auto-launch')
const { startBackend } = require('./backend/server')

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'http://127.0.0.1:3847')

let mainWindow
let tray
let isQuitting = false

function showWindow() {
  if (!mainWindow) createWindow()
  mainWindow.show()
  mainWindow.focus()
}

function startWakeWord() {
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi')
    let ctrlDown = false
    let shiftDown = false
    uIOhook.on('keydown', (e) => {
      if (e.keycode === UiohookKey.Ctrl) ctrlDown = true
      if (e.keycode === UiohookKey.Shift) shiftDown = true
      if (e.keycode === UiohookKey.J && ctrlDown && shiftDown) {
        console.log('[JARVIS] Wake key activado!')
        showWindow()
        setTimeout(() => { if (mainWindow) mainWindow.webContents.send('activate-mic') }, 300)
      }
    })
    uIOhook.on('keyup', (e) => {
      if (e.keycode === UiohookKey.Ctrl) ctrlDown = false
      if (e.keycode === UiohookKey.Shift) shiftDown = false
    })
    uIOhook.start()
    console.log('[JARVIS] Wake key listo - Ctrl+Shift+J')
  } catch (err) {
    console.warn('[JARVIS] Wake key no disponible:', err.message)
  }

  try {
    const { startWakeWordLoop } = require('./backend/wakeword')
    console.log('[WAKE] Iniciando loop de voz...')
    startWakeWordLoop(() => {
      showWindow()
      setTimeout(() => { if (mainWindow) mainWindow.webContents.send('activate-mic') }, 300)
    }).catch(err => console.error('[WAKE] Error en loop:', err.message))
  } catch (err) {
    console.error('[WAKE] Error cargando wakeword:', err.message)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: false,
    backgroundColor: '#020d12',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'jarvis-icon.png')
  })

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'audioCapture' || permission === 'autoplay') {
      callback(true)
    } else {
      callback(false)
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'jarvis-icon.png')
  try {
    tray = new Tray(iconPath)
  } catch {
    tray = new Tray(nativeImage.createEmpty())
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir JARVIS', click: () => showWindow() },
    {
      label: 'Activar microfono',
      click: () => {
        showWindow()
        setTimeout(() => { if (mainWindow) mainWindow.webContents.send('activate-mic') }, 500)
      }
    },
    { type: 'separator' },
    {
      label: 'Arranque automatico',
      type: 'checkbox',
      checked: true,
      click: async (item) => {
        const autoLauncher = new AutoLaunch({ name: 'JARVIS' })
        if (item.checked) await autoLauncher.enable()
        else await autoLauncher.disable()
      }
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('JARVIS - Just A Rather Very Intelligent System')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => showWindow())
}

app.whenReady().then(() => {
  const autoLauncher = new AutoLaunch({ name: 'JARVIS' })
  autoLauncher.isEnabled().then((isEnabled) => {
    if (!isEnabled) autoLauncher.enable()
  }).catch(err => console.error('[AUTOLAUNCH] Error:', err))

  startBackend()
  createTray()
  createWindow()
  startWakeWord()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  isQuitting = true
})

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-close', () => mainWindow?.hide())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
