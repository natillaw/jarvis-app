require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { spawn } = require('child_process')
const path = require('path')

let pyProcess = null
let onWakeCallback = null
let paused = false

function setPaused(val) { paused = val }

// Intenta encontrar un comando de Python válido en el sistema.
// En Windows suele ser "python", a veces solo "py".
const PYTHON_CANDIDATES = ['python', 'py', 'python3']

async function startWakeWordLoop(callback) {
  onWakeCallback = callback
  const scriptPath = path.join(__dirname, 'wakeword_engine.py')

  pyProcess = spawn(PYTHON_CANDIDATES[0], [scriptPath])

  pyProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (line === 'WAKE') {
        if (paused) continue
        console.log('[WAKE] Wake word detectado!')
        if (onWakeCallback) onWakeCallback()
      }
    }
  })

  pyProcess.stderr.on('data', (data) => {
    // El script de Python manda sus logs propios por stderr (no son errores fatales)
    console.log('[WAKE]', data.toString().trim())
  })

  pyProcess.on('error', (err) => {
    console.error(
      `[WAKE] No se pudo iniciar Python (${err.message}). ` +
      `Verifica que Python esté instalado y en el PATH, y que corriste ` +
      `"pip install -r backend/requirements.txt".`
    )
  })

  pyProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.warn(`[WAKE] El proceso de wake word terminó inesperadamente (código ${code})`)
    }
  })
}

function stopWakeWord() {
  if (pyProcess) {
    pyProcess.kill()
    pyProcess = null
  }
}

module.exports = { startWakeWordLoop, stopWakeWord, setPaused }
