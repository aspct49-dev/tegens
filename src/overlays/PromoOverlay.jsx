import { useEffect, useState } from 'react'
import { config } from '../config'
import './promo-overlay.css'

// /overlay/promo: an OBS browser source that rotates four 3D promo panels, each flipping over
// in 3D into the next:
//   lossback  3D "10% / LOSS BACK" + the gift box
//   rankup    3D "RANK UP / REWARDS" + the milestone badge stairs
//   monthly   3D "$10,000 / MONTHLY" between the two UFC fighters from the leaderboard
//   code      a big 3D "USE CODE / TEGENS" on Rainbet
// The 3D is Blender, rendered as transparent looping WebMs (OBS plays the alpha):
//   headlines  trophy/panels/render_promo_text.py  → /assets/promo/title-<id>.webm
//   objects    trophy/panels/render_panel_alpha.py → /assets/promo/promo-<art>.webm
// Options: ?seconds=7 (how long each panel shows, 3–60), ?only=monthly,code (these, in order),
// ?scale=1.25 (every overlay).

const V = '?v=4'
const PANELS = [
  { id: 'lossback', art: 'refer', foot: 'code' },
  { id: 'rankup', art: 'ms', foot: 'code' },
  { id: 'monthly', fighters: true, foot: 'lb' },
  { id: 'code', big: true, foot: 'rainbet' },
]

function Foot({ kind }) {
  if (kind === 'rainbet')
    return (
      <span className="pr-foot is-center">
        <span className="pr-foot-label">on</span>
        <img className="pr-foot-logo" src="/assets/td/rainbet-wordmark.png" width="206" height="70" alt={config.casino} />
      </span>
    )
  return (
    <span className={`pr-foot${kind === 'lb' ? ' is-center' : ''}`}>
      <span className="pr-foot-label">Use code</span>
      <span className="pr-chip">{config.referralCode.toUpperCase()}</span>
      <img className="pr-foot-logo" src="/assets/td/rainbet-wordmark.png" width="206" height="70" alt={config.casino} />
    </span>
  )
}

const Loop = ({ src, className }) => <video className={className} src={src} autoPlay loop muted playsInline preload="auto" aria-hidden="true" />

function Panel({ p, state }) {
  return (
    <div className={`pr-panel is-${p.id} is-${state}`}>
      <div className="pr-card" />
      {p.fighters && (
        <>
          <img className="pr-fighter is-l" src="/assets/promo/fighter-l.png" alt="" />
          <img className="pr-fighter is-r" src="/assets/promo/fighter-r.png" alt="" />
        </>
      )}
      {p.art && <Loop className="pr-art" src={`/assets/promo/promo-${p.art}.webm${V}`} />}
      <Loop className={`pr-title${p.big || p.fighters ? ' is-center' : ''}${p.big ? ' is-big' : ''}`} src={`/assets/promo/title-${p.id}.webm${V}`} />
      <Foot kind={p.foot} />
    </div>
  )
}

export default function PromoOverlay({ params }) {
  const seconds = Math.min(60, Math.max(3, Number(params.get('seconds')) || 7))
  const only = (params.get('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const deck = only.length ? only.map((id) => PANELS.find((p) => p.id === id)).filter(Boolean) : PANELS

  // n counts every switch: the panel keeps one key (k<n>) from 'in' to 'out', so React keeps the
  // same element and its videos play on through the flip; the old one is dropped once it's gone
  const [at, setAt] = useState({ n: 0, prev: false })
  useEffect(() => {
    if (deck.length < 2) return undefined
    let drop = null
    const t = setInterval(() => {
      setAt((s) => ({ n: s.n + 1, prev: true }))
      clearTimeout(drop)
      drop = setTimeout(() => setAt((s) => ({ ...s, prev: false })), 560)
    }, seconds * 1000)
    return () => {
      clearInterval(t)
      clearTimeout(drop)
    }
  }, [deck.length, seconds])

  // warm the cache with every loop so a panel's 3D never arrives late
  useEffect(() => {
    for (const p of PANELS) {
      fetch(`/assets/promo/title-${p.id}.webm${V}`).catch(() => {})
      if (p.art) fetch(`/assets/promo/promo-${p.art}.webm${V}`).catch(() => {})
    }
  }, [])

  if (!deck.length) return null
  const cur = deck[at.n % deck.length]
  const prev = at.prev && at.n > 0 ? deck[(at.n - 1) % deck.length] : null
  return (
    <div className="pr-stage">
      {prev && prev !== cur && <Panel key={`k${at.n - 1}`} p={prev} state="out" />}
      <Panel key={`k${at.n}`} p={cur} state="in" />
    </div>
  )
}
