require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") })
const Groq = require("groq-sdk")
const { openApp } = require("./apps")
const { systemCmd } = require("./system")
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MODEL = "llama-3.3-70b-versatile"
const CLASSIFY_PROMPT = "Classify the user command. Reply ONLY with valid JSON, no markdown.\nFormat: {\"intent\":\"category\",\"params\":{}}\nCategories:\n- open_app: open a program. params: {\"app\":\"name\"}\n- web_search: search internet. params: {\"query\":\"text\"}\n- system: system control. params: {\"action\":\"volume_up|volume_down|mute|shutdown|restart|time|date\"}\n- music: control Spotify. params: {\"action\":\"play|pause|next|prev|current\",\"query\":\"song or artist (optional)\"}\n- chat: conversation. params: {\"message\":\"exact user message\"}\nIMPORTANT: if user says play/pause/next/stop/skip, use music intent."
const CHAT_SYSTEM = "You are JARVIS, an AI assistant. Reply in English only. Maximum 1 sentence. No markdown."
async function classifyIntent(text) {
  try {
    const c = await groq.chat.completions.create({ model: MODEL, messages: [{ role: "system", content: CLASSIFY_PROMPT }, { role: "user", content: text }], temperature: 0.1, max_tokens: 150 })
    return JSON.parse(c.choices[0].message.content.trim().replace(/```json|```/g, "").trim())
  } catch (err) {
    console.warn("[ROUTER] Fallback:", err.message)
    return { intent: "chat", params: { message: text } }
  }
}
async function chatResponse(message) {
  const c = await groq.chat.completions.create({ model: MODEL, messages: [{ role: "system", content: CHAT_SYSTEM }, { role: "user", content: message }], temperature: 0.7, max_tokens: 100 })
  return c.choices[0].message.content.trim()
}
async function processCommand(text) {
  const { intent, params } = await classifyIntent(text)
  console.log("[ROUTER] Intent:", intent, params)
  switch (intent) {
    case "open_app": { const opened = openApp(params.app); return { intent, response: opened ? "Opening " + params.app : "Could not find " + params.app } }
    case "music": { const { spotifyCommand } = require("./spotify"); const response = await spotifyCommand(params.action, params.query); return { intent, action: "music", response } }
    case "web_search": { const u = "https://www.google.com/search?q=" + encodeURIComponent(params.query); require("child_process").exec("start \"\" \"" + u + "\""); return { intent, response: "Searching for " + params.query } }
    case "system": { const sysResult = systemCmd(params.action); return { intent, action: params.action, ...sysResult } }
    case "chat": default: { const reply = await chatResponse(params.message || text); return { intent: "chat", response: reply } }
  }
}
module.exports = { processCommand }
