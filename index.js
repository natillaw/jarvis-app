// ============================================================
//  JARVIS AGENT — index.js
//  Punto de entrada sin Electron: proceso Node.js plano.
//  Corre en segundo plano, expone el backend local (127.0.0.1:3847),
//  escucha el hotkey Ctrl+Shift+J y la wake word "Jarvis" por voz.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec, spawn } = require('child_process')
const AutoLaunch = require('auto-launch')
const { startBackend, textToSpeech } = require('./backend/server')
const { processCommand } = require('./backend/router')
const { listenAndTranscribe } = require('./backend/voice')
const { setPaused, startWakeWordLoop } = require('./backend/wakeword')
const { connectToCloud } = require('./backend/cloud')
const { events: timerEvents } = require('./backend/timers')

let busy = false        // true mientras graba/procesa un comando
let speaking = false    // true mientras se reproduce una respuesta
let currentAudioProc = null

const CANCEL_PHRASES = ['cancel', 'never mind', 'nevermind', 'stop', 'nada', 'olvídalo', 'cancela']

// Mata el proceso de PowerShell que está reproduciendo audio ahora mismo (si hay uno).
function stopAudio() {
  if (currentAudioProc && !currentAudioProc.killed) {
    try {
      // taskkill con /T mata también los hijos del proceso (el motor de audio real)
      exec(`taskkill /PID ${currentAudioProc.pid} /T /F`)
    } catch {}
  }
  speaking = false
  currentAudioProc = null
}

// Reproduce un mp3 de forma silenciosa (sin abrir ninguna ventana de reproductor),
// usando el motor de medios que ya trae Windows (WPF MediaPlayer) vía PowerShell oculto.
// Usa spawn (no exec) para poder interrumpirlo a mitad de reproducción.
function playAudio(base64Mp3) {
  return new Promise((resolve) => {
    if (!base64Mp3) return resolve()
    const tmpFile = path.join(os.tmpdir(), `jarvis_reply_${Date.now()}.mp3`)
    fs.writeFileSync(tmpFile, Buffer.from(base64Mp3, 'base64'))

    const psScript = `
      Add-Type -AssemblyName PresentationCore
      $player = New-Object System.Windows.Media.MediaPlayer
      $player.Open([Uri]::new("${tmpFile.replace(/\\/g, '\\\\')}"))
      $player.Play()
      Start-Sleep -Milliseconds 300
      $timeout = 0
      while (-not $player.NaturalDuration.HasTimeSpan -and $timeout -lt 30) {
        Start-Sleep -Milliseconds 100
        $timeout++
      }
      if ($player.NaturalDuration.HasTimeSpan) {
        Start-Sleep -Seconds $player.NaturalDuration.TimeSpan.TotalSeconds
      } else {
        Start-Sleep -Seconds 4
      }
      $player.Close()
    `.trim()

    const psFile = path.join(os.tmpdir(), `jarvis_play_${Date.now()}.ps1`)
    fs.writeFileSync(psFile, psScript)

    speaking = true
    const child = spawn('powershell', ['-WindowStyle', 'Hidden', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile])
    currentAudioProc = child

    child.on('close', () => {
      speaking = false
      currentAudioProc = null
      try { fs.unlinkSync(tmpFile) } catch {}
      try { fs.unlinkSync(psFile) } catch {}
      resolve()
    })
  })
}

async function speak(text) {
  const audio = await textToSpeech(text)
  await playAudio(audio)
}

// Flujo completo: graba, transcribe, procesa el comando y responde por voz.
// Se llama tanto desde el hotkey Ctrl+Shift+J como desde la wake word "Jarvis".
// Si Jarvis está hablando cuando se activa de nuevo, se interpreta como
// "interrumpir" (barge-in): corta el audio y empieza a escuchar de inmediato.
async function activateJarvis() {
  if (speaking) {
    console.log('[JARVIS] Interrumpido — escuchando de nuevo.')
    stopAudio()
  } else if (busy) {
    console.log('[JARVIS] Ya estoy procesando algo, espera...')
    return
  }

  busy = true
  try {
    setPaused(true) // pausa la wake-word mientras escuchamos el comando real
    console.log('[JARVIS] Escuchando comando...')
    const text = await listenAndTranscribe(8)
    setPaused(false)

    if (!text || text.trim() === '') {
      console.log('[JARVIS] No escuché nada.')
      return
    }
    console.log(`[JARVIS] Comando: "${text}"`)

    // Si el comando es directamente "cancela"/"nada", no procesamos nada más.
    const normalized = text.trim().toLowerCase()
    if (CANCEL_PHRASES.some((p) => normalized === p || normalized === p + '.')) {
      console.log('[JARVIS] Cancelado por el usuario.')
      return
    }

    const result = await processCommand(text)
    console.log(`[JARVIS] Respuesta: "${result.response}"`)
    await speak(result.response)
  } catch (err) {
    setPaused(false)
    console.error('[JARVIS] Error:', err.message)
  } finally {
    busy = false
  }
}

