import { useLayoutEffect, useRef, useState } from 'react'
import './SlotReel.css'

// A horizontal reel of slot art that spins to a slot picker roll (server/features/slotpick.js
// builds `draw.reel`, ending on the pick). Shared by admin → Slot Picker and /overlay/slots.
//   play: spin now (else it just sits on the pick) · onDone: called once it has landed
//   idle: nothing picked yet (no gold frame, no dimming), e.g. before a page's first spin

const CARD = 96 // card width, px (SlotReel.css)
const STEP = CARD + 10 // card + gap
const PAD = 4 // spare cards either side so the window is always full
const SPIN_MS = 4800

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function SlotReel({ draw, play = false, idle = false, onDone, className = '' }) {
  const win = useRef(null)
  const track = useRef(null)
  const [width, setWidth] = useState(0)
  const [landed, setLanded] = useState(!play)
  const done = useRef(onDone)
  done.current = onDone

  const reel = draw.reel
  const cards = [...reel.slice(-PAD - 1, -1), ...reel, ...reel.slice(0, PAD)]
  const winner = PAD + reel.length - 1
  /** translateX that puts card `i` in the middle of the window */
  const centre = (i) => width / 2 - (i * STEP + CARD / 2)
  const start = centre(PAD)
  const end = centre(winner)

  // the window's width decides where "the middle" is
  useLayoutEffect(() => {
    const el = win.current
    if (!el) return undefined
    setWidth(el.clientWidth)
    if (!window.ResizeObserver) return undefined
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = track.current
    if (!el || !width) return undefined
    if (!play || !el.animate) {
      el.style.transform = `translateX(${end}px)`
      if (play) {
        setLanded(true)
        done.current?.()
      }
      return undefined
    }
    setLanded(false)
    const quick = reducedMotion()
    const ms = quick ? 500 : SPIN_MS
    // fast start, long deceleration, a touch past the pick and back (the reel "clicks" in)
    const move = el.animate(
      [
        { transform: `translateX(${start}px)`, easing: 'cubic-bezier(0.16, 0.6, 0.1, 1)' },
        { transform: `translateX(${end - STEP * 0.16}px)`, offset: 0.94, easing: 'ease-in-out' },
        { transform: `translateX(${end}px)` },
      ],
      { duration: ms, fill: 'forwards' },
    )
    const blur = quick
      ? null
      : el.animate([{ filter: 'blur(0px)' }, { filter: 'blur(2.5px)', offset: 0.08 }, { filter: 'blur(1px)', offset: 0.5 }, { filter: 'blur(0px)', offset: 0.8 }], {
          duration: ms,
          fill: 'forwards',
        })
    let doneTimer = null
    const landTimer = setTimeout(() => {
      setLanded(true)
      doneTimer = setTimeout(() => done.current?.(), quick ? 200 : 900)
    }, ms)
    return () => {
      clearTimeout(landTimer)
      clearTimeout(doneTimer)
      move.cancel()
      blur?.cancel()
      el.style.transform = `translateX(${end}px)`
    }
    // a new roll remounts the reel (keyed by draw id), so the draw itself isn't a dependency
  }, [play, width, start, end])

  return (
    <div className={`sreel${landed && !idle ? ' is-landed' : ''} ${className}`}>
      <div className="sreel-window" ref={win} aria-hidden="true">
        <div className="sreel-track" ref={track}>
          {cards.map((s, i) => (
            <span key={i} className={`sreel-card${i === winner ? ' is-pick' : ''}`}>
              {s.image ? <img src={s.image} alt="" width={CARD} height={128} /> : <span className="sreel-noart">{s.name}</span>}
            </span>
          ))}
        </div>
      </div>
      <span className="sreel-frame" aria-hidden="true" />
    </div>
  )
}
