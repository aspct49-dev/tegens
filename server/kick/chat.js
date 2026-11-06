// Kick chat, live, inside the server process (ported from King Kulbik). Every
// message in the channel's chat goes onto the chat bus (server/chatbus.js) from
// two independent sources, so either can fail without missing anyone:
//   - Kick's public chat socket (Pusher, chatrooms.<id>.v2), held open all the
//     time and reconnected whenever it drops or goes quiet;
//   - Kick's webhook (chat.message.sent) POSTed to /api/kick/webhook, signed by
//     Kick (RSA SHA-256 over "<message id>.<timestamp>.<body>"); unsigned, stale
//     or repeated deliveries are refused. The subscription is made with the
//     app's own token (client credentials) and checked every hour.
// The bus de-dupes, so a message seen by both arrives once.
//
//   msg: { id, kickId, username, text, at (ms), badges: ['moderator', 'subscriber', …] }
//
// Also kept here: who chatted (table chatters: { [name lower]: { name, kickId,
// lastAt (ms), count } }, saved every 30 s) and whether the stream is live
// (Kick's channel API, every 2 minutes).
//
//   isLive()                 → true while the channel is streaming
//   chattersSince(ms)        → [{ name, kickId, lastAt, count }] newest first
//   lastChatted(name)        → ms or null
//   channelInfo()            → { slug, chatroomId, broadcasterUserId } (resolved from KICK_CHANNEL)
//   chatStatus()             → the admin card's figures
//   restartChat()            → drop the socket and connect again
//   handleWebhook(req)       → POST /api/kick/webhook (server/kick/routes.js)

import { createVerify, randomBytes, randomUUID } from 'node:crypto'
import { KICK_UA } from '../auth.js'
import { registerBackground } from '../background.js'
import { emitChat } from '../chatbus.js'
import { envValue } from '../env.js'
import { json } from '../http.js'
import { read, update } from '../store.js'

const KICK_TOKEN = 'https://id.kick.com/oauth/token'
const KICK_API = 'https://api.kick.com/public/v1'
const KICK_V2 = 'https://kick.com/api/v2/channels'
// Kick rotates its Pusher key without notice (32cbd69e4b950bf97679 died in Oct 2026), so it's asked for
// the way kick.com's own web client does, with the last known key as the fallback
const KICK_REALTIME = 'https://web.kick.com/api/v1/realtime/connection'
const PUSHER_FALLBACK = { key: '34bf7a0ff419a2a775b9', cluster: 'us2' }
const pusherUrl = ({ key, cluster }) => `wss://ws-${cluster}.pusher.com/app/${key}?protocol=7&client=js&version=8.4.0&flash=false`
const CHAT_EVENT = 'App\\Events\\ChatMessageEvent'
const WEBHOOK_EVENT = 'chat.message.sent'

/** Pusher expects traffic every 120 s; a ping each minute keeps it open */
const PING_MS = 60_000
/** Nothing at all for this long (not even a pong): the socket is dead, open a new one */
const QUIET_MS = 150_000
const LIVE_MS = 2 * 60_000
const FLUSH_MS = 30_000
const SUBSCRIBE_MS = 60 * 60_000
/** Webhook deliveries older than this are refused (a replay) */
const MAX_AGE_MS = 10 * 60_000
/** Chatters not seen for this long are forgotten */
const KEEP_MS = 60 * 24 * 3600_000

export const channelSlug = () => (envValue('KICK_CHANNEL') || 'tegens').trim().toLowerCase()

