import { useEffect, useState } from 'react'
import { config } from '../config'
import { useAuth } from '../hooks/useAuth'
import { usePlayer } from '../hooks/usePlayer'
import { TIERS, tierStatus } from '../milestones'
import { Link, useRouter } from '../router'
import { useUI } from '../ui'
import { fmtMoney } from '../utils'
import { CodeButton, VisitButton } from '../components/Buttons'
import { latestClaim, useMyClaims } from '../components/MyClaims'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import '../claims.css'

const code = config.referralCode.toUpperCase()

const STEPS = [
  {
    title: 'Step 1',
    image: '/assets/td/ms-step1.webp',
    text: (
      <>
        Create an account on Rainbet under
        {' '}<br />
        code <span className="accent">{code}</span> &amp; start wagering.
      </>
    ),
  },
  {
    title: 'Step 2',
    image: '/assets/td/ms-step2.webp',
    text: (
      <>
        Wager by playing Casino or Sports
        {' '}<br />
        &amp; climb towards another rank up.
      </>
    ),
  },
  {
    title: 'Step 3',
    image: '/assets/td/ms-step3.webp',
    text: (
      <>
        Claim a milestone here for every
        {' '}<br />
        time you rank up.
      </>
    ),
  },
]

export function StepCard({ title, image, children, index }) {
  return (
    <div className="step-card enter" style={{ '--d': `${200 + index * 60}ms` }}>
      <img className="step-card-img" src={image} width="260" height="98" alt="" loading="lazy" />
      <p className="step-card-title">{title}</p>
      <p className="step-card-text">{children}</p>
    </div>
  )
}

