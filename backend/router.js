// ============================================================
//  JARVIS — backend/router.js
//  Clasifica la intención del comando usando Gemini
//  y despacha al módulo correcto
//  Archivo: jarvis-app/backend/router.js
// ============================================================

const { GoogleGenerativeAI } = require('@google/generative-ai')
const { openApp }    = require('./apps')
const { systemCmd }  = require('./system')

// Inicializa Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

// ── Prompt del clasificador ───────────────────────────────
const CLASSIFY_PROMPT = `
Eres el núcleo de inteligencia de JARVIS, el asistente de Tony Stark.
Analiza el comando del usuario y responde ÚNICAMENTE con un JSON válido
con esta estructura exacta (sin markdown, sin texto extra):

{
  "intent": "<categoria>",
  "params": { ... }
}

Categorías disponibles:
- "open_app"   → abrir una aplicación. params: { "app": "nombre" }
- "music"      → controlar música. params: { "action": "play|pause|next|prev|stop", "query": "opcional" }
- "web_search" → buscar en internet. params: { "query": "texto a buscar" }
- "system"     → control del sistema. params: { "action": "volume_up|volume_down|mute|shutdown|restart|date|time" }
- "chat"       → conversación general o pregunta. params: { "message": "mensaje completo" }

Ejemplos:
"abre chrome"         → {"intent":"open_app","params":{"app":"chrome"}}
"pon música de jazz"  → {"intent":"music","params":{"action":"play","query":"jazz"}}
"qué hora es"         → {"intent":"system","params":{"action":"time"}}
"busca noticias hoy"  → {"intent":"web_search","params":{"query":"noticias hoy"}}
"explícame la IA"     → {"intent":"chat","params":{"message":"explícame la IA"}}
`

// ── Respuestas de chat con Gemini ─────────────────────────
const CHAT_SYSTEM = `
Eres JARVIS, el asistente de inteligencia artificial de Tony Stark.
Hablas en español, eres conciso, inteligente y ligeramente irónico.
Respuestas de máximo 2-3 oraciones. Sin markdown, texto plano.
`

async function classifyIntent(text) {
  try {
    const result = await model.generateContent(
      CLASSIFY_PROMPT + `\n\nComando del usuario: "${text}"`
    )
    const raw = result.response.text().trim()
    // Limpiar posibles ```json ``` que Gemini a veces agrega
    const clean = raw.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch (err) {
    console.warn('[ROUTER] Error clasificando, fallback a chat:', err.message)
    return { intent: 'chat', params: { message: text } }
  }
}

async function chatResponse(message) {
  const result = await model.generateContent(
    CHAT_SYSTEM + `\n\nUsuario: ${message}\nJARVIS:`
  )
  return result.response.text().trim()
}

// ── Router principal ──────────────────────────────────────
async function processCommand(text) {
  const { intent, params } = await classifyIntent(text)
  console.log(`[ROUTER] Intent: ${intent}`, params)

  switch (intent) {
    case 'open_app': {
      const opened = openApp(params.app)
      return {
        intent,
        action: 'open_app',
        app: params.app,
        success: opened,
        response: opened
          ? `Abriendo ${params.app}, señor.`
          : `No encontré ${params.app} en la lista de aplicaciones configuradas.`
      }
    }

    case 'music': {
      // Módulo de música — se implementa en la Parte 3
      return {
        intent,
        action: 'music',
        response: `Módulo de música: ${params.action}${params.query ? ' — ' + params.query : ''}. (Próximamente)`
      }
    }

    case 'web_search': {
      const url = `https://www.google.com/search?q=${encodeURIComponent(params.query)}`
      const { exec } = require('child_process')
      const cmd = process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
          ? `open "${url}"`
          : `xdg-open "${url}"`
      exec(cmd)
      return {
        intent,
        action: 'web_search',
        url,
        response: `Buscando "${params.query}" en Google.`
      }
    }

    case 'system': {
      const sysResult = systemCmd(params.action)
      return { intent, action: params.action, ...sysResult }
    }

    case 'chat':
    default: {
      const reply = await chatResponse(params.message || text)
      return { intent: 'chat', response: reply }
    }
  }
}

module.exports = { processCommand }