// Kept on globalThis so the dev server's module reloads don't lose it (or open a second socket)
const rt = (globalThis.__tgnKickChat ??= {})
const DEFAULTS = {
  run: null, // the running connection (see start)
  socket: 'off', // 'off' | 'connecting' | 'on' | 'no-channel'
  socketSince: null,
  socketError: null,
  last: { socket: null, webhook: null },
  counts: { socket: 0, webhook: 0 },
  live: { live: false, title: null, viewers: null, startedAt: null, checkedAt: null, error: null },
  channel: null, // { slug, chatroomId, broadcasterUserId, channelId }
  channelError: null,
  webhook: { subscriptionId: null, checkedAt: null, error: null },
  chatters: null,
  dirty: false,
  handled: new Map(),
  appToken: null,
  publicKey: null,
  pusher: null, // { key, cluster, at }
}
for (const [k, v] of Object.entries(DEFAULTS)) if (!(k in rt)) rt[k] = v

const kickFetch = (url, init = {}) =>
  fetch(url, { ...init, headers: { Accept: 'application/json', 'User-Agent': KICK_UA, ...init.headers }, signal: AbortSignal.timeout(10_000) })

const errText = (err) => (err instanceof Error ? err.message : String(err))

// ---------------------------------------------------------------- chatters

async function roster() {
  if (!rt.chatters) {
    const saved = await read('chatters').catch(() => ({}))
    rt.chatters ??= new Map(Object.entries(saved ?? {}))
  }
  return rt.chatters
}

async function noteChatter(name, kickId, at) {
  const all = await roster()
  const key = name.toLowerCase()
  const seen = all.get(key)
  all.set(key, { name, kickId, lastAt: Math.max(at, seen?.lastAt ?? 0), count: (seen?.count ?? 0) + 1 })
  rt.dirty = true
}

/** Saved every 30 s at most: one write for a busy chat, not one per message */
async function flush() {
  if (!rt.dirty || !rt.chatters) return
  rt.dirty = false
  const cutoff = Date.now() - KEEP_MS
  for (const [key, c] of rt.chatters) if (c.lastAt < cutoff) rt.chatters.delete(key)
  const snapshot = Object.fromEntries(rt.chatters)
  await update('chatters', () => snapshot).catch(() => (rt.dirty = true))
  await update('kickChat', (s) => ({ ...s, lastSocketAt: rt.last.socket ?? s.lastSocketAt ?? null, lastWebhookAt: rt.last.webhook ?? s.lastWebhookAt ?? null })).catch(() => {})
}

/** Everyone who chatted since `since` (ms), newest first */
export async function chattersSince(since) {
  return [...(await roster()).values()].filter((c) => c.lastAt >= since).sort((a, b) => b.lastAt - a.lastAt)
}

/** When this viewer last chatted (ms), or null */
export async function lastChatted(name) {
  return (await roster()).get(String(name).toLowerCase())?.lastAt ?? null
}

/** One message from either source: count it, remember the chatter, put it on the bus */
function deliver(source, msg) {
  if (!msg.username || typeof msg.text !== 'string' || !msg.text) return
  rt.last[source] = Date.now()
  rt.counts[source]++
  noteChatter(msg.username, msg.kickId, msg.at).catch(() => {})
  emitChat(msg)
}

const sentAt = (createdAt) => {
  const t = Date.parse(createdAt ?? '')
  return Number.isFinite(t) ? Math.min(t, Date.now()) : Date.now()
}

const badgeTypes = (identity) => (Array.isArray(identity?.badges) ? identity.badges.map((b) => b?.type).filter(Boolean) : [])

// ---------------------------------------------------------------- the channel (and live)

export const isLive = () => Boolean(rt.live.live)
export const liveInfo = () => ({ ...rt.live })

