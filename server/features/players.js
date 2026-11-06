// Player accounts (the players table, written on each sign-in by server/auth.js),
// their linked Rainbet username and the admin's view of them.
//
//   GET  /api/profile                              → { user: null } signed out, else
//        { user, admin, player, rainbet: { username, wagered, tier, next, pct } | null (approved only),
//          link: { username, status, verified, requestedAt, decidedAt, note } | null, wins,
//          vip: { played, totalWon, biggestWin, best, waiting, recent } | null }
//   POST /api/profile/rainbet           { username } ask to link a Rainbet username: it must
//                                       appear under the code since milestones.trackSince (if
//                                       Rainbet can't be reached it goes in unchecked), then
//                                       waits for an admin. One request at a time.
//   POST /api/profile/rainbet/cancel    withdraw a waiting request
//   GET  /api/admin/players?q=&status=pending      → { players, total, pending } most recently seen
//                                                    first (≤ 200); status=pending: link requests only
//   GET  /api/admin/players/<id>                   → { player, rainbet, link, wins }
//   POST /api/admin/players/<id>/rainbet { username, force } set / change their link, approved at
//                                       once (checked; force: link it even if Rainbet can't confirm it)
//   POST /api/admin/players/<id>/rainbet-approve { force }  approve a waiting request (checked again)
//   POST /api/admin/players/<id>/rainbet-reject  { note }   turn it down; the note is shown to them
//   POST /api/admin/players/<id>/unlink-rainbet  { note }   remove it (they can ask again)
//   POST /api/admin/players/<id>/rainbet-check            look the name up under the code again
//                                       (sets verified, checkFailed, checkedAt; status unchanged)
//   GET  /api/admin/players?status=linked | links         approved links | every link in any state
//                                       (the Links tab), most recently decided first
//   GET  /api/admin/overview                       → counts and a summary of every feature
//
// A check Rainbet can't confirm answers 409 { error, code: 'not_verified' }; send force: true to
// go ahead anyway.
//
// A player's Rainbet link is stored on their row as
//   rainbet: { username, id, status, verified, approvedAnyway, requestedAt, decidedAt, decidedBy, note, linkedAt }
//   status    'pending'  asked for on /profile, waiting for an admin
//             'approved' the only state that counts: tier, wins, the side nav (auth.js /me)
//             'rejected' / 'unlinked'  kept so the player sees the admin's note; they can ask again
//   verified  found under the code at the last check (false: not found, or Rainbet unreachable)
// A link saved before approvals existed has no status: it counts as approved (no migration).
// auth.js spreads the existing row when it refreshes it, so the link survives sign-ins.

import { config } from '../../src/config.js'
import { approvedRainbet, displayName } from '../auth.js'
import { envValue } from '../env.js'
import { json, nowSeconds } from '../http.js'
import { COLORS, notifyAdmins } from '../notify.js'
import { read, update } from '../store.js'
import { isVip, statsFor } from './vips.js'

const AFFILIATES = 'https://services.rainbet.com/v1/external/affiliates'
const WINDOW_DAYS = 120 // the affiliate API rejects longer ranges
const MAX_WINDOWS = 10 // ~3.3 years back at most, whatever trackSince says
const OPEN_TTL = 5 * 60_000 // the window ending today keeps changing
const DAY = 86_400_000
const SEEN_EVERY = 600 // seconds
const TIERS = config.milestones.tiers

class InputError extends Error {}

const iso = (t) => new Date(t).toISOString().slice(0, 10)

// ---------------------------------------------------------------- Rainbet wager

/** [start, end] ranges of ≤ 120 days from `since` to today (UTC) */
function windows(since) {
  const today = Date.parse(`${iso(Date.now())}T00:00:00Z`)
  let start = Date.parse(`${since}T00:00:00Z`)
  if (!Number.isFinite(start) || start > today) start = today
  const out = []
  while (start <= today) {
    const end = Math.min(start + (WINDOW_DAYS - 1) * DAY, today)
    out.push({ start: iso(start), end: iso(end), open: end === today })
    start = end + DAY
  }
  return out.slice(-MAX_WINDOWS)
}

