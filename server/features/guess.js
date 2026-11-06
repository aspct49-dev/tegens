// Guess the Balance (ported from King Kulbik, moved to Kick chat). A round opens
// (optionally on a bonus hunt), chat guesses with `!guess <amount>`, the round
// locks when the opening starts, and the admin draws it on the final balance:
// the closest guess wins, ties going to whoever guessed earlier.
//
// One guess per Kick account (keyed by Kick user id, so a signed-in site user
// with Kick linked shares the same slot); a new guess replaces the old one. The
// bot announces the round opening, locking and the winner, never each guess.
// Rounds are stored newest first in the guesses table; only one is open at a time.
//
//   GET  /api/events/guess                 { round }   the current round (guesses hidden until the draw)
//   POST /api/events/guess                 { value }   a signed-in site user's guess → { round }
//   GET  /api/admin/guess                  { rounds, hunts }   every guess, sorted
//   POST /api/admin/guess                  { name, prize, huntId }   create + open (closes any other open round)
//   POST /api/admin/guess/<id>             { status?: 'open' | 'closed', name?, prize?, huntId? }
//   POST /api/admin/guess/<id>/draw        { finalBalance }
//   POST /api/admin/guess/<id>/remove      { key }
//   POST /api/admin/guess/<id>/delete

import { randomBytes } from 'node:crypto'
import { onChat, parseCommand } from '../chatbus.js'
import { displayName } from '../auth.js'
import { json } from '../http.js'
import { sendChat } from '../kick/bot.js'
import { read, update } from '../store.js'
import { huntMoney, huntStats } from './huntStats.js'

class InputError extends Error {}

const newId = () => randomBytes(6).toString('hex')
const MAX_GUESS = 1_000_000_000
const TOP = 10

const text = (v, label, max, required = true) => {
  const s = String(v ?? '').trim().slice(0, max)
  if (required && !s) throw new InputError(`${label} is required.`)
  return s
}

// ---------------------------------------------------------------- pure helpers (tested directly)

/**
 * A typed amount → a number of cents-rounded money, or null.
 *   "12500" "12,500" "$12,500.50" "12.5k" "$12.5K" "1.2m" "12 500" "€12.500,50"
 * A comma followed by exactly three digits is a thousands separator ("12,500");
 * otherwise a lone comma is a decimal one ("12,5k"). With both, the last is the decimal.
 */
export function parseAmount(raw) {
  let s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '')
  s = s.replace(/^(usd|eur|gbp)|(usd|eur|gbp)$/g, '').replace(/[$€£]/g, '')
  const m = /^(\d[\d.,]*)(k|m)?$/.exec(s)
  if (!m) return null
  let digits = m[1]
  const hasDot = digits.includes('.')
  const hasComma = digits.includes(',')
  if (hasDot && hasComma) {
    const decimal = digits.lastIndexOf('.') > digits.lastIndexOf(',') ? '.' : ','
    const thousands = decimal === '.' ? ',' : '.'
    digits = digits.split(thousands).join('').replace(decimal, '.')
  } else if (hasComma) {
    const groups = digits.split(',')
    if (groups.slice(1).every((g) => g.length === 3)) digits = groups.join('')
    else if (groups.length === 2) digits = groups.join('.')
    else return null
  } else if (hasDot && digits.split('.').length > 2) {
    const groups = digits.split('.')
    if (!groups.slice(1).every((g) => g.length === 3)) return null
    digits = groups.join('')
  }
  if (!/^\d+(\.\d+)?$/.test(digits)) return null
  const value = Number(digits) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1)
  if (!Number.isFinite(value) || value <= 0 || value > MAX_GUESS) return null
  return Math.round(value * 100) / 100
}