/** The channel from Kick's v2 API (also says whether it's live); cached in kickChat */
async function lookupChannel() {
  const slug = channelSlug()
  try {
    const res = await kickFetch(`${KICK_V2}/${encodeURIComponent(slug)}`)
    const body = await res.json().catch(() => null)
    if (res.status === 404) throw Object.assign(new Error(`Kick has no channel "${slug}" (set KICK_CHANNEL).`), { missing: true })
    if (!res.ok || !body?.chatroom?.id) throw new Error(`Kick's channel API answered ${res.status}.`)
    const channel = { slug, chatroomId: body.chatroom.id, broadcasterUserId: body.user_id ?? null, channelId: body.id ?? null }
    const ls = body.livestream
    rt.live = {
      live: Boolean(ls && (ls.is_live ?? true)),
      title: ls?.session_title ?? null,
      viewers: ls?.viewer_count ?? null,
      startedAt: ls?.start_time ?? ls?.created_at ?? null,
      checkedAt: Date.now(),
      error: null,
    }
    rt.channel = channel
    rt.channelError = null
    const saved = await read('kickChat').catch(() => ({}))
    if (saved?.slug !== slug || saved?.chatroomId !== channel.chatroomId || saved?.broadcasterUserId !== channel.broadcasterUserId)
      await update('kickChat', (s) => ({ ...s, ...channel, resolvedAt: Date.now() })).catch(() => {})
    return channel
  } catch (err) {
    rt.channelError = errText(err)
    rt.live = { ...rt.live, checkedAt: Date.now(), error: rt.channelError }
    if (err.missing) {
      rt.channel = null
      rt.live.live = false
      return null
    }
    // Kick unreachable (or Cloudflare): live status from the public API when the app can sign in
    await liveFromPublicApi(slug).catch(() => {})
    if (rt.channel?.slug === slug) return rt.channel
    const saved = await read('kickChat').catch(() => ({}))
    if (saved?.slug === slug && saved.chatroomId) {
      rt.channel = { slug, chatroomId: saved.chatroomId, broadcasterUserId: saved.broadcasterUserId ?? null, channelId: saved.channelId ?? null }
      return rt.channel
    }
    return null
  }
}

async function liveFromPublicApi(slug) {
  if (!envValue('KICK_CLIENT_ID') || !envValue('KICK_CLIENT_SECRET')) return
  const body = await kickApi(`/channels?slug=${encodeURIComponent(slug)}`)
  const c = body.data?.find((d) => d.slug?.toLowerCase() === slug) ?? body.data?.[0]
  if (!c) return
  rt.live = { ...rt.live, live: Boolean(c.stream?.is_live), viewers: c.stream?.viewer_count ?? null, title: c.stream_title ?? rt.live.title, checkedAt: Date.now() }
}

export function channelInfo() {
  return rt.channel ? { ...rt.channel } : null
}

// ---------------------------------------------------------------- Kick public API (app token)

async function appToken() {
  if (rt.appToken && Date.now() < rt.appToken.expires) return rt.appToken.token
  const id = envValue('KICK_CLIENT_ID')
  const secret = envValue('KICK_CLIENT_SECRET')
  if (!id || !secret) throw new Error('Kick isn’t configured (KICK_CLIENT_ID / KICK_CLIENT_SECRET).')
  const res = await kickFetch(KICK_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.access_token) throw new Error(`Kick wouldn’t give the app a token (${res.status}).`)
  rt.appToken = { token: body.access_token, expires: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 }
  return rt.appToken.token
}

