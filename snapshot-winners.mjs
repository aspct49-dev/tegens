// snapshot-winners.mjs
// Captures Rainbet leaderboard standings into data/winners.json so past winners
// survive the monthly rollover. Designed to run on a cron:
//
//   cd /var/www/tegens && node snapshot-winners.mjs
//
// The active period is always the current UTC month (see monthWindow() in
// src/data/leaderboard.js), so no config edit is needed to turn the month over.
// Each run does two things:
//
//   1. Upserts a snapshot of the CURRENT month, still open (final: false), so
//      the archive always has an up-to-date copy of the month in progress.
//   2. Finalizes the PREVIOUS month exactly once — re-fetching its full window
//      so the last day's wagers are included, then freezing it (final: true).
//      A finalized period is never rewritten again, and it keeps the prize
//      split it ran with, so changing config.prizes only affects months to come.
//
// Run it at least once a day; hourly is better, since finalization happens on
// the first run after the calendar flips.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config, previousMonthWindow } from './src/data/leaderboard.js'

try { process.loadEnvFile() } catch { /* env provided another way */ }

const KEY = process.env.RAINBET_API_KEY
const ROOT = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(ROOT, 'data')
const FILE = join(DATA_DIR, 'winners.json')

function monthLabel(s, e) {
  const ds = new Date(`${s}T00:00:00Z`)
  const de = new Date(`${e}T00:00:00Z`)
  const mo = (d) => d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  if (mo(ds) === mo(de) && ds.getUTCFullYear() === de.getUTCFullYear()) {
    return `${mo(ds)} ${de.getUTCFullYear()}`
  }
  return `${mo(ds)} ${ds.getUTCDate()} – ${mo(de)} ${de.getUTCDate()}, ${de.getUTCFullYear()}`
}

async function fetchWindow(startAt, endAt) {
  const url =
    `https://services.rainbet.com/v1/external/affiliates` +
    `?start_at=${encodeURIComponent(startAt)}&end_at=${encodeURIComponent(endAt)}` +
    `&key=${encodeURIComponent(KEY)}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Rainbet API HTTP ${res.status}`)
  const data = await res.json()
  return (data.affiliates || [])
    .map((a) => ({ name: a.username, wagered: parseFloat(a.wagered_amount) || 0 }))
    .sort((a, b) => b.wagered - a.wagered)
}

// Rank players and pay them out against a specific prize list. Only as many
// players as there are prizes are kept — those are the paid places.
function award(players, prizeList) {
  return players
    .slice(0, prizeList.length)
    .map((p, i) => ({ rank: i + 1, name: p.name, wagered: p.wagered, prize: prizeList[i] || 0 }))
}

// The split a stored period ran with. Older snapshots predate the `prizes`
// field, so fall back to reading it back off the winners themselves.
function storedPrizes(entry) {
  if (Array.isArray(entry.prizes) && entry.prizes.length) return entry.prizes
  return (entry.winners || []).map((w) => w.prize)
}

function loadStore() {
  let store = { periods: [] }
  if (existsSync(FILE)) {
    try { store = JSON.parse(readFileSync(FILE, 'utf8')) } catch { store = { periods: [] } }
  }
  if (!Array.isArray(store.periods)) store.periods = []
  return store
}

async function main() {
  if (!KEY) {
    console.error('snapshot: missing RAINBET_API_KEY')
    process.exit(1)
  }

  // The wager race is off (the leaderboard section runs the raffle). Archiving
  // now would publish "winners" and payouts for a race that never ran.
  if (config.paused) {
    console.log('snapshot: wager race paused — nothing archived')
    return
  }

  const now = new Date()
  const { startAt, endAt } = config.leaderboard
  const id = `${startAt}_${endAt}`
  const store = loadStore()

  // ---- 1. the month in progress -------------------------------------------
  const winners = award(await fetchWindow(startAt, endAt), config.prizes)
  const entry = {
    id, startAt, endAt,
    label: monthLabel(startAt, endAt),
    prizePool: config.prizePool,
    prizes: config.prizes,     // the split THIS period runs with
    capturedAt: now.toISOString(),
    final: false,
    winners,
  }

  const idx = store.periods.findIndex((p) => p.id === id)
  if (idx >= 0) {
    const stored = store.periods[idx]
    if (stored.final && stored.winners?.length) {
      // Already archived. Its payouts are history — never rewrite them.
      console.log(`snapshot: ${id} already final — left untouched`)
    } else if (winners.length || !stored.winners?.length) {
      // Don't clobber a populated snapshot with an empty one (e.g. API hiccup).
      store.periods[idx] = entry
    }
  } else {
    store.periods.push(entry)
  }

  // ---- 2. close out the month that just ended ------------------------------
  const prev = previousMonthWindow(now)
  const prevId = `${prev.startAt}_${prev.endAt}`
  const prevIdx = store.periods.findIndex((p) => p.id === prevId)

  if (prevIdx >= 0 && !store.periods[prevIdx].finalizedAt) {
    const stored = store.periods[prevIdx]
    const prizeList = storedPrizes(stored)
    try {
      // Re-fetch the whole window so the final day's wagers land in the archive.
      const finalWinners = award(await fetchWindow(prev.startAt, prev.endAt), prizeList)
      if (finalWinners.length) {
        store.periods[prevIdx] = {
          ...stored,
          winners: finalWinners,
          final: true,
          finalizedAt: now.toISOString(),
        }
        console.log(`snapshot: finalized ${prevId} — ${finalWinners.length} winners`)
      }
    } catch (err) {
      // Leave it open; the next run retries. Better a late archive than a wrong one.
      console.error(`snapshot: could not finalize ${prevId} — ${err.message}`)
    }
  } else if (prevIdx < 0) {
    // Never captured while it was running, so its prize split is unknown and
    // guessing from the current config would publish wrong payouts.
    console.warn(`snapshot: no snapshot exists for ${prevId} — skipping (backfill by hand if it should appear)`)
  }

  // Anything that isn't the active period is closed.
  for (const p of store.periods) if (p.id !== id) p.final = true

  store.periods.sort((a, b) => new Date(b.endAt) - new Date(a.endAt))

  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(store, null, 2))
  console.log(`snapshot: saved ${id} — ${winners.length} winners (period open)`)
}

main().catch((err) => {
  console.error('snapshot: failed', err)
  process.exit(1)
})
