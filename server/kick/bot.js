// The TEGENS chat bot: posts messages in the channel's Kick chat through Kick's
// public API, as a bot account (best a separate Kick account, e.g. TegensBot).
// An admin connects that account once (OAuth 2.1 + PKCE, like server/auth.js,
// scopes user:read chat:write); its tokens live in the store table `bot` and are
// refreshed before they expire.
//
//   sendChat(text) → true when sent; never throws, so features can call it freely.
//   Sends go out one at a time, at most one every 1.5 s; a queue of 20, the
//   oldest dropped (its sendChat answers false) when it overflows.
//
//   GET /api/admin/kick/bot/connect  → startBotConnect   (server/kick/routes.js)
//   GET /api/kick/bot/callback       → finishBotConnect
//   POST /api/admin/kick/bot/disconnect, /test

import { createHash, randomBytes } from 'node:crypto'
import { KICK_UA } from '../auth.js'
import { envValue } from '../env.js'
import { cookie, json, nowSeconds, origin, parseCookies, redirect, seal, unseal } from '../http.js'
import { read, update } from '../store.js'
import { channelInfo, channelSlug } from './chat.js'

const KICK_AUTHORIZE = 'https://id.kick.com/oauth/authorize'
const KICK_TOKEN = 'https://id.kick.com/oauth/token'
const KICK_API = 'https://api.kick.com/public/v1'
const STATE_COOKIE = 'tg_bot_oauth'
const STATE_MINUTES = 10
const SCOPES = 'user:read chat:write'
const DONE_PAGE = '/admin?tab=overview'
const MAX_CHARS = 500
const GAP_MS = 1500
const QUEUE_MAX = 20
/** Refresh the token when it has less than this left */
const REFRESH_EARLY_S = 5 * 60

// Kept on globalThis so the dev server's module reloads don't split the queue
const rt = (globalThis.__tgnKickBot ??= { queue: [], sending: false, lastSentAt: 0, refreshing: null, lastError: null, sent: 0 })

const kickFetch = (url, init = {}) =>
  fetch(url, { ...init, headers: { Accept: 'application/json', 'User-Agent': KICK_UA, ...init.headers }, signal: AbortSignal.timeout(10_000) })

const errText = (err) => (err instanceof Error ? err.message : String(err))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- tokens

async function tokenRequest(params) {
  const res = await kickFetch(KICK_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: envValue('KICK_CLIENT_ID'), client_secret: envValue('KICK_CLIENT_SECRET'), ...params }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.access_token) throw Object.assign(new Error(`Kick token request failed (${res.status}).`), { status: res.status })
  return body
}

const fromToken = (t, prev = {}) => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token ?? prev.refreshToken ?? null,
  expiresAt: nowSeconds() + (Number(t.expires_in) || 3600),
  scope: t.scope ?? prev.scope ?? SCOPES,
})

/** Refresh the bot's token (one refresh at a time) */
function refresh() {
  rt.refreshing ??= (async () => {
    try {
      const bot = await read('bot')
      if (!bot?.refreshToken) throw new Error('The bot needs connecting again.')
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: bot.refreshToken })
      const next = await update('bot', (b) => ({ ...b, ...fromToken(t, b), error: null }))
      return next.accessToken
    } catch (err) {
      // a refused refresh token won't work again: the admin has to reconnect
      const dead = err.status === 400 || err.status === 401
      await update('bot', (b) => ({ ...b, error: dead ? 'Kick refused the bot’s token. Connect it again.' : errText(err) })).catch(() => {})
      throw err
    } finally {
      rt.refreshing = null
    }
  })()
  return rt.refreshing
}

async function accessToken() {
  const bot = await read('bot')
  if (!bot?.accessToken) return null
  if ((bot.expiresAt ?? 0) - REFRESH_EARLY_S > nowSeconds()) return bot.accessToken
  return refresh()
}

