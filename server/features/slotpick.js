// Random slot picker: the admin rolls a slot for stream, from the whole catalog
// (public/slots.json, optionally narrowed to some providers) or from their own
// list. The server picks, so the admin page and the overlay show the same spin.
//
//   GET  /api/events/slotpick                 { draw, recent }   the latest roll (the overlay plays its reel)
//
//   GET  /api/admin/slotpick                  { draw, history, list, settings, providers }
//   POST /api/admin/slotpick/roll             { source: 'all' | 'list', providers?: string[], noRepeats?, announce? }
//   POST /api/admin/slotpick/list/add         { name, slug?, provider?, image? }
//   POST /api/admin/slotpick/list/remove      { key }
//   POST /api/admin/slotpick/list/clear
//   POST /api/admin/slotpick/history/clear
//
// Table `slotPick`:
//   { draw: { id, at, slot, reel: slot[] } | null,
//     history: slot-with-{ id, at }[],                       newest first, at most 50
//     list: slot[],                                          the admin's own pool
//     settings: { source, providers: string[], noRepeats, announce } }
// A slot is { key, name, slug, provider, image }; times are unix seconds.

import { randomBytes, randomInt } from 'node:crypto'
import { json, nowSeconds } from '../http.js'
import { sendChat } from '../kick/bot.js'
import { loadCatalog, slotOf } from '../slotCatalog.js'
import { read, update } from '../store.js'

class InputError extends Error {}

const MAX_HISTORY = 50
const MAX_LIST = 300
const REEL_MIN = 22
const REEL_MAX = 32
/** The overlay's reel runs ~5 s; the bot names the slot once it has landed */
const ANNOUNCE_DELAY = 5500

const newId = () => randomBytes(6).toString('base64url')
const EMPTY = { draw: null, history: [], list: [], settings: { source: 'all', providers: [], noRepeats: true, announce: true } }
const table = async () => ({ ...EMPTY, ...(await read('slotPick', null)) })

// ---------------------------------------------------------------- pure rules (exported for checks)

/** The pool a roll draws from */
export function poolFor({ source, providers = [], noRepeats }, games, list, history) {
  let pool = source === 'list' ? list : providers.length ? games.filter((g) => providers.includes(g.providerId)) : games
  if (noRepeats) {
    const picked = new Set(history.map((h) => h.key))
    const fresh = pool.filter((g) => !picked.has(g.key))
    // everything has been picked already: start over rather than refuse
    if (fresh.length) pool = fresh
  }
  return pool
}

/** 22–32 slots for the overlay's reel, random ones ending on the pick; never the same slot twice in a row */
export function buildReel(pool, pick, rand = randomInt) {
  const others = pool.filter((g) => g.key !== pick.key)
  const length = rand(REEL_MIN, REEL_MAX + 1)
  const reel = []
  for (let i = 0; i < length - 1; i++) {
    if (!others.length) {
      reel.push(pick)
      continue
    }
    let g = others[rand(others.length)]
    if (others.length > 1) while (g.key === reel[reel.length - 1]?.key) g = others[rand(others.length)]
    reel.push(g)
  }
  reel.push(pick)
  return reel.map(slotOf)
}

// ---------------------------------------------------------------- input

function cleanSettings(body, current) {
  const source = body.source === 'list' ? 'list' : body.source === 'all' ? 'all' : current.source
  const providers = Array.isArray(body.providers) ? [...new Set(body.providers.map((p) => String(p).trim().toLowerCase()).filter(Boolean))].slice(0, 60) : current.providers
  return {
    source,
    providers,
    noRepeats: 'noRepeats' in body ? Boolean(body.noRepeats) : current.noRepeats,
    announce: 'announce' in body ? Boolean(body.announce) : current.announce,
  }
}

/** Only art we'd put on a public page: the slot catalog's CDN */
const safeImage = (v) => (/^https:\/\/mediumrare\.imgix\.net\/[\w./%-]+(\?[\w=&.%-]*)?$/.test(String(v ?? '')) ? String(v) : null)

function cleanListSlot(body) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
  if (!name) throw new InputError('Pick a slot to add.')
  const slug = /^[\w-]{1,120}$/.test(String(body.slug ?? '')) ? String(body.slug) : null
  return { key: slug || `custom:${name.toLowerCase()}`, name, slug, provider: String(body.provider ?? '').trim().slice(0, 40) || null, image: safeImage(body.image) }
}

// ---------------------------------------------------------------- routes

const publicView = (t) => ({ draw: t.draw, recent: t.history.slice(0, 6) })

async function adminView(t) {
  const { providers } = await loadCatalog()
  return { ...t, history: t.history.slice(0, 20), providers }
}

export async function handle(req, ctx) {
  const { path, method, body } = ctx
  if (path !== '/api/events/slotpick' && path !== '/api/admin/slotpick' && !path.startsWith('/api/admin/slotpick/')) return null
  try {
    if (path === '/api/events/slotpick') return json(200, publicView(await table()))
    if (path === '/api/admin/slotpick' && method === 'GET') return json(200, await adminView(await table()))
    if (method !== 'POST') return json(405, { error: 'Use POST.' })
    const route = path.slice('/api/admin/slotpick/'.length)

    if (route === 'roll') {
      const { games } = await loadCatalog()
      let draw = null
      let settings = null
      const t = await update(
        'slotPick',
        (cur) => {
          const next = { ...EMPTY, ...cur }
          settings = cleanSettings(body, next.settings)
          const pool = poolFor(settings, games, next.list, next.history)
          if (!pool.length) throw new InputError(settings.source === 'list' ? 'Your list is empty. Add some slots first.' : 'No slots match those providers.')
          const pick = slotOf(pool[randomInt(pool.length)])
          const at = nowSeconds()
          draw = { id: newId(), at, slot: pick, reel: buildReel(pool, pick) }
          return { ...next, settings, draw, history: [{ ...pick, id: draw.id, at }, ...next.history].slice(0, MAX_HISTORY) }
        },
        null,
      )
      if (settings.announce) {
        const s = draw.slot
        setTimeout(() => sendChat(`🎰 Slot picker landed on ${s.name}${s.provider ? ` (${s.provider})` : ''}!`), ANNOUNCE_DELAY)
      }
      return json(200, await adminView(t))
    }

    if (route === 'list/add') {
      const slot = cleanListSlot(body)
      const t = await update(
        'slotPick',
        (cur) => {
          const next = { ...EMPTY, ...cur }
          if (next.list.some((s) => s.key === slot.key)) throw new InputError(`${slot.name} is already on your list.`)
          if (next.list.length >= MAX_LIST) throw new InputError(`The list holds ${MAX_LIST} slots at most.`)
          return { ...next, list: [...next.list, slot] }
        },
        null,
      )
      return json(200, await adminView(t))
    }

    if (route === 'list/remove' || route === 'list/clear' || route === 'history/clear') {
      const key = String(body.key ?? '')
      const t = await update(
        'slotPick',
        (cur) => {
          const next = { ...EMPTY, ...cur }
          if (route === 'list/remove') return { ...next, list: next.list.filter((s) => s.key !== key) }
          if (route === 'list/clear') return { ...next, list: [] }
          return { ...next, history: [], draw: null }
        },
        null,
      )
      return json(200, await adminView(t))
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    throw err
  }
}