// The tiers an admin has marked as paid for this Rainbet username (server/features/milestoneClaims.js;
// a claim ticked as paid on Admin → Claims writes the same rows)
function useClaimed(username, version) {
  const [claimed, setClaimed] = useState(() => new Set())
  useEffect(() => {
    setClaimed(new Set())
    if (!username) return undefined
    let cancelled = false
    fetch(`/api/content/milestone-claims?username=${encodeURIComponent(username)}`)
      .then((r) => (r.ok ? r.json() : { claimed: [] }))
      .then((d) => !cancelled && setClaimed(new Set(d.claimed ?? [])))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [username, version])
  return claimed
}

/**
 * Can this visitor claim on the site? 'linked': signed in with an approved Rainbet link (the one
 * the rows show); 'signin' / 'link': not yet; 'loading' while the account is being read.
 */
function useAccount() {
  const auth = useAuth()
  if (auth.status === 'loading') return 'loading'
  if (!auth.user) return 'signin'
  return auth.rainbet ? 'linked' : 'link'
}

function MilestoneRow({ tier, index, paid, claim, account, onClaim }) {
  const player = usePlayer()
  const { navigate } = useRouter()
  const { openPlayer, toast } = useUI()
  const [busy, setBusy] = useState(false)
  const reached = tierStatus(tier, player.wagered, player.known)
  // paid out (an admin ticked the claim, or marked it on Milestone Claims) → claimed; a claim made
  // here and waiting for an admin → pending. Only once the tier is reached for this player.
  const status =
    reached !== 'reached' ? reached : paid || claim?.status === 'paid' ? 'claimed' : claim?.status === 'pending' ? 'pending' : 'reached'
  const fill = status === 'next' ? Math.min(1, player.wagered / tier.wager) : status === 'locked' ? 0 : 1
  const rejected = status === 'reached' && claim?.status === 'rejected'

  const onAction = async () => {
    if (status === 'claimed') {
      toast(`Your ${tier.name} reward has been paid`)
    } else if (status === 'pending') {
      toast(`Your ${tier.name} claim is waiting for an admin to pay it`)
    } else if (status === 'reached') {
      if (account !== 'linked') {
        navigate('/profile')
        return
      }
      setBusy(true)
      try {
        await onClaim(tier)
        toast(`${tier.name} claimed. Follow it on your profile until it’s paid.`)
      } catch (err) {
        toast(err.message)
      } finally {
        setBusy(false)
      }
    } else if (!player.username) {
      openPlayer()
    } else if (player.known) {
      toast(`Wager ${fmtMoney(tier.wager - player.wagered)} more to unlock ${tier.name}`)
    } else {
      toast(player.status === 'error' ? 'Progress is unavailable right now, use Retry' : 'Loading your progress…')
    }
  }

  const label = { reached: busy ? 'Claiming…' : rejected ? 'Claim again' : 'Claim', claimed: 'Claimed', pending: 'Pending' }[status] ?? 'Locked'
  const tone = { reached: ' is-claim', claimed: ' is-claimed', pending: ' is-pending' }[status] ?? ''

  return (
    <li className={`ms-row is-${status} enter`} style={{ '--d': `${380 + index * 50}ms` }}>
      <img className="ms-icon" src={tier.icon} width="51" height="51" alt="" />
      <div className="ms-mid">
        <p className="ms-line">
          <img src={tier.icon} width="18" height="18" alt="" />
          <span className="ms-reach">
            Reach <span style={{ color: tier.color }}>{tier.name}</span>
          </span>
          <span className="ms-wager">
            Wager{' '}
            {status === 'next'
              ? `${fmtMoney(player.wagered)} / ${fmtMoney(tier.wager)}`
              : fmtMoney(tier.wager)}
          </span>
          <span className="ms-prize">
            Prize: <b><span className="accent">$</span>{fmtMoney(tier.prize, 2).slice(1)}</b>
          </span>
        </p>
        <span
          className="ms-bar"
          role="progressbar"
          aria-label={`${tier.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fill * 100)}
        >
          <span style={{ width: `${fill * 100}%` }} />
        </span>
        {rejected && (
          <p className="ms-note is-no">
            Your last claim was turned down{claim.adminNote ? `: ${claim.adminNote}` : '.'} You can claim again.
          </p>
        )}
      </div>
      <button
        className={`ms-btn${tone}${busy ? ' is-busy' : ''}`}
        onClick={onAction}
        disabled={busy}
        aria-busy={busy}
        title={status === 'reached' && account !== 'linked' ? 'Sign in and link your Rainbet username on your profile to claim' : undefined}
      >
        {label}
      </button>
    </li>
  )
}

export default function MilestonesPage() {
  const player = usePlayer()
  const account = useAccount()
  const mine = useMyClaims()
  const [version, setVersion] = useState(0)
  const paid = useClaimed(player.known ? player.username : '', version)
  const { openPlayer } = useUI()

  const onClaim = async (tier) => {
    await mine.claim({ kind: 'milestone', tier: tier.id })
    setVersion((n) => n + 1)
  }
  // a reached tier this visitor could claim, if they signed in and linked Rainbet
  const canReach = TIERS.some((t) => tierStatus(t, player.wagered, player.known) === 'reached' && !paid.has(t.id))

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading
        top="WAGER"
        bottom="MILESTONES"
        decos={
          <>
            <span className="page-deco ms-deco-platinum" aria-hidden="true">
              <img src="/assets/td/tier-platinum.png" alt="" />
            </span>
            <span className="page-deco ms-deco-diamond" aria-hidden="true">
              <img src="/assets/td/tier-diamond.png" alt="" />
            </span>
          </>
        }
      >
        Be under code <b className="accent">{code}</b> &amp; claim extra rewards
        {' '}<br />
        upon reaching destined Milestones.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <CodeButton />
        <VisitButton />
      </div>

      <div className="step-grid">
        {STEPS.map((s, i) => (
          <StepCard title={s.title} image={s.image} index={i} key={s.title}>
            {s.text}
          </StepCard>
        ))}
      </div>

      {!player.username ? (
        <p className="ms-hint enter" style={{ '--d': '360ms' }}>
          <button className="link-btn" onClick={openPlayer}>Enter your Rainbet username</button> to see your progress.
        </p>
      ) : player.status === 'error' ? (
        <p className="ms-hint">
          Progress is temporarily unavailable.{' '}
          <button className="link-btn" onClick={player.refresh}>Retry</button>
        </p>
      ) : (
        (account === 'signin' || account === 'link') &&
        canReach && (
          <p className="ms-hint enter" style={{ '--d': '360ms' }}>
            {account === 'signin' ? 'Sign in and link' : 'Link'} your Rainbet username on{' '}
            <Link className="link-btn" to="/profile">your profile</Link> to claim rewards here.
          </p>
        )
      )}

      <ol className="ms-list">
        {TIERS.map((t, i) => (
          <MilestoneRow
            tier={t}
            index={i}
            key={t.id}
            paid={paid.has(t.id)}
            claim={account === 'linked' ? latestClaim(mine.claims, { kind: 'milestone', tier: t.id }) : null}
            account={account}
            onClaim={onClaim}
          />
        ))}
      </ol>
    </div>
  )
}
