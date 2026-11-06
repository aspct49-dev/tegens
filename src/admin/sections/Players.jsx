import { useEffect, useState } from 'react'
import { config } from '../../config'
import { apiGet } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Stat } from '../ui'
import './site.css'

// Players: every account that has signed in (the players table), searchable by
// name, Kick, Discord or Rainbet. Pick one for their links and Rainbet progress.
// Players ask to link their Rainbet username on /profile; it only counts once an
// admin approves it on the Links tab (Links.jsx). A player's detail can still set,
// change or remove it by hand.
//
//   GET  /api/admin/players?q=&status=pending  → { players, total, pending }
//   GET  /api/admin/players/<id>               → { player, rainbet, link, wins }
//   POST /api/admin/players/<id>/rainbet { username, force }   set / change, approved at once (checked)
//   POST /api/admin/players/<id>/rainbet-approve { force }     approve a waiting request (checked again)
//   POST /api/admin/players/<id>/rainbet-reject  { note }
//   POST /api/admin/players/<id>/unlink-rainbet  { note }
//
// When Rainbet can't confirm the name the server answers { code: 'not_verified' };
// the same call with force: true goes ahead ("Approve anyway" / "Link anyway").

const when = (t) => (t ? new Date(t * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
const ago = (t) => {
  if (!t) return '—'
  const s = Math.max(0, Date.now() / 1000 - t)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 86400 * 45) return `${Math.round(s / 86400)}d ago`
  return when(t).split(',').slice(0, 2).join(',')
}
const money = (v) => `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** A row's link status (a link saved before approvals has none: it's approved) */
const statusOf = (link) => (link?.username ? (link.status ?? 'approved') : null)
const STATUS = { pending: ['warn', 'Waiting'], approved: ['ok', 'Linked'], rejected: ['off', 'Rejected'], unlinked: ['off', 'Unlinked'] }

/** POST that keeps the server's error code (apiPost only keeps the message) */
async function post(path, body = {}) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { code: data.code })
  return data
}

function Avatar({ player, size = 32 }) {
  return player.avatar ? (
    <img className="pl-avatar" src={player.avatar} width={size} height={size} alt="" />
  ) : (
    <span className="pl-avatar pl-initial" style={{ width: size, height: size }} aria-hidden="true">
      {(player.name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

function LinkCell({ link }) {
  const status = statusOf(link)
  if (!status) return <span className="pl-none">—</span>
  return (
    <span className="pl-link">
      <span className={status === 'approved' || status === 'pending' ? 'pl-mono' : 'pl-none'}>{link.username}</span>
      {status !== 'approved' && <Pill tone={STATUS[status][0]}>{STATUS[status][1]}</Pill>}
    </span>
  )
}

export default function PlayersAdmin({ open }) {
  const [q, setQ] = useState('')
  const requests = false // link requests live on their own tab now (Links.jsx)
  const [list, setList] = useState(null)
  const [total, setTotal] = useState(0)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [reload, setReload] = useState(0)

  // search as you type (debounced)
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      apiGet(`/api/admin/players?q=${encodeURIComponent(q.trim())}${requests ? '&status=pending' : ''}`).then(
        (d) => {
          if (cancelled) return
          setList(d.players)
          setTotal(d.total ?? d.players.length)
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
  }, [q, requests, reload])

  // keep the row (and the request count) in step with changes made in the detail
  const onChanged = (player) => {
    setList((l) => l?.map((p) => (p.id === player.id ? player : p)) ?? l)
    setReload((n) => n + 1)
  }

  return (
    <>
      <SectionIntro>
        Everyone who has signed in with Kick, most recently seen first. Rainbet link requests are approved on the Links tab; pick a
        player here to set, change or remove theirs by hand.
      </SectionIntro>

      <div className={`pl-layout${selected ? ' has-detail' : ''}`}>
        <Card
          title={requests ? 'Link requests' : 'Players'}
          actions={
            list && (
              <span className="pl-count">
                {q.trim() ? `${total} found` : `${total} ${requests ? 'waiting' : 'total'}`}
                {total > list.length ? ` · showing ${list.length}` : ''}
              </span>
            )
          }
        >
          <div className="pl-tools">
            {pending > 0 && (
              <button type="button" className="pl-seg-item pl-to-links" onClick={() => open?.('links')}>
                Link requests <span className="pl-badge">{pending}</span>
              </button>
            )}
            <div className="pl-search">
              <Input value={q} onChange={setQ} placeholder="Search name, Kick, Discord or Rainbet…" type="search" aria-label="Search players" />
            </div>
          </div>
          <ErrorLine>{error}</ErrorLine>
          {!list ? (
            <span className="adm-spin adm-spin-inline" aria-label="Loading" />
          ) : list.length === 0 ? (
            <Empty>
              {q.trim() ? `Nobody matches “${q.trim()}”.` : requests ? 'No link requests waiting.' : 'Nobody has signed in yet.'}
            </Empty>
          ) : (
            <div className="pl-table-wrap">
              <table className="adm-table pl-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Discord</th>
                    <th>Rainbet</th>
                    <th className="is-num">{requests ? 'Asked' : 'Last seen'}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const t = requests ? p.rainbet?.requestedAt : p.lastSeen
                    return (
                      <tr key={p.id} className={selected === p.id ? 'is-selected' : ''} onClick={() => setSelected(p.id)}>
                        <td>
                          <button type="button" className="pl-who" onClick={() => setSelected(p.id)}>
                            <Avatar player={p} size={28} />
                            <span>
                              <span className="pl-name">{p.name}</span>
                              {p.kick?.username && p.kick.username !== p.name && <span className="pl-sub">{p.kick.username}</span>}
                            </span>
                          </button>
                        </td>
                        <td>{p.discord ? <span className="pl-mono">{p.discord.username}</span> : <span className="pl-none">—</span>}</td>
                        <td>
                          <LinkCell link={p.rainbet} />
                        </td>
                        <td className="is-num pl-seen" title={when(t)}>
                          {ago(t)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {selected && <PlayerDetail id={selected} onClose={() => setSelected(null)} onChanged={onChanged} open={open} />}
      </div>
    </>
  )
}

function PlayerDetail({ id, onClose, onChanged, open }) {
  const [view, setView] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  // set after a 'not_verified' answer: the same call again with force
  const [anyway, setAnyway] = useState(null)

  useEffect(() => {
    let cancelled = false
    setView(null)
    setError('')
    setAnyway(null)
    setNote('')
    apiGet(`/api/admin/players/${encodeURIComponent(id)}`).then(
      (v) => !cancelled && setView(v),
      (err) => !cancelled && setError(err.message),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  const act = async (path, body = {}) => {
    setBusy(true)
    setError('')
    setAnyway(null)
    try {
      const v = await post(`/api/admin/players/${encodeURIComponent(id)}/${path}`, body)
      setView(v)
      setName('')
      setNote('')
      onChanged(v.player)
    } catch (err) {
      setError(err.message)
      if (err.code === 'not_verified')
        setAnyway({ path, body: { ...body, force: true }, label: path === 'rainbet-approve' ? 'Approve anyway' : 'Link anyway' })
    } finally {
      setBusy(false)
    }
  }

  const p = view?.player
  const rb = view?.rainbet
  const link = view?.link ?? null
  const status = statusOf(link)

  const noteField = (
    <Field label="Note to the player" hint="Optional. Shown on their profile.">
      <Input value={note} onChange={setNote} placeholder="e.g. Not under the code" maxLength={200} />
    </Field>
  )

  return (
    <Card className="pl-detail" title={p ? p.name : 'Player'} actions={<Button onClick={onClose}>Close</Button>}>
      {!view && !error && <span className="adm-spin adm-spin-inline" aria-label="Loading" />}
      <ErrorLine>{error}</ErrorLine>
      {anyway && (
        <div className="adm-row pl-anyway">
          <ConfirmButton kind="primary" busy={busy} onConfirm={() => act(anyway.path, anyway.body)} confirmLabel="Click again if you’re sure">
            {anyway.label}
          </ConfirmButton>
          <span className="pl-sub">Only if you’re sure the name is theirs.</span>
        </div>
      )}
      {p && (
        <div className="pl-detail-body">
          <div className="pl-head">
            <Avatar player={p} size={56} />
            <div>
              <p className="pl-head-name">{p.name}</p>
              <p className="pl-head-id">
                <code>{p.id}</code>
              </p>
            </div>
          </div>

          <dl className="pl-facts">
            <div>
              <dt>Kick</dt>
              <dd>
                {p.kick ? (
                  <span className="pl-kick">
                    <a href={`https://kick.com/${encodeURIComponent(p.kick.username)}`} target="_blank" rel="noopener noreferrer">
                      {p.kick.username}
                    </a>
                    {open && (
                      <Button onClick={() => open('points', { kick: p.kick.username })}>Give Botrix points</Button>
                    )}
                  </span>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Discord</dt>
              <dd>
                {p.discord ? (
                  <>
                    {p.discord.name && p.discord.name !== p.discord.username ? `${p.discord.name} · ` : ''}@{p.discord.username} <code className="pl-snow">{p.discord.id}</code>
                  </>
                ) : (
                  'Not linked'
                )}
              </dd>
            </div>
            <div>
              <dt>First seen</dt>
              <dd>{when(p.firstSeen)}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{when(p.lastSeen)} ({ago(p.lastSeen)})</dd>
            </div>
          </dl>

          <div className={`pl-rainbet${status === 'pending' ? ' is-pending' : ''}`}>
            <div className="pl-rainbet-head">
              <span className="adm-field-label">Rainbet</span>
              {status ? <Pill tone={STATUS[status][0]}>{STATUS[status][1]}</Pill> : <Pill>Not linked</Pill>}
            </div>

            {status === 'pending' && (
              <>
                <p className="pl-rainbet-name">
                  {link.username}
                  <span className="pl-sub"> · asked {when(link.requestedAt)}</span>
                </p>
                <p className="pl-sub">
                  {link.verified === false
                    ? 'Not confirmed: Rainbet couldn’t be reached when they asked.'
                    : `Found under code ${config.referralCode} when they asked.`}{' '}
                  Approving checks again.
                </p>
                <div className="adm-row">
                  <Button kind="primary" busy={busy} onClick={() => act('rainbet-approve')}>
                    Approve
                  </Button>
                </div>
                <div className="adm-row pl-set">
                  {noteField}
                  <ConfirmButton busy={busy} onConfirm={() => act('rainbet-reject', { note: note.trim() })} confirmLabel="Click again to reject">
                    Reject
                  </ConfirmButton>
                </div>
              </>
            )}

            {status === 'approved' && rb && (
              <>
                <p className="pl-rainbet-name">
                  {rb.username}
                  {rb.linkedAt && <span className="pl-sub"> · linked {when(rb.linkedAt)}</span>}
                </p>
                {(link.decidedBy || link.approvedAnyway) && (
                  <p className="pl-sub">
                    {link.decidedBy ? `Approved by ${link.decidedBy}` : 'Approved'}
                    {link.approvedAnyway ? ' without Rainbet confirming it.' : '.'}
                  </p>
                )}
                {rb.wagered != null ? (
                  <div className="pl-stats">
                    <Stat label={`Wagered since ${rb.since}`} value={money(rb.wagered)} tone="blue" />
                    <Stat label="Tier" value={rb.tier?.name ?? 'None yet'} tone={rb.tier ? 'gold' : undefined} />
                    <Stat label="Next" value={rb.next ? `${rb.next.name} · ${Math.round(rb.pct * 100)}%` : 'Top tier'} />
                  </div>
                ) : (
                  <p className="pl-sub">{rb.error ?? 'Wager unavailable right now.'}</p>
                )}
                <div className="adm-row pl-set">
                  {noteField}
                  <ConfirmButton busy={busy} onConfirm={() => act('unlink-rainbet', { note: note.trim() })} confirmLabel="Click again to unlink">
                    Unlink
                  </ConfirmButton>
                </div>
              </>
            )}

            {(status === 'rejected' || status === 'unlinked') && (
              <p className="pl-sub">
                {status === 'rejected' ? 'Rejected' : 'Unlinked'} <b className="pl-mono">{link.username}</b> {when(link.decidedAt)}
                {link.decidedBy ? ` by ${link.decidedBy}` : ''}
                {link.note ? `: “${link.note}”` : ''}. They can ask again from their profile.
              </p>
            )}

            {!status && <p className="pl-sub">They can ask from their profile, or you can set it here.</p>}

            <form
              className="adm-row pl-set"
              onSubmit={(e) => {
                e.preventDefault()
                if (name.trim()) act('rainbet', { username: name.trim() })
              }}
            >
              <Field label={status === 'approved' ? 'Change to' : 'Set username'} hint="Checked with Rainbet; linked and approved at once.">
                <Input value={name} onChange={setName} placeholder="Rainbet username" maxLength={32} />
              </Field>
              <Button kind="primary" type="submit" busy={busy} disabled={!name.trim()}>
                {status === 'approved' ? 'Change' : 'Link'}
              </Button>
            </form>
          </div>

          {view.wins?.length > 0 && (
            <div className="pl-wins">
              <span className="adm-field-label">Recent wins</span>
              <ul>
                {view.wins.map((w, i) => (
                  <li key={i}>
                    <Pill tone="live">{w.kind}</Pill> {w.title}
                    {w.prize != null && <b> · {typeof w.prize === 'number' ? money(w.prize) : String(w.prize)}</b>}
                    {w.at && <span className="pl-sub"> · {when(w.at)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
