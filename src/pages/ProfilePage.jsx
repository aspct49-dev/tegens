import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { useAuth } from '../hooks/useAuth'
import { usePolled } from '../hooks/usePolled'
import { TIERS, getProgress } from '../milestones'
import { loadRaffle } from '../raffle'
import { Link } from '../router'
import { useUI } from '../ui'
import { fmtMoney } from '../utils'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import VipBadge from '../components/VipBadge'
import MyClaims from '../components/MyClaims'
import MyOrders from '../components/MyOrders'
import '../profile.css'

// /profile: the signed-in player's dashboard. The member card on top carries who
// they are and where they sit on the wager ladder (its colour is their tier's);
// under it: this month's raffle, giveaways and VIP calls, then their wins and
// linked accounts.
//
//   GET  /api/profile                  → { user, admin, player, rainbet, link, wins, vip }
//   POST /api/profile/rainbet          { username } ask to link a Rainbet username (an admin approves it)
//   POST /api/profile/rainbet/cancel   withdraw a waiting request
//
// `rainbet` is the approved link only (tier, raffle); `link` is the request's state:
// { username, status: 'pending' | 'approved' | 'rejected' | 'unlinked', requestedAt, note }.

const code = config.referralCode.toUpperCase()

const monthYear = (t) => (t ? new Date(t * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '')
const shortDate = (t) => (t ? new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')
const fullDate = (t) => (t ? new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
/** '2026-01-01' → 'Jan 1, 2026' */
const longDay = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '')
const pct = (v) => `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: v < 0.01 ? 2 : 1 })}%`
/** $10,000 → $10K, $1,000,000 → $1M (the tier track's small labels) */
const shortMoney = (n) => fmtMoney(n).replace(',000,000', 'M').replace(',000', 'K')

function DiscordGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.8 19.8 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.5-5.1-.8-9.6-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  )
}

function useProfile(signedIn) {
  const [state, setState] = useState({ status: 'loading', data: null })
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/profile', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState({ status: 'ready', data: await res.json() })
    } catch {
      setState((s) => ({ status: s.data ? 'ready' : 'error', data: s.data }))
    }
  }, [])
  useEffect(() => {
    if (signedIn) load()
  }, [signedIn, load])
  return { ...state, reload: load, set: (data) => setState({ status: 'ready', data }) }
}

export default function ProfilePage() {
  const auth = useAuth()
  const profile = useProfile(Boolean(auth.user))
  const signedOut = auth.status !== 'loading' && !auth.user

  return (
    <div className="titled-page">
      <PageBackdrop />
      {signedOut && (
        <PageHeading top="YOUR" bottom="PROFILE">
          Track your tier, raffle tickets
          {' '}<br />
          &amp; wins under code <b className="accent">{code}</b>.
        </PageHeading>
      )}

      {auth.status === 'loading' ? (
        <div className="spinner" role="status" aria-label="Loading" />
      ) : signedOut ? (
        <SignedOut onSignIn={() => auth.signInWithKick('/profile')} error={auth.error} />
      ) : profile.status === 'loading' ? (
        <div className="spinner" role="status" aria-label="Loading" />
      ) : profile.status === 'error' ? (
        <p className="ms-hint pf-hint">
          Your profile didn’t load. <button className="link-btn" onClick={profile.reload}>Try again</button>
        </p>
      ) : (
        <Dashboard data={profile.data} reload={profile.reload} onLinked={profile.set} />
      )}
    </div>
  )
}

