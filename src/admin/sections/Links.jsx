import { useEffect, useState } from 'react'
import { config } from '../../config'
import { apiGet } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Input, Pill, SectionIntro } from '../ui'
import './site.css'

// Links: Rainbet usernames players asked to link on their profile, on their own tab (like
// the Rekoj admin's). Each row has a tick for "is this name under the code", from the last
// check (when they asked, when it was approved, or Re-check). Waiting rows are approved with
// ✓ or rejected with ✗ in one go; linked ones can be re-checked or unlinked.
//
//   GET  /api/admin/players?q=&status=pending | linked | links  → { players, total, pending }
//   POST /api/admin/players/<id>/rainbet-approve { force }  approve (looked up again first)
//   POST /api/admin/players/<id>/rainbet-reject             turn it down
//   POST /api/admin/players/<id>/unlink-rainbet             remove it (they can ask again)
//   POST /api/admin/players/<id>/rainbet-check              look the name up again (the tick)
// When Rainbet can't confirm the name on approve the server answers { code: 'not_verified' };
// "Approve anyway" sends the same call with force: true.

const FILTERS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'linked', label: 'Linked' },
  { id: 'links', label: 'All' },
]
const STATUS = { pending: ['warn', 'Waiting'], approved: ['ok', 'Linked'], rejected: ['off', 'Rejected'], unlinked: ['off', 'Unlinked'] }
const statusOf = (l) => (l?.username ? (l.status ?? 'approved') : null)

