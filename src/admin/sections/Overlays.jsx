import { useEffect, useRef, useState } from 'react'
import { Button, Card, SectionIntro } from '../ui'
import './site.css'

// Overlays: the OBS browser sources (src/overlays/). Each is a transparent page
// that follows the live data by itself; add it in OBS at the size shown.

const OVERLAYS = [
  { path: '/overlay/hunt', name: 'Bonus hunt', w: 460, h: 720, note: 'The current hunt: start balance, break-even, totals and every bonus as it opens.' },
  { path: '/overlay/guess', name: 'Guess the balance', w: 440, h: 280, note: 'The open round, how many have guessed, and the winner once it’s drawn.' },
  { path: '/overlay/tournament', name: 'Tournament', w: 1600, h: 620, note: 'The newest bracket, with each match’s slots and results.' },
  { path: '/overlay/giveaway', name: 'Chat giveaway', w: 540, h: 320, note: 'Keyword and entry count, then a spinning reel when you draw.' },
  { path: '/overlay/calls', name: 'Slot calls', w: 500, h: 360, note: 'The call being played: slot art, name, who called it (VIPs tagged) and what it paid, plus the next calls.' },
  { path: '/overlay/slots', name: 'Slot picker', w: 520, h: 300, note: 'A reel of slot art that spins to the slot you roll in admin → Slot Picker.' },
  { path: '/overlay/raffle', name: 'Wager raffle machine', w: 820, h: 700, note: 'The 3D machine; draws play live as you make them.' },
  { path: '/overlay/raffle?kind=watch', name: 'Watch-time raffle', w: 820, h: 700, note: 'The same machine for the watch-time raffle.' },
]

export default function OverlaysAdmin() {
  const [preview, setPreview] = useState(null)
  const [copied, setCopied] = useState(null)
  const origin = window.location.origin

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500)
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  return (
    <>
      <SectionIntro>
        Add each one in OBS as a <b>Browser Source</b> at the size shown. They have a transparent background and update by
        themselves. Every overlay takes <code>?scale=1.25</code> (anything from 0.5 to 3; <code>&amp;scale=</code> after another
        option) to draw bigger or smaller: multiply the source size by the same number.
      </SectionIntro>

      <div className="olay-grid">
        {OVERLAYS.map((o) => {
          const url = origin + o.path
          const open = preview === o.path
          return (
            <Card
              key={o.path}
              className={`olay-card${open && o.w > 900 ? ' is-wide' : ''}`}
              title={o.name}
              actions={<span className="olay-size" title="Recommended OBS browser source size">{o.w} × {o.h}</span>}
            >
              <p className="olay-note">{o.note}</p>
              <code className="olay-url">{url}</code>
              <div className="adm-row olay-actions">
                <Button kind="primary" onClick={() => copy(url)}>{copied === url ? 'Copied' : 'Copy link'}</Button>
                <Button onClick={() => setPreview(open ? null : o.path)}>{open ? 'Hide preview' : 'Preview'}</Button>
                <a className="adm-b is-ghost" href={o.path} target="_blank" rel="noopener noreferrer">Open</a>
              </div>
              {open && <ScaledFrame src={o.path} w={o.w} h={o.h} title={`${o.name} overlay preview`} />}
            </Card>
          )
        })}
      </div>
    </>
  )
}

/** The overlay at its real size, scaled down to the card's width (also used by Giveaway.jsx) */
export function ScaledFrame({ src, w, h, title }) {
  const box = useRef(null)
  const [scale, setScale] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el) return undefined
    const fit = () => setScale(Math.min(1, el.clientWidth / w))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [w])
  return (
    <div className="olay-preview" ref={box} style={{ height: scale ? h * scale : 0 }}>
      {scale > 0 && (
        <iframe src={src} title={title} width={w} height={h} style={{ width: w, height: h, transform: `scale(${scale})` }} />
      )}
      <span className="olay-scale">{Math.round(scale * 100)}%</span>
    </div>
  )
}
