// Biggest Wins: players submit a big slot win (the slot, bet size, multiplier and the
// Rainbet bet link); an admin checks the bet and approves it, and it goes up on the
// /biggest-wins leaderboard. The player follows their submissions on the same page.
//
//   GET  /api/big-wins?sort=multi|payout|auto&period=month|all|auto
//        → { wins (each with prize in the competition view), total, sort, period, isCompetition, competition }
//   GET  /api/admin/big-wins/settings | POST { prizes: [$…], rankBy, onePerPlayer }   the monthly prizes
//   GET  /api/admin/big-wins/results?month=YYYY-MM   a month's final places and prizes, to pay out
//   GET  /api/big-wins/mine                                  → { wins }   the signed-in player's
//   POST /api/big-wins   { slot: { slug?, name }, bet, multiplier, proof, note? }   → { win, wins }
//   POST /api/big-wins/<id>/cancel                           their own waiting one → { wins }
//
//   GET  /api/admin/big-wins?status=pending|approved|rejected|all   → { wins, counts }
//   POST /api/admin/big-wins/<id>/approve
//   POST /api/admin/big-wins/<id>/reject   { note }   the note is shown to the player
//   POST /api/admin/big-wins/<id>/undo                approved or rejected → waiting again
//   POST /api/admin/big-wins/<id>/edit     { bet?, multiplier?, slot? }   fix a typo before approving
//   POST /api/admin/big-wins/<id>/remove              gone for good (spam)
//
// Only a signed-in player with an approved Rainbet link (server/auth.js approvedRainbet) can
// submit, at most MAX_WAITING at a time, and a bet link can't be submitted twice.
//
// Table `bigWins`: [{ id, userId, player, kick, rainbet, slot: { key, name, slug, provider, image },
//   bet, multiplier, payout, proof, note, status: 'pending' | 'approved' | 'rejected' | 'cancelled',
//   at, decidedAt, decidedBy, adminNote }]   newest first, times unix seconds

import { randomBytes } from 'node:crypto'
import { approvedRainbet, displayName } from '../auth.js'
import { logActivity } from '../audit.js'
import { json, nowSeconds } from '../http.js'
import { COLORS, notifyAdmins } from '../notify.js'
import { loadCatalog, matchSlot, normName, slotOf } from '../slotCatalog.js'
import { read, update } from '../store.js'

const TABLE = 'bigWins'
const MAX_ROWS = 20_000
const MAX_WAITING = 5
const BOARD_SIZE = 50
const BET = [0.01, 100_000]
const MULTI = [1, 1_000_000]

