// fix-period-prizes.mjs
// One-off repair tool: re-archive a past period with an explicit prize split.
//
// Needed when a period was archived against the wrong prizes — e.g. if
// config.prizes was changed while config.leaderboard still pointed at a month
// that had already ended, so the snapshot captured the new split against the
// old month. (snapshot-winners.mjs now stores each period's `prizes` and
// refuses to rewrite a finalized one, so this should not recur.)
//
// Wagers are re-fetched from Rainbet for the given window, so the standings are
// rebuilt from source rather than patched in place.
//
//   node fix-period-prizes.mjs <startAt> <endAt> <prizePool> <p1,p2,p3,...>
//
// e.g. restore July 2026 to the $6,000 ladder:
//   node fix-period-prizes.mjs 2026-07-01 2026-07-31 6000 2000,1200,800,600,450,350,250,150,120,80
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

try { process.loadEnvFile() } catch { /* env provided another way */ }

const KEY = process.env.RAINBET_API_KEY
const FILE = join(dirname(fileURLToPath(import.meta.url)), 'data', 'winners.json')

const [startAt, endAt, poolArg, prizesArg] = process.argv.slice(2)

if (!startAt || !endAt || !poolArg || !prizesArg) {
  console.error('usage: node fix-period-prizes.mjs <startAt> <endAt> <prizePool> <p1,p2,...>')
  process.exit(1)
}
if (!KEY) {
  console.error('fix: missing RAINBET_API_KEY')
  process.exit(1)
}

const prizePool = Number(poolArg)
const prizes = prizesArg.split(',').map((n) => Number(n.trim()))

if (!Number.isFinite(prizePool) || prizes.some((n) => !Number.isFinite(n))) {
  console.error('fix: prizePool and prizes must all be numbers')
  process.exit(1)
}

const sum = prizes.reduce((a, b) => a + b, 0)
if (sum !== prizePool) {
  console.error(`fix: prizes sum to ${sum} but prizePool is ${prizePool} — refusing to write a mismatched archive`)
  process.exit(1)
}

async function main() {
  if (!existsSync(FILE)) {
    console.error(`fix: ${FILE} does not exist`)
    process.exit(1)
  }

  const store = JSON.parse(readFileSync(FILE, 'utf8'))
  const id = `${startAt}_${endAt}`
  const idx = (store.periods || []).findIndex((p) => p.id === id)
  if (idx < 0) {
    console.error(`fix: no archived period with id ${id}`)
    process.exit(1)
  }

  const url =
    `https://services.rainbet.com/v1/external/affiliates` +
    `?start_at=${encodeURIComponent(startAt)}&end_at=${encodeURIComponent(endAt)}` +
    `&key=${encodeURIComponent(KEY)}`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`fix: Rainbet API HTTP ${res.status}`)
    process.exit(1)
  }
  const data = await res.json()

  const winners = (data.affiliates || [])
    .map((a) => ({ name: a.username, wagered: parseFloat(a.wagered_amount) || 0 }))
    .sort((a, b) => b.wagered - a.wagered)
    .slice(0, prizes.length)
    .map((p, i) => ({ rank: i + 1, name: p.name, wagered: p.wagered, prize: prizes[i] || 0 }))

  if (!winners.length) {
    console.error('fix: Rainbet returned no players for that window — refusing to blank the archive')
    process.exit(1)
  }

  const before = store.periods[idx]
  console.log(`fix: ${before.label} was pool ${before.prizePool}, 1st = $${before.winners?.[0]?.prize}`)

  store.periods[idx] = {
    ...before,
    prizePool,
    prizes,
    winners,
    final: true,
    finalizedAt: new Date().toISOString(),
    repairedAt: new Date().toISOString(),
  }

  writeFileSync(FILE, JSON.stringify(store, null, 2))
  console.log(`fix: ${before.label} now pool ${prizePool}, ${winners.length} winners, 1st = $${winners[0].prize}`)
}

main().catch((err) => {
  console.error('fix: failed', err)
  process.exit(1)
})
