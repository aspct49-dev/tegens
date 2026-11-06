// Activity log: who changed what in the admin panel, plus a few things that happen
// in chat (VIP slot calls). server/api.js calls auditApi() after every request, so
// each successful admin change is recorded once, here, with a plain-English line;
// features don't log anything themselves (except chat events, via logActivity).
//
//   GET  /api/admin/activity?kind=&q=&before=&limit=   → { items, kinds, more }   newest first
//
// Table `activity`: [{ id, at, actor, kind, text, count, key }]   newest first, at most 2,000.
//   at: unix seconds · actor: Kick username of the admin (or the viewer, for chat events)
//   kind: giveaway | vip | calls | slots | hunt | guess | tournament | raffle | challenge | player | bot
//   count + key: repeats of the same change by the same person within a few minutes
//   (the bonus hunt autosaves on every edit) fold into one line instead of many.

import { randomBytes } from 'node:crypto'
import { json, nowSeconds } from './http.js'
import { read, update } from './store.js'

const MAX = 2000
const FOLD_SECONDS = 5 * 60
const PAGE = 100

export const KINDS = {
  giveaway: 'Giveaways',
  vip: 'VIPs',
  calls: 'Slot calls',
  slots: 'Slot picker',
  hunt: 'Bonus hunts',
  guess: 'Guess the Balance',
  tournament: 'Tournaments',
  raffle: 'Raffles',
  challenge: 'Challenges',
  wins: 'Biggest wins',
  player: 'Players',
  shop: 'Item store',
  bot: 'Kick & bot',
}

/** Add a line to the log. `fold`: merge into the newest line if it's the same change by the same person, minutes ago */
export async function logActivity({ actor, kind, text, fold = false }) {
  const at = nowSeconds()
  const entry = { id: randomBytes(6).toString('base64url'), at, actor: String(actor ?? 'admin').slice(0, 40), kind, text: String(text).slice(0, 240), count: 1 }
  const key = `${entry.actor}|${kind}|${entry.text}`
  await update(
    'activity',
    (list) => {
      const top = list[0]
      if (fold && top && top.key === key && at - top.at < FOLD_SECONDS) {
        top.at = at
        top.count = (top.count ?? 1) + 1
        return list
      }
      return [{ ...entry, key: fold ? key : null }, ...list].slice(0, MAX)
    },
    [],
  ).catch((err) => console.error('[audit] write failed:', err))
}

// ---------------------------------------------------------------- describing admin changes

const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** The name of the thing with this id anywhere in a response ({ hunt }, { raffles: [...] }, …) */
function named(out, id) {
  const label = (x) => x?.name ?? x?.title ?? x?.game ?? x?.prize ?? null
  for (const v of Object.values(out ?? {})) {
    if (Array.isArray(v)) {
      const hit = v.find((x) => x && x.id === id)
      if (hit) return label(hit)
    } else if (v && typeof v === 'object' && v.id === id) return label(v)
  }
  return null
}
const q = (s) => (s ? `“${s}”` : '')

/**
 * [pattern on the path after /api/admin/, kind, (match, body, response) → text | null, fold?]
 * The first match wins. A null text skips the line.
 */
