// Raffles: a WAGER raffle (tickets per $ wagered under the code on Rainbet) and a
// WATCH-TIME raffle (tickets per minute watched on Kick). Ported from King Kulbik's
// server/raffles.ts, with the sources swapped for Rainbet and Kick chat.
//
// Lifecycle
//   open      tickets count live from the raffle's source (hourly snapshots kept)
//   locked    entries frozen in a fixed order (by name), every player gets a player
//             number 1..N (by name, or by when they joined), a secret seed is made
//             and only its SHA-256 is published. Draws are made one at a time.
//   complete  every prize drawn: the seed is revealed, so anyone can re-run the draws.
//   Unlock (back to open) only before the first draw.
//
// Fair draws (the same scheme as src/raffle.js and King Kulbik)
//   Draw k takes one float from HMAC-SHA256(seed, `${raffle.id}:${k}:0`), picks ticket
//   floor(float × tickets in play) and the entry holding it (frozen order) wins, so odds
//   are exactly tickets ÷ tickets in play. Someone at the win cap leaves the pool. A
//   rerolled draw stays on the record, that player leaves the pool, and the next k
//   replaces it. A reroll counts only from when it was made (`rerolledBefore`), so
//   every draw replays exactly as it was made. The machine shows the winner's player number; their name prints.
//
// Watch time (Kick chat)
//   Real watch minutes would need BotRix (or similar); until that's known, a viewer
//   earns `windowMinutes` for every window of that many minutes in which they chatted
//   while the stream was live. Chat activity is kept per viewer per UTC day as a
//   1440-bit map of active minutes (table watchActivity), so a raffle's window length
//   can change at any time and is applied when counting. Lurkers earn nothing.
//   Sources are pluggable (SOURCES below): add `botrix` to SOURCES.watch later.
//
// Routes
//   GET  /api/raffles[?kind=wager|watch][&me=name]   the current raffle (of each kind), names masked
//   GET  /api/raffles?kind=wager|watch&id=<id>      that raffle instead (past months); with a kind the answer also
//                                                    has `list`: { id, title, start, end, status } newest first
//   GET  /api/admin/raffles                          every raffle with live entries (full names) + watch status
//   POST /api/admin/raffles                          { kind, title?, start?, end?, prizePool?, prizePerDraw?,
//                                                      maxWinsPerPerson?, ticketUnit?, windowMinutes?, numbering? }
//   POST /api/admin/raffles/<id>                     settings (open raffles only)
//   POST /api/admin/raffles/<id>/lock                freeze + commit the seed ({ snapshot: at } locks with a saved copy)
//   POST /api/admin/raffles/<id>/unlock              back to open (before any draw)
//   POST /api/admin/raffles/<id>/draw                the next draw
//   POST /api/admin/raffles/<id>/reroll              { n }: void draw n and draw its replacement
//   POST /api/admin/raffles/<id>/finish              every prize drawn: complete, reveal the seed
//   POST /api/admin/raffles/<id>/delete
//   POST /api/admin/raffles/<id>/snapshot            save a copy of the live ticket list now
//   GET  /api/admin/raffles/<id>/snapshots           saved copies (summaries)
//   GET  /api/admin/raffles/<id>/snapshots/<at>      one saved copy, with entries
//
// Times are unix seconds (like the rest of the store); start/end are UTC days, inclusive.

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { registerBackground } from '../background.js'
import { onChat } from '../chatbus.js'
import { envValue } from '../env.js'
import { json, nowSeconds } from '../http.js'
import { sendChat } from '../kick/bot.js'
import { read, update } from '../store.js'
import { badgeNames } from './vips.js'

class InputError extends Error {}

const DAY_MS = 86_400_000
const RAINBET = 'https://services.rainbet.com/v1/external/affiliates'
const MAX_PLAYER_NUMBER = 9999 // four drums

export const DEFAULTS = {
  wager: { title: 'Monthly Wager Raffle', prizePool: 1000, prizePerDraw: 200, maxWinsPerPerson: 2, ticketUnit: 1000, source: 'rainbet' },
  watch: { title: 'Monthly Watch-Time Raffle', prizePool: 500, prizePerDraw: 100, maxWinsPerPerson: 2, ticketUnit: 60, windowMinutes: 5, source: 'chat' },
}

// ---------------------------------------------------------------- pure: draws

