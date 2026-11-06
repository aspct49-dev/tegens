// VIPs: a list of Kick usernames the admin keeps. VIPs can call slots in chat
// (./slotcalls.js) and a giveaway can be VIPs-only (./giveaway.js). Each VIP's
// stats come from the wins recorded on their calls (table vipWins), so clearing
// the call queue doesn't lose them.
//
//   GET  /api/events/vips                 { vips, totals }   the public VIP page (/vips): call records, best first
//   GET  /api/events/vip-names            { kick, rainbet }  lower-case names that get the VIP badge on the site:
//                                         the VIPs' Kick names, and the Rainbet usernames linked (approved) to them
//   GET  /api/admin/vips                  { vips }   each with { calls, played, totalWon, biggestWin, best, lastCallAt }
//   GET  /api/admin/vips/<key>            { vip, wins, queued, activity }   one VIP's profile
//   POST /api/admin/vips                  { username, note? }   username or a kick.com/<name> link
//   POST /api/admin/vips/<key>            { note }
//   POST /api/admin/vips/<key>/remove
//
// Table `vips`: [{ key, username, note, addedAt, addedBy }]   key = lower-case username; times unix seconds
// Table `vipWins`: [{ id, key, username, slot, bet, win, at }]   newest first, at most 5,000

import { approvedRainbet } from '../auth.js'
import { json, nowSeconds } from '../http.js'
import { read, update } from '../store.js'

class InputError extends Error {}

const MAX_VIPS = 500
const MAX_WINS = 5000

// ---------------------------------------------------------------- the list, for other features

// every write goes through saveVips(), so the set in memory stays current
let keys = null

async function vipKeys() {
  keys ??= new Set((await read('vips', [])).map((v) => v.key))
  return keys
}

/** The VIP keys (lower-case Kick usernames), for checks on many chat messages at once */
export const vipSet = () => vipKeys()

/** Is this Kick username a VIP? */
export async function isVip(username) {
  return (await vipKeys()).has(String(username ?? '').trim().toLowerCase())
}

/** Every VIP, in the order they were added */
export const listVips = () => read('vips', [])

async function saveVips(fn) {
  const list = await update('vips', fn, [])
  keys = new Set(list.map((v) => v.key))
  return list
}

/** A win on a VIP's call (./slotcalls.js): kept for their stats */
export async function recordVipWin({ key, username, slot, bet, win, callId }) {
  await update('vipWins', (list) => [{ id: callId, key, username, slot, bet, win, at: nowSeconds() }, ...list.filter((w) => w.id !== callId)].slice(0, MAX_WINS), [])
}

/** A call's win was cleared or the call deleted: its row leaves the stats */
export async function forgetVipWin(callId) {
  await update('vipWins', (list) => list.filter((w) => w.id !== callId), [])
}

// ---------------------------------------------------------------- input

/** "kick.com/SomeName", "@SomeName", "SomeName" → "SomeName" */
export function cleanUsername(v) {
  let s = String(v ?? '').trim()
  s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?kick\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0]
  if (!/^[A-Za-z0-9_]{2,25}$/.test(s)) throw new InputError('Enter a Kick username or channel link, e.g. kick.com/someone.')
  return s
}

// ---------------------------------------------------------------- stats

export function statsFor(wins) {
  const by = new Map()
  for (const w of wins) {
    const s = by.get(w.key) ?? { played: 0, totalWon: 0, biggestWin: 0, best: null, totalBet: 0 }
    s.played++
    s.totalWon += w.win
    s.totalBet += w.bet ?? 0
    if (w.win > s.biggestWin) Object.assign(s, { biggestWin: w.win, best: { slot: w.slot?.name ?? null, image: w.slot?.image ?? null, win: w.win, bet: w.bet ?? null, at: w.at } })
    by.set(w.key, s)
  }
  return by
}

async function view() {
  const [vips, wins, calls] = await Promise.all([read('vips', []), read('vipWins', []), read('slotCalls', null)])
  const stats = statsFor(wins)
  const callCount = new Map()
  const lastCall = new Map()
  for (const c of calls?.calls ?? []) {
    callCount.set(c.key, (callCount.get(c.key) ?? 0) + 1)
    lastCall.set(c.key, Math.max(lastCall.get(c.key) ?? 0, c.at))
  }
  return {
    vips: vips.map((v) => {
      const s = stats.get(v.key)
      return {
        ...v,
        calls: callCount.get(v.key) ?? 0,
        played: s?.played ?? 0,
        totalWon: Math.round((s?.totalWon ?? 0) * 100) / 100,
        totalBet: Math.round((s?.totalBet ?? 0) * 100) / 100,
        biggestWin: s?.biggestWin ?? 0,
        best: s?.best ?? null,
        lastCallAt: lastCall.get(v.key) ?? null,
      }
    }),
  }
}

