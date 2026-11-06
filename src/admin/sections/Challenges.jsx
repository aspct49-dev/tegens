import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api'
import SlotPicker from '../SlotPicker'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, num } from '../ui'
import './site.css'

// Challenges: slot bounties shown on /challenges (server/features/challenges.js).
//
//   GET  /api/admin/challenges
//   POST /api/admin/challenges                create
//   POST /api/admin/challenges/<id>           update
//   POST /api/admin/challenges/<id>/complete  { completedBy }
//   POST /api/admin/challenges/<id>/reopen
//   POST /api/admin/challenges/<id>/delete

const BLANK = { game: '', slug: null, provider: null, image: null, multiplier: '', minBet: '', reward: '', url: '' }
const money = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const times = (v) => `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}×`

export default function ChallengesAdmin() {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null: new; else the challenge's id

  useEffect(() => {
    apiGet('/api/admin/challenges').then(
      (d) => setList(d.challenges),
      (err) => setError(err.message),
    )
  }, [])

  const active = list?.filter((c) => c.status !== 'completed') ?? []
  const done = list?.filter((c) => c.status === 'completed') ?? []
  const current = editing ? list?.find((c) => c.id === editing) : null

  return (
    <>
      <SectionIntro
        actions={
          <a className="adm-b is-ghost" href="/challenges" target="_blank" rel="noopener noreferrer">
            View page
          </a>
        }
      >
        Slot bounties on the Challenges page: hit the target multiplier at the minimum bet under the code, then claim the reward on
        the site (admin → Claims). Paying a claim marks the challenge won; you can also mark one won here. A won challenge moves to
        Completed and its reward is added to the Total given away on /giveaways.
      </SectionIntro>
      <ErrorLine>{error}</ErrorLine>

      <ChallengeForm
        key={editing ?? 'new'}
        current={current}
        onSaved={(d) => (setList(d.challenges), setEditing(null))}
        onCancel={editing ? () => setEditing(null) : null}
      />

      <Card title={`Active${list ? ` · ${active.length}` : ''}`}>
        {!list ? (
          <span className="adm-spin adm-spin-inline" aria-label="Loading" />
        ) : active.length === 0 ? (
          <Empty>No active challenges. Add one above.</Empty>
        ) : (
          <ul className="chg-list">
            {active.map((c) => (
              <ChallengeRow key={c.id} c={c} editing={editing === c.id} onEdit={() => setEditing(c.id)} onList={setList} />
            ))}
          </ul>
        )}
      </Card>

      {done.length > 0 && (
        <Card title={`Completed · ${done.length}`}>
          <ul className="chg-list">
            {done.map((c) => (
              <ChallengeRow key={c.id} c={c} editing={editing === c.id} onEdit={() => setEditing(c.id)} onList={setList} />
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function ChallengeForm({ current, onSaved, onCancel }) {
  const [f, setF] = useState(() =>
    current
      ? { ...BLANK, ...current, multiplier: String(current.multiplier), minBet: String(current.minBet), reward: String(current.reward), url: current.url ?? '' }
      : BLANK,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  const ready = f.game.trim() && num(f.multiplier) && num(f.minBet) !== null && num(f.reward) !== null

  const save = async (e) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      const body = {
        game: f.game.trim(),
        slug: f.slug,
        provider: f.provider,
        image: f.image,
        multiplier: num(f.multiplier),
        minBet: num(f.minBet),
        reward: num(f.reward),
        url: f.url.trim(),
      }
      const d = await apiPost(current ? `/api/admin/challenges/${current.id}` : '/api/admin/challenges', body)
      onSaved(d)
      if (!current) setF(BLANK)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={current ? `Edit: ${current.game}` : 'New challenge'} actions={onCancel && <Button onClick={onCancel}>Cancel</Button>}>
      <form className="chg-form" onSubmit={save}>
        <div className="chg-game">
          <div className="chg-art">{f.image ? <img src={f.image} width="66" height="88" alt="" /> : <span className="adm-slot-noart" />}</div>
          <div className="chg-game-pick">
            {f.game ? (
              <p className="chg-game-name">
                {f.game}
                {f.provider && <span className="chg-sub"> · {f.provider}</span>}
                <button type="button" className="chg-clear" onClick={() => setF((s) => ({ ...s, game: '', slug: null, provider: null, image: null }))}>
                  Change game
                </button>
              </p>
            ) : (
              <Field label="Game" hint="Search the slot catalog; press Enter on a name that isn't listed to use it without art.">
                <SlotPicker onPick={(g) => setF((s) => ({ ...s, game: g.name, slug: g.slug, provider: g.provider, image: g.image }))} autoFocus={!current} />
              </Field>
            )}
          </div>
        </div>
        <div className="adm-grid">
          <Field label="Target multiplier">
            <Input value={f.multiplier} onChange={set('multiplier')} unit="×" inputMode="decimal" placeholder="1000" />
          </Field>
          <Field label="Minimum bet">
            <Input value={f.minBet} onChange={set('minBet')} unit="$" inputMode="decimal" placeholder="0.20" />
          </Field>
          <Field label="Reward">
            <Input value={f.reward} onChange={set('reward')} unit="$" inputMode="decimal" placeholder="100" />
          </Field>
          <Field label="Play link (optional)" hint="https:// link to the game on Rainbet">
            <Input value={f.url} onChange={set('url')} placeholder="https://rainbet.com/…" />
          </Field>
        </div>
        <ErrorLine>{error}</ErrorLine>
        <div className="adm-row">
          <Button kind="primary" type="submit" busy={busy} disabled={!ready}>
            {current ? 'Save changes' : 'Add challenge'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function ChallengeRow({ c, editing, onEdit, onList }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [winner, setWinner] = useState(null) // null: closed; string: the "mark won" form
  const won = c.status === 'completed'

  const run = async (action, body) => {
    setBusy(true)
    setError('')
    try {
      const d = await apiPost(`/api/admin/challenges/${c.id}${action ? `/${action}` : ''}`, body)
      onList(d.challenges)
      setWinner(null)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <li className={`chg-row${editing ? ' is-editing' : ''}`}>
      <div className="chg-thumb">{c.image ? <img src={c.image} width="36" height="48" alt="" loading="lazy" /> : <span className="adm-slot-noart" />}</div>
      <div className="chg-info">
        <p className="chg-name">
          {c.game}
          {c.provider && <span className="chg-sub"> · {c.provider}</span>}
        </p>
        <p className="chg-terms">
          <b>{times(c.multiplier)}</b> at {money(c.minBet)}+ → <b className="chg-reward">{money(c.reward)}</b>
          {c.playUrl && (
            <>
              {' · '}
              <a href={c.playUrl} target="_blank" rel="noopener noreferrer">play link</a>
            </>
          )}
        </p>
        {won && <p className="chg-sub">Won{c.completedBy ? ` by ${c.completedBy}` : ''}{c.completedAt ? ` · ${new Date(c.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</p>}
        <ErrorLine>{error}</ErrorLine>
        {winner !== null && (
          <form
            className="adm-row chg-win"
            onSubmit={(e) => {
              e.preventDefault()
              run('complete', { completedBy: winner.trim() })
            }}
          >
            <Input value={winner} onChange={setWinner} placeholder="Winner's name (optional)" maxLength={40} autoFocus />
            <Button kind="primary" type="submit" busy={busy}>Mark won</Button>
            <Button onClick={() => setWinner(null)}>Cancel</Button>
          </form>
        )}
      </div>
      <div className="chg-actions">
        {won ? <Pill tone="ok">Won</Pill> : <Pill tone="live">Active</Pill>}
        <Button onClick={onEdit} disabled={editing}>Edit</Button>
        {won ? (
          <Button onClick={() => run('reopen')} busy={busy}>Reopen</Button>
        ) : (
          winner === null && <Button onClick={() => setWinner('')}>Mark won</Button>
        )}
        <ConfirmButton onConfirm={() => run('delete')} confirmLabel="Delete?">Delete</ConfirmButton>
      </div>
    </li>
  )
}