/** Floats in [0, 1) from HMAC-SHA256(seed, `${clientSeed}:${nonce}:${round}`), 4 bytes each (= src/raffle.js) */
export function fairFloats(seed, clientSeed, nonce, count) {
  const floats = []
  for (let round = 0; floats.length < count; round++) {
    const bytes = createHmac('sha256', seed).update(`${clientSeed}:${nonce}:${round}`).digest()
    for (let i = 0; i + 4 <= bytes.length && floats.length < count; i += 4) {
      floats.push(bytes[i] / 256 + bytes[i + 1] / 256 ** 2 + bytes[i + 2] / 256 ** 3 + bytes[i + 3] / 256 ** 4)
    }
  }
  return floats
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex')
export const drawCount = (r) => (r.prizePerDraw > 0 ? Math.floor(r.prizePool / r.prizePerDraw + 1e-9) : 0)
export const ticketsFor = (amount, unit) => (unit > 0 ? Math.floor(amount / unit + 1e-9) : 0)
export const keptDraws = (draws) => draws.filter((d) => !d.rerolledAt)

/** Chat bots and the like never get tickets ("@BotRix", "Kick_Bot " match too) */
const BOTS = ['kickbot', 'botrix', 'botrixoficial', 'bonustracker', 'streamelements', 'nightbot', 'moobot', 'fossabot', 'serybot', 'tegensbot']
const plain = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
function excludedNames() {
  const extra = `${envValue('KICK_BOT_USERNAME')},${envValue('RAFFLE_EXCLUDED_NAMES')}`.split(',').map(plain).filter(Boolean)
  return new Set([...BOTS, ...extra])
}
export const isExcluded = (name, set = excludedNames()) => set.has(plain(name))

/** Merge rows per name (case-insensitive), turn amounts into tickets, freeze in a fixed order (by name, then amount) */
export function freezeEntries(rows, unit, excluded = excludedNames()) {
  const merged = new Map()
  for (const r of rows) {
    const name = String(r.name ?? '').trim()
    if (!name || isExcluded(name, excluded)) continue
    const key = name.toLowerCase()
    const hit = merged.get(key)
    merged.set(key, { name: hit?.name ?? name, amount: (hit?.amount ?? 0) + (Number(r.amount) || 0) })
  }
  return [...merged.values()]
    .map((r) => ({ name: r.name, amount: Math.round(r.amount * 100) / 100, tickets: ticketsFor(r.amount, unit) }))
    .filter((e) => e.tickets > 0)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || b.amount - a.amount)
}

/**
 * Player numbers 1..N. 'name': the frozen order. 'joined': by when each player first
 * earned a ticket (joined: { lowercase name: unix s }), ties by name. The entries keep
 * their frozen order (the draws use it); only the numbers differ.
 */
export function assignNumbers(entries, numbering = 'name', joined = {}) {
  const order = entries.map((e, i) => ({ e, i }))
  if (numbering === 'joined') {
    const at = (e) => joined[e.name.toLowerCase()] ?? Number.MAX_SAFE_INTEGER
    order.sort((a, b) => at(a.e) - at(b.e) || a.i - b.i)
  }
  const num = new Map(order.map(({ i }, k) => [i, k + 1]))
  return entries.map((e, i) => ({ ...e, playerNumber: num.get(i) }))
}

/** Who can still be drawn: under the win cap, and not rerolled away */
export function stillInDraw(entries, draws, maxWins) {
  const wins = new Map()
  const out = new Set()
  for (const d of draws) {
    if (d.rerolledAt) out.add(d.name)
    else wins.set(d.name, (wins.get(d.name) ?? 0) + 1)
  }
  return entries.filter((e) => !out.has(e.name) && (wins.get(e.name) ?? 0) < maxWins)
}

/** Draw k = previous.length (rerolled draws included); null when nobody is left */
export function drawNext(raffle, seed, previous) {
  const eligible = stillInDraw(raffle.entries, previous, raffle.maxWinsPerPerson)
  const pool = eligible.reduce((s, e) => s + e.tickets, 0)
  if (pool <= 0) return null
  const [f] = fairFloats(seed, raffle.id, previous.length, 1)
  const ticket = Math.min(pool - 1, Math.floor(f * pool))
  let at = 0
  for (const e of eligible) {
    at += e.tickets
    if (ticket < at) return { name: e.name, playerNumber: e.playerNumber, ticket, pool }
  }
  return null
}

/**
 * The draws as they stood when draw k was made: a reroll only counts from the moment
 * it happened (`rerolledBefore`: how many draws existed then), so a draw made before
 * a reroll replays exactly as it was made.
 */
export const drawsBefore = (draws, k) =>
  draws.slice(0, k).map((d) => (d.rerolledAt && (d.rerolledBefore ?? 0) <= k ? d : { ...d, rerolledAt: undefined }))

/** Re-run the recorded draws from a seed (which were rerolled, and when, comes from the record) */
export function replayDraws(raffle, seed, recorded) {
  const out = []
  for (let k = 0; k < recorded.length; k++) {
    const next = drawNext(raffle, seed, drawsBefore(recorded, k))
    if (!next) break
    out.push(next)
  }
  return out
}

/** "Mysticwolf" → "Mystic***" (= src/utils.js maskName) */
export const maskName = (name) => {
  if (!name) return ''
  const keep = Math.max(1, Math.min(6, Math.ceil(name.length / 2)))
  return name.slice(0, keep) + '***'
}