class InputError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const newId = () => randomBytes(6).toString('base64url')
const list = () => read(TABLE, [])
const save = (fn) => update(TABLE, fn, [])
const round2 = (n) => Math.round(n * 100) / 100
const x = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}x`
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const proofKey = (s) => String(s ?? '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '')
const LIVE = new Set(['pending', 'approved']) // a win in one of these blocks the same bet link again

/** A Rainbet link is shown on the public board; anything else (a bet ID, another site) isn't */
function publicLink(proof) {
  try {
    const u = new URL(proof)
    return u.protocol === 'https:' && /(^|\.)rainbet\.com$/i.test(u.hostname) ? u.href : null
  } catch {
    return null
  }
}

/** What anyone sees of an approved win */
const shown = (w) => ({
  id: w.id,
  player: w.kick ?? w.player,
  slot: w.slot,
  bet: w.bet,
  multiplier: w.multiplier,
  payout: w.payout,
  link: publicLink(w.proof),
  at: w.at,
})

/** What a player sees of their own submission */
const mine = (w) => ({
  id: w.id,
  slot: w.slot,
  bet: w.bet,
  multiplier: w.multiplier,
  payout: w.payout,
  proof: w.proof,
  note: w.note ?? '',
  status: w.status,
  at: w.at,
  decidedAt: w.decidedAt ?? null,
  adminNote: w.adminNote ?? '',
})

const mineOf = async (userId) => (await list()).filter((w) => w.userId === userId && w.status !== 'cancelled').map(mine)

// ---------------------------------------------------------------- input

function numberIn(v, [min, max], what) {
  const n = Number(String(v ?? '').replace(/[$,x×\s]/gi, ''))
  if (!Number.isFinite(n) || n <= 0) throw new InputError(`Enter the ${what}.`)
  if (n < min || n > max) throw new InputError(`The ${what} must be between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`)
  return round2(n)
}

function proofOf(v) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ')
  if (!s) throw new InputError('Paste the Rainbet bet link of the win.')
  if (s.length > 200) throw new InputError('Keep the bet link under 200 characters.')
  if (/[<>"]/.test(s)) throw new InputError('That doesn’t look like a bet link or ID.')
  return s
}

/** The slot: picked from the catalog (slug), else matched by name, else the typed name without art */
async function slotFrom(v) {
  const name = String(v?.name ?? v ?? '').trim().replace(/\s+/g, ' ')
  const slug = String(v?.slug ?? '').trim()
  let games = []
  try {
    games = (await loadCatalog()).games
  } catch {
    // no catalog: keep the typed name
  }
  const found = (slug && games.find((g) => g.slug === slug)) || (name && games.find((g) => g.norm === normName(name))) || (name && matchSlot(games, name))
  if (found) return slotOf(found)
  if (name.length < 2) throw new InputError('Pick the slot you won on.')
  if (name.length > 60 || /[<>]/.test(name)) throw new InputError('That slot name doesn’t look right.')
  return { key: name.toLowerCase(), name, slug: null, provider: null, image: null }
}

async function submitter(user) {
  if (!user) throw new InputError('Sign in first to submit a win.', 401)
  const row = (await read('players')).find((p) => p.id === user.id) ?? null
  const rainbet = approvedRainbet(row)
  if (!rainbet) throw new InputError('Link your Rainbet username on your profile first. Only wins on that account count.', 403)
  return { userId: user.id, player: displayName(user), kick: user.kick?.username ?? null, rainbet }
}

async function submit(user, body) {
  const who = await submitter(user)
  const slot = await slotFrom(body.slot)
  const bet = numberIn(body.bet, BET, 'bet size')
  const multiplier = numberIn(body.multiplier, MULTI, 'multiplier')
  const proof = proofOf(body.proof)
  const note = String(body.note ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
  const win = {
    id: newId(),
    ...who,
    slot,
    bet,
    multiplier,
    payout: round2(bet * multiplier),
    proof,
    note,
    status: 'pending',
    at: nowSeconds(),
    decidedAt: null,
    decidedBy: null,
    adminNote: '',
  }
  await save((l) => {
    const key = proofKey(proof)
    if (l.some((w) => LIVE.has(w.status) && proofKey(w.proof) === key)) throw new InputError('That bet has already been submitted.', 409)
    if (l.filter((w) => w.userId === who.userId && w.status === 'pending').length >= MAX_WAITING)
      throw new InputError(`You have ${MAX_WAITING} wins waiting already. Wait for the team to check them first.`, 429)
    return [win, ...l].slice(0, MAX_ROWS)
  })
  logActivity({ actor: who.player, kind: 'wins', text: `Submitted a win: ${slot.name} ${x(multiplier)} (${usd(win.payout)})` })
  return win
}

// ---------------------------------------------------------------- the board

// The monthly competition: every calendar month (UTC), the approved wins submitted that
// month are ranked by the setting's rankBy, and place N gets prizes[N-1] (set in admin).
// With onePerPlayer, only each player's best win that month takes a place.
//
// Table `bigWinsSettings`: { prizes: [$ per place, 1st first], rankBy: 'multi' | 'payout', onePerPlayer }

const SETTINGS = 'bigWinsSettings'
const MAX_PLACES = 25
const MAX_PRIZE = 1_000_000

function normalizeSettings(s) {
  const prizes = (Array.isArray(s?.prizes) ? s.prizes : []).slice(0, MAX_PLACES).map((p) => {
    const n = round2(Number(p))
    return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PRIZE) : 0
  })
  while (prizes.length && !prizes.at(-1)) prizes.pop() // no trailing empty places
  return { prizes, rankBy: s?.rankBy === 'payout' ? 'payout' : 'multi', onePerPlayer: s?.onePerPlayer !== false }
}
const settingsOf = async () => normalizeSettings(await read(SETTINGS, null))
const hasPrizes = (s) => s.prizes.some((p) => p > 0)
const poolOf = (s) => round2(s.prizes.reduce((a, b) => a + b, 0))

const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
function monthRange(key) {
  const [y, m] = key.split('-').map(Number)
  return { start: Math.floor(Date.UTC(y, m - 1, 1) / 1000), end: Math.floor(Date.UTC(y, m, 1) / 1000) }
}
function prevMonthKey(key) {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(Date.UTC(y, m - 2, 1)))
}

const ORDER = {
  multi: (a, b) => b.multiplier - a.multiplier || b.payout - a.payout || a.at - b.at,
  payout: (a, b) => b.payout - a.payout || b.multiplier - a.multiplier || a.at - b.at,
}
/** Each player's best win only (the list is already in rank order) */
function bestPerPlayer(rows) {
  const seen = new Set()
  return rows.filter((w) => {
    const k = w.userId || String(w.kick ?? w.player).toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** A month's competition, ranked and with each place's prize */
async function standings(key, settings) {
  const { start, end } = monthRange(key)
  let rows = (await list()).filter((w) => w.status === 'approved' && w.at >= start && w.at < end).sort(ORDER[settings.rankBy])
  if (settings.onePerPlayer) rows = bestPerPlayer(rows)
  return rows.map((w, i) => ({ place: i + 1, prize: settings.prizes[i] ?? 0, win: w }))
}

/**
 * The public board. sort / period 'auto' (or missing) open on the competition when prizes
 * are set (this month, ranked as the competition is), otherwise all time by multiplier.
 * The competition view (this month + the competition's ranking) applies one-per-player and
 * carries each place's prize; other views list every approved win, no prizes.
 */
async function board(sortParam, periodParam) {
  const settings = await settingsOf()
  const prized = hasPrizes(settings)
  const period = periodParam === 'all' || periodParam === 'month' ? periodParam : prized ? 'month' : 'all'
  const sort = sortParam === 'multi' || sortParam === 'payout' ? sortParam : prized ? settings.rankBy : 'multi'
  const key = monthKey()
  const isCompetition = prized && period === 'month' && sort === settings.rankBy
  let rows
  if (isCompetition) rows = (await standings(key, settings)).map(({ win, prize }) => ({ ...shown(win), prize }))
  else {
    const since = period === 'month' ? monthRange(key).start : 0
    rows = (await list())
      .filter((w) => w.status === 'approved' && w.at >= since)
      .sort(ORDER[sort])
      .map(shown)
  }
  return {
    wins: rows.slice(0, BOARD_SIZE),
    total: rows.length,
    sort,
    period,
    isCompetition,
    competition: prized
      ? { prizes: settings.prizes, pool: poolOf(settings), rankBy: settings.rankBy, onePerPlayer: settings.onePerPlayer, endsAt: monthRange(key).end }
      : null,
  }
}

// ---------------------------------------------------------------- the admin's side

async function edit(id, fn) {
  let after = null
  await save((l) => {
    const i = l.findIndex((w) => w.id === id)
    if (i < 0) throw new InputError('That win no longer exists.', 404)
    after = fn({ ...l[i] })
    l[i] = after
    return l
  })
  return after
}

const countsOf = (rows) => ({
  pending: rows.filter((w) => w.status === 'pending').length,
  approved: rows.filter((w) => w.status === 'approved').length,
  rejected: rows.filter((w) => w.status === 'rejected').length,
})

async function adminAct(id, action, body, admin) {
  const t = nowSeconds()
  if (action === 'remove') {
    let gone = null
    await save((l) => {
      gone = l.find((w) => w.id === id) ?? null
      if (!gone) throw new InputError('That win no longer exists.', 404)
      return l.filter((w) => w.id !== id)
    })
    return { win: null, text: `Removed ${gone.player}’s win ${gone.slot.name} ${x(gone.multiplier)}` }
  }
  // the slot is looked up before the write, so a bad name changes nothing
  const slot = action === 'edit' && body?.slot ? await slotFrom(body.slot) : null
  let text = ''
  const win = await edit(id, (w) => {
    const what = `${w.player}’s win ${w.slot.name} ${x(w.multiplier)} (${usd(w.payout)})`
    if (action === 'approve') {
      if (w.status !== 'pending') throw new InputError('Only a waiting win can be approved. Undo it first.', 409)
      text = `Approved ${what}`
      return { ...w, status: 'approved', decidedAt: t, decidedBy: admin, adminNote: '' }
    }
    if (action === 'reject') {
      if (w.status !== 'pending') throw new InputError('Only a waiting win can be rejected.', 409)
      const note = String(body?.note ?? '').trim().slice(0, 200) || 'Turned down.'
      text = `Rejected ${what}: ${note}`
      return { ...w, status: 'rejected', decidedAt: t, decidedBy: admin, adminNote: note }
    }
    if (action === 'undo') {
      if (w.status !== 'approved' && w.status !== 'rejected') throw new InputError('Only an approved or rejected win can be undone.', 409)
      text = `Undid the decision on ${what}`
      return { ...w, status: 'pending', decidedAt: null, decidedBy: null, adminNote: '' }
    }
    // edit: an admin fixes a typo in the numbers or the slot
    const bet = body?.bet != null && body.bet !== '' ? numberIn(body.bet, BET, 'bet size') : w.bet
    const multiplier = body?.multiplier != null && body.multiplier !== '' ? numberIn(body.multiplier, MULTI, 'multiplier') : w.multiplier
    text = `Edited ${w.player}’s win ${w.slot.name}: ${usd(w.bet)} × ${x(w.multiplier)} → ${usd(bet)} × ${x(multiplier)}${slot ? ` (slot: ${slot.name})` : ''}`
    return { ...w, bet, multiplier, payout: round2(bet * multiplier), slot: slot ?? w.slot }
  })
  return { win, text }
}

// ---------------------------------------------------------------- routes

export async function handle(req, ctx) {
  const { path, method, body, user } = ctx
  const isPublic = path === '/api/big-wins' || path.startsWith('/api/big-wins/')
  const isAdmin = path === '/api/admin/big-wins' || path.startsWith('/api/admin/big-wins/')
  if (!isPublic && !isAdmin) return null
  try {
    if (path === '/api/big-wins') {
      if (method === 'GET') {
        return json(200, await board(ctx.url.searchParams.get('sort'), ctx.url.searchParams.get('period')))
      }
      if (method !== 'POST') return json(405, { error: 'Use GET or POST.' })
      const win = await submit(user, body ?? {})
      notifyAdmins(req, {
        title: `New big win: ${win.slot.name} ${x(win.multiplier)}`,
        tab: 'big-wins',
        color: COLORS.win,
        fields: [
          ['Player', win.kick ?? win.player],
          ['Rainbet', win.rainbet],
          ['Bet', usd(win.bet)],
          ['Multiplier', x(win.multiplier)],
          ['Payout', usd(win.payout)],
          ['Bet link', win.proof, false],
          ['Note', win.note, false],
        ],
      })
      return json(200, { win: mine(win), wins: await mineOf(user.id) })
    }
    if (path === '/api/big-wins/mine') {
      if (!user) return json(200, { wins: [] })
      return json(200, { wins: await mineOf(user.id) })
    }
    const cancel = /^\/api\/big-wins\/([\w-]{1,20})\/cancel$/.exec(path)
    if (cancel) {
      if (method !== 'POST') return json(405, { error: 'Use POST.' })
      if (!user) throw new InputError('Sign in first.', 401)
      await edit(cancel[1], (w) => {
        if (w.userId !== user.id) throw new InputError('That isn’t your win.', 403)
        if (w.status !== 'pending') throw new InputError('Only a waiting win can be withdrawn.', 409)
        return { ...w, status: 'cancelled', decidedAt: nowSeconds() }
      })
      return json(200, { wins: await mineOf(user.id) })
    }
    if (isPublic) return json(404, { error: 'Not found.' })

    // admin (api.js only lets admins this far)
    const admin = String(user?.kick?.username ?? user?.discord?.name ?? 'admin').slice(0, 40)
    if (path === '/api/admin/big-wins') {
      if (method !== 'GET') return json(405, { error: 'Use GET.' })
      const status = ctx.url.searchParams.get('status') || 'pending'
      const rows = await list()
      const wins = rows
        .filter((w) => (status === 'all' ? w.status !== 'cancelled' : w.status === status))
        // waiting: oldest first; the rest newest decided first
        .sort((a, b) => (status === 'pending' ? a.at - b.at : (b.decidedAt ?? b.at) - (a.decidedAt ?? a.at)))
        .slice(0, 300)
      return json(200, { wins, counts: countsOf(rows) })
    }
    if (path === '/api/admin/big-wins/settings') {
      if (method === 'GET') return json(200, { settings: await settingsOf() })
      if (method !== 'POST') return json(405, { error: 'Use GET or POST.' })
      const raw = Array.isArray(body?.prizes) ? body.prizes : []
      if (raw.length > MAX_PLACES) throw new InputError(`Prizes go up to ${MAX_PLACES} places.`)
      for (const p of raw) {
        const n = Number(p)
        if (p !== '' && p != null && (!Number.isFinite(n) || n < 0 || n > MAX_PRIZE)) throw new InputError(`Each prize must be between $0 and $${MAX_PRIZE.toLocaleString('en-US')}.`)
      }
      const settings = normalizeSettings({ prizes: raw.map((p) => (p === '' || p == null ? 0 : Number(p))), rankBy: body?.rankBy, onePerPlayer: body?.onePerPlayer })
      await update(SETTINGS, () => settings, null)
      logActivity({
        actor: admin,
        kind: 'wins',
        text: hasPrizes(settings)
          ? `Set Biggest Wins prizes: ${usd(poolOf(settings))} over ${settings.prizes.length} place${settings.prizes.length === 1 ? '' : 's'}, by ${settings.rankBy === 'payout' ? 'payout' : 'multiplier'}${settings.onePerPlayer ? ', one win per player' : ''}`
          : 'Turned off Biggest Wins prizes',
      })
      return json(200, { settings })
    }
    if (path === '/api/admin/big-wins/results') {
      if (method !== 'GET') return json(405, { error: 'Use GET.' })
      const settings = await settingsOf()
      const asked = ctx.url.searchParams.get('month') ?? ''
      const key = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : monthKey()
      const rows = await standings(key, settings)
      return json(200, {
        month: key,
        current: monthKey(),
        previous: prevMonthKey(monthKey()),
        settings,
        standings: rows.slice(0, Math.max(settings.prizes.length, 10)),
        total: rows.length,
      })
    }
    const m = /^\/api\/admin\/big-wins\/([\w-]{1,20})\/(approve|reject|undo|edit|remove)$/.exec(path)
    if (!m) return json(404, { error: 'Not found.' })
    if (method !== 'POST') return json(405, { error: 'Use POST.' })
    const { win, text } = await adminAct(m[1], m[2], body, admin)
    if (text) logActivity({ actor: admin, kind: 'wins', text })
    const rows = await list()
    return json(200, { win: win ? rows.find((w) => w.id === win.id) ?? null : null, counts: countsOf(rows) })
  } catch (err) {
    if (err instanceof InputError) return json(err.status, { error: err.message })
    throw err
  }
}
