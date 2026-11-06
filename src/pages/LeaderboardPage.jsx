import { useState } from 'react'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useUI } from '../ui'
import Hero from '../components/Hero'
import Podium from '../components/Podium'
import LeaderboardTable from '../components/LeaderboardTable'
import PastLeaderboards from '../components/PastLeaderboards'

export default function LeaderboardPage({ countdown }) {
  const [bgLoaded, setBgLoaded] = useState(false)
  const { openRules } = useUI()
  const { loading, error, players } = useLeaderboard()

  return (
    <>
      <img
        className={`main-bg${bgLoaded ? ' is-loaded' : ''}`}
        src="/assets/bg-rainbet.webp"
        alt=""
        onLoad={() => setBgLoaded(true)}
      />
      <div className="main-inner">
        <Hero countdown={countdown} />
        <Podium players={players} loading={loading} />

        <button className="rules-btn enter" style={{ '--d': '480ms' }} onClick={openRules}>
          <img src="/assets/icon-rules.svg" width="14.2206" height="18.75" alt="" />
          Competition Rules
        </button>

        {error && !players.length && (
          <p className="lb-error">Live standings are temporarily unavailable — retrying automatically.</p>
        )}

        <LeaderboardTable players={players} loading={loading} />
        <PastLeaderboards />
      </div>
    </>
  )
}