export const pad4 = (n) => String(Math.max(0, Number(n) || 0) % 10_000).padStart(4, '0')

/** The prize slot (#1, #2, ...) of each draw: a replacement takes the slot of the draw it replaces */
export function withSlots(draws) {
  const slotOf = new Map()
  let next = 0
  return draws.map((d) => {
    const slot = d.replaces !== undefined && slotOf.has(d.replaces) ? slotOf.get(d.replaces) : ++next
    slotOf.set(d.n, slot)
    return { ...d, slot }
  })
}

// ---------------------------------------------------------------- pure: watch windows

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)
const dayStart = (iso) => Date.parse(`${iso}T00:00:00Z`)
export const minuteOf = (ms) => Math.floor(ms / 60_000)
const BITMAP_BYTES = 180 // 1440 minutes

/** Set one active minute (epoch minute) for `key` in an activity table { names, days } (mutates) */
export function markActive(activity, key, name, minute) {
  const day = isoDay(minute * 60_000)
  const of = minute - minuteOf(dayStart(day))
  activity.names ??= {}
  activity.days ??= {}
  activity.names[key] = name
  const days = (activity.days[day] ??= {})
  const bits = days[key] ? Buffer.from(days[key], 'base64') : Buffer.alloc(BITMAP_BYTES)
  bits[of >> 3] |= 1 << (of & 7)
  days[key] = bits.toString('base64')
  return activity
}

/** Every active epoch minute per key within [fromMin, toMin) */
export function activeMinutes(activity, fromMin, toMin) {
  const out = new Map()
  for (const [day, users] of Object.entries(activity.days ?? {})) {
    const base = minuteOf(dayStart(day))
    if (base + 1440 <= fromMin || base >= toMin) continue
    for (const [key, b64] of Object.entries(users)) {
      const bits = Buffer.from(b64, 'base64')
      for (let i = 0; i < 1440; i++) {
        if (!(bits[i >> 3] & (1 << (i & 7)))) continue
        const m = base + i
        if (m < fromMin || m >= toMin) continue
        let list = out.get(key)
        if (!list) out.set(key, (list = []))
        list.push(m)
      }
    }
  }
  return out
}

/** Minutes credited: distinct `windowLen`-minute windows (aligned to the epoch) with any activity, × windowLen */
export function windowMinutes(minutes, windowLen) {
  const len = Math.max(1, Math.round(windowLen))
  return new Set(minutes.map((m) => Math.floor(m / len))).size * len
}

/** Watch rows for a period: [{ name, amount: minutes, first: unix s of the first active minute }] */
export function watchRows(activity, fromMs, toMs, windowLen) {
  const rows = []
  for (const [key, mins] of activeMinutes(activity, minuteOf(fromMs), minuteOf(toMs))) {
    rows.push({ name: activity.names?.[key] ?? key, amount: windowMinutes(mins, windowLen), first: Math.min(...mins) * 60 })
  }
  return rows
}

/** Drop days older than `keepDays` and names nobody uses any more (mutates) */
export function pruneActivity(activity, now = Date.now(), keepDays = 130) {
  const cut = isoDay(now - keepDays * DAY_MS)
  const used = new Set()
  for (const day of Object.keys(activity.days ?? {})) {
    if (day < cut) delete activity.days[day]
    else for (const k of Object.keys(activity.days[day])) used.add(k)
  }
  for (const k of Object.keys(activity.names ?? {})) if (!used.has(k)) delete activity.names[k]
  return activity
}

// ---------------------------------------------------------------- watch: Kick chat recorder

const mem = (globalThis.__tgnRaffleWatch ??= { pending: new Map(), names: new Map(), lastFlush: Date.now(), flushing: null, lastChatAt: 0 })
let live = { at: 0, value: true }

/** Is the stream live? server/kick/chat.js's isLive() when it exists, else assume yes */
async function streamLive() {
  if (Date.now() - live.at < 15_000) return live.value
  const value = await import('../kick/chat.js').then((m) => m.isLive?.() ?? true).catch(() => true)
  live = { at: Date.now(), value: value !== false }
  return live.value
}

/** The pending marks (not yet written) applied to a copy of the saved table */
function withPending(activity) {
  for (const [key, minutes] of mem.pending) for (const m of minutes) markActive(activity, key, mem.names.get(key) ?? key, m)
  return activity
}

/** Saved + pending activity, consistent even while a flush is writing (it moves pending into the table) */
async function activityNow() {
  for (let i = 0; i < 5; i++) {
    if (mem.flushing) await mem.flushing
    const pending = mem.pending
    const saved = await read('watchActivity', { names: {}, days: {} })
    if (pending === mem.pending && !mem.flushing) return withPending(saved)
  }
  return withPending(await read('watchActivity', { names: {}, days: {} }))
}

