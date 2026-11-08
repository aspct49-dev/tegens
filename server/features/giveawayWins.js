// Giveaway wins: a list the admin keeps by hand ("who won what"), shown on the public
// /giveaways page. Separate from the chat giveaway (./giveaway.js), which still runs
// the Kick-chat draw and the stream overlay; nothing here touches that.
//
//   GET  /api/events/giveaway-wins                 { wins, totals: { count, winners, paid, challenges, milestones, store, givenAway } }   newest first
//   GET  /api/admin/giveaway-wins/totals           { settings: { start, carried }, totals }
//   POST /api/admin/giveaway-wins/totals           { start }  the amount given away before this list → same
//
//   GET  /api/admin/giveaway-wins                  { wins }
//   POST /api/admin/giveaway-wins                  { winner, prize, amount?, at?, note?, source? }  → { win, wins }
//   POST /api/admin/giveaway-wins/<id>             same fields (any subset)                       → { win, wins }
//   POST /api/admin/giveaway-wins/<id>/remove                                                      → { removed, wins }
//
// Table `giveawayManualWins`: [{ id, winner, prize, amount, at, note, source, createdAt, createdBy, updatedAt }]
//   newest `at` first, at most 200.
//   winner: the name as shown (1-40 chars) · prize: text, e.g. "$25" or "PS5" (1-80 chars)
//   amount: a number in $ for the totals, or null · at: when it was won (unix seconds)
//   note: e.g. "Chat giveaway", "Bonus buy" (0-60 chars) · source: 'kick' | 'discord' | 'other' | null
// (The table `giveawayWins` belongs to the chat giveaway: players' profiles read it.)

import { randomBytes } from 'node:crypto'
import { json, nowSeconds } from '../http.js'
import { read, update } from '../store.js'

const TABLE = 'giveawayManualWins'
const MAX = 200
const MAX_AMOUNT = 10_000_000
const EARLIEST = Date.UTC(2020, 0, 1) / 1000
export const SOURCES = ['kick', 'discord', 'other']

class InputError extends Error {}

const newId = () => randomBytes(6).toString('base64url')

// ---------------------------------------------------------------- input

function text(v, { field, max, required = false }) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ')
  if (required && !s) throw new InputError(`Enter the ${field}.`)
  if (s.length > max) throw new InputError(`Keep the ${field} under ${max} characters.`)
  return s
}

/** "", null → null; "1,250.5" / "$25" / 25 → a number with at most 2 decimals */
export function cleanAmount(v) {
  if (v == null || String(v).trim() === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,$\s]/g, ''))
  if (!Number.isFinite(n) || n < 0) throw new InputError('The amount is a number of dollars, 0 or more.')
  if (n > MAX_AMOUNT) throw new InputError('That amount is too large.')
  return Math.round(n * 100) / 100
}

/** Unix seconds, milliseconds or a date string → unix seconds; missing → now. Not before 2020, not more than a day ahead. */
export function cleanAt(v, now = nowSeconds()) {
  if (v == null || v === '') return now
  let s
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    s = Number(v)
    if (s > 1e12) s = Math.floor(s / 1000) // milliseconds
  } else {
    s = Math.floor(Date.parse(String(v)) / 1000)
  }
  if (!Number.isFinite(s)) throw new InputError('That date isn’t valid.')
  if (s < EARLIEST) throw new InputError('That date is too far back.')
  if (s > now + 86400) throw new InputError('That date is in the future.')
  return Math.floor(s)
}

function cleanSource(v) {
  if (v == null || v === '') return null
  const s = String(v).trim().toLowerCase()
  if (!SOURCES.includes(s)) throw new InputError('Where was it won? kick, discord or other.')
  return s
}

/** A full or partial row from a request body. `partial`: only the fields that are present. */
export function cleanWin(body, { partial = false } = {}) {
  const out = {}
  const has = (k) => !partial || k in body
  if (has('winner')) out.winner = text(body.winner, { field: 'winner’s name', max: 40, required: true })
  if (has('prize')) out.prize = text(body.prize, { field: 'prize', max: 80, required: true })
  if (has('amount')) out.amount = cleanAmount(body.amount)
  if (has('at')) out.at = cleanAt(body.at)
  if (has('note')) out.note = text(body.note, { field: 'note', max: 60 })
  if (has('source')) out.source = cleanSource(body.source)
  return out
}

