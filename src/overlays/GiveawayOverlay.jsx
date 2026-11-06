import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePolled } from '../hooks/usePolled'
import { Foot, Pill, Plate, PlateHead, Well } from './kit'
import './giveaway-overlay.css'
import VipBadge from '../components/VipBadge'

// /overlay/giveaway: "type !join" with a live entry count; a draw made while the
// overlay is up spins the reel (built by the server, so every viewer sees the same
// names) and lands on a gold-edged winner card. A draw made before it loaded just shows.

const POLL = 1500
const ROW = 50
const SPIN_MS = 4700

const word = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'entry' : 'entries'}`
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function GiveawayOverlay() {
  const { data } = usePolled('/api/events/giveaway', POLL)
  const g = data?.giveaway ?? null
  const seen = useRef(undefined) // the draw id in the first answer (undefined until then)
  const [spin, setSpin] = useState(null) // { draw } while the reel runs

  const drawId = g?.draw?.id ?? null
  useEffect(() => {
    if (!data) return
    if (seen.current === undefined) {
      seen.current = drawId // made before load: shown, not played
      return
    }
    if (drawId && drawId !== seen.current) {
      seen.current = drawId
      setSpin({ draw: g.draw })
    }
  }, [data, drawId, g])

  if (!g) return null
  const spinning = spin && spin.draw.id === drawId
  const draw = g.draw

  return (
    <Plate width={460} className={`ovg${draw && !spinning ? ' is-winner' : ''}`}>
      <PlateHead
        kicker={g.vipOnly ? 'TEGENS · VIP giveaway' : 'TEGENS · Giveaway'}
        title={g.prize}
        right={spinning ? <Pill tone="live">Drawing</Pill> : draw ? <Pill tone="gold">Winner</Pill> : g.open ? <Pill tone="live">Open</Pill> : <Pill>Closed</Pill>}
      />
      {spinning ? (
        <Reel key={spin.draw.id} draw={spin.draw} onDone={() => setSpin(null)} />
      ) : draw ? (
        <Winner key={draw.id} name={draw.winner} prize={g.prize} redraw={draw.redraw} />
      ) : (
        <Join g={g} />
      )}
      <Foot>
        <span className="ovg-count">
          <b>{g.count.toLocaleString('en-US')}</b>{' '}
          {g.count === 1 ? 'entry' : 'entries'}
        </span>
        <span>{g.open ? <>Type <b className="ovg-kw-sm">{g.keyword}</b> to enter</> : 'Entries closed'}</span>
      </Foot>
    </Plate>
  )
}

// ---------------------------------------------------------------- idle

function Join({ g }) {
  return (
    <Well className="ovg-join">
      {g.open ? (
        <>
          <span className="ovg-join-line">
            Type <span className="ovg-kw">{g.keyword}</span> in chat
          </span>
          {g.recent.length > 0 && (
            <span className="ovg-recent">
              {g.recent.slice(0, 3).map((n) => (
                <span key={n} className="ovg-recent-name">
                  {n}
                </span>
              ))}
              <span className="ovg-recent-tail">joined</span>
            </span>
          )}
        </>
      ) : (
        <span className="ovg-join-line is-closed">
          Entries closed · {word(g.count)} · <span className="ovg-soon">drawing soon</span>
        </span>
      )}
    </Well>
  )
}

// ---------------------------------------------------------------- the reel

function Reel({ draw, onDone }) {
  const track = useRef(null)
  const [landed, setLanded] = useState(false)
  const done = useRef(onDone)
  done.current = onDone

  // a name above the first and below the winner, so the window's three rows are always full
  const names = draw.reel
  const rows = [names[names.length - 2] ?? names[0], ...names, names[1] ?? names[0]]
  const end = -(rows.length - 3) * ROW // the winner (rows.length - 2) in the middle row

  useLayoutEffect(() => {
    const el = track.current
    if (!el) return undefined
    const quick = reducedMotion()
    const ms = quick ? 500 : SPIN_MS
    let landTimer = null
    let doneTimer = null
    const land = () => {
      setLanded(true)
      doneTimer = setTimeout(() => done.current(), quick ? 300 : 1100)
    }
    if (!el.animate) {
      el.style.transform = `translateY(${end}px)`
      land()
      return () => clearTimeout(doneTimer)
    }
    // fast start, long deceleration, a touch past the winner and back (the reel "clicks" in)
    const move = el.animate(
      [
        { transform: 'translateY(0)', easing: 'cubic-bezier(0.18, 0.55, 0.12, 1)' },
        { transform: `translateY(${end - ROW * 0.18}px)`, offset: 0.93, easing: 'ease-in-out' },
        { transform: `translateY(${end}px)` },
      ],
      { duration: ms, fill: 'forwards' },
    )
    const blur = quick
      ? null
      : el.animate([{ filter: 'blur(0px)' }, { filter: 'blur(2.2px)', offset: 0.08 }, { filter: 'blur(1.2px)', offset: 0.45 }, { filter: 'blur(0px)', offset: 0.78 }], {
          duration: ms,
          fill: 'forwards',
        })
    landTimer = setTimeout(land, ms)
    return () => {
      clearTimeout(landTimer)
      clearTimeout(doneTimer)
      move.cancel()
      blur?.cancel()
    }
  }, [draw.id, end])

  return (
    <Well className={`ovg-reel${landed ? ' is-landed' : ''}`}>
      <div className="ovg-reel-window" aria-hidden="true">
        <div className="ovg-reel-track" ref={track}>
          {rows.map((n, i) => (
            <span key={i} className={`ovg-reel-name${i === rows.length - 2 ? ' is-winner' : ''}`}>
              {n}
            </span>
          ))}
        </div>
      </div>
      <span className="ovg-payline" aria-hidden="true" />
    </Well>
  )
}

// ---------------------------------------------------------------- winner

function Winner({ name, prize, redraw }) {
  return (
    <div className="ovg-win">
      <span className="ovg-win-kicker">{redraw ? 'Re-draw · Winner' : 'Winner'}</span>
      <span className="ovg-win-name">
        {name}
        <VipBadge name={name} via="kick" size="md" />
      </span>
      <span className="ovg-win-prize">
        wins <b>{prize}</b>
      </span>
    </div>
  )
}
