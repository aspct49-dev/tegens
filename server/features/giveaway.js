// Chat giveaway: viewers type the keyword (e.g. !join) in Kick chat to enter, the
// server draws the winner. Chat is read in the server process (server/chatbus.js),
// so entries keep arriving with the admin tab closed.
//
//   GET  /api/events/giveaway                 the current giveaway (public view) and past giveaways
//   GET  /api/events/giveaway/history         every recorded giveaway with its winners, and totals (/giveaways)
//
//   GET  /api/admin/giveaway                  the full giveaway (every entrant) and past winners, plus
//                                             chat: { feed: [{ name, text, at }] newest first (≤ 80),
//                                                     recent: { [name lower]: [{ text, at }] } entrants' last lines }
//   POST /api/admin/giveaway/start            { prize, keyword, announce?, vipOnly?, postWins?, value? }   (replaces any running one)
//   POST /api/admin/giveaway/update           { prize?, keyword?, announce?, vipOnly?, postWins?, value? }
//   postWins (default on): each winner is posted on the public /giveaways page as it's drawn
//   (giveawayWins.js postChatWin); a re-draw swaps it, a discarded round takes them back off.
//   value: the prize in $ for that page's "Total given away" ("$50 tip" → 50 when not given).
//   POST /api/admin/giveaway/enter-vips       every VIP (./vips.js) entered, no keyword needed
//   POST /api/admin/giveaway/open             entries open (bot: "type !join to enter")
//   POST /api/admin/giveaway/close            entries closed (bot: entry count)
//   POST /api/admin/giveaway/remove           { kickId }   out of the draw; typing the keyword again keeps them out
//   POST /api/admin/giveaway/restore          { kickId }
//   POST /api/admin/giveaway/draw             { redraw? }  redraw: the latest winner is voided (no-show) and replaced
//   POST /api/admin/giveaway/end              { discard? } winners → past winners (discard: a test round, nothing saved)
//   POST /api/admin/giveaway/history/remove   { id }
//   POST /api/admin/giveaway/history/clear
//
// Table `giveaway` (null when none is running):
//   { id, prize, keyword, open, announce, vipOnly (only VIPs can enter), startedAt,
//     entries: [{ kickId, name, at, removed? }],          in arrival order
//     winners: [{ kickId, name, drawnAt, drawId, void? }], newest first
//     draw: { id, at, winner, kickId, reel: string[], redraw } | null }   the latest draw (the overlay plays its reel)
// Table `giveawayWins`: [{ id, giveawayId, name, kickId, prize, at }], newest first, at most 50 (players' profiles).
// Table `giveawayHistory`: [{ id, prize, keyword, vipOnly, startedAt, endedAt, entries, winners: [{ name, drawnAt }], redraws }],
//   newest first, at most 100: the public record (GET /api/events/giveaway/history → { history, totals }).
// Times are unix seconds.

import { randomBytes, randomInt } from 'node:crypto'
import { onChat } from '../chatbus.js'
import { envValue } from '../env.js'
import { json, nowSeconds } from '../http.js'
import { sendChat } from '../kick/bot.js'
import { read, update } from '../store.js'
import { amountFromPrize, cleanAmount, postChatWin, removeChatWins } from './giveawayWins.js'
import { listVips, vipSet } from './vips.js'

const MAX_WINS = 50
const MAX_PAST = 100
const MAX_ENTRIES = 50_000
const REEL_MIN = 24
const REEL_MAX = 40
/** The overlay's reel runs ~4.5 s; the bot names the winner once it has landed */
const WINNER_ANNOUNCE_DELAY = 5500

class InputError extends Error {}

const newId = () => randomBytes(6).toString('base64url')

// ---------------------------------------------------------------- pure rules (exported for checks)

/** "!Join" → "!join"; one word, up to 24 characters */
export function cleanKeyword(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (!/^\S{1,24}$/.test(s)) throw new InputError('The keyword is one word, up to 24 characters (e.g. !join).')
  return s
}

