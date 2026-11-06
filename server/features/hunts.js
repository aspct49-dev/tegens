// Bonus hunts (ported from King Kulbik). A hunt collects bonuses, then opens
// them one by one; the maths lives in ./huntStats.js so the pages share it.
// Stored newest first in the hunts table.
//
//   GET  /api/events/hunt               { hunt, stats }   the newest hunt (null when none)
//   GET  /api/admin/hunts               { hunts }
//   POST /api/admin/hunts               { name, startBalance, currency, guess?, guessPrize? }   → { hunt, hunts }
//                                       (guess: false skips opening its Guess the Balance round)
//
// Guess the Balance follows the hunt: creating one opens its round in chat (!guess),
// and moving it from collecting to opening locks the guesses (./guess.js).
//   POST /api/admin/hunts/<id>          the whole hunt (name, startBalance, currency, status, bonuses) → { hunt, hunts }
//   POST /api/admin/hunts/<id>/delete   → { hunts }

import { randomBytes } from 'node:crypto'
import { json } from '../http.js'
import { read, update } from '../store.js'
import { lockRoundForHunt, openRoundForHunt } from './guess.js'
import { HUNT_CURRENCIES, HUNT_STATUSES, huntStats } from './huntStats.js'

class InputError extends Error {}

const newId = () => randomBytes(6).toString('hex')

const text = (v, label, max, required = true) => {
  const s = String(v ?? '').trim().slice(0, max)
  if (required && !s) throw new InputError(`${label} is required.`)
  return s
}

const money = (v, label, max = 100_000_000) => {
  const n = Number(v)
  if (v === '' || v == null || !Number.isFinite(n) || n < 0 || n > max) throw new InputError(`${label} must be between 0 and ${max.toLocaleString('en-US')}.`)
  return Math.round(n * 100) / 100
}

/** Only art we'd put on a public page: our own files or the slot catalog's CDN */
function safeImage(v) {
  const s = String(v ?? '').trim()
  if (/^\/assets\/[\w./-]+$/.test(s) && !s.includes('..')) return s
  if (/^https:\/\/mediumrare\.imgix\.net\/[\w./%-]+(\?[\w=&.%-]*)?$/.test(s)) return s
  return undefined
}

const safeSlug = (v) => {
  const s = String(v ?? '').trim()
  return /^[a-z0-9-]{1,120}$/.test(s) ? s : undefined
}

const currencyCode = (v) => {
  const code = String(v ?? 'USD').toUpperCase()
  if (!HUNT_CURRENCIES.includes(code)) throw new InputError('Pick a currency from the list.')
  return code
}

function normaliseBonus(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : newId()
  const payout = r.payout === null || r.payout === undefined || r.payout === '' ? null : money(r.payout, 'Payout')
  const slug = safeSlug(r.slug)
  const image = safeImage(r.image)
  const provider = text(r.provider, 'Provider', 40, false)
  const note = text(r.note, 'Note', 80, false)
  const badge = text(r.badge, 'Badge', 24, false)
  return {
    id,
    game: text(r.game, 'Slot', 60),
    slug: slug ?? null,
    image: image ?? null,
    provider: provider || null,
    bet: money(r.bet, 'Bet size', 1_000_000),
    payout,
    note: note || null,
    badge: badge || null,
  }
}

function normaliseHunt(body, current) {
  const status = HUNT_STATUSES.includes(body.status) ? body.status : current.status
  const bonuses = Array.isArray(body.bonuses) ? body.bonuses.slice(0, 300).map(normaliseBonus) : current.bonuses
  return {
    ...current,
    name: 'name' in body ? text(body.name, 'Name', 60) : current.name,
    startBalance: 'startBalance' in body ? money(body.startBalance, 'Start cost') : current.startBalance,
    currency: 'currency' in body ? currencyCode(body.currency) : current.currency,
    status,
    bonuses,
    updatedAt: Date.now(),
    finishedAt: status === 'finished' ? (current.finishedAt ?? Date.now()) : null,
  }
}

export async function handle(req, ctx) {
  const { path, method, body } = ctx
  if (path !== '/api/events/hunt' && path !== '/api/admin/hunts' && !path.startsWith('/api/admin/hunts/')) return null

  try {
    if (path === '/api/events/hunt') {
      const hunt = (await read('hunts', []))[0] ?? null
      return json(200, { hunt, stats: hunt ? huntStats(hunt) : null })
    }

    if (path === '/api/admin/hunts' && method === 'GET') return json(200, { hunts: await read('hunts', []) })
    if (method !== 'POST') return json(405, { error: 'Use POST.' })

    if (path === '/api/admin/hunts') {
      const hunt = {
        id: newId(),
        number: 0,
        name: text(body.name, 'Name', 60),
        startBalance: money(body.startBalance, 'Start cost'),
        currency: currencyCode(body.currency),
        status: 'collecting',
        bonuses: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        finishedAt: null,
      }
      const hunts = await update(
        'hunts',
        (list) => {
          // one after the highest number left (deleting the newest hunt frees its number)
          hunt.number = list.reduce((top, h) => Math.max(top, h.number ?? 0), 0) + 1
          return [hunt, ...list]
        },
        [],
      )
      // Guess the Balance opens with the hunt (chat: !guess <amount>) unless the admin unticked it
      if (body.guess !== false) await openRoundForHunt(hunts[0], body.guessPrize)
      return json(200, { hunt: hunts[0], hunts })
    }

    const [, id, action] = /^\/api\/admin\/hunts\/([\w-]+)(?:\/(\w+))?$/.exec(path) ?? []
    if (!id) return json(404, { error: 'Not found.' })
    let saved = null
    let wasStatus = null
    const hunts = await update(
      'hunts',
      (list) => {
        const i = list.findIndex((h) => h.id === id)
        if (i < 0) throw new InputError('That hunt no longer exists.')
        if (action === 'delete') return list.filter((_, j) => j !== i)
        if (action) throw new InputError('Unknown action.')
        wasStatus = list[i].status
        list[i] = saved = normaliseHunt(body, list[i])
        return list
      },
      [],
    )
    // the opening starts → guesses lock (the bot posts the count)
    if (saved && wasStatus === 'collecting' && saved.status !== 'collecting') await lockRoundForHunt(saved.id)
    return json(200, action === 'delete' ? { hunts } : { hunt: saved, hunts })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    throw err
  }
}
