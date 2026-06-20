import { Link } from 'react-router-dom'
import { bonuses, config } from '../data/leaderboard'

function CardButton({ card }) {
  const cls = `bonus-claim ${card.accent}`
  if (card.to) return <Link className={cls} to={card.to}>{card.cta}</Link>
  return (
    <a className={cls} href={card.href} target="_blank" rel="noreferrer">{card.cta}</a>
  )
}

export default function BonusCards() {
  return (
    <section className="section" id="bonuses">
      <div className="container">
        <div className="section-head">
          <h2 className="bonus-heading">BONUSES</h2>
          <p className="bonus-heading-sub">Under code <span>{config.referralCode}</span></p>
        </div>

        <div className="bonus-grid">
          {bonuses.map((card) => (
            <div key={card.title} className={`bonus-card ${card.accent} ${card.featured ? 'featured' : ''}`}>
              <div className="bonus-icon">
                <img src={card.img} alt="" loading="lazy" />
              </div>
              <div className="bonus-title">{card.title}</div>
              <div className="bonus-sub">{card.subtitle}</div>
              <div className="bonus-rows">
                {card.rows.map((r) => (
                  <div className="bonus-row" key={r}>{r}</div>
                ))}
              </div>
              <CardButton card={card} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