/** The prize's value in $ (for the Giveaways page total): given, else read from "$50 …", else null */
function cleanValue(v, prize) {
  try {
    return cleanAmount(v) ?? amountFromPrize(prize)
  } catch {
    throw new InputError('The value is a number of dollars, 0 or more.')
  }
}

function cleanPrize(v) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ')
  if (!s) throw new InputError('What are you giving away?')
  if (s.length > 80) throw new InputError('Keep the prize under 80 characters.')
  return s
}

/** The message enters when its first word is the keyword (any case): "!JOIN pls" enters, "pls !join" doesn't */
export function matchesKeyword(text, keyword) {
  if (!keyword) return false
  const first = String(text ?? '').trim().split(/\s+/)[0]
  return first.toLowerCase() === keyword
}

/** Chat bots never enter */
const BOTS = new Set(['botrix', 'botrixoficial', 'kickbot', 'moobot', 'nightbot', 'streamelements', 'fossabot', 'sery_bot'])
export function isBot(msg) {
  const name = String(msg?.username ?? '').toLowerCase()
  const own = envValue('KICK_BOT_USERNAME').toLowerCase()
  return BOTS.has(name) || (own && name === own) || (msg?.badges ?? []).some((b) => String(b).toLowerCase() === 'bot')
}

/** Entry key: the Kick user id (stable where the name isn't), else the name */
const entrantId = (msg) => (msg?.kickId != null && String(msg.kickId) !== '' ? String(msg.kickId).slice(0, 40) : `name:${String(msg?.username ?? '').toLowerCase()}`)

/**
 * Extra entry rules, checked per entrant before they're added. Returns why they're
 * refused, or null to let them in. `vips`: the VIP usernames (lower case), for a
 * VIPs-only giveaway. (TEGENS has no points yet: a BotRix / site-points minimum
 * would go here, e.g. `if (g.minPoints && points(msg) < g.minPoints) return 'Not enough points'`.)
 */
export function refuseReason(g, msg, vips) {
  if (isBot(msg)) return 'bot'
  if (g.vipOnly && !vips?.has(String(msg.username).trim().toLowerCase())) return 'not a VIP'
  return null
}

/** Chat messages → new entries on `g` (mutates and returns the number added). Dedupes by kickId and name, keeps removed people out. */
export function addEntries(g, messages, at = nowSeconds(), vips = null) {
  if (!g?.open) return 0
  const seen = new Set(g.entries.map((e) => e.kickId))
  const names = new Set(g.entries.map((e) => e.name.toLowerCase()))
  let added = 0
  for (const msg of messages) {
    if (g.entries.length >= MAX_ENTRIES) break
    if (!msg?.username || !matchesKeyword(msg.text, g.keyword)) continue
    const kickId = entrantId(msg)
    const name = String(msg.username).trim().slice(0, 40)
    if (seen.has(kickId) || names.has(name.toLowerCase()) || refuseReason(g, msg, vips)) continue
    seen.add(kickId)
    names.add(name.toLowerCase())
    g.entries.push({ kickId, name, at })
    added++
  }
  return added
}

/** Who can still be drawn: entered, not removed, not drawn already (voided winners stay out too) */
export function eligible(g) {
  const drawn = new Set(g.winners.map((w) => w.kickId))
  return g.entries.filter((e) => !e.removed && !drawn.has(e.kickId))
}

/** 24–40 names for the overlay's reel, random entrants ending on the winner; no name twice in a row where avoidable */
export function buildReel(names, winner, rand = randomInt) {
  const pool = names.filter((n) => n !== winner)
  const length = rand(REEL_MIN, REEL_MAX + 1)
  const reel = []
  for (let i = 0; i < length - 1; i++) {
    if (!pool.length) {
      reel.push(winner)
      continue
    }
    let name = pool[rand(pool.length)]
    if (pool.length > 1) while (name === reel[reel.length - 1]) name = pool[rand(pool.length)]
    reel.push(name)
  }
  reel.push(winner)
  return reel
}

