// Admin notifications to a Discord channel through a webhook (.env DISCORD_ADMIN_WEBHOOK).
// Something new waiting on an admin (a claim, a Rainbet link request, a store order) posts
// one embed there with a link to that admin tab. Never blocks or fails the player's request:
// messages go out one at a time from a small queue, and a failure is only logged.
//
//   notifyAdmins(req, { title, tab, color, fields: [[name, value], …], description? })
//   POST /api/admin/notify/test  → sends a test message (admin → Overview → "Send test")
//   GET  /api/admin/notify       → { enabled }
//
// The admin link uses AUTH_URL when set, else the host the request came in on.

import { envValue } from './env.js'
import { json, origin } from './http.js'

const WEBHOOK = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/
const hook = () => String(envValue('DISCORD_ADMIN_WEBHOOK') || '').trim()
export const notifyEnabled = () => WEBHOOK.test(hook())

export const COLORS = { claim: 0xf2b42c, link: 0x4db8ff, order: 0x53fc18, win: 0xff8083, contact: 0xb38cff, test: 0x7e96a7 }

const queue = []
let sending = false
const MAX_QUEUE = 50

const clip = (s, n) => {
  const t = String(s ?? '').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

async function drain() {
  if (sending) return
  sending = true
  try {
    while (queue.length) {
      const payload = queue[0]
      let res
      try {
        res = await fetch(`${hook()}?wait=false`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        })
      } catch (err) {
        console.error(`[notify] Discord unreachable: ${err.message}`)
        queue.shift()
        continue
      }
      if (res.status === 429) {
        // Discord's rate limit: wait as long as it says, then send the same message again
        const body = await res.json().catch(() => ({}))
        const wait = Math.min(30, Math.max(0.5, Number(body.retry_after) || Number(res.headers.get('retry-after')) || 2))
        await new Promise((r) => setTimeout(r, wait * 1000))
        continue
      }
      if (!res.ok) console.error(`[notify] Discord answered ${res.status}`)
      queue.shift()
    }
  } finally {
    sending = false
  }
}

/** Queue one embed for the admins' channel. Safe to call without awaiting. */
export function notifyAdmins(req, opts) {
  if (!notifyEnabled()) return
  if (queue.length >= MAX_QUEUE) queue.shift()
  queue.push(payloadOf(req, opts))
  drain()
}

/**
 * Send one embed now and wait for Discord's answer (the contact form: the visitor is only
 * told it was sent once Discord has it). → true when delivered, false otherwise.
 */
export async function deliverToAdmins(req, opts) {
  if (!notifyEnabled()) return false
  const body = JSON.stringify(payloadOf(req, opts))
  for (let attempt = 0; attempt < 2; attempt++) {
    let res
    try {
      res = await fetch(`${hook()}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(10_000) })
    } catch (err) {
      console.error(`[notify] Discord unreachable: ${err.message}`)
      return false
    }
    if (res.ok) return true
    if (res.status !== 429) {
      console.error(`[notify] Discord answered ${res.status}`)
      return false
    }
    const info = await res.json().catch(() => ({}))
    await new Promise((r) => setTimeout(r, Math.min(5, Math.max(0.5, Number(info.retry_after) || 2)) * 1000))
  }
  return false
}

function payloadOf(req, { title, tab, color = COLORS.test, fields = [], description = '' }) {
  let url
  try {
    url = tab ? `${origin(req ?? {}, envValue('AUTH_URL'))}/admin?tab=${encodeURIComponent(tab)}` : undefined
  } catch {
    url = undefined
  }
  const embed = {
    title: clip(title, 250),
    ...(url && /^https:\/\//.test(url) ? { url } : {}),
    color,
    ...(description ? { description: clip(description, 2000) } : {}),
    fields: fields
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .slice(0, 10)
      .map(([name, value, inline = true]) => ({ name: clip(name, 250), value: clip(value, 1000), inline })),
    footer: { text: 'TEGENS admin' },
    timestamp: new Date().toISOString(),
  }
  // allowed_mentions: none, so a player's name or note can't ping @everyone or anyone else
  return { username: 'TEGENS Admin', embeds: [embed], allowed_mentions: { parse: [] } }
}

// ---------------------------------------------------------------- routes

export async function handle(req, ctx) {
  if (ctx.path !== '/api/admin/notify' && ctx.path !== '/api/admin/notify/test') return null
  if (ctx.path === '/api/admin/notify') return json(200, { enabled: notifyEnabled() })
  if (ctx.method !== 'POST') return json(405, { error: 'Use POST.' })
  if (!notifyEnabled()) return json(409, { error: 'Set DISCORD_ADMIN_WEBHOOK in .env, then restart the server.' })
  const who = ctx.user?.kick?.username ?? ctx.user?.discord?.name ?? 'an admin'
  notifyAdmins(req, {
    title: 'Admin notifications are on',
    tab: 'overview',
    color: COLORS.test,
    description: `Sent as a test by ${who}. New claims, Rainbet link requests and store orders will show up here.`,
  })
  return json(200, { ok: true })
}
