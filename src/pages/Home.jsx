import { config } from '../data/leaderboard'
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
              <span className="grad">{fmtMoney(config.prizePool)}</span><br />
              LEADERBOARD
            </h1>
            <p>
              Climb to the top of the {config.casino} leaderboard under code{' '}
              <strong>{config.referralCode}</strong> and win your share of crazy prizes.
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
              <a className="btn btn-ghost" href="#bonuses">View Bonuses</a>
            </div>
          </div>
        </section>
      </div>

      {/* BONUS CARDS */}
      <BonusCards />

      {/* $50K LEADERBOARD PROMO */}
      <PromoBanner />
    </>
  )
}
