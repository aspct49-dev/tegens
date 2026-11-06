// The slot catalog (public/slots.json: ~9,500 games with art), loaded once and shared
// by the admin slot search (src/admin/SlotPicker.jsx) and the public /slot-picker page.
//   games:     { key, name, slug, provider, providerId, image }
//   providers: { id, name, count }, biggest first

const IMAGE_PARAMS = '?w=180&h=240&fit=crop&auto=format'
export const providerName = (p) => String(p ?? '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

let loading = null

export function loadSlotCatalog() {
  loading ??= fetch('/slots.json')
    .then((r) => r.json())
    .then((data) => {
      const games = data.games.map(([name, slug, p, image]) => ({
        key: slug || name.toLowerCase(),
        name,
        slug,
        provider: providerName(data.providers[p] ?? ''),
        providerId: data.providers[p] ?? '',
        image: image ? `${data.imagePrefix}${image}${IMAGE_PARAMS}` : null,
      }))
      const counts = new Map()
      for (const g of games) if (g.providerId) counts.set(g.providerId, (counts.get(g.providerId) ?? 0) + 1)
      const providers = [...counts].map(([id, count]) => ({ id, name: providerName(id), count })).sort((a, b) => b.count - a.count)
      return { games, providers }
    })
    .catch((err) => {
      loading = null // let the next caller try again
      throw err
    })
  return loading
}
