import { Link } from 'react-router-dom'
import { config, rafflePool } from '../data/leaderboard'
import { useRaffle } from '../hooks/useRaffle'
import { fmtMoney, maskName, initials } from '../utils'
import { IconTrophy } from './icons'

const RANK_META = {
  1: { cls: 'first', label: '1st' },
  2: { cls: 'second', label: '2nd' },
  3: { cls: 'third', label: '3rd' },
}

function HolderCard({ player, rank }) {
  const meta = RANK_META[rank]
  const avatar = config.rankAvatars[rank - 1]
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
          <span className="amt">{player.tickets.toLocaleString('en-US')}</span>
          <span className="unit">Tickets</span>
        </div>
        <span className="trophy"><IconTrophy /></span>
      </div>
    </div>
  )
}

export default function PromoBanner() {
  const { title, subtitle, cta, to } = config.promo
  // Same live ticket feed the raffle page ranks on, so the two always agree.
  // No sample fallback: made-up names would read as real ticket holders.
  const { entrants } = useRaffle()
  const [first, second, third] = entrants.slice(0, 3)

  return (
    <section className="section">
      <div className="container">
        <div className="promo">
          <div className="promo-inner">
            <div className="promo-text">
              <h2 className="promo-title">
                <span className="amt">{fmtMoney(rafflePool)}</span>
                <span className="word">{title}</span>
              </h2>
              <p className="promo-sub">{subtitle}</p>
              <Link className="promo-btn" to={to}>
                <IconTrophy /> {cta}
              </Link>
            </div>

            {/* Render 2nd, 1st, 3rd so 1st sits raised in the center. */}
            <div className="promo-podium">
              {second && <HolderCard player={second} rank={2} />}
              {first && <HolderCard player={first} rank={1} />}
              {third && <HolderCard player={third} rank={3} />}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
