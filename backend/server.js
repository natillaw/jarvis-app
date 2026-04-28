// ============================================================
//  JARVIS — backend/server.js
//  Servidor Express + WebSocket + TTS
//  Archivo: jarvis-app/backend/server.js
// ============================================================
 
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const express = require('express')
const cors    = require('cors')
const http    = require('http')
const path    = require('path')
const fs      = require('fs')
const os      = require('os')
const { WebSocketServer } = require('ws')
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')
const { processCommand }      = require('./router')
const { listenAndTranscribe } = require('./voice')
 
const app = express()
app.use(cors())
app.use(express.json())

// ── Request logger ──────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// ── Input validation helper ─────────────────────────────────
function validateText(text, res, maxLen = 1000) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    res.status(400).json({ error: 'Texto requerido' })
    return false
  }
  if (text.length > maxLen) {
    res.status(400).json({ error: `Texto demasiado largo (máximo ${maxLen} caracteres)` })
    return false
  }
  return true
}

const PORT = 3847
 
async function textToSpeech(text) {
  try {
    const tmpDir = os.tmpdir()
    const ttsDir = path.join(tmpDir, 'jarvis_tts')
 
    // FIX: crea el directorio si no existe antes de intentar escribir ahí
    if (!fs.existsSync(ttsDir)) {
      fs.mkdirSync(ttsDir, { recursive: true })
    }
 
    const tts = new MsEdgeTTS()
    await tts.setMetadata('en-US-GuyNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    await tts.toFile(ttsDir + path.sep, text)
 
    const mp3Path = path.join(ttsDir, 'audio.mp3')
    const audioData = fs.readFileSync(mp3Path)
    console.log('[TTS] Audio generado:', audioData.length, 'bytes')
    const base64 = audioData.toString('base64')
    try { fs.unlinkSync(mp3Path) } catch {}
    return base64
  } catch (err) {
    console.error('[TTS] Error:', err.message)
    return null
  }
}
 
app.post('/command', async (req, res) => {
  const { text } = req.body
  if (!validateText(text, res)) return
  console.log(`[JARVIS] Comando: "${text.trim()}"`)
  try {
    const result = await processCommand(text)
    const audio  = await textToSpeech(result.response)
    res.json({ ...result, audio })
  } catch (err) {
    console.error('[JARVIS] Error:', err)
    res.status(500).json({ error: err.message })
  }
})
 
app.post('/listen', async (req, res) => {
  const seconds = req.body.seconds || 5
  console.log(`[JARVIS] Grabando audio por ${seconds} segundos...`)
  const { setPaused } = require('./wakeword')
  try {
    setPaused(true)
    const text = await listenAndTranscribe(seconds)
    setPaused(false)
    if (!text || text.trim() === '') {
      return res.json({ text: '', response: 'No escuche nada.', audio: null })
    }
    console.log(`[JARVIS] Transcripcion: "${text}"`)
    const result = await processCommand(text)
    const audio  = await textToSpeech(result.response)
    res.json({ text, ...result, audio })
  } catch (err) {
    setPaused(false)
    console.error('[JARVIS] Error de voz:', err)
    res.status(500).json({ error: err.message })
  }
})
 app.get('/spotify-auth', (req, res) => {
  const { getAuthUrl, startAuthServer } = require('./spotify')
  startAuthServer().catch(err => console.error('[SPOTIFY]', err.message))
  const authUrl = getAuthUrl()
  res.redirect(authUrl)
})
app.get('/ping', (_, res) => res.json({ status: 'online', version: '1.0.0' }))
 
let wss
function startBackend() {
  const server = http.createServer(app)
  wss = new WebSocketServer({ server })
  wss.on('connection', (ws) => {
    console.log('[JARVIS] UI conectada via WebSocket')
    ws.send(JSON.stringify({ type: 'status', message: 'JARVIS online' }))
  })
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[JARVIS] Backend corriendo en http://127.0.0.1:${PORT}`)
  })
}
 
module.exports = { startBackend }
 