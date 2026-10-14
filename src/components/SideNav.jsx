import { useEffect } from 'react'
import { config } from '../config'
import { pad } from '../utils'

export default function SideNav({ countdown, open, onClose, onOpenRules }) {
  const { days, hours, mins, secs } = countdown

  // Escape closes the mobile drawer, the same as the rules modal.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  const poolK = `$${Math.round(config.prizePool / 1000)}K`

  return (
    <aside className={`sidenav${open ? ' is-open' : ''}`} aria-label="Main">
      <a className="sidenav-logo" href={config.homeUrl} aria-label={config.brandName}>
        <img src="/assets/tgn-logo.png" alt={config.brandName} />
      </a>

      <nav className="sidenav-nav">
        {/* The leaderboard is the only page, so this is the active item. */}
        <a className="lb-banner" href="#leaderboard" aria-current="page" onClick={onClose}>
          <div className="lb-banner-text">
            <p className="lb-banner-title">
              <span className="accent">{poolK}</span> LEADERBOARD
            </p>
            <p className="lb-banner-timer">
              <img src="/assets/icon-clock.svg" width="11.0438" height="11.0438" alt="" />
              {pad(days)}:{pad(hours)}:{pad(mins)}:{pad(secs)}
            </p>
          </div>
          <div className="lb-banner-card" aria-hidden="true">
            <img src="/assets/rainbet-card.png" alt="" />
          </div>
        </a>

        <button
          className="sidenav-item"
          onClick={() => { onClose?.(); onOpenRules() }}
        >
          <img src="/assets/icon-rules.svg" width="14.2206" height="18.75" alt="" />
          Competition Rules
        </button>
      </nav>

      <div className="sidenav-foot">
        <a className="visit-top" href={config.casinoUrl} target="_blank" rel="noopener noreferrer">
          <img src="/assets/visit-btn.svg" width="135" height="37" alt="" />
          <span>Visit {config.casino}</span>
        </a>
      </div>
    </aside>
  )
}
