import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { fmtMoney } from '../utils'

const fmtDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function RulesModal({ open, onClose, period }) {
  // Stay mounted through the close animation; 'shown' drives the CSS transition.
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const closeRef = useRef()

  useEffect(() => {
    if (open) {
      setMounted(true)
      let r2
      const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setShown(true))))
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 220)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('no-scroll')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('no-scroll')
    }
  }, [open, onClose])

  useEffect(() => {
    if (shown) closeRef.current?.focus({ preventScroll: true })
  }, [shown])

  if (!mounted) return null

  return (
    <div className={`modal-scrim${shown ? ' is-open' : ''}`} onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" ref={closeRef} onClick={onClose} aria-label="Close">×</button>
        <h2 id="rules-title">Competition Rules</h2>
        <ul>
          <li>
            Sign up and play on {config.casino} under code <b>{config.referralCode}</b> — only wagers made under the code count.
          </li>
          <li>
            This leaderboard runs from <b>{fmtDate(period.startAt)}</b> to <b>{fmtDate(period.endAt)}</b> (UTC).
          </li>
          <li>Players are ranked by total amount wagered during the period.</li>
          <li>
            The top {config.prizes.length} players share a {fmtMoney(config.prizePool)} prize pool, paid out after the leaderboard ends.
          </li>
          <li>Standings update automatically and may lag {config.casino} by a few minutes.</li>
          <li>Any abuse, self-wagering or exploiting will result in disqualification.</li>
        </ul>
        <p className="modal-note">18+ only. Please gamble responsibly.</p>
      </div>
    </div>
  )
}
