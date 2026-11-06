import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../config'
import { useAuth } from '../hooks/useAuth'
import { Link } from '../router'
import { loadSlotCatalog } from '../slotCatalog'
import { fmtMoney } from '../utils'
import { CodeButton, RulesButton, VisitButton } from '../components/Buttons'
import Modal from '../components/Modal'
import { CLAIM_STATUS } from '../components/MyClaims'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import StepsModal from '../components/StepsModal'
import '../claims.css'
import '../bigwins.css'
import EmptyState from '../components/EmptyState'

// /biggest-wins: the community's biggest slot wins on Rainbet under the code. A player
// submits a win (slot, bet, multiplier and the bet link) from here; an admin checks the
// bet and approves it, and it goes up on the board (server/features/bigWins.js). The
// board ranks by multiplier or by payout, this month or all time. A signed-in player
// sees their own submissions and their state under the board.

const code = config.referralCode.toUpperCase()

const STEPS = [
  {
    title: 'Step 1',
    image: '/assets/td/ms-step1.webp',
    text: (
      <>
        Play on Rainbet under
        {' '}<br />
        code <span className="accent">{code}</span>.
      </>
    ),
  },
  {
    title: 'Step 2',
    image: '/assets/td/ms-step2.webp',
    text: (
      <>
        Land a big win, then open the bet
        {' '}<br />
        in your history and copy its link.
      </>
    ),
  },
  {
    title: 'Step 3',
    image: '/assets/td/ms-step3.webp',
    text: (
      <>
        Submit it here. Once the team
        {' '}<br />
        checks it, it’s on the board.
      </>
    ),
  },
]

const SORTS = [
  { id: 'multi', label: 'Multiplier' },
  { id: 'payout', label: 'Payout' },
]
const PERIODS = [
  { id: 'all', label: 'All time' },
  { id: 'month', label: 'This month' },
]
const STATUS = { ...CLAIM_STATUS, approved: { label: 'On the board', tone: 'ok' } }

const num = (n, d = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d })
const usd = (n) => fmtMoney(n, 2)
const day = (t) => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
/** "1,000" / "$5" / "250x" → 1000 / 5 / 250, or NaN */
const parse = (s) => Number(String(s ?? '').replace(/[$,x×\s]/gi, ''))

async function post(path, body = {}) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

/** The board. sort/period 'auto' let the server open on the monthly competition when prizes are set */
function useBoard(sort, period) {
  const [state, setState] = useState({ status: 'loading', wins: [], total: 0, sort: null, period: null, isCompetition: false, competition: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/big-wins?sort=${sort}&period=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(
        (d) =>
          !cancelled &&
          setState({
            status: 'ready',
            wins: d.wins ?? [],
            total: d.total ?? 0,
            sort: d.sort ?? null,
            period: d.period ?? null,
            isCompetition: Boolean(d.isCompetition),
            competition: d.competition ?? null,
          }),
        () => !cancelled && setState((s) => ({ ...s, status: 'error' })),
      )
    return () => {
      cancelled = true
    }
  }, [sort, period, tick])
  return { ...state, retry: () => setTick((n) => n + 1) }
}

function useMyWins() {
  const { user, status: authStatus } = useAuth()
  const [wins, setWins] = useState([])
  useEffect(() => {
    if (authStatus === 'loading') return undefined
    if (!user) {
      setWins([])
      return undefined
    }
    let cancelled = false
    fetch('/api/big-wins/mine', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => !cancelled && setWins(d.wins ?? []), () => {})
    return () => {
      cancelled = true
    }
  }, [user, authStatus])
  const submit = useCallback(async (body) => {
    const d = await post('/api/big-wins', body)
    setWins(d.wins ?? [])
    return d.win
  }, [])
  const cancel = useCallback(async (id) => {
    const d = await post(`/api/big-wins/${encodeURIComponent(id)}/cancel`)
    setWins(d.wins ?? [])
  }, [])
  return { wins, submit, cancel }
}

const prizeText = (n) => fmtMoney(n, Number.isInteger(n) ? 0 : 2)
const endDay = (t) => new Date((t - 1) * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })

