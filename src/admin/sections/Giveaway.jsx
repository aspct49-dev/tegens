import { useEffect, useMemo, useState } from 'react'
import { apiPost } from '../api'
import { usePolled } from '../../hooks/usePolled'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Stat, Toggle } from '../ui'
import { ScaledFrame } from './Overlays'
import '../giveaway.css'
import './site.css'

// Chat giveaway: viewers type the keyword in Kick chat, the server listens (even
// with this tab closed) and draws. The overlay (/overlay/giveaway) plays the draw.

const API = '/api/admin/giveaway'
const SHOW_MAX = 300

const when = (s) => (s ? new Date(s * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '')
const day = (s) => new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

export default function GiveawayAdmin() {
  const polled = usePolled(API, 2000)
  const [snap, setSnap] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (polled.data) setSnap(polled.data)
  }, [polled.data])

  const act = async (route, body = {}) => {
    setBusy(route)
    setError('')
    try {
      const res = await apiPost(`${API}/${route}`, body)
      setSnap((s) => ({ giveaway: 'giveaway' in res ? res.giveaway : s?.giveaway ?? null, history: res.history ?? s?.history ?? [], chat: s?.chat }))
      polled.reload()
      return res
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy('')
    }
  }

  if (!snap) {
    return polled.error ? <ErrorLine>{polled.error}</ErrorLine> : <span className="adm-spin adm-spin-inline" aria-label="Loading" />
  }

  const g = snap.giveaway
  const chat = snap.chat ?? { feed: [], recent: {} }
  return (
    <>
      <SectionIntro>
        Viewers enter by typing the keyword in Kick chat. The server reads chat itself, so entries keep coming with this
        tab closed. Draws play on the <b>/overlay/giveaway</b> browser source, shown here as the stream sees it.
      </SectionIntro>
      {g ? <Running g={g} act={act} busy={busy} recent={chat.recent} /> : <StartForm act={act} busy={busy} />}
      <ErrorLine>{error}</ErrorLine>
      <div className={`gw-live${g ? '' : ' is-chat-only'}`}>
        {g && (
          <Card title="Roller" actions={<span className="gw-sub">What the stream sees</span>}>
            <ScaledFrame src="/overlay/giveaway" w={540} h={320} title="Giveaway roller as the stream sees it" />
          </Card>
        )}
        <ChatFeed feed={chat.feed} g={g} />
      </div>
      {g && <Entrants g={g} act={act} recent={chat.recent} />}
      <PastWinners history={snap.history ?? []} act={act} busy={busy} />
    </>
  )
}

// ---------------------------------------------------------------- start

function StartForm({ act, busy }) {
  const [form, setForm] = useState({ prize: '', keyword: '!join', value: '', announce: true, vipOnly: false, postWins: true })
  const [error, setError] = useState('')
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (e) => {
    e.preventDefault()
    if (!form.prize.trim()) return setError('What are you giving away?')
    if (!/^\S{1,24}$/.test(form.keyword.trim())) return setError('The keyword is one word, like !join.')
    setError('')
    act('start', {
      prize: form.prize.trim(),
      keyword: form.keyword.trim(),
      value: form.value.trim(),
      announce: form.announce,
      vipOnly: form.vipOnly,
      postWins: form.postWins,
    })
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card title="Start a giveaway">
        <div className="gw-start">
          <Field label="Prize">
            <Input value={form.prize} onChange={set('prize')} placeholder="$50 Rainbet tip" maxLength={80} />
          </Field>
          <Field label="Chat keyword">
            <Input value={form.keyword} onChange={set('keyword')} placeholder="!join" maxLength={24} />
          </Field>
          <Field label="Value (optional)" hint="In $, for the Giveaways page total. “$50 …” prizes fill it in.">
            <Input value={form.value} onChange={set('value')} unit="$" inputMode="decimal" placeholder="50" />
          </Field>
        </div>
        {/* A points minimum (BotRix / site points) would sit here once TEGENS has points. */}
        <ErrorLine>{error}</ErrorLine>
        <div className="gw-actions is-split gw-start-foot">
          <span className="gw-toggles">
            <Toggle checked={form.announce} onChange={set('announce')} label="Bot announces start and tags the winner" />
            <Toggle checked={form.vipOnly} onChange={set('vipOnly')} label="VIP giveaway (only VIPs can enter)" />
            <Toggle checked={form.postWins} onChange={set('postWins')} label="Post winners on the Giveaways page" />
          </span>
          <Button kind="primary" type="submit" busy={busy === 'start'}>
            Start giveaway
          </Button>
        </div>
      </Card>
    </form>
  )
}

