// Monthly wager raffle: tickets from wager under the code, provably fair draws.
// Modelled on King Kulbik's shared/raffles.ts, but with no server: everything
// runs in the browser from config.raffle and the Rainbet affiliate data.
//
// How a month works
//   open      today is inside [start, end]: tickets count live from wager.
//   locked    the month has ended: entries are final (the affiliate API's closed
//             range no longer changes). The draws are committed by the seed's
//             SHA-256 hash, published in config.raffle.seedHash BEFORE the end.
//   complete  config.raffle.seed is revealed: every browser re-runs the same
//             draws from it, so anyone can check them ("Verify every draw").
//
// Fair draws (the same scheme as King Kulbik)
//   Entries are frozen in a fixed order (by name, then amount). Draw k takes one
//   float from HMAC-SHA256(seed, `${id}:${k}:0`), picks ticket
//   floor(float × tickets in play) and the entry holding it wins, so odds are
//   exactly tickets ÷ tickets in play. Someone at the win cap leaves the pool.
//   A draw listed in config.raffle.rerolled (the winner couldn't take it) stays
//   on the record, that player leaves the pool, and the next k replaces it.
//
// Make a seed + hash with:  node scripts/raffle-seed.mjs

import { config } from './config'

const DAY = 86_400_000
const enc = new TextEncoder()

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
export const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)))

/** Floats in [0, 1) from HMAC-SHA256(seed, `${clientSeed}:${nonce}:${round}`), 4 bytes each */
export async function fairFloats(seed, clientSeed, nonce, count) {
  const key = await crypto.subtle.importKey('raw', enc.encode(seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const floats = []
  for (let round = 0; floats.length < count; round++) {
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}:${round}`)))
    for (let i = 0; i + 4 <= bytes.length && floats.length < count; i += 4) {
      floats.push(bytes[i] / 256 + bytes[i + 1] / 256 ** 2 + bytes[i + 2] / 256 ** 3 + bytes[i + 3] / 256 ** 4)
    }
  }
  return floats
}

export const drawCount = (r) => (r.prizePerDraw > 0 ? Math.floor(r.prizePool / r.prizePerDraw + 1e-9) : 0)
export const ticketsFor = (amount, unit) => (unit > 0 ? Math.floor(amount / unit + 1e-9) : 0)

/** Freeze entries in a fixed, reproducible order (by name, then amount) */
export function freezeEntries(rows, unit) {
  return rows
    .map((r) => ({ name: r.name, amount: Math.round(r.amount * 100) / 100, tickets: ticketsFor(r.amount, unit) }))
    .filter((e) => e.tickets > 0)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || b.amount - a.amount)
}

export const keptDraws = (draws) => draws.filter((d) => !d.rerolled)

/** Who can still be drawn: under the win cap, and not rerolled away */
export function stillInDraw(entries, draws, maxWins) {
  const wins = new Map()
  const out = new Set()
  for (const d of draws) {
    if (d.rerolled) out.add(d.name)
    else wins.set(d.name, (wins.get(d.name) ?? 0) + 1)
  }
  return entries.filter((e) => !out.has(e.name) && (wins.get(e.name) ?? 0) < maxWins)
}

async function drawNext(raffle, entries, seed, previous) {
  const eligible = stillInDraw(entries, previous, raffle.maxWinsPerPerson)
  const pool = eligible.reduce((s, e) => s + e.tickets, 0)
  if (pool <= 0) return null
  const [f] = await fairFloats(seed, raffle.id, previous.length, 1)
  const ticket = Math.min(pool - 1, Math.floor(f * pool))
  let at = 0
  for (const e of eligible) {
    at += e.tickets
    if (ticket < at) return { name: e.name, ticket, pool }
  }
  return null
}

/** Every draw from the revealed seed, rerolls (config.raffle.rerolled: 0-based draw numbers) included */
export async function runDraws(raffle, entries, seed) {
  const rerolled = new Set(raffle.rerolled ?? [])
  const out = []
  while (keptDraws(out).length < drawCount(raffle)) {
    const next = await drawNext(raffle, entries, seed, out)
    if (!next) break
    const n = out.length
    out.push({ n, ...next, prize: raffle.prizePerDraw, rerolled: rerolled.has(n) })
  }
  return out
}

// ---------------------------------------------------------------- period + status

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)
const startOf = (iso) => Date.parse(`${iso}T00:00:00Z`)

/** The raffle's counting window: config dates, else the current calendar month (UTC) */
export function rafflePeriod(r = config.raffle, now = Date.now()) {
  if (r.start && r.end) return { start: r.start, end: r.end }
  const d = new Date(now)
  return {
    start: isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
    end: isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)),
  }
}

/** open until the end day is over (UTC), then locked until the seed is revealed */
export function raffleStatus(r, period, now = Date.now()) {
  if (now < startOf(period.end) + DAY) return 'open'
  return r.seed ? 'complete' : 'locked'
}

// ---------------------------------------------------------------- data

const cache = new Map()
const OPEN_TTL = 5 * 60_000

/** Wager per username under the code for [start, end] (≤ 120 days, the API's limit) */
export async function fetchWagers(start, end, open) {
  const key = `${start}_${end}`
  const hit = cache.get(key)
  if (hit && (!open || Date.now() - hit.at < OPEN_TTL)) return hit.rows
  const res = await fetch(`/api/affiliates?start_at=${start}&end_at=${end}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const rows = (data.affiliates || []).map((a) => ({ name: String(a.username || ''), amount: parseFloat(a.wagered_amount) || 0 }))
  cache.set(key, { at: Date.now(), rows })
  return rows
}

/** Everything the page shows, worked out from config.raffle + the affiliate data */
export async function loadRaffle(cfg = config.raffle, now = Date.now()) {
  const period = rafflePeriod(cfg, now)
  const id = cfg.id || period.start.slice(0, 7)
  const r = { ...cfg, id }
  const status = raffleStatus(r, period, now)
  // While open, count up to today only (the API rejects future end dates)
  const end = status === 'open' ? isoDay(Math.min(startOf(period.end), startOf(isoDay(now)))) : period.end
  const rows = await fetchWagers(period.start, end, status === 'open')
  const entries = freezeEntries(rows, r.ticketUnit)
  const totalTickets = entries.reduce((s, e) => s + e.tickets, 0)
  let draws = []
  let seedOk = null
  if (status === 'complete') {
    seedOk = r.seedHash ? (await sha256(r.seed)) === r.seedHash.toLowerCase() : null
    draws = await runDraws(r, entries, r.seed)
  }
  return {
    ...r,
    id,
    period,
    status,
    entries: entries.map((e) => ({ ...e, odds: totalTickets ? e.tickets / totalTickets : 0 })),
    totalTickets,
    drawsTotal: drawCount(r),
    draws,
    seedOk,
  }
}