/** Draw one winner on `g` (mutates). redraw: void the latest winner first (they stay excluded). */
export function drawWinner(g, { redraw = false } = {}, rand = randomInt, at = nowSeconds()) {
  if (redraw) {
    const last = g.winners.find((w) => !w.void)
    if (!last) throw new InputError('There is no winner to re-draw yet.')
    last.void = true
  }
  // (a throw leaves the stored giveaway untouched: update() works on a copy)
  const pool = eligible(g)
  if (!pool.length) {
    throw new InputError(g.entries.length ? 'Everyone left has already been drawn or removed.' : 'Nobody has entered yet.')
  }
  const winner = pool[rand(pool.length)]
  const id = newId()
  const others = g.entries.filter((e) => !e.removed).map((e) => e.name)
  g.draw = { id, at, winner: winner.name, kickId: winner.kickId, reel: buildReel(others, winner.name, rand), redraw: Boolean(redraw) }
  g.winners = [{ kickId: winner.kickId, name: winner.name, drawnAt: at, drawId: id }, ...g.winners]
  return winner
}

/** What viewers and the overlay see */
export function publicGiveaway(g) {
  if (!g) return null
  const live = g.entries.filter((e) => !e.removed)
  return {
    id: g.id,
    prize: g.prize,
    keyword: g.keyword,
    open: g.open,
    vipOnly: Boolean(g.vipOnly),
    count: live.length,
    recent: live.slice(-8).reverse().map((e) => e.name),
    winners: g.winners.filter((w) => !w.void).map((w) => ({ name: w.name, drawnAt: w.drawnAt })),
    draw: g.draw,
    startedAt: g.startedAt,
  }
}

// ---------------------------------------------------------------- chat → entries

// Every write to the table goes through save(), which keeps a small gate { open, keyword }
// in memory so chat that isn't the keyword costs nothing (no table read per message).
let gate = null
const setGate = (g) => (gate = { open: Boolean(g?.open), keyword: g?.keyword ?? '' })
async function getGate() {
  return gate ?? setGate(await read('giveaway'))
}
async function save(fn) {
  const g = await update('giveaway', fn)
  setGate(g)
  return g
}

// Chat floods: entries are buffered and written a few times a second, not once per message.
const pending = []
let flushTimer = null

async function flush() {
  flushTimer = null
  const batch = pending.splice(0)
  if (!batch.length) return
  const vips = await vipSet()
  await save((g) => {
    if (g) addEntries(g, batch, nowSeconds(), vips)
    return g
  })
}

onChat('giveaway', async (msg) => {
  const { open, keyword } = await getGate()
  if (!open || !matchesKeyword(msg.text, keyword)) return
  pending.push(msg)
  flushTimer ??= setTimeout(() => flush().catch((err) => console.error('[giveaway] entries failed:', err)), 400)
})

// ---------------------------------------------------------------- recent chat (admin only, in memory)
// Every chat line, so the admin can see what entrants and winners have been saying: the
// last CHAT_FEED lines, and each viewer's last PER_VIEWER lines (by name, lower case).
// Kept in memory only: a restart starts it empty. Never sent to the public routes.
const CHAT_FEED = 200
const PER_VIEWER = 3
const VIEWERS_MAX = 5000
const chatLog = (globalThis.__tgnGiveawayChat ??= { feed: [], byName: new Map() })

onChat('giveaway-chatlog', (msg) => {
  const name = String(msg.username).trim().slice(0, 40)
  const atMs = Number(msg.at) || Date.now()
  const line = { name, text: String(msg.text).slice(0, 300), at: Math.floor((atMs > 1e12 ? atMs : atMs * 1000) / 1000) }
  chatLog.feed.unshift(line)
  if (chatLog.feed.length > CHAT_FEED) chatLog.feed.length = CHAT_FEED
  const key = name.toLowerCase()
  const mine = chatLog.byName.get(key) ?? []
  chatLog.byName.delete(key) // re-inserted last: the oldest viewer is first in line to be forgotten
  chatLog.byName.set(key, [{ text: line.text, at: line.at }, ...mine].slice(0, PER_VIEWER))
  if (chatLog.byName.size > VIEWERS_MAX) chatLog.byName.delete(chatLog.byName.keys().next().value)
})

