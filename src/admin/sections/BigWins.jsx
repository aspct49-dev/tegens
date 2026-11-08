import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Select, Toggle } from '../ui'
import SlotPicker from '../SlotPicker'
import './site.css'
import './claims-admin.css'
import './Tournaments.css' // the slot chip (tg-slot-chip)

// Biggest Wins: wins players submitted on /biggest-wins (server/features/bigWins.js). Open the
// bet link, check the slot, bet and multiplier match, then ✓ approves it onto the public board.
// ✗ turns it down with a note the player sees. Edit fixes a typo in the numbers first. Undo
// takes a decided win back to waiting (off the board); Remove deletes it (spam).
//
//   GET  /api/admin/big-wins?status=pending|approved|rejected|all  → { wins, counts }
//   POST /api/admin/big-wins/<id>/approve | reject { note } | undo | edit { bet, multiplier } | remove

const FILTERS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'approved', label: 'On the board' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]
const STATUS = { pending: ['warn', 'Waiting'], approved: ['ok', 'On the board'], rejected: ['off', 'Rejected'] }

const ago = (t) => {
  if (!t) return '—'
  const s = Math.max(0, Date.now() / 1000 - t)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
const when = (t) => (t ? new Date(t * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const x = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}×`
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s)

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

export default function BigWinsAdmin() {
  const [filter, setFilter] = useState('pending')
  const [list, setList] = useState(null)
  const [counts, setCounts] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(null) // { id, mode: 'reject' | 'edit', note, bet, multiplier }
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiGet(`/api/admin/big-wins?status=${filter}`).then(
      (d) => {
        if (cancelled) return
        setList(d.wins)
        setCounts(d.counts)
        setError('')
      },
      (err) => !cancelled && setError(err.message),
    )
    return () => {
      cancelled = true
    }
  }, [filter, reload])

  const act = async (w, action, body = {}) => {
    setBusy(`${w.id}:${action}`)
    setError('')
    try {
      const d = await apiPost(`/api/admin/big-wins/${encodeURIComponent(w.id)}/${action}`, body)
      setCounts(d.counts)
      setOpen(null)
      setReload((n) => n + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <SectionIntro>
        Players submit their big wins on the Biggest Wins page. Open the bet link and check the slot, bet and multiplier match, then ✓ puts it on the public
        board. ✗ turns it down with a note the player sees. Fix a typo with Edit before approving. Set the monthly prizes and see who to pay below.
      </SectionIntro>

      <AddWinCard
        onAdded={() => {
          setFilter('approved')
          setReload((n) => n + 1)
        }}
      />

      <Card title="Biggest wins" actions={list && <span className="pl-count">{list.length} shown</span>}>
        <div className="pl-tools cl-tools">
          <div className="pl-seg" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`pl-seg-item${filter === f.id ? ' is-on' : ''}`}
                aria-pressed={filter === f.id}
                onClick={() => filter !== f.id && (setList(null), setOpen(null), setFilter(f.id))}
              >
                {f.label}
                {f.id === 'pending' && counts?.pending > 0 && <span className="pl-badge">{counts.pending}</span>}
              </button>
            ))}
          </div>
          <a className="lk-sub" href="/biggest-wins" target="_blank" rel="noopener noreferrer">
            Open the public board
          </a>
        </div>
        <ErrorLine>{error}</ErrorLine>

        {!list ? (
          <span className="adm-spin adm-spin-inline" aria-label="Loading" />
        ) : list.length === 0 ? (
          <Empty>{filter === 'pending' ? 'No wins waiting.' : 'Nothing here yet.'}</Empty>
        ) : (
          <div className="pl-table-wrap">
            <table className="adm-table lk-table cl-table bwa-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Win</th>
                  <th className="is-num">Payout</th>
                  <th>Bet link</th>
                  <th>Sent</th>
                  {filter !== 'pending' && <th>Status</th>}
                  <th className="is-num" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((w) => {
                  const isBusy = (a) => busy === `${w.id}:${a}`
                  const [tone, label] = STATUS[w.status] ?? ['off', w.status]
                  const what = `${w.slot.name} ${x(w.multiplier)} for ${w.kick ?? w.player}`
                  const editing = open?.id === w.id && open.mode === 'edit'
                  const rejecting = open?.id === w.id && open.mode === 'reject'
                  return (
                    <tr key={w.id}>
                      <td>
                        <span className="cl-who">
                          <span className="pl-name">{w.kick ?? w.player}</span>
                          <span className="lk-sub">
                            Rainbet <b className="pl-mono lk-name">{w.rainbet}</b>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="bwa-win">
                          {w.slot.image ? <img src={w.slot.image} width="27" height="36" alt="" loading="lazy" /> : <span className="bwa-noart" />}
                          <span className="cl-what">
                            <span className="cl-title">{w.slot.name}</span>
                            <span className="lk-sub">
                              {usd(w.bet)} × {x(w.multiplier)}
                              {!w.slot.slug && ' · not in the slot list'}
                            </span>
                            {w.note && <span className="lk-sub cl-note">“{w.note}”</span>}
                          </span>
                        </span>
                      </td>
                      <td className="is-num cl-reward">{usd(w.payout)}</td>
                      <td>
                        <Proof value={w.proof} />
                      </td>
                      <td className="lk-asked" title={when(w.at)}>
                        {ago(w.at)}
                      </td>
                      {filter !== 'pending' && (
                        <td>
                          <Pill tone={tone}>{label}</Pill>
                          {w.decidedBy && (
                            <span className="lk-sub lk-by" title={when(w.decidedAt)}>
                              by {w.decidedBy} · {ago(w.decidedAt)}
                            </span>
                          )}
                          {w.adminNote && <span className="lk-sub lk-by">{w.adminNote}</span>}
                        </td>
                      )}
                      <td className="is-num">
                        <span className="lk-actions">
                          {w.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="lk-btn is-yes"
                                title="Approve: put it on the board"
                                aria-label={`Approve ${what}`}
                                disabled={Boolean(busy)}
                                onClick={() => act(w, 'approve')}
                              >
                                {isBusy('approve') ? <span className="adm-b-spin" /> : '✓'}
                              </button>
                              <button
                                type="button"
                                className="lk-btn is-no"
                                title="Turn it down"
                                aria-label={`Reject ${what}`}
                                disabled={Boolean(busy)}
                                onClick={() => setOpen(rejecting ? null : { id: w.id, mode: 'reject', note: '' })}
                              >
                                ✗
                              </button>
                            </>
                          )}
                          <Button
                            kind="ghost"
                            disabled={Boolean(busy)}
                            onClick={() => setOpen(editing ? null : { id: w.id, mode: 'edit', bet: String(w.bet), multiplier: String(w.multiplier) })}
                          >
                            Edit
                          </Button>
                          {(w.status === 'approved' || w.status === 'rejected') && (
                            <ConfirmButton busy={isBusy('undo')} disabled={Boolean(busy)} onConfirm={() => act(w, 'undo')} confirmLabel="Sure?" kind="ghost">
                              Undo
                            </ConfirmButton>
                          )}
                          <ConfirmButton busy={isBusy('remove')} disabled={Boolean(busy)} onConfirm={() => act(w, 'remove')} confirmLabel="Delete?" kind="ghost">
                            Remove
                          </ConfirmButton>
                        </span>
                        {rejecting && (
                          <span className="cl-reject">
                            <Input
                              value={open.note}
                              onChange={(v) => setOpen({ ...open, note: v })}
                              placeholder="Why? The player sees this"
                              maxLength={200}
                              aria-label="Reason"
                            />
                            <Button kind="danger" busy={isBusy('reject')} disabled={Boolean(busy)} onClick={() => act(w, 'reject', { note: open.note })}>
                              Reject
                            </Button>
                          </span>
                        )}
                        {editing && (
                          <span className="cl-reject bwa-edit">
                            <Input value={open.bet} onChange={(v) => setOpen({ ...open, bet: v })} placeholder="Bet $" aria-label="Bet size" />
                            <Input value={open.multiplier} onChange={(v) => setOpen({ ...open, multiplier: v })} placeholder="Multiplier" aria-label="Multiplier" />
                            <Button kind="primary" busy={isBusy('edit')} disabled={Boolean(busy)} onClick={() => act(w, 'edit', { bet: open.bet, multiplier: open.multiplier })}>
                              Save
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
      <PrizesCard onSaved={() => setReload((n) => n + 1)} />
      <ResultsCard reload={reload} />
    </>
  )
}

// ---------------------------------------------------------------- the monthly competition

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`
const RANK_BY = [
  { value: 'multi', label: 'Biggest multiplier' },
  { value: 'payout', label: 'Biggest payout' },
]
const toForm = (st) => ({ prizes: st.prizes.map((p) => (p ? String(p) : '')), rankBy: st.rankBy, onePerPlayer: st.onePerPlayer })

/** Prize per place, how places are ranked, one place per player */
/** An admin adds a Rainbet player's win straight onto the board: no waiting, no approval */
const NO_WIN = { rainbet: '', slot: null, bet: '', multiplier: '', proof: '', at: '' }
function AddWinCard({ onAdded }) {
  const [f, setF] = useState(NO_WIN)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }))
  const payout = Number(f.bet) * Number(f.multiplier)

  const add = async (e) => {
    e.preventDefault()
    setError('')
    setDone('')
    if (!f.slot) return setError('Pick the slot.')
    setBusy(true)
    try {
      const d = await apiPost('/api/admin/big-wins/add', {
        rainbet: f.rainbet.trim(),
        slot: { slug: f.slot.slug, name: f.slot.name },
        bet: f.bet,
        multiplier: f.multiplier,
        proof: f.proof.trim(),
        at: f.at,
      })
      setDone(`Added ${d.win.slot.name} ${x(d.win.multiplier)} (${usd(d.win.payout)}) for ${f.rainbet.trim()}. It's on the board.`)
      setF(NO_WIN)
      onAdded()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Add a win">
      <form onSubmit={add} noValidate>
        <div className="adm-row">
          <Field label="Rainbet username">
            <Input value={f.rainbet} onChange={set('rainbet')} placeholder="e.g. Mysticsmum" maxLength={40} />
          </Field>
          <Field label="Slot">
            {f.slot ? (
              <span className="tg-slot-chip">
                {f.slot.image && <img src={f.slot.image} width="18" height="24" alt="" />}
                <span className="tg-slot-chip-name">{f.slot.name}</span>
                <button type="button" onClick={() => set('slot')(null)}>Change</button>
              </span>
            ) : (
              <SlotPicker placeholder="Pick the slot…" onPick={(g) => set('slot')(g)} />
            )}
          </Field>
        </div>
        <div className="adm-row">
          <Field label="Bet">
            <Input value={f.bet} onChange={set('bet')} unit="$" inputMode="decimal" placeholder="1.00" />
          </Field>
          <Field label="Multiplier">
            <Input value={f.multiplier} onChange={set('multiplier')} unit="×" inputMode="decimal" placeholder="5000" />
          </Field>
          <Field label="Bet link" hint="Optional">
            <Input value={f.proof} onChange={set('proof')} placeholder="https://rainbet.com/…" maxLength={200} />
          </Field>
          <Field label="Date won" hint="Optional: today if empty">
            <Input value={f.at} onChange={set('at')} type="date" />
          </Field>
        </div>
        <div className="adm-row" style={{ alignItems: 'center' }}>
          <Button kind="primary" type="submit" busy={busy}>
            Add to the board
          </Button>
          <span className="lk-sub">
            {payout > 0 ? `Payout ${usd(payout)}. ` : ''}Goes straight on the board, no approval. A site player with this approved Rainbet link gets it on
            their account; otherwise it shows under the Rainbet name, masked.
          </span>
        </div>
        <ErrorLine>{error}</ErrorLine>
        {done && <p className="lk-sub">{done}</p>}
      </form>
    </Card>
  )
}

