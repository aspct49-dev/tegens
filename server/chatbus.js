// Kick chat, inside the server process. server/kick/chat.js feeds every chat
// message in (from Kick's webhook and its live chat socket, de-duplicated);
// features subscribe to react to commands like !guess or !join.
//
//   onChat((msg) => …)        msg: { id, kickId, username, text, at, badges: string[] }
//   onChat returns an unsubscribe function.
//   emitChat(msg)            (server/kick/chat.js only)
//
// Kept on globalThis so the Vite dev server's module reloads don't split it.

const bus = (globalThis.__tgnChatBus ??= { handlers: new Map(), seen: new Map() })

/** Subscribe under a name; subscribing again with the same name replaces it (safe on reload) */
export function onChat(name, handler) {
  bus.handlers.set(name, handler)
  return () => bus.handlers.delete(name)
}

/** Deliver one message to every subscriber (each message id once, for 10 minutes) */
export function emitChat(msg) {
  if (!msg?.text || !msg.username) return
  const key = msg.id ?? `${msg.kickId}:${msg.at}:${msg.text}`
  const now = Date.now()
  if (bus.seen.has(key)) return
  bus.seen.set(key, now)
  if (bus.seen.size > 5000) for (const [k, t] of bus.seen) if (now - t > 600_000) bus.seen.delete(k)
  for (const [name, h] of bus.handlers) {
    try {
      const r = h(msg)
      if (r?.catch) r.catch((err) => console.error(`[chat] ${name} failed:`, err))
    } catch (err) {
      console.error(`[chat] ${name} failed:`, err)
    }
  }
}

/** "!guess 12,500" → { command: 'guess', args: ['12,500'] } (null if not a command) */
export function parseCommand(text) {
  const m = /^\s*!([a-z0-9_]+)\b\s*(.*)$/i.exec(text ?? '')
  if (!m) return null
  return { command: m[1].toLowerCase(), args: m[2].trim() ? m[2].trim().split(/\s+/) : [] }
}