const RULES = [
  // ---- giveaways
  [/^giveaway\/start$/, 'giveaway', (m, b) => `Started a giveaway: ${b.prize}${b.vipOnly ? ' (VIPs only)' : ''}`],
  [/^giveaway\/update$/, 'giveaway', (m, b, o) => `Edited the giveaway ${q(o.giveaway?.prize)}`],
  [/^giveaway\/open$/, 'giveaway', (m, b, o) => `Reopened entries for ${q(o.giveaway?.prize)}`],
  [/^giveaway\/close$/, 'giveaway', (m, b, o) => `Closed entries for ${q(o.giveaway?.prize)} (${o.giveaway?.entries?.filter((e) => !e.removed).length ?? 0} entries)`],
  [/^giveaway\/(remove|restore)$/, 'giveaway', (m, b, o) => `${m[1] === 'remove' ? 'Removed' : 'Restored'} ${o.giveaway?.entries?.find((e) => e.kickId === b.kickId)?.name ?? 'an entrant'} ${m[1] === 'remove' ? 'from' : 'to'} the giveaway`],
  [/^giveaway\/draw$/, 'giveaway', (m, b, o) => `${b.redraw ? 'Re-drew' : 'Drew'} the giveaway winner: ${o.winner?.name} (${o.giveaway?.prize})`],
  [/^giveaway\/enter-vips$/, 'giveaway', (m, b, o) => `Entered every VIP into the giveaway (+${o.added ?? 0})`],
  [/^giveaway\/end$/, 'giveaway', (m, b, o) => (b.discard ? 'Discarded the giveaway' : `Ended the giveaway (${o.saved ?? 0} ${o.saved === 1 ? 'winner' : 'winners'} saved)`)],
  [/^giveaway\/history\/remove$/, 'giveaway', () => 'Removed a past giveaway from the public history'],
  [/^giveaway\/history\/clear$/, 'giveaway', () => 'Cleared the giveaway history'],
  // manual giveaway wins (the public /giveaways page)
  [/^giveaway-wins$/, 'giveaway', (m, b, o) => `Posted a giveaway win: ${o.win?.winner ?? b.winner} won ${o.win?.prize ?? b.prize}`],
  [/^giveaway-wins\/([\w-]+)\/remove$/, 'giveaway', (m, b, o) => (o.removed ? `Removed the giveaway win: ${o.removed.winner} – ${o.removed.prize}` : 'Removed a giveaway win')],
  [/^giveaway-wins\/([\w-]+)$/, 'giveaway', (m, b, o) => `Edited the giveaway win: ${o.win?.winner ?? 'a winner'} – ${o.win?.prize ?? ''}`.trim(), true],

  // ---- VIPs
  [/^milestones\/claim$/, 'player', (m, b) => `Marked ${b.username}’s ${b.tier} milestone as claimed${b.force ? ' (not reached yet)' : ''}`],
  [/^milestones\/unclaim$/, 'player', (m, b) => `Unmarked ${b.username}’s ${b.tier} milestone claim`],
  [/^vips$/, 'vip', (m, b, o) => `Added VIP ${o.vips?.at(-1)?.username ?? b.username}`],
  [/^vips\/(\w+)\/remove$/, 'vip', (m) => `Removed VIP ${m[1]}`],
  [/^vips\/(\w+)$/, 'vip', (m, b) => `Changed the note on VIP ${m[1]}${b.note ? ` to ${q(b.note)}` : ''}`],

  // ---- slot calls
  [/^calls\/settings$/, 'calls', (m, b) => ('open' in b ? `${b.open ? 'Opened' : 'Closed'} VIP slot calls` : `Turned bot call confirmations ${b.announce ? 'on' : 'off'}`)],
  [/^calls\/add$/, 'calls', (m, b) => `Added a call for ${b.username}: ${b.name}`],
  [/^calls\/next$/, 'calls', (m, b, o) => {
    const c = o.calls?.find((x) => x.id === o.currentId)
    return c ? `Played ${c.username}’s call: ${c.slot.name}` : 'Played the next call'
  }],
  [/^calls\/hide$/, 'calls', () => 'Hid the slot call from the overlay'],
  [/^calls\/clear$/, 'calls', (m, b) => (b.all ? 'Cleared every slot call' : 'Cleared finished slot calls')],
  [/^calls\/([\w-]+)\/(play|result|skip|reopen|delete)$/, 'calls', (m, b, o) => {
    const c = o.calls?.find((x) => x.id === m[1])
    const who = c ? `${c.username}’s call ${c.slot.name}` : 'a slot call'
    if (m[2] === 'play') return `Played ${who}`
    if (m[2] === 'result') return `Recorded ${who}: won ${usd(c?.win ?? b.win)}${c?.bet ? ` on ${usd(c.bet)}` : ''}`
    if (m[2] === 'skip') return `Skipped ${who}`
    if (m[2] === 'reopen') return `Reopened ${who} (its recorded win was removed)`
    return 'Deleted a slot call'
  }],

  // ---- slot picker
  [/^slotpick\/roll$/, 'slots', (m, b, o) => `Rolled the slot picker: ${o.draw?.slot?.name}`],
  [/^slotpick\/list\/add$/, 'slots', (m, b) => `Added ${b.name} to the slot picker list`],
  [/^slotpick\/list\/remove$/, 'slots', () => 'Removed a slot from the picker list'],
  [/^slotpick\/list\/clear$/, 'slots', () => 'Emptied the slot picker list'],
  [/^slotpick\/history\/clear$/, 'slots', () => 'Cleared the slot picker history'],

  // ---- bonus hunts (autosave: fold repeats)
  [/^hunts$/, 'hunt', (m, b, o) => `Started bonus hunt ${q(o.hunt?.name ?? b.name)}`],
  [/^hunts\/([\w-]+)\/delete$/, 'hunt', () => 'Deleted a bonus hunt'],
  [/^hunts\/([\w-]+)$/, 'hunt', (m, b, o) => `Edited bonus hunt ${q(o.hunt?.name)} (${o.hunt?.status ?? 'saved'})`, true],

  // ---- guess the balance
  [/^guess$/, 'guess', (m, b) => `Opened Guess the Balance ${q(b.name)}`],
  [/^guess\/([\w-]+)\/draw$/, 'guess', (m, b, o) => `Settled Guess the Balance ${q(named(o, m[1]))} at ${usd(b.finalBalance)}`],
  [/^guess\/([\w-]+)\/remove$/, 'guess', (m, b, o) => `Removed a guess from ${q(named(o, m[1]))}`],
  [/^guess\/([\w-]+)\/delete$/, 'guess', () => 'Deleted a Guess the Balance round'],
  [/^guess\/([\w-]+)$/, 'guess', (m, b, o) => ('status' in b ? `${b.status === 'open' ? 'Reopened' : 'Locked'} guesses for ${q(named(o, m[1]))}` : `Edited Guess the Balance ${q(named(o, m[1]))}`), true],

  // ---- tournaments
  [/^tournaments$/, 'tournament', (m, b) => `Created tournament ${q(b.name)}`],
  [/^tournaments\/([\w-]+)\/decide$/, 'tournament', (m, b, o) => `Decided a match in ${q(named(o, m[1]))}`],
  [/^tournaments\/([\w-]+)\/reset$/, 'tournament', (m, b, o) => `Undid a match in ${q(named(o, m[1]))}`],
  [/^tournaments\/([\w-]+)\/delete$/, 'tournament', () => 'Deleted a tournament'],
  [/^tournaments\/([\w-]+)$/, 'tournament', (m, b, o) => (b.status === 'live' ? `Published tournament ${q(named(o, m[1]))}` : `Edited tournament ${q(named(o, m[1]))}`), true],

  // ---- raffles
  [/^raffles$/, 'raffle', (m, b) => `Created a ${b.kind === 'watch' ? 'watch-time' : 'wager'} raffle${b.title ? ` ${q(b.title)}` : ''}`],
  [/^raffles\/([\w-]+)\/(lock|unlock|draw|reroll|finish|delete|snapshot)$/, 'raffle', (m, b, o) => {
    const name = q(o.raffle?.title ?? named(o, m[1]))
    const verb = { lock: 'Locked', unlock: 'Unlocked', draw: 'Made a draw in', reroll: `Re-rolled draw ${b.n ?? ''} in`, finish: 'Finished', delete: 'Deleted', snapshot: 'Saved a ticket snapshot of' }[m[2]]
    return `${verb} raffle ${name}`.replace(/\s+/g, ' ').trim()
  }],
  [/^raffles\/([\w-]+)$/, 'raffle', (m, b, o) => `Edited raffle ${q(o.raffle?.title ?? named(o, m[1]))}`, true],

  // ---- challenges
  [/^challenges$/, 'challenge', (m, b) => `Added challenge ${q(b.game)}`],
  [/^challenges\/([\w-]+)\/complete$/, 'challenge', (m, b, o) => `Marked challenge ${q(named(o, m[1]))} complete${b.completedBy ? ` by ${b.completedBy}` : ''}`],
  [/^challenges\/([\w-]+)\/reopen$/, 'challenge', (m, b, o) => `Reopened challenge ${q(named(o, m[1]))}`],
  [/^challenges\/([\w-]+)\/delete$/, 'challenge', () => 'Deleted a challenge'],
  [/^challenges\/([\w-]+)$/, 'challenge', (m, b, o) => `Edited challenge ${q(named(o, m[1]))}`, true],

  // ---- players
  [/^players\/([\w-]+)\/rainbet$/, 'player', (m, b, o) =>
    `Set ${o.player?.name ?? 'a player'}’s Rainbet link to ${o.link?.username ?? b.username}${o.link?.approvedAnyway ? ' (not confirmed by Rainbet)' : ''}`],
  [/^players\/([\w-]+)\/rainbet-approve$/, 'player', (m, b, o) =>
    `Approved ${o.player?.name ?? 'a player'}’s Rainbet link ${o.link?.username ?? ''}${o.link?.approvedAnyway ? ' (not confirmed by Rainbet)' : ''}`.replace(/\s+/g, ' ')],
  [/^players\/([\w-]+)\/rainbet-reject$/, 'player', (m, b, o) =>
    `Rejected ${o.player?.name ?? 'a player'}’s Rainbet link ${o.link?.username ?? ''}${b.note ? `: ${String(b.note).slice(0, 200)}` : ''}`.replace(/\s+/g, ' ')],
  [/^players\/([\w-]+)\/unlink-rainbet$/, 'player', (m, b, o) =>
    `Removed ${o.player?.name ?? 'a player'}’s Rainbet link${o.link?.username ? ` ${o.link.username}` : ''}${b.note ? `: ${String(b.note).slice(0, 200)}` : ''}`],

  // ---- Kick
  [/^kick\/reconnect$/, 'bot', () => 'Reconnected to Kick chat'],
  [/^kick\/bot\/disconnect$/, 'bot', () => 'Disconnected the chat bot'],
  [/^kick\/bot\/test$/, 'bot', () => 'Sent a test message as the chat bot'],
]