function SignedOut({ onSignIn, error }) {
  return (
    <div className="pf-signin enter" style={{ '--d': '160ms' }}>
      <span className="pf-signin-icon" aria-hidden="true">
        <img src="/assets/icon-kick.svg" width="26" height="26" alt="" />
      </span>
      <p className="pf-signin-title">Sign in to see your profile</p>
      <p className="pf-signin-text">Use your Kick account. You can link Discord and your Rainbet username after.</p>
      {error && <p className="pf-error" role="alert">{error}</p>}
      <button className="btn-blue pf-signin-btn" onClick={onSignIn}>
        <img src="/assets/icon-kick.svg" width="16" height="16" alt="" />
        Sign in with Kick
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- dashboard

function Dashboard({ data, reload, onLinked }) {
  const auth = useAuth()
  const { user, admin, player: row, rainbet, link = null, wins = [], vip } = data
  const [linking, setLinking] = useState(false)
  const card = useRef(null)
  const pending = !rainbet && link?.status === 'pending'

  // The approved username also drives the side nav's rank card (usePlayer follows
  // useAuth's `rainbet`): if this fresher read differs, have the account re-read.
  useEffect(() => {
    if (auth.status === 'ready' && auth.user && (rainbet?.username ?? null) !== (auth.rainbet ?? null)) auth.refresh()
  }, [rainbet?.username]) // eslint-disable-line react-hooks/exhaustive-deps

  const startLinking = () => {
    setLinking(true)
    card.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="pf">
      <MemberCard
        cardRef={card}
        user={user}
        row={row}
        admin={admin}
        vip={Boolean(vip)}
        rainbet={rainbet}
        link={link}
        reload={reload}
        linking={linking}
        setLinking={setLinking}
        onLinked={onLinked}
      />

      <div className="pf-panels">
        <RafflePanel username={rainbet?.username} pending={pending} onLink={startLinking} />
        <GiveawayPanel wins={wins.filter((w) => w.kind === 'giveaway')} />
        <VipPanel vip={vip} />
      </div>

      <div className="pf-panels pf-claims">
        <MyClaims />
        <MyOrders className="pf-panel is-orders" title="Store orders" emptyText="Items you buy in the store show here." />
      </div>

      <div className="pf-lower">
        <Activity wins={wins} />
        <Connections user={user} row={row} rainbet={rainbet} pending={pending ? link.username : null} onLinkRainbet={startLinking} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- member card

function MemberCard({ cardRef, user, row, admin, vip, rainbet, link, reload, linking, setLinking, onLinked }) {
  const name = row?.name ?? user.kick?.username ?? user.discord?.name ?? 'Player'
  const avatar = row?.avatar ?? user.kick?.avatar ?? user.discord?.avatar
  const known = rainbet && rainbet.wagered != null
  const wagered = known ? rainbet.wagered : 0
  const { current, next, pct: fill, reachedCount } = getProgress(wagered)
  const tone = current?.color ?? '#4db8ff'
  // not approved: waiting for an admin, turned down or removed (with the admin's note)
  const state = rainbet ? null : ['pending', 'rejected', 'unlinked'].includes(link?.status) ? link.status : null

  return (
    <section className={`pf-card${current ? ' has-tier' : ''}`} ref={cardRef} style={{ '--tier': tone }} aria-label="Your member card">
      <div className="pf-card-top">
        <span className="pf-avatar-ring">
          {avatar ? <img className="pf-avatar" src={avatar} width="84" height="84" alt="" /> : <span className="pf-avatar pf-initial">{name.slice(0, 1).toUpperCase()}</span>}
        </span>
        <div className="pf-who">
          <h1 className="pf-name">{name}</h1>
          <div className="pf-badges">
            {current && <span className="pf-badge is-tier">{current.name}</span>}
            {vip && <VipBadge force size="md" />}
            {admin && <span className="pf-badge is-admin">Admin</span>}
            <span className="pf-joined">{row?.firstSeen ? `Joined ${monthYear(row.firstSeen)}` : 'New member'}</span>
          </div>
        </div>
        <div className="pf-standing">
          <img className="pf-emblem" src={(current ?? TIERS[0]).icon} width="76" height="76" alt="" />
          <div className="pf-standing-text">
            {known ? (
              <>
                <span className="pf-wagered">{fmtMoney(wagered)}</span>
                <span className="pf-wagered-label">wagered on Rainbet since {longDay(rainbet.since)}</span>
              </>
            ) : rainbet ? (
              <>
                <span className="pf-wagered is-muted">—</span>
                <span className="pf-wagered-label">
                  {rainbet.error ?? 'Wager unavailable.'} <button className="link-btn" onClick={reload}>Retry</button>
                </span>
              </>
            ) : (
              <>
                <span className="pf-wagered is-muted">No tier yet</span>
                <span className="pf-wagered-label">{state === 'pending' ? 'Your Rainbet link is waiting for approval' : 'Link Rainbet to start climbing'}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <TierTrack reachedCount={known ? reachedCount : 0} fill={known ? fill : 0} known={known} />

      <div className="pf-card-foot">
        {!rainbet ? (
          state === 'pending' ? (
            <>
              <p className="pf-next">
                <span className="pf-state is-wait">Waiting for approval</span>
                You asked to link <b>{link.username}</b> on {fullDate(link.requestedAt)}. An admin will check it soon.
              </p>
              <CancelRequest onDone={reload} />
            </>
          ) : linking ? (
            <RainbetForm onLinked={onLinked} onCancel={() => setLinking(false)} />
          ) : (
            <>
              <p className="pf-next">
                {state ? (
                  <>
                    <span className="pf-state is-off">{state === 'rejected' ? 'Not approved' : 'Removed'}</span>
                    {state === 'rejected' ? (
                      <>
                        <b>{link.username}</b> wasn’t approved
                      </>
                    ) : (
                      <>
                        An admin removed <b>{link.username}</b>
                      </>
                    )}
                    {link.note ? `: ${link.note}` : '.'} You can send it again.
                  </>
                ) : (
                  <>
                    Link the Rainbet username you play under code <b>{code}</b> to track your tier and get raffle tickets.
                  </>
                )}
              </p>
              <button className="ms-btn is-claim pf-foot-btn" onClick={() => setLinking(true)}>
                {state ? 'Try again' : 'Link Rainbet'}
              </button>
            </>
          )
        ) : known && next ? (
          <>
            <p className="pf-next">
              <b>{fmtMoney(next.wager - wagered)}</b> more to <span style={{ color: next.color }}>{next.name}</span>, which pays{' '}
              <b>{fmtMoney(next.prize)}</b>
            </p>
            <Link className={`ms-btn pf-foot-btn${current ? ' is-claim' : ''}`} to="/milestones">
              {current ? 'Claim rewards' : 'Milestones'}
            </Link>
          </>
        ) : known ? (
          <>
            <p className="pf-next">You’ve reached the top tier. Every reward is yours to claim.</p>
            <Link className="ms-btn is-claim pf-foot-btn" to="/milestones">
              Claim rewards
            </Link>
          </>
        ) : null}
      </div>
    </section>
  )
}

/** All seven tiers on one line; the bar fills to the exact wager, between the tier you're on and the next */
function TierTrack({ reachedCount, fill, known }) {
  const n = TIERS.length
  // each tier sits in the middle of its own column, so both ends have the same margin;
  // the line runs edge to edge: before the first tier is "nothing wagered yet", after the last is "top"
  const x = (i) => (i < 0 ? 0 : i >= n ? 1 : (i + 0.5) / n)
  const at = x(reachedCount - 1) + fill * (x(reachedCount) - x(reachedCount - 1))
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(at))
    return () => cancelAnimationFrame(id)
  }, [at])

  return (
    <div className={`pf-track${known ? '' : ' is-off'}`} role="img" aria-label={known ? `${reachedCount} of ${n} tiers reached` : 'Tier track, not started'}>
      <div className="pf-track-line">
        <span className="pf-track-fill" style={{ width: `${shown * 100}%` }} />
      </div>
      <ol className="pf-track-nodes">
        {TIERS.map((t, i) => {
          const reached = i < reachedCount
          const isNext = known && i === reachedCount
          return (
            <li key={t.id} className={`pf-node${reached ? ' is-reached' : ''}${isNext ? ' is-next' : ''}`} style={{ left: `${x(i) * 100}%`, '--c': t.color }}>
              <img src={t.icon} width="30" height="30" alt="" />
              <span className="pf-node-name">{t.name}</span>
              <span className="pf-node-wager">{shortMoney(t.wager)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function RainbetForm({ onLinked, onCancel }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const valid = /^[A-Za-z0-9_.-]{2,32}$/.test(value.trim())

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/profile/rainbet', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: value.trim() }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || `Couldn’t link it (${res.status}).`)
      // reload the whole profile so the tier, raffle and wins match the new name
      onLinked(await fetch('/api/profile', { credentials: 'same-origin' }).then((r) => r.json()))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pf-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="pf-rainbet">Rainbet username</label>
      <input
        id="pf-rainbet"
        className="pf-input"
        value={value}
        onChange={(e) => (setValue(e.target.value), setError(null))}
        placeholder="Your Rainbet username"
        autoComplete="off"
        spellCheck={false}
        maxLength={32}
        autoFocus
      />
      <button type="submit" className="ms-btn is-claim" disabled={!valid || busy}>
        {busy ? 'Checking…' : 'Link'}
      </button>
      <button type="button" className="link-btn pf-cancel" onClick={onCancel}>
        Cancel
      </button>
      <p className={`pf-form-hint${error ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>
        {error ?? `It must be registered under code ${code}; we check with Rainbet, then an admin approves it. Changing it later takes a Discord ticket.`}
      </p>
    </form>
  )
}

/** Withdraw a waiting link request (to fix a typo, say) */
function CancelRequest({ onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const cancel = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/profile/rainbet/cancel', { method: 'POST', credentials: 'same-origin' })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || `Couldn’t cancel it (${res.status}).`)
      await onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <>
      <button className="link-btn pf-cancel" onClick={cancel} disabled={busy}>
        {busy ? 'Cancelling…' : 'Cancel request'}
      </button>
      {error && (
        <p className="pf-form-hint is-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------- the three panels

/**
 * This month's wager raffle. The server's (/api/raffles, names masked, `mine` for
 * ?me=) when it answers; the site's own calculation (src/raffle.js) when it can't.
 * null: the server has no wager raffle running.
 */
async function loadWagerRaffle(username) {
  try {
    const res = await fetch(`/api/raffles?kind=wager&me=${encodeURIComponent(username)}`, { credentials: 'same-origin' })
    if (res.ok) {
      const d = await res.json()
      const r = d?.raffle ?? (Array.isArray(d?.raffles) ? d.raffles[0] : null)
      if (r && Array.isArray(r.entries)) return r
      if ('raffle' in (d ?? {})) return null
    }
  } catch {
    /* no server raffle: fall back */
  }
  return loadRaffle()
}

function RafflePanel({ username, pending, onLink }) {
  const [state, setState] = useState({ status: username ? 'loading' : 'none', raffle: null })
  useEffect(() => {
    if (!username) return undefined
    let cancelled = false
    loadWagerRaffle(username).then(
      (raffle) => !cancelled && setState({ status: 'ready', raffle }),
      () => !cancelled && setState({ status: 'error', raffle: null }),
    )
    return () => {
      cancelled = true
    }
  }, [username])

  const head = (
    <div className="pf-panel-head">
      <img src="/assets/td/nav-raffles-active.svg" width="18" height="15" alt="" />
      <h2>Monthly raffle</h2>
    </div>
  )

  if (!username) {
    return (
      <section className="pf-panel">
        {head}
        {pending ? (
          <p className="pf-panel-empty">Your Rainbet link is waiting for approval. Your tickets show here once it’s approved.</p>
        ) : (
          <>
            <p className="pf-panel-empty">Every {fmtMoney(config.raffle.ticketUnit)} you wager this month is a ticket. Link Rainbet to collect yours.</p>
            <button className="link-btn pf-panel-link" onClick={onLink}>Link Rainbet</button>
          </>
        )}
      </section>
    )
  }
  if (state.status !== 'ready' || !state.raffle) {
    return (
      <section className="pf-panel">
        {head}
        <p className="pf-panel-empty">{state.status === 'loading' ? 'Counting your tickets…' : 'No raffle is running this month.'}</p>
        <Link className="link-btn pf-panel-link" to="/raffles">Raffles</Link>
      </section>
    )
  }

  const r = state.raffle
  const entries = r.entries ?? []
  const nameOf = (e) => String(e.name ?? e.username ?? '')
  // the server answers `mine` (its entries are masked); the local calculation has full names
  const mine = 'mine' in r ? r.mine : entries.find((e) => nameOf(e).toLowerCase() === username.toLowerCase())
  const total = r.totalTickets ?? entries.reduce((s, e) => s + (Number(e.tickets) || 0), 0)
  const unit = r.ticketUnit ?? config.raffle.ticketUnit
  const tickets = Number(mine?.tickets) || 0
  const odds = mine?.odds ?? (total ? tickets / total : 0)
  const rank = mine ? entries.filter((e) => (Number(e.tickets) || 0) > tickets).length + 1 : null

  return (
    <section className="pf-panel">
      {head}
      <p className="pf-big">
        {tickets.toLocaleString('en-US')}
        <span>{tickets === 1 ? 'ticket' : 'tickets'}</span>
      </p>
      {mine ? (
        <dl className="pf-facts">
          <div>
            <dt>Odds per draw</dt>
            <dd>{pct(odds)}</dd>
          </div>
          {rank && (
            <div>
              <dt>Rank</dt>
              <dd>
                #{rank} <span>of {entries.length.toLocaleString('en-US')}</span>
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="pf-panel-empty">Wager {fmtMoney(unit)} this month for your first ticket.</p>
      )}
      <Link className="link-btn pf-panel-link" to="/raffles">Open raffle</Link>
    </section>
  )
}

function GiveawayPanel({ wins }) {
  const { data } = usePolled('/api/events/giveaway', 15000)
  const live = data?.giveaway && data.giveaway.open && !data.giveaway.draw ? data.giveaway : null
  const last = wins[0]
  return (
    <section className={`pf-panel${live ? ' is-live' : ''}`}>
      <div className="pf-panel-head">
        <img src="/assets/td/nav-giveaways-active.svg" width="16" height="16" alt="" />
        <h2>Giveaways</h2>
        {live && <span className="pf-live">Live</span>}
      </div>
      {live ? (
        <>
          <p className="pf-live-prize">{live.prize}</p>
          <p className="pf-panel-empty">
            Type <code className="pf-kw">{live.keyword}</code> in Kick chat to enter{live.vipOnly ? ' (VIPs only)' : ''}.
          </p>
          <a className="link-btn pf-panel-link" href={config.kickUrl} target="_blank" rel="noopener noreferrer">
            Open Kick chat
          </a>
        </>
      ) : (
        <>
          <p className="pf-big">
            {wins.length}
            <span>{wins.length === 1 ? 'win' : 'wins'}</span>
          </p>
          <p className="pf-panel-empty">{last ? `Last: ${last.title}, ${shortDate(last.at)}` : 'Giveaways run in Kick chat. Type the keyword when one starts.'}</p>
          <Link className="link-btn pf-panel-link" to="/giveaways">Past giveaways</Link>
        </>
      )}
    </section>
  )
}

function VipPanel({ vip }) {
  if (!vip) {
    return (
      <section className="pf-panel is-quiet">
        <div className="pf-panel-head">
          <span className="pf-vip-mark" aria-hidden="true">VIP</span>
          <h2>VIP calls</h2>
        </div>
        <p className="pf-panel-empty">VIPs wear the gold VIP badge across the site, get their own giveaways and can call slots when calls are VIPs only. Ask in the Discord about VIP.</p>
        <a className="link-btn pf-panel-link" href={config.discordUrl} target="_blank" rel="noopener noreferrer">
          Discord
        </a>
      </section>
    )
  }
  return (
    <section className="pf-panel is-vip">
      <div className="pf-panel-head">
        <VipBadge force size="md" />
        <h2>Your slot calls</h2>
      </div>
      <p className="pf-big is-gold">
        {fmtMoney(vip.totalWon)}
        <span>won from {vip.played} {vip.played === 1 ? 'call' : 'calls'}</span>
      </p>
      {vip.best && (
        <p className="pf-panel-empty">
          Best: <b>{fmtMoney(vip.best.win, 2)}</b> on {vip.best.slot}
        </p>
      )}
      {vip.waiting ? (
        <p className="pf-waiting">
          {vip.waiting.slot.image && <img src={vip.waiting.slot.image} width="18" height="24" alt="" />}
          In the queue: <b>{vip.waiting.slot.name}</b>
        </p>
      ) : (
        <p className="pf-panel-empty">Call your next slot in chat with !call slot name.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- activity + connections

const KIND = { giveaway: 'Giveaway', guess: 'Guess the balance', call: 'Slot call' }

function Activity({ wins }) {
  const { openTicket } = useUI()
  return (
    <section className="pf-section">
      <h2 className="pf-section-title">Your wins</h2>
      {wins.length === 0 ? (
        <div className="pf-nothing">
          <p>Nothing won yet.</p>
          <p>Giveaways, Guess the Balance and VIP calls you win show up here.</p>
        </div>
      ) : (
        <ol className="pf-wins">
          {wins.map((w, i) => (
            <li className="pf-win" key={`${w.kind}-${w.at}-${i}`}>
              {w.image ? (
                <img className="pf-win-art" src={w.image} width="30" height="40" alt="" />
              ) : (
                <span className={`pf-win-icon is-${w.kind}`} aria-hidden="true">
                  <img src={w.kind === 'guess' ? '/assets/td/nav-guess-active.svg' : '/assets/td/nav-giveaways-active.svg'} width="16" height="16" alt="" />
                </span>
              )}
              <span className="pf-win-text">
                <span className="pf-win-title">{w.title}</span>
                <span className="pf-win-kind">
                  {KIND[w.kind] ?? w.kind}
                  {w.at ? `, ${shortDate(w.at)}` : ''}
                </span>
              </span>
              {w.prize != null && w.prize !== '' ? (
                <span className="pf-win-prize">{typeof w.prize === 'number' ? fmtMoney(w.prize, 2) : String(w.prize)}</span>
              ) : (
                <button className="link-btn pf-win-prize" onClick={() => openTicket({ title: 'Claim your win', body: <p>Open a ticket on Discord to collect it.</p>, cta: 'Claim on Discord' })}>
                  Claim
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Connections({ user, row, rainbet, pending, onLinkRainbet }) {
  const { signOut, signInWithKick, signInWithDiscord } = useAuth()
  const kick = row?.kick ?? user.kick
  const discord = row?.discord ?? user.discord
  const rows = [
    { id: 'kick', icon: <img src="/assets/icon-kick.svg" width="16" height="16" alt="" />, label: 'Kick', value: kick?.username, action: () => signInWithKick('/profile') },
    { id: 'discord', icon: <DiscordGlyph />, label: 'Discord', value: discord?.username ?? null, action: () => signInWithDiscord('/profile') },
    { id: 'rainbet', icon: <span className="pf-rainbet-mark" />, label: 'Rainbet', value: rainbet?.username ?? pending, wait: Boolean(!rainbet && pending), action: onLinkRainbet },
  ]
  return (
    <section className="pf-section">
      <h2 className="pf-section-title">Connections</h2>
      <ul className="pf-conns">
        {rows.map((r) => (
          <li key={r.id} className="pf-conn">
            <span className={`pf-conn-icon is-${r.id}`} aria-hidden="true">{r.icon}</span>
            <span className="pf-conn-text">
              <span className="pf-conn-label">{r.label}</span>
              <span className={`pf-conn-value${r.value ? '' : ' is-empty'}`}>{r.value ?? 'Not linked'}</span>
            </span>
            {r.wait ? (
              <span className="pf-conn-wait">Waiting</span>
            ) : r.value ? (
              <span className="pf-conn-ok" aria-label="Linked">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.5 6.2l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : (
              <button className="ms-btn is-claim pf-conn-btn" onClick={r.action}>
                Link
              </button>
            )}
          </li>
        ))}
      </ul>
      <button className="link-btn pf-signout" onClick={signOut}>
        Sign out
      </button>
    </section>
  )
}
