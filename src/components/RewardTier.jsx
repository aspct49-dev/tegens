import { fmtMoney } from '../utils'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

// The six perks, in unlock order. A tier's `perks` count unlocks the first N.
const PERKS = [
  { label: 'Rakeback',          glyph: 'rakeback' },
  { label: 'Daily Bonus',       glyph: '1' },
  { label: 'Weekly Bonus',      glyph: '7' },
  { label: 'Monthly Bonus',     glyph: '30' },
  { label: 'Pre-Monthly Bonus', glyph: 'star' },
  { label: 'Weekly Freespins',  glyph: 'spin' },
]

const Lock = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" width="12" height="12" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

function PerkGlyph({ glyph }) {
  if (glyph === 'rakeback') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
        <path d="M12 8.5v7M10.3 14.2c.3.6 1 .9 1.7.9 1 0 1.7-.5 1.7-1.3 0-1.8-3.4-1-3.4-2.8 0-.8.7-1.3 1.6-1.3.7 0 1.3.3 1.6.9" />
      </svg>
    )
  }
  if (glyph === 'star') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" />
      </svg>
    )
  }
  if (glyph === 'spin') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 1 3 6.7" /><path d="M3 21v-5h5" />
        <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="700"
          fill="currentColor" stroke="none" fontFamily="Chakra Petch, sans-serif">7</text>
      </svg>
    )
  }
  return <span className="rw-perk-num">{glyph}</span>
}

export default function RewardTier({ tier }) {
  const { key, name, range, icon, reach, perks } = tier
  const total = reach[reach.length - 1]
  const title = range ? `${name} ${range}` : name

  return (
    <div className={`rw-tier ${key}`}>
      <div className="rw-tier-head">
        <img className="rw-tier-icon" src={icon} alt={name} loading="lazy" />
        <h3 className="rw-tier-name">{title}</h3>
        <p className="rw-tier-progress">
          <span className="cur">$0.00</span> / <span className="goal">{fmtMoney(total, 2)}</span> Wagered
        </p>
        <div className="rw-progress-bar"><span style={{ width: '0%' }} /></div>
      </div>

      <div className="rw-levels">
        {reach.map((amount, i) => (
          <div className="rw-level" key={i}>
            <div className="rw-level-name">{name} {ROMAN[i]} <Lock className="rw-level-lock" /></div>
            <div className="rw-level-reach">{fmtMoney(amount, 2)} to reach</div>
          </div>
        ))}
      </div>

      <div className="rw-perks-title">Perks</div>
      <div className="rw-perks">
        {PERKS.map((p, i) => {
          const locked = i >= perks
          return (
            <div className={`rw-perk ${locked ? 'locked' : ''}`} key={p.label}>
              <span className="rw-perk-ic"><PerkGlyph glyph={p.glyph} /></span>
              <span className="rw-perk-lbl">{p.label}</span>
              {locked && <Lock className="rw-perk-lock" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