// ---------------------------------------------------------------- routes

/** One VIP's profile for the admin: stats, every recorded call, what's queued, their lines in the activity log */
async function profile(key) {
  const [vips, wins, calls, activity] = await Promise.all([view(), read('vipWins', []), read('slotCalls', null), read('activity', [])])
  const vip = vips.vips.find((v) => v.key === key)
  if (!vip) return null
  const name = vip.username.toLowerCase()
  // the whole name: "bob" must not match "bob2"
  const mentions = new RegExp(`(^|[^\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w]|$)`, 'i')
  return {
    vip,
    wins: wins.filter((w) => w.key === key),
    queued: (calls?.calls ?? []).filter((c) => c.key === key && c.status !== 'done').reverse(),
    activity: activity
      .filter((e) => e.actor.toLowerCase() === name || mentions.test(e.text))
      .slice(0, 60)
      .map(({ key: _k, ...e }) => e),
  }
}

/** The public VIP page: each VIP's call record, best first */
async function publicVips() {
  const [vips, wins] = await Promise.all([read('vips', []), read('vipWins', [])])
  const stats = statsFor(wins)
  const list = vips
    .map((v) => {
      const s = stats.get(v.key)
      const mine = wins.filter((w) => w.key === v.key)
      return {
        username: v.username,
        since: v.addedAt,
        played: s?.played ?? 0,
        totalWon: Math.round((s?.totalWon ?? 0) * 100) / 100,
        biggestWin: s?.biggestWin ?? 0,
        best: s?.best ?? null,
        recent: mine.slice(0, 3).map((w) => ({ slot: { name: w.slot?.name ?? null, image: w.slot?.image ?? null }, win: w.win, bet: w.bet ?? null, at: w.at })),
      }
    })
    .sort((a, b) => b.totalWon - a.totalWon || b.played - a.played || a.username.localeCompare(b.username))
  return {
    vips: list,
    totals: { vips: list.length, played: list.reduce((n, v) => n + v.played, 0), won: Math.round(list.reduce((n, v) => n + v.totalWon, 0) * 100) / 100 },
  }
}

/** Who gets the VIP badge: Kick names, plus each VIP's approved Rainbet username (leaderboard, wager raffle) */
export async function badgeNames() {
  const [set, players] = await Promise.all([vipKeys(), read('players', [])])
  const rainbet = new Set()
  for (const p of players) {
    const kick = p.kick?.username?.toLowerCase()
    const rb = kick && set.has(kick) ? approvedRainbet(p) : null
    if (rb) rainbet.add(rb.toLowerCase())
  }
  return { kick: [...set], rainbet: [...rainbet] }
}

export async function handle(req, ctx) {
  const { path, method, body, user } = ctx
  if (path === '/api/events/vips') return json(200, await publicVips())
  if (path === '/api/events/vip-names') return { ...json(200, await badgeNames()), headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } }
  if (path !== '/api/admin/vips' && !path.startsWith('/api/admin/vips/')) return null
  try {
    if (path === '/api/admin/vips' && method === 'GET') return json(200, await view())
    if (method === 'GET') {
      const key = /^\/api\/admin\/vips\/(\w+)$/.exec(path)?.[1]
      const p = key ? await profile(key) : null
      return p ? json(200, p) : json(404, { error: 'That VIP is no longer on the list.' })
    }
    if (method !== 'POST') return json(405, { error: 'Use POST.' })

    if (path === '/api/admin/vips') {
      const username = cleanUsername(body.username)
      const key = username.toLowerCase()
      await saveVips((list) => {
        const had = list.find((v) => v.key === key)
        if (had) throw new InputError(`${had.username} is already a VIP.`)
        if (list.length >= MAX_VIPS) throw new InputError(`The list holds ${MAX_VIPS} VIPs at most.`)
        const note = String(body.note ?? '').trim().slice(0, 80)
        return [...list, { key, username, note, addedAt: nowSeconds(), addedBy: user?.kick?.username ?? null }]
      })
      return json(200, await view())
    }

    const [, key, action] = /^\/api\/admin\/vips\/([\w]+)(?:\/(\w+))?$/.exec(path) ?? []
    if (!key) return json(404, { error: 'Not found.' })
    await saveVips((list) => {
      const v = list.find((x) => x.key === key)
      if (!v) throw new InputError('That VIP is no longer on the list.')
      if (action === 'remove') return list.filter((x) => x.key !== key)
      if (action) throw new InputError('Unknown action.')
      v.note = String(body.note ?? '').trim().slice(0, 80)
      return list
    })
    return json(200, await view())
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    throw err
  }
}
