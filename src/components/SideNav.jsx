import { useEffect } from 'react'
import { config } from '../config'

// Inline so they take currentColor: grey when idle, blue when active.
const IconHome = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M11.3 2.3a1 1 0 0 1 1.4 0l9 8.6a1 1 0 0 1-.7 1.7H19v8.4a1 1 0 0 1-1 1h-4v-6h-4v6H6a1 1 0 0 1-1-1v-8.4H3a1 1 0 0 1-.7-1.7z" />
  </svg>
)
const IconTrophy = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M6 3h12v2h3v2.5A4.5 4.5 0 0 1 17 12a6 6 0 0 1-4 3.8V18h3v3H8v-3h3v-2.2A6 6 0 0 1 7 12a4.5 4.5 0 0 1-4-4.5V5h3zm0 4H5v.5c0 1 .4 1.8 1 2.3zm12 0v2.8c.6-.5 1-1.3 1-2.3V7z" />
  </svg>
)
const IconGift = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M4 8h16v4H4zM5 13h6v8H5zm8 0h6v8h-6zM11 8h2v13h-2zM12 7.5S10.6 3 8.2 3.4C6 3.8 6.6 7 9 7.5zm0 0s1.4-4.5 3.8-4.1c2.2.4 1.6 3.6-.8 4.1z" />
  </svg>
)
const IconHelp = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" aria-hidden="true">
    <path d="M8.2 8.6a3.8 3.8 0 1 1 5.4 3.4c-1 .5-1.6 1.2-1.6 2.4v.4" />
    <circle cx="12" cy="20" r="1.3" fill="currentColor" stroke="none" />
  </svg>
)

// Not built yet: shown greyed out under "Coming soon", not clickable.
const SOON = [
  { label: 'Wager Milestones', icon: <IconGift /> },
  { label: 'Item Store', icon: <IconGift /> },
  { label: 'How to sign up', icon: <IconHelp /> },
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
        <a className="sidenav-item" href={config.homeUrl}>
          <IconHome />
          Home
        </a>
        <a className="sidenav-item is-active" href="#leaderboard" aria-current="page" onClick={onClose}>
          <IconTrophy />
          Leaderboard
        </a>
      </nav>

      <p className="sidenav-label" id="soon-label">Coming soon</p>
      <ul className="sidenav-soon" aria-labelledby="soon-label">
        {SOON.map((item) => (
          <li className="sidenav-item is-soon" aria-disabled="true" key={item.label}>
            {item.icon}
            {item.label}
          </li>
        ))}
      </ul>
    </aside>
  )
}
