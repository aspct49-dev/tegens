// Slot challenges (bounties): hit `multiplier`× on `game` at `minBet` or more under
// the code and claim `reward` on Discord. Ported from King Kulbik's challenges.
//
// Public
//   GET  /api/content/challenges              → { challenges } (open first, then won)
// Admin
//   GET  /api/admin/challenges                → { challenges }
//   POST /api/admin/challenges                create   { game, slug?, provider?, image?, multiplier, minBet, reward, url? }
//   POST /api/admin/challenges/<id>           update   (any of the above, status, completedBy)
//   POST /api/admin/challenges/<id>/complete  { completedBy? }
//   POST /api/admin/challenges/<id>/reopen
//   POST /api/admin/challenges/<id>/delete
//
// A challenge: { id, game, slug, image, provider, multiplier, minBet, reward,
//   url, status: 'active' | 'completed', completedBy, completedAt, createdAt }
// Every write is a POST with a JSON body (the session cookie is SameSite=Lax).

import { randomBytes } from 'node:crypto'
import { json } from '../http.js'
import { read, update } from '../store.js'

// Play links. Rainbet's slot URLs aren't known yet: set a template with {slug}
// (the catalog slug from public/slots.json), e.g. 'https://rainbet.com/casino/slots/{slug}',
// and every challenge without its own `url` links there. null: no automatic links.
export const PLAY_URL_TEMPLATE = null

class InputError extends Error {}

const newId = (label) =>
  `${String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'challenge'}-${randomBytes(3).toString('hex')}`

const text = (v, label, max, required = true) => {
  const s = String(v ?? '').trim()
  if (!s && required) throw new InputError(`${label} is required.`)
  if (s.length > max) throw new InputError(`${label}: ${max} characters at most.`)
  return s
}

const number = (v, label, min, max) => {
  const n = Number(String(v ?? '').replace(/[,$\s]/g, ''))
  if (String(v ?? '').trim() === '' || !Number.isFinite(n) || n < min || n > max)
    throw new InputError(`${label} must be between ${min} and ${max.toLocaleString('en-US')}.`)
  return n
}

/** Our own files (/…) or https art (the slot catalog's imgix); empty is allowed (no art) */
const image = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/^\/[\w./-]+$/.test(s) && !s.includes('..')) return s
  if (/^https:\/\/[\w.-]+\/[^\s"'<>]*$/.test(s) && s.length <= 500) return s
  throw new InputError('Image: pick a game from the catalog, or use an https:// image link.')
}

const link = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/^https:\/\/[\w.-]+(\/[^\s"'<>]*)?$/.test(s) && s.length <= 500) return s
  throw new InputError('Play link must be an https:// address.')
}

/** Build a challenge from a body, keeping `current`'s values for anything not sent */
function fields(body, current) {
  const has = (k) => k in body
  const pick = (k, parse, fallback) => (has(k) || fallback === undefined ? parse(body[k]) : fallback)
  const status = pick(
    'status',
    (v) => {
      if (v !== 'active' && v !== 'completed') throw new InputError('Status is active or completed.')
      return v
    },
    current?.status ?? 'active',
  )
  const slug = pick(
    'slug',
    (v) => {
      const s = String(v ?? '').trim()
      if (s && !/^[a-z0-9-]{1,120}$/.test(s)) throw new InputError('Unknown game slug.')
      return s || null
    },
    current?.slug ?? null,
  )
  const completedBy = pick('completedBy', (v) => text(v, 'Winner', 40, false) || null, current?.completedBy ?? null)
  const done = status === 'completed'
  return {
    id: current?.id ?? '',
    game: pick('game', (v) => text(v, 'Game', 60), current?.game),
    slug,
    provider: pick('provider', (v) => text(v, 'Provider', 60, false) || null, current?.provider ?? null),
    image: pick('image', image, current?.image ?? null),
    multiplier: pick('multiplier', (v) => number(v, 'Target multiplier', 1, 10_000_000), current?.multiplier),
    minBet: pick('minBet', (v) => number(v, 'Minimum bet', 0, 100_000), current?.minBet),
    reward: pick('reward', (v) => number(v, 'Reward', 0, 1_000_000), current?.reward),
    url: pick('url', link, current?.url ?? null),
    status,
    completedBy: done ? completedBy : null,
    completedAt: done ? (current?.status === 'completed' ? (current.completedAt ?? Date.now()) : Date.now()) : null,
    createdAt: current?.createdAt ?? Date.now(),
  }
}

/** What the site shows: the play link resolved, open ones first (newest first), then won */
function publicList(list) {
  const playUrl = (c) => c.url ?? (PLAY_URL_TEMPLATE && c.slug ? PLAY_URL_TEMPLATE.replace('{slug}', encodeURIComponent(c.slug)) : null)
  return [...list]
    .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))
    .map((c) => ({ ...c, playUrl: playUrl(c) }))
}

async function edit(id, fn) {
  let found = null
  const list = await update('challenges', (all) => {
    const i = all.findIndex((c) => c.id === id)
    if (i < 0) throw Object.assign(new InputError('That challenge no longer exists.'), { status: 404 })
    const next = fn(all[i])
    if (next === null) return all.filter((_, j) => j !== i)
    found = next
    all[i] = next
    return all
  })
  return { challenge: found, challenges: publicList(list) }
}

export async function handle(req, ctx) {
  const { path, method, body } = ctx
  if (path === '/api/content/challenges') {
    return json(200, { challenges: publicList(await read('challenges')) })
  }
  if (path !== '/api/admin/challenges' && !path.startsWith('/api/admin/challenges/')) return null

  try {
    if (path === '/api/admin/challenges') {
      if (method === 'GET') return json(200, { challenges: publicList(await read('challenges')) })
      if (method !== 'POST') return json(405, { error: 'Use GET or POST.' })
      const challenge = fields(body)
      challenge.id = newId(`${challenge.game}-${challenge.multiplier}`)
      const list = await update('challenges', (all) => [challenge, ...all])
      return json(200, { challenge, challenges: publicList(list) })
    }

    const m = path.match(/^\/api\/admin\/challenges\/([\w-]{1,80})(?:\/(complete|reopen|delete))?$/)
    if (!m) return json(404, { error: 'Not found.' })
    if (method !== 'POST') return json(405, { error: 'Use POST.' })
    const [, id, action] = m
    if (action === 'delete') return json(200, await edit(id, () => null))
    if (action === 'complete') return json(200, await edit(id, (c) => fields({ status: 'completed', completedBy: body.completedBy ?? '' }, c)))
    if (action === 'reopen') return json(200, await edit(id, (c) => fields({ status: 'active' }, c)))
    return json(200, await edit(id, (c) => fields(body, c)))
  } catch (err) {
    if (err instanceof InputError) return json(err.status ?? 400, { error: err.message })
    throw err
  }
}
