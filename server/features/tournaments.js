// Slot tournaments: single-elimination brackets of 4, 8, 16 or 32 players, each
// on a slot. The admin enters both players' multipliers and decides the match:
// the higher multiplier goes through (a tie goes to player 1). Undoing a result
// also clears every round it fed. Bracket maths: src/bracket.js (shared with
// the browser).
//
//   GET  /api/events/tournaments                     published ones (not drafts), newest first
//                                                    → { tournaments, current } (current: the first live one)
//   GET  /api/admin/tournaments                      → { tournaments } (all, drafts too)
//   POST /api/admin/tournaments                      { name, prize, size } → a new draft
//   POST /api/admin/tournaments/<id>                 { name?, prize?, status?: 'draft'|'live', matches? }
//   POST /api/admin/tournaments/<id>/decide          { matchId, mult1?, mult2? } → decide on the multipliers
//   POST /api/admin/tournaments/<id>/reset           { matchId } → undo, unwinding later rounds
//   POST /api/admin/tournaments/<id>/delete
//
// status: draft (hidden) → live → complete. Complete is derived: the final has
// a winner (undoing the final makes it live again). Every save is rebuilt onto
// the bracket skeleton for its size and settled, so a bracket is always
// consistent whatever the browser sends. Results of a published tournament
// are announced in Kick chat (server/kick/bot.js).

import { randomBytes } from 'node:crypto'
import { json, nowSeconds } from '../http.js'
import { read, update } from '../store.js'
import { sendChat } from '../kick/bot.js'
import {
  buildBracket,
  championOf,
  decideMatch,
  isBracketSize,
  loserOf,
  resetMatch,
  roundLabel,
  roundsIn,
  settle,
  winnerOf,
  fmtMult,
} from '../../src/bracket.js'

const TABLE = 'tournaments'

class InputError extends Error {}

function text(raw, label, max, required = true) {
  const v = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  if (required && !v) throw new InputError(`${label} is required.`)
  if (v.length > max) throw new InputError(`${label} is too long (${max} characters at most).`)
  return v
}