const windowCache = new Map() // `${start}_${end}` → { at, open, rows } (closed windows never change)
const inflight = new Map()

async function loadWindow(w) {
  const key = `${w.start}_${w.end}`
  const hit = windowCache.get(key)
  if (hit && (!hit.open || Date.now() - hit.at < OPEN_TTL)) return hit.rows
  if (inflight.has(key)) return inflight.get(key)
  const run = (async () => {
    const apiKey = envValue('RAINBET_API_KEY')
    if (!apiKey) throw new Error('Missing RAINBET_API_KEY')
    const url = new URL(AFFILIATES)
    url.searchParams.set('start_at', w.start)
    url.searchParams.set('end_at', w.end)
    url.searchParams.set('key', apiKey)
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`Rainbet API ${res.status}`)
    const data = await res.json()
    const rows = (data.affiliates ?? []).map((a) => ({
      id: a.id ? String(a.id) : null,
      name: String(a.username ?? ''),
      wagered: parseFloat(a.wagered_amount) || 0,
    }))
    windowCache.set(key, { at: Date.now(), open: w.open, rows })
    return rows
  })()
  inflight.set(key, run)
  try {
    return await run
  } finally {
    inflight.delete(key)
  }
}

/** A username's wager under the code since trackSince: { found, name, id, wagered } */
async function lookupRainbet(username) {
  const wanted = String(username).trim().toLowerCase()
  const parts = await Promise.all(windows(config.milestones.trackSince).map(loadWindow))
  let wagered = 0
  let name = null
  let id = null
  for (const rows of parts) {
    for (const r of rows) {
      if (r.name.toLowerCase() !== wanted) continue
      wagered += r.wagered
      name = r.name
      id = r.id ?? id
    }
  }
  return { found: name !== null, name: name ?? String(username).trim(), id, wagered: Math.round(wagered * 100) / 100 }
}

/** Where a wager sits on the milestone ladder (same rule as src/milestones.js) */
function progress(wagered) {
  let reached = -1
  TIERS.forEach((t, i) => {
    if (wagered >= t.wager) reached = i
  })
  const current = TIERS[reached] ?? null
  const next = TIERS[reached + 1] ?? null
  const floor = current ? current.wager : 0
  const pct = next ? Math.min(1, Math.max(0, (wagered - floor) / (next.wager - floor))) : 1
  const slim = (t) => (t ? { id: t.id, name: t.name, wager: t.wager, prize: t.prize } : null)
  return { tier: slim(current), next: slim(next), pct, reachedCount: reached + 1 }
}

/** The Rainbet block shown on a profile (null unless approved; wagered null if the API failed) */
async function rainbetView(player) {
  const username = approvedRainbet(player)
  if (!username) return null
  const base = { username, linkedAt: player.rainbet.linkedAt ?? null, since: config.milestones.trackSince }
  try {
    const r = await lookupRainbet(username)
    return { ...base, wagered: r.wagered, ...progress(r.wagered) }
  } catch (err) {
    console.error('[players] Rainbet lookup failed:', err.message)
    return { ...base, wagered: null, error: 'Wager is unavailable right now.' }
  }
}

// ---------------------------------------------------------------- the link and its approval

const RAINBET_NAME = /^[A-Za-z0-9_.-]{2,32}$/

/** A row's link with its status filled in (no status = saved before approvals = approved), or null */
function linkOf(player) {
  const l = player?.rainbet
  return l?.username ? { ...l, status: l.status ?? 'approved' } : null
}

/** What the player sees of their own link (no admin names) */
function publicLink(player) {
  const l = linkOf(player)
  if (!l) return null
  return { username: l.username, status: l.status, verified: l.verified ?? true, requestedAt: l.requestedAt ?? l.linkedAt ?? null, decidedAt: l.decidedAt ?? null, note: l.note ?? '' }
}