/** Called by server/api.js once a request has been answered */
export async function auditApi(ctx, res) {
  try {
    // admins' and mods' changes both go in the log (mods can't read it)
    if (!(ctx.admin || ctx.mod) || res.status >= 400) return
    const actor = ctx.user?.kick?.username ?? ctx.user?.discord?.username ?? 'admin'
    // the bot account connects with a GET (Kick's redirect back here)
    if (ctx.path === '/api/kick/bot/callback') {
      const to = res.headers?.Location ?? res.headers?.location ?? ''
      if (!/bot_error/.test(to)) await logActivity({ actor, kind: 'bot', text: 'Connected the chat bot account' })
      return
    }
    if (ctx.method !== 'POST' || !ctx.path.startsWith('/api/admin/') || ctx.path === '/api/admin/dev/chat') return
    const rest = ctx.path.slice('/api/admin/'.length)
    let out = {}
    try {
      out = JSON.parse(res.body || '{}')
    } catch {
      /* not JSON */
    }
    for (const [re, kind, describe, fold] of RULES) {
      const m = re.exec(rest)
      if (!m) continue
      const text = describe(m, ctx.body ?? {}, out)
      if (text) await logActivity({ actor, kind, text, fold: Boolean(fold) })
      return
    }
  } catch (err) {
    console.error('[audit]', err)
  }
}

// ---------------------------------------------------------------- the admin view

export async function handle(req, ctx) {
  if (ctx.path !== '/api/admin/activity') return null
  if (ctx.method !== 'GET') return json(405, { error: 'Use GET.' })
  const p = ctx.url.searchParams
  const kind = p.get('kind') || ''
  const needle = (p.get('q') || '').trim().toLowerCase()
  const before = Number(p.get('before')) || Infinity
  const limit = Math.min(500, Math.max(1, Number(p.get('limit')) || PAGE))
  const list = (await read('activity', [])).filter(
    (e) => e.at < before && (!kind || e.kind === kind) && (!needle || e.text.toLowerCase().includes(needle) || e.actor.toLowerCase().includes(needle)),
  )
  return json(200, { items: list.slice(0, limit).map(({ key, ...e }) => e), more: list.length > limit, kinds: KINDS })
}
