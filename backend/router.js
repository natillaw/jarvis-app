require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") })
const Groq = require("groq-sdk")
const { openApp } = require("./apps")
const { systemCmd } = require("./system")
const { startTimer, cancelAllTimers, listTimers } = require("./timers")
const { cloudChat, cloudChatStream } = require("./cloud")

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b"

const CLASSIFY_PROMPT = `Classify the user command. Reply ONLY with valid JSON, no markdown.
Format: {"intent":"category","params":{}}
Categories:
- open_app: open a program. params: {"app":"name"}
- web_search: search internet. params: {"query":"text"}
- system: system control. params: {"action":"volume_up|volume_down|mute|shutdown|restart|time|date|stats"}
- music: control Spotify. params: {"action":"play|pause|next|prev|current","query":"song or artist (optional)"}
- timer: set/list/cancel a timer. params: {"action":"set|list|cancel","seconds":number,"label":"text (optional)"}
- chat: conversation. params: {"message":"exact user message"}`

const CHAT_SYSTEM = `You are JARVIS, an AI voice assistant. Reply briefly and naturally.
Answer in the same language as the user. No markdown.`

function fastIntent(text) {
  const t = text.trim()
  const l = t.toLowerCase()

  if (/^(open|launch|start|abre|abrir|inicia|iniciar|ejecuta|ejecutar)\b/i.test(t)) {
    return { intent: "open_app", params: { app: t.replace(/^(open|launch|start|abre|abrir|inicia|iniciar|ejecuta|ejecutar)\s+/i, "") } }
  }
  if (/^(play|pause|resume|next|previous|prev|skip|stop|reproduce|pausa|reanuda|siguiente|anterior|salta|detén|deten)\b/i.test(t)) {
    let action = "play"
    if (/^(pause|pausa|stop|detén|deten)\b/i.test(t)) action = "pause"
    else if (/^(next|siguiente|skip|salta)\b/i.test(t)) action = "next"
    else if (/^(previous|prev|anterior)\b/i.test(t)) action = "prev"
    return { intent: "music", params: { action, query: t.replace(/^(play|pause|resume|next|previous|prev|skip|stop|reproduce|pausa|reanuda|siguiente|anterior|salta|detén|deten)\s*/i, "") } }
  }
  if (/^(what time|what's the time|qué hora|que hora)\b/i.test(t)) return { intent: "system", params: { action: "time" } }
  if (/^(what date|what's the date|qué fecha|que fecha)\b/i.test(t)) return { intent: "system", params: { action: "date" } }
  if (/(sube|aumenta|increase|raise).*(volume|volumen)|volume up|sube el volumen/i.test(l)) return { intent: "system", params: { action: "volume_up" } }
  if (/(baja|disminuye|decrease|lower).*(volume|volumen)|volume down|baja el volumen/i.test(l)) return { intent: "system", params: { action: "volume_down" } }
  if (/^(set|start|pon|poner|crea|crear).*(timer|temporizador)|\b\d+\s*(seconds?|segundos?|minutes?|minutos?)\b.*(timer|temporizador)|timer.*\b\d+/i.test(t)) return null
  if (/^(search|look up|investigate|busca|buscar|investiga|investigar)\b/i.test(t)) {
    return { intent: "web_search", params: { query: t.replace(/^(search|look up|investigate|busca|buscar|investiga|investigar)\s+/i, "") } }
  }
  return undefined
}

async function classifyIntent(text) {
  try {
    const c = await groq.chat.completions.create({
      model: MODEL, messages: [
        { role: "system", content: CLASSIFY_PROMPT },
        { role: "user", content: text }
      ],
      temperature: 0.1, max_tokens: 250, reasoning_effort: "low"
    })
    return JSON.parse(c.choices[0].message.content.trim().replace(/```json|```/g, "").trim())
  } catch (err) {
    console.warn("[ROUTER] Clasificación falló:", err.message)
    return { intent: "chat", params: { message: text } }
  }
}

async function localChatResponse(message) {
  const c = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "system", content: CHAT_SYSTEM }, { role: "user", content: message }],
    temperature: 0.7, max_tokens: 180, reasoning_effort: "low"
  })
  return c.choices[0].message.content.trim()
}

async function chatResponse(message) {
  try {
    if (process.env.CLOUD_HTTP_URL || process.env.CLOUD_WS_URL) {
      const result = await cloudChat(message)
      return { response: result.reply, language: result.language || null, provider: result.provider || "cloud" }
    }
  } catch (err) {
    console.warn("[CLOUD] Chat no disponible, usando LLM local:", err.message)
  }
  return { response: await localChatResponse(message), language: null, provider: "local" }
}

async function executeIntent(intent, params, originalText) {
  switch (intent) {
    case "open_app": {
      const opened = openApp(params.app)
      return { intent, response: opened ? `Opening ${params.app}` : `Could not find ${params.app}` }
    }
    case "music": {
      const { spotifyCommand } = require("./spotify")
      const response = await spotifyCommand(params.action, params.query)
      return { intent, action: "music", response }
    }
    case "web_search": {
      const u = "https://www.google.com/search?q=" + encodeURIComponent(params.query)
      require("child_process").exec(`start "" "${u}"`)
      return { intent, response: `Searching for ${params.query}` }
    }
    case "system": {
      const sysResult = await systemCmd(params.action)
      return { intent, action: params.action, ...sysResult }
    }
    case "timer": {
      if (params.action === "set") {
        const seconds = params.seconds || 60
        startTimer(seconds, params.label || "")
        const mins = Math.round(seconds / 60)
        const humanTime = seconds < 60 ? `${seconds} seconds` : `${mins} minute${mins === 1 ? "" : "s"}`
        return { intent, response: params.label ? `Timer set for ${humanTime}: ${params.label}.` : `Timer set for ${humanTime}.` }
      }
      if (params.action === "cancel") {
        const count = cancelAllTimers()
        return { intent, response: count > 0 ? `Cancelled ${count} timer${count === 1 ? "" : "s"}.` : "You have no active timers." }
      }
      const timers = listTimers()
      if (timers.length === 0) return { intent, response: "You have no active timers." }
      const desc = timers.map((t) => `${t.label || "timer"} in ${Math.round(t.secondsLeft / 60) || t.secondsLeft} ${t.secondsLeft >= 60 ? "minutes" : "seconds"}`).join(", ")
      return { intent, response: `You have: ${desc}.` }
    }
    case "chat":
    default: {
      const r = await chatResponse(params.message || originalText)
      return { intent: "chat", ...r }
    }
  }
}

async function processCommand(text) {
  const fast = fastIntent(text)
  const classification = fast === undefined ? await classifyIntent(text) : fast
  // Timer phrases remain classified by the LLM because natural-language durations are variable.
  if (classification === null) {
    const classified = await classifyIntent(text)
    return executeIntent(classified.intent, classified.params || {}, text)
  }
  return executeIntent(classification.intent, classification.params || {}, text)
}

// Streaming only applies to natural chat. Tools still execute immediately.
async function processCommandStream(text, onDelta) {
  const fast = fastIntent(text)
  if (fast === undefined) {
    try {
      if (process.env.CLOUD_HTTP_URL || process.env.CLOUD_WS_URL) {
        return await cloudChatStream(text, onDelta)
      }
    } catch (err) {
      console.warn("[CLOUD] Stream no disponible:", err.message)
    }
  }
  const result = await processCommand(text)
  if (result.response) onDelta(result.response, result)
  return result
}

module.exports = { processCommand, processCommandStream }
