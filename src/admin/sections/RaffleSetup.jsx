import { useMemo, useState } from 'react'
import { config } from '../../config'
import { Button, Card, ErrorLine, Field, Input, Select, num } from '../ui'

// The raffle setup form (admin → Raffles): makes a new raffle, or edits one that's still
// counting. Everything the server stores (server/features/raffles.js applySettings) is set
// here in plain terms: the type, a name, the dates (presets or custom), the pool split into
// a number of winners, the most one person can win, and what a ticket costs. The summary
// on the right reads like the public raffle page, so you see what players will see.
//
//   <RaffleSetup mode="create" blocked={{ wager: 'reason' }} onSubmit={(body) => …} onCancel />
//   <RaffleSetup mode="edit" raffle={r} onSubmit={(body) => …} />    body has no `kind`

const DAY = 86_400_000
const KIND = { wager: 'Wager', watch: 'Watch-time' }
const DEFAULTS = {
  wager: { prizePool: '1000', winners: '5', maxWins: '2', ticketUnit: '1000', windowMinutes: '5' },
  watch: { prizePool: '500', winners: '5', maxWins: '2', ticketUnit: '60', windowMinutes: '5' },
}

const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
const today = () => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
const monthRange = (offset) => {
  const d = new Date()
  return [iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)), iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset + 1, 0))]
}

/** Date presets (UTC days, inclusive) */
const PERIODS = [
  { id: 'month', label: 'This month', range: () => monthRange(0) },
  { id: 'next-month', label: 'Next month', range: () => monthRange(1) },
  {
    id: 'week',
    label: 'This week',
    range: () => {
      const t = today()
      const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY
      return [iso(monday), iso(monday + 6 * DAY)]
    },
  },
  { id: 'next-7', label: 'Next 7 days', range: () => [iso(today()), iso(today() + 6 * DAY)] },
  { id: 'custom', label: 'Custom dates', range: null },
]
const periodOf = (start, end) => PERIODS.find((p) => p.range && p.range()[0] === start && p.range()[1] === end)?.id ?? 'custom'

const day = (s, year) =>
  s ? new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }) : '—'
const usd = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY) + 1

