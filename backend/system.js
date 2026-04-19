// ============================================================
//  JARVIS — backend/system.js
//  Comandos del sistema: volumen, fecha/hora, shutdown
//  Archivo: jarvis-app/backend/system.js
// ============================================================

const { exec, execSync } = require('child_process')

const isWin  = process.platform === 'win32'
const isMac  = process.platform === 'darwin'

function systemCmd(action) {
  switch (action) {
    case 'time': {
      const now = new Date()
      const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      return { success: true, response: `Son las ${time}, señor.` }
    }

    case 'date': {
      const now = new Date()
      const date = now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
      return { success: true, response: `Hoy es ${date}.` }
    }

    case 'volume_up': {
      if (isWin) {
        exec(`powershell -c "(New-Object -com WScript.Shell).SendKeys([char]175)"`)
      } else if (isMac) {
        exec(`osascript -e 'set volume output volume (output volume of (get volume settings) + 10)'`)
      }
      return { success: true, response: 'Subiendo el volumen.' }
    }

    case 'volume_down': {
      if (isWin) {
        exec(`powershell -c "(New-Object -com WScript.Shell).SendKeys([char]174)"`)
      } else if (isMac) {
        exec(`osascript -e 'set volume output volume (output volume of (get volume settings) - 10)'`)
      }
      return { success: true, response: 'Bajando el volumen.' }
    }

    case 'mute': {
      if (isWin) {
        exec(`powershell -c "(New-Object -com WScript.Shell).SendKeys([char]173)"`)
      } else if (isMac) {
        exec(`osascript -e 'set volume output muted true'`)
      }
      return { success: true, response: 'Audio silenciado.' }
    }

    case 'shutdown': {
      const cmd = isWin ? 'shutdown /s /t 30' : 'shutdown -h +1'
      exec(cmd)
      return { success: true, response: 'Iniciando apagado en 30 segundos. Puede cancelar con "Jarvis, cancelar apagado".' }
    }

    case 'restart': {
      const cmd = isWin ? 'shutdown /r /t 30' : 'shutdown -r +1'
      exec(cmd)
      return { success: true, response: 'Reiniciando el sistema en 30 segundos.' }
    }

    case 'cancel_shutdown': {
      const cmd = isWin ? 'shutdown /a' : 'shutdown -c'
      exec(cmd)
      return { success: true, response: 'Apagado cancelado, señor.' }
    }

    default:
      return { success: false, response: `Acción de sistema desconocida: ${action}` }
  }
}

module.exports = { systemCmd }