/** The admin's chat view: the live feed and the latest lines of everyone in this giveaway */
function chatView(g) {
  const recent = {}
  if (g) {
    for (const p of [...g.entries.slice(-400), ...g.winners]) {
      const lines = chatLog.byName.get(p.name.toLowerCase())
      if (lines?.length) recent[p.name.toLowerCase()] = lines
    }
  }
  return { feed: chatLog.feed.slice(0, 80), recent }
}

// ---------------------------------------------------------------- bot lines

const say = (g, text) => {
  if (g?.announce) sendChat(text)
}
const entriesWord = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'entry' : 'entries'}`
const openLine = (g) => (g.vipOnly ? `VIP GIVEAWAY: ${g.prize}! VIPs, type ${g.keyword} in chat to enter.` : `GIVEAWAY: ${g.prize}! Type ${g.keyword} in chat to enter.`)
const closeLine = (g) => `Entries are closed for ${g.prize}: ${entriesWord(g.entries.filter((e) => !e.removed).length)}. Drawing soon!`
const winnerLine = (g, name) => `${g.draw?.redraw ? 'Re-draw: ' : ''}@${name} won ${g.prize}! Congratulations!`

// ---------------------------------------------------------------- routes

const history = async () => (await read('giveawayHistory', [])).slice(0, 30)

/** What a finished giveaway leaves on the public history */
export function pastRecord(g, endedAt = nowSeconds()) {
  const won = g.winners.filter((w) => !w.void)
  return {
    id: g.id,
    prize: g.prize,
    keyword: g.keyword,
    vipOnly: Boolean(g.vipOnly),
    startedAt: g.startedAt,
    endedAt,
    entries: g.entries.filter((e) => !e.removed).length,
    // oldest first: the order they were drawn
    winners: won.map((w) => ({ name: w.name, drawnAt: w.drawnAt })).reverse(),
    redraws: g.winners.length - won.length,
  }
}

/** The public history: every recorded giveaway, newest first, and the totals */
async function publicHistory() {
  const list = (await read('giveawayHistory', [])).slice(0, MAX_PAST)
  return {
    history: list,
    totals: {
      giveaways: list.length,
      winners: list.reduce((n, r) => n + r.winners.length, 0),
      entries: list.reduce((n, r) => n + r.entries, 0),
    },
  }
}

async function change(fn) {
  return save((g) => {
    if (!g) throw new InputError('Start a giveaway first.')
    fn(g)
    return g
  })
}

export async function handle(req, ctx) {
  const { path, method, body } = ctx
  try {
    if (path === '/api/events/giveaway/history') return json(200, await publicHistory())
    if (path === '/api/events/giveaway') {
      return json(200, { giveaway: publicGiveaway(await read('giveaway')), history: await history() })
    }

    const m = /^\/api\/admin\/giveaway(?:\/(.+))?$/.exec(path)
    if (!m) return null
    const route = m[1] ?? ''

    if (!route && method === 'GET') {
      const g = await read('giveaway')
      return json(200, { giveaway: g, history: await history(), chat: chatView(g) })
    }
    if (method !== 'POST') return json(405, { error: 'Use POST.' })

    if (route === 'start') {
      const g = {
        id: newId(),
        prize: cleanPrize(body.prize),
        keyword: cleanKeyword(body.keyword ?? '!join'),
        open: true,
        announce: body.announce !== false,
        vipOnly: body.vipOnly === true,
        // each winner goes on the public /giveaways page as it's drawn (giveawayWins.js)
        postWins: body.postWins !== false,
        // the prize's value in $ for the page's "Total given away" ("$50 tip" → 50 when not given)
        value: cleanValue(body.value, body.prize),
        startedAt: nowSeconds(),
        entries: [],
        winners: [],
        draw: null,
      }
      pending.length = 0
      await save(() => g)
      say(g, openLine(g))
      return json(200, { giveaway: g })
    }

    if (route === 'history/remove' || route === 'history/clear') {
      // a past giveaway leaves the public history, its winners leave players' profiles
      const id = String(body.id ?? '')
      const all = route === 'history/clear'
      await update('giveawayHistory', (l) => (all ? [] : l.filter((r) => r.id !== id)), [])
      await update('giveawayWins', (l) => (all ? [] : l.filter((w) => w.giveawayId !== id && w.id !== id)))
      return json(200, { history: await history() })
    }

    if (route === 'update') {
      const giveaway = await change((g) => {
        if ('prize' in body) g.prize = cleanPrize(body.prize)
        if ('keyword' in body) g.keyword = cleanKeyword(body.keyword)
        if ('announce' in body) g.announce = Boolean(body.announce)
        if ('vipOnly' in body) g.vipOnly = Boolean(body.vipOnly)
        if ('postWins' in body) g.postWins = Boolean(body.postWins)
        if ('value' in body || 'prize' in body) g.value = cleanValue('value' in body ? body.value : g.value, g.prize)
      })
      return json(200, { giveaway })
    }

    if (route === 'enter-vips') {
      // every VIP in the draw, without them typing the keyword
      const vips = await listVips()
      if (!vips.length) throw new InputError('There are no VIPs yet. Add them in admin → VIPs.')
      let added = 0
      const giveaway = await change((g) => {
        const names = new Set(g.entries.map((e) => e.name.toLowerCase()))
        const at = nowSeconds()
        for (const v of vips) {
          if (names.has(v.key) || g.entries.length >= MAX_ENTRIES) continue
          g.entries.push({ kickId: `name:${v.key}`, name: v.username, at })
          added++
        }
      })
      return json(200, { giveaway, added })
    }

    if (route === 'open' || route === 'close') {
      let was
      const giveaway = await change((g) => {
        was = g.open
        g.open = route === 'open'
      })
      if (was !== giveaway.open) say(giveaway, giveaway.open ? openLine(giveaway) : closeLine(giveaway))
      return json(200, { giveaway })
    }

    if (route === 'remove' || route === 'restore') {
      const kickId = String(body.kickId ?? '')
      const giveaway = await change((g) => {
        const e = g.entries.find((x) => x.kickId === kickId)
        if (!e) throw new InputError('That entrant isn’t in this giveaway.')
        if (route === 'remove') e.removed = true
        else delete e.removed
      })
      return json(200, { giveaway })
    }

    if (route === 'draw') {
      let winner
      let voided = null
      const giveaway = await change((g) => {
        if (body.redraw === true) voided = g.winners.find((w) => !w.void)?.drawId ?? null
        winner = drawWinner(g, { redraw: body.redraw === true })
      })
      if (giveaway.announce) setTimeout(() => sendChat(winnerLine(giveaway, winner.name)), WINNER_ANNOUNCE_DELAY)
      if (giveaway.postWins) {
        // onto /giveaways right away; a re-draw swaps the voided winner for the new one
        try {
          if (voided) await removeChatWins([voided])
          await postChatWin({ drawId: giveaway.draw.id, winner: winner.name, prize: giveaway.prize, amount: giveaway.value ?? null, at: giveaway.draw.at })
        } catch (err) {
          console.error('[giveaway] posting the winner failed:', err)
        }
      }
      return json(200, { giveaway, winner: { name: winner.name, kickId: winner.kickId } })
    }

    if (route === 'end') {
      let g = null
      await save((current) => {
        if (!current) throw new InputError('There is no giveaway running.')
        g = current
        return null
      })
      pending.length = 0
      const won = g.winners.filter((w) => !w.void)
      // a discarded (test) round takes back anything it posted on /giveaways
      if (body.discard) await removeChatWins(g.winners.map((w) => w.drawId)).catch((err) => console.error('[giveaway] unposting failed:', err))
      if (!body.discard && won.length) {
        const rows = won.map((w) => ({ id: newId(), giveawayId: g.id, name: w.name, kickId: w.kickId, prize: g.prize, at: w.drawnAt }))
        await update('giveawayWins', (list) => [...rows, ...list].slice(0, MAX_WINS))
        await update('giveawayHistory', (list) => [pastRecord(g), ...list.filter((r) => r.id !== g.id)].slice(0, MAX_PAST), [])
      }
      return json(200, { giveaway: null, history: await history(), saved: body.discard ? 0 : won.length })
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    throw err
  }
}
