// ============================================================
//  JARVIS — backend/system.js
//  Comandos del sistema: volumen, fecha/hora, shutdown
//  Archivo: jarvis-app/backend/system.js
// ============================================================

const { exec } = require('child_process')
const os = require('os')

const isWin  = process.platform === 'win32'
const isMac  = process.platform === 'darwin'

function getSystemStats() {
  return new Promise((resolve) => {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMemPct = Math.round(((totalMem - freeMem) / totalMem) * 100)
    const totalMemGB = (totalMem / 1024 ** 3).toFixed(1)

    if (isWin) {
      exec('powershell -c "(Get-CimInstance Win32_Processor).LoadPercentage"', (err, stdout) => {
        const cpuPct = !err ? parseInt(stdout.trim(), 10) : null
        resolve({
          success: true,
          response: !isNaN(cpuPct)
            ? `CPU at ${cpuPct} percent. RAM at ${usedMemPct} percent of ${totalMemGB} gigabytes.`
            : `RAM at ${usedMemPct} percent of ${totalMemGB} gigabytes. Couldn't read CPU usage.`,
        })
      })
    } else {
      const load = os.loadavg()[0]
      const cpuCount = os.cpus().length
      const cpuPct = Math.min(100, Math.round((load / cpuCount) * 100))
      resolve({
        success: true,
        response: `CPU around ${cpuPct} percent. RAM at ${usedMemPct} percent of ${totalMemGB} gigabytes.`,
      })
    }
  })
}

async function systemCmd(action) {
  switch (action) {
    case 'time': {
      const now = new Date()
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      return { success: true, response: `It's ${time}, sir.` }
    }

    case 'date': {
      const now = new Date()
      const date = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      return { success: true, response: `Today is ${date}.` }
    }

    case 'volume_up': {
      if (isWin) {
        exec(`powershell -c "(New-Object -com WScript.Shell).SendKeys([char]175)"`)
      } else if (isMac) {
        exec(`osascript -e 'set volume output volume (output volume of (get volume settings) + 10)'`)
      }
      return { success: true, response: 'Increasing volume.' }
    }

    case 'volume_down': {
      if (isWin) {
        exec(`powershell -c "(New-Object -com WScript.Shell).SendKeys([char]174)"`)
      } else if (isMac) {
        exec(`osascript -e 'set volume output volume (output volume of (get volume settings) - 10)'`)
      }
      return { success: true, response: 'Decreasing volume.' }
    }

    case 'mute': {
      if (isWin) {
        exec(`powershell -c "(New-Object -com WScript.Shell).SendKeys([char]173)"`)
      } else if (isMac) {
        exec(`osascript -e 'set volume output muted true'`)
      }
      return { success: true, response: 'Audio muted.' }
    }

    case 'shutdown': {
      const cmd = isWin ? 'shutdown /s /t 30' : 'shutdown -h +1'
      exec(cmd)
      return { success: true, response: 'Initiating shutdown in 30 seconds. You can cancel with "Jarvis, cancel shutdown".' }
    }

    case 'restart': {
      const cmd = isWin ? 'shutdown /r /t 30' : 'shutdown -r +1'
      exec(cmd)
      return { success: true, response: 'Restarting the system in 30 seconds.' }
    }

    case 'cancel_shutdown': {
      const cmd = isWin ? 'shutdown /a' : 'shutdown -c'
      exec(cmd)
      return { success: true, response: 'Shutdown cancelled, sir.' }
    }

    case 'stats':
      return await getSystemStats()

    default:
      return { success: false, response: `Unknown system action: ${action}` }
  }
}

module.exports = { systemCmd }