// ---------------------------------------------------------------- running

/** Someone's latest chat lines (newest first), or a note that they haven't been seen */
function Said({ lines, max = 3 }) {
  if (!lines?.length) return <span className="gw-said is-none">No chat seen since the server started</span>
  return (
    <ul className="gw-said">
      {lines.slice(0, max).map((l, i) => (
        <li key={i}>
          <span className="gw-said-time">{when(l.at)}</span>
          <span className="gw-said-text">{l.text}</span>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- live chat

function ChatFeed({ feed, g }) {
  const [only, setOnly] = useState(false)
  const kw = g?.keyword?.toLowerCase()
  const entrants = useMemo(() => new Set((g?.entries ?? []).map((e) => e.name.toLowerCase())), [g?.entries])
  const winners = useMemo(() => new Set((g?.winners ?? []).filter((w) => !w.void).map((w) => w.name.toLowerCase())), [g?.winners])
  const rows = only ? feed.filter((l) => entrants.has(l.name.toLowerCase())) : feed
  return (
    <Card
      title="Live chat"
      actions={g && <Toggle checked={only} onChange={setOnly} label="Entrants only" />}
    >
      {rows.length === 0 ? (
        <Empty>{feed.length ? 'No entrant has chatted yet.' : 'No chat yet. Messages show here as they arrive (since the server started).'}</Empty>
      ) : (
        <ul className="gw-chat">
          {rows.map((l, i) => {
            const who = l.name.toLowerCase()
            const isEntry = kw && l.text.trim().toLowerCase().startsWith(kw)
            return (
              <li key={`${l.at}-${i}`} className={`gw-chat-line${isEntry ? ' is-entry' : ''}${winners.has(who) ? ' is-winner' : ''}`}>
                <span className="gw-chat-time">{when(l.at)}</span>
                <span className={`gw-chat-name${entrants.has(who) ? ' is-in' : ''}`}>{l.name}</span>
                <span className="gw-chat-text">{l.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Running({ g, act, busy, recent = {} }) {
  const [editing, setEditing] = useState(false)
  const drawnIds = new Set(g.winners.map((w) => w.kickId))
  const live = g.entries.filter((e) => !e.removed)
  const eligible = live.filter((e) => !drawnIds.has(e.kickId)).length
  const removed = g.entries.length - live.length
  const winners = g.winners.filter((w) => !w.void)
  const latest = winners[0]
  const any = busy !== ''

  return (
    <Card
      title={
        <span className="gw-title">
          {g.prize}
          <span className="gw-sub">
            Type <b>{g.keyword}</b> in chat
          </span>
        </span>
      }
      actions={
        <>
          {g.vipOnly && <Pill tone="warn">VIPs only</Pill>}
          {g.postWins && <Pill tone="ok">Posts winners to /giveaways</Pill>}
          {g.open ? <Pill tone="live">Taking entries</Pill> : <Pill tone="off">Entries closed</Pill>}
          <Button onClick={() => setEditing((v) => !v)}>{editing ? 'Done' : 'Edit'}</Button>
        </>
      }
    >
      {editing && <EditRow g={g} act={act} busy={busy} onDone={() => setEditing(false)} />}

      <div className="gw-stats">
        <Stat label="Entries" value={live.length.toLocaleString('en-US')} tone="blue" />
        <Stat label="Can still win" value={eligible.toLocaleString('en-US')} />
        <Stat label="Winners" value={winners.length} tone={winners.length ? 'gold' : undefined} />
        <Stat label="Removed" value={removed} />
      </div>

      {latest && (
        <div className="gw-winner" key={latest.drawId}>
          <span className="gw-winner-label">{g.draw?.redraw && g.draw.id === latest.drawId ? 'Re-drawn winner' : 'Winner'}</span>
          <span className="gw-winner-name">{latest.name}</span>
          <a className="gw-winner-link" href={`https://kick.com/${encodeURIComponent(latest.name)}`} target="_blank" rel="noopener noreferrer">
            kick.com/{latest.name}
          </a>
          <div className="gw-winner-said">
            <span className="gw-winner-label">Their latest messages</span>
            <Said lines={recent[latest.name.toLowerCase()]} />
          </div>
        </div>
      )}

      <div className="gw-actions is-split">
        <div className="gw-actions">
          <Button busy={busy === 'open' || busy === 'close'} disabled={any} onClick={() => act(g.open ? 'close' : 'open')}>
            {g.open ? 'Close entries' : 'Reopen entries'}
          </Button>
          {g.vipOnly && (
            <Button busy={busy === 'enter-vips'} disabled={any} onClick={() => act('enter-vips')} title="Put every VIP on the list into the draw, without them typing the keyword">
              Enter every VIP
            </Button>
          )}
          <ConfirmButton kind="ghost" disabled={any} confirmLabel="End and save winners?" onConfirm={() => act('end')}>
            End giveaway
          </ConfirmButton>
          <ConfirmButton disabled={any} confirmLabel="Discard, save nothing?" onConfirm={() => act('end', { discard: true })}>
            Discard
          </ConfirmButton>
        </div>
        <div className="gw-actions">
          {latest && (
            <ConfirmButton
              kind="ghost"
              disabled={any || !eligible}
              confirmLabel={`Replace ${latest.name}?`}
              onConfirm={() => act('draw', { redraw: true })}
              title="The latest winner didn't claim: void them and draw someone else"
            >
              Re-draw
            </ConfirmButton>
          )}
          <Button kind="gold" busy={busy === 'draw'} disabled={any || !eligible} onClick={() => act('draw')}>
            {latest ? 'Draw another winner' : 'Draw winner'}
          </Button>
        </div>
      </div>
      {!eligible && live.length > 0 && <p className="gw-note">Everyone left has been drawn. Reopen entries for more.</p>}
    </Card>
  )
}

function EditRow({ g, act, busy, onDone }) {
  const [form, setForm] = useState({
    prize: g.prize,
    keyword: g.keyword,
    value: g.value != null ? String(g.value) : '',
    announce: g.announce,
    vipOnly: Boolean(g.vipOnly),
    postWins: Boolean(g.postWins),
  })
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const save = async () => {
    const body = { prize: form.prize, keyword: form.keyword, value: form.value.trim(), announce: form.announce, vipOnly: form.vipOnly, postWins: form.postWins }
    if (await act('update', body)) onDone()
  }
  return (
    <div className="adm-row gw-edit">
      <Field label="Prize">
        <Input value={form.prize} onChange={set('prize')} maxLength={80} />
      </Field>
      <Field label="Chat keyword">
        <Input value={form.keyword} onChange={set('keyword')} maxLength={24} />
      </Field>
      <Field label="Value ($)">
        <Input value={form.value} onChange={set('value')} unit="$" inputMode="decimal" placeholder="—" />
      </Field>
      <Toggle checked={form.announce} onChange={set('announce')} label="Bot announces" />
      <Toggle checked={form.vipOnly} onChange={set('vipOnly')} label="VIPs only" />
      <Toggle checked={form.postWins} onChange={set('postWins')} label="Post winners on Giveaways page" />
      <Button kind="primary" busy={busy === 'update'} onClick={save}>
        Save
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------- entrants

function Entrants({ g, act, recent = {} }) {
  const [q, setQ] = useState('')
  const [pending, setPending] = useState('')
  const status = useMemo(() => {
    const m = new Map()
    for (const w of g.winners) m.set(w.kickId, w.void ? 'void' : 'won')
    return m
  }, [g.winners])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = [...g.entries].reverse()
    return needle ? list.filter((e) => e.name.toLowerCase().includes(needle)) : list
  }, [g.entries, q])

  const toggle = async (e) => {
    setPending(e.kickId)
    await act(e.removed ? 'restore' : 'remove', { kickId: e.kickId })
    setPending('')
  }

  return (
    <Card
      title={`Entrants · ${g.entries.length.toLocaleString('en-US')}`}
      actions={
        <span className="gw-search">
          <Input value={q} onChange={setQ} placeholder="Search names" aria-label="Search entrants" />
        </span>
      }
    >
      {g.entries.length === 0 ? (
        <Empty>{g.open ? `Nobody yet. Tell chat to type ${g.keyword}.` : 'Nobody entered.'}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No entrant matches “{q}”.</Empty>
      ) : (
        <>
          <ul className="gw-list">
            {rows.slice(0, SHOW_MAX).map((e) => {
              const s = status.get(e.kickId)
              return (
                <li key={e.kickId} className={`gw-entry${e.removed ? ' is-removed' : ''}${s === 'won' ? ' is-won' : ''}`}>
                  <span className="gw-entry-who">
                    <span className="gw-entry-name">{e.name}</span>
                    {(() => {
                      const last = recent[e.name.toLowerCase()]?.[0]
                      return last ? (
                        <span className="gw-entry-said" title={recent[e.name.toLowerCase()].map((l) => `${when(l.at)}  ${l.text}`).join('\n')}>
                          “{last.text}”
                        </span>
                      ) : null
                    })()}
                  </span>
                  {s === 'won' && <Pill tone="warn">Winner</Pill>}
                  {s === 'void' && <Pill tone="off">Re-drawn</Pill>}
                  {e.removed && <Pill tone="off">Removed</Pill>}
                  <span className="gw-entry-time">{when(e.at)}</span>
                  <button type="button" className="gw-entry-btn" disabled={pending === e.kickId} onClick={() => toggle(e)}>
                    {e.removed ? 'Restore' : 'Remove'}
                  </button>
                </li>
              )
            })}
          </ul>
          {rows.length > SHOW_MAX && <p className="gw-note">Showing the newest {SHOW_MAX} of {plural(rows.length, 'entrant')}. Search to find someone.</p>}
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- past winners

// Each ended giveaway (with a winner) is on the public /giveaways page; removing it here hides it there.
function PastWinners({ history, act, busy }) {
  if (!history.length) return null
  return (
    <Card
      title="Past giveaways"
      actions={
        <>
          <a className="adm-b is-ghost" href="/giveaways" target="_blank" rel="noopener noreferrer">
            Public page
          </a>
          <ConfirmButton disabled={busy !== ''} confirmLabel="Clear every past giveaway?" onConfirm={() => act('history/clear')}>
            Clear all
          </ConfirmButton>
        </>
      }
    >
      <table className="adm-table">
        <thead>
          <tr>
            <th>Prize</th>
            <th>Winners</th>
            <th className="is-num">Entries</th>
            <th>Ended</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {history.map((r) => (
            <tr key={r.id}>
              <td>
                {r.prize}
                {r.vipOnly && <span className="gw-vip-tag">VIP</span>}
              </td>
              <td className="gw-past-name">{r.winners.map((w) => w.name).join(', ')}</td>
              <td className="is-num">{r.entries.toLocaleString('en-US')}</td>
              <td>{day(r.endedAt)}</td>
              <td className="is-num">
                <ConfirmButton disabled={busy !== ''} confirmLabel="Remove from history?" onConfirm={() => act('history/remove', { id: r.id })}>
                  Remove
                </ConfirmButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
