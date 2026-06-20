import { config } from '../data/leaderboard'
import { fmtMoney, maskName, initials } from '../utils'

const META = {
  1: { cls: 'first', label: '1st' },
  2: { cls: 'second', label: '2nd' },
  3: { cls: 'third', label: '3rd' },
}

function Card({ player, rank }) {
  const m = META[rank]
  const avatar = config.rankAvatars[rank - 1]
  return (
    <div className={`podium-col ${m.cls}`}>
      <div className="podium-card">
        <div className="avatar-wrap">
          <div className="avatar">
            {avatar ? <img className="avatar-img" src={avatar} alt="" /> : initials(player.name)}
          </div>
          <span className="rank-badge">{m.label}</span>
        </div>
        <div className="podium-name">{maskName(player.name)}</div>
        <div className="podium-wager-lbl">Wagered</div>
        <div className="wager-pill">
          <span className="cur">$</span>{fmtMoney(player.wagered, 2).slice(1)}
        </div>
      </div>
      <div className="prize-plaque">
        <div className="ribbon">
          <span className="amt">{fmtMoney(player.prize)}</span>
        </div>
        <span className="trophy">🏆</span>
      </div>
    </div>
  )
}

export default function Podium({ top3 }) {
  // Render 2nd, 1st, 3rd so 1st sits raised in the center.
  const [first, second, third] = top3
  return (
    <div className="podium">
      {second && <Card player={second} rank={2} />}
      {first && <Card player={first} rank={1} />}
      {third && <Card player={third} rank={3} />}
    </div>
  )
}