async function flushWatch() {
  if (mem.flushing) return mem.flushing
  if (!mem.pending.size) {
    mem.lastFlush = Date.now()
    return
  }
  const pending = mem.pending
  const names = mem.names
  mem.pending = new Map()
  mem.names = new Map()
  mem.lastFlush = Date.now()
  mem.flushing = update(
    'watchActivity',
    (a) => {
      const next = a && typeof a === 'object' ? a : { names: {}, days: {} }
      for (const [key, minutes] of pending) for (const m of minutes) markActive(next, key, names.get(key) ?? key, m)
      return pruneActivity(next)
    },
    { names: {}, days: {} },
  )
    .catch((err) => {
      // keep them for the next flush
      console.error('[raffles] watch flush failed:', err)
      for (const [key, minutes] of pending) {
        const set = mem.pending.get(key) ?? new Set()
        minutes.forEach((m) => set.add(m))
        mem.pending.set(key, set)
        if (!mem.names.has(key)) mem.names.set(key, names.get(key))
      }
    })
    .finally(() => (mem.flushing = null))
  return mem.flushing
}

const BOT_BADGES = new Set(['bot', 'broadcaster'])

onChat('raffle-watch', async (msg) => {
  const name = String(msg?.username ?? '').trim()
  if (!name || isExcluded(name)) return
  if ((msg.badges ?? []).some((b) => BOT_BADGES.has(String(b?.type ?? b).toLowerCase()))) return
  if (!(await streamLive())) return
  const now = Date.now()
  let at = Number(msg.at) || now
  if (at < 1e12) at *= 1000 // seconds → ms
  if (Math.abs(now - at) > 10 * 60_000) at = now // a stray clock: use arrival time
  const key = name.toLowerCase()
  const set = mem.pending.get(key) ?? new Set()
  set.add(minuteOf(at))
  mem.pending.set(key, set)
  mem.names.set(key, name)
  mem.lastChatAt = now
  if (now - mem.lastFlush > 60_000) flushWatch()
})

async function watchStatus() {
  const activity = await activityNow()
  const today = activity.days?.[isoDay(Date.now())] ?? {}
  return { source: 'chat', live: await streamLive(), chattersToday: Object.keys(today).length, lastChatAt: mem.lastChatAt ? Math.floor(mem.lastChatAt / 1000) : null }
}

// ---------------------------------------------------------------- sources

const wagerCache = new Map()

/** Wager per Rainbet username under the code for [start, end] (today at the latest; ≤ 120 days) */
async function rainbetRows(r) {
  const today = isoDay(Date.now())
  if (r.start > today) return []
  const end = r.end < today ? r.end : today
  const key = `${r.start}_${end}`
  const hit = wagerCache.get(key)
  if (hit && Date.now() - hit.at < 60_000) return hit.rows
  const apiKey = envValue('RAINBET_API_KEY')
  if (!apiKey) throw new InputError('The Rainbet API key is not set (RAINBET_API_KEY).')
  const url = new URL(RAINBET)
  url.searchParams.set('start_at', r.start)
  url.searchParams.set('end_at', end)
  url.searchParams.set('key', apiKey)
  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new InputError('Could not reach Rainbet for the wager totals.')
  }
  if (!res.ok) throw new InputError(`Rainbet answered ${res.status} for the wager totals.`)
  const data = await res.json().catch(() => ({}))
  const rows = (data.affiliates ?? []).map((a) => ({ name: String(a.username ?? ''), amount: parseFloat(a.wagered_amount) || 0 })).filter((x) => x.name && x.amount > 0)
  wagerCache.set(key, { at: Date.now(), rows })
  return rows
}

/** Active chat minutes while live, per the raffle's window length */
async function chatWatchRows(r) {
  const activity = await activityNow()
  return watchRows(activity, dayStart(r.start), dayStart(r.end) + DAY_MS, r.windowMinutes ?? 5)
}

/** kind → source name → (raffle) → [{ name, amount, first? }]. BotRix can go in SOURCES.watch later */
const SOURCES = {
  wager: { rainbet: rainbetRows },
  watch: { chat: chatWatchRows },
}

// ---------------------------------------------------------------- live entries

const liveCache = new Map()
const counting = new Map()
const cacheKey = (r) => `${r.id}:${r.ticketUnit}:${r.start}:${r.end}:${r.windowMinutes ?? ''}:${r.numbering}`

/** Remember when each player first showed up (for 'joined' numbering) */
async function noteJoined(r, rows) {
  const saved = (await read('raffleJoined', {}))[r.id] ?? {}
  const now = nowSeconds()
  const add = {}
  for (const row of rows) {
    const key = row.name.toLowerCase()
    const at = row.first ?? now
    if (saved[key] === undefined || at < saved[key]) add[key] = at
  }
  if (!Object.keys(add).length) return saved
  const next = { ...saved, ...add }
  await update('raffleJoined', (all) => ({ ...(all ?? {}), [r.id]: { ...((all ?? {})[r.id] ?? {}), ...add } }), {})
  return next
}