export default function BigWinsPage() {
  // 'auto' until the first answer: the server opens on the competition when there is one
  const [view, setView] = useState({ sort: 'auto', period: 'auto' })
  const [rulesOpen, setRulesOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const board = useBoard(view.sort, view.period)
  const mine = useMyWins()
  const sort = board.sort ?? (view.sort === 'auto' ? 'multi' : view.sort)
  const period = board.period ?? (view.period === 'auto' ? 'all' : view.period)
  const setSort = (s) => setView({ sort: s, period })
  const setPeriod = (p) => setView({ sort, period: p })
  const comp = board.competition
  const isComp = board.isCompetition && Boolean(comp)
  const top = board.wins.slice(0, 3)
  const rest = board.wins.slice(3)
  // the competition lists every prize place, filled or not (like the leaderboard's prize ladder)
  const places = isComp ? Math.max(board.wins.length, comp.prizes.length) : board.wins.length
  const rankName = comp?.rankBy === 'payout' ? 'payout' : 'multiplier'

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="BIGGEST" bottom="WINS">
        Hit something huge on Rainbet under code <b className="accent">{code}</b>?
        {' '}<br />
        Submit it with the bet link and get your name on the board.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <CodeButton />
        <VisitButton />
        <RulesButton onClick={() => setRulesOpen(true)} />
      </div>

      <StepsModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title="How Biggest Wins works"
        steps={STEPS}
        rules={[
          <>Only bets placed on Rainbet under code <b>{code}</b> count.</>,
          'Submit each win once, with the bet link from your Rainbet bet history. The team checks every bet before it goes up.',
          'Sign in and link your Rainbet username on your profile first: the win must be on that account.',
          ...(comp
            ? [
                <>
                  Every month the top {comp.prizes.length} wins by <b>{rankName}</b> share <b>{prizeText(comp.pool)}</b>
                  {comp.onePerPlayer ? ', with one place per player (your best win counts)' : ''}.
                </>,
                'A win counts in the month it’s submitted (UTC). Prizes are paid to your linked Rainbet account after the month ends.',
              ]
            : []),
        ]}
      />

      <div className="bw">
        <div className="ch-bar bw-bar enter" style={{ '--d': '300ms' }}>
          <h2 className="ch-title">
            Top wins {board.total > 0 && <span className="ch-count">{board.total}</span>}
          </h2>
          <div className="bw-tools">
            <Seg label="Rank by" items={SORTS} value={sort} onChange={setSort} />
            <Seg label="Period" items={PERIODS} value={period} onChange={setPeriod} />
            <button type="button" className="btn-blue bw-submit" onClick={() => setSubmitting(true)}>
              Submit a win
            </button>
          </div>
        </div>

        {comp && (
          <p className="bw-comp enter" style={{ '--d': '330ms' }}>
            {isComp ? (
              <>
                <b>{prizeText(comp.pool)}</b> in prizes this month for the top {comp.prizes.length} wins by {rankName}
                {comp.onePerPlayer ? ', one place per player' : ''}. Ends {endDay(comp.endsAt)} (UTC).
              </>
            ) : (
              <>
                This month’s competition has <b>{prizeText(comp.pool)}</b> in prizes.{' '}
                <button type="button" className="link-btn" onClick={() => setView({ sort: comp.rankBy, period: 'month' })}>
                  Show the competition
                </button>
              </>
            )}
          </p>
        )}

        {board.status === 'loading' && <div className="spinner" role="status" aria-label="Loading" />}
        {board.status === 'error' && (
          <p className="ms-hint ch-hint bw-hint">
            The board can’t be loaded right now. <button className="link-btn" onClick={board.retry}>Retry</button>
          </p>
        )}
        {board.status === 'ready' && board.wins.length === 0 && !isComp && (
          <EmptyState
            title={period === 'month' ? 'No wins on the board this month yet' : 'No wins on the board yet'}
            icon
            delay={360}
            actions={
              <button type="button" className="btn-blue" onClick={() => setSubmitting(true)}>
                Submit your win
              </button>
            }
          >
            Landed a big one under code {code}? Be the first up.
          </EmptyState>
        )}

        {(top.length > 0 || (isComp && board.status === 'ready')) && <WinPodium wins={top} sort={sort} prizes={isComp ? comp.prizes : null} />}

        {places > 3 && (
          <div className={`bw-table${isComp ? ' has-prize' : ''} enter`} style={{ '--d': '520ms' }}>
            <div className="bw-head" aria-hidden="true">
              <span>#</span>
              <span>Slot</span>
              <span>Player</span>
              <span className="is-num">Bet</span>
              <span className="is-num">Multi</span>
              <span className="is-num">Payout</span>
              {isComp && <span className="is-num">Prize</span>}
            </div>
            <ol className="bw-rows" start={4}>
              {Array.from({ length: places - 3 }, (_, i) => {
                const w = rest[i]
                const prize = isComp ? (w?.prize ?? comp.prizes[i + 3] ?? 0) : null
                return w ? <WinRow win={w} rank={i + 4} sort={sort} prize={prize} key={w.id} /> : <EmptyRow rank={i + 4} prize={prize} key={`empty-${i}`} />
              })}
            </ol>
          </div>
        )}

        <MySubmissions wins={mine.wins} onCancel={mine.cancel} />
      </div>

      <SubmitModal open={submitting} onClose={() => setSubmitting(false)} onSubmit={mine.submit} />
    </div>
  )
}