/** The broadcaster to post to: chat.js's channel, else the bot record, else Kick's public API */
async function broadcasterId(token) {
  const fromChat = channelInfo()?.broadcasterUserId
  if (fromChat) return fromChat
  const bot = await read('bot')
  if (bot?.broadcasterUserId && bot.channelSlug === channelSlug()) return bot.broadcasterUserId
  const slug = channelSlug()
  const res = await kickFetch(`${KICK_API}/channels?slug=${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await res.json().catch(() => null)
  const c = body?.data?.find((d) => d.slug?.toLowerCase() === slug) ?? body?.data?.[0]
  if (!c?.broadcaster_user_id) return null
  await update('bot', (b) => ({ ...b, broadcasterUserId: c.broadcaster_user_id, channelSlug: slug })).catch(() => {})
  return c.broadcaster_user_id
}

// ---------------------------------------------------------------- sending

async function post(content) {
  let token = await accessToken()
  if (!token) throw new Error('The bot isn’t connected.')
  const broadcaster = await broadcasterId(token)
  if (!broadcaster) throw new Error(`Couldn’t find the Kick channel "${channelSlug()}".`)
  const send = (t) =>
    kickFetch(`${KICK_API}/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', content, broadcaster_user_id: broadcaster }),
    })
  let res = await send(token)
  if (res.status === 401) {
    // revoked or expired early: one refresh, one more try
    token = await refresh()
    res = await send(token)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.data?.is_sent === false) throw new Error(`Kick wouldn’t post the message (${res.status}${body?.message ? `: ${body.message}` : ''}).`)
}

async function drain() {
  if (rt.sending) return
  rt.sending = true
  try {
    while (rt.queue.length) {
      const wait = rt.lastSentAt + GAP_MS - Date.now()
      if (wait > 0) await sleep(wait)
      const job = rt.queue.shift()
      if (!job) break
      try {
        await post(job.text)
        rt.lastError = null
        rt.sent++
        job.resolve(true)
      } catch (err) {
        rt.lastError = errText(err)
        console.error('[kick bot] send failed:', rt.lastError)
        job.resolve(false)
      }
      rt.lastSentAt = Date.now()
    }
  } finally {
    rt.sending = false
  }
}

/** Post `text` in the channel's chat as the bot → true when Kick took it; never throws */
export async function sendChat(text) {
  try {
    let content = String(text ?? '').replace(/\s+/g, ' ').trim()
    if (!content) return false
    const chars = [...content]
    if (chars.length > MAX_CHARS) content = chars.slice(0, MAX_CHARS - 1).join('') + '…'
    const bot = await read('bot')
    if (!bot?.accessToken) return false
    return await new Promise((resolve) => {
      rt.queue.push({ text: content, resolve })
      while (rt.queue.length > QUEUE_MAX) rt.queue.shift().resolve(false)
      drain().catch(() => {})
    })
  } catch (err) {
    rt.lastError = errText(err)
    return false
  }
}

// ---------------------------------------------------------------- connecting the bot account

const secret = () => envValue('SESSION_SECRET')

function back(message, cookies = []) {
  const url = new URL(DONE_PAGE, 'http://x')
  if (message) url.searchParams.set('bot_error', message)
  return redirect(url.pathname + url.search, cookies)
}

