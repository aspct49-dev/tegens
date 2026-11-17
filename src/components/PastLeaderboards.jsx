import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { useNameMask } from '../hooks/useNameMask'
import { useUI } from '../ui'
import { fmtMoney } from '../utils'

// Past leaderboards (Figma "Past Leaderboard Section", 47:116). The months come from
// /api/past-leaderboards: every monthly leaderboard that has ended, added automatically the day
// after it ends (server/features/pastLeaderboards.js), or from config.pastLeaderboards if the API
// is down. Hidden while there are none. Newest first. Up to three cards sit in a centred row.
// With more, they sit in a centred window of three (fewer on narrow screens) that the arrows,
// the dots or a swipe move one month at a time. Each card carries its month; "View Winners"
// opens that period's final standings.

const CARD = 265 // card width (Figma)
const GAP = 8 // between cards (Figma: 273 − 265)
const MAX_VISIBLE = 3
const ARROWS = 2 * (40 + 8) // the two arrow buttons and their gaps beside the window (3 cards + arrows = 907 px)

const monthOf = (lb) =>
  lb.label ??
  (lb.startAt
    ? new Date(`${lb.startAt}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()
    : null)

function Chevron({ dir }) {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
      <path d={dir === 'prev' ? 'M8 2 2 8l6 6' : 'm2 2 6 6-6 6'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Card({ lb, hidden, onView, mask }) {
  const month = monthOf(lb)
  const name = lb.winner ? (lb.raw ? mask(lb.winner) : lb.winner) : '—'
  return (
    <div className="past-item" aria-hidden={hidden || undefined} inert={hidden ? '' : undefined}>
      <div className="past-card">
        {month && <span className="past-month">{month}</span>}
        <img className="past-avatar" src="/assets/avatar-past.png" width="113" height="113" alt="" />
        <p className="past-name">{name}</p>
        <p className="past-winner">
          <img src="/assets/icon-winner.svg" width="14" height="14" alt="" />WINNER
        </p>
        <p className="past-pool">{fmtMoney(lb.prizePool)}</p>
        <p className="past-pool-lbl">PRIZE POOL</p>
      </div>
      <button className="past-btn" onClick={() => onView(lb)}>View Winners</button>
    </div>
  )
}

/** How many cards fit the section's width (1–3); el = the section, once it's mounted */
function useVisible(el) {
  const [visible, setVisible] = useState(MAX_VISIBLE)
  useEffect(() => {
    if (!el) return undefined
    const measure = () => setVisible(Math.max(1, Math.min(MAX_VISIBLE, Math.floor((el.clientWidth - ARROWS + GAP) / (CARD + GAP)))))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return visible
}

const byNewest = (list) => [...list].sort((a, b) => (b.startAt ?? '').localeCompare(a.startAt ?? ''))

/** The ended leaderboards: the server's list, or config's if the API can't be reached */
function usePastLeaderboards() {
  const [items, setItems] = useState(null)
  useEffect(() => {
    let live = true
    fetch('/api/past-leaderboards')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => live && setItems(byNewest(d.leaderboards ?? [])))
      .catch(() => live && setItems(byNewest(config.pastLeaderboards ?? [])))
    return () => {
      live = false
    }
  }, [])
  return items
}

export default function PastLeaderboards() {
  const { openWinners } = useUI()
  const mask = useNameMask()
  const items = usePastLeaderboards()
  const [box, setBox] = useState(null)
  const fits = useVisible(box)
  const [start, setStart] = useState(0)
  const swipe = useRef(null)

  if (!items?.length) return null

  const sliding = items.length > MAX_VISIBLE
  const visible = sliding ? Math.min(fits, MAX_VISIBLE) : items.length
  const last = Math.max(0, items.length - visible)
  const at = Math.min(start, last)
  const go = (i) => setStart(Math.max(0, Math.min(last, i)))

  return (
    <section className="past" ref={setBox} aria-roledescription={sliding ? 'carousel' : undefined}>
      <h2 className="past-title">
        <span className="grad-blue">PAST</span> <span className="grad-silver">LEADERBOARDS</span>
      </h2>
      <p className="past-sub">Check out our recent Leaderboard &amp; view winners!</p>

      {!sliding ? (
        <div className="past-grid">
          {items.map((lb, i) => (
            <Card key={lb.startAt ?? i} lb={lb} mask={mask} onView={openWinners} />
          ))}
        </div>
      ) : (
        <>
          <div className="past-slider">
            <button type="button" className="past-arrow" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Newer leaderboards">
              <Chevron dir="prev" />
            </button>
            <div
              className="past-window"
              style={{ width: visible * CARD + (visible - 1) * GAP }}
              onTouchStart={(e) => (swipe.current = e.touches[0].clientX)}
              onTouchEnd={(e) => {
                if (swipe.current === null) return
                const dx = e.changedTouches[0].clientX - swipe.current
                swipe.current = null
                if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1))
              }}
            >
              <div className="past-track" style={{ transform: `translateX(${-at * (CARD + GAP)}px)` }}>
                {items.map((lb, i) => (
                  <Card key={lb.startAt ?? i} lb={lb} mask={mask} hidden={i < at || i >= at + visible} onView={openWinners} />
                ))}
              </div>
            </div>
            <button type="button" className="past-arrow" onClick={() => go(at + 1)} disabled={at === last} aria-label="Older leaderboards">
              <Chevron dir="next" />
            </button>
          </div>
          <div className="past-dots" role="group" aria-label="Choose months">
            {Array.from({ length: last + 1 }, (_, i) => (
              <button
                type="button"
                key={i}
                className={`past-dot${i === at ? ' is-on' : ''}`}
                onClick={() => go(i)}
                aria-label={`Show from ${monthOf(items[i]) ?? `leaderboard ${i + 1}`}`}
                aria-current={i === at || undefined}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