async function kickApi(path, init = {}) {
  const res = await kickFetch(KICK_API + path, {
    ...init,
    headers: { Authorization: `Bearer ${await appToken()}`, 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body) throw new Error(`Kick answered ${res.status}${body?.message ? `: ${body.message}` : ''}.`)
  return body
}

/** Make sure Kick sends the channel's chat to our webhook (an existing subscription is kept) */
async function subscribe() {
  try {
    const channel = rt.channel ?? (await lookupChannel())
    if (!channel?.broadcasterUserId) throw new Error(rt.channelError ?? 'The channel isn’t known yet.')
    const b = channel.broadcasterUserId
    const list = await kickApi(`/events/subscriptions?broadcaster_user_id=${b}`)
    let id = list.data?.find((s) => s.event === WEBHOOK_EVENT && (s.broadcaster_user_id ?? b) === b)?.id ?? null
    if (!id) {
      const made = await kickApi('/events/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ method: 'webhook', broadcaster_user_id: b, events: [{ name: WEBHOOK_EVENT, version: 1 }] }),
      })
      const result = made.data?.[0]
      if (!result?.subscription_id) throw new Error(`Kick refused the subscription${result?.error ? `: ${result.error}` : ''}.`)
      id = result.subscription_id
      console.log('[kick chat] subscribed to chat webhooks')
    }
    rt.webhook = { subscriptionId: id, checkedAt: Date.now(), error: null }
    await update('kickChat', (s) => ({ ...s, subscriptionId: id, subscribedAt: s.subscribedAt ?? Date.now(), checkedAt: Date.now(), subscribeError: null })).catch(() => {})
  } catch (err) {
    rt.webhook = { ...rt.webhook, checkedAt: Date.now(), error: errText(err) }
    await update('kickChat', (s) => ({ ...s, checkedAt: Date.now(), subscribeError: errText(err) })).catch(() => {})
  }
}

// ---------------------------------------------------------------- webhook

async function kickKey(refresh = false) {
  if (rt.publicKey && !refresh) return rt.publicKey.pem
  const res = await kickFetch(`${KICK_API}/public-key`)
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.data?.public_key) throw new Error(`Kick's public key: ${res.status}`)
  rt.publicKey = { pem: body.data.public_key, at: Date.now() }
  return rt.publicKey.pem
}

const verifyWith = (pem, signed, signature) => {
  try {
    return createVerify('RSA-SHA256').update(signed).verify(pem, signature, 'base64')
  } catch {
    return false
  }
}

async function verified(id, timestamp, body, signature) {
  const signed = `${id}.${timestamp}.${body}`
  if (verifyWith(await kickKey(), signed, signature)) return true
  // Kick may have rotated its key: fetch it again (at most every 5 minutes)
  if (rt.publicKey && Date.now() - rt.publicKey.at < 5 * 60_000) return false
  return verifyWith(await kickKey(true), signed, signature)
}

/** POST /api/kick/webhook: Kick → site */
export async function handleWebhook(req) {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const h = req.headers ?? {}
  const id = h['kick-event-message-id']
  const timestamp = h['kick-event-message-timestamp']
  const signature = h['kick-event-signature']
  const body = req.body ?? ''
  if (!id || !timestamp || !signature) return json(400, { error: 'Not a Kick event.' })
  const at = Date.parse(timestamp)
  if (!Number.isFinite(at) || Math.abs(Date.now() - at) > MAX_AGE_MS) return json(400, { error: 'Too old.' })
  if (!(await verified(id, timestamp, body, signature).catch(() => false))) return json(401, { error: 'Bad signature.' })
  if (rt.handled.has(id)) return json(200, { ok: true })
  rt.handled.set(id, Date.now())
  if (rt.handled.size > 5000) for (const [k, t] of rt.handled) if (Date.now() - t > MAX_AGE_MS * 2) rt.handled.delete(k)

  if (h['kick-event-type'] === WEBHOOK_EVENT) {
    try {
      const e = JSON.parse(body)
      const ours = !rt.channel?.broadcasterUserId || e.broadcaster?.user_id === rt.channel.broadcasterUserId
      const s = e.sender
      if (ours && s?.username && !s.is_anonymous)
        deliver('webhook', {
          id: e.message_id ?? id,
          kickId: String(s.user_id ?? ''),
          username: s.username,
          text: e.content ?? '',
          at: sentAt(e.created_at),
          badges: badgeTypes(s.identity),
        })
    } catch {
      /* a malformed event isn't worth an error back to Kick */
    }
  }
  return json(200, { ok: true })
}

// ---------------------------------------------------------------- the chat socket

