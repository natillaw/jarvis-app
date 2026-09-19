// ============================================================
//  JARVIS — backend/voice.js
//  Grabación de audio y transcripción con Whisper (Groq)
//  Archivo: jarvis-app/backend/voice.js
// ============================================================
 
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const Microphone = require('node-microphone')
const Groq = require('groq-sdk')
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const { execSync } = require('child_process')
 
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
 
// Calcula el volumen (RMS) de un chunk de audio PCM de 16 bits
function computeRms(buffer) {
  let sum = 0
  const samples = Math.floor(buffer.length / 2)
  if (samples === 0) return 0
  for (let i = 0; i < samples * 2; i += 2) {
    const sample = buffer.readInt16LE(i)
    sum += sample * sample
  }
  return Math.sqrt(sum / samples)
}

// Graba hasta maxSeconds, pero corta antes si detecta que hubo silencio
// durante silenceMs después de que la persona empezó a hablar.
// Esto evita esperar siempre el máximo fijo cuando el comando fue corto.
function recordAudio(maxSeconds = 8, silenceMs = 1000, silenceThreshold = 350) {
  return new Promise((resolve, reject) => {
    const rawPath = path.join(os.tmpdir(), `jarvis_raw_${Date.now()}.raw`)
    const mic = new Microphone({
      rate: '16000',
      channels: '1',
      encoding: 'signed-integer',
      bitwidth: '16',
      device: 'default',
    })

    const micStream = mic.startRecording()
    const fileStream = fs.createWriteStream(rawPath)
    micStream.pipe(fileStream)

    let hasSpoken = false
    let silenceTimer = null

    micStream.on('data', (chunk) => {
      const rms = computeRms(chunk)
      if (rms > silenceThreshold) {
        hasSpoken = true
        if (silenceTimer) {
          clearTimeout(silenceTimer)
          silenceTimer = null
        }
      } else if (hasSpoken && !silenceTimer) {
        silenceTimer = setTimeout(() => mic.stopRecording(), silenceMs)
      }
    })

    micStream.on('error', (err) => {
      mic.stopRecording()
      reject(err)
    })

    const hardTimeout = setTimeout(() => {
      mic.stopRecording()
    }, maxSeconds * 1000)

    micStream.on('end', () => {
      clearTimeout(hardTimeout)
      if (silenceTimer) clearTimeout(silenceTimer)
      fileStream.end()
    })

    fileStream.on('finish', () => {
      resolve(rawPath)
    })
  })
}
 
async function transcribeAudio(rawPath) {
  const wavPath = rawPath.replace('.raw', '.wav')
 
  // Convierte RAW a WAV real con Sox
  execSync(`sox -r 16000 -c 1 -e signed-integer -b 16 -t raw "${rawPath}" "${wavPath}"`)
  try { fs.unlinkSync(rawPath) } catch {}
 
  const audioData = fs.readFileSync(wavPath)
  console.log('[VOICE] Tamaño WAV:', audioData.length, 'bytes')
 
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(wavPath),
    model: 'whisper-large-v3-turbo',
    response_format: 'text'
  })
 
  try { fs.unlinkSync(wavPath) } catch {}
  return typeof transcription === 'string' ? transcription.trim() : transcription?.text?.trim() || ''
}
 
async function listenAndTranscribe(maxSeconds = 8) {
  const rawPath = await recordAudio(maxSeconds)
  const text = await transcribeAudio(rawPath)
  return text
}
 
module.exports = { listenAndTranscribe }
 
