import { Link } from 'react-router-dom'
import { config, fallbackPlayers } from '../data/leaderboard'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { fmtMoney, maskName, initials } from '../utils'
import { IconTrophy } from './icons'

const RANK_META = {
  1: { cls: 'first', label: '1st' },
  2: { cls: 'second', label: '2nd' },
  3: { cls: 'third', label: '3rd' },
}

function WinnerCard({ player, rank }) {
  const meta = RANK_META[rank]
  const avatar = config.rankAvatars[rank - 1]
  const prize = config.prizes[rank - 1] || 0
  return (
    <div className={`promo-pcard ${meta.cls}`}>
      <div className="promo-pcard-top">
        <div className="promo-avatar">
          {avatar ? <img src={avatar} alt="" /> : initials(player.name)}
        </div>
        <div className="promo-pname">{maskName(player.name)}</div>
        <div className="promo-pwager-lbl">Wagered</div>
        <div className="promo-pwager">
          <span className="cur">$</span>{fmtMoney(player.wagered, 2).slice(1)}
        </div>
      </div>
      <div className="promo-plaque">
        <div className="ribbon">
          <span className="amt">{fmtMoney(prize)}</span>
        </div>
        <span className="trophy"><IconTrophy /></span>
      </div>
    </div>
  )
}

export default function PromoBanner() {
  const { amount, title, subtitle, cta, to } = config.promo
  const { players } = useLeaderboard()

  // Pull the top 3 from the SAME source the leaderboard renders, so the names,
  // wagers and prizes always line up. Until the live feed resolves, seed from
  // the same offline fallback the leaderboard uses.
  const ranked = players.length
    ? players
    : [...fallbackPlayers].sort((a, b) => b.wagered - a.wagered)
  const [first, second, third] = ranked.slice(0, 3)

  return (
    <section className="section">
      <div className="container">
        <div className="promo">
          <div className="promo-inner">
            <div className="promo-text">
              <h2 className="promo-title">
                <span className="amt">{fmtMoney(amount)}</span>
                <span className="word">{title}</span>
              </h2>
              <p className="promo-sub">{subtitle}</p>
              <Link className="promo-btn" to={to}>
                <IconTrophy /> {cta}
              </Link>
            </div>

            {/* Render 2nd, 1st, 3rd so 1st sits raised in the center. */}
            <div className="promo-podium">
              {second && <WinnerCard player={second} rank={2} />}
              {first && <WinnerCard player={first} rank={1} />}
              {third && <WinnerCard player={third} rank={3} />}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
