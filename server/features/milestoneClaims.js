// Milestone claims: an admin looks a player up by their Rainbet username, sees which wager
// milestones they have reached, and marks the rewards paid out as claimed (or undoes it).
// The Milestones page shows a claimed tier as "Claimed" for that username.
//
//   GET  /api/content/milestone-claims?username=X     { claimed: [tierId] }   (public)
//   GET  /api/admin/milestones/lookup?username=X      { player: { name, found, wagered },
//                                                       tiers: [{ id, name, wager, prize, reached, claim }] }
//   GET  /api/admin/milestones/claims                 { claims, totals: { claims, paid, players } }  newest first
//   POST /api/admin/milestones/claim    { username, tier, note?, force? }   → the lookup again
//   POST /api/admin/milestones/unclaim  { username, tier }                  → the lookup again
//
// Table `milestoneClaims`: [{ key, name, tier, prize, at, by, note }]   key = lower-case Rainbet
// username; one row per (key, tier); times unix seconds. A tier that isn't reached yet can
// only be marked with force (e.g. paid early by hand).

import { config } from '../../src/config.js'
import { json, nowSeconds } from '../http.js'
import { lifetimeWager } from '../rainbet.js'
import { read, update } from '../store.js'

const TIERS = config.milestones.tiers
const MAX_ROWS = 20_000

class InputError extends Error {}

const keyOf = (name) => String(name ?? '').trim().toLowerCase()

function cleanName(raw) {
  const name = String(raw ?? '').trim()
  if (!name) throw new InputError('Enter a Rainbet username.')
  if (name.length > 40 || /[\s<>]/.test(name)) throw new InputError('That doesn’t look like a Rainbet username.')
  return name
}

async function lookup(username) {
  const name = cleanName(username)
  const [player, claims] = await Promise.all([lifetimeWager(name), read('milestoneClaims', [])])
  const key = keyOf(name)
  const mine = new Map(claims.filter((c) => c.key === key).map((c) => [c.tier, c]))
  return {
    player,
    tiers: TIERS.map((t) => {
      const c = mine.get(t.id)
      return {
        id: t.id,
        name: t.name,
        wager: t.wager,
        prize: t.prize,
        icon: t.icon,
        reached: player.wagered >= t.wager,
        claim: c ? { at: c.at, by: c.by, note: c.note } : null,
      }
    }),
  }
}

export async function handle(req, ctx) {
  const { path, method } = ctx
  try {
    if (path === '/api/content/milestone-claims' && method === 'GET') {
      const key = keyOf(ctx.url.searchParams.get('username'))
      if (!key) return json(200, { claimed: [] })
      const rows = await read('milestoneClaims', [])
      return json(200, { claimed: rows.filter((c) => c.key === key).map((c) => c.tier) })
    }
    if (!path.startsWith('/api/admin/milestones/')) return null

    if (path === '/api/admin/milestones/lookup' && method === 'GET') {
      return json(200, await lookup(ctx.url.searchParams.get('username')))
    }
    if (path === '/api/admin/milestones/claims' && method === 'GET') {
      const rows = await read('milestoneClaims', [])
      const list = [...rows].sort((a, b) => b.at - a.at)
      return json(200, {
        claims: list.slice(0, 200),
        totals: { claims: rows.length, paid: rows.reduce((t, c) => t + (c.prize ?? 0), 0), players: new Set(rows.map((c) => c.key)).size },
      })
    }
    if (method !== 'POST') return null

    if (path === '/api/admin/milestones/claim' || path === '/api/admin/milestones/unclaim') {
      const name = cleanName(ctx.body.username)
      const tier = TIERS.find((t) => t.id === ctx.body.tier)
      if (!tier) throw new InputError('Unknown milestone.')
      const key = keyOf(name)
      if (path.endsWith('/claim')) {
        const player = await lifetimeWager(name)
        if (player.wagered < tier.wager && !ctx.body.force)
          throw Object.assign(new InputError(`${player.name} hasn’t reached ${tier.name} yet. Mark it anyway only if it was paid.`), { status: 409 })
        const note = String(ctx.body.note ?? '').trim().slice(0, 140)
        await update(
          'milestoneClaims',
          (list) =>
            [
              ...list.filter((c) => !(c.key === key && c.tier === tier.id)),
              { key, name: player.name, tier: tier.id, prize: tier.prize, at: nowSeconds(), by: ctx.user?.kick?.username ?? ctx.user?.discord?.name ?? null, note },
            ].slice(-MAX_ROWS),
          [],
        )
      } else {
        await update('milestoneClaims', (list) => list.filter((c) => !(c.key === key && c.tier === tier.id)), [])
      }
      return json(200, await lookup(name))
    }
    return null
  } catch (err) {
    if (err instanceof InputError) return json(err.status ?? 400, { error: err.message })
    return json(502, { error: `Rainbet is unavailable right now (${err.message}).` })
  }
}
