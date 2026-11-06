import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Stat } from '../ui'
import './vip-admin.css'
import './activity-admin.css'

// VIPs: Kick usernames with the VIP badge on the site; they can call slots in chat (!call) when calls are VIPs-only and enter VIP giveaways.
// Their stats come from the wins recorded in Slot Calls.

const API = '/api/admin/vips'

const usd = (n) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (s) => (s ? new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export default function VipsAdmin() {
  const [vips, setVips] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(null) // the VIP whose profile is showing

  useEffect(() => {
    apiGet(API)
      .then((d) => setVips(d.vips))
      .catch((err) => setError(err.message))
  }, [])

  const act = async (path, body = {}, tag = path) => {
    setBusy(tag)
    setError('')
    try {
      const d = await apiPost(path, body)
      setVips(d.vips)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy('')
    }
  }

  if (!vips) return error ? <ErrorLine>{error}</ErrorLine> : <span className="adm-spin adm-spin-inline" aria-label="Loading" />
  if (open) return <VipProfile vipKey={open} onBack={() => setOpen(null)} />

  const totals = vips.reduce((t, v) => ({ calls: t.calls + v.calls, played: t.played + v.played, won: t.won + v.totalWon }), { calls: 0, played: 0, won: 0 })
  const top = [...vips].sort((a, b) => b.biggestWin - a.biggestWin)[0]

  return (
    <>
      <SectionIntro>
        VIPs get the VIP badge next to their name across the site, can call slots with <b>!call &lt;slot&gt;</b> even when Slot Calls is set to VIPs only, and enter VIP-only giveaways. Wins you record on their
        calls add up here.
      </SectionIntro>

      <AddVip onAdd={(username, note) => act(API, { username, note }, 'add')} busy={busy === 'add'} />
      <ErrorLine>{error}</ErrorLine>

      {vips.length > 0 && (
        <div className="vip-stats">
          <Stat label="VIPs" value={vips.length} tone="blue" />
          <Stat label="Calls in queue" value={totals.calls} />
          <Stat label="Calls played" value={totals.played} />
          <Stat label="Total won" value={usd(totals.won)} tone={totals.won ? 'gold' : undefined} />
        </div>
      )}

      <Card title={`VIP list · ${vips.length}`}>
        {vips.length === 0 ? (
          <Empty>No VIPs yet. Add their Kick username or channel link above.</Empty>
        ) : (
          <div className="vip-table-wrap">
            <table className="adm-table vip-table">
              <thead>
                <tr>
                  <th>VIP</th>
                  <th>Note</th>
                  <th className="is-num">Played</th>
                  <th className="is-num">Total won</th>
                  <th>Biggest win</th>
                  <th>Added</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {vips.map((v) => (
                  <VipRow key={v.key} v={v} top={top?.key === v.key && v.biggestWin > 0} act={act} busy={busy} onOpen={() => setOpen(v.key)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

function AddVip({ onAdd, busy }) {
  const [username, setUsername] = useState('')
  const [note, setNote] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    if (!username.trim()) return
    if (await onAdd(username.trim(), note.trim())) {
      setUsername('')
      setNote('')
    }
  }
  return (
    <Card title="Add a VIP">
      <form className="vip-add" onSubmit={submit} noValidate>
        <Field label="Kick channel">
          <Input value={username} onChange={setUsername} placeholder="kick.com/username or username" maxLength={80} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={setNote} placeholder="Optional, e.g. Discord name" maxLength={80} />
        </Field>
        <Button kind="primary" type="submit" busy={busy} disabled={!username.trim()}>
          Add VIP
        </Button>
      </form>
    </Card>
  )
}

function VipRow({ v, top, act, busy, onOpen }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(v.note)
  const save = async () => {
    if (await act(`${API}/${v.key}`, { note }, `note:${v.key}`)) setEditing(false)
  }
  return (
    <tr>
      <td>
        <button type="button" className="vip-name" onClick={onOpen} title="Open profile">
          {v.username}
        </button>
      </td>
      <td className="vip-note">
        {editing ? (
          <span className="vip-note-edit">
            <Input value={note} onChange={setNote} maxLength={80} aria-label={`Note for ${v.username}`} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
            <Button kind="primary" busy={busy === `note:${v.key}`} onClick={save}>
              Save
            </Button>
          </span>
        ) : (
          <button type="button" className="vip-note-btn" onClick={() => setEditing(true)} title="Edit note">
            {v.note || <span className="vip-dim">Add note</span>}
          </button>
        )}
      </td>
      <td className="is-num">{v.played}</td>
      <td className={`is-num${v.totalWon ? ' vip-gold' : ''}`}>{usd(v.totalWon)}</td>
      <td>
        {v.best ? (
          <span className="vip-best">
            <b className={top ? 'vip-gold' : ''}>{usd(v.best.win)}</b> <span className="vip-dim">on {v.best.slot}</span>
          </span>
        ) : (
          <span className="vip-dim">—</span>
        )}
      </td>
      <td className="vip-dim">{day(v.addedAt)}</td>
      <td className="is-num">
        <ConfirmButton disabled={busy !== ''} confirmLabel={`Remove ${v.username}?`} onConfirm={() => act(`${API}/${v.key}/remove`, {}, `rm:${v.key}`)}>
          Remove
        </ConfirmButton>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------- one VIP's profile

const when = (s) => new Date(s * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const multi = (w) => (w.bet ? `${(Math.round((w.win / w.bet) * 100) / 100).toLocaleString('en-US')}x` : '—')

function VipProfile({ vipKey, onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    apiGet(`${API}/${vipKey}`)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [vipKey])

  const back = (
    <button type="button" className="vipp-back" onClick={onBack}>
      ‹ All VIPs
    </button>
  )
  if (!data) return error ? (<>{back}<ErrorLine>{error}</ErrorLine></>) : <span className="adm-spin adm-spin-inline" aria-label="Loading" />

  const { vip, wins, queued, activity } = data
  const avgX = wins.filter((w) => w.bet).length ? wins.filter((w) => w.bet).reduce((s, w) => s + w.win / w.bet, 0) / wins.filter((w) => w.bet).length : null

  return (
    <>
      {back}
      <Card>
        <div className="vipp-head">
          <span className="vipp-mark" aria-hidden="true">{vip.username.slice(0, 1).toUpperCase()}</span>
          <div className="vipp-who">
            <h2 className="vipp-name">
              {vip.username} <Pill tone="warn">VIP</Pill>
            </h2>
            <p className="vipp-meta">
              Added {day(vip.addedAt)}
              {vip.addedBy ? ` by ${vip.addedBy}` : ''}
              {vip.note ? ` · ${vip.note}` : ''}
            </p>
          </div>
          <a className="adm-b is-ghost" href={`https://kick.com/${encodeURIComponent(vip.username)}`} target="_blank" rel="noopener noreferrer">
            Kick channel
          </a>
        </div>

        <div className="vip-stats vipp-stats">
          <Stat label="Calls played" value={vip.played} tone="blue" />
          <Stat label="Total won" value={usd(vip.totalWon)} tone={vip.totalWon ? 'gold' : undefined} />
          <Stat label="Biggest win" value={usd(vip.biggestWin)} />
          <Stat label="Average multiplier" value={avgX == null ? '—' : `${(Math.round(avgX * 100) / 100).toLocaleString('en-US')}x`} />
        </div>

        {vip.best && (
          <div className="vipp-best">
            {vip.best.image ? <img src={vip.best.image} width="60" height="80" alt="" /> : <span className="vipp-noart" />}
            <div>
              <span className="vipp-best-label">Best call</span>
              <span className="vipp-best-slot">{vip.best.slot}</span>
              <span className="vipp-best-win">
                {usd(vip.best.win)}
                {vip.best.bet ? <span> on {usd(vip.best.bet)} · {multi(vip.best)}</span> : null}
              </span>
            </div>
          </div>
        )}
      </Card>

      <div className="vipp-cols">
        <Card title={`Calls played · ${wins.length}`}>
          {wins.length === 0 ? (
            <Empty>No results recorded yet. Record wins in Slot Calls.</Empty>
          ) : (
            <table className="adm-table vipp-table">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th className="is-num">Bet</th>
                  <th className="is-num">Won</th>
                  <th className="is-num">Multi</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {wins.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <span className="vipp-slot">
                        {w.slot?.image ? <img src={w.slot.image} width="24" height="32" alt="" /> : <span className="vipp-noart is-sm" />}
                        {w.slot?.name ?? 'Slot'}
                      </span>
                    </td>
                    <td className="is-num">{w.bet ? usd(w.bet) : '—'}</td>
                    <td className="is-num vip-gold">{usd(w.win)}</td>
                    <td className="is-num">{multi(w)}</td>
                    <td className="vip-dim">{when(w.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {queued.length > 0 && (
            <p className="vipp-queued">
              In the queue now: {queued.map((c) => `${c.slot.name}${c.status === 'skipped' ? ' (skipped)' : ''}`).join(', ')}
            </p>
          )}
        </Card>

        <Card title="Activity">
          {activity.length === 0 ? (
            <Empty>Nothing logged for {vip.username} yet.</Empty>
          ) : (
            <ol className="act-list">
              {activity.map((e) => (
                <li key={e.id} className="act-row vipp-act">
                  <span className="act-time">{when(e.at)}</span>
                  <span className="act-text">
                    <b className="act-actor">{e.actor}</b> {e.text}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  )
}
