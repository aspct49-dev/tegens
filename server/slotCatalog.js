// The slot catalog (public/slots.json, ~9,500 games with art) on the server, loaded
// once. Used by the slot picker (./features/slotpick.js) and VIP slot calls
// (./features/slotcalls.js).
//   games:     { key, name, slug, provider, providerId, image, norm }
//   providers: { id, name, count }, biggest first

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const IMAGE_PARAMS = '?w=180&h=240&fit=crop&auto=format'
// dev serves public/, the VPS serves the built copy in dist/
const FILES = ['../public/slots.json', '../dist/slots.json'].map((p) => fileURLToPath(new URL(p, import.meta.url)))

export const providerName = (p) => String(p ?? '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
/** "Gates of Olympus 1000!" → "gatesofolympus1000" (how typed names are compared) */
export const normName = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')

let catalog = null

export async function loadCatalog() {
  if (catalog) return catalog
  for (const file of FILES) {
    const data = await readFile(file, 'utf8').then(JSON.parse, () => null)
    if (!data?.games) continue
    const games = data.games.map(([name, slug, p, image]) => ({
      key: slug || name.toLowerCase(),
      name,
      slug,
      provider: providerName(data.providers[p]),
      providerId: data.providers[p] ?? '',
      image: image ? `${data.imagePrefix}${image}${IMAGE_PARAMS}` : null,
      norm: normName(name),
    }))
    const counts = new Map()
    for (const g of games) if (g.providerId) counts.set(g.providerId, (counts.get(g.providerId) ?? 0) + 1)
    const providers = [...counts].map(([id, count]) => ({ id, name: providerName(id), count })).sort((a, b) => b.count - a.count)
    catalog = { games, providers }
    return catalog
  }
  throw new Error('The slot catalog (slots.json) is missing.')
}

/** A slot as stored: no catalog-only fields */
export const slotOf = (g) => ({ key: g.key, name: g.name, slug: g.slug ?? null, provider: g.provider ?? null, image: g.image ?? null })

/**
 * The game a typed name means, or null: an exact match, else the shortest name that
 * starts with it, else the shortest that contains it, else one with every typed word
 * ("gates 1000" → Gates of Olympus 1000).
 */
export function matchSlot(games, typed) {
  const q = normName(typed)
  if (q.length < 3) return null
  const shortest = (list) => list.reduce((best, g) => (!best || g.norm.length < best.norm.length ? g : best), null)
  const exact = games.find((g) => g.norm === q)
  if (exact) return exact
  const starts = shortest(games.filter((g) => g.norm.startsWith(q)))
  if (starts) return starts
  const has = shortest(games.filter((g) => g.norm.includes(q)))
  if (has) return has
  const words = String(typed).toLowerCase().split(/\s+/).map(normName).filter((w) => w.length >= 2)
  return words.length > 1 ? shortest(games.filter((g) => words.every((w) => g.norm.includes(w)))) : null
}
