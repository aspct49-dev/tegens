// Slot calls: viewers type `!call <slot>` in Kick chat while calls are open (everyone,
// or VIPs (./vips.js) only when `vipOnly` is on). The name is matched to the slot catalog
// for its art; the bot confirms. Each viewer has one waiting call at a time (calling again
// changes it). The admin plays calls from the queue and records what each one won; a VIP's
// wins feed their VIP stats. The overlay (/overlay/calls) shows the call being played.
// Every call carries `vip` (the caller is a VIP right now), worked out when it's read.
//
//   GET  /api/events/calls                   { open, current, next, waiting }   the overlay
//
//   GET  /api/admin/calls                    { open, announce, vipOnly, currentId, calls }
//   POST /api/admin/calls/settings           { open?, announce?, vipOnly? }
//   POST /api/admin/calls/add                { username, name, slug?, provider?, image? }   a call made for someone
//   POST /api/admin/calls/next               play the oldest waiting call
//   POST /api/admin/calls/hide               nothing on the overlay
//   POST /api/admin/calls/clear              { all? }   finished calls (or every call) leave the queue; stats stay
//   POST /api/admin/calls/<id>/play
//   POST /api/admin/calls/<id>/result        { bet?, win }
//   POST /api/admin/calls/<id>/skip | reopen | delete
//
// Table `slotCalls`: { open, announce, vipOnly, currentId, calls: call[] }   calls in arrival order, at most 500
//   call: { id, key, username, query, slot: { key, name, slug, provider, image }, matched,
//           at, status: 'waiting' | 'done' | 'skipped', bet, win, doneAt }   times unix seconds

import { randomBytes } from 'node:crypto'
import { onChat, parseCommand } from '../chatbus.js'
import { json, nowSeconds } from '../http.js'
import { sendChat } from '../kick/bot.js'
import { loadCatalog, matchSlot, slotOf } from '../slotCatalog.js'
import { logActivity } from '../audit.js'
import { read, update } from '../store.js'
import { forgetVipWin, isVip, recordVipWin, vipSet } from './vips.js'

class InputError extends Error {}

const MAX_CALLS = 500
const MAX_MONEY = 100_000_000
const EMPTY = { open: true, announce: false, vipOnly: false, currentId: null, calls: [] } // bot switch off until turned on

const newId = () => randomBytes(6).toString('base64url')
const table = async () => ({ ...EMPTY, ...(await read('slotCalls', null)) })
const save = (fn) => update('slotCalls', (cur) => fn({ ...EMPTY, ...cur }), null)
const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** The slot a typed name means: the catalog's, else the name as typed (no art) */
async function slotFor(typed) {
  const name = String(typed ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
  const { games } = await loadCatalog()
  const g = matchSlot(games, name)
  return g ? { slot: slotOf(g), matched: true } : { slot: { key: `custom:${name.toLowerCase()}`, name, slug: null, provider: null, image: null }, matched: false }
}

/** Add a call, or change the VIP's waiting one → { call, changed, place } */
function placeCall(t, { key, username, query, slot, matched }) {
  const at = nowSeconds()
  const waiting = t.calls.find((c) => c.key === key && c.status === 'waiting' && c.id !== t.currentId)
  if (waiting) {
    Object.assign(waiting, { username, query, slot, matched, at })
    return { call: waiting, changed: true, place: t.calls.filter((c) => c.status === 'waiting').indexOf(waiting) + 1 }
  }
  if (t.calls.length >= MAX_CALLS) throw new InputError(`The queue holds ${MAX_CALLS} calls. Clear the finished ones first.`)
  const call = { id: newId(), key, username, query, slot, matched, at, status: 'waiting', bet: null, win: null, doneAt: null }
  t.calls.push(call)
  return { call, changed: false, place: t.calls.filter((c) => c.status === 'waiting').length }
}

// ---------------------------------------------------------------- chat: !call <slot>

onChat('slotcalls', async (msg) => {
  const cmd = parseCommand(msg.text)
  if (cmd?.command !== 'call' || !cmd.args.length) return
  const t0 = await table()
  if (!t0.open) return
  if (t0.vipOnly && !(await isVip(msg.username))) return // VIPs only, silently
  const { slot, matched } = await slotFor(cmd.args.join(' '))
  if (!slot.name) return
  let result = null
  const t = await save((t) => {
    if (!t.open) return t
    result = placeCall(t, { key: msg.username.toLowerCase(), username: String(msg.username).slice(0, 40), query: cmd.args.join(' ').slice(0, 60), slot, matched })
    return t
  }).catch((err) => {
    if (err instanceof InputError) return null
    throw err
  })
  if (!result) return
  logActivity({ actor: msg.username, kind: 'calls', text: `${result.changed ? 'Changed their call to' : 'Called'} ${slot.name} in chat${matched ? '' : ' (not in the slot list)'}` })
  if (!t?.announce) return
  const what = matched ? `${slot.name}${slot.provider ? ` (${slot.provider})` : ''}` : `"${slot.name}" (not in the slot list, noted as typed)`
  sendChat(`@${msg.username} ${result.changed ? 'changed their call to' : 'called'} ${what} ✅ #${result.place} in the queue`)
})

// ---------------------------------------------------------------- views

const publicCall = (c, vips) => c && { id: c.id, username: c.username, vip: vips.has(c.key), slot: c.slot, status: c.status, bet: c.bet, win: c.win }

async function publicView(t) {
  const vips = await vipSet()
  const waiting = t.calls.filter((c) => c.status === 'waiting' && c.id !== t.currentId)
  return {
    open: t.open,
    vipOnly: t.vipOnly,
    current: publicCall(t.calls.find((c) => c.id === t.currentId) ?? null, vips),
    next: waiting.slice(0, 5).map((c) => ({ id: c.id, username: c.username, vip: vips.has(c.key), slot: { name: c.slot.name, image: c.slot.image } })),
    waiting: waiting.length,
  }
}

async function adminView(t) {
  const vips = await vipSet()
  return { open: t.open, announce: t.announce, vipOnly: t.vipOnly, currentId: t.currentId, calls: t.calls.map((c) => ({ ...c, vip: vips.has(c.key) })) }
}

// ---------------------------------------------------------------- input

function money(v, label, required) {
  if (v === '' || v == null) {
    if (required) throw new InputError(`Enter the ${label}.`)
    return null
  }
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) throw new InputError(`The ${label} must be between 0 and ${MAX_MONEY.toLocaleString('en-US')}.`)
  return Math.round(n * 100) / 100
}

