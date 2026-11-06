// BotRix loyalty points (TEGEN points) for the Kick channel (KICK_CHANNEL).
//
// Reading needs no credentials: the public leaderboard answers "how many points does
// <viewer> have on this channel":
//   GET https://botrix.live/api/public/leaderboard?platform=kick&user=<channel>&search=<viewer>
//   → [{ name, points, watchtime (minutes), level, xp, followage }]
//
// Changing points uses the extension endpoint with the channel's bid token (.env `bid`,
// or BOTRIX_BID):
//   GET https://botrix.live/api/extension/substractPoints?name=<viewer>&platform=kick&points=<n>&bid=<bid>
//   → { success: true } | { success: false, reason: 'user_not_found' | … }
// BotRix's sign convention: a positive n TAKES points, a negative n ADDS them. A wrong bid
// gets an empty 200 reply.
//
// BOTRIX_API_BASE points everything at a stand-in (tests: never touches real points).

import { envValue } from './env.js'

const base = () => (envValue('BOTRIX_API_BASE') || 'https://botrix.live').replace(/\/+$/, '')
const channel = () => envValue('KICK_CHANNEL') || 'travellingdegens'
// The bid is often copied out of a BotRix URL still percent-encoded (e.g. %2F); it's encoded
// again when sent, so decode it first or BotRix sees a different token.
const bid = () => {
  const raw = String(envValue('BOTRIX_BID') || envValue('bid') || '').trim()
  if (!/%[0-9a-f]{2}/i.test(raw)) return raw
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
const CACHE_MS = 60_000

/** Is the bid token set (points can be changed)? */
export const botrixCanChange = () => Boolean(bid())

// ---------------------------------------------------------------- rate limit

// BotRix allows about 100 requests a minute from one server, then refuses everything
// (points changes included) for ~40 s with a 429 and Retry-After. Every call here shares
// one budget under that; after a 429 nothing is sent until BotRix says to try again.
const WINDOW_MS = 60_000
const PER_MIN = 90
const BACKGROUND_PER_MIN = 50
const sent = []
let blockedUntil = 0

/** Not sent: the budget for this minute is used, or BotRix asked us to wait */
export class BotrixBusyError extends Error {}

/** A GET to BotRix within the budget; `background` work gets the smaller share */
export async function botrixFetch(url, background = false) {
  const now = Date.now()
  while (sent.length && now - sent[0] >= WINDOW_MS) sent.shift()
  if (now < blockedUntil) throw new BotrixBusyError(`BotRix asked us to wait ${Math.ceil((blockedUntil - now) / 1000)} s.`)
  if (sent.length >= (background ? BACKGROUND_PER_MIN : PER_MIN)) throw new BotrixBusyError('BotRix is busy this minute. Try again shortly.')
  sent.push(now)
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10_000) })
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after'))
    blockedUntil = Date.now() + (Number.isFinite(wait) && wait > 0 ? wait : 60) * 1000
    console.error(`[botrix] rate limited: waiting ${Math.round((blockedUntil - Date.now()) / 1000)} s`)
  }
  return res
}

// ---------------------------------------------------------------- reading points

const cache = new Map()

/**
 * A viewer's points on the channel → { name, points, watchtime, level }, or null if BotRix
 * has never seen them. `fresh` skips the one-minute cache.
 */
export async function getBotrixViewer(kickName, fresh = false, background = false) {
  const key = String(kickName).toLowerCase()
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value

  const url = new URL(`${base()}/api/public/leaderboard`)
  url.searchParams.set('platform', 'kick')
  url.searchParams.set('user', channel())
  url.searchParams.set('search', kickName)
  const res = await botrixFetch(url, background)
  if (!res.ok) throw new Error(`BotRix answered ${res.status}`)
  const rows = await res.json()
  // the search is a contains match: pick the exact name
  const row = Array.isArray(rows) ? rows.find((r) => String(r?.name ?? '').toLowerCase() === key) : undefined
  const value = row ? { name: row.name ?? kickName, points: Number(row.points) || 0, watchtime: Number(row.watchtime) || 0, level: Number(row.level) || 0 } : null
  cache.set(key, { at: Date.now(), value })
  return value
}

// ---------------------------------------------------------------- changing points

export class BotrixError extends Error {
  /** code: user_not_found | insufficient | bid | unreachable | input | busy | failed */
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

/** Add (delta > 0) or take (delta < 0) points. Throws BotrixError with a message fit to show. */
export async function adjustBotrixPoints(kickName, delta) {
  const token = bid()
  if (!token) throw new BotrixError('The BotRix bid token is not set (bid in .env).', 'bid')
  if (!Number.isInteger(delta) || delta === 0) throw new BotrixError('Change points by a whole number.', 'input')
  const url = new URL(`${base()}/api/extension/substractPoints`)
  url.searchParams.set('name', kickName)
  url.searchParams.set('platform', 'kick')
  url.searchParams.set('points', String(-delta)) // BotRix: positive takes, negative adds
  url.searchParams.set('bid', token)

  let text
  try {
    const res = await botrixFetch(url)
    text = await res.text()
    if (!res.ok) throw new BotrixError(`BotRix answered ${res.status}.`, 'unreachable')
  } catch (err) {
    if (err instanceof BotrixError) throw err
    if (err instanceof BotrixBusyError) throw new BotrixError(err.message, 'busy')
    throw new BotrixError('Could not reach BotRix. Please try again.', 'unreachable')
  } finally {
    cache.delete(String(kickName).toLowerCase())
  }

  let body = null
  try {
    body = text.trim() ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!body) throw new BotrixError('BotRix refused the bid token. Check bid in .env.', 'bid')
  if (body.success) return
  const reason = String(body.reason ?? '')
  if (reason === 'user_not_found') throw new BotrixError(`BotRix has no viewer called ${kickName} on this channel.`, 'user_not_found')
  if (delta < 0) throw new BotrixError(`${kickName} doesn’t have enough TEGEN points.`, 'insufficient')
  throw new BotrixError(`BotRix didn’t make the change${reason ? ` (${reason})` : ''}.`, reason || 'failed')
}