function PrizesCard({ onSaved }) {
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    apiGet('/api/admin/big-wins/settings').then(
      (d) => {
        const f = toForm(d.settings)
        setForm(f)
        setSaved(JSON.stringify(f))
      },
      (err) => setError(err.message),
    )
  }, [])

  if (!form)
    return <Card title="Monthly prizes">{error ? <ErrorLine>{error}</ErrorLine> : <span className="adm-spin adm-spin-inline" aria-label="Loading" />}</Card>

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setNote('')
  }
  const setPrize = (i, v) => set({ prizes: form.prizes.map((p, j) => (j === i ? v.replace(/[^\d.]/g, '') : p)) })
  const pool = form.prizes.reduce((a, p) => a + (Number(p) || 0), 0)
  const dirty = JSON.stringify(form) !== saved

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await apiPost('/api/admin/big-wins/settings', {
        prizes: form.prizes.map((p) => (p === '' ? 0 : Number(p))),
        rankBy: form.rankBy,
        onePerPlayer: form.onePerPlayer,
      })
      const f = toForm(d.settings)
      setForm(f)
      setSaved(JSON.stringify(f))
      setNote(d.settings.prizes.some((p) => p > 0) ? 'Saved. The Biggest Wins page now opens on this month’s competition.' : 'Saved. No prizes: the page is a plain board again.')
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Monthly prizes" actions={<span className="pl-count">{pool > 0 ? `${usd(pool)} pool` : 'No prizes'}</span>}>
      <p className="bwa-help">
        Every calendar month (UTC) the approved wins submitted that month are ranked, and each place below gets its prize. Leave every prize empty to run
        the board without prizes. Prizes are paid by hand: see who won under Results.
      </p>
      <div className="adm-row bwa-rules">
        <Field label="Rank wins by">
          <Select value={form.rankBy} onChange={(v) => set({ rankBy: v })} options={RANK_BY} />
        </Field>
        <Toggle checked={form.onePerPlayer} onChange={(v) => set({ onePerPlayer: v })} label="One place per player (their best win counts)" />
      </div>
      {form.prizes.length > 0 && (
        <ol className="bwa-prizes">
          {form.prizes.map((p, i) => (
            <li key={i}>
              <span className="bwa-place">{ordinal(i + 1)}</span>
              <Input value={p} onChange={(v) => setPrize(i, v)} unit="$" inputMode="decimal" placeholder="0" aria-label={`Prize for ${ordinal(i + 1)} place`} />
            </li>
          ))}
        </ol>
      )}
      <div className="adm-row bwa-actions">
        <Button onClick={() => set({ prizes: [...form.prizes, ''] })} disabled={form.prizes.length >= 25}>
          Add a place
        </Button>
        {form.prizes.length > 0 && <Button onClick={() => set({ prizes: form.prizes.slice(0, -1) })}>Remove the last place</Button>}
        <Button kind="primary" busy={busy} disabled={!dirty} onClick={save}>
          Save prizes
        </Button>
        {note && <span className="bwa-note">{note}</span>}
      </div>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  )
}

