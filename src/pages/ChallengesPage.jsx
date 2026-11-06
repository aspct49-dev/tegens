import { useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../config'
import { useAuth } from '../hooks/useAuth'
import { Link } from '../router'
import { fmtMoney } from '../utils'
import { CodeButton, RulesButton, VisitButton } from '../components/Buttons'
import Modal from '../components/Modal'
import { CLAIM_STATUS, latestClaim, useMyClaims } from '../components/MyClaims'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import StepsModal from '../components/StepsModal'
import '../challenges.css'
import '../claims.css'
import EmptyState from '../components/EmptyState'

// /challenges: slot bounties set from the admin (server/features/challenges.js).
// Hit the target multiplier on the game at the minimum bet or more under the
// code, then claim the bounty here with the bet link (server/features/claims.js);
// an admin checks it and ticks it once paid. Same pieces as the other titled
// pages: heading + code/visit, three step cards, then the challenge cards.

const code = config.referralCode.toUpperCase()

const STEPS = [
  {
    title: 'Step 1',
    image: '/assets/td/ms-step1.webp',
    text: (
      <>
        Play on Rainbet under
        {' '}<br />
        code <span className="accent">{code}</span>.
      </>
    ),
  },
  {
    title: 'Step 2',
    image: '/assets/td/ms-step2.webp',
    text: (
      <>
        Hit the target multiplier on the slot
        {' '}<br />
        at the minimum bet or higher.
      </>
    ),
  },
  {
    title: 'Step 3',
    image: '/assets/td/ms-step3.webp',
    text: (
      <>
        Copy the bet link &amp; claim the
        {' '}<br />
        bounty right here on the card.
      </>
    ),
  },
]

const x = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}×`
const bet = (n) => fmtMoney(n, n < 1 ? 2 : Number.isInteger(n) ? 0 : 2)
/** 100 → "100.00" (the $ is drawn separately, in the accent colour) */
const usd = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function useChallenges() {
  const [state, setState] = useState({ status: 'loading', list: [] })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/content/challenges')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(
        (d) => !cancelled && setState({ status: 'ready', list: Array.isArray(d.challenges) ? d.challenges : [] }),
        () => !cancelled && setState((s) => ({ status: s.list.length ? 'ready' : 'error', list: s.list })),
      )
    const t = setInterval(() => setTick((n) => n + 1), 60_000) // a challenge can be won mid-stream
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [tick])
  return { ...state, retry: () => setTick((n) => n + 1) }
}

export default function ChallengesPage() {
  const { status, list, retry } = useChallenges()
  const mine = useMyClaims()
  const [sort, setSort] = useState('reward-desc')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [claiming, setClaiming] = useState(null) // the challenge whose claim dialog is open
  const claimOf = (c) => latestClaim(mine.claims, { kind: 'challenge', challengeId: c.id })

  const active = useMemo(() => {
    const open = list.filter((c) => c.status !== 'completed')
    const by = {
      'reward-desc': (a, b) => b.reward - a.reward,
      'reward-asc': (a, b) => a.reward - b.reward,
      newest: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    }[sort]
    return open.sort(by)
  }, [list, sort])
  const done = useMemo(() => list.filter((c) => c.status === 'completed'), [list])

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="SLOT" bottom="CHALLENGES">
        Play under code <b className="accent">{code}</b>, hit the target multiplier
        {' '}<br />
        &amp; claim the bounty on top of your win.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <CodeButton />
        <VisitButton />
        <RulesButton onClick={() => setRulesOpen(true)} />
      </div>

      <StepsModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title="How challenges work"
        steps={STEPS}
        rules={[
          <>Only bets placed under code <b>{code}</b> count, at the minimum bet or higher.</>,
          'Claim with the Rainbet bet link or bet ID of the win. The first valid claim wins the bounty.',
          'Sign in and link your Rainbet username on your profile first: the bounty is paid to that account.',
        ]}
      />

      <div className="ch">
        {status === 'loading' && <div className="spinner" role="status" aria-label="Loading" />}
        {status === 'error' && (
          <p className="ms-hint ch-hint">
            Challenges are temporarily unavailable. <button className="link-btn" onClick={retry}>Retry</button>
          </p>
        )}
        {status === 'ready' && (
          <>
            <div className="ch-bar enter" style={{ '--d': '360ms' }}>
              <h2 className="ch-title">
                Active challenges <span className="ch-count">{active.length}</span>
              </h2>
              {active.length > 1 && (
                <label className="ch-sort">
                  <span className="ch-sort-label">Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="reward-desc">Reward: high to low</option>
                    <option value="reward-asc">Reward: low to high</option>
                    <option value="newest">Newest first</option>
                  </select>
                </label>
              )}
            </div>
            {active.length > 0 ? (
              <ul className="ch-grid">
                {active.map((c, i) => (
                  <ChallengeCard challenge={c} index={i} key={c.id} claim={claimOf(c)} onClaim={() => setClaiming(c)} />
                ))}
              </ul>
            ) : (
              <EmptyState title="No challenges right now" icon delay={400}>
                New ones drop on stream, so check back soon.
              </EmptyState>
            )}

            {done.length > 0 && (
              <>
                <h2 className="section-title">Completed</h2>
                <ul className="ch-grid">
                  {done.map((c, i) => (
                    <ChallengeCard challenge={c} index={active.length + i} key={c.id} claim={claimOf(c)} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      <ClaimModal
        challenge={claiming}
        onClose={() => setClaiming(null)}
        onSubmit={(body) => mine.claim({ kind: 'challenge', challengeId: claiming.id, ...body })}
      />
    </div>
  )
}

/**
 * The claim dialog: signed in with an approved Rainbet link → the bet link/ID (+ an optional
 * note) goes to the admins; otherwise it says what to do first.
 */
function ClaimModal({ challenge: c, onClose, onSubmit }) {
  const auth = useAuth()
  const [proof, setProof] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const inputRef = useRef()
  const last = useRef(c) // keeps the text while the dialog fades out
  if (c) last.current = c
  const shown = c ?? last.current

  useEffect(() => {
    if (!c) return undefined
    setProof('')
    setNote('')
    setError('')
    setSent(false)
    const t = setTimeout(() => inputRef.current?.focus(), 260) // after the shell focuses its close button
    return () => clearTimeout(t)
  }, [c])

  const submit = async (e) => {
    e.preventDefault()
    if (!proof.trim()) return setError('Paste the bet link or bet ID of the win.')
    setBusy(true)
    setError('')
    try {
      await onSubmit({ proof: proof.trim(), note: note.trim() })
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const linked = auth.user && auth.rainbet
  return (
    <Modal open={Boolean(c)} onClose={onClose} labelledBy="claim-title" className="claim-modal">
      {shown && (
        <>
          <h2 id="claim-title">{sent ? 'Claim sent' : `Claim: ${shown.game}`}</h2>
          {sent ? (
            <>
              <div className="claim-sum">
                <p>
                  Your claim for the <b>{fmtMoney(shown.reward, 2)}</b> bounty is with the team. They check the bet and pay it to{' '}
                  <b>{auth.rainbet}</b> on Rainbet.
                </p>
                <p>Follow it on your profile: it shows as paid once it’s done.</p>
              </div>
              <button type="button" className="btn-blue ticket-cta" onClick={onClose}>
                Done
              </button>
            </>
          ) : (
            <>
              <div className="claim-sum">
                <p>
                  Hit <b>{x(shown.multiplier)}</b> on <b>{shown.game}</b> with a bet of <b>{bet(shown.minBet)}</b> or more, under code{' '}
                  {config.referralCode}? Claim the <b>{fmtMoney(shown.reward, 2)}</b> bounty. The first valid claim wins it.
                </p>
              </div>
              {auth.status === 'loading' ? null : !auth.user ? (
                <p className="modal-note">
                  Sign in with Kick and link your Rainbet username on <Link to="/profile" onClick={onClose}>your profile</Link> to claim. The
                  bounty is paid to that account.
                </p>
              ) : !linked ? (
                <p className="modal-note">
                  Link your Rainbet username on <Link to="/profile" onClick={onClose}>your profile</Link> first. Once an admin approves it you can
                  claim here, and the bounty is paid to that account.
                </p>
              ) : (
                <form className="claim-form" onSubmit={submit}>
                  <label>
                    Bet link or bet ID
                    <input
                      ref={inputRef}
                      value={proof}
                      onChange={(e) => setProof(e.target.value)}
                      placeholder="https://rainbet.com/… or the bet ID"
                      autoComplete="off"
                      spellCheck="false"
                      maxLength={200}
                    />
                    <small>On Rainbet, open the bet in your history and copy its link or ID.</small>
                  </label>
                  <label>
                    Note <small>(optional)</small>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} placeholder="Anything the team should know" />
                  </label>
                  <p className="claim-error" role="alert">{error}</p>
                  <button className="btn-blue" type="submit" disabled={busy} aria-busy={busy}>
                    {busy ? 'Sending…' : `Claim as ${auth.rainbet}`}
                  </button>
                </form>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  )
}

function ChallengeCard({ challenge: c, index, claim, onClaim }) {
  const won = c.status === 'completed'
  const art = c.image ? <img src={c.image} width="105" height="140" alt="" loading="lazy" /> : <span className="ch-noart" aria-hidden="true">{c.game.slice(0, 1)}</span>
  // the player's own claim on this card: waiting / paid / turned down (they can claim again)
  const mineOpen = claim && (claim.status === 'pending' || claim.status === 'paid')
  const s = claim ? CLAIM_STATUS[claim.status] : null

  // A bounty ticket: the banner (the slot's art blurred behind its cover, the bounty on the
  // right), a perforated tear line cut into the card's edges, then the target and min. bet
  // and the claim button
  return (
    <li className={`ch-card${won ? ' is-won' : ''} enter`} style={{ '--d': `${400 + Math.min(index, 12) * 40}ms` }}>
      <div className="ch-banner">
        {c.image && <img className="ch-banner-bg" src={c.image} alt="" aria-hidden="true" loading="lazy" />}
        {c.playUrl && !won ? (
          <a className="ch-art" href={c.playUrl} target="_blank" rel="noopener noreferrer" aria-label={`Play ${c.game} on ${config.casino}`}>
            {art}
            <span className="ch-art-play" aria-hidden="true">Play</span>
          </a>
        ) : (
          <div className="ch-art">{art}</div>
        )}
        <div className="ch-bounty">
          <span className="ch-bounty-label">Bounty</span>
          <span className="ch-bounty-value">
            <span className="ch-accent">$</span>
            {usd(c.reward)}
          </span>
          <span className="ch-bounty-sub">on top of your win</span>
        </div>
        {won && (
          <span className="ch-stamp" aria-hidden="true">
            Claimed
          </span>
        )}
      </div>

      <div className="ch-info">
        <p className="ch-game" title={c.provider ? `${c.game} · ${c.provider}` : c.game}>
          {c.game}
        </p>
        {c.provider && <p className="ch-provider">{c.provider}</p>}
        <dl className="ch-stats">
          <div>
            <dt>Target</dt>
            <dd>
              {Number(c.multiplier).toLocaleString('en-US', { maximumFractionDigits: 2 })}
              <span className="ch-accent">×</span>
            </dd>
          </div>
          <div>
            <dt>Min. bet</dt>
            <dd>
              <span className="ch-accent">$</span>
              {usd(c.minBet)}
            </dd>
          </div>
        </dl>
        {won ? (
          <span className="ch-won" title={c.completedBy ?? undefined}>
            {claim?.status === 'paid' ? 'You won this one' : c.completedBy ? `Won by ${c.completedBy}` : 'Completed'}
          </span>
        ) : mineOpen ? (
          <span className="ch-claimed">
            Your claim
            <span className={`mc-pill is-${s.tone}`}>{s.label}</span>
          </span>
        ) : (
          <>
            <button className="ch-claim" onClick={onClaim} aria-label={`Claim the ${fmtMoney(c.reward, 2)} bounty on ${c.game}`}>
              {claim?.status === 'rejected' ? 'Claim Again' : 'Claim Bounty'}
              <img src="/assets/bonuses/arrow.svg" width="7.39" height="5.39" alt="" />
            </button>
            {claim?.status === 'rejected' && (
              <p className="ch-claim-note">Your last claim was turned down{claim.adminNote ? `: ${claim.adminNote}` : '.'}</p>
            )}
          </>
        )}
      </div>
    </li>
  )
}