function startHotkey() {
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi')
    let ctrlDown = false
    let shiftDown = false
    uIOhook.on('keydown', (e) => {
      if (e.keycode === UiohookKey.Ctrl) ctrlDown = true
      if (e.keycode === UiohookKey.Shift) shiftDown = true
      if (e.keycode === UiohookKey.J && ctrlDown && shiftDown) {
        console.log('[JARVIS] Hotkey activado (Ctrl+Shift+J)')
        activateJarvis()
      }
    })
    uIOhook.on('keyup', (e) => {
      if (e.keycode === UiohookKey.Ctrl) ctrlDown = false
      if (e.keycode === UiohookKey.Shift) shiftDown = false
    })
    uIOhook.start()
    console.log('[JARVIS] Hotkey listo - Ctrl+Shift+J')
  } catch (err) {
    console.warn('[JARVIS] Hotkey no disponible:', err.message)
  }
}

function startWakeWord() {
  startWakeWordLoop(() => activateJarvis()).catch((err) =>
    console.error('[WAKE] Error en loop:', err.message)
  )
}

function startTimerAnnouncements() {
  timerEvents.on('done', async ({ label }) => {
    const message = label ? `Timer for ${label} is done.` : `Your timer is done.`
    console.log(`[TIMER] ${message}`)
    try {
      await speak(message)
    } catch (err) {
      console.warn('[TIMER] No se pudo anunciar:', err.message)
    }
  })
}

// En Windows, "auto-launch" solo puede apuntar a un ejecutable — no a
// "node.exe index.js" con argumentos. Por eso generamos un lanzador .vbs
// silencioso (sin ventana de consola) que sí sabe correr el proyecto
// completo desde la carpeta correcta, y le decimos a auto-launch que
// arranque ESE archivo al prender Windows.
function ensureWindowsLauncher() {
  const vbsPath = path.join(__dirname, 'start-hidden.vbs')
  const nodeExe = process.execPath.replace(/\\/g, '\\\\')
  const projectDir = __dirname.replace(/\\/g, '\\\\')
  const script =
    'Set WshShell = CreateObject("WScript.Shell")\r\n' +
    `WshShell.CurrentDirectory = "${projectDir}"\r\n` +
    `WshShell.Run """${nodeExe}"" ""${projectDir}\\\\index.js""", 0, False\r\n`
  fs.writeFileSync(vbsPath, script)
  return vbsPath
}

async function main() {
  console.log('[JARVIS] Iniciando Agent (sin interfaz gráfica)...')

  // Arranque automático con Windows: en win32 usamos el lanzador .vbs
  // (silencioso, sin ventana); en otros sistemas, auto-launch maneja
  // el ejecutable directamente.
  const launcherPath = process.platform === 'win32' ? ensureWindowsLauncher() : process.execPath
  const autoLauncher = new AutoLaunch({ name: 'JARVIS', path: launcherPath })
  try {
    // Refrescamos siempre (disable + enable) para que si había quedado una
    // entrada rota de una versión anterior, quede corregida sin que tengas
    // que borrarla a mano.
    if (await autoLauncher.isEnabled()) await autoLauncher.disable()
    await autoLauncher.enable()
    console.log('[AUTOLAUNCH] JARVIS arrancará solo cuando prendas la PC.')
  } catch (err) {
    console.warn('[AUTOLAUNCH] No se pudo configurar:', err.message)
  }

  startBackend()
  startHotkey()
  startWakeWord()
  startTimerAnnouncements()
  connectToCloud()

  console.log('[JARVIS] Agent corriendo. Backend en http://127.0.0.1:3847')
}

main()

process.on('SIGINT', () => {
  console.log('\n[JARVIS] Cerrando Agent...')
  process.exit(0)
})
