import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Link } from '../router'
import { fmtMoney } from '../utils'
import '../claims.css'

// The signed-in player's claims (server/features/claims.js): milestone rewards and challenge
// bounties they claimed on the site, waiting for an admin or paid. useMyClaims is shared by
// /milestones, /challenges and the profile list below.
//
//   GET  /api/claims/mine            { claims }
//   POST /api/claims                 { kind, tier | challengeId, proof?, note? } → { claim, claims }
//   POST /api/claims/<id>/cancel     → { claims }

async function post(path, body = {}) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

/** { status, claims, claim(body), cancel(id), reload } ; claims [] when signed out */
export function useMyClaims() {
  const { user, status: authStatus } = useAuth()
  const [state, setState] = useState({ status: 'loading', claims: [] })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (authStatus === 'loading') return undefined
    if (!user) {
      setState({ status: 'ready', claims: [] })
      return undefined
    }
    let cancelled = false
    fetch('/api/claims/mine', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(
        (d) => !cancelled && setState({ status: 'ready', claims: d.claims ?? [] }),
        () => !cancelled && setState((s) => ({ status: s.claims.length ? 'ready' : 'error', claims: s.claims })),
      )
    return () => {
      cancelled = true
    }
  }, [user, authStatus, tick])

  const claim = useCallback(async (body) => {
    const d = await post('/api/claims', body)
    setState({ status: 'ready', claims: d.claims ?? [] })
    return d.claim
  }, [])
  const cancel = useCallback(async (id) => {
    const d = await post(`/api/claims/${encodeURIComponent(id)}/cancel`)
    setState({ status: 'ready', claims: d.claims ?? [] })
  }, [])
  const reload = useCallback(() => setTick((n) => n + 1), [])

  return { ...state, claim, cancel, reload }
}

/** The newest claim (not a cancelled one) for one thing: { kind: 'milestone', tier } or { kind: 'challenge', challengeId } */
export function latestClaim(claims, { kind, tier, challengeId }) {
  return (
    claims.find(
      (c) => c.status !== 'cancelled' && c.kind === kind && (kind === 'milestone' ? c.tier === tier : c.challengeId === challengeId),
    ) ?? null
  )
}

export const CLAIM_STATUS = {
  pending: { label: 'Pending', tone: 'wait' },
  paid: { label: 'Paid', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'no' },
  cancelled: { label: 'Cancelled', tone: 'off' },
}

const day = (t) => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Their claims, newest first, with each one's state; a waiting one can be cancelled */
export default function MyClaims() {
  const { user } = useAuth()
  const { status, claims, cancel } = useMyClaims()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const shown = claims.filter((c) => c.status !== 'cancelled')

  const onCancel = async (id) => {
    setBusy(id)
    setError('')
    try {
      await cancel(id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  if (!user) return null
  return (
    <section className="pf-panel mc">
      <div className="pf-panel-head">
        <img src="/assets/td/nav-milestones-active.svg" width="16" height="16" alt="" />
        <h2>Your claims</h2>
        {shown.some((c) => c.status === 'pending') && (
          <span className="mc-count">{shown.filter((c) => c.status === 'pending').length} waiting</span>
        )}
      </div>
      {status === 'loading' ? (
        <p className="pf-panel-empty">Loading your claims…</p>
      ) : status === 'error' ? (
        <p className="pf-panel-empty">Your claims can’t be loaded right now.</p>
      ) : shown.length === 0 ? (
        <p className="pf-panel-empty">
          Reached a <Link to="/milestones">milestone</Link> or hit a <Link to="/challenges">challenge</Link>? Claim it there and follow it here
          until it’s paid.
        </p>
      ) : (
        <ul className="mc-list">
          {shown.map((c) => {
            const s = CLAIM_STATUS[c.status] ?? CLAIM_STATUS.pending
            return (
              <li className="mc-row" key={c.id}>
                <span className={`mc-kind is-${c.kind}`} aria-hidden="true">
                  {c.kind === 'milestone' ? 'M' : 'C'}
                </span>
                <span className="mc-what">
                  <span className="mc-title">{c.title}</span>
                  <span className="mc-sub">
                    {c.kind === 'milestone' ? 'Milestone' : 'Challenge'} · claimed {day(c.at)}
                    {c.decidedAt && c.status === 'paid' ? ` · paid ${day(c.decidedAt)}` : ''}
                  </span>
                  {c.adminNote && c.status !== 'pending' && <span className={`mc-note is-${s.tone}`}>{c.adminNote}</span>}
                </span>
                <span className="mc-reward">{fmtMoney(c.reward, Number.isInteger(c.reward) ? 0 : 2)}</span>
                <span className="mc-end">
                  <span className={`mc-pill is-${s.tone}`}>{s.label}</span>
                  {c.status === 'pending' && (
                    <button type="button" className="link-btn mc-cancel" disabled={busy === c.id} onClick={() => onCancel(c.id)}>
                      {busy === c.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="mc-error" role="alert">{error}</p>}
    </section>
  )
}