/** Last month's (or this month's) places and prizes: who to pay */
function ResultsCard({ reload }) {
  const [which, setWhich] = useState('previous')
  const [months, setMonths] = useState(null) // { current, previous } as YYYY-MM
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const q = months ? `?month=${months[which]}` : ''
    apiGet(`/api/admin/big-wins/results${q}`).then(
      (d) => {
        if (cancelled) return
        if (!months) return setMonths({ current: d.current, previous: d.previous }) // then load the chosen month
        setData(d)
        setError('')
      },
      (err) => !cancelled && setError(err.message),
    )
    return () => {
      cancelled = true
    }
  }, [which, months, reload])

  const monthName = (key) => (key ? new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '')
  const rows = data?.standings ?? []
  const owed = rows.reduce((a, r) => a + (r.prize || 0), 0)

  return (
    <Card title="Results" actions={data && <span className="pl-count">{owed > 0 ? `${usd(owed)} to pay` : 'Nothing to pay'}</span>}>
      <div className="pl-tools">
        <div className="pl-seg" role="group" aria-label="Month">
          {[
            ['previous', 'Last month'],
            ['current', 'This month so far'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`pl-seg-item${which === id ? ' is-on' : ''}`}
              aria-pressed={which === id}
              onClick={() => {
                if (which === id) return
                setData(null)
                setWhich(id)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {data && (
          <span className="lk-sub">
            {monthName(data.month)}
            {which === 'current' ? ', not final until the month ends' : ''}
          </span>
        )}
      </div>
      <ErrorLine>{error}</ErrorLine>
      {!data ? (
        <span className="adm-spin adm-spin-inline" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <Empty>No approved wins in {monthName(data.month)}.</Empty>
      ) : (
        <div className="pl-table-wrap">
          <table className="adm-table lk-table cl-table bwa-table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Player</th>
                <th>Win</th>
                <th>Bet link</th>
                <th className="is-num">Prize</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ place, prize, win: w }) => (
                <tr key={w.id}>
                  <td className="bwa-place">{ordinal(place)}</td>
                  <td>
                    <span className="cl-who">
                      <span className="pl-name">{w.kick ?? w.player}</span>
                      <span className="lk-sub">
                        Pay to Rainbet <b className="pl-mono lk-name">{w.rainbet}</b>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="cl-what">
                      <span className="cl-title">{w.slot.name}</span>
                      <span className="lk-sub">
                        {x(w.multiplier)} · {usd(w.payout)} on {usd(w.bet)}
                      </span>
                    </span>
                  </td>
                  <td>
                    <Proof value={w.proof} />
                  </td>
                  <td className="is-num cl-reward">{prize > 0 ? usd(prize) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
