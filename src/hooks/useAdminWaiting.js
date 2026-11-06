import { useEffect, useState } from 'react'

// What's waiting on the team, per admin section: { claims: 3, links: 1, … }. Shared by the admin
// panel's sidebar badges (AdminPage.jsx) and the bell in the site's top bar (TopBar.jsx), so the
// two always agree. Admins read /api/admin/overview; a mod only sees claims (the overview is
// admins'). Refreshed every 30 s, when the tab comes back into view, and after any admin change
// (src/admin/api.js fires 'adm:changed').
//
//   role: 'admin' | 'mod' | null (null: nothing is fetched)

/** The waiting kinds, in the order the bell lists them, with how to say them */
export const WAITING = [
  { id: 'claims', one: 'claim to check', many: 'claims to check' },
  { id: 'links', one: 'Rainbet link request', many: 'Rainbet link requests' },
  { id: 'wager-store', one: 'Wager Store order', many: 'Wager Store orders' },
  { id: 'shop', one: 'Watch Store order', many: 'Watch Store orders' },
  { id: 'big-wins', one: 'big win to approve', many: 'big wins to approve' },
]

export function useAdminWaiting(role) {
  const [waiting, setWaiting] = useState({})
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!role) {
      setWaiting({})
      setReady(false)
      return undefined
    }
    let live = true
    let inFlight = false
    const load = async () => {
      if (inFlight || document.hidden) return
      inFlight = true
      try {
        if (role === 'mod') {
          // a mod can't read the overview: ask the two lists they work through
          const [claims, links] = await Promise.all(
            ['/api/admin/claims?status=pending', '/api/admin/players?status=pending'].map((u) =>
              fetch(u, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
            ),
          )
          if (!claims && !links) return
          if (live) setWaiting({ claims: claims?.counts?.pending ?? 0, links: links?.pending ?? 0 })
        } else {
          const res = await fetch('/api/admin/overview', { credentials: 'same-origin' })
          if (!res.ok) return
          const o = await res.json()
          if (live)
            setWaiting({
              claims: o.claims?.pending ?? 0,
              'big-wins': o.bigWins?.pending ?? 0,
              links: o.players?.rainbetPending ?? 0,
              'wager-store': o.wagerStore?.pending ?? 0,
              shop: o.shop?.pending ?? 0,
            })
        }
        if (live) setReady(true)
      } catch {
        // keep the last counts
      } finally {
        inFlight = false
      }
    }
    load()
    const t = setInterval(load, 30_000)
    const onVisible = () => !document.hidden && load()
    window.addEventListener('adm:changed', load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      clearInterval(t)
      window.removeEventListener('adm:changed', load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [role])
  return { waiting, ready }
}