const byNewest = (a, b) => b.at - a.at || (b.createdAt ?? 0) - (a.createdAt ?? 0)

// ---------------------------------------------------------------- views

const list = () => read(TABLE, [])

/** What the public page sees: no admin names */
export function publicWin(w) {
  return { id: w.id, winner: w.winner, prize: w.prize, amount: w.amount ?? null, at: w.at, note: w.note || '', source: w.source ?? null }
}

const sumAmounts = (wins) => wins.reduce((n, w) => n + (Number.isFinite(w.amount) ? w.amount : 0), 0)
const cents = (n) => Math.round(n * 100) / 100

// The "Total given away" figure on /giveaways: a starting amount the admin sets (everything
// given away before this list existed) + the value of every win posted here + the reward of
// every completed slot challenge (table `challenges`, ./challenges.js: status 'completed')
// + every milestone reward paid (table `milestoneClaims`, written when a claim is paid or an
// admin marks a milestone claimed) + every approved store order (table `shopOrders`, its
// value read from the item's name: "50 USDC" → $50, "$250 Bonus Buy" → $250).
// Wins that fall off the end of the list (over MAX) are added to `carried` so the total never
// goes down. Undoing a paid milestone or an order takes it back off.
//   table `giveawayTotals`: { start, carried }
const TOTALS = 'giveawayTotals'
const DEFAULT_TOTALS = { start: 25_000, carried: 0 }
const readTotals = async () => ({ ...DEFAULT_TOTALS, ...(await read(TOTALS, DEFAULT_TOTALS)) })

const arr = (v) => (Array.isArray(v) ? v : [])

/** The rewards of completed slot challenges, in $ */
const challengesPaid = (list) => arr(list).reduce((n, c) => n + (c.status === 'completed' && Number.isFinite(c.reward) ? c.reward : 0), 0)