const clip = (raw, max) => (typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const safeSlug = (raw) => (typeof raw === 'string' && /^[a-z0-9][a-z0-9-]{0,119}$/i.test(raw) ? raw : null)
const safeImage = (raw) => {
  if (typeof raw !== 'string' || raw.length > 600) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

function cleanPlayer(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const p = { name: clip(r.name, 40), slot: clip(r.slot, 60) }
  const slug = safeSlug(r.slug)
  const provider = clip(r.provider, 60)
  const image = safeImage(r.image)
  if (slug) p.slug = slug
  if (provider) p.provider = provider
  if (image) p.image = image
  return p
}

const multiplier = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : null
}

/** The browser's bracket rebuilt onto the skeleton for this size, then settled */
function cleanBracket(t, input) {
  if (!Array.isArray(input)) throw new InputError('Send the whole bracket.')
  const byId = new Map()
  for (const e of input) if (e && typeof e === 'object' && typeof e.id === 'string') byId.set(e.id, e)
  return settle(
    buildBracket(t.size).map((base) => {
      const raw = byId.get(base.id)
      if (!raw) throw new InputError('That bracket does not match this tournament.')
      return {
        ...base,
        player1: cleanPlayer(raw.player1),
        player2: cleanPlayer(raw.player2),
        mult1: multiplier(raw.mult1),
        mult2: multiplier(raw.mult2),
        winner: raw.winner === 'p1' || raw.winner === 'p2' ? raw.winner : null,
      }
    }),
  )
}

/** Complete follows the final; a draft stays a draft */
function withStatus(t) {
  const done = championOf(t.matches) !== null
  const status = t.status === 'draft' ? 'draft' : done ? 'complete' : 'live'
  return { ...t, status, completedAt: status === 'complete' ? (t.completedAt ?? nowSeconds()) : null, updatedAt: nowSeconds() }
}

const newId = () => randomBytes(5).toString('hex')

/** Kick chat lines for matches decided by this save (published tournaments only) */
function announcements(before, after) {
  if (!before || after.status === 'draft') return []
  const was = new Map(before.matches.map((m) => [m.id, m.winner]))
  const rounds = roundsIn(after.matches)
  const lines = []
  for (const m of after.matches) {
    if (!m.winner || was.get(m.id) === m.winner) continue
    const w = winnerOf(m)
    const l = loserOf(m)
    const wm = m.winner === 'p1' ? m.mult1 : m.mult2
    const lm = m.winner === 'p1' ? m.mult2 : m.mult1
    const next = m.round + 1 < rounds ? ` and advances to the ${roundLabel(m.round + 1, rounds)}` : ''
    lines.push(`Match result: ${w.name} (${fmtMult(wm)}) beats ${l.name} (${fmtMult(lm)})${next}.`)
  }
  if (after.status === 'complete' && before.status !== 'complete') {
    const champ = championOf(after.matches)
    lines.push(`${champ.name} wins ${after.name}!${after.prize ? ` Prize: ${after.prize}.` : ''}`)
  }
  return lines
}

const announce = (lines) => {
  if (!lines.length) return
  ;(async () => {
    for (const line of lines) await sendChat(line)
  })().catch(() => {})
}

const newestFirst = (list) => [...list].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

export function publicTournaments(list) {
  const tournaments = newestFirst(list).filter((t) => t.status !== 'draft')
  return { tournaments, current: tournaments.find((t) => t.status === 'live') ?? null }
}

export async function handle(req, ctx) {
  const { path, method, body } = ctx

  if (path === '/api/events/tournaments') {
    if (method !== 'GET') return json(405, { error: 'Use GET.' })
    return json(200, publicTournaments(await read(TABLE, [])))
  }

  const m = path.match(/^\/api\/admin\/tournaments(?:\/([a-z0-9]+)(?:\/([a-z]+))?)?\/?$/)
  if (!m) return null
  const [, id, action] = m

  try {
    if (!id) {
      if (method === 'GET') return json(200, { tournaments: newestFirst(await read(TABLE, [])) })
      if (method !== 'POST') return json(405, { error: 'Use GET or POST.' })
      const size = Number(body.size)
      if (!isBracketSize(size)) throw new InputError('Pick 4, 8, 16 or 32 players.')
      const t = {
        id: newId(),
        name: text(body.name, 'Name', 60),
        prize: text(body.prize, 'Prize', 40, false),
        size,
        status: 'draft',
        matches: buildBracket(size),
        createdAt: nowSeconds(),
        updatedAt: nowSeconds(),
        completedAt: null,
      }
      const list = await update(TABLE, (all) => [t, ...all], [])
      return json(200, { tournament: t, tournaments: newestFirst(list) })
    }

    if (method !== 'POST') return json(405, { error: 'Use POST.' })
    let before = null
    let after = null
    const list = await update(
      TABLE,
      (all) => {
        const i = all.findIndex((t) => t.id === id)
        if (i < 0) throw new InputError('That tournament no longer exists.')
        if (action === 'delete') return all.filter((_, j) => j !== i)
        before = all[i]
        const t = { ...before }
        if (!action) {
          if ('name' in body) t.name = text(body.name, 'Name', 60)
          if ('prize' in body) t.prize = text(body.prize, 'Prize', 40, false)
          if ('matches' in body) t.matches = cleanBracket(t, body.matches)
          if ('status' in body) {
            if (body.status !== 'draft' && body.status !== 'live') throw new InputError('Status is draft or live.')
            t.status = body.status
          }
        } else if (action === 'decide' || action === 'reset') {
          let match = t.matches.find((x) => x.id === body.matchId)
          if (!match) throw new InputError('No such match.')
          if (action === 'decide') {
            // the multipliers can come with the decision (a stream-deck button, curl)
            if (!match.winner && ('mult1' in body || 'mult2' in body)) {
              match = {
                ...match,
                mult1: 'mult1' in body ? multiplier(body.mult1) : match.mult1,
                mult2: 'mult2' in body ? multiplier(body.mult2) : match.mult2,
              }
              t.matches = t.matches.map((x) => (x.id === match.id ? match : x))
            }
            if (match.winner) throw new InputError('That match is already decided. Reset it first.')
            if (!match.player1.name || !match.player2.name) throw new InputError('Both players are needed first.')
            if (match.mult1 === null || match.mult2 === null) throw new InputError('Enter both multipliers first.')
            t.matches = decideMatch(t.matches, match.id)
          } else t.matches = resetMatch(t.matches, match.id)
        } else throw new InputError('Unknown action.')
        after = withStatus(t)
        all[i] = after
        return all
      },
      [],
    )
    if (after) announce(announcements(before, after))
    return json(200, { tournament: after, tournaments: newestFirst(list) })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    throw err
  }
}
