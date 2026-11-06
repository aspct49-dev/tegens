import { useEffect, useRef, useState } from 'react'
import {
  BRACKET_SIZES,
  championOf,
  currentMatch,
  decideMatch,
  decidedCount,
  resetMatch,
  seedSlot,
  seedsOf,
  setMultiplier,
  updatePlayer,
} from '../../bracket'
import Bracket from '../../components/Bracket'
import { apiGet, apiPost } from '../api'
import SlotPicker from '../SlotPicker'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Stat } from '../ui'
import { SaveStatus, useAutosave } from '../useAutosave'
import './Tournaments.css'

// Slot tournaments: create a bracket (4 / 8 / 16 / 32), then run it from the chart
// itself: type the first-round names and pick slots right in the cards, publish,
// enter both multipliers per match and decide: the higher multiplier goes through
// (a tie goes to player 1). Undoing a result clears every round it fed. Everything
// autosaves; the server re-checks the whole bracket on every save
// (server/features/tournaments.js).

const API = '/api/admin/tournaments'
const STATUS = { draft: ['off', 'Draft · hidden'], live: ['live', 'Live'], complete: ['ok', 'Complete'] }
const NO_SLOT = { slot: '', slug: undefined, provider: undefined, image: undefined }

export default function TournamentsAdmin({ open }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    apiGet(API).then(
      (res) => {
        setList(res.tournaments)
        setSelected((s) => s ?? res.tournaments.find((t) => t.status === 'live')?.id ?? res.tournaments[0]?.id ?? null)
      },
      (err) => setError(err.message),
    )
  }, [])

  const current = list?.find((t) => t.id === selected) ?? null

  return (
    <>
      <SectionIntro
        actions={
          <Button onClick={() => open?.('overlays')}>Overlay setup</Button>
        }
      >
        Head-to-head slot battles. Create a bracket, then type the players and pick their slots straight into the chart. Publish
        it, enter both multipliers on each match and decide it: the higher multiplier goes through, a tie goes to player 1. The first live tournament shows
        on the site and the <code className="tg-code">/overlay/tournament</code> browser source.
      </SectionIntro>

      <ErrorLine>{error}</ErrorLine>

      <NewTournament
        onCreated={(res) => {
          setList(res.tournaments)
          setSelected(res.tournament.id)
        }}
      />

      {list === null && !error && <span className="adm-spin adm-spin-inline" aria-label="Loading" />}

      {list && list.length > 0 && (
        <Card title="Tournaments">
          <ul className="tg-list">
            {list.map((t) => {
              const champ = championOf(t.matches)
              const [tone, label] = STATUS[t.status]
              return (
                <li key={t.id}>
                  <button type="button" className={`tg-list-item${t.id === selected ? ' is-active' : ''}`} onClick={() => setSelected(t.id)}>
                    <span className="tg-list-name">{t.name}</span>
                    <span className="tg-list-meta">
                      {t.size} players{t.prize ? ` · ${t.prize}` : ''}
                      {champ ? ` · won by ${champ.name}` : ` · ${decidedCount(t.matches)}/${t.matches.length} decided`}
                    </span>
                    <Pill tone={tone}>{label}</Pill>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {list && list.length === 0 && <Empty>No tournaments yet. Create one above.</Empty>}

      {current && (
        <Editor
          key={current.id}
          tournament={current}
          onList={setList}
          onDeleted={(res) => {
            setList(res.tournaments)
            setSelected(res.tournaments[0]?.id ?? null)
          }}
        />
      )}
    </>
  )
}

function NewTournament({ onCreated }) {
  const [form, setForm] = useState({ name: '', prize: '', size: 8 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Name the tournament.')
    setBusy(true)
    try {
      onCreated(await apiPost(API, { name: form.name.trim(), prize: form.prize.trim(), size: form.size }))
      setForm((f) => ({ ...f, name: '', prize: '' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="New tournament">
      <form className="tg-new" onSubmit={create} noValidate>
        <div className="adm-row">
          <Field label="Name">
            <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Sunday Slot Battle" maxLength={60} />
          </Field>
          <Field label="Prize" hint="Shown on the site and overlay">
            <Input value={form.prize} onChange={(v) => setForm((f) => ({ ...f, prize: v }))} placeholder="$250" maxLength={40} />
          </Field>
          <div className="adm-field">
            <span className="adm-field-label" id="tg-size">Players</span>
            <div className="tg-seg" role="radiogroup" aria-labelledby="tg-size">
              {BRACKET_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={form.size === n}
                  className={`tg-seg-btn${form.size === n ? ' is-on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, size: n }))}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="adm-field-hint">&nbsp;</span>
          </div>
          <div className="adm-field tg-new-go">
            <button type="submit" className="adm-b is-primary" disabled={busy}>
              {busy && <span className="adm-b-spin" aria-hidden="true" />}
              Create bracket
            </button>
            <span className="adm-field-hint">Starts as a hidden draft</span>
          </div>
        </div>
        <ErrorLine>{error}</ErrorLine>
      </form>
    </Card>
  )
}

function Editor({ tournament, onList, onDeleted }) {
  const [t, setT] = useState({ name: tournament.name, prize: tournament.prize, matches: tournament.matches })
  const [status, setStatus] = useState(tournament.status)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paste, setPaste] = useState(null)
  const latest = useRef(t)
  latest.current = t
  const id = tournament.id

  const saveStatus = useAutosave(t, async (value) => {
    const res = await apiPost(`${API}/${id}`, { name: value.name, prize: value.prize, matches: value.matches })
    setStatus(res.tournament.status)
    onList(res.tournaments)
    // the server settles the bracket: adopt its copy if it differs and nothing changed meanwhile
    if (latest.current === value && JSON.stringify(res.tournament.matches) !== JSON.stringify(value.matches)) {
      setT((cur) => (cur === value ? { ...cur, matches: res.tournament.matches } : cur))
    }
  })

  const edit = (fn) => setT((cur) => ({ ...cur, matches: fn(cur.matches) }))
  const live = currentMatch(t.matches)
  const champion = championOf(t.matches)
  const seeds = seedsOf(t.matches)
  const filled = seeds.filter((p) => p.name.trim()).length
  const decided = decidedCount(t.matches)
  const anyDecided = t.matches.some((m) => m.winner)

  const handlers = {
    SlotPicker,
    onPlayer: (mid, which, patch) => edit((all) => updatePlayer(all, mid, which, patch)),
    onMult: (mid, which, v) => edit((all) => setMultiplier(all, mid, which, v)),
    onDecide: (mid) => edit((all) => decideMatch(all, mid)),
    onReset: (mid) => edit((all) => resetMatch(all, mid)),
  }

  const shuffle = () =>
    edit((all) => {
      const pool = seedsOf(all)
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      return pool.reduce((acc, p, i) => {
        const { matchId, which } = seedSlot(i)
        return updatePlayer(acc, matchId, which, { name: p.name, ...NO_SLOT, ...(p.slot ? { slot: p.slot, slug: p.slug, provider: p.provider, image: p.image } : {}) })
      }, all)
    })

  // fills first-round names in seed order, skipping matches already played
  const applyPaste = () => {
    const names = paste
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, seeds.length)
    edit((all) => {
      const played = new Set(all.filter((m) => m.round === 0 && m.winner).map((m) => m.id))
      return names.reduce((acc, name, i) => {
        const { matchId, which } = seedSlot(i)
        return played.has(matchId) ? acc : updatePlayer(acc, matchId, which, { name: name.slice(0, 40) })
      }, all)
    })
    setPaste(null)
  }

  const publish = async (next) => {
    setBusy(true)
    setError('')
    try {
      const res = await apiPost(`${API}/${id}`, { status: next, name: t.name, prize: t.prize, matches: t.matches })
      setStatus(res.tournament.status)
      onList(res.tournaments)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    try {
      onDeleted(await apiPost(`${API}/${id}/delete`))
    } catch (err) {
      setError(err.message)
    }
  }

  const [tone, label] = STATUS[status]

  return (
    <>
      <Card
        title={t.name || 'Untitled tournament'}
        actions={
          <>
            <SaveStatus status={saveStatus} />
            <Pill tone={tone}>{label}</Pill>
            {status === 'draft' ? (
              <Button kind="primary" busy={busy} onClick={() => publish('live')} disabled={filled < 2}>
                Publish
              </Button>
            ) : (
              <Button busy={busy} onClick={() => publish('draft')}>
                Unpublish
              </Button>
            )}
          </>
        }
      >
        <div className="adm-grid">
          <Field label="Name">
            <Input value={t.name} onChange={(v) => setT((c) => ({ ...c, name: v }))} maxLength={60} />
          </Field>
          <Field label="Prize">
            <Input value={t.prize} onChange={(v) => setT((c) => ({ ...c, prize: v }))} maxLength={40} placeholder="$250" />
          </Field>
        </div>
        <div className="tg-stats">
          <Stat label="Players" value={`${filled} / ${tournament.size}`} tone={filled === tournament.size ? 'good' : undefined} />
          <Stat label="Decided" value={`${decided} / ${t.matches.length}`} />
          <Stat label="Up next" value={live ? `${live.player1.name} v ${live.player2.name}` : '—'} tone="blue" />
          <Stat label="Champion" value={champion ? champion.name : '—'} tone={champion ? 'gold' : undefined} />
        </div>
        <ErrorLine>{error}</ErrorLine>
      </Card>

      <Card
        title="Bracket"
        actions={
          <>
            <Button onClick={() => setPaste((p) => (p === null ? '' : null))}>{paste === null ? 'Paste names' : 'Cancel'}</Button>
            <Button onClick={shuffle} disabled={anyDecided} title={anyDecided ? 'Undo every result to reshuffle' : undefined}>
              Shuffle seeds
            </Button>
          </>
        }
      >
        {paste !== null && (
          <div className="tg-paste">
            <textarea
              className="tg-paste-box"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'One name per line (or comma separated), in seed order'}
              rows={5}
              autoFocus
            />
            <Button kind="primary" onClick={applyPaste} disabled={!paste.trim()}>
              Fill players
            </Button>
          </div>
        )}
        <p className="tg-note tg-bracket-help">
          Type names into the first round and pick each player's slot under their name. Enter both multipliers, then Decide
          winner: the winner moves on with their slot (change it in the next round if they play a different one).
        </p>
        <Bracket matches={t.matches} mode="edit" handlers={handlers} />
      </Card>

      <Card title="Delete">
        <div className="tg-delete">
          <p className="tg-note">Removes the tournament from the site, the overlay and this list. It can't be undone.</p>
          <ConfirmButton onConfirm={remove}>Delete tournament</ConfirmButton>
        </div>
      </Card>
    </>
  )
}
