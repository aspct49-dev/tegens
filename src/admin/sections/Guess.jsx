import { useEffect, useMemo, useState } from 'react'
import { apiPost } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Select, Stat, Toggle, num } from '../ui'
import { usePolled } from '../../hooks/usePolled'
import { currencySymbol, huntMoney } from '../../../server/features/huntStats.js'
import './guess-admin.css'

// Guess the Balance: open a round (optionally on a hunt), chat guesses with
// !guess <amount>, close entries when the opening starts, then draw on the final
// balance. The guess list polls, so chat guesses appear as they come in.

const STATUS = {
  open: { label: 'Taking guesses', tone: 'live' },
  closed: { label: 'Locked', tone: 'warn' },
  drawn: { label: 'Drawn', tone: 'ok' },
}
const time = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const huntLabel = (h) => `${h.number ? `#${h.number} ` : ''}${h.name}`
const current = (rounds) => rounds.find((r) => r.status === 'open') ?? rounds.find((r) => r.status !== 'drawn') ?? rounds[0] ?? null

export default function GuessAdmin({ open }) {
  const { data, error, reload } = usePolled('/api/admin/guess', 2500)
  const [picked, setPicked] = useState(null)
  const [actionError, setActionError] = useState('')

  const act = async (path, body) => {
    setActionError('')
    try {
      await apiPost(path, body)
      reload()
      return true
    } catch (err) {
      setActionError(err.message)
      return false
    }
  }

  if (!data) return error ? <ErrorLine>{error}</ErrorLine> : <span className="adm-spin adm-spin-inline" aria-label="Loading" />
  const { rounds, hunts } = data
  const round = rounds.find((r) => r.id === picked) ?? current(rounds)

  return (
    <>
      <SectionIntro actions={<Button onClick={() => open('overlays')}>Overlay links</Button>}>
        Viewers guess in Kick chat with <code className="gs-code">!guess 12,500</code> (also <code className="gs-code">12.5k</code>,{' '}
        <code className="gs-code">$12,500</code>). One guess per Kick account and a new one replaces the old. Signed-in viewers can also
        guess on the site. With the bot switch on, the bot announces the round opening, locking and the winner in chat.
      </SectionIntro>

      <Card title="Kick bot">
        <Toggle
          checked={Boolean(data.announce)}
          onChange={(v) => act('/api/admin/guess/settings', { announce: v })}
          label="Bot announces the round opening, locking and the winner"
        />
      </Card>

      <NewRound hunts={hunts} onCreate={async (body) => (await act('/api/admin/guess', body)) && setPicked(null)} />
      <ErrorLine>{actionError}</ErrorLine>

      {round ? <RoundPanel key={round.id} round={round} hunts={hunts} act={act} open={open} /> : <Empty>No rounds yet. Open one above.</Empty>}

      {rounds.length > 1 && (
        <Card title="All rounds">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Round</th>
                <th>Status</th>
                <th className="is-num">Guesses</th>
                <th className="is-num">Final</th>
                <th>Winner</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => {
                const hunt = hunts.find((h) => h.id === r.huntId)
                return (
                  <tr key={r.id} className={r.id === round?.id ? 'gs-picked' : ''}>
                    <td>
                      <button type="button" className="gs-link" onClick={() => setPicked(r.id)}>
                        {r.name}
                      </button>
                    </td>
                    <td>
                      <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                    </td>
                    <td className="is-num">{r.guesses.length}</td>
                    <td className="is-num">{r.status === 'drawn' ? huntMoney(r.finalBalance, hunt?.currency) : '—'}</td>
                    <td>{r.status === 'drawn' ? (r.guesses[0]?.username ?? 'No guesses') : '—'}</td>
                    <td className="is-num">
                      <ConfirmButton onConfirm={() => act(`/api/admin/guess/${r.id}/delete`)} confirmLabel="Delete?">
                        Delete
                      </ConfirmButton>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

function NewRound({ hunts, onCreate }) {
  const [form, setForm] = useState({ name: '', prize: '', huntId: hunts[0]?.id ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setError('Name the round.')
    setError('')
    setBusy(true)
    await onCreate({ name: form.name.trim(), prize: form.prize.trim(), huntId: form.huntId || null })
    setBusy(false)
    setForm((f) => ({ ...f, name: '', prize: '' }))
  }

  return (
    <Card title="Open a round">
      <form className="adm-row" onSubmit={submit} noValidate>
        <Field label="Name">
          <Input value={form.name} onChange={set('name')} placeholder="Sunday hunt GTB" maxLength={60} />
        </Field>
        <Field label="Prize">
          <Input value={form.prize} onChange={set('prize')} placeholder="$100" maxLength={40} />
        </Field>
        <Field label="Bonus hunt">
          <Select value={form.huntId} onChange={set('huntId')} options={[{ value: '', label: 'No hunt' }, ...hunts.map((h) => ({ value: h.id, label: huntLabel(h) }))]} />
        </Field>
        <Button kind="primary" type="submit" busy={busy}>
          Open round
        </Button>
      </form>
      <ErrorLine>{error}</ErrorLine>
      <p className="gs-note">Opening a round closes any other round still taking guesses, and the bot posts how to guess.</p>
    </Card>
  )
}

function RoundPanel({ round, hunts, act, open }) {
  const hunt = hunts.find((h) => h.id === round.huntId) ?? null
  const currency = hunt?.currency ?? 'USD'
  const m = (v) => huntMoney(v, currency)
  const [final, setFinal] = useState(round.finalBalance != null ? String(round.finalBalance) : hunt?.status === 'finished' ? String(hunt.totalWon) : '')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const drawn = round.status === 'drawn'

  // a hunt that finishes while this panel is open fills in the final balance
  useEffect(() => {
    if (!drawn && hunt?.status === 'finished') setFinal((f) => f || String(hunt.totalWon))
  }, [hunt?.status, hunt?.totalWon, drawn])

  const run = async (key, path, body) => {
    setBusy(key)
    await act(path, body)
    setBusy('')
  }

  const figures = useMemo(() => {
    const values = round.guesses.map((g) => g.value).sort((a, b) => a - b)
    if (!values.length) return null
    const mid = Math.floor(values.length / 2)
    return { low: values[0], high: values.at(-1), median: values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2 }
  }, [round.guesses])

  const key = q.trim().toLowerCase()
  const rows = key ? round.guesses.filter((g) => g.username.toLowerCase().includes(key)) : round.guesses
  const finalValue = num(final)

  return (
    <Card
      title={
        <span className="gs-title">
          {round.name}
          <Pill tone={STATUS[round.status].tone}>{STATUS[round.status].label}</Pill>
        </span>
      }
      actions={
        <>
          {round.status === 'open' ? (
            <Button busy={busy === 'close'} onClick={() => run('close', `/api/admin/guess/${round.id}`, { status: 'closed' })}>
              Lock guesses
            </Button>
          ) : (
            <Button busy={busy === 'open'} onClick={() => run('open', `/api/admin/guess/${round.id}`, { status: 'open' })}>
              {drawn ? 'Undo draw & reopen' : 'Reopen guesses'}
            </Button>
          )}
          <ConfirmButton onConfirm={() => act(`/api/admin/guess/${round.id}/delete`)} confirmLabel="Delete round?">
            Delete
          </ConfirmButton>
        </>
      }
    >
      <div className="gs-controls">
        <Field label="Linked hunt">
          <Select
            value={round.huntId ?? ''}
            onChange={(v) => act(`/api/admin/guess/${round.id}`, { huntId: v || null })}
            options={[{ value: '', label: 'No hunt' }, ...hunts.map((h) => ({ value: h.id, label: huntLabel(h) }))]}
          />
        </Field>
        <PrizeField round={round} act={act} />
        <form
          className="gs-draw"
          onSubmit={(e) => {
            e.preventDefault()
            if (finalValue != null && finalValue >= 0) run('draw', `/api/admin/guess/${round.id}/draw`, { finalBalance: finalValue })
          }}
        >
          <Field label="Final balance" hint={hunt && !drawn ? `${huntLabel(hunt)} has paid ${m(hunt.totalWon)}${hunt.status === 'finished' ? ' (finished)' : ' so far'}` : undefined}>
            <Input value={final} onChange={setFinal} unit={currencySymbol(currency)} inputMode="decimal" placeholder="0.00" />
          </Field>
          <Button kind="gold" type="submit" busy={busy === 'draw'} disabled={finalValue == null || finalValue < 0 || round.guesses.length === 0}>
            {drawn ? 'Redraw' : 'Draw winner'}
          </Button>
        </form>
      </div>

      <div className="gs-stats">
        <Stat label="Guesses" value={round.guesses.length.toLocaleString('en-US')} tone="blue" />
        <Stat label="Lowest" value={figures ? m(figures.low) : '—'} />
        <Stat label="Median" value={figures ? m(figures.median) : '—'} />
        <Stat label="Highest" value={figures ? m(figures.high) : '—'} />
        {drawn ? (
          <Stat label="Final balance" value={m(round.finalBalance)} tone="gold" />
        ) : (
          <Stat label="Hunt paid" value={hunt ? m(hunt.totalWon) : '—'} />
        )}
      </div>

      {drawn && round.guesses[0] && (
        <div className="gs-winner">
          <span className="gs-winner-label">Winner</span>
          <span className="gs-winner-name">{round.guesses[0].username}</span>
          <span className="gs-winner-figs">
            guessed {m(round.guesses[0].value)} · {round.guesses[0].offBy === 0 ? 'spot on' : `off by ${m(round.guesses[0].offBy)}`}
            {round.prize && <> · wins {round.prize}</>}
          </span>
        </div>
      )}

      <div className="gs-list-head">
        <h3 className="gs-list-title">{drawn ? 'Standings (closest first)' : 'Guesses (lowest first)'}</h3>
        {round.guesses.length > 8 && (
          <span className="adm-input gs-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a user…" aria-label="Find a user" />
          </span>
        )}
      </div>
      {round.guesses.length === 0 ? (
        <Empty>{round.status === 'open' ? 'Waiting for the first !guess in chat…' : 'No guesses in this round.'}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No guess from “{q.trim()}”.</Empty>
      ) : (
        <div className="gs-table-wrap">
          <table className="adm-table gs-table">
            <thead>
              <tr>
                <th className="is-num">{drawn ? 'Place' : '#'}</th>
                <th>Kick user</th>
                <th>From</th>
                <th className="is-num">Guess</th>
                {drawn && <th className="is-num">Off by</th>}
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((g, i) => (
                <tr key={g.key} className={drawn && g.place === 1 ? 'gs-first' : ''}>
                  <td className="is-num gs-place">{drawn ? g.place : i + 1}</td>
                  <td className="gs-user">{g.username}</td>
                  <td>
                    <span className={`gs-via is-${g.via}`}>{g.via === 'site' ? 'Site' : 'Chat'}</span>
                  </td>
                  <td className="is-num gs-value">{m(g.value)}</td>
                  {drawn && <td className="is-num">{g.offBy === 0 ? 'Exact' : m(g.offBy)}</td>}
                  <td className="gs-time">{time(g.at)}</td>
                  <td className="is-num">
                    <ConfirmButton onConfirm={() => act(`/api/admin/guess/${round.id}/remove`, { key: g.key })} confirmLabel="Remove?">
                      Remove
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hunt && (
        <p className="gs-note">
          Playing on {huntLabel(hunt)}.{' '}
          <button type="button" className="gs-link" onClick={() => open('hunt')}>
            Open the hunt
          </button>
        </p>
      )}
    </Card>
  )
}

/** The prize, saved when the field loses focus */
function PrizeField({ round, act }) {
  const [prize, setPrize] = useState(round.prize ?? '')
  return (
    <Field label="Prize">
      <Input
        value={prize}
        onChange={setPrize}
        maxLength={40}
        placeholder="$100"
        onBlur={() => prize.trim() !== (round.prize ?? '') && act(`/api/admin/guess/${round.id}`, { prize: prize.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </Field>
  )
}