/** The row without its link's admin fields, for the player's own view */
const ownRow = (player) => {
  const { rainbet, ...rest } = player
  return rest
}

/** Another player who holds this name (approved or waiting for approval) */
const holderOf = (players, name, selfId) =>
  players.find((p) => {
    const l = linkOf(p)
    return p.id !== selfId && l && (l.status === 'approved' || l.status === 'pending') && l.username.toLowerCase() === name.toLowerCase()
  }) ?? null

const notVerified = (message) => Object.assign(new InputError(message), { status: 409, code: 'not_verified' })

/**
 * Look a username up under the code: { username (as Rainbet spells it), id, verified, problem }.
 * problem is null when found, else why it couldn't be confirmed; notFound tells the two apart.
 */
async function checkRainbet(username) {
  try {
    const r = await lookupRainbet(username)
    if (r.found) return { username: r.name, id: r.id, verified: true, problem: null, notFound: false }
    return {
      username,
      id: null,
      verified: false,
      notFound: true,
      problem: `${username} isn’t under code ${config.referralCode} since ${config.milestones.trackSince}.`,
    }
  } catch (err) {
    console.error('[players] Rainbet check failed:', err.message)
    return { username, id: null, verified: false, notFound: false, problem: 'Rainbet couldn’t be reached to check it.' }
  }
}

/** A valid name nobody else holds, checked with Rainbet */
async function vetRainbet(raw, players, selfId) {
  const username = String(raw ?? '').trim()
  if (!RAINBET_NAME.test(username)) throw new InputError('Enter a Rainbet username (letters, numbers and _ only).')
  if (holderOf(players, username, selfId))
    throw new InputError('That Rainbet username is already linked to (or waiting on) another account. Open a ticket on Discord if it’s yours.')
  return checkRainbet(username)
}

const adminName = (user) => user?.kick?.username ?? user?.discord?.username ?? 'admin'
const cleanNote = (v) => String(v ?? '').trim().slice(0, 200)

/**
 * Change one player's link inside the write: fn(link | null, list) returns the new
 * link (or null to remove it). The row is created from `seed` when it's missing.
 */
async function changeLink(id, fn, seed) {
  let saved = null
  await update('players', (list) => {
    const i = list.findIndex((p) => p.id === id)
    if (i < 0 && !seed) throw Object.assign(new InputError('No player with that id.'), { status: 404 })
    const row = { ...(i >= 0 ? list[i] : seed) }
    const next = fn(linkOf(row), list)
    if (next) row.rainbet = next
    else delete row.rainbet
    if (i >= 0) list[i] = row
    else list.push(row)
    saved = row
    return list
  })
  return saved
}

/** Re-check that no one else took the name while Rainbet was being asked */
function assertFree(list, name, selfId) {
  const other = holderOf(list, name, selfId)
  if (other) throw Object.assign(new InputError(`${name} is already linked to (or waiting on) ${other.name ?? 'another account'}.`), { status: 409 })
}

// ---------------------------------------------------------------- wins from other features

const lower = (v) => (typeof v === 'string' ? v.toLowerCase() : '')
const nameOf = (w) => (typeof w === 'string' ? w : (w?.username ?? w?.name ?? w?.kick ?? w?.user ?? ''))

/**
 * Recent guess / giveaway wins for a player, matched on their Kick username (or
 * account id). Read tolerantly: these tables belong to other features and their
 * shapes may change, so anything unrecognised is skipped.
 */
