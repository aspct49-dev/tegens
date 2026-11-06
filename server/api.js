// Every /api route. Feature modules each export `handle(req, ctx)` and return a
// response, or null when the route isn't theirs; the first answer wins. Used by
// the Vite dev server (vite.config.js) and the VPS server (server/index.js).
//
// ctx: { url, path, method, user, admin, body }   (body: the parsed JSON of a POST)
// Every /api/admin/* route is refused here unless ctx.admin, so feature modules
// never have to check it themselves.

import { handleAuth, isAdmin, readSession } from './auth.js'
import { envValue } from './env.js'
import { json, readJson } from './http.js'
import * as hunts from './features/hunts.js'
import * as guess from './features/guess.js'
import * as tournaments from './features/tournaments.js'
import * as giveaway from './features/giveaway.js'
import * as giveawayWins from './features/giveawayWins.js'
import * as raffles from './features/raffles.js'
import * as challenges from './features/challenges.js'
import * as players from './features/players.js'
import * as slotpick from './features/slotpick.js'
import * as slotcalls from './features/slotcalls.js'
import * as vips from './features/vips.js'
import * as wagerStats from './features/wagerStats.js'
import * as milestoneClaims from './features/milestoneClaims.js'
import * as shop from './features/shop.js'
import * as claims from './features/claims.js'
import * as bigWins from './features/bigWins.js'
import * as contact from './features/contact.js'
import * as socials from './features/socials.js'
import * as notify from './notify.js'
import * as mods from './mods.js'
import { isMod, modMayUse } from './mods.js'
import * as audit from './audit.js'
import { auditApi } from './audit.js'
import * as kick from './kick/routes.js'

const AFFILIATES = 'https://services.rainbet.com/v1/external/affiliates'

/** GET /api/affiliates?start_at&end_at → Rainbet, with the key added here (never in the browser) */
async function handleAffiliates(req, ctx) {
  if (ctx.path !== '/api/affiliates') return null
  const key = envValue('RAINBET_API_KEY')
  if (!key) return json(500, { error: 'Missing RAINBET_API_KEY env var' })
  const upstream = new URL(AFFILIATES)
  upstream.searchParams.set('start_at', ctx.url.searchParams.get('start_at') || '')
  upstream.searchParams.set('end_at', ctx.url.searchParams.get('end_at') || '')
  upstream.searchParams.set('key', key)
  try {
    const res = await fetch(upstream)
    return {
      status: res.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' },
      body: await res.text(),
    }
  } catch {
    return json(502, { error: 'Failed to reach Rainbet API' })
  }
}

async function handleStatus(req, ctx) {
  if (ctx.path !== '/api/admin/status') return null
  return json(200, { ok: true, user: ctx.user })
}

/**
 * Local testing only: POST /api/admin/dev/chat { messages: [{ username, text }] } feeds
 * fake Kick chat into the bus (giveaway entries, !guess, watch-time). Refused unless
 * the request comes to localhost, so it can't run on the live site.
 */
async function handleDevChat(req, ctx) {
  if (ctx.path !== '/api/admin/dev/chat') return null
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.host ?? '')) return json(404, { error: 'Not found.' })
  const { emitChat } = await import('./chatbus.js')
  const list = Array.isArray(ctx.body.messages) ? ctx.body.messages.slice(0, 500) : []
  list.forEach((m, i) => {
    const username = String(m.username ?? '').slice(0, 40)
    emitChat({ id: `dev-${Date.now()}-${i}`, kickId: `dev-${username.toLowerCase()}`, username, text: String(m.text ?? ''), at: Date.now(), badges: [] })
  })
  return json(200, { sent: list.length })
}

const FEATURES = [hunts, guess, tournaments, giveaway, giveawayWins, raffles, challenges, players, slotpick, slotcalls, vips, wagerStats, milestoneClaims, claims, bigWins, shop, socials, contact, notify, mods, audit, kick]

export async function handleApi(req) {
  const url = new URL(req.url, 'http://localhost')
  const auth = await handleAuth(req)
  if (auth) return auth
  const user = readSession(req)
  const admin = isAdmin(user)
  // a mod (server/mods.js) gets only the admin routes on its list: claims and the stream tools
  const mod = !admin && user ? await isMod(user) : false
  const ctx = { url, path: url.pathname, method: req.method, user, admin, mod, body: readJson(req) }
  if (ctx.path.startsWith('/api/admin/') && !admin && !(mod && modMayUse(ctx.method, ctx.path, ctx.url)))
    return json(user ? 403 : 401, { error: user ? 'Admins only.' : 'Sign in first.' })
  const res = await route(req, ctx)
  // every successful admin change goes into the activity log (server/audit.js)
  await auditApi(ctx, res)
  return res
}

async function route(req, ctx) {
  for (const h of [handleAffiliates, handleStatus, handleDevChat]) {
    const res = await h(req, ctx)
    if (res) return res
  }
  for (const f of FEATURES) {
    const res = await f.handle?.(req, ctx)
    if (res) return res
  }
  return json(404, { error: 'Not found.' })
}

// ---------------------------------------------------------------- Node glue

const MAX_BODY = 4 * 1024 * 1024 // image uploads (base64) are the largest posts

/** Read a Node request into the plain shape the handlers take */
export async function toApiRequest(req) {
  let body = ''
  if (req.method === 'POST' || req.method === 'PUT') {
    for await (const chunk of req) {
      body += chunk
      if (body.length > MAX_BODY) throw Object.assign(new Error('Body too large'), { status: 413 })
    }
  }
  const h = req.headers
  return {
    method: req.method,
    url: req.url,
    cookie: h.cookie,
    host: h['x-forwarded-host'] ?? h.host,
    proto: h['x-forwarded-proto'],
    // the visitor's address: nginx's X-Forwarded-For when the request came through it (loopback)
    ip: /^(::1|127\.|::ffff:127\.)/.test(req.socket?.remoteAddress ?? '')
      ? String(h['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress
      : (req.socket?.remoteAddress ?? ''),
    body,
    headers: Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(',') : v])),
  }
}

/** Write a handler's response to a Node response */
export function sendApi(res, out) {
  res.statusCode = out.status
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v)
  res.end(out.body ?? '')
}

/** Connect-style middleware: /api/* → handleApi */
export async function apiMiddleware(req, res, next) {
  if (!req.url?.startsWith('/api/')) return next()
  try {
    sendApi(res, await handleApi(await toApiRequest(req)))
  } catch (err) {
    console.error('[api]', err)
    sendApi(res, json(err.status ?? 500, { error: err.status === 413 ? 'Too large.' : 'Server error.' }))
  }
}
