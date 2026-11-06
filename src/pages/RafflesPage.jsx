import { useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../config'
import { useAuth } from '../hooks/useAuth'
import { useCountdown } from '../hooks/useCountdown'
import { usePlayer } from '../hooks/usePlayer'
import { fairFloats, keptDraws, sha256 } from '../raffle'
import { useUI } from '../ui'
import { fmtMoney, maskName, pad } from '../utils'
import { CodeButton, RulesButton, VisitButton } from '../components/Buttons'
import BubbleMachine, { pickBallNames, preloadBubbleMachine } from '../components/BubbleMachine'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import VipBadge from '../components/VipBadge'
import StepsModal from '../components/StepsModal'
import '../raffles.css'
import EmptyState from '../components/EmptyState'

// The raffle page is built from the same pieces as the other titled pages:
// heading + code/visit buttons, three step cards, milestone-style rows and
// leaderboard-style tables, 844px wide. The TGN mechanical raffle machine (four number
// drums + a pull lever) is the centrepiece.
//
// Data: the raffle the admin runs on the server (/api/raffles, server/features/raffles.js)
// when there is one: entries with player numbers, draws, the committed seed. The drums
// show the latest winner's player number and the ticket prints their (masked) name.
// Raffles exist only when an admin creates one (no built-in raffle): with none, the page
// says so.
// A watch-time raffle, when there is one, sits behind the Wager / Watch-time toggle.

const code = config.referralCode.toUpperCase()
const pct = (v) => {
  const digits = v < 0.01 ? 2 : 1
  return `${(v * 100).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}
const month = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const pnum = (n) => `#${String(n ?? 0).padStart(4, '0')}`
const fmtMinutes = (m) => {
  const h = Math.floor(m / 60)
  return h ? `${h.toLocaleString('en-US')}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`
}
const isWatch = (r) => r.kind === 'watch'
/** The line printed under the winner's name on the machine's ticket */
const ticketLine = (r) => (isWatch(r ?? {}) ? 'TEGENS · WATCH-TIME RAFFLE' : 'TEGENS · MONTHLY WAGER RAFFLE')
const fmtAmount = (r, v, decimals = 0) => (isWatch(r) ? fmtMinutes(v) : fmtMoney(v, decimals))
const fmtUnit = (r) => (isWatch(r) ? `${r.ticketUnit.toLocaleString('en-US')} min` : fmtMoney(r.ticketUnit))

function steps(kind, unit, windowMinutes) {
  if (kind === 'watch') {
    return [
      {
        title: 'Step 1',
        image: '/assets/td/ms-step1.webp',
        text: (
          <>
            Watch Tegens live on Kick
            {' '}<br />
            &amp; <span className="accent">chat</span> during the stream.
          </>
        ),
      },
      {
        title: 'Step 2',
        image: '/assets/td/ms-step2.webp',
        text: (
          <>
            Each {windowMinutes ?? 5} min you chat counts. Every <span className="accent">{unit} min</span>
            {' '}<br />
            earns you one raffle ticket.
          </>
        ),
      },
      {
        title: 'Step 3',
        image: '/assets/td/raffle-step3-machine.webp',
        text: (
          <>
            When the month ends, the machine
            {' '}<br />
            draws the winners live on stream.
          </>
        ),
      },
    ]
  }
  return [
    {
      title: 'Step 1',
      image: '/assets/td/ms-step1.webp',
      text: (
        <>
          Create an account on Rainbet under
          {' '}<br />
          code <span className="accent">{code}</span> &amp; start wagering.
        </>
      ),
    },
    {
      title: 'Step 2',
      image: '/assets/td/ms-step2.webp',
      text: (
        <>
          Every <span className="accent">{fmtMoney(unit)}</span> wagered this month
          {' '}<br />
          earns you one raffle ticket.
        </>
      ),
    },
    {
      title: 'Step 3',
      image: '/assets/td/raffle-step3-machine.webp',
      text: (
        <>
          When the month ends, the machine
          {' '}<br />
          draws the winners live on site.
        </>
      ),
    },
  ]
}

function statusLabel(r) {
  if (r.status === 'open') return 'Counting tickets'
  if (r.status === 'locked') return r.draws.length ? 'Drawing' : 'Tickets locked'
  return 'Drawn'
}

function TicketIcon({ size = 18 }) {
  return <img src="/assets/td/nav-raffles-active.svg" width={size} height={Math.round(size * 0.8)} alt="" />
}

/**
 * The server's raffles (null of a kind when there is none) and each kind's list of raffles
 * (newest first, for the month picker). `me`: the saved Rainbet username; `picks`: the raffle
 * id chosen for each kind (null: the newest).
 */
function useServerRaffles(me, picks) {
  const [state, setState] = useState({ loaded: false, wager: null, watch: null, lists: { wager: [], watch: [] } })
  useEffect(() => {
    let cancelled = false
    let timer = null
    const get = (kind, extra = '') =>
      fetch(`/api/raffles?kind=${kind}${picks[kind] ? `&id=${encodeURIComponent(picks[kind])}` : ''}${extra}`, { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { raffle: null, list: [] }))
        .catch(() => ({ raffle: null, list: [] }))
    const run = async () => {
      const [w, t] = await Promise.all([get('wager', me ? `&me=${encodeURIComponent(me)}` : ''), get('watch')])
      if (cancelled) return
      const wager = w.raffle ?? null
      const watch = t.raffle ?? null
      setState({ loaded: true, wager: wager && fromServer(wager), watch: watch && fromServer(watch), lists: { wager: w.list ?? [], watch: t.list ?? [] } })
      const open = [wager, watch].some((r) => r && r.status !== 'complete')
      timer = setTimeout(run, open ? 15_000 : 120_000) // draws show up within seconds while live
    }
    run()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [me, picks.wager, picks.watch])
  return state
}

const KINDS = [
  ['wager', 'Wager Raffle'],
  ['watch', 'Watch-Time Raffle'],
]
const shortMonth = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
/** ?tab=watch opens the watch-time raffle; the wager raffle is the default */
const tabFromUrl = () => (new URLSearchParams(window.location.search).get('tab') === 'watch' ? 'watch' : 'wager')

/** A server raffle in the shape the page's pieces use */
const fromServer = (r) => ({ ...r, server: true, period: { start: r.start, end: r.end } })

export default function RafflesPage() {
  // start the 3D machine's download now, in parallel with the raffle data
  useEffect(() => {
    preloadBubbleMachine().catch(() => {})
  }, [])
  const player = usePlayer()
  const [picks, setPicks] = useState({ wager: null, watch: null })
  const server = useServerRaffles(player.username, picks)
  const [kind, setKindState] = useState(tabFromUrl)
  const [rulesOpen, setRulesOpen] = useState(false)
  const setKind = (k) => {
    setKindState(k)
    const url = new URL(window.location.href)
    if (k === 'wager') url.searchParams.delete('tab')
    else url.searchParams.set('tab', k)
    window.history.replaceState(window.history.state, '', url.pathname + url.search)
  }
  const wager = server.wager
  const raffle = kind === 'watch' ? server.watch : wager
  const status = server.loaded ? 'ready' : 'loading'
  const shownKind = kind
  const list = server.lists[kind] ?? []

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="MONTHLY" bottom="RAFFLES">
        {kind === 'watch' ? (
          <>
            Chat during the stream on <b className="accent">Kick</b> to earn tickets
          </>
        ) : (
          <>
            Wager under code <b className="accent">{code}</b> to earn tickets
          </>
        )}
        {' '}<br />
        in the TGN raffle &amp; win a share of the pool.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <CodeButton />
        <VisitButton />
        <RulesButton onClick={() => setRulesOpen(true)} />
      </div>

      <div className="rf-switch enter" style={{ '--d': '180ms' }}>
        <div className="rf-kinds" role="tablist" aria-label="Raffles">
          {KINDS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={shownKind === k} className={`rf-kind${shownKind === k ? ' is-active' : ''}`} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
        {list.length > 1 && (
          <label className="rf-month-pick">
            <span className="sr-only">Month</span>
            <select value={raffle?.id ?? list[0].id} onChange={(e) => setPicks((p) => ({ ...p, [kind]: e.target.value === list[0].id ? null : e.target.value }))}>
              {list.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {shortMonth(r.start)}
                  {i === 0 ? ' · Latest' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <StepsModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title={shownKind === 'watch' ? 'How the watch-time raffle works' : 'How the raffle works'}
        steps={steps(shownKind, raffle?.ticketUnit ?? config.raffle.ticketUnit, raffle?.windowMinutes)}
      />

      {status === 'loading' && <div className="spinner" role="status" aria-label="Loading" />}
      {status === 'ready' && kind === 'wager' && !raffle && (
        <EmptyState title="No raffle running right now" icon>
          When the next one opens, wagering under code {code} on Rainbet earns tickets. Check back soon.
        </EmptyState>
      )}
      {status === 'ready' && kind === 'watch' && !raffle && (
        <EmptyState
          title="No watch-time raffle running yet"
          icon
          actions={
            <a className="chip-btn" href={config.kickUrl} target="_blank" rel="noopener noreferrer">
              <img src="/assets/icon-kick.svg" width="14" height="14" alt="" />
              Watch on Kick
            </a>
          }
        >
          When one opens, chatting during the stream on Kick earns tickets. Check back soon.
        </EmptyState>
      )}
      {raffle && <RaffleView key={raffle.id} raffle={raffle} />}
    </div>
  )
}

/** The newest draw that stands (a reroll's replacement included) */
const latestWin = (draws) => [...draws].reverse().find((d) => !d.rerolled) ?? null

function RaffleView({ raffle }) {
  const machine = useRef(null)
  const [ready, setReady] = useState(false)
  const [pulling, setPulling] = useState(false)
  const shown = useRef(null) // `${id}:${draws}` last put on the drums
  // the entrants' names on the 40 balls (weighted by tickets, the same on every render)
  const balls = useMemo(
    () => pickBallNames(raffle.entries, raffle.id ?? raffle.period?.start ?? 'raffle', (e) => (raffle.server ? e.name : maskName(e.name))),
    [raffle.entries, raffle.id, raffle.period?.start, raffle.server],
  )

  /** The full draw: DRAW press, the balls mix, the winning ball (player number) drops onto the
   *  cradle and the WINNER display shows the number and name */
  const play = async (d) => {
    const m = machine.current
    if (!m) return
    setPulling(true)
    try {
      const run = m.triggerHandleAnimation() // start first: the number then waits for the reveal
      if (d) {
        m.setNumber(d.playerNumber)
        m.setTicket(d.name, ticketLine(raffle))
      }
      await run
    } finally {
      setPulling(false)
    }
  }
  // No public Draw button: draws are made by an admin (Admin → Raffles) and play out here on
  // their own; a past draw can be replayed from the list below.
  const onReady = () => {
    setReady(true)
    if (import.meta.env.DEV) window.tgnRaffleMachine = machine.current // console access while developing
  }

  // Server raffles: the drums hold the latest winner's number; a draw made while the page
  // is open plays out on the machine
  const count = raffle.draws.length
  useEffect(() => {
    const m = machine.current
    if (!ready || !m || !raffle.server) return
    const key = `${raffle.id}:${count}`
    const prev = shown.current
    if (prev === key) return
    shown.current = key
    const win = latestWin(raffle.draws)
    const grew = prev?.startsWith(`${raffle.id}:`) && Number(prev.split(':')[1]) < count
    if (grew && win) play(win)
    else if (win) {
      m.setNumber(win.playerNumber)
      m.setTicket(win.name, ticketLine(raffle))
    } else {
      m.startDrumRotation()
      m.setTicket('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, raffle.id, raffle.server, count])

  return (
    <div className="rf">
      <YourTickets raffle={raffle} />

      <section className="rf-stage enter" style={{ '--d': '380ms' }} aria-label="Raffle machine">
        <BubbleMachine ref={machine} onReady={onReady} entries={raffle.players ?? raffle.entries.length} names={balls} />
        <span className={`rf-chip is-${raffle.status}`}>
          {raffle.status === 'open' && <span className="rf-chip-dot" aria-hidden="true" />}
          {month(raffle.period.start)} · {statusLabel(raffle)}
        </span>
      </section>

      <Stats raffle={raffle} />

      <h2 className="rf-title section-title">Draws</h2>
      <DrawList raffle={raffle} onPlay={(d) => !pulling && ready && (raffle.server ? play(d) : play({ ...d, name: maskName(d.name) }))} />

      <Entries raffle={raffle} />
      <Fairness raffle={raffle} />
    </div>
  )
}

/** Prize pool · time to the draw · tickets, as three cards */
function Stats({ raffle }) {
  const t = useCountdown(raffle.period.end)
  const counting = raffle.status === 'open' && !t.ended
  const players = raffle.players ?? raffle.entries.length
  return (
    <ul className="rf-stats enter" style={{ '--d': '420ms' }}>
      <li className="rf-stat">
        <span className="rf-stat-label">Prize pool</span>
        <span className="rf-stat-value accent">{fmtMoney(raffle.prizePool)}</span>
        <span className="rf-stat-sub">
          {raffle.drawsTotal} × {fmtMoney(raffle.prizePerDraw)} · max {raffle.maxWinsPerPerson} {raffle.maxWinsPerPerson === 1 ? 'win' : 'wins'} each
        </span>
      </li>
      <li className="rf-stat">
        <span className="rf-stat-label">{counting ? 'Draw in' : 'Draw'}</span>
        <span className="rf-stat-value">
          {counting
            ? `${t.days}d ${pad(t.hours)}h ${pad(t.mins)}m ${pad(t.secs)}s`
            : raffle.status === 'complete'
              ? 'Complete'
              : raffle.status === 'locked' && raffle.draws.length
                ? `${keptDraws(raffle.draws).length} of ${raffle.drawsTotal}`
                : 'Coming up'}
        </span>
        <span className="rf-stat-sub">After {month(raffle.period.start)} ends (UTC)</span>
      </li>
      <li className="rf-stat">
        <span className="rf-stat-label">Tickets</span>
        <span className="rf-stat-value">{raffle.totalTickets.toLocaleString('en-US')}</span>
        <span className="rf-stat-sub">
          {players} {players === 1 ? 'player' : 'players'} · {fmtUnit(raffle)} each
        </span>
      </li>
    </ul>
  )
}

/** A milestone-style row: the viewer's tickets and share of the draw */
function YourTickets({ raffle }) {
  const player = usePlayer()
  const auth = useAuth()
  const { openPlayer } = useUI()
  const watch = isWatch(raffle)
  const who = watch ? auth.user?.kick?.username : player.username
  let mine = null
  if (raffle.server) mine = raffle.mine ?? null
  else if (player.username) mine = raffle.entries.find((e) => e.name.toLowerCase() === player.username.toLowerCase()) ?? null
  const wins = mine ? (raffle.server ? mine.wins : keptDraws(raffle.draws).filter((d) => d.name === mine.name).length) : 0
  const top = raffle.entries.reduce((m, e) => Math.max(m, e.tickets), 0) || 1

  const hint = !who
    ? watch
      ? 'Sign in with Kick to see your tickets'
      : 'Enter your Rainbet username to see your tickets'
    : mine
      ? `${fmtAmount(raffle, mine.amount, 2)} ${watch ? 'watched' : 'wagered'}${wins ? ` · won ${wins}×` : ''}`
      : watch
        ? `Chat on stream for ${raffle.ticketUnit} min to earn your first ticket`
        : `Wager ${fmtMoney(raffle.ticketUnit)} for your first ticket`

  return (
    <div className="ms-row rf-you enter" style={{ '--d': '340ms' }}>
      <span className="rf-you-icon" aria-hidden="true">
        <TicketIcon size={26} />
      </span>
      <div className="ms-mid">
        <p className="ms-line">
          <span className="ms-reach">{who ?? 'Your tickets'}</span>
          <span className="ms-wager">{hint}</span>
          {mine && (
            <span className="ms-prize">
              {mine.playerNumber && <>Player <b>{pnum(mine.playerNumber)}</b> · </>}
              <b>{mine.tickets.toLocaleString('en-US')}</b> {mine.tickets === 1 ? 'ticket' : 'tickets'} · <b>{pct(mine.odds)}</b> per draw
            </span>
          )}
        </p>
        <span className="ms-bar" role="progressbar" aria-label="Your tickets against the most held" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((mine?.tickets ?? 0) / top) * 100)}>
          <span style={{ width: `${((mine?.tickets ?? 0) / top) * 100}%` }} />
        </span>
      </div>
      {watch ? (
        !auth.user?.kick && (
          <button className="ms-btn is-claim" onClick={() => auth.signInWithKick?.('/raffles')}>
            Sign in
          </button>
        )
      ) : (
        <button className={`ms-btn${player.username ? '' : ' is-claim'}`} onClick={openPlayer}>
          {player.username ? 'Change' : 'Enter'}
        </button>
      )}
    </div>
  )
}

/** Leaderboard-style ladder: one row per prize, filled in as winners are drawn */
function DrawList({ raffle, onPlay }) {
  let rows
  if (raffle.server) {
    // a replacement sits right under the draw it replaced
    rows = [...raffle.draws].sort((a, b) => a.slot - b.slot || a.n - b.n).map((d) => ({ d, label: d.rerolled ? '—' : `#${d.slot}` }))
  } else {
    let slot = 0
    rows = raffle.draws.map((d) => ({ d, label: d.rerolled ? '—' : `#${++slot}` }))
  }
  const filled = new Set(rows.filter(({ d }) => !d.rerolled).map(({ label }) => label)).size
  const left = Math.max(0, raffle.drawsTotal - filled)
  return (
    <ol className="lb-rows rf-draws">
      {rows.map(({ d, label }) => (
        <li className={`lb-row rf-draw${d.rerolled ? ' is-rerolled' : ''}`} key={d.n}>
          <span className="lb-place">{label}</span>
          <span className="lb-user">
            <img className="rf-avatar" src={config.rowAvatar} width="30" height="30" alt="" loading="lazy" decoding="async" />
            {d.playerNumber && <span className="rf-pnum">{pnum(d.playerNumber)}</span>}
            <span>{raffle.server ? d.name : maskName(d.name)}</span>
            <VipBadge name={d.name} via={isWatch(raffle) ? 'kick' : 'rainbet'} force={Boolean(d.vip)} />
          </span>
          {d.rerolled ? (
            <span className="rf-draw-note">Rerolled</span>
          ) : (
            <button className="link-btn rf-draw-note" onClick={() => onPlay(d)}>Watch the draw</button>
          )}
          <span className="lb-prize">{d.rerolled ? '—' : fmtMoney(d.prize, 2)}</span>
        </li>
      ))}
      {Array.from({ length: left }, (_, i) => (
        <li className="lb-row rf-draw empty" key={`left-${i}`}>
          <span className="lb-place">#{filled + i + 1}</span>
          <span className="lb-user">
            <img className="rf-avatar is-empty" src={config.rowAvatar} width="30" height="30" alt="" loading="lazy" decoding="async" />
            <span>To be drawn</span>
          </span>
          <span className="rf-draw-note" />
          <span className="lb-prize">{fmtMoney(raffle.prizePerDraw, 2)}</span>
        </li>
      ))}
    </ol>
  )
}

const SHOWN = 20

function Entries({ raffle }) {
  const player = usePlayer()
  const [all, setAll] = useState(false)
  const sorted = [...raffle.entries].sort((a, b) => b.tickets - a.tickets || b.amount - a.amount)
  const rows = all ? sorted : sorted.slice(0, SHOWN)
  const me = player.username?.toLowerCase()
  const mineNumber = raffle.server ? raffle.mine?.playerNumber : null
  const watch = isWatch(raffle)

  return (
    <section className="rf-entries" aria-labelledby="rf-entries">
      <div className="rf-title-row">
        <h2 id="rf-entries" className="rf-title section-title">Entries</h2>
        <span className="rf-count">{raffle.totalTickets.toLocaleString('en-US')} tickets</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState compact>{raffle.status === 'open' ? 'Tickets show here as they’re earned this month.' : 'No entries.'}</EmptyState>
      ) : (
        <>
          <div className="lb-head rf-head">
            <span className="lb-h-place"><span className="hash">#</span>{raffle.server ? 'Player' : 'Place'}</span>
            <span className="lb-h-user">
              <img src="/assets/icon-user.svg" width="12.8335" height="14" alt="" />User
            </span>
            <span className="lb-h-wager">{watch ? 'Watched' : <><span className="hash">$</span>Wagered</>}</span>
            <span className="rf-h-tickets">Tickets</span>
            <span className="rf-h-odds">Odds</span>
          </div>
          <img className="lb-line" src="/assets/line-table.svg" width="803" height="0.5" alt="" />
          <ol className="lb-rows rf-entry-rows">
            {rows.map((e, i) => {
              const you = raffle.server ? mineNumber != null && e.playerNumber === mineNumber : me && e.name.toLowerCase() === me
              const name = raffle.server ? (you ? raffle.mine.name : e.name) : you ? e.name : maskName(e.name)
              return (
                <li className={`lb-row rf-entry${you ? ' is-you' : ''}`} key={(e.playerNumber ?? e.name) + ':' + i}>
                  <span className="lb-place">{raffle.server ? pnum(e.playerNumber) : `#${i + 1}`}</span>
                  <span className="lb-user">
                    <img src={config.rowAvatar} width="40" height="40" alt="" loading="lazy" decoding="async" />
                    <span>{name}</span>
                    <VipBadge name={e.name} via={isWatch(raffle) ? 'kick' : 'rainbet'} force={Boolean(e.vip)} />
                    {you && <span className="rf-you-tag">You</span>}
                  </span>
                  <span className="lb-wager">{fmtAmount(raffle, e.amount, 2)}</span>
                  <span className="rf-tickets">
                    <TicketIcon size={14} />
                    {e.tickets.toLocaleString('en-US')}
                  </span>
                  <span className="rf-odds">{pct(e.odds)}</span>
                </li>
              )
            })}
          </ol>
          {sorted.length > SHOWN && (
            <button className="ms-btn rf-more" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${sorted.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Re-run every recorded draw from the revealed seed (server raffles). Entries come in
 * the frozen order; players are told apart by player number. A reroll counts only from
 * when it was made (rerolledBefore), exactly as on the server.
 */
async function replayServerDraws(r) {
  for (const [k, d] of r.draws.entries()) {
    const wins = new Map()
    const out = new Set()
    for (const p of r.draws.slice(0, k)) {
      if (p.rerolled && (p.rerolledBefore ?? 0) <= k) out.add(p.playerNumber)
      else wins.set(p.playerNumber, (wins.get(p.playerNumber) ?? 0) + 1)
    }
    const eligible = r.entries.filter((e) => !out.has(e.playerNumber) && (wins.get(e.playerNumber) ?? 0) < r.maxWinsPerPerson)
    const pool = eligible.reduce((s, e) => s + e.tickets, 0)
    const [f] = await fairFloats(r.seed, r.id, k, 1)
    const ticket = Math.min(pool - 1, Math.floor(f * pool))
    let at = 0
    const win = eligible.find((e) => ticket < (at += e.tickets))
    if (!win || win.playerNumber !== d.playerNumber || ticket !== d.ticket || pool !== d.pool) return false
  }
  return true
}

function Fairness({ raffle }) {
  const [check, setCheck] = useState('idle')
  useEffect(() => setCheck('idle'), [raffle.id, raffle.seed])
  const verify = async () => {
    setCheck('running')
    const hashOk = raffle.seedHash && (await sha256(raffle.seed)) === raffle.seedHash.toLowerCase()
    const drawsOk = !raffle.server || (hashOk && (await replayServerDraws(raffle)))
    setCheck(!hashOk ? 'bad' : drawsOk ? 'ok' : 'draws')
  }
  const when = raffle.server ? 'the raffle locks' : 'the month ends'
  return (
    <section className="rf-fair" aria-labelledby="rf-fair">
      <h2 id="rf-fair" className="rf-title section-title">Provably fair</h2>
      <p className="rf-fair-text">
        {raffle.server
          ? 'When the tickets lock, every player gets a fixed player number and we publish the fingerprint (SHA-256 hash) of a secret seed, which locks the draws in. '
          : 'Before the month ends we publish the fingerprint (SHA-256 hash) of a secret seed, which locks the draws in. '}
        After the draw the seed is revealed and every draw picks ticket <em>⌊random × tickets⌋</em> from HMAC-SHA256 of that seed, so your
        odds are exactly your share of the tickets and anyone can check the result.
      </p>
      <dl className="rf-seed">
        <div>
          <dt>Seed fingerprint</dt>
          <dd>{raffle.seedHash ?? `Published when ${when}`}</dd>
        </div>
        <div>
          <dt>Seed</dt>
          <dd>{raffle.seed ?? 'Revealed when every prize has been drawn'}</dd>
        </div>
      </dl>
      {raffle.seed && (
        <div className="rf-verify">
          <button className="ms-btn is-claim rf-verify-btn" onClick={verify} disabled={check === 'running'}>
            {check === 'running' ? 'Checking…' : 'Verify'}
          </button>
          {check === 'ok' && (
            <span className="rf-verify-ok">
              Seed matches its fingerprint. {raffle.server ? 'Every draw above re-runs from it exactly.' : 'Every draw above comes from it.'}
            </span>
          )}
          {check === 'bad' && <span className="rf-verify-bad">This seed doesn’t match the fingerprint.</span>}
          {check === 'draws' && <span className="rf-verify-bad">The seed matches, but the draws don’t re-run to the same winners.</span>}
        </div>
      )}
    </section>
  )
}