/** Closest to the final balance first; ties go to whoever guessed earlier */
export function rankGuesses(guesses, finalBalance) {
  if (finalBalance == null) return []
  return guesses
    .map((g) => ({ ...g, offBy: Math.round(Math.abs(g.value - finalBalance) * 100) / 100 }))
    .sort((a, b) => a.offBy - b.offBy || a.at - b.at)
    .map((g, i) => ({ ...g, place: i + 1 }))
}

/** Add or replace one account's guess (returns a new list) */
export function placeGuess(guesses, guess) {
  return [...guesses.filter((g) => g.key !== guess.key), guess]
}

/** The current round: the open one, else the newest that isn't drawn, else the newest */
export const currentRound = (rounds) => rounds.find((r) => r.status === 'open') ?? rounds.find((r) => r.status !== 'drawn') ?? rounds[0] ?? null

// ---------------------------------------------------------------- views

async function huntSummary(huntId) {
  if (!huntId) return null
  const hunt = (await read('hunts', [])).find((h) => h.id === huntId)
  if (!hunt) return null
  const s = huntStats(hunt)
  return {
    id: hunt.id,
    number: hunt.number ?? null,
    name: hunt.name,
    status: hunt.status,
    currency: hunt.currency ?? 'USD',
    startBalance: hunt.startBalance,
    count: s.count,
    opened: s.opened,
    totalWon: s.totalWon,
    breakEven: s.breakEven,
  }
}

const publicGuess = (g) => ({ username: g.username, value: g.value, offBy: g.offBy, place: g.place, via: g.via })

/** What the public page and the overlay get: other people's guesses stay hidden until the draw */
async function publicRound(user) {
  const round = currentRound(await read('guesses', []))
  if (!round) return null
  const key = user ? userKey(user) : null
  const mine = key ? round.guesses.find((g) => g.key === key) : null
  const ranked = rankGuesses(round.guesses, round.status === 'drawn' ? round.finalBalance : null)
  return {
    id: round.id,
    name: round.name,
    prize: round.prize,
    status: round.status,
    count: round.guesses.length,
    finalBalance: round.status === 'drawn' ? round.finalBalance : null,
    createdAt: round.createdAt,
    openedAt: round.openedAt ?? null,
    closedAt: round.closedAt ?? null,
    drawnAt: round.drawnAt ?? null,
    hunt: await huntSummary(round.huntId),
    winner: ranked[0] ? publicGuess(ranked[0]) : null,
    top: ranked.slice(0, TOP).map(publicGuess),
    mine: mine ? { value: mine.value, at: mine.at, via: mine.via, place: ranked.find((g) => g.key === key)?.place ?? null } : null,
  }
}

/** Admin: every guess, closest first once drawn, otherwise lowest to highest */
function adminRound(round) {
  const ranked = rankGuesses(round.guesses, round.status === 'drawn' ? round.finalBalance : null)
  return { ...round, guesses: ranked.length ? ranked : [...round.guesses].sort((a, b) => a.value - b.value || a.at - b.at) }
}

// ---------------------------------------------------------------- guessing

/** One slot per Kick account; site users without Kick get one per site account */
function userKey(user) {
  return user.kick?.id ? `kick:${user.kick.id}` : `acct:${user.id}`
}

/** Put a guess on the open round; returns the round, or null when nothing is open */
async function guessOnOpenRound(guess) {
  let placed = null
  await update(
    'guesses',
    (rounds) => {
      const round = rounds.find((r) => r.status === 'open')
      if (!round) return rounds
      round.guesses = placeGuess(round.guesses, guess)
      placed = round
      return rounds
    },
    [],
  )
  return placed
}

// !guess <amount> in Kick chat: silent (the bot never replies per guess)
onChat('guess', async (msg) => {
  const cmd = parseCommand(msg.text)
  if (cmd?.command !== 'guess') return
  // "12 500" splits into two args; "12,500 pls" keeps only the first
  const value = parseAmount(cmd.args.join('')) ?? parseAmount(cmd.args[0])
  if (value == null) return
  const rounds = await read('guesses', [])
  if (!rounds.some((r) => r.status === 'open')) return
  const kickId = msg.kickId != null && msg.kickId !== '' ? String(msg.kickId) : null
  await guessOnOpenRound({
    key: kickId ? `kick:${kickId}` : `name:${msg.username.toLowerCase()}`,
    kickId,
    username: String(msg.username).slice(0, 40),
    value,
    at: Date.now(), // arrival order, the same clock as site guesses (the tie-break)
    via: 'chat',
  })
})

