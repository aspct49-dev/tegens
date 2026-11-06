// Claims: players claim their milestone rewards and challenge bounties on the site (no
// Discord ticket). A claim waits for an admin, who ticks it once the reward is paid. The
// player sees each claim's state on their profile (src/components/MyClaims.jsx), on
// /milestones and on /challenges.
//
//   POST /api/claims                  { kind: 'milestone', tier }
//                                     { kind: 'challenge', challengeId, proof, note? }   → { claim, claims }
//   GET  /api/claims/mine             → { claims }   the signed-in player's, newest first
//   POST /api/claims/<id>/cancel      their own waiting claim → { claims }
//
//   GET  /api/admin/claims?status=pending|paid|rejected|all&kind=milestone|challenge
//                                     → { claims, counts: { pending, milestone, challenge, paid, rejected } }
//   POST /api/admin/claims/<id>/pay     { note? }   the tick: paid out
//        milestone → a row in `milestoneClaims` (as features/milestoneClaims.js writes them),
//                    so /milestones shows "Claimed" and the Milestone Claims page sees it
//        challenge → the challenge is completed (won by the player's Rainbet name) and every
//                    other waiting claim on it is turned down
//   POST /api/admin/claims/<id>/reject  { note }    the note is shown to the player
//   POST /api/admin/claims/<id>/undo                paid or rejected → waiting again (a paid
//                                                   milestone's row goes; a challenge reopens
//                                                   if it's still the one this claim won)
//
// Only a signed-in player with an approved Rainbet link (server/auth.js approvedRainbet)
// can claim; a milestone must be reached (lifetimeWager) and not paid already.
//
// Table `claims`: [{ id, kind: 'milestone' | 'challenge', userId, player, kick, rainbet,
//   tier | challengeId, title, reward ($), proof, note, status: 'pending' | 'paid' |
//   'rejected' | 'cancelled', at, decidedAt, decidedBy, adminNote }]   newest first, times unix seconds

import { randomBytes } from 'node:crypto'
import { config } from '../../src/config.js'
import { approvedRainbet, displayName } from '../auth.js'
import { logActivity } from '../audit.js'
import { json, nowSeconds } from '../http.js'
import { COLORS, notifyAdmins } from '../notify.js'
import { lifetimeWager } from '../rainbet.js'
import { read, update } from '../store.js'

const TABLE = 'claims'
const MAX_ROWS = 20_000
const TIERS = config.milestones.tiers
const OPEN = new Set(['pending', 'paid']) // a claim in one of these blocks another for the same thing

