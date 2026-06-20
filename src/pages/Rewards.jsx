import { config, rewards } from '../data/leaderboard'
import { fmtMoney } from '../utils'
import RewardTier from '../components/RewardTier'
import { IconExternal } from '../components/icons'

export default function Rewards() {
  const { tiers, cashbackPer, cashbackAmount } = rewards

  return (
    <section className="section" id="rewards">
      <div className="container">
        <div className="section-head">
          <h2 className="bonus-heading">REWARDS</h2>
          <p className="bonus-heading-sub">Under code <span>{config.referralCode}</span></p>
        </div>

        {/* Cashback callout — TEGENS pays you back as you wager */}
        <div className="rw-callout">
          <div className="rw-callout-badge">
            <span className="amt">{fmtMoney(cashbackAmount)}</span>
            <span className="per">/ {fmtMoney(cashbackPer / 1000)}K</span>
          </div>
          <div className="rw-callout-text">
            <h3>
              We pay you <span className="grn">{fmtMoney(cashbackAmount)}</span> for every{' '}
              <span className="wht">{fmtMoney(cashbackPer)}</span> you wager.
            </h3>
            <p>
              That’s straight from us at <strong>{config.brandName}</strong> — on top of every perk
              below. Just play under code <strong>{config.referralCode}</strong> on {config.casino} and
              your rewards climb automatically through every tier.
            </p>
          </div>
          <a className="btn btn-primary rw-callout-cta" href={config.casinoUrl} target="_blank" rel="noreferrer">
            Start earning <IconExternal />
          </a>
        </div>

        <div className="rw-grid">
          {tiers.map((tier) => <RewardTier key={tier.key} tier={tier} />)}
        </div>
      </div>
    </section>
  )
}
