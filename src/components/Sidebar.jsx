import { Link, NavLink } from 'react-router-dom'
import { config } from '../data/leaderboard'
import {
  IconHome, IconTrophy, IconGift, IconBolt, IconSword,
  IconDiscord, IconKick, IconInstagram,
} from './icons'

const nav = [
  { label: 'Home', icon: <IconHome />, to: '/', end: true },
  { label: 'Leaderboard', icon: <IconTrophy />, to: '/leaderboard', badge: `$${(config.prizePool / 1000)}K` },
  { label: 'Bonuses', icon: <IconGift />, to: '/', hash: '#bonuses' },
  { label: 'Rewards', icon: <IconBolt />, to: '/rewards' },
  { label: 'Challenges', icon: <IconSword />, soon: true },
]

export default function Sidebar({ open, onClose }) {
  const s = config.socials
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <Link className="sidebar-logo" to="/" onClick={onClose} aria-label="TEGENS home">
        <img src="/TGN.webp" alt="TEGENS logo" />
      </Link>

      <nav className="nav">
        {nav.map((n) => {
          if (n.soon) {
            return (
              <span key={n.label} className="nav-item" style={{ cursor: 'default' }}>
                <span className="ico">{n.icon}</span>
                {n.label}
                <span className="soon">SOON</span>
              </span>
            )
          }
          return (
            <NavLink
              key={n.label}
              to={n.hash ? n.to + n.hash : n.to}
              end={n.end}
              className={({ isActive }) => `nav-item ${isActive && !n.hash ? 'active' : ''}`}
              onClick={onClose}
            >
              <span className="ico">{n.icon}</span>
              {n.label}
              {n.badge && <span className="badge">{n.badge}</span>}
            </NavLink>
          )
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-socials">
        <a href={s.discord} target="_blank" rel="noreferrer" aria-label="Discord"><IconDiscord /></a>
        <a href={s.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><IconInstagram /></a>
        <a href={s.kick} target="_blank" rel="noreferrer" aria-label="Kick"><IconKick /></a>
      </div>
    </aside>
  )
}