const ago = (t) => {
  if (!t) return '—'
  const s = Math.max(0, Date.now() / 1000 - t)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
const when = (t) => (t ? new Date(t * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/** POST that keeps the server's error code */
async function post(path, body = {}) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { code: data.code })
  return data
}

/** The tick: is the name under the code, from the last check */
function UnderCode({ link }) {
  const checked = link.checkedAt ?? link.decidedAt ?? link.requestedAt ?? link.linkedAt
  let mark
  if (link.checkFailed) mark = <span className="lk-tick is-unknown">? Couldn’t check</span>
  else if (link.verified === false)
    mark = <span className="lk-tick is-no">✗ {link.checkedAt ? 'Not found' : 'Not confirmed'}</span>
  else mark = <span className="lk-tick is-yes">✓ Under {config.referralCode}</span>
  return (
    <span className="lk-under">
      {mark}
      {checked && (
        <span className="lk-sub" title={when(checked)}>
          checked {ago(checked)}
          {link.approvedAnyway ? ' · approved anyway' : ''}
        </span>
      )}
    </span>
  )
}

export default function LinksAdmin() {
  const [filter, setFilter] = useState('pending')
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [anyway, setAnyway] = useState(null) // { id, message } after a not_verified answer
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      apiGet(`/api/admin/players?status=${filter}&q=${encodeURIComponent(q.trim())}`).then(
        (d) => {
          if (cancelled) return
          setList(d.players)
          setPending(d.pending ?? 0)
          setError('')
        },
        (err) => !cancelled && setError(err.message),
      )
    }, q ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [filter, q, reload])

  const act = async (p, action, body = {}) => {
    setBusy(`${p.id}:${action}`)
    setError('')
    setAnyway(null)
    try {
      const v = await post(`/api/admin/players/${encodeURIComponent(p.id)}/${action}`, body)
      // the row changes (or leaves this filter): update it in place, then refresh the list
      setList((l) => l?.map((x) => (x.id === p.id ? v.player : x)) ?? l)
      setReload((n) => n + 1)
    } catch (err) {
      if (err.code === 'not_verified') setAnyway({ id: p.id, message: err.message })
      else setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const pick = (id) => {
    if (id === filter) return
    setList(null)
    setAnyway(null)
    setFilter(id)
  }

  return (
    <>
      <SectionIntro>
        Players ask to link their Rainbet username on their profile. It only counts (tier, wins, the side nav) once you approve it
        here. The tick shows whether the name was found under code {config.referralCode}; approving looks it up again.
      </SectionIntro>

      <Card title="Rainbet links" actions={list && <span className="pl-count">{q.trim() ? `${list.length} found` : `${list.length} shown`}</span>}>
        <div className="pl-tools">
          <div className="pl-seg" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`pl-seg-item${filter === f.id ? ' is-on' : ''}`}
                aria-pressed={filter === f.id}
                onClick={() => pick(f.id)}
              >
                {f.label}
                {f.id === 'pending' && pending > 0 && <span className="pl-badge">{pending}</span>}
              </button>
            ))}
          </div>
          <div className="pl-search">
            <Input value={q} onChange={setQ} placeholder="Search Kick or Rainbet name…" type="search" aria-label="Search links" />
          </div>
        </div>
        <ErrorLine>{error}</ErrorLine>

        {!list ? (
          <span className="adm-spin adm-spin-inline" aria-label="Loading" />
        ) : list.length === 0 ? (
          <Empty>
            {q.trim() ? `Nobody matches “${q.trim()}”.` : filter === 'pending' ? 'No link requests waiting.' : 'No linked accounts yet.'}
          </Empty>
        ) : (
          <div className="pl-table-wrap">
            <table className="adm-table lk-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Rainbet</th>
                  <th>Under {config.referralCode}?</th>
                  <th>Asked</th>
                  {filter !== 'pending' && <th>Status</th>}
                  <th className="is-num" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const l = p.rainbet
                  const status = statusOf(l)
                  const isBusy = (a) => busy === `${p.id}:${a}`
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="lk-who">
                          {p.avatar ? (
                            <img className="pl-avatar" src={p.avatar} width="26" height="26" alt="" />
                          ) : (
                            <span className="pl-avatar pl-initial" style={{ width: 26, height: 26 }} aria-hidden="true">
                              {(p.name ?? '?').slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="pl-name">{p.kick?.username ?? p.name}</span>
                        </span>
                      </td>
                      <td>
                        <span className="pl-mono lk-name">{l.username}</span>
                      </td>
                      <td>
                        <UnderCode link={l} />
                      </td>
                      <td className="lk-asked" title={when(l.requestedAt)}>
                        {ago(l.requestedAt ?? l.linkedAt)}
                      </td>
                      {filter !== 'pending' && (
                        <td>
                          <Pill tone={STATUS[status][0]}>{STATUS[status][1]}</Pill>
                          {l.decidedBy && <span className="lk-sub lk-by">by {l.decidedBy}</span>}
                        </td>
                      )}
                      <td className="is-num">
                        <span className="lk-actions">
                          {status === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="lk-btn is-yes"
                                title={`Approve ${l.username}`}
                                aria-label={`Approve ${l.username}`}
                                disabled={Boolean(busy)}
                                onClick={() => act(p, 'rainbet-approve')}
                              >
                                {isBusy('rainbet-approve') ? <span className="adm-b-spin" /> : '✓'}
                              </button>
                              <button
                                type="button"
                                className="lk-btn is-no"
                                title={`Reject ${l.username}`}
                                aria-label={`Reject ${l.username}`}
                                disabled={Boolean(busy)}
                                onClick={() => act(p, 'rainbet-reject')}
                              >
                                {isBusy('rainbet-reject') ? <span className="adm-b-spin" /> : '✗'}
                              </button>
                            </>
                          )}
                          {(status === 'pending' || status === 'approved') && (
                            <Button busy={isBusy('rainbet-check')} disabled={Boolean(busy)} onClick={() => act(p, 'rainbet-check')}>
                              Re-check
                            </Button>
                          )}
                          {status === 'approved' && (
                            <ConfirmButton busy={isBusy('unlink-rainbet')} disabled={Boolean(busy)} onConfirm={() => act(p, 'unlink-rainbet')} confirmLabel="Sure?">
                              Unlink
                            </ConfirmButton>
                          )}
                        </span>
                        {anyway?.id === p.id && (
                          <span className="lk-anyway">
                            <span>{anyway.message}</span>
                            <ConfirmButton
                              kind="primary"
                              busy={isBusy('rainbet-approve')}
                              onConfirm={() => act(p, 'rainbet-approve', { force: true })}
                              confirmLabel="Click again if you’re sure"
                            >
                              Approve anyway
                            </ConfirmButton>
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