/** Kick's current Pusher key (asked for at most every hour, or again after Pusher refused it) */
async function pusherKey(refresh = false) {
  if (rt.pusher && !refresh && Date.now() - rt.pusher.at < 60 * 60_000) return rt.pusher
  try {
    const res = await kickFetch(KICK_REALTIME, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // offer only Pusher: offered Centrifugo, Kick answers with that instead
      body: JSON.stringify({ client: { id: randomUUID(), type: 'web' }, capabilities: { accepted_providers: [{ provider: 'pusher' }] } }),
    })
    const body = await res.json().catch(() => null)
    const c = body?.data?.connections?.find((x) => x.provider === 'pusher')?.credentials
    if (!res.ok || !c?.app_key || !c?.cluster) throw new Error(`Kick's realtime lookup answered ${res.status}.`)
    rt.pusher = { key: c.app_key, cluster: c.cluster, at: Date.now() }
  } catch (err) {
    console.error('[kick chat] Pusher key lookup failed, using the last known key:', errText(err))
    rt.pusher = { ...(rt.pusher ?? PUSHER_FALLBACK), at: Date.now() }
  }
  return rt.pusher
}

const setSocket = (state, error = null) => {
  if (rt.socket !== state) rt.socketSince = Date.now()
  rt.socket = state
  if (error !== undefined) rt.socketError = error
}

/** Hold Kick's chat socket open for one run: reconnect on any drop, waiting longer after each failure (up to a minute) */
function chatSocket(run) {
  let ws = null
  let ping = null
  let retryTimer = null
  let failures = 0
  let heardAt = Date.now()
  let chatroomId = null
  let staleKey = false

  const close = () => {
    clearInterval(ping)
    ping = null
    const old = ws
    ws = null
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null
      try {
        old.close()
      } catch {
        /* already closed */
      }
    }
  }

  const retry = () => {
    close()
    if (run.stopped) return
    failures++
    clearTimeout(retryTimer)
    retryTimer = setTimeout(open, Math.min(60_000, 2000 * 2 ** Math.min(failures, 5)))
    retryTimer.unref?.()
  }

  const open = async () => {
    if (run.stopped) return
    close()
    const channel = rt.channel ?? (await lookupChannel())
    if (run.stopped) return
    if (!channel?.chatroomId) {
      // no such channel: the live check retries every 2 minutes
      setSocket('no-channel', rt.channelError)
      return
    }
    chatroomId = channel.chatroomId
    setSocket('connecting')
    const key = await pusherKey(staleKey)
    staleKey = false
    if (run.stopped) return
    let sock
    try {
      sock = new WebSocket(pusherUrl(key))
    } catch (err) {
      setSocket('connecting', errText(err))
      return retry()
    }
    ws = sock
    heardAt = Date.now()
    ping = setInterval(() => {
      if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ event: 'pusher:ping', data: {} }))
      if (Date.now() - heardAt > QUIET_MS) {
        console.error('[kick chat] socket went quiet: reconnecting')
        setSocket('connecting', 'The socket went quiet.')
        retry()
      }
    }, PING_MS)
    ping.unref?.()

    sock.onopen = () => sock.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel: `chatrooms.${chatroomId}.v2` } }))
    sock.onmessage = (event) => {
      heardAt = Date.now()
      let frame
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (frame.event === 'pusher:ping') return sock.send(JSON.stringify({ event: 'pusher:pong', data: {} }))
      if (frame.event === 'pusher_internal:subscription_succeeded') {
        failures = 0
        setSocket('on', null)
        return
      }
      if (frame.event === 'pusher:error') {
        let e = frame.data ?? {}
        if (typeof e === 'string') try { e = JSON.parse(e) } catch { e = { message: e } }
        // 4001: the key was rotated (or moved cluster); ask Kick again before the next try
        if (e.code >= 4000 && e.code < 4100) staleKey = true
        setSocket('connecting', `Pusher ${e.code ?? ''}: ${e.message ?? 'error'}`.trim())
        return
      }
      if (frame.event !== CHAT_EVENT) return
      try {
        // Pusher double-encodes: a JSON string inside JSON
        const m = typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data
        const s = m?.sender
        if (!s?.username) return
        deliver('socket', {
          id: m.id,
          kickId: String(s.id ?? ''),
          username: s.username,
          text: m.content ?? '',
          at: sentAt(m.created_at),
          badges: badgeTypes(s.identity),
        })
      } catch {
        /* a malformed frame isn't worth dropping the connection for */
      }
    }
    sock.onclose = sock.onerror = () => {
      if (ws !== sock) return
      setSocket('connecting', 'The socket closed.')
      retry()
    }
  }

  open()
  return {
    /** The chatroom changed (or the socket never opened): connect again */
    refresh() {
      if (run.stopped) return
      if (!ws || rt.channel?.chatroomId !== chatroomId) {
        failures = 0
        clearTimeout(retryTimer)
        open()
      }
    },
    stop() {
      clearTimeout(retryTimer)
      close()
    },
  }
}

