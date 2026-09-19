// ============================================================
//  JARVIS AGENT — backend/cloud.js
//  Conexión saliente del Agent hacia Jarvis Cloud.
//  El Agent SIEMPRE inicia la conexión (nunca al revés), así
//  no hay que abrir puertos en el router de casa.
// ============================================================

const WebSocket = require('ws')
const { processCommand } = require('./router')

let socket = null
let reconnectDelay = 2000 // arranca en 2s, sube hasta 30s si sigue fallando
const MAX_RECONNECT_DELAY = 30000

function connectToCloud() {
  let cloudUrl = process.env.CLOUD_WS_URL
  const token = process.env.AUTH_TOKEN

  if (!cloudUrl || !token) {
    console.warn('[CLOUD] CLOUD_WS_URL o AUTH_TOKEN no configurados — el Agent seguirá funcionando solo en local.')
    return
  }

  // Corrige el error común de dejar "https://" pegado después de "wss://",
  // y quita una barra final si la tiene.
  const fixedUrl = cloudUrl.replace(/^wss:\/\/https?:\/\//, 'wss://').replace(/\/$/, '')
  if (fixedUrl !== cloudUrl) {
    console.warn(`[CLOUD] CLOUD_WS_URL tenía un formato raro, lo corregí de "${cloudUrl}" a "${fixedUrl}". Actualiza tu .env para que no salga este aviso.`)
    cloudUrl = fixedUrl
  }

  console.log(`[CLOUD] Conectando a ${cloudUrl}...`)
  socket = new WebSocket(cloudUrl)

  socket.on('open', () => {
    reconnectDelay = 2000 // resetea el backoff al conectar bien
    socket.send(JSON.stringify({ type: 'auth', token, role: 'agent' }))
  })

  socket.on('message', async (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'auth_ok') {
      console.log('[CLOUD] Conectado y autenticado como Agent ✅')
      return
    }

    if (msg.type === 'error') {
      console.error('[CLOUD] Error del Cloud:', msg.error)
      return
    }

    // El Cloud nos reenvió un comando (pedido desde el móvil)
    if (msg.type === 'run_command') {
      console.log(`[CLOUD] Comando recibido: "${msg.text}"`)
      let result
      try {
        result = await processCommand(msg.text)
      } catch (err) {
        result = { intent: 'error', response: `Error ejecutando el comando: ${err.message}` }
      }
      socket.send(JSON.stringify({ type: 'command_result', id: msg.id, result }))
    }
  })

  socket.on('close', () => {
    console.warn(`[CLOUD] Desconectado. Reintentando en ${reconnectDelay / 1000}s...`)
    scheduleReconnect()
  })

  socket.on('error', (err) => {
    console.warn('[CLOUD] Error de conexión:', err.message)
    // 'close' se dispara después de 'error', ahí se reprograma el reintento
  })
}

function scheduleReconnect() {
  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY)
    connectToCloud()
  }, reconnectDelay)
}

module.exports = { connectToCloud }
