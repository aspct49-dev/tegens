import { config } from '../config'
import { pad } from '../utils'

// Full-width bar. The logo sits in a cell the width of the side nav, so it
// lines up over the sidebar column below it; the leaderboard banner centres
// over the main content.
export default function TopBar({ countdown, onMenu }) {
  const { days, hours, mins, secs } = countdown
  const poolK = `$${Math.round(config.prizePool / 1000)}K`

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <button className="topbar-menu" onClick={onMenu} aria-label="Open menu">
          <span /><span /><span />
        </button>
        <a className="topbar-logo" href={config.homeUrl} aria-label={config.brandName}>
          <img src="/assets/tgn-logo.png" alt={config.brandName} />
        </a>
      </div>
      {/* "Line top bar": the design's 48px divider at the sidebar edge. */}
      <img className="topbar-divider" src="/assets/line-topbar.svg" width="49" height="1" alt="" />

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
    </header>
  )
}
