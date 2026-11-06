import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { useAuth } from '../hooks/useAuth'
import { useVips } from '../hooks/useVips'
import VipBadge from './VipBadge'
import { Link, useRouter } from '../router'
import { WAITING, useAdminWaiting } from '../hooks/useAdminWaiting'
import { pad } from '../utils'

// Full-width bar. The logo sits in a cell the width of the side nav, so it
// lines up over the sidebar column below it.
export default function TopBar({ countdown, onMenu, navOpen = false }) {
  const { days, hours, mins, secs } = countdown
  const poolK = `$${Math.round(config.prizePool / 1000)}K`

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <button className="topbar-menu" onClick={onMenu} aria-label="Open menu" aria-expanded={navOpen} aria-controls="sidenav">
          <span /><span /><span />
        </button>
        <Link className="topbar-logo" to="/" aria-label={`${config.brandName} home`}>
          <img src="/assets/tgn-logo.png" alt={config.brandName} />
        </Link>
      </div>
      {/* "Line top bar": the design's 48px divider at the sidebar edge. */}
      <img className="topbar-divider" src="/assets/line-topbar.svg" width="49" height="1" alt="" />

      <Link className="lb-banner" to="/leaderboard">
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
          <img src="/assets/rainbet-card.webp" alt="" />
        </div>
      </Link>

      <div className="topbar-actions">
        <AdminBell />
        <AccountButton />
        <a className="visit-top" href={config.casinoUrl} target="_blank" rel="noopener noreferrer">
          <span>Visit {config.casino}</span>
        </a>
      </div>
    </header>
  )
}

// The team's bell (admins and mods only): what's waiting on them, from the same counts as the
// admin panel's sidebar. It pops open by itself once per visit when something is waiting, so
// opening the site shows it straight away; after that it's a click away. Each line opens that
// admin section (a full page load: the tab is in the address, which in-app links drop).
const BELL_SEEN = 'tegens.bellShown'

const BellIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 9a6 6 0 1 1 12 0c0 3.6 1 5.7 2 7H4c1-1.3 2-3.4 2-7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

function AdminBell() {
  const { admin, mod } = useAuth()
  const { path } = useRouter()
  const role = admin ? 'admin' : mod ? 'mod' : null
  const { waiting, ready } = useAdminWaiting(role)
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const items = WAITING.filter((w) => (waiting[w.id] ?? 0) > 0)
  const total = items.reduce((a, w) => a + waiting[w.id], 0)
  const inPanel = path.startsWith('/admin')

  // once per visit: open by itself if something is waiting (not inside the panel itself)
  useEffect(() => {
    if (!ready || !total || inPanel) return
    try {
      if (window.sessionStorage.getItem(BELL_SEEN)) return
      window.sessionStorage.setItem(BELL_SEEN, '1')
    } catch {
      // no storage: open this time
    }
    setOpen(true)
  }, [ready, total, inPanel])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const onDown = (e) => !box.current?.contains(e.target) && setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  if (!role) return null
  return (
    <div className="bell" ref={box}>
      <button
        type="button"
        className={`bell-btn${total ? ' has-new' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={total ? `${total} waiting for you` : 'Nothing waiting for you'}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {total > 0 && <span className="bell-count">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Waiting for you">
          <div className="bell-head">
            <span className="bell-title">Waiting for you</span>
            <a className="bell-open" href="/admin">
              {admin ? 'Admin panel' : 'Mod panel'}
            </a>
          </div>
          {!ready ? (
            <span className="spinner bell-spin" role="status" aria-label="Loading" />
          ) : items.length === 0 ? (
            <p className="bell-empty">All caught up. Nothing is waiting.</p>
          ) : (
            <ul className="bell-list">
              {items.map((w) => {
                const n = waiting[w.id]
                return (
                  <li key={w.id}>
                    <a className="bell-item" href={`/admin?tab=${w.id}`}>
                      <span className="bell-item-n">{n}</span>
                      <span className="bell-item-what">{n === 1 ? w.one : w.many}</span>
                      <span className="bell-item-go" aria-hidden="true">
                        ›
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// Sign in with Kick, or the signed-in account (avatar, name, admin link, sign out)
function AccountButton() {
  const { status, user, admin, mod, signInWithKick, signOut } = useAuth()
  const { isVip } = useVips()
  const [open, setOpen] = useState(false)
  if (status === 'loading') return <span className="acct-slot" aria-hidden="true" />
  if (!user)
    return (
      <button className="acct-signin" onClick={() => signInWithKick()}>
        <img src="/assets/icon-kick.svg" width="14" height="14" alt="" />
        Sign in
      </button>
    )
  const name = user.kick?.username ?? user.discord?.name ?? 'Account'
  const avatar = user.kick?.avatar ?? user.discord?.avatar
  const vip = isVip(user.kick?.username, 'kick')
  return (
    <div className="acct" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <button className={`acct-me${vip ? ' is-vip' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        {avatar ? <img src={avatar} width="26" height="26" alt="" /> : <span className="acct-initial">{name[0]?.toUpperCase()}</span>}
        {vip && <VipBadge force icon />}
        <span className="acct-name">{name}</span>
        {vip && <VipBadge force />}
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <Link className="acct-item" to="/profile" role="menuitem" onClick={() => setOpen(false)}>
            Profile
          </Link>
          {(admin || mod) && (
            <Link className="acct-item" to="/admin" role="menuitem" onClick={() => setOpen(false)}>
              {admin ? 'Admin panel' : 'Mod panel'}
            </Link>
          )}
          <button className="acct-item" role="menuitem" onClick={() => (setOpen(false), signOut())}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