async function winsFor(player) {
  if (!player) return []
  // only an approved Rainbet name counts as theirs
  const names = new Set([lower(player.kick?.username), lower(player.name), lower(approvedRainbet(player))].filter(Boolean))
  const isMe = (w) => (w && typeof w === 'object' && w.userId === player.id) || names.has(lower(nameOf(w)))
  const out = []
  const time = (v) => {
    const n = typeof v === 'number' ? v : Date.parse(v)
    if (!Number.isFinite(n)) return null
    return n > 1e12 ? Math.floor(n / 1000) : n // seconds
  }
  try {
    const wins = await read('giveawayWins', [])
    for (const w of Array.isArray(wins) ? wins : []) {
      if (!isMe(w.winner ?? w)) continue
      out.push({ kind: 'giveaway', title: String(w.title ?? w.prize ?? w.keyword ?? 'Chat giveaway'), prize: w.prize ?? null, at: time(w.at ?? w.drawnAt ?? w.createdAt) })
    }
  } catch {
    /* unknown shape */
  }
  try {
    const guesses = await read('guesses', [])
    for (const g of Array.isArray(guesses) ? guesses : []) {
      const winner = g?.winner ?? g?.result?.winner
      if (!winner || !isMe(winner)) continue
      out.push({ kind: 'guess', title: String(g.title ?? g.name ?? 'Guess the balance'), prize: g.prize ?? null, at: time(g.closedAt ?? g.endedAt ?? g.updatedAt ?? g.createdAt) })
    }
  } catch {
    /* unknown shape */
  }
  try {
    // VIP slot calls that paid (./slotcalls.js records them in vipWins)
    for (const w of await read('vipWins', [])) {
      if (!names.has(lower(w.username)) || !w.win) continue
      out.push({ kind: 'call', title: w.slot?.name ?? 'Slot call', prize: w.win, at: w.at, image: w.slot?.image ?? null })
    }
  } catch {
    /* unknown shape */
  }
  return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 10)
}

/** A player's VIP block for their profile: null when they aren't a VIP */
async function vipFor(player) {
  const name = player?.kick?.username
  if (!name || !(await isVip(name))) return null
  const key = name.toLowerCase()
  const mine = (await read('vipWins', [])).filter((w) => w.key === key)
  const s = statsFor(mine).get(key)
  const calls = (await read('slotCalls', null))?.calls ?? []
  const waiting = calls.find((c) => c.key === key && c.status === 'waiting') ?? null
  return {
    played: s?.played ?? 0,
    totalWon: Math.round((s?.totalWon ?? 0) * 100) / 100,
    biggestWin: s?.biggestWin ?? 0,
    best: s?.best ?? null,
    waiting: waiting ? { slot: waiting.slot } : null,
    recent: mine.slice(0, 4).map((w) => ({ slot: w.slot, win: w.win, bet: w.bet ?? null, at: w.at })),
  }
}

// ---------------------------------------------------------------- overview

const LIVE = new Set(['open', 'active', 'live', 'running', 'started', 'collecting', 'playing', 'locked'])
const arr = (v) => (Array.isArray(v) ? v : [])

/** { total, live, latest } for a list table of unknown shape */
function summarize(list) {
  const items = arr(list)
  const label = (x) => (x && typeof x === 'object' ? (x.title ?? x.name ?? x.game ?? x.id ?? null) : null)
  const live = items.filter((x) => x && typeof x === 'object' && (LIVE.has(lower(x.status)) || x.active === true || x.live === true))
  const stamp = (x) => Number(x?.updatedAt ?? x?.createdAt ?? 0) || 0
  const latest = [...items].sort((a, b) => stamp(b) - stamp(a))[0]
  return { total: items.length, live: live.length, liveLabel: live[0] ? label(live[0]) : null, latest: latest ? label(latest) : null }
}

async function safeRead(table, fallback) {
  try {
    return await read(table, fallback)
  } catch {
    return fallback
  }
}

