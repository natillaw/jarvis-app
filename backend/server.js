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
 
function detectLanguage(text) {
  const s = String(text || '').toLowerCase()
  const es = (s.match(/\b(el|la|los|las|que|qué|como|cómo|quiero|puedes|dime|para|con|una|un|es|mi|me|por|del|gracias|hola|tu|tú)\b/g) || []).length
  const en = (s.match(/\b(the|what|how|i|you|can|please|tell|my|for|with|is|thanks|hello|your)\b/g) || []).length
  return es >= en ? 'es' : 'en'
}

async function textToSpeech(text, language = 'auto') {
  try {
    const lang = language === 'auto' ? detectLanguage(text) : language
    const voice = lang === 'es' ? (process.env.TTS_VOICE_ES || 'es-MX-DaliaNeural') : (process.env.TTS_VOICE_EN || 'en-US-GuyNeural')
    const tts = new MsEdgeTTS()
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

    // Unique directory prevents concurrent sentence generation from overwriting audio.mp3.
    const ttsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-tts-'))
    await tts.toFile(ttsDir + path.sep, text)
    const mp3Path = path.join(ttsDir, 'audio.mp3')
    const audioData = fs.readFileSync(mp3Path)
    try { fs.rmSync(ttsDir, { recursive: true, force: true }) } catch {}
    console.log(`[TTS] ${lang}/${voice}: ${audioData.length} bytes`)
    return audioData.toString('base64')
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
    const audio  = await textToSpeech(result.response, result.language || 'auto')
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
    const audio  = await textToSpeech(result.response, result.language || 'auto')
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
app.get('/ptt', (_, res) => {
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JARVIS Push-to-Talk</title>
<style>body{font-family:system-ui;background:#111;color:#fff;display:grid;place-items:center;height:100vh;margin:0}
button{width:220px;height:220px;border-radius:50%;border:0;font-size:28px;background:#222;color:#fff;cursor:pointer}
button:active{transform:scale(.97);background:#333}.status{margin-top:20px;text-align:center;color:#aaa}</style></head>
<body><div><button id="b">🎙️<br>JARVIS</button><div class="status" id="s">Mantén presionado para hablar</div></div>
<script>
const b=document.getElementById('b'),s=document.getElementById('s');
let down=false;
async function start(){if(down)return;down=true;s.textContent='Escuchando...';try{
 const r=await fetch('/listen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds:8})});
 const x=await r.json();s.textContent=x.text?('Tú: '+x.text):'No escuché nada.';
 if(x.audio){const a=new Audio('data:audio/mpeg;base64,'+x.audio);a.onended=()=>s.textContent='Listo';a.play();}
}catch(e){s.textContent='Error: '+e.message}finally{down=false}}
b.addEventListener('pointerdown',start); b.addEventListener('pointerup',()=>{});
</script></body></html>`)
})

 
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
 
module.exports = { startBackend, textToSpeech }
 