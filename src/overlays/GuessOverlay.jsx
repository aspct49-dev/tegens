import { useEffect, useRef, useState } from 'react'
import { usePolled } from '../hooks/usePolled'
import { huntMoney, huntX } from '../../server/features/huntStats.js'
import { Figure, Pill, Plate, PlateHead, Well } from './kit'
import './guess-overlay.css'

// /overlay/guess: the current Guess the Balance round. Before the draw: a big
// live guess counter, how to guess in chat and the prize. After the draw: the
// final balance counts up, then the winner is revealed in a gold-edged card.
// Options: ?scale=1.25

/** A number that glides to its new value instead of jumping */
function useTween(target, ms = 900, startFrom) {
  const [value, setValue] = useState(startFrom ?? target)
  const from = useRef(startFrom ?? target)
  useEffect(() => {
    if (target == null || !Number.isFinite(target)) return setValue(target)
    const start = performance.now()
    const a = Number.isFinite(from.current) ? from.current : 0
    let raf = 0
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms)
      const v = a + (target - a) * (1 - (1 - k) ** 3)
      from.current = v
      setValue(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

export default function GuessOverlay() {
  const { data } = usePolled('/api/events/guess', 2000)
  const round = data?.round
  if (!round) return null
  return round.status === 'drawn' && round.finalBalance != null ? <Result key={`drawn-${round.id}-${round.drawnAt}`} round={round} /> : <Live round={round} />
}

function Live({ round }) {
  const open = round.status === 'open'
  const count = useTween(round.count, 700)
  const hunt = round.hunt
  const m = (v) => huntMoney(v, hunt?.currency)

  return (
    <Plate width={400} className="gov">
      <PlateHead kicker="Guess the balance" title={round.name} right={<Pill tone={open ? 'live' : 'steel'}>{open ? 'Open' : 'Locked'}</Pill>} />

      <Well className="gov-counter">
        <span className="gov-count">
          {Math.round(count).toLocaleString('en-US')}
        </span>
        <span className="gov-count-label">{round.count === 1 ? 'guess in' : 'guesses in'}</span>
      </Well>

      {open ? (
        <div className="gov-cta">
          <span className="gov-cta-text">Type in chat</span>
          <span className="gov-cmd">
            <span className="gov-key">!guess</span>
            <span className="gov-arg">amount</span>
          </span>
          <span className="gov-cta-eg">e.g. !guess 12,500</span>
        </div>
      ) : (
        <div className="gov-locked">
          <span className="gov-lock" aria-hidden="true" />
          Guesses are locked · good luck
        </div>
      )}

      {(round.prize || hunt) && (
        <div className="gov-info">
          {round.prize && (
            <div className="gov-prize">
              <span>Prize</span>
              <b>{round.prize}</b>
            </div>
          )}
          {hunt && (
            <div className="ov-figs">
              <Figure label="Start cost" value={m(hunt.startBalance)} />
              <Figure label="Bonuses" value={hunt.opened ? `${hunt.opened}/${hunt.count}` : hunt.count} />
              {hunt.opened ? <Figure label="Paid so far" value={m(hunt.totalWon)} tone="blue" /> : <Figure label="Break-even" value={huntX(hunt.breakEven)} tone="blue" />}
            </div>
          )}
        </div>
      )}
    </Plate>
  )
}

function Result({ round }) {
  const m = (v) => huntMoney(v, round.hunt?.currency)
  const balance = useTween(round.finalBalance, 1600, 0)
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 1700)
    return () => clearTimeout(t)
  }, [])
  const w = round.winner
  const runners = round.top.slice(1, 3)

  return (
    <Plate width={400} className="gov is-drawn">
      <PlateHead kicker="Guess the balance" title={round.name} right={<Pill tone="gold">Drawn</Pill>} />

      <Well className="gov-final">
        <span className="gov-final-label">Final balance</span>
        <span className="ov-hero gov-final-value">{m(balance)}</span>
      </Well>

      {w ? (
        <div className={`gov-winner${revealed ? ' is-in' : ''}`}>
          <span className="gov-winner-label">Winner</span>
          <span className="gov-winner-name">{w.username}</span>
          <span className="gov-winner-figs">
            guessed <b>{m(w.value)}</b> · {w.offBy === 0 ? 'spot on!' : <>off by <b>{m(w.offBy)}</b></>}
          </span>
          {round.prize && (
            <span className="gov-winner-prize">
              wins <b>{round.prize}</b>
            </span>
          )}
        </div>
      ) : (
        <div className="gov-locked">No guesses this round</div>
      )}

      {w && runners.length > 0 && (
        <ol className={`gov-runners${revealed ? ' is-in' : ''}`}>
          {runners.map((g) => (
            <li key={g.place} className="gov-runner">
              <span className="gov-runner-place">{g.place}</span>
              <span className="gov-runner-name">{g.username}</span>
              <span className="gov-runner-value">{m(g.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </Plate>
  )
}
