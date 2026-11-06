import { config } from '../config'
import { Link } from '../router'
import { useUI } from '../ui'
import { CodeButton, VisitButton } from '../components/Buttons'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import '../bonuses.css'

const code = config.referralCode.toUpperCase()

// The icon inside each card's ring, at the design's size (centred on the ring).
function BonusIcon({ kind }) {
  if (kind === 'raffle') return <img className="bn-icon" src="/assets/bonuses/ticket.svg" width="79" height="61" alt="" />
  if (kind === 'giveaway') return <img className="bn-icon" src="/assets/bonuses/gift.svg" width="68" height="74" alt="" />
  if (kind === 'wager') return <img className="bn-icon" src="/assets/bonuses/wager-badge.png" width="84" height="84" alt="" />
  if (kind === 'lossback') return <span className="bn-icon bn-pct grad-blue">10%</span>
  // VIP: the blue diamond with the TGN mark cut in dark and a white sparkle
  return (
    <span className="bn-icon bn-vip">
      <img className="bn-vip-gem" src="/assets/bonuses/vip-diamond.svg" width="91" height="72" alt="" />
      <img className="bn-vip-spark" src="/assets/bonuses/vip-sparkle.svg" width="13" height="13" alt="" />
      <span className="bn-vip-tgn" />
    </span>
  )
}

const BONUSES = [
  {
    kind: 'raffle',
    title: <>MONTHLY <span className="accent">RAFFLE</span></>,
    text: <>A ticket for every ${config.raffle.ticketUnit.toLocaleString('en-US')} wagered,<br />with prizes drawn every month</>,
    cta: 'Go to Raffles',
    to: '/raffles',
  },
  {
    kind: 'vip',
    title: <>VIP BONUS <span className="accent">BUYS</span></>,
    text: <>Every stream we giveaway bonus<br />buys and you keep what it pays</>,
    cta: 'Visit Kick',
    href: config.kickUrl,
  },
  {
    kind: 'giveaway',
    title: 'GIVEAWAYS',
    text: <>Chat giveaways every stream and<br />Discord drops for the community</>,
    cta: 'Join Discord',
    href: config.discordUrl,
  },
  {
    kind: 'wager',
    title: <>WAGER <span className="accent">REWARDS</span></>,
    text: <>Receive extra reward upon reaching<br />a rank up on Rainbet.</>,
    cta: 'Go to Milestones',
    to: '/milestones',
  },
  {
    kind: 'lossback',
    title: <><span className="accent">10%</span> LOSSBACK</>,
    text: <>Every code user is eligible for our<br />10% lossback.</>,
    cta: 'Create Ticket',
    ticket: true,
  },
]

function BonusCard({ bonus, index, onTicket }) {
  const label = (
    <>
      {bonus.cta}
      <img className="bn-arrow" src="/assets/bonuses/arrow.svg" width="7.39" height="5.39" alt="" />
    </>
  )
  let action
  if (bonus.to) action = <Link className="bn-btn" to={bonus.to}>{label}</Link>
  else if (bonus.href) action = <a className="bn-btn" href={bonus.href} target="_blank" rel="noopener noreferrer">{label}</a>
  else action = <button className="bn-btn" onClick={onTicket}>{label}</button>

  return (
    <li className="bn-card enter" style={{ '--d': `${200 + index * 60}ms` }}>
      <div className="bn-top" aria-hidden="true">
        <span className="bn-ring">
          <BonusIcon kind={bonus.kind} />
        </span>
      </div>
      <h2 className="bn-title">{bonus.title}</h2>
      <p className="bn-text">{bonus.text}</p>
      {action}
    </li>
  )
}

export default function BonusesPage() {
  const { openTicket } = useUI()
  const lossback = () =>
    openTicket({
      title: 'Claim your 10% lossback',
      body: (
        <>
          <p>
            Lossback is paid to players wagering under code <b>{code}</b>. Open a ticket on Discord and include
            your Rainbet username.
          </p>
          <p>The team checks your losses for the period before sending it out.</p>
        </>
      ),
      cta: 'Create ticket on Discord',
    })

  return (
    <div className="titled-page bonus-page">
      <PageBackdrop />
      <PageHeading top="TEGEN" bottom="REWARDS" wordmark={false}>
        Be under code <b className="accent">{code}</b> &amp; become eligible for our rewards.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <CodeButton />
        <VisitButton />
      </div>

      <ul className="bn-grid">
        {BONUSES.map((b, i) => (
          <BonusCard bonus={b} index={i} onTicket={lossback} key={b.kind} />
        ))}
      </ul>
    </div>
  )
}
