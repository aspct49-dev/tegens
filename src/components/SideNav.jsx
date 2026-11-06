import { useEffect } from 'react'
import { config } from '../config'
import { usePlayer } from '../hooks/usePlayer'
import { getProgress } from '../milestones'
import { Link, useRouter } from '../router'
import { NAV_GROUPS, ROUTES } from '../routes'
import { useUI } from '../ui'

// Grey and active (blue) glyphs come from the design. Each sits in a 17px slot
// so every label starts at the same x.
const ICON_SIZE = {
  home: [17, 15],
  leaderboard: [14, 14],
  milestones: [14, 15],
  bonuses: [15, 12],
  store: [14, 14],
  raffles: [15, 12],
  giveaways: [15, 15],
  hunt: [15, 15],
  guess: [15, 15],
  tournaments: [15, 14],
  challenges: [12, 15],
  slots: [15, 15],
  socials: [15, 15],
  wins: [15, 15],
  weekly: [15, 15],
  contact: [15, 12],
}

function NavIcon({ icon, active }) {
  if (icon === 'refer') return <span className={`nav-coin${active ? ' is-active' : ''}`} aria-hidden="true">$</span>
  if (icon === 'help') return <span className={`sidenav-q${active ? ' is-active' : ''}`} aria-hidden="true">?</span>
  const [w, h] = ICON_SIZE[icon]
  return <img src={`/assets/td/nav-${icon}${active ? '-active' : ''}.svg`} width={w} height={h} alt="" />
}

// The rank card under the nav: current tier, next tier and the progress
// between them, for the username saved in this browser.
function RankCard() {
  const player = usePlayer()
  const { openPlayer } = useUI()
  const tiers = config.milestones.tiers
  const { current, next, pct } = getProgress(player.wagered)
  const known = player.known

  let title = 'Track your rank'
  let detail = 'Enter your Rainbet username'
  if (player.username && player.status === 'loading') {
    title = player.username
    detail = 'Loading progress…'
  } else if (player.username && player.status === 'error') {
    title = player.username
    detail = 'Progress unavailable'
  } else if (known) {
    title = player.username
    detail = `Progress: ${(pct * 100).toFixed(2)}%`
  }

  const left = known ? current || tiers[0] : tiers[0]
  const right = known ? next || current : tiers[1]

  return (
    <button className="rank-card" onClick={openPlayer}>
      <img className={`rank-ico${known && current ? '' : ' dim'}`} src={left.icon} width="21" height="21" alt="" />
      <span className="rank-text">
        <span className="rank-name">{title}</span>
        <span className="rank-detail">{detail}</span>
        <span className="sr-only">{known ? ' (change username)' : ' (set username)'}</span>
      </span>
      <img className={`rank-ico rank-next${known ? '' : ' dim'}`} src={right.icon} width="21" height="21" alt="" />
      <span className="rank-bar" aria-hidden="true">
        <span style={{ width: `${known ? pct * 100 : 0}%` }} />
      </span>
    </button>
  )
}

export default function SideNav({ open, onClose }) {
  const { path } = useRouter()

  // Escape closes the mobile drawer, the same as the dialogs.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <aside id="sidenav" className={`sidenav${open ? ' is-open' : ''}`} aria-label="Main">
      <nav className="sidenav-nav">
        {NAV_GROUPS.map((g) => {
          const items = ROUTES.filter((r) => r.group === g.id)
          if (!items.length) return null
          return (
            <div className="sidenav-group" key={g.id} role="group" aria-labelledby={g.title ? `nav-${g.id}` : undefined}>
              {g.title && (
                <p className="sidenav-group-title" id={`nav-${g.id}`}>
                  {g.title}
                </p>
              )}
              {items.map((r) => {
                // not built yet: the name and a "Soon" tag, nothing to click
                if (r.soon)
                  return (
                    <span className="sidenav-item is-soon" key={r.label} aria-disabled="true">
                      <span className="sidenav-ico"><NavIcon icon={r.icon} /></span>
                      <span className="sidenav-text">
                        {r.label}
                        <span className="sidenav-soon">Coming soon</span>
                      </span>
                    </span>
                  )
                const active = r.path === path
                return (
                  <Link className={`sidenav-item${active ? ' is-active' : ''}`} to={r.path} onClick={onClose} key={r.path}>
                    <span className="sidenav-ico"><NavIcon icon={r.icon} active={active} /></span>
                    <span className="sidenav-text">{r.label}</span>
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
      <RankCard />
    </aside>
  )
}
