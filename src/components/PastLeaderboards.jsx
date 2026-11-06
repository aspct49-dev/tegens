import { config } from '../config'
import { useUI } from '../ui'
import { fmtMoney } from '../utils'

// Edit config.pastLeaderboards. Hidden when the list is empty. "View Winners"
// opens that period's final standings (needs startAt/endAt on the entry).
export default function PastLeaderboards() {
  const { openWinners } = useUI()
  const items = config.pastLeaderboards
  if (!items.length) return null

  return (
    <section className="past">
      <h2 className="past-title">
        <span className="grad-blue">PAST</span> <span className="grad-silver">LEADERBOARDS</span>
      </h2>
      <p className="past-sub">Check out our recent Leaderboard &amp; view winners!</p>

      <div className="past-grid">
        {items.map((lb, i) => (
          <div className="past-item" key={i}>
            <div className="past-card">
              <img className="past-avatar" src="/assets/avatar-past.png" width="113" height="113" alt="" />
              <p className="past-name">{lb.winner}</p>
              <p className="past-winner">
                <img src="/assets/icon-winner.svg" width="14" height="14" alt="" />WINNER
              </p>
              <p className="past-pool">{fmtMoney(lb.prizePool)}</p>
              <p className="past-pool-lbl">PRIZE POOL</p>
            </div>
            <button className="past-btn" onClick={() => openWinners(lb)}>View Winners</button>
          </div>
        ))}
      </div>
    </section>
  )
}
