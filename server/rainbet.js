// Rainbet affiliate API, server side (the key never leaves the server), with a cache:
// a date range that has ended never changes, so it is kept for good; one that ends today
// is re-read after OPEN_TTL. Used by the admin wager stats and milestone claims.
//
//   affiliates(start, end)   [{ id, name, wagered }] for 'YYYY-MM-DD' .. 'YYYY-MM-DD' (inclusive, UTC)
//   lifetimeWager(username)  { found, name, wagered } summed since config.milestones.trackSince
//
// The API rejects ranges longer than ~120 days, so long ranges are summed from windows.

import { config } from '../src/config.js'
import { envValue } from './env.js'

const AFFILIATES = 'https://services.rainbet.com/v1/external/affiliates'
export const WINDOW_DAYS = 120
const OPEN_TTL = 5 * 60_000
const MAX_PARALLEL = 4
export const DAY = 86_400_000

export const iso = (t) => new Date(t).toISOString().slice(0, 10)
export const todayIso = () => iso(Date.now())
export const parseDay = (s) => Date.parse(`${s}T00:00:00Z`)

const cache = new Map() // `${start}_${end}` → { at, open, rows }
const inflight = new Map()
let running = 0
const queue = []

// at most MAX_PARALLEL requests to Rainbet at a time (a year of daily bars is many ranges)
function slot() {
  if (running < MAX_PARALLEL) {
    running++
    return Promise.resolve()
  }
  return new Promise((resolve) => queue.push(resolve))
}
function release() {
  const next = queue.shift()
  if (next) next()
  else running--
}

/** One range's rows (≤ 120 days), cached */
export async function affiliates(start, end) {
  const key = `${start}_${end}`
  const open = end >= todayIso()
  const hit = cache.get(key)
  if (hit && (!hit.open || Date.now() - hit.at < OPEN_TTL)) return hit.rows
  if (inflight.has(key)) return inflight.get(key)
  const run = (async () => {
    const apiKey = envValue('RAINBET_API_KEY')
    if (!apiKey) throw new Error('Missing RAINBET_API_KEY')
    await slot()
    try {
      const url = new URL(AFFILIATES)
      url.searchParams.set('start_at', start)
      url.searchParams.set('end_at', end)
      url.searchParams.set('key', apiKey)
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`Rainbet API ${res.status}`)
      const data = await res.json()
      const rows = (data.affiliates ?? []).map((a) => ({
        id: a.id ? String(a.id) : null,
        name: String(a.username ?? ''),
        wagered: parseFloat(a.wagered_amount) || 0,
      }))
      cache.set(key, { at: Date.now(), open, rows })
      return rows
    } finally {
      release()
    }
  })()
  inflight.set(key, run)
  try {
    return await run
  } finally {
    inflight.delete(key)
  }
}

/** [start, end] windows of ≤ 120 days covering start..end */
export function windows(start, end) {
  const out = []
  let s = parseDay(start)
  const last = parseDay(end)
  while (s <= last) {
    const e = Math.min(s + (WINDOW_DAYS - 1) * DAY, last)
    out.push([iso(s), iso(e)])
    s = e + DAY
  }
  return out
}

/** Every player's wager over start..end (any length), merged case-insensitively */
export async function wagersBetween(start, end) {
  const parts = await Promise.all(windows(start, end).map(([s, e]) => affiliates(s, e)))
  const by = new Map()
  for (const rows of parts) {
    for (const r of rows) {
      const k = r.name.toLowerCase()
      const cur = by.get(k)
      if (cur) cur.wagered += r.wagered
      else by.set(k, { name: r.name, wagered: r.wagered })
    }
  }
  return [...by.values()]
}

/** A username's wager under the code since trackSince (the milestone ladder's rule) */
export async function lifetimeWager(username) {
  const wanted = String(username).trim().toLowerCase()
  const rows = await wagersBetween(config.milestones.trackSince, todayIso())
  const hit = rows.find((r) => r.name.toLowerCase() === wanted)
  return { found: Boolean(hit), name: hit?.name ?? String(username).trim(), wagered: Math.round((hit?.wagered ?? 0) * 100) / 100 }
}
