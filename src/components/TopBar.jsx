import { config } from '../config'

// Mobile only: the side nav is off-canvas below 960px, so this bar carries the
// logo and the control that opens it.
export default function TopBar({ onMenu }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="topbar-menu" onClick={onMenu} aria-label="Open menu">
          <span /><span /><span />
        </button>
        <a className="topbar-logo" href={config.homeUrl} aria-label={config.brandName}>
          <img src="/assets/tgn-logo.png" alt={config.brandName} />
        </a>
      </div>
    </header>
  )
}
