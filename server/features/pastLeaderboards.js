// GET /api/past-leaderboards: every monthly leaderboard that has ended, newest first, with its
// winner (the top wagerer under the code for that period, read from the Rainbet affiliate API).
// A month joins the list the day after it ends (its endAt is inclusive, to 23:59:59 UTC), so the
// site's Past Leaderboards fill themselves with no one editing anything.
//
//   periods   from config.pastLeaderboardsFrom (a period start, 'YYYY-MM-DD') on the monthly
//             cycle of config.leaderboard.resetDay, the same cycle getPeriod() runs
//   response  { leaderboards: [{ startAt, endAt, prizePool, winner, wagered, raw }] }
//             winner = the full username when raw (the site masks it, admins see it whole),
//             null when no one wagered; config.pastLeaderboards entries with the same startAt override
//             fields (e.g. a different prizePool), and ones for other periods are added as-is
//
// An ended range never changes, so server/rainbet.js caches its rows for good: each month
// costs one API call, ever.

import { config } from '../../src/config.js'
import { json } from '../http.js'
import { affiliates, iso, todayIso } from '../rainbet.js'

/** The ended monthly periods since config.pastLeaderboardsFrom, oldest first */
export function endedPeriods(today = todayIso()) {
  const from = config.pastLeaderboardsFrom
  if (!from) return []
  const resetDay = config.leaderboard?.resetDay ?? 1
  const [y, m] = from.split('-').map(Number)
  const out = []
  for (let i = 0; i < 600; i++) {
    const startAt = iso(Date.UTC(y, m - 1 + i, resetDay))
    const endAt = iso(Date.UTC(y, m + i, resetDay - 1))
    if (endAt >= today) break // still running (or not started)
    out.push({ startAt, endAt })
  }
  return out
}

async function winnerOf({ startAt, endAt }) {
  const rows = await affiliates(startAt, endAt)
  const top = rows.reduce((best, r) => (r.wagered > (best?.wagered ?? 0) ? r : best), null)
  return top ? { winner: top.name, wagered: Math.round(top.wagered * 100) / 100 } : { winner: null, wagered: 0 }
}

export async function handle(req, ctx) {
  if (ctx.path !== '/api/past-leaderboards') return null
  if (ctx.method !== 'GET') return json(405, { error: 'Use GET.' })

  const manual = new Map((config.pastLeaderboards ?? []).filter((e) => e.startAt).map((e) => [e.startAt, e]))
  const periods = endedPeriods()
  const found = await Promise.all(
    periods.map(async (p) => {
      try {
        const w = await winnerOf(p)
        const m = manual.get(p.startAt)
        // raw: the winner is a full username from the API (the site masks it); a winner typed
        // in config is shown as typed
        return { ...p, prizePool: config.prizePool, ...w, raw: Boolean(w.winner), ...m, ...(m?.winner ? { raw: false } : {}) }
      } catch {
        // the API failed for this month: show it only if config names its winner
        const m = manual.get(p.startAt)
        return m ? { ...p, prizePool: config.prizePool, ...m } : null
      }
    }),
  )
  const auto = new Set(periods.map((p) => p.startAt))
  const extra = (config.pastLeaderboards ?? []).filter((e) => !e.startAt || !auto.has(e.startAt))
  const leaderboards = [...found.filter(Boolean), ...extra].sort((a, b) => (b.startAt ?? '').localeCompare(a.startAt ?? ''))

  return {
    ...json(200, { leaderboards }),
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  }
}
