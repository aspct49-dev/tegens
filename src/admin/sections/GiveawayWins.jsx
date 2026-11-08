import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Select, Stat, num } from '../ui'
import './giveaway-wins-admin.css'

// Giveaway wins: the list on the public /giveaways page, kept by hand. Add each win
// (who, what, when, where) and it shows up there. (server/features/giveawayWins.js)
//
//   GET  /api/admin/giveaway-wins
//   POST /api/admin/giveaway-wins                 { winner, prize, amount?, at?, note?, source? }
//   POST /api/admin/giveaway-wins/<id>            edit
//   POST /api/admin/giveaway-wins/<id>/remove

const API = '/api/admin/giveaway-wins'

const SOURCES = [
  { value: '', label: 'Not set' },
  { value: 'kick', label: 'Kick stream' },
  { value: 'discord', label: 'Discord' },
  { value: 'other', label: 'Other' },
]
const SOURCE_LABEL = { kick: 'Kick', discord: 'Discord', other: 'Other' }
const NOTES = ['Chat giveaway', 'Discord drop', 'Bonus buy', 'Raffle', 'Wager race', 'Stream giveaway']

const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const when = (s) => new Date(s * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** unix seconds → "2026-11-04T21:30" (local time) for <input type="datetime-local"> */
function toLocalInput(s) {
  const d = new Date(s * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v) => {
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? Math.floor(t / 1000) : null
}
const nowSec = () => Math.floor(Date.now() / 1000)

const blank = () => ({ winner: '', prize: '', amount: '', at: toLocalInput(nowSec()), note: '', source: 'kick' })

/** "Total given away" on /giveaways: the starting amount + every posted win's value */
function TotalCard({ wins }) {
  const [data, setData] = useState(null) // { settings: { start, carried }, totals }
  const [start, setStart] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // reload whenever the list changes: a new win adds to the total
  useEffect(() => {
    apiGet(`${API}/totals`).then(
      (d) => {
        setData(d)
        setStart((s) => (s === '' ? String(d.settings.start) : s))
      },
      (err) => setError(err.message),
    )
  }, [wins])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const d = await apiPost(`${API}/totals`, { start })
      setData(d)
      setStart(String(d.settings.start))
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const fromChallenges = data?.totals.challenges ?? 0
  const fromMilestones = data?.totals.milestones ?? 0
  const fromStore = data?.totals.store ?? 0
  const fromWins = data ? data.totals.givenAway - data.settings.start - fromChallenges - fromMilestones - fromStore : 0
  return (
    <Card title="Total given away">
      <div className="gwa-total">
        <Stat label="Shown on /giveaways" value={data ? usd(data.totals.givenAway) : '…'} tone="gold" />
        <p className="gwa-total-sum">
          {data ? (
            <>
              {usd(data.settings.start)} starting amount + {usd(fromWins)} from posted wins + {usd(fromChallenges)} from completed challenges +{' '}
              {usd(fromMilestones)} from paid milestones + {usd(fromStore)} from approved store orders. Every win you add with a value, every challenge
              marked completed, every milestone paid and every store order approved adds to it.
            </>
          ) : (
            'Loading…'
          )}
        </p>
      </div>
      <form className="adm-row gwa-total-form" onSubmit={save}>
        <Field label="Starting amount" hint="Everything given away before this list.">
          <Input value={start} onChange={(v) => (setStart(v), setSaved(false))} unit="$" inputMode="decimal" placeholder="25000" />
        </Field>
        <Button kind="primary" type="submit" busy={busy}>
          {saved ? 'Saved' : 'Save'}
        </Button>
      </form>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  )
}

export default function GiveawayWinsAdmin() {
  const [wins, setWins] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null: new; else the win's id

  useEffect(() => {
    apiGet(API).then(
      (d) => setWins(d.wins),
      (err) => setError(err.message),
    )
  }, [])

  const current = editing ? wins?.find((w) => w.id === editing) : null
  const paid = wins?.reduce((n, w) => n + (w.amount ?? 0), 0) ?? 0
  const people = wins ? new Set(wins.map((w) => w.winner.toLowerCase())).size : 0

  return (
    <>
      <SectionIntro
        actions={
          <a className="adm-b is-ghost" href="/giveaways" target="_blank" rel="noopener noreferrer">
            View page
          </a>
        }
      >
        The winners on the public Giveaways page. Add each win here (who won, what, when and where) and it shows up there, newest
        first. The chat draw for the stream overlay is still under <b>Chat Giveaway</b>; its winners don't appear here on their own.
      </SectionIntro>
      <ErrorLine>{error}</ErrorLine>

      <WinForm
        key={editing ?? 'new'}
        current={current}
        onSaved={(d) => (setWins(d.wins), setEditing(null))}
        onCancel={editing ? () => setEditing(null) : null}
      />

      <TotalCard wins={wins} />

      {wins && wins.length > 0 && (
        <div className="gwa-stats">
          <Stat label="Wins posted" value={wins.length} tone="blue" />
          <Stat label="Winners" value={people} />
          <Stat label="Given away" value={paid ? usd(paid) : '—'} tone={paid ? 'gold' : undefined} />
        </div>
      )}

      <Card title={`Posted wins${wins ? ` · ${wins.length}` : ''}`}>
        {!wins ? (
          error ? null : <span className="adm-spin adm-spin-inline" aria-label="Loading" />
        ) : wins.length === 0 ? (
          <Empty>No wins posted yet. Add the first one above and it appears on /giveaways.</Empty>
        ) : (
          <ul className="gwa-list">
            {wins.map((w, i) => (
              <WinRow key={w.id} w={w} latest={i === 0} editing={editing === w.id} onEdit={() => setEditing(w.id)} onList={setWins} />
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function WinForm({ current, onSaved, onCancel }) {
  const [f, setF] = useState(() =>
    current
      ? {
          winner: current.winner,
          prize: current.prize,
          amount: current.amount == null ? '' : String(current.amount),
          at: toLocalInput(current.at),
          note: current.note ?? '',
          source: current.source ?? '',
        }
      : blank(),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  const amountOk = f.amount.trim() === '' || (num(f.amount) !== null && num(f.amount) >= 0)
  const ready = f.winner.trim() && f.prize.trim() && amountOk && fromLocalInput(f.at) !== null

  const save = async (e) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      const body = {
        winner: f.winner.trim(),
        prize: f.prize.trim(),
        amount: f.amount.trim() === '' ? null : num(f.amount),
        at: fromLocalInput(f.at),
        note: f.note.trim(),
        source: f.source || null,
      }
      const d = await apiPost(current ? `${API}/${current.id}` : API, body)
      onSaved(d)
      if (!current) setF(blank())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // "$25" typed as the prize fills the amount, so the page can total it
  const prizeBlur = () => {
    if (f.amount.trim() !== '') return
    const m = /^\$\s?([\d,]+(?:\.\d{1,2})?)$/.exec(f.prize.trim())
    if (m) setF((s) => ({ ...s, amount: m[1].replace(/,/g, '') }))
  }

  return (
    <Card title={current ? `Edit: ${current.winner} – ${current.prize}` : 'Add a win'} actions={onCancel && <Button onClick={onCancel}>Cancel</Button>}>
      <form className="gwa-form" onSubmit={save} noValidate>
        <div className="gwa-grid">
          <Field label="Winner" hint="The name as it should show, e.g. their Kick username">
            <Input value={f.winner} onChange={set('winner')} placeholder="aspect900" maxLength={40} autoFocus={!current} />
          </Field>
          <Field label="Prize" hint="What they won, e.g. $25 or PS5">
            <Input value={f.prize} onChange={set('prize')} onBlur={prizeBlur} placeholder="$25" maxLength={80} />
          </Field>
          <Field label="Value (optional)" hint="In dollars, for the “given away” total">
            <Input value={f.amount} onChange={set('amount')} unit="$" inputMode="decimal" placeholder="25" maxLength={12} aria-invalid={!amountOk} />
          </Field>
          <Field label="Won on">
            <Input type="datetime-local" value={f.at} onChange={set('at')} max={toLocalInput(nowSec() + 3600)} />
          </Field>
          <Field label="Where">
            <Select value={f.source} onChange={set('source')} options={SOURCES} />
          </Field>
          <Field label="Note (optional)" hint="Shown on the card, e.g. Chat giveaway">
            <Input value={f.note} onChange={set('note')} placeholder="Chat giveaway" maxLength={60} list="gwa-notes" />
          </Field>
        </div>
        <datalist id="gwa-notes">
          {NOTES.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {!amountOk && <ErrorLine>The value is a number of dollars, e.g. 25 or 12.50.</ErrorLine>}
        <ErrorLine>{error}</ErrorLine>
        <div className="adm-row">
          <Button kind="primary" type="submit" busy={busy} disabled={!ready}>
            {current ? 'Save changes' : 'Post win'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function WinRow({ w, latest, editing, onEdit, onList }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await apiPost(`${API}/${w.id}/remove`)
      onList(d.wins)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <li className={`gwa-row${editing ? ' is-editing' : ''}`}>
      <div className="gwa-info">
        <p className="gwa-main">
          <b className="gwa-winner">{w.winner}</b>
          <span className="gwa-won">won</span>
          <b className="gwa-prize">{w.prize}</b>
          {w.amount != null && <span className="gwa-amount">{usd(w.amount)}</span>}
        </p>
        <p className="gwa-sub">
          {when(w.at)}
          {w.note && <> · {w.note}</>}
          {w.createdBy && <> · posted by {w.createdBy}</>}
        </p>
        <ErrorLine>{error}</ErrorLine>
      </div>
      <div className="gwa-actions">
        {latest && <Pill tone="warn">Featured</Pill>}
        {w.source && <Pill tone="off">{SOURCE_LABEL[w.source]}</Pill>}
        <Button onClick={onEdit} disabled={editing}>
          Edit
        </Button>
        <ConfirmButton onConfirm={remove} busy={busy} confirmLabel="Remove?">
          Remove
        </ConfirmButton>
      </div>
    </li>
  )
}
