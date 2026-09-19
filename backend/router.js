require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") })
const Groq = require("groq-sdk")
const { openApp } = require("./apps")
const { systemCmd } = require("./system")
const { startTimer, cancelAllTimers, listTimers } = require("./timers")
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MODEL = "openai/gpt-oss-120b"
const CLASSIFY_PROMPT = "Classify the user command. Reply ONLY with valid JSON, no markdown.\nFormat: {\"intent\":\"category\",\"params\":{}}\nCategories:\n- open_app: open a program. params: {\"app\":\"name\"}\n- web_search: search internet. params: {\"query\":\"text\"}\n- system: system control. params: {\"action\":\"volume_up|volume_down|mute|shutdown|restart|time|date|stats\"} (stats = CPU/RAM usage)\n- music: control Spotify. params: {\"action\":\"play|pause|next|prev|current\",\"query\":\"song or artist (optional)\"}\n- timer: set/list/cancel a timer. params: {\"action\":\"set|list|cancel\",\"seconds\":number (for set),\"label\":\"text (optional)\"}\n- chat: conversation. params: {\"message\":\"exact user message\"}\nIMPORTANT: if user says play/pause/next/stop/skip, use music intent. If user asks to set a reminder/timer/alarm in X minutes/seconds, use timer intent and convert to seconds."
const CHAT_SYSTEM = "You are JARVIS, an AI assistant. Reply in English only. Maximum 1 sentence. No markdown."
async function classifyIntent(text) {
  try {
    const c = await groq.chat.completions.create({ model: MODEL, messages: [{ role: "system", content: CLASSIFY_PROMPT }, { role: "user", content: text }], temperature: 0.1, max_tokens: 300, reasoning_effort: "low" })
    return JSON.parse(c.choices[0].message.content.trim().replace(/```json|```/g, "").trim())
  } catch (err) {
    console.warn("[ROUTER] Fallback:", err.message)
    return { intent: "chat", params: { message: text } }
  }
}
async function chatResponse(message) {
  const c = await groq.chat.completions.create({ model: MODEL, messages: [{ role: "system", content: CHAT_SYSTEM }, { role: "user", content: message }], temperature: 0.7, max_tokens: 150, reasoning_effort: "low" })
  return c.choices[0].message.content.trim()
}
async function processCommand(text) {
  const { intent, params } = await classifyIntent(text)
  console.log("[ROUTER] Intent:", intent, params)
  switch (intent) {
    case "open_app": { const opened = openApp(params.app); return { intent, response: opened ? "Opening " + params.app : "Could not find " + params.app } }
    case "music": { const { spotifyCommand } = require("./spotify"); const response = await spotifyCommand(params.action, params.query); return { intent, action: "music", response } }
    case "web_search": { const u = "https://www.google.com/search?q=" + encodeURIComponent(params.query); require("child_process").exec("start \"\" \"" + u + "\""); return { intent, response: "Searching for " + params.query } }
    case "system": { const sysResult = await systemCmd(params.action); return { intent, action: params.action, ...sysResult } }
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
      // list
      const timers = listTimers()
      if (timers.length === 0) return { intent, response: "You have no active timers." }
      const desc = timers.map((t) => `${t.label || "timer"} in ${Math.round(t.secondsLeft / 60) || t.secondsLeft} ${t.secondsLeft >= 60 ? "minutes" : "seconds"}`).join(", ")
      return { intent, response: `You have: ${desc}.` }
    }
    case "chat": default: { const reply = await chatResponse(params.message || text); return { intent: "chat", response: reply } }
  }
}
module.exports = { processCommand }
