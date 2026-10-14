import { config } from '../config'
import { pad } from '../utils'

export default function TopBar({ countdown }) {
  const { days, hours, mins, secs } = countdown
  const poolK = `$${Math.round(config.prizePool / 1000)}K`

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="topbar-logo" href={config.homeUrl} aria-label={config.brandName}>
          <img src="/assets/tgn-logo.png" alt={config.brandName} />
        </a>

        <a className="lb-banner" href="#leaderboard" aria-current="page">
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

        <a className="visit-top" href={config.casinoUrl} target="_blank" rel="noopener noreferrer">
          <img src="/assets/visit-btn.svg" width="135" height="37" alt="" />
          <span>Visit {config.casino}</span>
        </a>
      </div>
    </header>
  )
}