async function countNow(r) {
  const source = SOURCES[r.kind]?.[r.source]
  if (!source) throw new InputError(`Unknown ticket source “${r.source}”.`)
  const rows = await source(r)
  const joined = await noteJoined(r, rows)
  const entries = assignNumbers(freezeEntries(rows, r.ticketUnit), r.numbering, joined)
  const v = { at: Date.now(), entries, error: null }
  liveCache.set(cacheKey(r), v)
  return v
}

/** Open: live from the source (cached a little). Locked/complete: the frozen list */
async function entriesOf(r, fresh = false) {
  if (r.status !== 'open') return { entries: r.entries, error: null }
  const key = cacheKey(r)
  const hit = liveCache.get(key)
  const ttl = r.kind === 'wager' ? 60_000 : 15_000
  if (!fresh && hit && Date.now() - hit.at < ttl) return hit
  let pending = counting.get(key)
  if (!pending) {
    pending = countNow(r).finally(() => counting.delete(key))
    counting.set(key, pending)
  }
  try {
    return await pending
  } catch (err) {
    if (fresh || !hit) throw err
    return { ...hit, error: err.message } // show the last count
  }
}

// ---------------------------------------------------------------- snapshots

const SNAPSHOT_EVERY_S = 3600
const KEEP_ALL_S = 48 * 3600
const KEEP_S = 60 * 86_400

/** Hourly for 48 h, then the last of each day for 60 days; lock/manual copies stay the 60 days */
export function pruneSnapshots(list, now = nowSeconds()) {
  const days = new Set()
  return list.filter((s) => {
    if (now - s.at > KEEP_S) return false
    if (now - s.at <= KEEP_ALL_S || s.reason !== 'hourly') return true
    const day = isoDay(s.at * 1000)
    if (days.has(day)) return false
    days.add(day)
    return true
  })
}

async function snapshot(r, entries, reason) {
  const rows = entries.map((e) => [e.name, e.amount])
  const now = nowSeconds()
  await update('raffleSnapshots', (all) => {
    const list = all[r.id] ?? []
    if (reason === 'hourly' && list[0] && JSON.stringify(list[0].rows) === JSON.stringify(rows)) {
      // unchanged: just mark the hour as taken
      return { ...all, [r.id]: [{ ...list[0], checkedAt: now }, ...list.slice(1)] }
    }
    return { ...all, [r.id]: pruneSnapshots([{ at: now, reason, rows }, ...list], now) }
  })
}

async function hourlySnapshot(r) {
  if (r.status !== 'open') return
  const last = (await read('raffleSnapshots'))[r.id]?.find((s) => s.reason === 'hourly')
  if (last && nowSeconds() - (last.checkedAt ?? last.at) < SNAPSHOT_EVERY_S) return
  const { entries } = await entriesOf(r)
  if (entries.length) await snapshot(r, entries, 'hourly')
}

let sweeping = null
let lastSweep = 0
/** Flush chat activity and take any snapshot that's due (background job, and at most once a minute on reads) */
function sweep(force = true) {
  if (!force && Date.now() - lastSweep < 60_000) return sweeping
  lastSweep = Date.now()
  sweeping ??= (async () => {
    await flushWatch()
    for (const r of await read('raffles')) await hourlySnapshot(r).catch(() => undefined)
  })()
    .catch((err) => console.error('[raffles] sweep failed:', err))
    .finally(() => (sweeping = null))
  return sweeping
}

registerBackground('raffles', () => {
  sweep()
  const t = setInterval(sweep, 5 * 60_000)
  t.unref?.()
  return () => {
    clearInterval(t)
    flushWatch()
  }
})

const summarize = (s, r) => {
  const entries = freezeEntries(s.rows.map(([name, amount]) => ({ name, amount })), r.ticketUnit)
  return { at: s.at, reason: s.reason, players: entries.length, tickets: entries.reduce((t, e) => t + e.tickets, 0) }
}

// ---------------------------------------------------------------- views

function withOdds(entries) {
  const total = entries.reduce((s, e) => s + e.tickets, 0)
  return { total, list: entries.map((e) => ({ ...e, odds: total ? e.tickets / total : 0 })) }
}

/** The raffle without its secret (the seed shows only once complete) */
function sealed(r) {
  const { entries, ...rest } = r
  return { ...rest, seed: r.status === 'complete' ? r.seed : null }
}

async function adminView(r) {
  let entries = []
  let error = null
  try {
    ;({ entries, error } = await entriesOf(r))
  } catch (err) {
    error = err.message
  }
  const { total, list } = withOdds(entries)
  return { ...sealed(r), draws: withSlots(r.draws), entries: list, totalTickets: total, drawsTotal: drawCount(r), players: list.length, error }
}