// ---------------------------------------------------------------- bot lines

const chatMoney = (hunt, v) => huntMoney(v, hunt?.currency ?? 'USD').replace(/\.00$/, '')

function announceOpen(round) {
  const prize = round.prize ? ` for ${round.prize}` : ''
  void sendChat(`Guess the Balance is OPEN${prize}! Type !guess <amount> in chat, e.g. !guess 12,500. One guess each: your latest one counts.`)
}

function announceLocked(round) {
  const n = round.guesses.length
  void sendChat(`Guesses are LOCKED: ${n.toLocaleString('en-US')} ${n === 1 ? 'guess' : 'guesses'} in. Good luck!`)
}

async function announceWinner(round) {
  const hunt = await huntSummary(round.huntId)
  const final = chatMoney(hunt, round.finalBalance)
  const [winner] = rankGuesses(round.guesses, round.finalBalance)
  if (!winner) return void sendChat(`The final balance is ${final}. No guesses this round.`)
  const prize = round.prize ? ` and wins ${round.prize}` : ''
  const off = winner.offBy === 0 ? 'spot on' : `off by ${chatMoney(hunt, winner.offBy)}`
  void sendChat(`The final balance is ${final}! @${winner.username} guessed ${chatMoney(hunt, winner.value)} (${off})${prize}. GG!`)
}

// ---------------------------------------------------------------- rounds

/** Create a round and open it (any other open round stops); the bot announces it */
async function openRound({ name, prize = '', huntId = null }) {
  const now = Date.now()
  const round = {
    id: newId(),
    name,
    prize,
    huntId,
    status: 'open',
    guesses: [],
    finalBalance: null,
    createdAt: now,
    openedAt: now,
    closedAt: null,
    drawnAt: null,
  }
  // one round takes guesses at a time: any other open round stops
  await update('guesses', (list) => [round, ...list.map((r) => (r.status === 'open' ? { ...r, status: 'closed', closedAt: now } : r))], [])
  announceOpen(round)
  return round
}

/** A new bonus hunt (hunts.js): its Guess the Balance round opens in chat */
export async function openRoundForHunt(hunt, prize = '') {
  const name = (hunt.number ? `Hunt #${hunt.number}` : hunt.name).slice(0, 60)
  return openRound({ name, prize: String(prize ?? '').trim().slice(0, 40), huntId: hunt.id })
}

/** The hunt's opening started (hunts.js): its open round locks, chat can't guess any more */
export async function lockRoundForHunt(huntId) {
  let locked = null
  await update(
    'guesses',
    (list) => {
      const round = list.find((r) => r.status === 'open' && r.huntId === huntId)
      if (round) {
        Object.assign(round, { status: 'closed', closedAt: Date.now() })
        locked = structuredClone(round)
      }
      return list
    },
    [],
  )
  if (locked) announceLocked(locked)
  return locked
}

// ---------------------------------------------------------------- handler

async function huntIdFrom(v) {
  if (v === null || v === undefined || v === '') return null
  const id = String(v)
  if (!(await read('hunts', [])).some((h) => h.id === id)) throw new InputError('That hunt no longer exists.')
  return id
}

async function adminView() {
  const rounds = await read('guesses', [])
  const hunts = (await read('hunts', [])).map((h) => {
    const s = huntStats(h)
    return { id: h.id, number: h.number ?? null, name: h.name, status: h.status, currency: h.currency ?? 'USD', startBalance: h.startBalance, count: s.count, opened: s.opened, totalWon: s.totalWon }
  })
  return { rounds: rounds.map(adminRound), hunts }
}

