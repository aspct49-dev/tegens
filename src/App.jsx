import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Leaderboard from './pages/Leaderboard'
import Rewards from './pages/Rewards'
import Winners from './pages/Winners'
import Links from './pages/Links'
import Slots from './pages/Slots'
import Raffle from './pages/Raffle'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import ResponsibleGambling from './pages/ResponsibleGambling'

// Per-route <title> + description so each page is distinct for search engines
// and browser tabs. (Social scrapers read the static tags in index.html.)
const ROUTE_META = {
  '/': {
    title: 'TEGENS.BET — $3,000 Rainbet Leaderboard & Rank-Up Rewards',
    description: 'Wager on Rainbet under code TEGENS and climb the $3,000 leaderboard. Rank up for the best Rainbet rewards — rakeback, daily bonuses & $10 back for every $10,000 wagered.',
  },
  '/leaderboard': {
    title: 'TEGENS.BET — $3,000 Rainbet Wager Leaderboard (Code TEGENS)',
    description: 'Live $3,000 Rainbet wager leaderboard for code TEGENS. Climb the ranks and win your share of the prize pool.',
  },
  '/rewards': {
    title: 'TEGENS.BET — Rank-Up Rewards & Best Rainbet Bonuses',
    description: 'Rank up from Bronze to Infernal Diamond for the best Rainbet rewards — rakeback, daily/weekly/monthly bonuses, freespins, and $10 back per $10,000 wagered.',
  },
  '/winners': {
    title: 'TEGENS.BET — Past Rainbet Leaderboard Winners',
    description: 'Previous TEGENS Rainbet leaderboard winners and their prizes, archived each period.',
  },
  '/raffle': {
    title: 'TEGENS.BET — $10,000 Rainbet Raffle (Code TEGENS)',
    description: 'Every $100 wagered on Rainbet under code TEGENS earns one ticket in the $10,000 raffle — $6,000, $2,500 and $1,500 prizes.',
  },
  '/slots': {
    title: 'TEGENS.BET — Random Slot Picker (3,750 Games)',
    description: 'Can’t decide what to play? Spin the TEGENS slot picker for a random slot from 3,750 games across 24 providers — Pragmatic, Hacksaw, Nolimit City and more.',
  },
  '/links': {
    title: 'TEGENS.BET — All Links (Code TEGENS)',
    description: 'Every TEGENS link in one place — play on Rainbet under code TEGENS, the monthly leaderboard, Discord, Kick and Instagram.',
  },
  '/privacy': { title: 'TEGENS.BET — Privacy Policy', description: 'How TEGENS collects, uses and protects your information.' },
  '/terms': { title: 'TEGENS.BET — Terms & Conditions', description: 'The terms governing use of the TEGENS website and leaderboard.' },
  '/responsible-gambling': { title: 'TEGENS.BET — Responsible Gambling', description: 'Gamble responsibly. 18+. Tips, warning signs and where to get help.' },
}

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector)
  if (!el) return
  el.setAttribute(attr, value)
}

function RouteMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    const meta = ROUTE_META[pathname] || ROUTE_META['/']
    document.title = meta.title
    setMeta('meta[name="description"]', 'content', meta.description)
    setMeta('meta[property="og:title"]', 'content', meta.title)
    setMeta('meta[property="og:description"]', 'content', meta.description)
    setMeta('meta[property="og:url"]', 'content', `https://tegens.bet${pathname}`)
    setMeta('link[rel="canonical"]', 'href', `https://tegens.bet${pathname === '/' ? '/' : pathname}`)
  }, [pathname])
  return null
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <BrowserRouter>
      <RouteMeta />
      <div className="app" id="top">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

        <div className="main">
          {/* Mobile top bar */}
          <div className="topbar">
            <div className="brand">
              <img src="/TGN.webp" alt="TEGENS" />
            </div>
            <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">☰</button>
          </div>

          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/winners" element={<Winners />} />
            <Route path="/links" element={<Links />} />
            <Route path="/slots" element={<Slots />} />
            <Route path="/raffle" element={<Raffle />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/responsible-gambling" element={<ResponsibleGambling />} />
          </Routes>

          <Footer />
        </div>
      </div>
    </BrowserRouter>
  )
}