/** A title from the type and the dates, until the admin types their own */
function suggestTitle(kind, period, start, end) {
  const k = kind === 'watch' ? 'Watch-Time' : 'Wager'
  if (period === 'month' || period === 'next-month') {
    const month = new Date(`${start}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
    return `${month} ${k} Raffle`
  }
  if (period === 'week' || period === 'next-7') return `Weekly ${k} Raffle · ${day(start)} – ${day(end)}`
  return `${k} Raffle · ${day(start)} – ${day(end)}`
}

function formFrom(raffle) {
  if (!raffle) {
    const [start, end] = monthRange(0)
    return { kind: 'wager', title: '', titleTouched: false, period: 'month', start, end, ...DEFAULTS.wager, numbering: 'name' }
  }
  const winners = raffle.prizePerDraw ? Math.floor(raffle.prizePool / raffle.prizePerDraw + 1e-9) : 1
  return {
    kind: raffle.kind,
    title: raffle.title,
    titleTouched: true,
    period: periodOf(raffle.start, raffle.end),
    start: raffle.start,
    end: raffle.end,
    prizePool: String(raffle.prizePool),
    winners: String(winners),
    maxWins: String(raffle.maxWinsPerPerson),
    ticketUnit: String(raffle.ticketUnit),
    windowMinutes: String(raffle.windowMinutes ?? 5),
    numbering: raffle.numbering ?? 'name',
  }
}

/** What's wrong with the form, or '' */
function problemOf(f) {
  const pool = num(f.prizePool)
  const winners = num(f.winners)
  const maxWins = num(f.maxWins)
  const unit = num(f.ticketUnit)
  if (!f.start || !f.end) return 'Pick the dates.'
  if (f.end < f.start) return 'The end can’t be before the start.'
  if (f.kind === 'wager' && daysBetween(f.start, f.end) > 120) return 'Rainbet reports at most 120 days: shorten the dates.'
  if (!pool || pool < 1) return 'Set the prize pool.'
  if (!winners || winners < 1 || !Number.isInteger(winners)) return 'Set how many winners (a whole number).'
  if (pool / winners < 1) return 'Each prize must be at least $1.'
  if (!maxWins || maxWins < 1 || !Number.isInteger(maxWins)) return 'Set the most one person can win (a whole number).'
  if (!unit || unit <= 0) return f.kind === 'wager' ? 'Set how many dollars make a ticket.' : 'Set how many minutes make a ticket.'
  if (f.kind === 'watch' && !(num(f.windowMinutes) >= 1)) return 'Set the chat window in minutes.'
  return ''
}

export default function RaffleSetup({ mode = 'create', raffle = null, blocked = {}, onSubmit, onCancel, busy, locked }) {
  const [f, setF] = useState(() => formFrom(raffle))
  const [err, setErr] = useState('')
  const editing = mode === 'edit'
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  const title = f.titleTouched ? f.title : suggestTitle(f.kind, f.period, f.start, f.end)
  const pool = num(f.prizePool) ?? 0
  const winners = Math.max(0, Math.floor(num(f.winners) ?? 0))
  const each = winners ? Math.round((pool / winners) * 100) / 100 : 0
  const maxWins = Math.max(0, Math.floor(num(f.maxWins) ?? 0))
  const unit = num(f.ticketUnit) ?? 0
  const problem = problemOf(f)
  const blockedWhy = !editing ? blocked[f.kind] : null

  const pickKind = (kind) => setF((x) => (x.kind === kind ? x : { ...x, kind, ...DEFAULTS[kind] }))
  const pickPeriod = (id) => {
    const p = PERIODS.find((x) => x.id === id)
    setF((x) => {
      if (!p.range) return { ...x, period: id }
      const [start, end] = p.range()
      return { ...x, period: id, start, end }
    })
  }

  const body = useMemo(
    () => ({
      title: title.trim().slice(0, 60),
      start: f.start,
      end: f.end,
      prizePool: pool,
      prizePerDraw: each,
      maxWinsPerPerson: maxWins,
      ticketUnit: unit,
      numbering: f.numbering,
      ...(f.kind === 'watch' ? { windowMinutes: num(f.windowMinutes) } : {}),
    }),
    [title, f.start, f.end, f.numbering, f.kind, f.windowMinutes, pool, each, maxWins, unit],
  )

  const submit = async (e) => {
    e?.preventDefault()
    setErr('')
    if (problem) return setErr(problem)
    if (!body.title) return setErr('Give the raffle a name.')
    try {
      await onSubmit(editing ? body : { kind: f.kind, ...body })
    } catch (e2) {
      setErr(e2.message)
    }
  }

  const ticketLine =
    f.kind === 'wager'
      ? `Every ${usd(unit || 0)} wagered on Rainbet under code ${config.referralCode.toUpperCase()} is 1 ticket.`
      : `Every ${unit || 0} minute${unit === 1 ? '' : 's'} watched on Kick is 1 ticket (counted from chatting while the stream is live).`

  return (
    <Card title={editing ? 'Raffle setup' : 'New raffle'} className="rs">
      <form className="rs-grid" onSubmit={submit}>
        <fieldset className="rs-form" disabled={locked}>
          {!editing && (
            <div className="rs-block">
              <h3 className="rs-h">What counts as a ticket</h3>
              <div className="rs-kinds" role="radiogroup" aria-label="Raffle type">
                {['wager', 'watch'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={f.kind === k}
                    className={`rs-kind${f.kind === k ? ' is-on' : ''}`}
                    onClick={() => pickKind(k)}
                  >
                    <span className="rs-kind-name">{KIND[k]} raffle</span>
                    <span className="rs-kind-text">
                      {k === 'wager'
                        ? `Rainbet wager under code ${config.referralCode.toUpperCase()}. Players don’t need to do anything.`
                        : 'Time in Kick chat while live. Players just watch and chat.'}
                    </span>
                    {blocked[k] && <span className="rs-kind-warn">{blocked[k]}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rs-block">
            <h3 className="rs-h">Name and dates</h3>
            <Field label="Name" wide hint={f.titleTouched ? undefined : 'Filled in from the dates. Type to change it.'}>
              <Input value={title} onChange={(v) => setF((x) => ({ ...x, title: v, titleTouched: true }))} maxLength={60} />
            </Field>
            <div className="pl-seg rs-periods" role="group" aria-label="Dates">
              {PERIODS.map((p) => (
                <button key={p.id} type="button" className={`pl-seg-item${f.period === p.id ? ' is-on' : ''}`} aria-pressed={f.period === p.id} onClick={() => pickPeriod(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="rs-row">
              <Field label="Tickets count from (UTC)">
                <Input type="date" value={f.start} onChange={(v) => setF((x) => ({ ...x, start: v, period: 'custom' }))} />
              </Field>
              <Field label="Until the end of (UTC)" hint={f.kind === 'wager' ? 'Rainbet: 120 days at most' : undefined}>
                <Input type="date" value={f.end} onChange={(v) => setF((x) => ({ ...x, end: v, period: 'custom' }))} />
              </Field>
            </div>
          </div>

          <div className="rs-block">
            <h3 className="rs-h">Prizes</h3>
            <div className="rs-row">
              <Field label="Prize pool">
                <Input unit="$" value={f.prizePool} onChange={set('prizePool')} inputMode="decimal" />
              </Field>
              <Field label="Winners" hint={winners && pool ? `${usd(each)} each` : undefined}>
                <Input value={f.winners} onChange={set('winners')} inputMode="numeric" />
              </Field>
              <Field label="Most one person can win" hint={maxWins && each ? `${maxWins} × ${usd(each)} = ${usd(maxWins * each)}` : undefined}>
                <Input value={f.maxWins} onChange={set('maxWins')} inputMode="numeric" />
              </Field>
            </div>
          </div>

          <div className="rs-block">
            <h3 className="rs-h">Tickets</h3>
            <div className="rs-row">
              <Field label={f.kind === 'wager' ? 'Dollars wagered per ticket' : 'Minutes watched per ticket'}>
                <Input unit={f.kind === 'wager' ? '$' : 'min'} value={f.ticketUnit} onChange={set('ticketUnit')} inputMode="decimal" />
              </Field>
            </div>
            <details className="rs-more">
              <summary>More options</summary>
              <div className="rs-row">
                {f.kind === 'watch' && (
                  <Field label="Chat window" hint="A viewer who chats in a window gets that many minutes">
                    <Input unit="min" value={f.windowMinutes} onChange={set('windowMinutes')} inputMode="numeric" />
                  </Field>
                )}
                <Field label="Player numbers" hint="Fixed when you lock the raffle">
                  <Select
                    value={f.numbering}
                    onChange={set('numbering')}
                    options={[
                      { value: 'name', label: 'By name (A→Z)' },
                      { value: 'joined', label: 'By join order' },
                    ]}
                  />
                </Field>
              </div>
            </details>
          </div>
        </fieldset>

        <aside className="rs-preview" aria-label="What players will see">
          <span className="rs-preview-kicker">Players will see</span>
          <p className="rs-preview-title">{title || 'Untitled raffle'}</p>
          <dl className="rs-preview-facts">
            <div>
              <dt>Prize pool</dt>
              <dd className="is-gold">{usd(pool)}</dd>
            </div>
            <div>
              <dt>Draws</dt>
              <dd>{winners ? `${winners} × ${usd(each)}` : '—'}</dd>
            </div>
            <div>
              <dt>Max per person</dt>
              <dd>{maxWins && each ? `${usd(maxWins * each)} (${maxWins} win${maxWins === 1 ? '' : 's'})` : '—'}</dd>
            </div>
            <div>
              <dt>Tickets count</dt>
              <dd>
                {day(f.start)} – {day(f.end, true)}
              </dd>
            </div>
          </dl>
          <p className="rs-preview-line">{ticketLine}</p>
          <p className="rs-preview-line is-dim">
            Tickets add up by themselves. When the dates are over, lock the raffle and draw the winners live on stream.
          </p>

          {locked ? (
            <p className="rs-preview-line is-dim">Unlock the raffle to change its setup.</p>
          ) : (
            <div className="rs-actions">
              <Button kind="primary" type="submit" busy={busy} disabled={Boolean(blockedWhy)}>
                {editing ? 'Save changes' : `Start ${KIND[f.kind].toLowerCase()} raffle`}
              </Button>
              {onCancel && <Button onClick={onCancel}>Cancel</Button>}
            </div>
          )}
          {blockedWhy && <p className="rs-preview-line is-warn">{blockedWhy}</p>}
          <ErrorLine>{err}</ErrorLine>
        </aside>
      </form>
    </Card>
  )
}