/** Only art we'd put on a public page: the slot catalog's CDN */
const safeImage = (v) => (/^https:\/\/mediumrare\.imgix\.net\/[\w./%-]+(\?[\w=&.%-]*)?$/.test(String(v ?? '')) ? String(v) : null)

// ---------------------------------------------------------------- routes

export async function handle(req, ctx) {
  const { path, method, body } = ctx
  if (path !== '/api/events/calls' && path !== '/api/admin/calls' && !path.startsWith('/api/admin/calls/')) return null
  try {
    if (path === '/api/events/calls') return json(200, await publicView(await table()))
    if (path === '/api/admin/calls' && method === 'GET') return json(200, await adminView(await table()))
    if (method !== 'POST') return json(405, { error: 'Use POST.' })
    const route = path.slice('/api/admin/calls/'.length)
    let say = null // a bot line once saved

    if (route === 'settings') {
      let opened = false
      const t = await save((t) => {
        if ('open' in body) {
          opened = !t.open && Boolean(body.open)
          t.open = Boolean(body.open)
        }
        if ('announce' in body) t.announce = Boolean(body.announce)
        if ('vipOnly' in body) t.vipOnly = Boolean(body.vipOnly)
        return t
      })
      if (opened && t.announce) sendChat(`🎰 Slot calls are OPEN${t.vipOnly ? ' for VIPs' : ''}: type !call <slot name> in chat to call a slot.`)
      return json(200, await adminView(t))
    }

    if (route === 'add') {
      const username = String(body.username ?? '').trim().replace(/^@/, '')
      if (!/^[A-Za-z0-9_]{2,25}$/.test(username)) throw new InputError('Enter who the call is for (a Kick username).')
      const name = String(body.name ?? '').trim().slice(0, 60)
      if (!name) throw new InputError('Pick the slot.')
      const slug = /^[\w-]{1,120}$/.test(String(body.slug ?? '')) ? String(body.slug) : null
      const slot = slug
        ? { key: slug, name, slug, provider: String(body.provider ?? '').trim().slice(0, 40) || null, image: safeImage(body.image) }
        : (await slotFor(name)).slot
      const t = await save((t) => (placeCall(t, { key: username.toLowerCase(), username, query: name, slot, matched: Boolean(slot.slug) }), t))
      return json(200, await adminView(t))
    }

    if (route === 'next' || route === 'hide') {
      const t = await save((t) => {
        if (route === 'hide') return { ...t, currentId: null }
        const next = t.calls.find((c) => c.status === 'waiting' && c.id !== t.currentId)
        if (!next) throw new InputError('No calls are waiting.')
        say = `Now playing @${next.username}'s call: ${next.slot.name}!`
        return { ...t, currentId: next.id }
      })
      if (say && t.announce) sendChat(say)
      return json(200, await adminView(t))
    }

    if (route === 'clear') {
      const t = await save((t) => {
        const calls = body.all ? [] : t.calls.filter((c) => c.status === 'waiting')
        return { ...t, calls, currentId: calls.some((c) => c.id === t.currentId) ? t.currentId : null }
      })
      return json(200, await adminView(t))
    }

    const [, id, action] = /^([\w-]+)\/(play|result|skip|reopen|delete)$/.exec(route) ?? []
    if (!id) return json(404, { error: 'Not found.' })
    let win = null // what to write to the VIP's stats
    let forget = false
    const t = await save((t) => {
      const c = t.calls.find((x) => x.id === id)
      if (!c) throw new InputError('That call is no longer in the queue.')
      if (action === 'play') {
        t.currentId = c.id
        if (c.status === 'skipped') c.status = 'waiting'
        say = `Now playing @${c.username}'s call: ${c.slot.name}!`
      } else if (action === 'result') {
        c.win = money(body.win, 'win', true)
        c.bet = money(body.bet, 'bet', false)
        c.status = 'done'
        c.doneAt = nowSeconds()
        win = c
        const x = c.bet ? ` (${Math.round((c.win / c.bet) * 100) / 100}x)` : ''
        say = `@${c.username}'s call ${c.slot.name} paid ${usd(c.win)}${x}!`
      } else if (action === 'skip') {
        c.status = 'skipped'
        if (t.currentId === c.id) t.currentId = null
      } else if (action === 'reopen') {
        Object.assign(c, { status: 'waiting', win: null, bet: null, doneAt: null })
        forget = true
      } else {
        t.calls = t.calls.filter((x) => x.id !== id)
        if (t.currentId === id) t.currentId = null
        forget = true
      }
      return t
    })
    if (win && (await isVip(win.key))) await recordVipWin({ key: win.key, username: win.username, slot: win.slot, bet: win.bet, win: win.win, callId: win.id })
    if (forget) await forgetVipWin(id)
    if (say && t.announce) sendChat(say)
    return json(200, await adminView(t))
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    throw err
  }
}