export async function handle(req, ctx) {
  const { path, method, body, user } = ctx
  if (path !== '/api/events/guess' && path !== '/api/admin/guess' && !path.startsWith('/api/admin/guess/')) return null

  try {
    // ---- public
    if (path === '/api/events/guess') {
      if (method === 'POST') {
        if (!user) return json(401, { error: 'Sign in to guess.' })
        const value = parseAmount(body.value)
        if (value == null) throw new InputError('Enter a balance, e.g. 12,500 or 12.5k.')
        const placed = await guessOnOpenRound({
          key: userKey(user),
          kickId: user.kick?.id ? String(user.kick.id) : null,
          username: displayName(user).slice(0, 40),
          value,
          at: Date.now(),
          via: 'site',
        })
        if (!placed) throw new InputError('Guesses are closed right now.')
      }
      return json(200, { round: await publicRound(user) })
    }

    // ---- admin
    if (path === '/api/admin/guess' && method === 'GET') return json(200, await adminView())
    if (method !== 'POST') return json(405, { error: 'Use POST.' })

    if (path === '/api/admin/guess') {
      await openRound({ name: text(body.name, 'Name', 60), prize: text(body.prize, 'Prize', 40, false), huntId: await huntIdFrom(body.huntId) })
      return json(200, await adminView())
    }

    const [, id, action] = /^\/api\/admin\/guess\/([\w-]+)(?:\/(\w+))?$/.exec(path) ?? []
    if (!id) return json(404, { error: 'Not found.' })
    const huntId = !action && 'huntId' in body ? await huntIdFrom(body.huntId) : undefined
    let event = null
    let changed = null
    await update(
      'guesses',
      (list) => {
        const round = list.find((r) => r.id === id)
        if (!round) throw new InputError('That round no longer exists.')
        const now = Date.now()
        if (action === 'delete') return list.filter((r) => r.id !== id)
        if (action === 'draw') {
          const final = Number(body.finalBalance)
          if (body.finalBalance === '' || body.finalBalance == null || !Number.isFinite(final) || final < 0 || final > MAX_GUESS) throw new InputError('Enter the final balance.')
          round.finalBalance = Math.round(final * 100) / 100
          round.status = 'drawn'
          round.closedAt ??= now
          round.drawnAt = now
          event = 'drawn'
        } else if (action === 'remove') {
          const before = round.guesses.length
          round.guesses = round.guesses.filter((g) => g.key !== String(body.key ?? ''))
          if (round.guesses.length === before) throw new InputError('That guess is already gone.')
        } else if (!action) {
          if ('name' in body) round.name = text(body.name, 'Name', 60)
          if ('prize' in body) round.prize = text(body.prize, 'Prize', 40, false)
          if (huntId !== undefined) round.huntId = huntId
          if ('status' in body) {
            if (body.status !== 'open' && body.status !== 'closed') throw new InputError('Status is open or closed.')
            if (body.status !== round.status) {
              if (body.status === 'open') {
                for (const r of list) if (r !== round && r.status === 'open') Object.assign(r, { status: 'closed', closedAt: now })
                Object.assign(round, { status: 'open', openedAt: now, closedAt: null, finalBalance: null, drawnAt: null })
                event = 'opened'
              } else {
                const wasOpen = round.status === 'open'
                Object.assign(round, { status: 'closed', closedAt: wasOpen ? now : round.closedAt, finalBalance: null, drawnAt: null })
                if (wasOpen) event = 'locked'
              }
            }
          }
        } else throw new InputError('Unknown action.')
        changed = structuredClone(round)
        return list
      },
      [],
    )
    if (event === 'opened') announceOpen(changed)
    else if (event === 'locked') announceLocked(changed)
    else if (event === 'drawn') await announceWinner(changed)
    return json(200, await adminView())
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    throw err
  }
}
