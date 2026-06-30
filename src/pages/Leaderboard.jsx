import { config } from '../data/leaderboard'
import { fmtMoney } from '../utils'
import { useLeaderboard } from '../hooks/useLeaderboard'
import Countdown from '../components/Countdown'
import Podium from '../components/Podium'
import LeaderboardTable from '../components/LeaderboardTable'
import { IconExternal } from '../components/icons'

// Countdown target = end of the leaderboard's last day, in UTC.
const periodEnd = `${config.leaderboard.endAt}T23:59:59Z`

export default function Leaderboard() {
  const { loading, error, players, updatedAt } = useLeaderboard()
  const top3 = players.slice(0, 3)

  return (
    <section className="section" id="leaderboard">
      <div className="container">
        {/* HEADER */}
        <div className="lb-hero">
          <img className="lb-logo" src="/rainbet_logo.webp" alt="Rainbet" />
          <h1 className="lb-title">
            <span className="grad">{fmtMoney(config.prizePool)}</span> <span className="white">Monthly</span><br />
            <span className="grad">Leaderboard</span>
          </h1>
          <p className="lb-sub">
            Compete against other players under code {config.referralCode} and win big rewards!
          </p>
          <div className="lb-actions">
            <div className="code-chip">
              <span className="label">CODE:</span>
              <span className="code">{config.referralCode}</span>
            </div>
            <a className="btn btn-primary" href={config.casinoUrl} target="_blank" rel="noreferrer">
              Visit {config.casino} <IconExternal />
            </a>
          </div>
        </div>

        {loading ? (
          <div className="lb-status">Loading live standings…</div>
        ) : (
          <>
            <Podium top3={top3} />

            <div className="lb-ends-lbl">Leaderboard ends in</div>
            <Countdown endDate={periodEnd} />

            <div style={{ height: 40 }} />

            <LeaderboardTable rows={players} startRank={1} />
          </>
        )}

        <p className="section-sub" style={{ textAlign: 'center', marginTop: 22, fontSize: 13 }}>
          Usernames are masked for privacy. Standings update as wagers are processed.
          {updatedAt && <> · Last updated {updatedAt} UTC</>}
          {error && <> · <span style={{ color: 'var(--text-muted)' }}>showing sample data (live feed unavailable)</span></>}
        </p>
      </div>
    </section>
  )
}
