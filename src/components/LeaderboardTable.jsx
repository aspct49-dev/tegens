import { config } from '../config'
import { fmtMoney, maskName } from '../utils'

// Ranks 4 → last prize slot. Empty slots still render so the prize ladder is visible.
export default function LeaderboardTable({ players, loading }) {
  const rows = config.prizes.slice(3).map((prize, i) => ({ rank: i + 4, prize, player: players[i + 3] }))

  return (
    <section className="lb-table" aria-label="Leaderboard places 4 and below">
      <div className="lb-head enter" style={{ '--d': '520ms' }}>
        <span className="lb-h-place"><span className="hash">#</span>Place</span>
        <span className="lb-h-user">
          <img src="/assets/icon-user.svg" width="12.8335" height="14" alt="" />User
        </span>
        <span className="lb-h-wager"><span className="hash">$</span>Wagered</span>
        <span className="lb-h-prize">
          <img src="/assets/icon-gift.svg" width="13.9998" height="13.9998" alt="" />Prize
        </span>
      </div>
      <img className="lb-line enter" style={{ '--d': '520ms' }} src="/assets/line-table.svg" width="803" height="0.5" alt="" />

      <ol className="lb-rows">
        {rows.map(({ rank, prize, player }, i) => {
          const name = player ? maskName(player.name) : loading ? '…' : '—'
          const wager = fmtMoney(player ? player.wagered : 0, 2)
          return (
            <li className={`lb-row enter${player ? '' : ' empty'}`} style={{ '--d': `${560 + i * 50}ms` }} key={rank}>
              <span className="lb-place">#{rank}</span>
              <span className="lb-user">
                <img src={config.rowAvatar} width="40" height="40" alt="" />
                <span className="swap" key={`n-${name}`}>{name}</span>
              </span>
              <span className="lb-wager swap" key={`w-${wager}`}>{wager}</span>
              <span className="lb-prize">{fmtMoney(prize, 2)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
