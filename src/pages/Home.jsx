import { Link } from 'react-router-dom'
import { config, raffle, rafflePool } from '../data/leaderboard'
import { fmtMoney } from '../utils'
import BonusCards from '../components/BonusCards'
import PromoBanner from '../components/PromoBanner'
import { IconExternal } from '../components/icons'

export default function Home() {
  return (
    <>
      {/* HERO */}
      <div className="container">
        <section className="hero">
          <img className="hero-art" src="/rainbet_raccoon.png" alt="Rainbet mascot" />
          <img className="hero-coin coin-1" src="/goldcoin.png" alt="" aria-hidden="true" />
          <img className="hero-coin coin-2" src="/silvercoin.png" alt="" aria-hidden="true" />
          <img className="hero-coin coin-3" src="/bronzecoin.png" alt="" aria-hidden="true" />
          <img className="hero-coin coin-4" src="/goldcoin.png" alt="" aria-hidden="true" />
          <div className="hero-inner">
            <span className="hero-tag"><span className="dot" /> {config.casino.toUpperCase()} PARTNER · CODE {config.referralCode}</span>
            <h1>
              <span className="grad">{fmtMoney(rafflePool)}</span><br />
              RAFFLE
            </h1>
            <p>
              Every {fmtMoney(raffle.ticketCost)} wagered on {config.casino} under code{' '}
              <strong>{config.referralCode}</strong> earns a raffle ticket. Three winners share the pool.
            </p>
            <div className="code-row">
              <div className="code-chip">
                <span className="label">USE CODE</span>
                <span className="code">{config.referralCode}</span>
              </div>
            </div>
            <div className="hero-actions">
              <a className="btn btn-primary" href={config.casinoUrl} target="_blank" rel="noreferrer">
                Play on {config.casino} <IconExternal />
              </a>
              <Link className="btn btn-ghost" to="/leaderboard">View Raffle</Link>
            </div>
          </div>
        </section>
      </div>

      {/* BONUS CARDS */}
      <BonusCards />

      {/* RAFFLE PROMO */}
      <PromoBanner />
    </>
  )
}