class InputError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const newId = () => randomBytes(6).toString('base64url')
const keyOf = (name) => String(name ?? '').trim().toLowerCase()
const list = () => read(TABLE, [])
const save = (fn) => update(TABLE, fn, [])
const x = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}x`
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** What a player sees of their own claim */
const mine = (c) => ({
  id: c.id,
  kind: c.kind,
  tier: c.tier ?? null,
  challengeId: c.challengeId ?? null,
  title: c.title,
  reward: c.reward,
  proof: c.proof ?? '',
  note: c.note ?? '',
  status: c.status,
  at: c.at,
  decidedAt: c.decidedAt ?? null,
  adminNote: c.adminNote ?? '',
})

const mineOf = async (userId) => (await list()).filter((c) => c.userId === userId).map(mine)

/** The signed-in player and their approved Rainbet name, or an error to show them */
async function claimant(user) {
  if (!user) throw new InputError('Sign in first to claim.', 401)
  const row = (await read('players')).find((p) => p.id === user.id) ?? null
  const rainbet = approvedRainbet(row)
  if (!rainbet) throw new InputError('Link your Rainbet username on your profile first. A claim is paid to that account once an admin approves it.', 403)
  return { userId: user.id, player: displayName(user), kick: user.kick?.username ?? null, rainbet }
}

function proofOf(v) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ')
  if (!s) throw new InputError('Paste the Rainbet bet link or bet ID of the win.')
  if (s.length > 200) throw new InputError('Keep the bet link or ID under 200 characters.')
  if (/[<>]/.test(s)) throw new InputError('That doesn’t look like a bet link or ID.')
  return s
}

// ---------------------------------------------------------------- the player's side

async function claimMilestone(who, body) {
  const tier = TIERS.find((t) => t.id === body.tier)
  if (!tier) throw new InputError('Unknown milestone.')
  const key = keyOf(who.rainbet)
  const paid = await read('milestoneClaims', [])
  if (paid.some((c) => c.key === key && c.tier === tier.id)) throw new InputError(`Your ${tier.name} reward has already been paid.`, 409)
  let wager
  try {
    wager = await lifetimeWager(who.rainbet)
  } catch (err) {
    throw new InputError(`Rainbet can’t be reached right now, so your wager can’t be checked. Try again in a minute. (${err.message})`, 502)
  }
  if (wager.wagered < tier.wager)
    throw new InputError(`You haven’t reached ${tier.name} yet: ${usd(tier.wager - wager.wagered)} more to wager under code ${config.referralCode}.`, 409)
  return { tier: tier.id, title: `${tier.name} milestone`, reward: tier.prize, proof: '', note: '' }
}

async function claimChallenge(body) {
  const id = String(body.challengeId ?? '')
  const c = (await read('challenges')).find((ch) => ch.id === id)
  if (!c) throw new InputError('That challenge no longer exists.', 404)
  if (c.status === 'completed') throw new InputError('That challenge has already been won.', 409)
  return {
    challengeId: c.id,
    title: `${c.game} ${x(c.multiplier)}`,
    reward: c.reward,
    proof: proofOf(body.proof),
    note: String(body.note ?? '').trim().replace(/\s+/g, ' ').slice(0, 200),
  }
}

async function createClaim(user, body) {
  const who = await claimant(user)
  const kind = body?.kind
  if (kind !== 'milestone' && kind !== 'challenge') throw new InputError('Claim a milestone or a challenge.')
  const what = kind === 'milestone' ? await claimMilestone(who, body) : await claimChallenge(body)
  const same = (c) =>
    OPEN.has(c.status) &&
    c.kind === kind &&
    (kind === 'milestone' ? keyOf(c.rainbet) === keyOf(who.rainbet) && c.tier === what.tier : c.userId === who.userId && c.challengeId === what.challengeId)
  const claim = { id: newId(), kind, ...who, ...what, status: 'pending', at: nowSeconds(), decidedAt: null, decidedBy: null, adminNote: '' }
  await save((l) => {
    const had = l.find(same)
    if (had) throw new InputError(had.status === 'paid' ? 'This has already been paid.' : 'You’ve already claimed this. It’s waiting for an admin.', 409)
    return [claim, ...l].slice(0, MAX_ROWS)
  })
  logActivity({ actor: who.player, kind: kind === 'milestone' ? 'player' : 'challenge', text: `Claimed ${claim.title} (${usd(claim.reward)}) as ${who.rainbet}` })
  return claim
}

// ---------------------------------------------------------------- the admin's side

/** Change one claim; `fn` gets a copy and returns it changed (throws to refuse) */
async function edit(id, fn) {
  let before = null
  let after = null
  await save((l) => {
    const i = l.findIndex((c) => c.id === id)
    if (i < 0) throw new InputError('That claim no longer exists.', 404)
    before = l[i]
    after = fn({ ...l[i] })
    l[i] = after
    return l
  })
  return { before, after }
}

/** Mark it paid: the milestone row / the challenge won */
async function pay(id, admin, note) {
  const { after: c } = await edit(id, (c) => {
    if (c.status !== 'pending') throw new InputError(c.status === 'paid' ? 'It’s already marked paid.' : 'Only a waiting claim can be paid. Undo it first.', 409)
    return { ...c, status: 'paid', decidedAt: nowSeconds(), decidedBy: admin, adminNote: String(note ?? '').trim().slice(0, 200) }
  })
  try {
    if (c.kind === 'milestone') {
      const tier = TIERS.find((t) => t.id === c.tier)
      const key = keyOf(c.rainbet)
      await update(
        'milestoneClaims',
        (rows) =>
          [
            ...rows.filter((r) => !(r.key === key && r.tier === c.tier)),
            { key, name: c.rainbet, tier: c.tier, prize: tier?.prize ?? c.reward, at: nowSeconds(), by: admin, note: c.adminNote || 'Claimed on the site', claimId: c.id },
          ].slice(-MAX_ROWS),
        [],
      )
    } else {
      let found = false
      await update('challenges', (all) =>
        all.map((ch) => {
          if (ch.id !== c.challengeId) return ch
          found = true
          return { ...ch, status: 'completed', completedBy: String(c.rainbet).slice(0, 40), completedAt: Date.now(), claimId: c.id }
        }),
      )
      if (found) {
        // first valid claim wins: the others on this challenge are turned down
        const t = nowSeconds()
        await save((l) =>
          l.map((o) =>
            o.kind === 'challenge' && o.challengeId === c.challengeId && o.status === 'pending' && o.id !== c.id
              ? { ...o, status: 'rejected', decidedAt: t, decidedBy: admin, adminNote: 'Someone else claimed this challenge first.' }
              : o,
          ),
        )
      }
    }
  } catch (err) {
    // couldn't record the payout: back to waiting so nothing is half done
    await edit(id, (x) => ({ ...x, status: 'pending', decidedAt: null, decidedBy: null }))
    throw err
  }
  return c
}

async function undo(id) {
  const { before: c } = await edit(id, (c) => {
    if (c.status !== 'paid' && c.status !== 'rejected') throw new InputError('Only a paid or rejected claim can be undone.', 409)
    return { ...c, status: 'pending', decidedAt: null, decidedBy: null, adminNote: '' }
  })
  if (c.status !== 'paid') return
  if (c.kind === 'milestone') {
    await update('milestoneClaims', (rows) => rows.filter((r) => r.claimId !== c.id), [])
  } else {
    await update('challenges', (all) =>
      all.map((ch) =>
        ch.id === c.challengeId && ch.status === 'completed' && (ch.claimId === c.id || keyOf(ch.completedBy) === keyOf(c.rainbet))
          ? { ...ch, status: 'active', completedBy: null, completedAt: null, claimId: null }
          : ch,
      ),
    )
  }
}

const countsOf = (rows) => ({
  pending: rows.filter((c) => c.status === 'pending').length,
  milestone: rows.filter((c) => c.status === 'pending' && c.kind === 'milestone').length,
  challenge: rows.filter((c) => c.status === 'pending' && c.kind === 'challenge').length,
  paid: rows.filter((c) => c.status === 'paid').length,
  rejected: rows.filter((c) => c.status === 'rejected').length,
})

/** Waiting claims, for the admin overview badge */
export async function claimCounts() {
  return countsOf(await list())
}

// ---------------------------------------------------------------- routes

export async function handle(req, ctx) {
  const { path, method, body, user } = ctx
  const isPublic = path === '/api/claims' || path.startsWith('/api/claims/')
  const isAdmin = path === '/api/admin/claims' || path.startsWith('/api/admin/claims/')
  if (!isPublic && !isAdmin) return null
  try {
    if (path === '/api/claims') {
      if (method !== 'POST') return json(405, { error: 'Use POST.' })
      const claim = await createClaim(user, body ?? {})
      notifyAdmins(req, {
        title: `New ${claim.kind} claim: ${claim.title}`,
        tab: 'claims',
        color: COLORS.claim,
        fields: [
          ['Player', claim.kick ?? claim.player],
          ['Rainbet', claim.rainbet],
          ['Reward', usd(claim.reward)],
          ['Proof', claim.proof, false],
          ['Note', claim.note, false],
        ],
      })
      return json(200, { claim: mine(claim), claims: await mineOf(user.id) })
    }
    if (path === '/api/claims/mine') {
      if (!user) return json(200, { claims: [] })
      return json(200, { claims: await mineOf(user.id) })
    }
    const cancel = /^\/api\/claims\/([\w-]{1,20})\/cancel$/.exec(path)
    if (cancel) {
      if (method !== 'POST') return json(405, { error: 'Use POST.' })
      if (!user) throw new InputError('Sign in first.', 401)
      await edit(cancel[1], (c) => {
        if (c.userId !== user.id) throw new InputError('That isn’t your claim.', 403)
        if (c.status !== 'pending') throw new InputError('Only a waiting claim can be cancelled.', 409)
        return { ...c, status: 'cancelled', decidedAt: nowSeconds() }
      })
      return json(200, { claims: await mineOf(user.id) })
    }
    if (isPublic) return json(404, { error: 'Not found.' })

    // admin (api.js only lets admins this far)
    const admin = String(user?.kick?.username ?? user?.discord?.name ?? 'admin').slice(0, 40)
    if (path === '/api/admin/claims') {
      if (method !== 'GET') return json(405, { error: 'Use GET.' })
      const status = ctx.url.searchParams.get('status') || 'pending'
      const kind = ctx.url.searchParams.get('kind') || ''
      const rows = await list()
      const shown = rows
        .filter((c) => (status === 'all' ? c.status !== 'cancelled' : c.status === status))
        .filter((c) => !kind || c.kind === kind)
        // waiting: oldest first (first come, first paid); the rest newest decided first
        .sort((a, b) => (status === 'pending' ? a.at - b.at : (b.decidedAt ?? b.at) - (a.decidedAt ?? a.at)))
        .slice(0, 300)
      return json(200, { claims: shown, counts: countsOf(rows) })
    }
    const m = /^\/api\/admin\/claims\/([\w-]{1,20})\/(pay|reject|undo)$/.exec(path)
    if (!m) return json(404, { error: 'Not found.' })
    if (method !== 'POST') return json(405, { error: 'Use POST.' })
    const [, id, action] = m
    if (action === 'pay') await pay(id, admin, body?.note)
    else if (action === 'reject') {
      const note = String(body?.note ?? '').trim().slice(0, 200)
      await edit(id, (c) => {
        if (c.status !== 'pending') throw new InputError('Only a waiting claim can be rejected.', 409)
        return { ...c, status: 'rejected', decidedAt: nowSeconds(), decidedBy: admin, adminNote: note || 'Turned down.' }
      })
    } else await undo(id)
    const rows = await list()
    const claim = rows.find((c) => c.id === id) ?? null
    if (claim) {
      const what = `${claim.player}’s claim ${claim.title} (${usd(claim.reward)})`
      const text = { pay: `Paid ${what}`, reject: `Rejected ${what}${claim.adminNote ? `: ${claim.adminNote}` : ''}`, undo: `Undid the decision on ${what}` }[action]
      logActivity({ actor: admin, kind: claim.kind === 'milestone' ? 'player' : 'challenge', text })
    }
    return json(200, { claim, counts: countsOf(rows) })
  } catch (err) {
    if (err instanceof InputError) return json(err.status, { error: err.message })
    throw err
  }
}
