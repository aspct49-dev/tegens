import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Input, Pill, SectionIntro } from '../ui'
import './site.css'
import './claims-admin.css'

// Claims: milestone rewards and challenge bounties players claimed on the site
// (server/features/claims.js). Pay the reward, then tick it: a paid milestone shows as
// "Claimed" on /milestones (and on Milestone Claims); a paid challenge is marked won by the
// player and any other waiting claim on it is turned down. ✗ turns a claim down with a note
// the player sees. Undo puts a decided claim back to waiting.
//
//   GET  /api/admin/claims?status=pending|paid|rejected|all&kind=milestone|challenge  → { claims, counts }
//   POST /api/admin/claims/<id>/pay { note? } | reject { note } | undo

const FILTERS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'paid', label: 'Paid' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]
const KINDS = [
  { id: '', label: 'Everything' },
  { id: 'milestone', label: 'Milestones' },
  { id: 'challenge', label: 'Challenges' },
]
const STATUS = { pending: ['warn', 'Waiting'], paid: ['ok', 'Paid'], rejected: ['off', 'Rejected'] }

const ago = (t) => {
  if (!t) return '—'
  const s = Math.max(0, Date.now() / 1000 - t)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
const when = (t) => (t ? new Date(t * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s)

/** The bet proof: a link opens in a new tab; an ID can be copied */
function Proof({ value }) {
  if (!value) return <span className="lk-sub">—</span>
  if (isUrl(value))
    return (
      <a className="cl-proof" href={value} target="_blank" rel="noopener noreferrer" title={value}>
        {value.replace(/^https?:\/\/(www\.)?/i, '')}
      </a>
    )
  return (
    <span className="cl-proof is-id pl-mono" title="Bet ID">
      {value}
    </span>
  )
}

export default function ClaimsAdmin() {
  const [filter, setFilter] = useState('pending')
  const [kind, setKind] = useState('')
  const [list, setList] = useState(null)
  const [counts, setCounts] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [rejecting, setRejecting] = useState(null) // { id, note }
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiGet(`/api/admin/claims?status=${filter}&kind=${kind}`).then(
      (d) => {
        if (cancelled) return
        setList(d.claims)
        setCounts(d.counts)
        setError('')
      },
      (err) => !cancelled && setError(err.message),
    )
    return () => {
      cancelled = true
    }
  }, [filter, kind, reload])

  const act = async (c, action, body = {}) => {
    setBusy(`${c.id}:${action}`)
    setError('')
    try {
      const d = await apiPost(`/api/admin/claims/${encodeURIComponent(c.id)}/${action}`, body)
      setCounts(d.counts)
      setRejecting(null)
      setReload((n) => n + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const pick = (set, value, current) => {
    if (value === current) return
    setList(null)
    setRejecting(null)
    set(value)
  }

  return (
    <>
      <SectionIntro>
        Players claim their milestone rewards and challenge bounties on the site. Pay the reward to their Rainbet account, then tick it here: the
        player sees it as paid on their profile. ✗ turns a claim down with a note they see.
      </SectionIntro>

      <Card title="Claims" actions={list && <span className="pl-count">{list.length} shown</span>}>
        <div className="pl-tools cl-tools">
          <div className="pl-seg" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`pl-seg-item${filter === f.id ? ' is-on' : ''}`}
                aria-pressed={filter === f.id}
                onClick={() => pick(setFilter, f.id, filter)}
              >
                {f.label}
                {f.id === 'pending' && counts?.pending > 0 && <span className="pl-badge">{counts.pending}</span>}
              </button>
            ))}
          </div>
          <div className="pl-seg" role="group" aria-label="Kind">
            {KINDS.map((k) => (
              <button
                key={k.id || 'all'}
                type="button"
                className={`pl-seg-item${kind === k.id ? ' is-on' : ''}`}
                aria-pressed={kind === k.id}
                onClick={() => pick(setKind, k.id, kind)}
              >
                {k.label}
                {k.id && counts?.[k.id] > 0 && <span className="pl-badge">{counts[k.id]}</span>}
              </button>
            ))}
          </div>
        </div>
        <ErrorLine>{error}</ErrorLine>

        {!list ? (
          <span className="adm-spin adm-spin-inline" aria-label="Loading" />
        ) : list.length === 0 ? (
          <Empty>{filter === 'pending' ? 'No claims waiting. Nice.' : 'No claims here yet.'}</Empty>
        ) : (
          <div className="pl-table-wrap">
            <table className="adm-table lk-table cl-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Claim</th>
                  <th className="is-num">Reward</th>
                  <th>Proof</th>
                  <th>Asked</th>
                  {filter !== 'pending' && <th>Status</th>}
                  <th className="is-num" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const isBusy = (a) => busy === `${c.id}:${a}`
                  const [tone, label] = STATUS[c.status] ?? ['off', c.status]
                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="cl-who">
                          <span className="pl-name">{c.kick ?? c.player}</span>
                          <span className="lk-sub">
                            Rainbet <b className="pl-mono lk-name">{c.rainbet}</b>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="cl-what">
                          <span className={`cl-kind is-${c.kind}`}>{c.kind === 'milestone' ? 'Milestone' : 'Challenge'}</span>
                          <span className="cl-title">{c.title}</span>
                          {c.note && <span className="lk-sub cl-note">“{c.note}”</span>}
                        </span>
                      </td>
                      <td className="is-num cl-reward">{usd(c.reward)}</td>
                      <td>
                        <Proof value={c.proof} />
                      </td>
                      <td className="lk-asked" title={when(c.at)}>
                        {ago(c.at)}
                      </td>
                      {filter !== 'pending' && (
                        <td>
                          <Pill tone={tone}>{label}</Pill>
                          {c.decidedBy && (
                            <span className="lk-sub lk-by" title={when(c.decidedAt)}>
                              by {c.decidedBy} · {ago(c.decidedAt)}
                            </span>
                          )}
                          {c.adminNote && <span className="lk-sub lk-by">{c.adminNote}</span>}
                        </td>
                      )}
                      <td className="is-num">
                        <span className="lk-actions">
                          {c.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="lk-btn is-yes cl-pay"
                                title={`Paid: ${c.title} to ${c.rainbet}`}
                                aria-label={`Mark ${c.title} for ${c.rainbet} as paid`}
                                disabled={Boolean(busy)}
                                onClick={() => act(c, 'pay')}
                              >
                                {isBusy('pay') ? <span className="adm-b-spin" /> : 'Paid ✓'}
                              </button>
                              <button
                                type="button"
                                className="lk-btn is-no"
                                title="Turn it down"
                                aria-label={`Reject ${c.title} for ${c.rainbet}`}
                                disabled={Boolean(busy)}
                                onClick={() => setRejecting(rejecting?.id === c.id ? null : { id: c.id, note: '' })}
                              >
                                ✗
                              </button>
                            </>
                          )}
                          {(c.status === 'paid' || c.status === 'rejected') && (
                            <ConfirmButton busy={isBusy('undo')} disabled={Boolean(busy)} onConfirm={() => act(c, 'undo')} confirmLabel="Sure?" kind="ghost">
                              Undo
                            </ConfirmButton>
                          )}
                        </span>
                        {rejecting?.id === c.id && (
                          <span className="cl-reject">
                            <Input
                              value={rejecting.note}
                              onChange={(v) => setRejecting({ id: c.id, note: v })}
                              placeholder="Why? The player sees this"
                              maxLength={200}
                              aria-label="Reason"
                            />
                            <Button kind="danger" busy={isBusy('reject')} disabled={Boolean(busy)} onClick={() => act(c, 'reject', { note: rejecting.note })}>
                              Reject
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
