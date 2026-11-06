import { config } from '../config'
import { Link } from '../router'
import { CodeButton, VisitButton } from '../components/Buttons'
import MiniPodium from '../components/MiniPodium'
import PageHeading, { PageBackdrop } from '../components/PageHeading'

const code = config.referralCode.toUpperCase()
const host = new URL(config.casinoUrl).hostname.replace(/^www\./, '')
const hostLabel = host.charAt(0).toUpperCase() + host.slice(1)

function StepLabel({ n, line1, line2 }) {
  return (
    <div className="su-step enter" style={{ '--d': '0ms' }}>
      <span className="su-step-pill">Step {n}</span>
      <span className="su-step-text">
        <span>{line1}</span>
        <b>{line2}</b>
      </span>
    </div>
  )
}

const REWARDS = [
  {
    to: '/leaderboard',
    title: (
      <>
        <span className="su-hl">$</span>
        {config.prizePool.toLocaleString('en-US')} Leaderboard
      </>
    ),
    text: (
      <>
        Climb to the top &amp; secure top place
        {' '}<br />
        for big prizes!
      </>
    ),
    art: (
      <>
        <img className="su-card-img" src="/assets/td/card-art-overlay.webp" width="260" height="115" alt="" loading="lazy" />
        <MiniPodium />
      </>
    ),
  },
  {
    to: '/store',
    title: (
      <>
        <span className="su-hl">Points</span> Store
      </>
    ),
    text: (
      <>
        Use your TEGEN points to redeem
        {' '}<br />
        various prizes from our shop
      </>
    ),
    art: <img className="su-card-img" src="/assets/td/su-cart.webp" width="260" height="115" alt="" loading="lazy" />,
  },
  {
    to: '/milestones',
    title: (
      <>
        Wager <span className="su-hl">Milestones</span>
      </>
    ),
    text: (
      <>
        Receive extra reward upon ranking
        {' '}<br />
        up on Rainbet!
      </>
    ),
    art: (
      <>
        <img className="su-card-img" src="/assets/td/card-art-overlay.webp" width="260" height="115" alt="" loading="lazy" />
        <img className="su-tier su-tier-left" src="/assets/td/tier-platinum.png" width="68" height="68" alt="" />
        <img className="su-tier su-tier-right" src="/assets/td/tier-gold.png" width="68" height="68" alt="" />
        <img className="su-tier su-tier-mid" src="/assets/td/tier-diamond.png" width="89" height="89" alt="" />
      </>
    ),
  },
]

export default function SignUpPage() {
  return (
    <div className="titled-page signup">
      <PageBackdrop />
      <img className="su-arc" src="/assets/td/su-arc.svg" width="3314" height="1093" alt="" />
      <PageHeading top="HOW TO" bottom="SIGN UP?">
        Follow these instructions in order to sign up
        {' '}<br />
        on Rainbet and earn rewards.
      </PageHeading>

      <section className="su-section su-s1" aria-label="Step 1">
        <StepLabel n={1} line1="Visit" line2={hostLabel} />
        <a className="su-shot" href={config.casinoUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${hostLabel}`}>
          <img src="/assets/td/su-screenshot.webp" width="844" height="417" alt="Rainbet home page" loading="lazy" />
        </a>
      </section>

      <section className="su-section su-s2" aria-label="Step 2">
        <StepLabel n={2} line1="Create" line2="an account" />
        <div className="su-band">
          <div className="su-register">
            <div className="su-register-copy">
              <h2 className="su-register-title grad-silver">Register</h2>
              <p className="su-register-text">
                Use code <span className="accent">{code}</span> when creating
                {' '}<br />
                an account in order to get access to our VIP system.
              </p>
              <CodeButton className="is-wide" />
              <VisitButton className="is-wide" />
            </div>
            <img className="su-register-img" src="/assets/td/su-register.png" width="363" height="224" alt="Rainbet sign-up form with referral code Tegens" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="su-section su-s3" aria-label="Step 3">
        <StepLabel n={3} line1="Enjoy" line2="the Rewards" />
        <div className="su-rewards">
          {REWARDS.map((r, i) => (
            <Link className="su-card" to={r.to} key={i}>
              <span className="su-card-art">{r.art}</span>
              <span className="su-card-title">{r.title}</span>
              <span className="su-card-text">{r.text}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