async function overview() {
  const [players, hunts, guesses, tournaments, giveaway, giveawayWins, raffles, challenges, claims, shopOrders, bigWins] = await Promise.all([
    safeRead('players', []),
    safeRead('hunts', []),
    safeRead('guesses', []),
    safeRead('tournaments', []),
    safeRead('giveaway', null),
    safeRead('giveawayWins', []),
    safeRead('raffles', []),
    safeRead('challenges', []),
    safeRead('claims', []),
    safeRead('shopOrders', []),
    safeRead('bigWins', []),
  ])
  const now = nowSeconds()
  const list = arr(players)
  const ga = giveaway && typeof giveaway === 'object' && !Array.isArray(giveaway) ? giveaway : null
  return {
    players: {
      total: list.length,
      seen7d: list.filter((p) => now - (p.lastSeen ?? 0) < 7 * 86400).length,
      new7d: list.filter((p) => now - (p.firstSeen ?? 0) < 7 * 86400).length,
      rainbet: list.filter((p) => approvedRainbet(p)).length,
      rainbetPending: list.filter((p) => linkOf(p)?.status === 'pending').length,
      discord: list.filter((p) => p.discord).length,
    },
    hunts: summarize(hunts),
    guesses: summarize(guesses),
    tournaments: summarize(tournaments),
    giveaway: ga
      ? {
          status: ga.status ?? (ga.open ? 'open' : null),
          keyword: ga.keyword ?? null,
          entries: Array.isArray(ga.entries) ? ga.entries.length : Number(ga.entryCount ?? ga.entries) || 0,
          wins: arr(giveawayWins).length,
        }
      : { status: null, keyword: null, entries: 0, wins: arr(giveawayWins).length },
    raffles: summarize(raffles),
    challenges: {
      total: arr(challenges).length,
      active: arr(challenges).filter((c) => c?.status !== 'completed').length,
      completed: arr(challenges).filter((c) => c?.status === 'completed').length,
    },
    claims: { total: arr(claims).length, pending: arr(claims).filter((c) => c?.status === 'pending').length },
    bigWins: { approved: arr(bigWins).filter((w) => w?.status === 'approved').length, pending: arr(bigWins).filter((w) => w?.status === 'pending').length },
    // the two stores (./shop.js): orders without a store are watch-store orders
    shop: {
      total: arr(shopOrders).filter((o) => o?.store !== 'wager').length,
      pending: arr(shopOrders).filter((o) => o?.store !== 'wager' && o?.status === 'pending').length,
    },
    wagerStore: {
      total: arr(shopOrders).filter((o) => o?.store === 'wager').length,
      pending: arr(shopOrders).filter((o) => o?.store === 'wager' && o?.status === 'pending').length,
    },
  }
}

// ---------------------------------------------------------------- handler

/** The signed-in player's row, made from the session if it isn't stored yet */
const fromSession = (user) => ({
  id: user.id,
  name: displayName(user),
  avatar: user.kick?.avatar ?? user.discord?.avatar ?? null,
  kick: user.kick ?? null,
  discord: user.discord ?? null,
  firstSeen: nowSeconds(),
  lastSeen: nowSeconds(),
})

const held = (l) => l?.status === 'approved' || l?.status === 'pending'

