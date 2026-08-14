import { useEffect, useRef, useState } from 'react'

// One card's stride along the strip, including the gap. Must match the CSS.
const CARD_W = 168
const SPIN_MS = 5200
// How many cards ride past before the winner lands — enough travel that the
// deceleration reads as a real spin rather than a jump.
const RUNWAY = 34
// Cards sitting left of the marker when a spin starts, so the reel is already
// full rather than winding in from an empty gap.
const LEAD = 6

// Unbiased random integer in [0, max). `Math.random() * n | 0` skews toward low
// indices; rejection sampling on a uniform 32-bit draw doesn't.
function randInt(max) {
  if (max <= 0) return 0
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const limit = Math.floor(0xffffffff / max) * max
    const u = new Uint32Array(1)
    do { crypto.getRandomValues(u) } while (u[0] >= limit)
    return u[0] % max
  }
  return Math.floor(Math.random() * max)
}

function pickRandom(arr) {
  return arr[randInt(arr.length)]
}

// Fill the strip by drawing at random, never repeating a neighbour so the reel
// doesn't visibly stutter on a duplicate as it slows down.
function buildStrip(pool, length) {
  const out = []
  for (let i = 0; i < length; i++) {
    let next = pickRandom(pool)
    if (pool.length > 1) {
      let guard = 0
      while (next.name === out[i - 1]?.name && guard++ < 12) next = pickRandom(pool)
    }
    out.push(next)
  }
  return out
}

// translateX that puts card `i` under the centre marker.
function centerOn(view, i) {
  return view.offsetWidth / 2 - CARD_W / 2 - i * CARD_W
}

function Card({ slot }) {
  return (
    <div className="reel-card">
      {slot.img
        ? <img className="reel-card-art" src={slot.img} alt="" loading="lazy" />
        : <div className="reel-card-art placeholder">{slot.name.slice(0, 1)}</div>}
      <div className="reel-card-name">{slot.name}</div>
      <div className="reel-card-prov">{slot.provider}</div>
    </div>
  )
}

/**
 * Horizontal slot reel. Calls `onLand(slot)` when the spin settles.
 * The winner is drawn up front, then the strip is built so that card sits at
 * the landing index — the animation is presentation, the pick is already made.
 */
export default function SlotReel({ pool, spinning, onLand }) {
  const [strip, setStrip] = useState([])
  const trackRef = useRef(null)
  const viewRef = useRef(null)
  const seqRef = useRef(0)

  // Idle strip so the reel isn't empty before the first spin. Long enough to
  // overflow a wide viewport on both sides of the marker.
  useEffect(() => {
    if (spinning || !pool.length) return
    setStrip(buildStrip(pool, 24))
  }, [pool, spinning])

  // Park the idle strip with a card under the marker. Centring on the middle of
  // the strip (rather than card 0) keeps both halves of the reel filled.
  useEffect(() => {
    if (spinning) return
    const track = trackRef.current
    const view = viewRef.current
    if (!track || !view || !strip.length) return
    track.style.transition = 'none'
    track.style.transform = `translateX(${centerOn(view, Math.floor(strip.length / 2))}px)`
  }, [strip, spinning])

  // Run one spin.
  useEffect(() => {
    if (!spinning || !pool.length) return
    const track = trackRef.current
    const view = viewRef.current
    if (!track || !view) return

    const seq = ++seqRef.current
    const winner = pickRandom(pool)
    // Cards either side of the winner so the reel stays full at both ends of
    // the travel — LEAD to the left at the start, spare cards to the right.
    const next = buildStrip(pool, RUNWAY + LEAD + 8)
    next[RUNWAY] = winner
    setStrip(next)

    // Land anywhere within the middle 60% of the card rather than dead centre,
    // so repeated spins don't stop in a suspiciously identical position.
    const jitter = (randInt(61) - 30) / 100 * CARD_W
    const start = centerOn(view, LEAD)
    const end = centerOn(view, RUNWAY) + jitter

    const raf = requestAnimationFrame(() => {
      // Snap to the start with no transition, then force a reflow so the browser
      // treats the two transforms as separate states. Without this read the
      // start and end collapse into one style recalc and nothing animates.
      track.style.transition = 'none'
      track.style.transform = `translateX(${start}px)`
      void track.offsetWidth
      requestAnimationFrame(() => {
        track.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.10, 0.82, 0.16, 1)`
        track.style.transform = `translateX(${end}px)`
      })
    })

    const t = setTimeout(() => {
      if (seqRef.current === seq) onLand(winner)
    }, SPIN_MS + 80)

    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning])

  return (
    <div className="reel-view" ref={viewRef}>
      <div className="reel-marker" />
      <div className="reel-track" ref={trackRef}>
        {strip.map((s, i) => <Card key={`${s.name}-${i}`} slot={s} />)}
      </div>
      <div className="reel-fade left" />
      <div className="reel-fade right" />
    </div>
  )
}
