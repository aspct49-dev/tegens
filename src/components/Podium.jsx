import { config } from '../config'
import { fmtMoney, maskName } from '../utils'

const PLACES = { 1: 'first', 2: 'second', 3: 'third' }
// Entrance stagger: 1st lands first, then 2nd and 3rd.
const DELAY = { 1: 240, 2: 320, 3: 400 }

function Card({ player, rank, loading }) {
  const empty = !player
  const name = empty ? (loading ? '…' : '—') : maskName(player.name)
  const wager = empty ? '$0' : fmtMoney(player.wagered)
  return (
    <div className={`podium-card ${PLACES[rank]} enter`} style={{ '--d': `${DELAY[rank]}ms` }}>
      <div className="podium-lift">
        <img className="podium-bg" src={`/assets/box-top${rank}.png`} width="281" height="349" alt="" />
        <div className="podium-content">
          <img className="podium-avatar" src={config.rankAvatars[rank - 1]} width="113" height="113" alt="" />
          {/* Keyed so new live values fade in instead of snapping. */}
          <p className="podium-name swap" key={`n-${name}`}>{name}</p>
          <div className="podium-wager">
            <span className="swap" key={`w-${wager}`}>{wager}</span>
          </div>
          <p className="podium-wager-lbl">WAGERED</p>
          <p className="podium-reward">{fmtMoney(config.prizes[rank - 1] || 0)}</p>
          <p className="podium-reward-lbl">REWARD</p>
        </div>
      </div>
    </div>
  )
}

export default function Podium({ players, loading }) {
  const [first, second, third] = players
  // DOM order 1st/2nd/3rd for mobile stacking; CSS places 2nd | 1st | 3rd on desktop.
  return (
    <section className="podium" aria-label="Top 3">
      <Card player={first} rank={1} loading={loading} />
      <Card player={second} rank={2} loading={loading} />
      <Card player={third} rank={3} loading={loading} />
    </section>
  )
}