/** "$50", "$1,000 Bonus Buy", "$10K", "50 USDC", "1.5k USDC" → dollars; no amount in it → 0 */
export function dollarsIn(name) {
  const s = String(name ?? '')
  const m = /\$\s?([\d,]+(?:\.\d+)?)\s*(k)?\b/i.exec(s) ?? /([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:usdc|usdt|usd)\b/i.exec(s)
  if (!m) return 0
  const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Milestone rewards paid out, in $ */
const milestonesPaid = (rows) => arr(rows).reduce((n, r) => n + (Number.isFinite(r.prize) ? r.prize : 0), 0)

/** Approved store orders (both stores), in $ */
const storePaid = (orders) => arr(orders).reduce((n, o) => n + (o.status === 'approved' ? dollarsIn(o.itemName) : 0), 0)

export function totalsFor(wins, settings = DEFAULT_TOTALS, challenges = [], more = {}) {
  const paid = sumAmounts(wins)
  const fromChallenges = challengesPaid(challenges)
  const fromMilestones = milestonesPaid(more.milestoneClaims)
  const fromStore = storePaid(more.shopOrders)
  return {
    count: wins.length,
    winners: new Set(wins.map((w) => w.winner.toLowerCase())).size,
    paid: cents(paid),
    challenges: cents(fromChallenges),
    milestones: cents(fromMilestones),
    store: cents(fromStore),
    givenAway: cents((settings.start ?? 0) + (settings.carried ?? 0) + paid + fromChallenges + fromMilestones + fromStore),
  }
}

const readChallenges = () => read('challenges', [])
/** Everything the total needs besides the posted wins and the settings */
const readSources = async () => {
  const [challenges, milestoneClaims, shopOrders] = await Promise.all([readChallenges(), read('milestoneClaims', []), read('shopOrders', [])])
  return { challenges, more: { milestoneClaims, shopOrders } }
}
const totalsNow = async (wins, settings) => {
  const { challenges, more } = await readSources()
  return totalsFor(wins, settings, challenges, more)
}

// ---------------------------------------------------------------- writes

/** Add one row (newest first, at most MAX); rows pushed off the end still count in the total */
async function insertWin(row) {
  let dropped = []
  const wins = await update(
    TABLE,
    (l) => {
      const all = [row, ...l.filter((w) => w.id !== row.id)].sort(byNewest)
      dropped = all.slice(MAX)
      return all.slice(0, MAX)
    },
    [],
  )
  if (sumAmounts(dropped) > 0)
    await update(TOTALS, (s) => ({ ...DEFAULT_TOTALS, ...s, carried: cents((s?.carried ?? 0) + sumAmounts(dropped)) }), DEFAULT_TOTALS)
  return wins
}

/** "$50 Rainbet tip" → 50; anything else → null (the chat giveaway's value when none is given) */
export function amountFromPrize(prize) {
  const m = /^\s*\$\s?(\d[\d,]*(?:\.\d{1,2})?)/.exec(String(prize ?? ''))
  return m ? cleanAmount(m[1]) : null
}

/**
 * The chat giveaway (./giveaway.js) posts its winners here when its "post winners on the
 * Giveaways page" option is on: one row per draw, keyed by the draw id (`auto`).
 */
export async function postChatWin({ drawId, winner, prize, amount = null, at = nowSeconds() }) {
  const row = {
    id: `auto-${drawId}`,
    winner: String(winner).trim().slice(0, 40),
    prize: String(prize).trim().slice(0, 80),
    amount: amount ?? null,
    at,
    note: 'Chat giveaway',
    source: 'kick',
    auto: drawId,
    createdAt: nowSeconds(),
    createdBy: 'chat giveaway',
    updatedAt: null,
  }
  await insertWin(row)
  return row
}

/** Take chat-giveaway rows back off (a re-drawn winner, or a discarded test round) */
export async function removeChatWins(drawIds) {
  const ids = new Set(drawIds.filter(Boolean))
  if (!ids.size) return
  await update(TABLE, (l) => l.filter((w) => !ids.has(w.auto)), [])
}

// ---------------------------------------------------------------- routes

export async function handle(req, ctx) {
  const { path, method, body } = ctx
  try {
    if (path === '/api/events/giveaway-wins') {
      if (method !== 'GET') return json(405, { error: 'Use GET.' })
      const [wins, settings] = await Promise.all([list(), readTotals()])
      return json(200, { wins: wins.map(publicWin), totals: await totalsNow(wins, settings) })
    }

    // the starting amount of "Total given away"
    if (path === '/api/admin/giveaway-wins/totals') {
      if (method === 'GET') {
        const [wins, settings] = await Promise.all([list(), readTotals()])
        return json(200, { settings, totals: await totalsNow(wins, settings) })
      }
      if (method !== 'POST') return json(405, { error: 'Use GET or POST.' })
      const start = cleanAmount(body?.start)
      if (start == null) throw new InputError('Enter the starting amount in dollars.')
      const settings = await update(TOTALS, (s) => ({ ...DEFAULT_TOTALS, ...s, start }), DEFAULT_TOTALS)
      return json(200, { settings, totals: await totalsNow(await list(), settings) })
    }

    const m = /^\/api\/admin\/giveaway-wins(?:\/([\w-]{1,40})(?:\/(remove))?)?$/.exec(path)
    if (!m) return null
    const [, id, action] = m

    if (!id && method === 'GET') return json(200, { wins: await list() })
    if (method !== 'POST') return json(405, { error: 'Use POST.' })

    const actor = ctx.user?.kick?.username ?? ctx.user?.discord?.username ?? 'admin'

    if (!id) {
      const row = { id: newId(), ...cleanWin(body ?? {}), createdAt: nowSeconds(), createdBy: String(actor).slice(0, 40), updatedAt: null }
      const wins = await insertWin(row)
      return json(200, { win: row, wins })
    }

    if (action === 'remove') {
      let removed = null
      const wins = await update(
        TABLE,
        (l) => {
          removed = l.find((w) => w.id === id) ?? null
          if (!removed) throw new InputError('That win isn’t on the list any more.')
          return l.filter((w) => w.id !== id)
        },
        [],
      )
      return json(200, { removed: { winner: removed.winner, prize: removed.prize }, wins })
    }

    const changes = cleanWin(body ?? {}, { partial: true })
    let win = null
    const wins = await update(
      TABLE,
      (l) => {
        const i = l.findIndex((w) => w.id === id)
        if (i < 0) throw new InputError('That win isn’t on the list any more.')
        win = { ...l[i], ...changes, updatedAt: nowSeconds() }
        const next = [...l]
        next[i] = win
        return next.sort(byNewest)
      },
      [],
    )
    return json(200, { win, wins })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    throw err
  }
}