/** GET /api/admin/kick/bot/connect → Kick's sign-in, as the bot account */
export function startBotConnect(req) {
  const id = envValue('KICK_CLIENT_ID')
  const s = secret()
  if (!id || !envValue('KICK_CLIENT_SECRET')) return json(500, { error: 'Kick isn’t configured (KICK_CLIENT_ID / KICK_CLIENT_SECRET).' })
  if (!s || s.length < 32) return json(500, { error: 'SESSION_SECRET isn’t set.' })
  const base = origin(req, envValue('AUTH_URL'))
  const verifier = randomBytes(48).toString('base64url')
  const state = { state: randomBytes(16).toString('base64url'), verifier, expires: nowSeconds() + STATE_MINUTES * 60 }
  const a = new URL(KICK_AUTHORIZE)
  a.searchParams.set('client_id', id)
  a.searchParams.set('response_type', 'code')
  a.searchParams.set('redirect_uri', `${base}/api/kick/bot/callback`)
  a.searchParams.set('scope', SCOPES)
  a.searchParams.set('state', state.state)
  a.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
  a.searchParams.set('code_challenge_method', 'S256')
  return redirect(a.toString(), [cookie(STATE_COOKIE, seal(state, s), STATE_MINUTES * 60, base.startsWith('https://'))])
}

/** GET /api/kick/bot/callback: Kick → here with a code; save the bot's tokens */
export async function finishBotConnect(req, ctx) {
  const s = secret()
  const base = origin(req, envValue('AUTH_URL'))
  const clearState = cookie(STATE_COOKIE, '', 0, base.startsWith('https://'))
  if (!ctx.admin) return back('Sign in as an admin first.', [clearState])
  const saved = unseal(parseCookies(req.cookie)[STATE_COOKIE], s)
  const url = ctx.url
  if (url.searchParams.get('error')) return back('Connecting the bot was cancelled.', [clearState])
  if (!saved?.verifier || saved.expires < nowSeconds() || saved.state !== url.searchParams.get('state'))
    return back('That link expired. Please try again.', [clearState])
  const code = url.searchParams.get('code')
  if (!code) return back('Kick didn’t send a code.', [clearState])
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: `${base}/api/kick/bot/callback`, code_verifier: saved.verifier })
    const meRes = await kickFetch(`${KICK_API}/users`, { headers: { Authorization: `Bearer ${t.access_token}` } })
    const body = await meRes.json().catch(() => null)
    const me = Array.isArray(body?.data) ? body.data[0] : body?.data
    if (!meRes.ok || !me?.user_id) return back('Kick wouldn’t say which account that is.', [clearState])
    const tokens = fromToken(t)
    const broadcaster = channelInfo()?.broadcasterUserId ?? (await broadcasterId(tokens.accessToken).catch(() => null))
    await update('bot', () => ({
      ...tokens,
      botUsername: me.name ?? `kick-${me.user_id}`,
      botUserId: me.user_id,
      broadcasterUserId: broadcaster ?? null,
      channelSlug: channelSlug(),
      connectedAt: nowSeconds(),
      connectedBy: ctx.user?.kick?.username ?? ctx.user?.id ?? null,
      error: null,
    }))
    rt.lastError = null
    return back('', [clearState])
  } catch (err) {
    console.error('[kick bot] connect failed:', errText(err))
    return back('Kick wouldn’t connect the bot. Please try again.', [clearState])
  }
}

/** Forget the bot account (and tell Kick to drop its token, best effort) */
export async function disconnectBot() {
  rt.queue.splice(0).forEach((job) => job.resolve(false))
  const bot = await read('bot').catch(() => ({}))
  await update('bot', () => ({}))
  if (bot?.refreshToken)
    await kickFetch(`https://id.kick.com/oauth/revoke?${new URLSearchParams({ token: bot.refreshToken, token_hint_type: 'refresh_token' })}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => {})
  rt.lastError = null
}

export async function botStatus() {
  const bot = await read('bot').catch(() => ({}))
  return {
    connected: Boolean(bot?.accessToken),
    username: bot?.botUsername ?? null,
    userId: bot?.botUserId ?? null,
    broadcasterUserId: bot?.broadcasterUserId ?? null,
    expiresAt: bot?.expiresAt ?? null,
    connectedAt: bot?.connectedAt ?? null,
    error: bot?.error ?? rt.lastError ?? null,
    queued: rt.queue.length,
    sent: rt.sent,
    lastSentAt: rt.lastSentAt || null,
  }
}