// ---------------------------------------------------------------- running it

const MODULE = randomBytes(6).toString('hex')

/** Start (or restart) everything: the socket, the live check, the chatter flush, the webhook check */
function start() {
  rt.run?.stop()
  const run = { module: MODULE, stopped: false, timers: [] }
  rt.run = run
  const every = (ms, fn) => {
    const t = setInterval(() => !run.stopped && fn(), ms)
    t.unref?.()
    run.timers.push(t)
  }
  roster().catch(() => {})
  run.socket = chatSocket(run)
  every(LIVE_MS, async () => {
    await lookupChannel()
    run.socket.refresh()
  })
  every(FLUSH_MS, () => flush().catch(() => {}))
  if (envValue('KICK_CLIENT_ID') && envValue('KICK_CLIENT_SECRET')) {
    every(SUBSCRIBE_MS, () => subscribe())
    setTimeout(() => !run.stopped && subscribe(), 3000).unref?.()
  }
  run.stop = () => {
    if (run.stopped) return
    run.stopped = true
    for (const t of run.timers) clearInterval(t)
    run.socket.stop()
    if (rt.run === run) {
      rt.run = null
      setSocket('off')
    }
    flush().catch(() => {})
  }
  return run.stop
}

registerBackground('kick-chat', start)

/** Start it if nothing is running yet, or the running one is from older code (dev reloads) */
export function ensureChat() {
  if (!rt.run || rt.run.module !== MODULE) start()
}

/** Drop everything and connect again (the admin's Reconnect button) */
export async function restartChat() {
  rt.channel = null
  await lookupChannel()
  start()
  if (!rt.channel) setSocket('no-channel', rt.channelError)
  return chatStatus()
}

// ---------------------------------------------------------------- status

export async function chatStatus() {
  const saved = await read('kickChat').catch(() => ({}))
  const day = await chattersSince(Date.now() - 24 * 3600_000).catch(() => [])
  const channel = rt.channel ?? (saved?.slug === channelSlug() ? saved : null)
  return {
    channel: {
      slug: channelSlug(),
      chatroomId: channel?.chatroomId ?? null,
      broadcasterUserId: channel?.broadcasterUserId ?? null,
      error: rt.channelError,
    },
    live: { ...rt.live },
    socket: {
      state: rt.socket,
      since: rt.socketSince,
      error: rt.socketError,
      lastMessageAt: rt.last.socket ?? saved?.lastSocketAt ?? null,
      messages: rt.counts.socket,
    },
    webhook: {
      configured: Boolean(envValue('KICK_CLIENT_ID') && envValue('KICK_CLIENT_SECRET')),
      subscribed: Boolean(rt.webhook.subscriptionId ?? saved?.subscriptionId),
      subscriptionId: rt.webhook.subscriptionId ?? saved?.subscriptionId ?? null,
      checkedAt: rt.webhook.checkedAt ?? saved?.checkedAt ?? null,
      error: rt.webhook.error ?? saved?.subscribeError ?? null,
      lastMessageAt: rt.last.webhook ?? saved?.lastWebhookAt ?? null,
      messages: rt.counts.webhook,
    },
    chatters: { today: day.length, total: rt.chatters?.size ?? 0 },
  }
}