/** POST /api/admin/players/<id>/<action>: the admin side of the link */
async function adminLinkAction(id, action, body, admin) {
  const t = nowSeconds()
  const by = adminName(admin)
  const note = cleanNote(body.note)

  if (action === 'rainbet') {
    // set / change directly: approved at once
    const c = await vetRainbet(body.username, await read('players'), id)
    if (c.problem && !body.force) throw notVerified(`${c.problem} Link it anyway only if you’re sure it’s theirs.`)
    return changeLink(id, (l, list) => {
      assertFree(list, c.username, id)
      return { username: c.username, id: c.id, status: 'approved', verified: c.verified, approvedAnyway: !c.verified, requestedAt: t, decidedAt: t, decidedBy: by, note: '', linkedAt: t }
    })
  }

  if (action === 'rainbet-approve') {
    const row = (await read('players')).find((p) => p.id === id)
    if (!row) throw Object.assign(new InputError('No player with that id.'), { status: 404 })
    const asked = linkOf(row)
    if (asked?.status !== 'pending') throw Object.assign(new InputError('Only a waiting request can be approved.'), { status: 409 })
    // looked up under the code again: it may have changed since they asked
    const c = await checkRainbet(asked.username)
    if (c.problem && !body.force) throw notVerified(`${c.problem} Approve it anyway only if you’re sure it’s theirs.`)
    return changeLink(id, (l, list) => {
      if (l?.status !== 'pending' || l.username !== asked.username) throw Object.assign(new InputError('That request changed. Reload and try again.'), { status: 409 })
      const username = c.verified ? c.username : l.username
      assertFree(list, username, id)
      return { ...l, username, id: c.id ?? l.id ?? null, status: 'approved', verified: c.verified, approvedAnyway: !c.verified, decidedAt: t, decidedBy: by, note: '', linkedAt: t }
    })
  }

  if (action === 'rainbet-check') {
    // look the name up under the code again (the Links tab's tick); doesn't change the status
    const row = (await read('players')).find((p) => p.id === id)
    const asked = linkOf(row)
    if (!asked) throw Object.assign(new InputError('They have no Rainbet username to check.'), { status: 409 })
    const c = await checkRainbet(asked.username)
    return changeLink(id, (l) => {
      if (!l || l.username !== asked.username) throw Object.assign(new InputError('That link changed. Reload and try again.'), { status: 409 })
      return { ...l, verified: c.verified, checkFailed: !c.verified && !c.notFound, checkedAt: t }
    })
  }

  if (action === 'rainbet-reject')
    return changeLink(id, (l) => {
      if (l?.status !== 'pending') throw Object.assign(new InputError('Only a waiting request can be rejected.'), { status: 409 })
      return { ...l, status: 'rejected', note, decidedAt: t, decidedBy: by }
    })

  // unlink-rainbet: kept as 'unlinked' so the player sees why; they can ask again
  return changeLink(id, (l) => {
    if (!held(l)) throw Object.assign(new InputError('They have no Rainbet link to remove.'), { status: 409 })
    return { ...l, status: 'unlinked', note, decidedAt: t, decidedBy: by }
  })
}

