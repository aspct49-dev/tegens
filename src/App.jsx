import { useCallback, useState } from 'react'
import { getPeriod } from './config'
import { useLeaderboard } from './hooks/useLeaderboard'
import { useCountdown } from './hooks/useCountdown'
import { useToast } from './hooks/useToast'
import TopBar from './components/TopBar'
import SideNav from './components/SideNav'
import Hero from './components/Hero'
import Podium from './components/Podium'
import RulesModal from './components/RulesModal'
import LeaderboardTable from './components/LeaderboardTable'
import PastLeaderboards from './components/PastLeaderboards'
import Toast from './components/Toast'

export default function App() {
  const [rulesOpen, setRulesOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [bgLoaded, setBgLoaded] = useState(false)
  const [toast, showToast] = useToast()
  const period = getPeriod()
  const countdown = useCountdown(period.endAt)
  const { loading, error, players } = useLeaderboard()
  // Stable across the 1s countdown re-renders so the modal's effects don't churn.
  const closeRules = useCallback(() => setRulesOpen(false), [])
  const closeNav = useCallback(() => setNavOpen(false), [])

  return (
    <div className="app">
      <TopBar countdown={countdown} onMenu={() => setNavOpen(true)} />
      <SideNav open={navOpen} onClose={closeNav} />
      {navOpen && <div className="nav-scrim" onClick={closeNav} />}

      <main className="main" id="leaderboard">
        <img
          className={`main-bg${bgLoaded ? ' is-loaded' : ''}`}
          src="/assets/bg-rainbet.png"
          alt=""
          onLoad={() => setBgLoaded(true)}
        />
        <div className="main-inner">
          <Hero countdown={countdown} onToast={showToast} />
          <Podium players={players} loading={loading} />

          <button className="rules-btn enter" style={{ '--d': '480ms' }} onClick={() => setRulesOpen(true)}>
            <img src="/assets/icon-rules.svg" width="14.2206" height="18.75" alt="" />
            Competition Rules
          </button>

          {error && !players.length && (
            <p className="lb-error">Live standings are temporarily unavailable — retrying automatically.</p>
          )}

          <LeaderboardTable players={players} loading={loading} />
          <PastLeaderboards />
        </div>
      </main>

      <RulesModal open={rulesOpen} onClose={closeRules} period={period} />
      <Toast visible={toast.visible}>{toast.content}</Toast>
    </div>
  )
}
