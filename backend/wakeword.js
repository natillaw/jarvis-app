require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const Microphone = require('node-microphone')
const Groq = require('groq-sdk')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

let listening = false
let paused = false
let onWakeCallback = null

function setPaused(val) { paused = val }

function recordShort(seconds = 2) {
  return new Promise((resolve) => {
    const rawPath = path.join(os.tmpdir(), `jarvis_wake_${Date.now()}.raw`)
    const mic = new Microphone({ rate: '16000', channels: '1', encoding: 'signed-integer', bitwidth: '16', device: 'default' })
    const micStream = mic.startRecording()
    const fileStream = fs.createWriteStream(rawPath)
    micStream.pipe(fileStream)
    setTimeout(() => {
      mic.stopRecording()
      fileStream.end()
    }, seconds * 1000)
    fileStream.on('finish', () => resolve(rawPath))
  })
}

async function checkForWakeWord() {
  if (paused) return
  try {
    const rawPath = await recordShort(2)
    const wavPath = rawPath.replace('.raw', '.wav')
    execSync(`sox -r 16000 -c 1 -e signed-integer -b 16 -t raw "${rawPath}" "${wavPath}"`)
    try { fs.unlinkSync(rawPath) } catch {}

    // Verificar volumen - ignorar silencio
    try {
      const stats = execSync(`sox "${wavPath}" -n stat 2>&1`).toString()
      const rmsMatch = stats.match(/RMS\s+amplitude:\s+([0-9.]+)/)
      const rms = rmsMatch ? parseFloat(rmsMatch[1]) : 0
      if (rms < 0.01) {
        try { fs.unlinkSync(wavPath) } catch {}
        return
      }
    } catch {}

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(wavPath),
      model: 'whisper-large-v3-turbo',
      language: 'en',
      response_format: 'text'
    })
    try { fs.unlinkSync(wavPath) } catch {}

    const text = (typeof transcription === 'string' ? transcription : transcription?.text || '').toLowerCase()
    console.log('[WAKE] Escuchando:', text.trim())

    // Filtrar alucinaciones comunes
    const HALLUCINATIONS = ['thank you', 'thanks', 'please', 'okay', 'ok', 'yes', 'no', 'bye',
      'gracias', 'amen', 'peace', 'i', 'the', 'you', 'a', 'um', 'uh', 'hmm']
    const words = text.trim().split(/\s+/)
    const clean = words.map(w => w.replace(/[^a-z]/gi, '').toLowerCase())
    const isHallucination = words.length <= 2 && clean.every(w => HALLUCINATIONS.includes(w))
    if (isHallucination) return

    const hasJarvis = clean.some(w => w === 'jarvis')
    if (hasJarvis) {
      console.log('[WAKE] Wake word detectado!')
      if (onWakeCallback) onWakeCallback()
    }
  } catch (err) {
    // Silencioso
  }
}

async function startWakeWordLoop(callback) {
  onWakeCallback = callback
  listening = true
  console.log('[WAKE] Escuchando wake word "Jarvis"...')
  while (listening) {
    await checkForWakeWord()
    await new Promise(r => setTimeout(r, 100))
  }
}

function stopWakeWord() { listening = false }

module.exports = { startWakeWordLoop, stopWakeWord, setPaused }