function Seg({ label, items, value, onChange }) {
  return (
    <div className="bw-seg" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" className={value === it.id ? 'is-on' : ''} aria-pressed={value === it.id} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

function SlotArt({ slot, className = '' }) {
  return slot?.image ? (
    <img className={className} src={slot.image} alt="" loading="lazy" />
  ) : (
    <span className={`${className} bw-noart`} aria-hidden="true">
      {slot?.name?.slice(0, 1) ?? '?'}
    </span>
  )
}

// Places 1–3 as the leaderboard's podium: the same box art (box-top1–3), shape, order
// (2nd | 1st | 3rd, 1st raised) and stacking, with the win's details in its slots.
//   avatar → the slot's art · name → the player
//   competition (prizes set, this month): pill → the ranked figure, label → the other figure
//     and the bet, lower panel → the place's prize (REWARD), just like the leaderboard
//   any other view: pill → the other figure, label → the bet, lower panel → the ranked figure
const PLACES = { 1: 'first', 2: 'second', 3: 'third' }
const PODIUM_DELAY = { 1: 300, 2: 380, 3: 460 }
/** Long figures step down a size so they stay inside the card's lower panel */
const fit = (s) => (s.length > 14 ? ' is-longest' : s.length > 11 ? ' is-longer' : s.length > 8 ? ' is-long' : '')
const betText = (n) => fmtMoney(n, Number.isInteger(n) ? 0 : 2)

function WinPodium({ wins, sort, prizes }) {
  // DOM order 1st/2nd/3rd for mobile stacking; .podium places 2nd | 1st | 3rd on desktop
  return (
    <section className="podium bw-podium" aria-label="Top 3 wins">
      {[1, 2, 3].map((rank) => (
        <PodiumWin win={wins[rank - 1]} rank={rank} sort={sort} prize={prizes ? (wins[rank - 1]?.prize ?? prizes[rank - 1] ?? 0) : null} key={rank} />
      ))}
    </section>
  )
}

function PodiumWin({ win: w, rank, sort, prize }) {
  const comp = prize != null
  const byPayout = sort === 'payout'
  const multi = w ? `${num(w.multiplier)}×` : '—'
  const payout = w ? usd(w.payout) : '—'
  const ranked = byPayout ? payout : multi
  const other = byPayout ? multi : payout
  const pill = comp ? ranked : other
  const label = !w ? 'NO WIN YET' : comp ? `${other} · ${betText(w.bet)} BET` : `ON A ${usd(w.bet)} BET`
  const big = comp ? (prize > 0 ? prizeText(prize) : '—') : ranked
  const bigLabel = comp ? 'REWARD' : byPayout ? 'PAYOUT' : 'MULTIPLIER'
  const body = (
    <div className="podium-lift">
      <img className="podium-bg" src={`/assets/box-top${rank}.webp`} width="281" height="349" alt="" />
      <div className="podium-content">
        <span className="bw-p-art">
          {w ? <SlotArt slot={w.slot} className="bw-p-img" /> : <span className="bw-p-img bw-noart" aria-hidden="true" />}
        </span>
        <p className="bw-p-slot" title={w?.slot.name}>
          {w ? w.slot.name : 'Up for grabs'}
        </p>
        <p className="podium-name">{w ? w.player : '—'}</p>
        <div className="podium-wager">
          <span>{pill}</span>
        </div>
        <p className="podium-wager-lbl">{label}</p>
        <p className={`podium-reward${fit(big)}`}>{big}</p>
        <p className="podium-reward-lbl">{bigLabel}</p>
      </div>
    </div>
  )
  // an empty place is left out when stacked on phones, unless it carries a prize to win
  const cls = `podium-card ${PLACES[rank]} bw-pcard${!w && !(prize > 0) ? ' is-empty' : ''} enter`
  const style = { '--d': `${PODIUM_DELAY[rank]}ms` }
  const prizeSay = comp && prize > 0 ? `, wins ${prizeText(prize)}` : ''
  const say = w ? `Place ${rank}: ${w.player}, ${w.slot.name}, ${multi} for ${payout}${prizeSay}` : `Place ${rank}: no win yet${prizeSay ? `, the prize is ${prizeText(prize)}` : ''}`
  // a win with a Rainbet bet link opens the bet; the rest are plain cards
  return w?.link ? (
    <a className={cls} style={style} href={w.link} target="_blank" rel="noopener noreferrer" aria-label={`${say}. View the bet on Rainbet`}>
      {body}
    </a>
  ) : (
    <div className={cls} style={style} aria-label={say}>
      {body}
    </div>
  )
}

function WinRow({ win: w, rank, sort, prize }) {
  return (
    <li className="bw-row">
      <span className="bw-row-rank">{rank}</span>
      <span className="bw-row-slot">
        <SlotArt slot={w.slot} className="bw-row-art" />
        <span className="bw-row-name">
          <span title={w.slot.name}>{w.slot.name}</span>
          {w.slot.provider && <small>{w.slot.provider}</small>}
        </span>
      </span>
      <span className="bw-row-player">{w.player}</span>
      <span className="is-num bw-row-bet">{usd(w.bet)}</span>
      <span className={`is-num bw-row-multi${sort === 'multi' ? ' is-key' : ''}`}>
        {num(w.multiplier)}
        <span className="bw-x">×</span>
      </span>
      <span className={`is-num bw-row-payout${sort === 'payout' ? ' is-key' : ''}`}>
        {w.link ? (
          <a href={w.link} target="_blank" rel="noopener noreferrer" title="View the bet on Rainbet">
            {usd(w.payout)}
          </a>
        ) : (
          usd(w.payout)
        )}
      </span>
      {prize != null && <span className="is-num bw-row-prize">{prize > 0 ? prizeText(prize) : '—'}</span>}
    </li>
  )
}

/** A prize place nobody holds yet */
function EmptyRow({ rank, prize }) {
  return (
    <li className="bw-row is-empty">
      <span className="bw-row-rank">{rank}</span>
      <span className="bw-row-slot">
        <span className="bw-row-art bw-noart" aria-hidden="true" />
        <span className="bw-row-name">
          <span>Up for grabs</span>
        </span>
      </span>
      <span className="bw-row-player">—</span>
      <span className="is-num bw-row-bet">—</span>
      <span className="is-num bw-row-multi">—</span>
      <span className="is-num bw-row-payout">—</span>
      {prize != null && <span className="is-num bw-row-prize">{prize > 0 ? prizeText(prize) : '—'}</span>}
    </li>
  )
}

/** The signed-in player's submissions: waiting, on the board, or turned down (with the reason) */
function MySubmissions({ wins, onCancel }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  if (!wins.length) return null
  const cancel = async (id) => {
    setBusy(id)
    setError('')
    try {
      await onCancel(id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }
  return (
    <section className="bw-mine" aria-labelledby="bw-mine-title">
      <h2 className="section-title" id="bw-mine-title">
        Your submissions
      </h2>
      <ul className="mc-list">
        {wins.map((w) => {
          const s = STATUS[w.status] ?? STATUS.pending
          return (
            <li className="mc-row bw-mine-row" key={w.id}>
              <SlotArt slot={w.slot} className="bw-mine-art" />
              <span className="mc-what">
                <span className="mc-title">
                  {w.slot.name} · {num(w.multiplier)}×
                </span>
                <span className="mc-sub">
                  {usd(w.bet)} bet · sent {day(w.at)}
                </span>
                {w.adminNote && w.status === 'rejected' && <span className="mc-note is-no">{w.adminNote}</span>}
              </span>
              <span className="mc-reward">{usd(w.payout)}</span>
              <span className="mc-end">
                <span className={`mc-pill is-${s.tone}`}>{s.label}</span>
                {w.status === 'pending' && (
                  <button type="button" className="link-btn mc-cancel" disabled={busy === w.id} onClick={() => cancel(w.id)}>
                    {busy === w.id ? 'Withdrawing…' : 'Withdraw'}
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {error && <p className="mc-error">{error}</p>}
    </section>
  )
}

// ---------------------------------------------------------------- submitting a win

let games = null
const loadGames = async () => (games ??= (await loadSlotCatalog()).games.map((g) => ({ ...g, low: g.name.toLowerCase() })))

/** Search the slot catalog; a name that isn't in it can still be sent as typed */
function SlotField({ value, onChange, inputRef }) {
  const [list, setList] = useState(games)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef(null)

  useEffect(() => {
    if (!list) loadGames().then(setList, () => setList([]))
  }, [list])

  const results = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (k.length < 2 || !list) return []
    const starts = []
    const has = []
    for (const g of list) {
      if (g.low.startsWith(k)) starts.push(g)
      else if (has.length < 8 && g.low.includes(k)) has.push(g)
      if (starts.length >= 8) break
    }
    return [...starts, ...has].slice(0, 8)
  }, [q, list])

  const pick = (g) => {
    onChange(g ? { name: g.name, slug: g.slug, provider: g.provider, image: g.image } : { name: q.trim(), slug: null, provider: null, image: null })
    setOpen(false)
  }

  if (value)
    return (
      <span className="bw-picked">
        <SlotArt slot={value} className="bw-picked-art" />
        <span className="bw-picked-name">
          {value.name}
          <small>{value.provider || 'Not in our slot list: the team will check the name'}</small>
        </span>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            onChange(null)
            setQ('')
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
        >
          Change
        </button>
      </span>
    )

  return (
    <div className="bw-slot" ref={box} onBlur={(e) => !box.current.contains(e.relatedTarget) && setOpen(false)}>
      <input
        ref={inputRef}
        value={q}
        aria-labelledby="bw-slot-label"
        placeholder={list ? 'Search the slot, e.g. Gates of Olympus' : 'Loading slots…'}
        autoComplete="off"
        spellCheck="false"
        role="combobox"
        aria-expanded={open && q.trim().length >= 2}
        aria-controls="bw-slot-list"
        aria-autocomplete="list"
        onChange={(e) => (setQ(e.target.value), setOpen(true), setActive(0))}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
          else if (e.key === 'Enter' && q.trim()) (e.preventDefault(), pick(results[active]))
          else if (e.key === 'Escape' && open) (e.stopPropagation(), setOpen(false))
        }}
      />
      {open && q.trim().length >= 2 && (
        <ul className="bw-slot-list" id="bw-slot-list" role="listbox">
          {results.map((g, i) => (
            <li key={g.key} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'is-active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(g)}>
                <SlotArt slot={g} className="bw-slot-art" />
                <span className="bw-slot-name">{g.name}</span>
                <span className="bw-slot-prov">{g.provider}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="bw-slot-custom" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)}>
              Use “{q.trim()}”
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

const EMPTY = { slot: null, bet: '', multiplier: '', proof: '', note: '' }

function SubmitModal({ open, onClose, onSubmit }) {
  const auth = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null)
  const slotRef = useRef()
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return undefined
    setForm(EMPTY)
    setError('')
    setSent(null)
    const t = setTimeout(() => slotRef.current?.focus(), 260) // after the dialog focuses its close button
    return () => clearTimeout(t)
  }, [open])

  const bet = parse(form.bet)
  const multi = parse(form.multiplier)
  const payout = bet > 0 && multi > 0 ? Math.round(bet * multi * 100) / 100 : null

  const submit = async (e) => {
    e.preventDefault()
    if (!form.slot) return setError('Pick the slot you won on.')
    if (!(bet > 0)) return setError('Enter your bet size.')
    if (!(multi > 0)) return setError('Enter the multiplier.')
    if (!form.proof.trim()) return setError('Paste the bet link of the win.')
    setBusy(true)
    setError('')
    try {
      setSent(await onSubmit({ slot: { name: form.slot.name, slug: form.slot.slug }, bet, multiplier: multi, proof: form.proof.trim(), note: form.note.trim() }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const linked = auth.user && auth.rainbet
  return (
    <Modal open={open} onClose={onClose} labelledBy="bw-submit-title" className="claim-modal bw-modal">
      <h2 id="bw-submit-title">{sent ? 'Win submitted' : 'Submit a win'}</h2>
      {sent ? (
        <>
          <div className="claim-sum">
            <p>
              Your <b>{num(sent.multiplier)}×</b> on <b>{sent.slot.name}</b> ({usd(sent.payout)}) is with the team. Once they’ve checked the bet it goes up on
              the board.
            </p>
            <p>You can follow it under “Your submissions” on this page.</p>
          </div>
          <button type="button" className="btn-blue ticket-cta" onClick={onClose}>
            Done
          </button>
        </>
      ) : auth.status === 'loading' ? null : !auth.user ? (
        <>
          <p className="claim-sum">Sign in with Kick and link your Rainbet username to submit a win. Only wins on that account count.</p>
          <button type="button" className="btn-blue ticket-cta" onClick={() => auth.signInWithKick?.()}>
            Sign in with Kick
          </button>
        </>
      ) : !linked ? (
        <p className="claim-sum">
          Link your Rainbet username on <Link to="/profile" onClick={onClose}>your profile</Link> first. Once an admin approves it you can submit
          wins from that account here.
        </p>
      ) : (
        <form className="claim-form" onSubmit={submit} noValidate>
          <div className="bw-field">
            <span className="bw-label" id="bw-slot-label">
              Slot
            </span>
            <SlotField value={form.slot} onChange={set('slot')} inputRef={slotRef} />
          </div>
          <div className="bw-pair">
            <label>
              Bet size ($)
              <input value={form.bet} onChange={(e) => set('bet')(e.target.value)} inputMode="decimal" placeholder="1.00" autoComplete="off" maxLength={12} />
            </label>
            <label>
              Multiplier (×)
              <input value={form.multiplier} onChange={(e) => set('multiplier')(e.target.value)} inputMode="decimal" placeholder="5,000" autoComplete="off" maxLength={12} />
            </label>
          </div>
          <p className="bw-payout" aria-live="polite">
            Payout <b>{payout != null ? usd(payout) : '—'}</b>
          </p>
          <label>
            Bet link
            <input
              value={form.proof}
              onChange={(e) => set('proof')(e.target.value)}
              placeholder="https://rainbet.com/…"
              autoComplete="off"
              spellCheck="false"
              maxLength={200}
            />
            <small>On Rainbet, open the bet in your bet history and copy its link.</small>
          </label>
          <label>
            Note <small>(optional)</small>
            <textarea value={form.note} onChange={(e) => set('note')(e.target.value)} rows={2} maxLength={200} placeholder="Anything the team should know" />
          </label>
          <p className="claim-error" role="alert">
            {error}
          </p>
          <button className="btn-blue" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Sending…' : `Submit as ${auth.rainbet}`}
          </button>
        </form>
      )}
    </Modal>
  )
}
