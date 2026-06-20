import { fmtMoney, maskName } from '../utils'

const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' }

export default function LeaderboardTable({ rows, startRank }) {
  if (!rows.length) return null
  return (
    <div className="lb-table-wrap">
      <table className="lb-table">
        <thead>
          <tr>
            <th style={{ width: 80 }}>Rank</th>
            <th>User</th>
            <th className="right">Wagered</th>
            <th className="right">Reward</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const rank = startRank + i
            return (
              <tr key={p.name}>
                <td><span className={`rank-pill ${MEDAL[rank] || ''}`}>{rank}</span></td>
                <td>
                  <div className="user-cell">{maskName(p.name)}</div>
                </td>
                <td className="right"><span className="wager-val"><span className="cur">$</span>{fmtMoney(p.wagered, 2).slice(1)}</span></td>
                <td className="right"><span className="reward-val">{fmtMoney(p.prize)}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