async function publicView(r, me) {
  let entries = []
  let error = null
  try {
    ;({ entries, error } = await entriesOf(r))
  } catch (err) {
    error = err.message
  }
  const { total, list } = withOdds(entries)
  const mine = me ? list.find((e) => e.name.toLowerCase() === me.toLowerCase()) : null
  // names go out masked, so the VIP badge rides along as a flag: Kick names for watch-time
  // raffles, the VIPs' linked Rainbet usernames for wager raffles
  const badges = await badgeNames().catch(() => ({ kick: [], rainbet: [] }))
  const vipNames = new Set(r.kind === 'watch' ? badges.kick : badges.rainbet)
  const vip = (name) => vipNames.has(String(name ?? '').toLowerCase())
  return {
    ...sealed(r),
    entries: list.map((e) => ({ ...e, name: maskName(e.name), vip: vip(e.name) })),
    draws: withSlots(r.draws).map((d) => ({ ...d, name: maskName(d.name), vip: vip(d.name), rerolled: Boolean(d.rerolledAt) })),
    totalTickets: total,
    drawsTotal: drawCount(r),
    players: list.length,
    mine: mine ? { ...mine, wins: keptDraws(r.draws).filter((d) => d.name === mine.name).length } : null,
    error: error ? 'Tickets are temporarily unavailable.' : null,
    updatedAt: nowSeconds(),
  }
}

// ---------------------------------------------------------------- settings

const ISO = /^\d{4}-\d{2}-\d{2}$/
const numIn = (v, label, min, max) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new InputError(`${label} must be between ${min} and ${max.toLocaleString('en-US')}.`)
  return n
}
const dayIn = (v, label) => {
  const s = String(v ?? '')
  if (!ISO.test(s) || Number.isNaN(dayStart(s)) || isoDay(dayStart(s)) !== s) throw new InputError(`${label} must be a date (YYYY-MM-DD).`)
  return s
}

export function monthWindow(now = Date.now()) {
  const d = new Date(now)
  return { start: isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), end: isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)) }
}

function applySettings(r, body) {
  const next = { ...r }
  if ('title' in body) {
    next.title = String(body.title ?? '').trim().slice(0, 60)
    if (!next.title) throw new InputError('Give the raffle a title.')
  }
  if ('start' in body) next.start = dayIn(body.start, 'Start')
  if ('end' in body) next.end = dayIn(body.end, 'End')
  if (next.end < next.start) throw new InputError('The end can’t be before the start.')
  const days = (dayStart(next.end) - dayStart(next.start)) / DAY_MS + 1
  if (next.kind === 'wager' && days > 120) throw new InputError('Rainbet reports at most 120 days: shorten the period.')
  if (days > 366) throw new InputError('A raffle can run a year at most.')
  if ('prizePool' in body) next.prizePool = Math.round(numIn(body.prizePool, 'Prize pool', 1, 10_000_000) * 100) / 100
  if ('prizePerDraw' in body) next.prizePerDraw = Math.round(numIn(body.prizePerDraw, 'Prize per draw', 1, 10_000_000) * 100) / 100
  if ('maxWinsPerPerson' in body) next.maxWinsPerPerson = Math.round(numIn(body.maxWinsPerPerson, 'Max wins per person', 1, 100))
  if ('ticketUnit' in body) {
    next.ticketUnit = next.kind === 'wager' ? Math.round(numIn(body.ticketUnit, 'Dollars per ticket', 0.01, 10_000_000) * 100) / 100 : Math.round(numIn(body.ticketUnit, 'Minutes per ticket', 1, 100_000))
  }
  if (next.kind === 'watch' && 'windowMinutes' in body) next.windowMinutes = Math.round(numIn(body.windowMinutes, 'Window', 1, 60))
  if ('numbering' in body) {
    if (!['name', 'joined'].includes(body.numbering)) throw new InputError('Number players by name or by join order.')
    next.numbering = body.numbering
  }
  if ('source' in body) {
    if (!SOURCES[next.kind]?.[body.source]) throw new InputError('Unknown ticket source.')
    next.source = body.source
  }
  if (next.prizePerDraw > next.prizePool) throw new InputError('The prize per draw can’t be more than the pool.')
  return next
}

// ---------------------------------------------------------------- bot

const kindLabel = (r) => (r.kind === 'watch' ? 'Watch-time raffle' : 'Raffle')
function announce(text) {
  sendChat(text).catch?.(() => undefined)
}

// ---------------------------------------------------------------- handler

const current = (all, kind) => all.filter((r) => r.kind === kind).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
const save = (id, fn) =>
  update('raffles', (list) =>
    list.map((r) => {
      if (r.id !== id) return r
      return fn(r)
    }),
  ).then((list) => list.find((r) => r.id === id))

