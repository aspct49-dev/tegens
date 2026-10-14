import { useEffect } from 'react'

// Icons are the design's own vectors (/assets). Each sits in a 17px slot so the
// labels line up at the same x whatever the glyph's width.
const SOON = [
  { label: 'Wager Milestones', icon: <img src="/assets/icon-soon-gift.svg" width="13.9972" height="14" alt="" /> },
  { label: 'Item Store', icon: <img src="/assets/icon-soon-gift.svg" width="13.9972" height="14" alt="" /> },
  // The design sets this one as a bold "?" character, not a vector.
  { label: 'How to sign up', icon: <span className="sidenav-q" aria-hidden="true">?</span> },
]

export default function SideNav({ open, onClose }) {
  // Escape closes the mobile drawer, the same as the rules modal.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <aside className={`sidenav${open ? ' is-open' : ''}`} aria-label="Main">
      <nav className="sidenav-nav">
        {/* Not built yet, so not a link: the logo already goes home. */}
        <span className="sidenav-item is-soon" aria-disabled="true">
          <span className="sidenav-ico"><img src="/assets/icon-home.svg" width="17" height="15" alt="" /></span>
          <span className="sidenav-text sidenav-home">Home</span>
          <span className="sidenav-tag">Coming soon</span>
        </span>
        <a className="sidenav-item is-active" href="#leaderboard" aria-current="page" onClick={onClose}>
          <span className="sidenav-ico"><img src="/assets/icon-winner.svg" width="14" height="14" alt="" /></span>
          <span className="sidenav-text">Leaderboard</span>
        </a>
      </nav>

      <p className="sidenav-label" id="soon-label">COMING SOON</p>
      <ul className="sidenav-soon" aria-labelledby="soon-label">
        {SOON.map((item) => (
          <li className="sidenav-item is-soon" aria-disabled="true" key={item.label}>
            <span className="sidenav-ico">{item.icon}</span>
            <span className="sidenav-text">{item.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
