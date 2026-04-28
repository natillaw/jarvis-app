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
 
function recordAudio(seconds = 5) {
  return new Promise((resolve, reject) => {
    const rawPath = path.join(os.tmpdir(), `jarvis_raw_${Date.now()}.raw`)
    const mic = new Microphone({
      rate: '16000',
      channels: '1',
      encoding: 'signed-integer',
      bitwidth: '16',
      device: 'default',
      exitOnSilence: 6,
    })
 
    const micStream = mic.startRecording()
    const fileStream = fs.createWriteStream(rawPath)
    micStream.pipe(fileStream)
 
    micStream.on('error', (err) => {
      mic.stopRecording()
      reject(err)
    })
 
    const timeout = setTimeout(() => {
      mic.stopRecording()
    }, seconds * 1000)
 
    // FIX: el evento correcto es 'end' en el stream, no 'stopComplete' en mic
    micStream.on('end', () => {
      clearTimeout(timeout)
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
    language: 'en',
    response_format: 'text'
  })
 
  try { fs.unlinkSync(wavPath) } catch {}
  return typeof transcription === 'string' ? transcription.trim() : transcription?.text?.trim() || ''
}
 
async function listenAndTranscribe(seconds = 5) {
  const rawPath = await recordAudio(seconds)
  const text = await transcribeAudio(rawPath)
  return text
}
 
module.exports = { listenAndTranscribe }
 
