import { useEffect, useRef, useState } from 'react'
import { apiGet, apiPost } from '../api'
import SlotPicker from '../SlotPicker'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Select, Stat, Toggle, num } from '../ui'
import { SaveStatus, useAutosave } from '../useAutosave'
import {
  HUNT_BADGES,
  HUNT_CURRENCIES,
  bonusMultiplier,
  currencySymbol,
  huntMoney,
  huntStats,
  huntX,
} from '../../../server/features/huntStats.js'
import './hunt-admin.css'

// Bonus Hunt: create a hunt, add bonuses as they're bought (pick a slot and it's
// added at the current bet), then type each payout as it opens. The editor saves
// itself; the overlay (/overlay/hunt) and the public page poll the newest hunt.

const STAGES = [
  { id: 'collecting', label: 'Collecting' },
  { id: 'opening', label: 'Opening' },
  { id: 'finished', label: 'Finished' },
]
const STAGE_TONE = { collecting: 'off', opening: 'live', finished: 'ok' }
const CURRENCY_OPTIONS = HUNT_CURRENCIES.map((c) => ({ value: c, label: `${currencySymbol(c)}  ${c}` }))
const newId = () => Math.random().toString(36).slice(2, 10)
const huntLabel = (h) => `${h.number ? `#${h.number} ` : ''}${h.name}`

export default function HuntAdmin({ open }) {
  const [hunts, setHunts] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    apiGet('/api/admin/hunts').then(
      (d) => {
        setHunts(d.hunts)
        setSelected(d.hunts[0]?.id ?? null)
      },
      (err) => setLoadError(err.message),
    )
  }, [])

  if (loadError) return <ErrorLine>{loadError}</ErrorLine>
  if (!hunts) return <span className="adm-spin adm-spin-inline" aria-label="Loading" />
  const hunt = hunts.find((h) => h.id === selected) ?? null

  return (
    <>
      <SectionIntro actions={<Button onClick={() => open('overlays')}>Overlay links</Button>}>
        Add bonuses as you buy them, switch to <b>Opening</b> and type each payout as it lands (Enter jumps to the next one). Everything
        saves on its own; the overlay and the Bonus Hunt page always show the newest hunt.
      </SectionIntro>

      <CreateHunt
        onCreated={(d) => {
          setHunts(d.hunts)
          setSelected(d.hunt.id)
        }}
      />

      {hunts.length > 1 && (
        <div className="hn-picker">
          <span className="adm-field-label">Hunt</span>
          <Select value={selected ?? ''} onChange={setSelected} options={hunts.map((h) => ({ value: h.id, label: huntLabel(h) }))} />
          {hunt && hunt.id !== hunts[0].id && <span className="hn-picker-note">Older hunt: the overlay shows {huntLabel(hunts[0])}</span>}
        </div>
      )}

      {hunt ? (
        <HuntEditor
          key={hunt.id}
          initial={hunt}
          onSaved={setHunts}
          onDeleted={(list) => {
            setHunts(list)
            setSelected(list[0]?.id ?? null)
          }}
          open={open}
        />
      ) : (
        <Empty>No hunts yet. Create the first one above.</Empty>
      )}
    </>
  )
}

