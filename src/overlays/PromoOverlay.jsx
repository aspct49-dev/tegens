import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import './promo-overlay.css'

// /overlay/promo: an OBS browser source that rotates four 3D promo panels, each turning over
// in 3D (a rolodex flip) into the next:
//   lossback  3D "10% / LOSS BACK" + the gift box
//   rankup    3D "RANK UP / REWARDS" + the milestone badge stairs
//   monthly   3D "$10,000 / MONTHLY LEADERBOARD" between the two UFC fighters
//   code      3D "USE CODE / TEGENS" + the gold key ("your code unlocks it")
// The 3D is Blender, rendered as transparent WebMs (OBS plays the alpha), shadows baked in:
//   headlines  trophy/panels/promo/render_promo_title.py → /assets/promo/title-<id>.webm (6 s loop)
//   objects    trophy/panels/promo/render_promo_art.py   → /assets/promo/promo-<art>-intro.webm (1.8 s,
//              plays once when the card lands: light sweep + sparks) then -idle.webm (6 s calm loop that
//              starts on the intro's last frame, so the handoff is seamless)
// Options: ?seconds=7 (how long each panel shows, 3–60), ?only=monthly,code (these, in order),
// ?scale=1.25 (every overlay).

const V = '?v=5'
const PANELS = [
  { id: 'lossback', art: 'refer', foot: 'code' },
  { id: 'rankup', art: 'ms', foot: 'code' },
  { id: 'monthly', fighters: true, foot: 'lb' },
  { id: 'code', art: 'code', foot: 'rainbet' },
]
// ms after a panel mounts: the old card has turned away (FLIP_OUT), the new one turns in, and its
// 3D starts once it has landed (keep in step with promo-overlay.css)
const FLIP_OUT = 320
const ART_START = 720

function Foot({ kind }) {
  if (kind === 'rainbet')
    return (
      <span className="pr-foot">
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

/** The panel's 3D object: the intro plays once when the card lands, then the idle loops */
function Art({ name }) {
  const intro = useRef(null)
  const idle = useRef(null)
  const [looping, setLooping] = useState(false) // the intro has ended (or can't play)
  const [introGone, setIntroGone] = useState(false) // the idle is on screen

  useEffect(() => {
    const t = setTimeout(() => intro.current?.play().catch(() => setLooping(true)), ART_START)
    return () => clearTimeout(t)
  }, [])
  // if the idle can't play, the intro stays: it holds its last frame (the rest pose), so the card
  // never loses its object
  useEffect(() => {
    if (looping) idle.current?.play().catch(() => {})
  }, [looping])

  return (
    <span className="pr-art" aria-hidden="true">
      <video ref={idle} src={`/assets/promo/promo-${name}-idle.webm${V}`} loop muted playsInline preload="auto" onPlaying={() => setIntroGone(true)} />
      {!introGone && (
        <video
          ref={intro}
          src={`/assets/promo/promo-${name}-intro.webm${V}`}
          muted
          playsInline
          preload="auto"
          onEnded={() => setLooping(true)}
          onError={() => setLooping(true)}
        />
      )}
    </span>
  )
}

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
      {p.art && <Art name={p.art} />}
      <video className="pr-title" src={`/assets/promo/title-${p.id}.webm${V}`} autoPlay loop muted playsInline preload="auto" aria-hidden="true" />
      <Foot kind={p.foot} />
      <span className="pr-legal">18+ · T&amp;Cs apply</span>
    </div>
  )
}

export default function PromoOverlay({ params }) {
  const seconds = Math.min(60, Math.max(3, Number(params.get('seconds')) || 7))
  const only = (params.get('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const deck = only.length ? only.map((id) => PANELS.find((p) => p.id === id)).filter(Boolean) : PANELS

  // n counts every switch: the panel keeps one key (k<n>) from 'in' to 'out', so React keeps the
  // same element (and its videos) through its flip out; it is dropped once it has turned away
  const [at, setAt] = useState({ n: 0, prev: false })
  useEffect(() => {
    if (deck.length < 2) return undefined
    let drop = null
    const t = setInterval(() => {
      setAt((s) => ({ n: s.n + 1, prev: true }))
      clearTimeout(drop)
      drop = setTimeout(() => setAt((s) => ({ ...s, prev: false })), FLIP_OUT)
    }, seconds * 1000)
    return () => {
      clearInterval(t)
      clearTimeout(drop)
    }
  }, [deck.length, seconds])

  // warm the cache with every clip so a panel's 3D never arrives late
  useEffect(() => {
    for (const p of PANELS) {
      fetch(`/assets/promo/title-${p.id}.webm${V}`).catch(() => {})
      if (p.art) for (const c of ['intro', 'idle']) fetch(`/assets/promo/promo-${p.art}-${c}.webm${V}`).catch(() => {})
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
