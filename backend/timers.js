// ============================================================
//  JARVIS — backend/timers.js
//  Timers simples en memoria. Cuando uno termina, emite un
//  evento 'done' para que index.js lo anuncie por voz.
// ============================================================

const EventEmitter = require('events')

const events = new EventEmitter()
const activeTimers = new Map()
let nextId = 1

function startTimer(seconds, label = '') {
  const id = nextId++
  const endsAt = Date.now() + seconds * 1000
  const timeout = setTimeout(() => {
    activeTimers.delete(id)
    events.emit('done', { id, label })
  }, seconds * 1000)
  activeTimers.set(id, { timeout, label, endsAt })
  return id
}

function cancelAllTimers() {
  const count = activeTimers.size
  for (const [, t] of activeTimers) clearTimeout(t.timeout)
  activeTimers.clear()
  return count
}

function listTimers() {
  return Array.from(activeTimers.values()).map((t) => ({
    label: t.label,
    secondsLeft: Math.max(0, Math.round((t.endsAt - Date.now()) / 1000)),
  }))
}

module.exports = { startTimer, cancelAllTimers, listTimers, events }
