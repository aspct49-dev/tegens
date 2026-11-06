import { Suspense, lazy, useEffect } from 'react'
import './overlay.css'

// /overlay/<kind>: an OBS browser source. Rendered without the site layout, on a
// transparent page (html.is-overlay). Each overlay is its own file here and
// reads live data with usePolled. Options come from the query string, e.g.
// ?scale=1.25 (all overlays) or ?kind=watch (raffle).

const OVERLAYS = {
  hunt: lazy(() => import('./HuntOverlay')),
  guess: lazy(() => import('./GuessOverlay')),
  tournament: lazy(() => import('./TournamentOverlay')),
  giveaway: lazy(() => import('./GiveawayOverlay')),
  raffle: lazy(() => import('./RaffleOverlay')),
  slots: lazy(() => import('./SlotOverlay')),
  calls: lazy(() => import('./CallsOverlay')),
}

export default function OverlayPage() {
  const kind = window.location.pathname.split('/')[2] ?? ''
  const params = new URLSearchParams(window.location.search)
  const scale = Math.min(3, Math.max(0.5, Number(params.get('scale')) || 1))
  const Overlay = OVERLAYS[kind]

  useEffect(() => {
    document.documentElement.classList.add('is-overlay')
    document.title = `TEGENS overlay — ${kind}`
  }, [kind])

  if (!Overlay) return <p className="ov-missing">Unknown overlay “{kind}”. Try /overlay/hunt, guess, tournament, giveaway, raffle, slots or calls.</p>
  return (
    <div className="ov-root" style={{ '--ov-scale': scale }}>
      <Suspense fallback={null}>
        <Overlay params={params} />
      </Suspense>
    </div>
  )
}
