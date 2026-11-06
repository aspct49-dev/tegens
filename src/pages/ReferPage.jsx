import { config } from '../config'
import { fmtMoney } from '../utils'
import { CodeButton, DiscordButton, VisitButton } from '../components/Buttons'
import PageHeading, { PageBackdrop } from '../components/PageHeading'

const code = config.referralCode.toUpperCase()
const reward = fmtMoney(config.referral.reward)
const minWager = fmtMoney(config.referral.minWager)

// Step 1 has its own art; the others draw a small piece of UI over the shared art panel,
// in the same "button on a dark panel" style.
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2.5 7.4 5.6 10.3 11.5 3.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const STEPS = [
  { image: '/assets/td/ref-step1.webp', text: <>Create a <span className="accent">Ticket</span> on Discord</>, href: config.discordUrl },
  {
    text: <>Refer a High roller</>,
    mock: (
      <span className="rm-chip">
        <span className="rm-dim">Code:</span> {config.referralCode}
      </span>
    ),
  },
  {
    text: <>Must complete <span className="accent">KYC</span></>,
    mock: (
      <span className="rm-badge">
        <Check /> Verified
      </span>
    ),
  },
  {
    text: <>Wager above <span className="accent">$</span>{minWager.slice(1)}</>,
    mock: (
      <span className="rm-progress">
        <span className="rm-progress-top is-done">
          <span>
            <Check /> Completed
          </span>
        </span>
        <span className="rm-bar" />
      </span>
    ),
  },
  {
    text: <>Get <span className="accent">{reward}</span> Referral reward!</>,
    // the Home page's gift box (Bonuses tile), rising out of the bottom of the art panel
    clip: true,
    mock: <img className="rm-gift" src="/assets/refer-gift.webp" width="120" height="128" alt="" loading="lazy" />,
  },
  {
    text: <>Refer more players</>,
    mock: (
      <span className="rm-people">
        <span>A</span>
        <span>K</span>
        <span>M</span>
        <span className="is-more">+</span>
      </span>
    ),
  },
]

function ReferCard({ step, index }) {
  const body = (
    <>
      <img className="refer-card-img" src={step.image || '/assets/td/card-art-overlay.webp'} width="260" height="98" alt="" loading="lazy" />
      {step.mock && (
        <span className={`refer-mock${step.clip ? ' is-clip' : ''}`} aria-hidden="true">
          {step.mock}
        </span>
      )}
      <p className="refer-card-text">
        <span className="refer-num">#{index + 1}</span>
        <span>{step.text}</span>
      </p>
    </>
  )
  const style = { '--d': `${200 + index * 50}ms` }
  return step.href ? (
    <a className="refer-card is-link enter" style={style} href={step.href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className="refer-card enter" style={style}>
      {body}
    </div>
  )
}

export default function ReferPage() {
  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="REFER A" bottom="HIGH ROLLER">
        Bring High roller under code <b className="accent">{code}</b> &amp; receive a fixed
        {' '}<br />
        {reward} Referral reward after they wager.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <DiscordButton className="discuss-btn">Discuss a Referral</DiscordButton>
        <CodeButton />
        <VisitButton />
      </div>

      <ol className="refer-grid">
        {STEPS.map((s, i) => (
          <li key={i}>
            <ReferCard step={s} index={i} />
          </li>
        ))}
      </ol>
    </div>
  )
}