function CreateHunt({ onCreated }) {
  const [form, setForm] = useState({ name: '', start: '', currency: 'USD', guess: true, guessPrize: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const startBalance = num(form.start)
    if (!form.name.trim()) return setError('Name the hunt.')
    if (startBalance == null || startBalance < 0) return setError('Enter the start cost.')
    setBusy(true)
    try {
      onCreated(
        await apiPost('/api/admin/hunts', {
          name: form.name.trim(),
          startBalance,
          currency: form.currency,
          guess: form.guess,
          guessPrize: form.guessPrize.trim(),
        }),
      )
      setForm((f) => ({ ...f, name: '', start: '', guessPrize: '' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="New hunt">
      <form className="adm-row" onSubmit={submit} noValidate>
        <Field label="Name">
          <Input value={form.name} onChange={set('name')} placeholder="Sunday night hunt" maxLength={60} />
        </Field>
        <Field label="Start cost">
          <Input value={form.start} onChange={set('start')} unit={currencySymbol(form.currency)} inputMode="decimal" placeholder="5,000" />
        </Field>
        <Field label="Currency">
          <Select value={form.currency} onChange={set('currency')} options={CURRENCY_OPTIONS} />
        </Field>
        {form.guess && (
          <Field label="Guess prize">
            <Input value={form.guessPrize} onChange={set('guessPrize')} placeholder="Optional, e.g. $50 tip" maxLength={40} />
          </Field>
        )}
        <Button kind="primary" type="submit" busy={busy}>
          Create hunt
        </Button>
      </form>
      <div className="hunt-guess-toggle">
        <Toggle checked={form.guess} onChange={set('guess')} label="Open Guess the Balance in chat (!guess) — locks when the opening starts" />
      </div>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  )
}

function HuntEditor({ initial, onSaved, onDeleted, open }) {
  const [hunt, setHunt] = useState(initial)
  const [saveError, setSaveError] = useState('')
  const status = useAutosave(hunt, async (h) => {
    try {
      const d = await apiPost(`/api/admin/hunts/${h.id}`, h)
      setSaveError('')
      onSaved(d.hunts)
    } catch (err) {
      setSaveError(err.message)
      throw err
    }
  })
  const [start, setStart] = useState(String(initial.startBalance))
  const payoutRefs = useRef({})

  const s = huntStats(hunt)
  const currency = hunt.currency ?? 'USD'
  const m = (v) => huntMoney(v, currency)
  const symbol = currencySymbol(currency)
  const change = (fn) => setHunt((h) => fn(h))
  const setBonus = (id, patch) => change((h) => ({ ...h, bonuses: h.bonuses.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
  const move = (i, by) =>
    change((h) => {
      const list = [...h.bonuses]
      const j = i + by
      if (j < 0 || j >= list.length) return h
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...h, bonuses: list }
    })

  // Enter on a payout: on to the next bonus still waiting
  const focusNext = (i) => {
    const next = hunt.bonuses.findIndex((b, j) => j > i && b.payout == null)
    const el = next >= 0 ? payoutRefs.current[hunt.bonuses[next].id] : null
    if (el) {
      el.focus()
      el.select()
    } else document.activeElement?.blur()
  }

  const remove = async () => {
    try {
      onDeleted((await apiPost(`/api/admin/hunts/${hunt.id}/delete`)).hunts)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  return (
    <>
      <Card
        className="hn-board"
        title={
          <span className="hn-title">
            {hunt.number ? <span className="hn-number">#{hunt.number}</span> : null}
            {hunt.name || 'Untitled hunt'}
            <Pill tone={STAGE_TONE[hunt.status]}>{hunt.status}</Pill>
          </span>
        }
        actions={<SaveStatus status={status} />}
      >
        <div className="hn-settings">
          <Field label="Name">
            <Input value={hunt.name} onChange={(v) => change((h) => ({ ...h, name: v }))} maxLength={60} />
          </Field>
          <Field label="Start cost">
            <Input
              value={start}
              unit={symbol}
              inputMode="decimal"
              onChange={(v) => {
                setStart(v)
                const n = num(v)
                if (n != null && n >= 0) change((h) => ({ ...h, startBalance: n }))
              }}
            />
          </Field>
          <Field label="Currency">
            <Select value={currency} onChange={(c) => change((h) => ({ ...h, currency: c }))} options={CURRENCY_OPTIONS} />
          </Field>
          <div className="adm-field">
            <span className="adm-field-label">Stage</span>
            <div className="hn-seg" role="radiogroup" aria-label="Stage">
              {STAGES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  role="radio"
                  aria-checked={hunt.status === st.id}
                  className={`hn-seg-item${hunt.status === st.id ? ' is-on' : ''}`}
                  onClick={() => change((h) => ({ ...h, status: st.id }))}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ErrorLine>{saveError}</ErrorLine>

        <div className="hn-stats">
          <Stat label="Bonuses" value={s.opened ? `${s.opened} / ${s.count}` : String(s.count)} />
          <Stat label="Start cost" value={m(hunt.startBalance)} />
          <Stat label="Winnings" value={m(s.totalWon)} tone="blue" />
          <Stat label="Profit / loss" value={s.opened ? m(s.profit) : '—'} tone={s.opened ? (s.profit >= 0 ? 'good' : 'bad') : undefined} />
          <Stat label="Break-even" value={huntX(s.breakEven)} />
          <Stat label="Live break-even" value={huntX(s.liveBreakEven)} />
          <Stat label="Current avg" value={huntX(s.average)} />
          <Stat label="Avg needed" value={s.avgRequired != null ? m(s.avgRequired) : '—'} />
        </div>
        {(s.bestWin || s.luckyWin) && (
          <div className="hn-wins">
            <WinTile label="Best win" bonus={s.bestWin} value={s.bestWin && `${m(s.bestWin.payout)} · ${huntX(bonusMultiplier(s.bestWin))}`} />
            <WinTile label="Lucky win" bonus={s.luckyWin} value={s.luckyWin && `${huntX(bonusMultiplier(s.luckyWin))} · ${m(s.luckyWin.payout)}`} />
          </div>
        )}
      </Card>

      <AddBonus symbol={symbol} onAdd={(b) => change((h) => ({ ...h, bonuses: [...h.bonuses, b] }))} />

      <Card
        title={
          <>
            Bonuses <span className="hn-count">{s.opened}/{s.count} opened · {m(s.totalBet)} in bets</span>
          </>
        }
      >
        {hunt.bonuses.length === 0 ? (
          <Empty>No bonuses yet. Pick a slot above to add one.</Empty>
        ) : (
          <ol className="hn-rows">
            <li className="hn-row is-head" aria-hidden="true">
              <span>#</span>
              <span />
              <span>Slot</span>
              <span>Bet</span>
              <span>Payout</span>
              <span className="hn-x">Multi</span>
              <span />
            </li>
            {hunt.bonuses.map((b, i) => (
              <BonusRow
                key={b.id}
                index={i}
                bonus={b}
                symbol={symbol}
                current={s.current === i}
                best={s.bestWin?.id === b.id}
                lucky={s.luckyWin?.id === b.id}
                last={i === hunt.bonuses.length - 1}
                inputRef={(el) => (payoutRefs.current[b.id] = el)}
                onChange={(patch) => setBonus(b.id, patch)}
                onEnter={() => focusNext(i)}
                onMove={(by) => move(i, by)}
                onRemove={() => change((h) => ({ ...h, bonuses: h.bonuses.filter((x) => x.id !== b.id) }))}
              />
            ))}
          </ol>
        )}
      </Card>

      <Card>
        <div className="hn-foot">
          <Button onClick={() => open('guess')}>Guess the Balance on this hunt →</Button>
          <ConfirmButton onConfirm={remove} confirmLabel="Delete for good?">
            Delete hunt
          </ConfirmButton>
        </div>
      </Card>
    </>
  )
}

function WinTile({ label, bonus, value }) {
  return (
    <div className="hn-win">
      {bonus?.image ? <img src={bonus.image} width="30" height="40" alt="" /> : <span className="hn-art is-empty" />}
      <span className="hn-win-text">
        <span className="hn-win-label">{label}</span>
        <span className="hn-win-game">{bonus?.game ?? '—'}</span>
      </span>
      <span className="hn-win-value">{value ?? '—'}</span>
    </div>
  )
}

/** The add row: bet (kept between bonuses: hunts are usually bought at one size), badge, note, then pick the slot */
function AddBonus({ symbol, onAdd }) {
  const [bet, setBet] = useState('')
  const [badge, setBadge] = useState('')
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [last, setLast] = useState('')

  const add = (g) => {
    const size = num(bet)
    if (!g.name) return
    if (size == null || size <= 0) return setError(`Enter the bet size first, then pick ${g.name} again.`)
    const label = badge === 'custom' ? custom.trim() : badge
    onAdd({
      id: newId(),
      game: g.name.slice(0, 60),
      slug: g.slug ?? null,
      image: g.image ?? null,
      provider: g.provider || null,
      bet: size,
      payout: null,
      note: note.trim() || null,
      badge: label || null,
    })
    setError('')
    setNote('')
    setBadge('')
    setCustom('')
    setLast(g.name)
  }

  return (
    <Card title="Add bonus" actions={last ? <span className="hn-added">Added {last}</span> : null}>
      <div className="hn-add">
        <Field label="Bet size">
          <Input value={bet} onChange={setBet} unit={symbol} inputMode="decimal" placeholder="2.00" />
        </Field>
        <Field label="Badge">
          <Select
            value={badge}
            onChange={setBadge}
            options={[{ value: '', label: 'None' }, ...HUNT_BADGES.map((b) => ({ value: b, label: b })), { value: 'custom', label: 'Custom…' }]}
          />
        </Field>
        {badge === 'custom' && (
          <Field label="Badge text">
            <Input value={custom} onChange={setCustom} placeholder="Retrigger" maxLength={24} />
          </Field>
        )}
        <Field label="Note">
          <Input value={note} onChange={setNote} placeholder="Optional" maxLength={80} />
        </Field>
        <Field label="Slot" hint="Picking a slot adds it straight away">
          <SlotPicker onPick={add} placeholder="Search a slot to add…" />
        </Field>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  )
}

function BonusRow({ index, bonus, symbol, current, best, lucky, last, inputRef, onChange, onEnter, onMove, onRemove }) {
  const [bet, setBet] = useState(String(bonus.bet))
  const [payout, setPayout] = useState(bonus.payout == null ? '' : String(bonus.payout))
  const multi = bonusMultiplier(bonus)
  const tags = [best && lucky ? 'Best & lucky' : best ? 'Best win' : lucky ? 'Lucky win' : null].filter(Boolean)

  return (
    <li className={`hn-row${current ? ' is-current' : ''}${best || lucky ? ' is-best' : ''}${bonus.payout == null ? ' is-waiting' : ''}`}>
      <span className="hn-n">{index + 1}</span>
      {bonus.image ? <img className="hn-art" src={bonus.image} width="30" height="40" alt="" loading="lazy" /> : <span className="hn-art is-empty" />}
      <span className="hn-main">
        <span className="hn-game">
          <span className="hn-game-name">{bonus.game}</span>
          {current && <span className="hn-tag is-now">Opening</span>}
          {bonus.badge && <span className="hn-tag">{bonus.badge}</span>}
          {tags.map((t) => (
            <span className="hn-tag is-gold" key={t}>
              {t}
            </span>
          ))}
        </span>
        <span className="hn-meta">{[bonus.provider, bonus.note].filter(Boolean).join(' · ') || ' '}</span>
      </span>
      <span className="adm-input has-unit hn-num is-bet">
        <span className="adm-input-unit">{symbol}</span>
        <input
          value={bet}
          aria-label={`${bonus.game} bet`}
          inputMode="decimal"
          onChange={(e) => {
            setBet(e.target.value)
            const n = num(e.target.value)
            if (n != null && n >= 0) onChange({ bet: n })
          }}
        />
      </span>
      <span className="adm-input has-unit hn-num is-pay">
        <span className="adm-input-unit">{symbol}</span>
        <input
          ref={inputRef}
          value={payout}
          placeholder="Payout"
          aria-label={`${bonus.game} payout`}
          inputMode="decimal"
          onChange={(e) => {
            const v = e.target.value
            setPayout(v)
            const n = num(v)
            if (v.trim() === '') onChange({ payout: null })
            else if (n != null && n >= 0) onChange({ payout: n })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.preventDefault(), onEnter())
          }}
        />
      </span>
      <span className={`hn-x${multi == null ? ' is-none' : multi >= 100 ? ' is-big' : ''}`}>{huntX(multi)}</span>
      <span className="hn-actions">
        <button type="button" className="hn-icon" aria-label="Move up" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" className="hn-icon" aria-label="Move down" title="Move down" disabled={last} onClick={() => onMove(1)}>
          ↓
        </button>
        <button type="button" className="hn-icon is-del" aria-label={`Remove ${bonus.game}`} title="Remove" onClick={onRemove}>
          ×
        </button>
      </span>
    </li>
  )
}