export async function handle(req, ctx) {
  const { path, method, user, body } = ctx
  const isProfile = path === '/api/profile' || path.startsWith('/api/profile/')
  const isAdmin = path === '/api/admin/overview' || path === '/api/admin/players' || path.startsWith('/api/admin/players/')
  if (!isProfile && !isAdmin) return null

  try {
    // ---- the signed-in player
    if (path === '/api/profile') {
      if (!user) return json(200, { user: null })
      let player = (await read('players')).find((p) => p.id === user.id) ?? fromSession(user)
      // visits count as "seen" too (sign-ins last 30 days), at most every 10 minutes
      if (player.lastSeen && nowSeconds() - player.lastSeen > SEEN_EVERY) {
        const t = nowSeconds()
        await update('players', (list) => list.map((p) => (p.id === user.id ? { ...p, lastSeen: t } : p)))
        player = { ...player, lastSeen: t }
      }
      const [rainbet, wins, vip] = await Promise.all([rainbetView(player), winsFor(player), vipFor(player)])
      return json(200, { user, admin: ctx.admin, player: ownRow(player), rainbet, link: publicLink(player), wins, vip })
    }

    if (path === '/api/profile/rainbet') {
      if (method !== 'POST') return json(405, { error: 'Use POST.' })
      if (!user) return json(401, { error: 'Sign in first.' })
      const players = await read('players')
      const current = linkOf(players.find((p) => p.id === user.id))
      if (current?.status === 'approved')
        return json(409, { error: `Your account is already linked to ${current.username}. Open a ticket on Discord to change it.` })
      if (current?.status === 'pending') return json(409, { error: `You already asked to link ${current.username}. An admin will check it soon.` })
      const c = await vetRainbet(body.username, players, user.id)
      if (c.notFound)
        throw new InputError(
          `We couldn’t find ${c.username} under code ${config.referralCode} since ${config.milestones.trackSince}. Check the spelling, or wager a little first.`,
        )
      // if Rainbet couldn't be reached it still goes to an admin, marked unchecked
      const t = nowSeconds()
      // re-checked inside the write: two tabs asking at once must not both win
      const player = await changeLink(
        user.id,
        (l, list) => {
          if (held(l)) throw Object.assign(new InputError('Your account already has a link or a request waiting.'), { status: 409 })
          assertFree(list, c.username, user.id)
          return { username: c.username, id: c.id, status: 'pending', verified: c.verified, requestedAt: t, decidedAt: null, decidedBy: null, note: '' }
        },
        fromSession(user),
      )
      notifyAdmins(req, {
        title: `Rainbet link request: ${c.username}`,
        tab: 'links',
        color: COLORS.link,
        fields: [
          ['Player', user.kick?.username ?? displayName(user)],
          ['Rainbet', c.username],
          ['Under the code', c.verified ? `Found under ${config.referralCode}` : 'Not checked (Rainbet unreachable)'],
        ],
      })
      return json(200, { player: ownRow(player), rainbet: null, link: publicLink(player) })
    }

    if (path === '/api/profile/rainbet/cancel') {
      if (method !== 'POST') return json(405, { error: 'Use POST.' })
      if (!user) return json(401, { error: 'Sign in first.' })
      const player = await changeLink(user.id, (l) => {
        if (l?.status !== 'pending') throw Object.assign(new InputError('There’s no request waiting.'), { status: 409 })
        return null
      })
      return json(200, { player: ownRow(player), rainbet: null, link: null })
    }

    if (isProfile) return json(404, { error: 'Not found.' })

    // ---- admin (api.js has already refused non-admins)
    if (path === '/api/admin/overview') return json(200, await overview())

    if (path === '/api/admin/players') {
      const q = (ctx.url.searchParams.get('q') ?? '').trim().toLowerCase()
      // status: pending = waiting requests · linked = approved · links = anyone with a link in any state
      const status = ctx.url.searchParams.get('status')
      const requests = status === 'pending' || status === 'linked' || status === 'links'
      const all = await read('players')
      const isPending = (p) => linkOf(p)?.status === 'pending'
      const keep = { pending: isPending, linked: (p) => linkOf(p)?.status === 'approved', links: (p) => Boolean(linkOf(p)) }[status]
      const players = all
        .filter((p) => !keep || keep(p))
        .filter(
          (p) =>
            !q ||
            [p.id, p.name, p.kick?.username, p.discord?.username, p.discord?.name, p.rainbet?.username].some((v) => lower(v).includes(q)),
        )
        .sort(
          status === 'pending'
            ? (a, b) => (a.rainbet.requestedAt ?? 0) - (b.rainbet.requestedAt ?? 0) // oldest request first
            : requests
              ? (a, b) => (b.rainbet.decidedAt ?? b.rainbet.requestedAt ?? 0) - (a.rainbet.decidedAt ?? a.rainbet.requestedAt ?? 0)
              : (a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0),
        )
      return json(200, { players: players.slice(0, 200), total: players.length, pending: all.filter(isPending).length })
    }

    const m = path.match(/^\/api\/admin\/players\/([^/]+)(?:\/(unlink-rainbet|rainbet|rainbet-approve|rainbet-reject|rainbet-check))?$/)
    if (m) {
      const id = decodeURIComponent(m[1])
      const action = m[2]
      if (action) {
        if (method !== 'POST') return json(405, { error: 'Use POST.' })
        await adminLinkAction(id, action, body ?? {}, user)
      }
      const player = (await read('players')).find((p) => p.id === id)
      if (!player) return json(404, { error: 'No player with that id.' })
      const [rainbet, wins] = await Promise.all([rainbetView(player), winsFor(player)])
      return json(200, { player, rainbet, link: linkOf(player), wins })
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(err.status ?? 400, { error: err.message, ...(err.code ? { code: err.code } : {}) })
    throw err
  }
}
