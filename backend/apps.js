// ============================================================
//  JARVIS — backend/apps.js
//  Módulo para abrir aplicaciones del sistema
//  Archivo: jarvis-app/backend/apps.js
// ============================================================

const { exec } = require('child_process')
const path = require('path')
const fs   = require('fs')

// Carga el mapa de apps desde config/apps.json
const configPath = path.join(__dirname, '..', 'config', 'apps.json')

function loadApps() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return {}
  }
}

// ── Detecta plataforma y elige el comando de apertura ─────
function buildCommand(appPath) {
  const platform = process.platform
  if (platform === 'win32') return `start "" "${appPath}"`
  if (platform === 'darwin') return `open "${appPath}"`
  return `xdg-open "${appPath}"`
}

// ── Normaliza el nombre para encontrar coincidencias ──────
function normalize(str) {
  return str.toLowerCase()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e')
    .replace(/[íìï]/g,'i').replace(/[óòö]/g,'o')
    .replace(/[úùü]/g,'u')
    .replace(/\s+/g,' ').trim()
}

function openApp(appName) {
  const apps = loadApps()
  const key = normalize(appName)

  // Busca coincidencia exacta primero, luego parcial
  let found = apps[key]
  if (!found) {
    const partial = Object.keys(apps).find(k => k.includes(key) || key.includes(k))
    if (partial) found = apps[partial]
  }

  if (!found) {
    console.warn(`[APPS] App no encontrada: "${appName}"`)
    return false
  }

  exec(buildCommand(found), (err) => {
    if (err) console.error(`[APPS] Error abriendo ${appName}:`, err.message)
    else console.log(`[APPS] Abierto: ${appName} → ${found}`)
  })
  return true
}

module.exports = { openApp }
