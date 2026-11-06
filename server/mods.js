// Moderators: Kick accounts an admin lets into part of the admin panel. A mod can approve
// claims, milestone claims and Rainbet link requests, and run the stream tools; everything
// else under /api/admin/* stays admins-only.
// api.js asks modMayUse() before letting a mod through, so the limit is on the server, not
// just the menu. Admins themselves come from .env (auth.js isAdmin) and are never in here.
//
//   GET  /api/admin/mods                 → { mods }           admins only
//   POST /api/admin/mods { add: name }   → { mods }           a Kick username
//   POST /api/admin/mods { remove: name }→ { mods }
//
// Table `mods`: [{ kick (lower case), name (as typed), addedBy, at }]

import { isAdmin } from './auth.js'
import { logActivity } from './audit.js'
import { json, nowSeconds } from './http.js'
import { read, update } from './store.js'

const TABLE = 'mods'
const MAX_MODS = 50
const KICK_NAME = /^[A-Za-z0-9_]{3,25}$/

// the Links tab's lists only: link requests, approved links, every link (not the full Players list)
const LINK_LISTS = new Set(['pending', 'linked', 'links'])

/**
 * Everything a mod may call. [method ('*' = any), path, query check (optional)]. Keep in step
 * with the `mod: true` sections in src/pages/AdminPage.jsx.
 */
const MOD_ROUTES = [
  ['GET', /^\/api\/admin\/status$/],
  // Site: claims (approve / reject / undo)
  ['*', /^\/api\/admin\/claims(\/|$)/],
  // Site: milestone claims (look a player up, mark a milestone paid or undo it)
  ['GET', /^\/api\/admin\/milestones\/(lookup|claims)$/],
  ['POST', /^\/api\/admin\/milestones\/(claim|unclaim)$/],
  // Site: Rainbet links (approve / reject / re-check / unlink a request). Not setting a link
  // by hand (/rainbet) and not the full Players list.
  ['GET', /^\/api\/admin\/players$/, (url) => LINK_LISTS.has(url?.searchParams.get('status'))],
  ['POST', /^\/api\/admin\/players\/[^/]+\/(rainbet-approve|rainbet-reject|rainbet-check|unlink-rainbet)$/],
  // Stream
  ['*', /^\/api\/admin\/hunts(\/|$)/],
  ['*', /^\/api\/admin\/guess(\/|$)/],
  ['*', /^\/api\/admin\/tournaments(\/|$)/],
  ['*', /^\/api\/admin\/giveaway(\/|$)/],
  ['*', /^\/api\/admin\/giveaway-wins(\/|$)/],
  ['*', /^\/api\/admin\/slotpick(\/|$)/],
  // Raffles: run the draw on stream (see, lock, draw, reroll, finish, save a snapshot) but
  // not create a raffle, change its prizes or dates, unlock or delete it
  ['GET', /^\/api\/admin\/raffles(\/|$)/],
  ['POST', /^\/api\/admin\/raffles\/[\w-]+\/(lock|draw|reroll|finish|snapshot)$/],
  // VIP: slot calls only (not the VIP list)
  ['*', /^\/api\/admin\/calls(\/|$)/],
]

export function modMayUse(method, path, url) {
  return MOD_ROUTES.some(([m, re, ok]) => (m === '*' || m === method) && re.test(path) && (!ok || ok(url)))
}

const list = () => read(TABLE, [])

/** Is this signed-in Kick account on the mod list? (Admins are checked separately.) */
export async function isMod(user) {
  const kick = user?.kick?.username?.toLowerCase()
  if (!kick) return false
  return (await list()).some((m) => m.kick === kick)
}

export async function handle(req, ctx) {
  if (ctx.path !== '/api/admin/mods') return null
  // api.js already refuses non-admins here (it isn't a mod route); checked again to be sure
  if (!isAdmin(ctx.user)) return json(403, { error: 'Admins only.' })
  if (ctx.method === 'GET') return json(200, { mods: await list() })
  if (ctx.method !== 'POST') return json(405, { error: 'Use GET or POST.' })
  const by = String(ctx.user?.kick?.username ?? ctx.user?.discord?.name ?? 'admin').slice(0, 40)
  const add = String(ctx.body?.add ?? '').trim().replace(/^@/, '')
  const remove = String(ctx.body?.remove ?? '').trim().toLowerCase()
  if (add) {
    if (!KICK_NAME.test(add)) return json(400, { error: 'Enter a Kick username (letters, numbers and _ only).' })
    const kick = add.toLowerCase()
    if (isAdmin({ kick: { username: kick } })) return json(409, { error: `${add} is already an admin.` })
    let refused = ''
    await update(
      TABLE,
      (l) => {
        if (l.some((m) => m.kick === kick)) {
          refused = `${add} is already a mod.`
          return l
        }
        if (l.length >= MAX_MODS) {
          refused = `That's the most mods the panel holds (${MAX_MODS}).`
          return l
        }
        return [...l, { kick, name: add, addedBy: by, at: nowSeconds() }]
      },
      [],
    )
    if (refused) return json(409, { error: refused })
    logActivity({ actor: by, kind: 'player', text: `Made ${add} a mod` })
    return json(200, { mods: await list() })
  }
  if (remove) {
    let gone = null
    await update(
      TABLE,
      (l) => {
        gone = l.find((m) => m.kick === remove) ?? null
        return l.filter((m) => m.kick !== remove)
      },
      [],
    )
    if (!gone) return json(404, { error: 'That mod is already gone.' })
    logActivity({ actor: by, kind: 'player', text: `Removed ${gone.name} as a mod` })
    return json(200, { mods: await list() })
  }
  return json(400, { error: 'Say who to add or remove.' })
}
