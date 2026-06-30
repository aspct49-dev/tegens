import { config } from '../data/leaderboard'
import { usePastWinners } from '../hooks/usePastWinners'
import { fmtMoney, maskName } from '../utils'

const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' }

export default function Winners() {
  const { loading, periods } = usePastWinners()

  return (
    <section className="section" id="winners">
      <div className="container">
        <div className="section-head">
          <h2 className="bonus-heading">PAST WINNERS</h2>
          <p className="bonus-heading-sub">Under code <span>{config.referralCode}</span></p>
        </div>

        {loading ? (
          <div className="lb-status">Loading past winners…</div>
        ) : periods.length === 0 ? (
          <div className="lb-status">
            No past winners yet — they’ll appear here automatically once the current
            leaderboard ends.
          </div>
        ) : (
          <div className="winners-list">
            {periods.map((p) => (
              <div className="winners-card" key={p.id}>
                <div className="winners-card-head">
                  <h3>{p.label}</h3>
                  <span className="wc-pool">{fmtMoney(p.prizePool)} prize pool</span>
                </div>
                <div className="lb-table-wrap">
                  <table className="lb-table">
                    <thead>
                      <tr>
                        <th style={{ width: 80 }}>Rank</th>
                        <th>User</th>
                        <th className="right">Wagered</th>
                        <th className="right">Prize</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.winners.map((w) => (
                        <tr key={w.rank}>
                          <td><span className={`rank-pill ${MEDAL[w.rank] || ''}`}>{w.rank}</span></td>
                          <td><div className="user-cell">{maskName(w.name)}</div></td>
                          <td className="right">
                            <span className="wager-val"><span className="cur">$</span>{fmtMoney(w.wagered, 2).slice(1)}</span>
                          </td>
                          <td className="right"><span className="reward-val">{fmtMoney(w.prize)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
