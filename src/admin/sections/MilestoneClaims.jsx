import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Input, Pill, SectionIntro, Stat } from '../ui'
import './wager-admin.css'

// Milestone claims: look a player up by their Rainbet username, see which wager milestones
// they have reached (lifetime wager under the code), and mark the rewards you paid as
// claimed. A claimed tier shows as "Claimed" on their Milestones page.
// (server/features/milestoneClaims.js)

const API = '/api/admin/milestones'
const usd = (n) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const when = (s) => new Date(s * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function MilestoneClaimsAdmin() {
  const [q, setQ] = useState('')
  const [view, setView] = useState(null) // { player, tiers }
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notes, setNotes] = useState({})
  const [log, setLog] = useState(null)

  const loadLog = () =>
    apiGet(`${API}/claims`)
      .then(setLog)
      .catch(() => {})
  useEffect(() => {
    loadLog()
  }, [])

  const search = async (e) => {
    e?.preventDefault()
    const name = q.trim()
    if (!name) return
    setBusy('search')
    setError('')
    try {
      setView(await apiGet(`${API}/lookup?username=${encodeURIComponent(name)}`))
      setNotes({})
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const act = async (action, tier, extra = {}) => {
    setBusy(`${action}:${tier}`)
    setError('')
    try {
      setView(await apiPost(`${API}/${action}`, { username: view.player.name, tier, ...extra }))
      loadLog()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <SectionIntro>
        Search a player’s Rainbet username to see their milestones and mark the rewards you’ve paid as claimed. They see “Claimed” on the
        Milestones page.
      </SectionIntro>

      <form className="mc-search" onSubmit={search}>
        <Input value={q} onChange={setQ} placeholder="Rainbet username" maxLength={40} aria-label="Rainbet username" />
        <Button kind="primary" type="submit" busy={busy === 'search'}>
          Look up
        </Button>
      </form>
      <ErrorLine>{error}</ErrorLine>

      {view && (
        <Card>
          <div className="mc-player">
            <span className="mc-player-name">{view.player.name}</span>
            {view.player.found ? (
              <span className="mc-player-wager">
                <b>{usd(view.player.wagered)}</b> wagered under the code
              </span>
            ) : (
              <Pill tone="warn">Not found under the code</Pill>
            )}
          </div>
          <ul className="mc-tiers">
            {view.tiers.map((t) => {
              const claimed = Boolean(t.claim)
              return (
                <li key={t.id} className={`mc-tier${claimed ? ' is-claimed' : ''}${!t.reached && !claimed ? ' is-locked' : ''}`}>
                  <img src={t.icon} alt="" />
                  <span>
                    <span className="mc-tier-name">{t.name}</span>
                    <span className="mc-tier-meta">
                      {usd(t.wager)} wager · {usd(t.prize)} reward
                      {claimed && ` · claimed ${when(t.claim.at)}${t.claim.by ? ` by ${t.claim.by}` : ''}${t.claim.note ? ` · ${t.claim.note}` : ''}`}
                    </span>
                  </span>
                  {claimed ? (
                    <Pill tone="ok">Claimed</Pill>
                  ) : t.reached ? (
                    <Pill tone="live">Reached</Pill>
                  ) : (
                    <Pill tone="off">Not reached</Pill>
                  )}
                  {claimed ? (
                    <ConfirmButton busy={busy === `unclaim:${t.id}`} onConfirm={() => act('unclaim', t.id)} confirmLabel="Click again to undo">
                      Undo
                    </ConfirmButton>
                  ) : (
                    <span className="mc-tier-actions">
                      <Input
                        value={notes[t.id] ?? ''}
                        onChange={(v) => setNotes((n) => ({ ...n, [t.id]: v }))}
                        placeholder="Note (optional)"
                        maxLength={140}
                        aria-label={`Note for ${t.name}`}
                        className="mc-tier-note"
                      />{' '}
                      {t.reached ? (
                        <Button kind="primary" busy={busy === `claim:${t.id}`} onClick={() => act('claim', t.id, { note: notes[t.id] ?? '' })}>
                          Mark claimed
                        </Button>
                      ) : (
                        <ConfirmButton
                          kind="ghost"
                          busy={busy === `claim:${t.id}`}
                          onConfirm={() => act('claim', t.id, { note: notes[t.id] ?? '', force: true })}
                          confirmLabel="Not reached: click again"
                        >
                          Mark claimed
                        </ConfirmButton>
                      )}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card title="Recent claims" className="mc-log">
        {log && (
          <div className="ws-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 12 }}>
            <Stat label="Claims" value={log.totals.claims} />
            <Stat label="Players" value={log.totals.players} />
            <Stat label="Paid out" value={usd(log.totals.paid)} tone="gold" />
          </div>
        )}
        {!log ? (
          <span className="adm-spin adm-spin-inline" aria-label="Loading" />
        ) : log.claims.length === 0 ? (
          <Empty>No milestone rewards marked as claimed yet.</Empty>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Milestone</th>
                <th className="is-num">Reward</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {log.claims.map((c) => (
                <tr key={`${c.key}:${c.tier}`}>
                  <td>
                    <button
                      className="ws-name"
                      onClick={() => {
                        setQ(c.name)
                        apiGet(`${API}/lookup?username=${encodeURIComponent(c.name)}`).then(setView, (err) => setError(err.message))
                      }}
                    >
                      {c.name}
                    </button>
                  </td>
                  <td>{c.tier}</td>
                  <td className="is-num">{usd(c.prize)}</td>
                  <td>
                    {when(c.at)}
                    {c.by && <small> · {c.by}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