export async function handle(req, ctx) {
  const { path, method } = ctx
  if (path !== '/api/raffles' && path !== '/api/admin/raffles' && !path.startsWith('/api/admin/raffles/')) return null
  try {
    if (path === '/api/raffles') {
      if (method !== 'GET') return json(405, { error: 'Use GET.' })
      sweep(false)
      const all = await read('raffles')
      const kind = ctx.url.searchParams.get('kind')
      const meParam = ctx.url.searchParams.get('me')?.trim().slice(0, 40) || null
      const meFor = (r) => meParam ?? (r.kind === 'watch' ? (ctx.user?.kick?.username ?? null) : null)
      if (kind === 'wager' || kind === 'watch') {
        const id = ctx.url.searchParams.get('id')
        const ofKind = all.filter((x) => x.kind === kind).sort((a, b) => b.createdAt - a.createdAt)
        const r = (id && ofKind.find((x) => x.id === id)) || ofKind[0] || null
        const list = ofKind.map((x) => ({ id: x.id, title: x.title, start: x.start, end: x.end, status: x.status }))
        return json(200, { raffle: r ? await publicView(r, meFor(r)) : null, list })
      }
      const list = ['wager', 'watch'].map((k) => current(all, k)).filter(Boolean)
      return json(200, { raffles: await Promise.all(list.map((r) => publicView(r, meFor(r)))) })
    }

    // /api/admin/* is already admin-only (server/api.js)
    const rest = path.slice('/api/admin/raffles'.length).replace(/^\//, '')

    if (!rest && method === 'GET') {
      sweep(false)
      const all = (await read('raffles')).sort((a, b) => b.createdAt - a.createdAt)
      return json(200, { raffles: await Promise.all(all.map(adminView)), watch: await watchStatus(), sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, Object.keys(v)])) })
    }

    const snaps = rest.match(/^([\w-]+)\/snapshots(?:\/(\d+))?$/)
    if (snaps && method === 'GET') {
      const raffle = (await read('raffles')).find((r) => r.id === snaps[1])
      if (!raffle) throw new InputError('That raffle no longer exists.')
      const list = (await read('raffleSnapshots'))[raffle.id] ?? []
      if (!snaps[2]) return json(200, { snapshots: list.map((s) => summarize(s, raffle)) })
      const one = list.find((s) => s.at === Number(snaps[2]))
      if (!one) throw new InputError('That snapshot no longer exists.')
      const entries = freezeEntries(one.rows.map(([name, amount]) => ({ name, amount })), raffle.ticketUnit)
      return json(200, { snapshot: { ...summarize(one, raffle), entries: withOdds(entries).list } })
    }

    if (method !== 'POST') return json(405, { error: 'Use POST.' })
    const body = ctx.body ?? {}

    if (!rest) {
      const kind = body.kind === 'watch' || body.kind === 'wager' ? body.kind : null
      if (!kind) throw new InputError('Pick a wager or watch-time raffle.')
      const all = await read('raffles')
      if (all.some((r) => r.kind === kind && r.status !== 'complete')) {
        throw new InputError(`Finish or delete the current ${kind === 'wager' ? 'wager' : 'watch-time'} raffle first.`)
      }
      const base = {
        id: randomBytes(6).toString('hex'),
        kind,
        ...DEFAULTS[kind],
        ...monthWindow(),
        numbering: 'name',
        status: 'open',
        entries: [],
        seedHash: null,
        seed: null,
        draws: [],
        createdAt: nowSeconds(),
        lockedAt: null,
        completedAt: null,
      }
      const raffle = applySettings(base, body)
      await update('raffles', (list) => [raffle, ...list])
      return json(200, { raffle: sealed(raffle) })
    }

    const [id, action] = rest.split('/')
    const raffle = (await read('raffles')).find((r) => r.id === id)
    if (!raffle) throw new InputError('That raffle no longer exists.')

    if (action === 'delete') {
      await update('raffles', (list) => list.filter((r) => r.id !== id))
      await update('raffleSnapshots', (all) => {
        const { [id]: _gone, ...keep } = all
        return keep
      })
      await update('raffleJoined', (all) => {
        const { [id]: _gone, ...keep } = all ?? {}
        return keep
      }, {})
      return json(200, { ok: true })
    }

    if (!action) {
      if (raffle.status !== 'open') throw new InputError('Unlock the raffle to change its settings.')
      const next = applySettings(raffle, body)
      const saved = await save(id, (r) => {
        if (r.status !== 'open') throw new InputError('The raffle was locked meanwhile.')
        return { ...r, ...next, status: r.status, draws: r.draws }
      })
      return json(200, { raffle: sealed(saved) })
    }

    if (action === 'snapshot') {
      if (raffle.status !== 'open') throw new InputError('Only an open raffle has live tickets to save.')
      const { entries } = await entriesOf(raffle, true)
      if (!entries.length) throw new InputError('Nobody has a ticket yet.')
      await snapshot(raffle, entries, 'manual')
      return json(200, { ok: true })
    }

    if (action === 'lock') {
      if (raffle.status !== 'open') throw new InputError('This raffle is already locked.')
      let entries
      if (body.snapshot !== undefined && body.snapshot !== null) {
        const copy = (await read('raffleSnapshots'))[id]?.find((s) => s.at === Number(body.snapshot))
        if (!copy) throw new InputError('That snapshot no longer exists.')
        const joined = (await read('raffleJoined', {}))[id] ?? {}
        entries = assignNumbers(freezeEntries(copy.rows.map(([name, amount]) => ({ name, amount })), raffle.ticketUnit), raffle.numbering, joined)
      } else {
        await flushWatch()
        entries = (await entriesOf(raffle, true)).entries
      }
      if (!entries.length) throw new InputError('Nobody has a ticket yet.')
      await snapshot(raffle, entries, 'lock')
      const seed = randomBytes(32).toString('hex')
      const saved = await save(id, (r) => {
        if (r.status !== 'open') throw new InputError('This raffle is already locked.')
        return { ...r, entries, status: 'locked', seed, seedHash: sha256(seed), lockedAt: nowSeconds() }
      })
      liveCache.clear()
      const tickets = entries.reduce((s, e) => s + e.tickets, 0)
      announce(`🔒 ${saved.title} is locked: ${entries.length.toLocaleString('en-US')} players, ${tickets.toLocaleString('en-US')} tickets. Seed fingerprint ${saved.seedHash.slice(0, 16)}…`)
      return json(200, { raffle: sealed(saved), warning: entries.length > MAX_PLAYER_NUMBER ? `More than ${MAX_PLAYER_NUMBER} players: the drums show the last four digits.` : null })
    }

    if (action === 'unlock') {
      if (raffle.status !== 'locked' || raffle.draws.length) throw new InputError('Only a locked raffle with no draws can be unlocked.')
      const saved = await save(id, (r) => {
        if (r.draws.length) throw new InputError('A draw was made meanwhile.')
        return { ...r, status: 'open', entries: [], seed: null, seedHash: null, lockedAt: null }
      })
      return json(200, { raffle: sealed(saved) })
    }

    if (action === 'draw' || action === 'reroll') {
      if (raffle.status !== 'locked' || !raffle.seed) throw new InputError(raffle.status === 'open' ? 'Lock the raffle first.' : 'This raffle is finished.')
      let made = null
      let replaced = null
      const saved = await save(id, (r) => {
        if (r.status !== 'locked') throw new InputError('This raffle is finished.')
        let draws = r.draws
        let prize = r.prizePerDraw
        if (action === 'reroll') {
          const n = Number(body.n)
          const target = draws.find((d) => d.n === n)
          if (!target) throw new InputError('That draw doesn’t exist.')
          if (target.rerolledAt) throw new InputError('That draw was already rerolled.')
          replaced = target
          prize = target.prize
          draws = draws.map((d) => (d.n === n ? { ...d, rerolledAt: nowSeconds(), rerolledBefore: draws.length } : d))
        } else if (keptDraws(draws).length >= drawCount(r)) {
          throw new InputError('Every prize has been drawn. Finish the raffle to reveal the seed.')
        }
        const next = drawNext(r, r.seed, draws)
        if (next) {
          made = { n: draws.length, ticket: next.ticket, pool: next.pool, playerNumber: next.playerNumber, name: next.name, prize, at: nowSeconds(), ...(replaced ? { replaces: replaced.n } : {}) }
          draws = [...draws, made]
        } else if (action === 'draw') throw new InputError('Everyone left has reached the win cap. Finish the raffle.')
        return { ...r, draws }
      })
      const slots = withSlots(saved.draws)
      const shown = made ? slots[slots.length - 1] : null
      if (shown) {
        const what = `player #${pad4(shown.playerNumber)} — ${maskName(shown.name)}`
        announce(
          action === 'reroll'
            ? `🔁 ${kindLabel(saved)}: draw for ${maskName(replaced.name)} rerolled. Draw #${shown.slot}: ${what}`
            : `🎟️ ${saved.kind === 'watch' ? 'Watch-time draw' : 'Draw'} #${shown.slot}: ${what}`,
        )
      }
      return json(200, { raffle: { ...sealed(saved), draws: slots }, draw: shown })
    }

    if (action === 'finish') {
      if (raffle.status !== 'locked' || !raffle.seed) throw new InputError('Only a raffle being drawn can be finished.')
      const left = keptDraws(raffle.draws).length < drawCount(raffle) && drawNext(raffle, raffle.seed, raffle.draws)
      if (left) throw new InputError('There are prizes left to draw.')
      const saved = await save(id, (r) => ({ ...r, status: 'complete', completedAt: nowSeconds() }))
      announce(`✅ ${saved.title} is complete. Seed revealed (${saved.seed.slice(0, 12)}…): every draw can be checked on the raffles page.`)
      return json(200, { raffle: sealed(saved) })
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    throw err
  }
}
