// snapshot-winners.mjs
// Captures the current Rainbet leaderboard standings into data/winners.json so
// past winners are preserved after a period ends. Designed to run on a cron:
//
//   cd /var/www/tegens && node snapshot-winners.mjs
//
// Each run upserts the snapshot for the CURRENT config period (keyed by its
// dates) and marks every other stored period as final. So when you roll
// config.leaderboard to the next period, the previous one is frozen as an
// archived winner set — as long as this ran at least once near its end.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config } from './src/data/leaderboard.js'

try { process.loadEnvFile() } catch { /* env provided another way */ }

const KEY = process.env.RAINBET_API_KEY
const ROOT = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(ROOT, 'data')
const FILE = join(DATA_DIR, 'winners.json')

const { startAt, endAt } = config.leaderboard
const prizes = config.prizes

function monthLabel(s, e) {
  const ds = new Date(`${s}T00:00:00Z`)
  const de = new Date(`${e}T00:00:00Z`)
  const mo = (d) => d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  if (mo(ds) === mo(de) && ds.getUTCFullYear() === de.getUTCFullYear()) {
    return `${mo(ds)} ${de.getUTCFullYear()}`
  }
  return `${mo(ds)} ${ds.getUTCDate()} – ${mo(de)} ${de.getUTCDate()}, ${de.getUTCFullYear()}`
}

async function main() {
  if (!KEY) {
    console.error('snapshot: missing RAINBET_API_KEY')
    process.exit(1)
  }

  const url =
    `https://services.rainbet.com/v1/external/affiliates` +
    `?start_at=${encodeURIComponent(startAt)}&end_at=${encodeURIComponent(endAt)}` +
    `&key=${encodeURIComponent(KEY)}`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`snapshot: Rainbet API HTTP ${res.status}`)
    process.exit(1)
  }
  const data = await res.json()

  const winners = (data.affiliates || [])
    .map((a) => ({ name: a.username, wagered: parseFloat(a.wagered_amount) || 0 }))
    .sort((a, b) => b.wagered - a.wagered)
    .slice(0, prizes.length)
    .map((p, i) => ({ rank: i + 1, name: p.name, wagered: p.wagered, prize: prizes[i] || 0 }))

  const id = `${startAt}_${endAt}`
  const now = new Date()
  const ended = now > new Date(`${endAt}T23:59:59Z`)

  let store = { periods: [] }
  if (existsSync(FILE)) {
    try { store = JSON.parse(readFileSync(FILE, 'utf8')) } catch { store = { periods: [] } }
  }
  if (!Array.isArray(store.periods)) store.periods = []

  const entry = {
    id, startAt, endAt,
    label: monthLabel(startAt, endAt),
    prizePool: config.prizePool,
    capturedAt: now.toISOString(),
    final: ended,
    winners,
  }

  const idx = store.periods.findIndex((p) => p.id === id)
  if (idx >= 0) {
    // Don't clobber a populated snapshot with an empty one (e.g. API hiccup).
    if (winners.length || !store.periods[idx].winners?.length) store.periods[idx] = entry
  } else {
    store.periods.push(entry)
  }

  // Any period that is no longer the active config period is finalized.
  for (const p of store.periods) if (p.id !== id) p.final = true

  store.periods.sort((a, b) => new Date(b.endAt) - new Date(a.endAt))

  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(store, null, 2))
  console.log(`snapshot: saved ${id} — ${winners.length} winners, final=${ended}`)
}

main().catch((err) => {
  console.error('snapshot: failed', err)
  process.exit(1)
})
