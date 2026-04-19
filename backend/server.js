// ============================================================
//  JARVIS — backend/server.js
//  Servidor Express interno + WebSocket para comunicación
//  en tiempo real con la UI
//  Archivo: jarvis-app/backend/server.js
// ============================================================

require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const http    = require('http')
const { WebSocketServer } = require('ws')
const { processCommand } = require('./router')

const app = express()
app.use(cors())
app.use(express.json())

const PORT = 3847   // Puerto local privado de JARVIS

// ── REST endpoint principal ───────────────────────────────
// La UI envía el texto transcripto aquí
app.post('/command', async (req, res) => {
  const { text } = req.body
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Comando vacío' })
  }

  console.log(`[JARVIS] Comando recibido: "${text}"`)
  try {
    const result = await processCommand(text)
    res.json(result)
  } catch (err) {
    console.error('[JARVIS] Error procesando comando:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Health check ──────────────────────────────────────────
app.get('/ping', (_, res) => res.json({ status: 'online', version: '1.0.0' }))

// ── WebSocket para actualizaciones en tiempo real ─────────
let wss
function broadcast(data) {
  if (!wss) return
  const msg = JSON.stringify(data)
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg)
  })
}

function startBackend() {
  const server = http.createServer(app)
  wss = new WebSocketServer({ server })

  wss.on('connection', (ws) => {
    console.log('[JARVIS] UI conectada vía WebSocket')
    ws.send(JSON.stringify({ type: 'status', message: 'JARVIS online' }))
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[JARVIS] Backend corriendo en http://127.0.0.1:${PORT}`)
  })
}

module.exports = { startBackend, broadcast }
