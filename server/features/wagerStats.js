// Admin wager stats: how much players wagered under the code over any past time frame,
// as a total, per player, and bucketed over time (by day, week or month) for a chart.
// Read-only: everything comes from the Rainbet affiliate API (../rainbet.js, cached).
//
//   GET /api/admin/wager-stats?start=YYYY-MM-DD&end=YYYY-MM-DD[&bucket=day|week|month]
//     → { start, end, bucket,
//         buckets: [{ start, end, total, players }],                  one per day/week/month
//         totals:  { wagered, players, avg, median, top10Share, previous: { start, end, wagered } },
//         players: [{ name, wagered, share, series: number[] }] }     most wagered first (series per bucket)
//
// Ranges are inclusive UTC days, end at most today, at most MAX_DAYS long. Without `bucket`:
// day up to 45 days, week up to 210, month beyond.

import { json } from '../http.js'
import { DAY, affiliates, iso, parseDay, todayIso, wagersBetween } from '../rainbet.js'

const MAX_DAYS = 731
const MAX_BUCKETS = 120
const MAX_PLAYERS = 500
const DATE = /^\d{4}-\d{2}-\d{2}$/

class InputError extends Error {}

/** [start, end] buckets covering the range */
function bucketsFor(start, end, kind) {
  const s0 = parseDay(start)
  const last = parseDay(end)
  const out = []
  if (kind === 'month') {
    let d = new Date(s0)
    while (d.getTime() <= last) {
      const monthEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
      out.push([iso(d.getTime()), iso(Math.min(monthEnd, last))])
      d = new Date(monthEnd + DAY)
    }
    return out
  }
  const step = kind === 'week' ? 7 : 1
  for (let s = s0; s <= last; s += step * DAY) out.push([iso(s), iso(Math.min(s + (step - 1) * DAY, last))])
  return out
}

function median(values) {
  if (!values.length) return 0
  const v = [...values].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

const round = (n) => Math.round(n * 100) / 100

export async function wagerStats(start, end, bucket) {
  if (!DATE.test(start) || !DATE.test(end)) throw new InputError('Dates must be YYYY-MM-DD.')
  const today = todayIso()
  if (end > today) end = today
  if (start > end) throw new InputError('The start date is after the end date.')
  const days = Math.round((parseDay(end) - parseDay(start)) / DAY) + 1
  if (days > MAX_DAYS) throw new InputError(`Pick at most ${MAX_DAYS} days.`)
  let kind = ['day', 'week', 'month'].includes(bucket) ? bucket : days <= 45 ? 'day' : days <= 210 ? 'week' : 'month'
  if (kind === 'day' && days > MAX_BUCKETS) kind = 'week'
  if (kind === 'week' && days / 7 > MAX_BUCKETS) kind = 'month'
  const ranges = bucketsFor(start, end, kind)

  // each bucket is at most a month: one cached Rainbet call each
  const perBucket = await Promise.all(ranges.map(([s, e]) => affiliates(s, e)))
  const players = new Map() // lower name → { name, wagered, series }
  const buckets = ranges.map(([s, e], i) => {
    let total = 0
    let count = 0
    for (const r of perBucket[i]) {
      if (!(r.wagered > 0)) continue
      total += r.wagered
      count++
      const k = r.name.toLowerCase()
      let p = players.get(k)
      if (!p) players.set(k, (p = { name: r.name, wagered: 0, series: new Array(ranges.length).fill(0) }))
      p.wagered += r.wagered
      p.series[i] += r.wagered
    }
    return { start: s, end: e, total: round(total), players: count }
  })

  const list = [...players.values()].sort((a, b) => b.wagered - a.wagered)
  const wagered = list.reduce((t, p) => t + p.wagered, 0)
  const top10 = list.slice(0, 10).reduce((t, p) => t + p.wagered, 0)

  // the same length of time just before, for a "vs previous" figure
  const prevEnd = iso(parseDay(start) - DAY)
  const prevStart = iso(parseDay(start) - days * DAY)
  let previous = null
  try {
    const prevRows = await wagersBetween(prevStart, prevEnd)
    previous = { start: prevStart, end: prevEnd, wagered: round(prevRows.reduce((t, r) => t + (r.wagered > 0 ? r.wagered : 0), 0)) }
  } catch {
    /* the comparison is optional */
  }

  return {
    start,
    end,
    bucket: kind,
    buckets,
    totals: {
      wagered: round(wagered),
      players: list.length,
      avg: list.length ? round(wagered / list.length) : 0,
      median: round(median(list.map((p) => p.wagered))),
      top10Share: wagered ? top10 / wagered : 0,
      previous,
    },
    players: list.slice(0, MAX_PLAYERS).map((p) => ({
      name: p.name,
      wagered: round(p.wagered),
      share: wagered ? p.wagered / wagered : 0,
      series: p.series.map(round),
    })),
  }
}

export async function handle(req, ctx) {
  if (ctx.path !== '/api/admin/wager-stats' || ctx.method !== 'GET') return null
  const q = ctx.url.searchParams
  try {
    return json(200, await wagerStats(q.get('start') ?? '', q.get('end') ?? '', q.get('bucket')))
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    return json(502, { error: `Rainbet is unavailable right now (${err.message}).` })
  }
}
