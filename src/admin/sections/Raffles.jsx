import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet, apiPost } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Input, Pill, SectionIntro, Stat } from '../ui'
import RaffleSetup from './RaffleSetup'
import { usePolled } from '../../hooks/usePolled'
import { useAuth } from '../../hooks/useAuth'
import BubbleMachine, { pickBallNames } from '../../components/BubbleMachine'
import { maskName } from '../../utils'
import './site.css'
import './Raffles.css'

// Raffles: the monthly WAGER raffle (Rainbet, $ per ticket) and WATCH-TIME raffle
// (Kick chat activity while live, minutes per ticket). Server: server/features/raffles.js.
// Open (tickets count live) → Lock (entries frozen, player numbers, seed hash published)
// → Draw one at a time on the machine preview → Reroll if a winner can't take it →
// Finish (seed revealed). The public page and /overlay/raffle pick every step up.

const usd = (v, d = 0) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
const minutes = (m) => (m >= 60 ? `${Math.floor(m / 60).toLocaleString('en-US')}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`)
const amount = (r, v) => (r.kind === 'watch' ? minutes(v) : usd(v, 2))
const pct = (v) => `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: v < 0.01 ? 3 : 1 })}%`
const pnum = (n) => `#${String(n ?? 0).padStart(4, '0')}`
const when = (s) => (s ? new Date(s * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const KIND = { wager: 'Wager', watch: 'Watch-time' }
const STATUS = { open: ['live', 'Counting tickets'], locked: ['warn', 'Locked'], complete: ['ok', 'Complete'] }

export default function RafflesAdmin() {
  // mods run the draw on stream; creating, changing, unlocking and deleting raffles is admins'
  // (server/mods.js refuses those for mods too)
  const { admin } = useAuth()
  const { data, error, reload } = usePolled('/api/admin/raffles', 8000)
  const [view, setView] = useState(null) // null: the running raffle (else the newest) · 'new' · a raffle id
  const raffles = data?.raffles ?? []
  const auto = raffles.find((r) => r.status !== 'complete') ?? raffles[0] ?? null
  const showNew = admin && (view === 'new' || (data && raffles.length === 0))
  const raffle = showNew ? null : raffles.find((r) => r.id === view) ?? auto
  // one unfinished raffle of each type at a time (the server refuses a second)
  const blocked = Object.fromEntries(
    ['wager', 'watch']
      .filter((k) => raffles.some((r) => r.kind === k && r.status !== 'complete'))
      .map((k) => [k, `A ${KIND[k].toLowerCase()} raffle is still running. Finish or delete it before starting another.`]),
  )

  const create = async (body) => {
    const res = await apiPost('/api/admin/raffles', body)
    setView(res.raffle.id)
    reload()
  }

  return (
    <div className="adm-rf">
      <SectionIntro
        actions={
          admin && (
            <Button kind="primary" onClick={() => setView('new')} disabled={showNew}>
              New raffle
            </Button>
          )
        }
      >
        Set up a raffle and its tickets add up by themselves over its dates: Rainbet wager under the code, or time in Kick chat while live.
        When the dates are over, lock it and draw the winners live on the machine. Show the draw on stream with <code>/overlay/raffle</code>{' '}
        (<code>?kind=watch</code> for watch-time).
      </SectionIntro>
      <ErrorLine>{error && !data ? error : ''}</ErrorLine>

      {!data && !error && <span className="adm-spin adm-spin-inline" aria-label="Loading" />}

      {!admin && data && raffles.length === 0 && <Empty>No raffle is set up yet. An admin creates raffles; you can run the draw once one exists.</Empty>}
      {raffles.length > 0 && <RaffleList raffles={raffles} current={raffle?.id} onPick={setView} />}

      {showNew && (
        <RaffleSetup key="new" mode="create" blocked={blocked} onSubmit={create} onCancel={raffles.length ? () => setView(null) : undefined} />
      )}
      {raffle && <RaffleDetail key={raffle.id} raffle={raffle} watch={data.watch} reload={reload} canEdit={admin} />}
    </div>
  )
}

/** Every raffle, newest first; pick one to run it */
function RaffleList({ raffles, current, onPick }) {
  return (
    <Card title="Your raffles" className="rf-list-card">
      <div className="pl-table-wrap">
        <table className="adm-table rf-list">
          <thead>
            <tr>
              <th>Raffle</th>
              <th>Dates (UTC)</th>
              <th>Status</th>
              <th className="is-num">Pool</th>
              <th className="is-num">Players</th>
              <th className="is-num">Tickets</th>
            </tr>
          </thead>
          <tbody>
            {raffles.map((r) => {
              const [tone, label] = STATUS[r.status]
              const kept = r.draws.filter((d) => !d.rerolledAt).length
              return (
                <tr key={r.id} className={r.id === current ? 'is-selected' : ''} onClick={() => onPick(r.id)}>
                  <td>
                    <button type="button" className="rf-list-name" aria-current={r.id === current ? 'true' : undefined} onClick={(e) => (e.stopPropagation(), onPick(r.id))}>
                      <span className={`rf-list-kind is-${r.kind}`}>{KIND[r.kind]}</span>
                      {r.title}
                    </button>
                  </td>
                  <td className="adm-rf-dim">
                    {r.start} → {r.end}
                  </td>
                  <td>
                    <Pill tone={tone}>{r.status === 'locked' ? `${label} · ${kept}/${r.drawsTotal} drawn` : label}</Pill>
                  </td>
                  <td className="is-num">{usd(r.prizePool)}</td>
                  <td className="is-num">{r.players.toLocaleString('en-US')}</td>
                  <td className="is-num">{r.totalTickets.toLocaleString('en-US')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** Where the raffle is: 0 counting · 1 locked · 2 drawing · 4 complete (every step done) */
const stageOf = (r) => (r.status === 'open' ? 0 : r.status === 'complete' ? 4 : r.draws.length ? 2 : 1)
const STAGES = ['Count', 'Lock', 'Draw', 'Finish']

function RaffleDetail({ raffle, watch, reload, canEdit = true }) {
  const machine = useRef(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [playing, setPlaying] = useState(false)
  const [plate, setPlate] = useState(null)
  const [snapKey, setSnapKey] = useState(0)
  const [tab, setTab] = useState(raffle.status === 'open' ? 'entries' : 'draws')
  const r = raffle
  const kept = r.draws.filter((d) => !d.rerolledAt)
  const latest = [...r.draws].reverse().find((d) => !d.rerolledAt) ?? null
  const allDrawn = kept.length >= r.drawsTotal
  // the entrants' names on the balls, masked like the winner's name (this preview goes on stream)
  const balls = useMemo(() => pickBallNames(r.entries, r.id, (e) => maskName(e.name)), [r.entries, r.id])

  // the preview holds the latest winner (until a draw plays)
  useEffect(() => {
    const m = machine.current
    if (!ready || !m || playing) return
    if (latest) {
      m.setNumber(latest.playerNumber)
      m.setTicket(maskName(latest.name))
      setPlate(latest)
    } else {
      m.startDrumRotation()
      m.setTicket('')
      setPlate(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, latest?.n])

  const play = async (d) => {
    const m = machine.current
    if (!m || !d) return
    setPlaying(true)
    setPlate(null)
    try {
      // the draw plays out (DRAW press, mix, the winning ball drops); the name and number
      // land on the ball and the WINNER display at the reveal
      const run = m.triggerHandleAnimation()
      m.setNumber(d.playerNumber)
      m.setTicket(maskName(d.name))
      await run
      setPlate(d)
    } finally {
      setPlaying(false)
    }
  }

  const act = async (action, body, after) => {
    setBusy(action || 'settings')
    setErr('')
    setNote('')
    try {
      const res = await apiPost(`/api/admin/raffles/${r.id}${action ? `/${action}` : ''}`, body)
      if (res.warning) setNote(res.warning)
      if (res.draw) play(res.draw)
      after?.(res)
      reload()
      return res
    } catch (e) {
      setErr(e.message)
      return null
    } finally {
      setBusy('')
    }
  }

  const [tone, label] = STATUS[r.status]
  const stage = stageOf(r)
  const TABS = [
    ['draws', `Draws · ${kept.length}/${r.drawsTotal}`],
    ['entries', `Entries · ${r.players.toLocaleString('en-US')}`],
    ...(canEdit ? [['settings', 'Setup']] : []),
    ['snapshots', 'Snapshots'],
    ...(r.kind === 'watch' ? [['source', 'Chat source']] : []),
  ]

  return (
    <>
      <section className="adm-rf-head">
        <div className="adm-rf-head-top">
          <div className="adm-rf-head-text">
            <h2 className="adm-rf-title">{r.title}</h2>
            <p className="adm-rf-meta">
              {KIND[r.kind]} · {r.start} → {r.end} (UTC) · {r.kind === 'watch' ? `${r.ticketUnit} min` : usd(r.ticketUnit)} per ticket ·{' '}
              {r.numbering === 'joined' ? 'numbered by join order' : 'numbered by name'}
              {r.error && <span className="adm-rf-warn"> · {r.error}</span>}
            </p>
          </div>
          <Pill tone={tone}>{label}</Pill>
        </div>
        <div className="adm-rf-stats">
          <Stat label="Players" value={r.players.toLocaleString('en-US')} />
          <Stat label="Tickets" value={r.totalTickets.toLocaleString('en-US')} tone="blue" />
          <Stat label="Draws" value={`${kept.length} / ${r.drawsTotal}`} tone={allDrawn && r.status !== 'open' ? 'good' : undefined} />
          <Stat label="Prize pool" value={usd(r.prizePool)} tone="gold" />
        </div>
      </section>

      <div className="adm-rf-top">
        <Card className="adm-rf-machine-card">
          <div className="adm-rf-stage">
            <BubbleMachine ref={machine} onReady={() => setReady(true)} entries={r.players ?? r.entries.length} names={balls} />
            {plate && (
              <div className="adm-rf-plate" key={plate.n}>
                <span className="adm-rf-plate-kicker">{plate.slot ? `Draw #${plate.slot}` : 'Winner'} · player {pnum(plate.playerNumber)}</span>
                <span className="adm-rf-plate-name">{plate.name}</span>
              </div>
            )}
          </div>
        </Card>

        <Card title="Run the draw" className="adm-rf-run">
          <ol className="adm-rf-steps" aria-label="Raffle steps">
            {STAGES.map((s, i) => (
              <li key={s} className={i < stage ? 'is-done' : i === stage ? 'is-now' : ''} aria-current={i === stage ? 'step' : undefined}>
                <span className="adm-rf-step-n">{i < stage ? '✓' : i + 1}</span>
                {s}
              </li>
            ))}
          </ol>

          <p className="adm-rf-next">
            {r.status === 'open' &&
              (r.players ? 'Tickets are counting live. Lock when the period ends to freeze them and publish the seed fingerprint.' : 'Waiting for the first tickets.')}
            {r.status === 'locked' && !allDrawn && `Tickets are frozen. Draw prize #${kept.length + 1} of ${r.drawsTotal} on the machine.`}
            {r.status === 'locked' && allDrawn && 'Every prize is drawn. Finish to reveal the seed so anyone can check the draws.'}
            {r.status === 'complete' && 'Done: the seed is revealed and the result is public.'}
          </p>

          <div className="adm-row adm-rf-actions">
            {r.status === 'open' && (
              <>
                <ConfirmButton kind="primary" busy={busy === 'lock'} confirmLabel="Lock now? (freezes tickets)" onConfirm={() => act('lock')} disabled={!r.players}>
                  Lock &amp; publish seed
                </ConfirmButton>
                <Button busy={busy === 'snapshot'} onClick={() => act('snapshot', {}, () => setSnapKey((k) => k + 1))} disabled={!r.players}>
                  Save snapshot
                </Button>
                {canEdit && <Button onClick={() => setTab('settings')}>Change setup</Button>}
              </>
            )}
            {r.status === 'locked' && (
              <>
                {!allDrawn && (
                  <Button kind="primary" busy={busy === 'draw'} disabled={playing || !ready} onClick={() => act('draw')}>
                    {playing ? 'Drawing…' : `Draw #${kept.length + 1}`}
                  </Button>
                )}
                <ConfirmButton kind={allDrawn ? 'primary' : 'ghost'} busy={busy === 'finish'} confirmLabel="Finish & reveal the seed?" onConfirm={() => act('finish')}>
                  Finish &amp; reveal seed
                </ConfirmButton>
                {canEdit && !r.draws.length && (
                  <ConfirmButton kind="ghost" busy={busy === 'unlock'} onConfirm={() => act('unlock')}>
                    Unlock
                  </ConfirmButton>
                )}
              </>
            )}
            {latest && (
              <Button disabled={playing || !ready} onClick={() => play(latest)}>
                Replay last draw
              </Button>
            )}
          </div>
          <ErrorLine>{err}</ErrorLine>
          {note && <p className="adm-rf-note">{note}</p>}

          <details className="adm-rf-fair">
            <summary>Fairness</summary>
            <dl className="adm-rf-seed">
              <dt>Seed fingerprint (SHA-256)</dt>
              <dd>{r.seedHash ?? 'Made when the raffle locks.'}</dd>
              <dt>Seed</dt>
              <dd>{r.seed ?? (r.status === 'locked' ? 'Secret until the raffle is finished (not even admins see it).' : '—')}</dd>
            </dl>
          </details>

          {canEdit && (
            <div className="adm-rf-danger">
              <ConfirmButton busy={busy === 'delete'} confirmLabel="Delete this raffle for good?" onConfirm={() => act('delete')}>
                Delete raffle
              </ConfirmButton>
            </div>
          )}
        </Card>
      </div>

      <div className="adm-rf-subtabs">
        <div className="pl-seg" role="tablist" aria-label="Raffle details">
          {TABS.map(([id, text]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`pl-seg-item${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
              {text}
            </button>
          ))}
        </div>
      </div>

      {tab === 'draws' && <DrawsCard raffle={r} busy={busy} playing={playing} act={act} />}
      {tab === 'entries' && <EntriesCard raffle={r} />}
      {canEdit && tab === 'settings' && (
        <RaffleSetup
          key={`${r.id}:${r.status}`}
          mode="edit"
          raffle={r}
          locked={r.status !== 'open'}
          onSubmit={async (body) => {
            await apiPost(`/api/admin/raffles/${r.id}`, body)
            reload()
          }}
        />
      )}
      {tab === 'snapshots' && <Snapshots raffle={r} refreshKey={snapKey} onLock={(at) => act('lock', { snapshot: at })} />}
      {tab === 'source' && <WatchSource watch={watch} raffle={r} />}
    </>
  )
}

function DrawsCard({ raffle: r, busy, playing, act }) {
  return (
    <Card title="Draws">
      {r.draws.length === 0 ? (
        <Empty>{r.status === 'open' ? 'Lock the raffle to start drawing.' : 'No draws yet.'}</Empty>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>Prize</th>
              <th>Player</th>
              <th>Name</th>
              <th className="is-num">Ticket</th>
              <th className="is-num">Prize</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...r.draws].sort((a, b) => a.slot - b.slot || a.n - b.n).map((d) => (
              <tr key={d.n} className={d.rerolledAt ? 'is-rerolled' : ''}>
                <td>
                  #{d.slot}
                  {d.replaces !== undefined && <span className="adm-rf-dim"> (redraw)</span>}
                </td>
                <td className="adm-rf-mono">{pnum(d.playerNumber)}</td>
                <td>{d.name}</td>
                <td className="is-num adm-rf-dim">
                  {d.ticket.toLocaleString('en-US')} / {d.pool.toLocaleString('en-US')}
                </td>
                <td className="is-num">{usd(d.prize, 2)}</td>
                <td className="adm-rf-dim">{when(d.at)}</td>
                <td className="is-num">
                  {d.rerolledAt ? (
                    <Pill tone="off">Rerolled</Pill>
                  ) : (
                    r.status === 'locked' && (
                      <ConfirmButton busy={busy === 'reroll'} confirmLabel="Reroll this draw?" disabled={playing} onConfirm={() => act('reroll', { n: d.n })}>
                        Reroll
                      </ConfirmButton>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function WatchSource({ watch, raffle }) {
  return (
    <Card title="Watch-time source" actions={<Pill tone={watch?.live ? 'live' : 'off'}>{watch?.live ? 'Stream live' : 'Offline'}</Pill>}>
      <p className="adm-rf-text">
        Counted from <b>Kick chat</b>: a viewer earns {raffle.windowMinutes ?? 5} minutes for each {raffle.windowMinutes ?? 5}-minute window
        in which they chatted while the stream was live. Viewers who watch without chatting earn nothing, and bots are ignored. Real watch
        minutes need BotRix (it can be added as a source later).
      </p>
      <div className="adm-grid">
        <Stat label="Chatters today" value={(watch?.chattersToday ?? 0).toLocaleString('en-US')} />
        <Stat label="Last chat seen" value={watch?.lastChatAt ? when(watch.lastChatAt) : '—'} />
      </div>
    </Card>
  )
}

const PAGE = 50

function EntriesCard({ raffle }) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)
  const needle = q.trim().toLowerCase()
  const sorted = [...raffle.entries]
    .filter((e) => !needle || e.name.toLowerCase().includes(needle) || pnum(e.playerNumber).includes(needle.replace(/^#?/, '#')))
    .sort((a, b) => b.tickets - a.tickets || b.amount - a.amount)
  const rows = all ? sorted : sorted.slice(0, PAGE)
  return (
    <Card
      title={`Entries${raffle.status === 'open' ? ' (live)' : ' (frozen)'}`}
      actions={
        <span className="adm-rf-search">
          <Input value={q} onChange={setQ} placeholder="Search name or #number" />
        </span>
      }
    >
      {raffle.entries.length === 0 ? (
        <Empty>{raffle.status === 'open' ? 'Nobody has a ticket yet.' : 'No entries.'}</Empty>
      ) : (
        <>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Name</th>
                <th className="is-num">{raffle.kind === 'watch' ? 'Watched' : 'Wagered'}</th>
                <th className="is-num">Tickets</th>
                <th className="is-num">Odds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.name}>
                  <td className="adm-rf-mono">{pnum(e.playerNumber)}</td>
                  <td>{e.name}</td>
                  <td className="is-num">{amount(raffle, e.amount)}</td>
                  <td className="is-num">{e.tickets.toLocaleString('en-US')}</td>
                  <td className="is-num adm-rf-dim">{pct(e.odds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > PAGE && (
            <div className="adm-rf-more">
              <Button onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${sorted.length}`}</Button>
            </div>
          )}
          {raffle.status === 'open' && <p className="adm-rf-dim adm-rf-foot">Player numbers are provisional until the raffle locks.</p>}
        </>
      )}
    </Card>
  )
}

function Snapshots({ raffle, refreshKey, onLock }) {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [view, setView] = useState(null)
  useEffect(() => {
    let alive = true
    apiGet(`/api/admin/raffles/${raffle.id}/snapshots`).then(
      (d) => alive && setList(d.snapshots),
      (e) => alive && setErr(e.message),
    )
    return () => {
      alive = false
    }
  }, [raffle.id, raffle.status, refreshKey])
  const open = async (at) => {
    if (view?.at === at) return setView(null)
    try {
      setView((await apiGet(`/api/admin/raffles/${raffle.id}/snapshots/${at}`)).snapshot)
    } catch (e) {
      setErr(e.message)
    }
  }
  return (
    <Card title="Snapshots">
      <p className="adm-rf-text">Saved copies of the ticket list: hourly while open (kept 48 h, then one a day for 60 days), plus one at lock. If the live count is off at draw time, lock with a copy instead.</p>
      <ErrorLine>{err}</ErrorLine>
      {!list ? (
        <span className="adm-spin adm-spin-inline" aria-label="Loading" />
      ) : list.length === 0 ? (
        <Empty>No snapshots yet: the first is taken within the hour.</Empty>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>Saved</th>
              <th>Why</th>
              <th className="is-num">Players</th>
              <th className="is-num">Tickets</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.at}>
                <td>{when(s.at)}</td>
                <td className="adm-rf-dim">{s.reason}</td>
                <td className="is-num">{s.players.toLocaleString('en-US')}</td>
                <td className="is-num">{s.tickets.toLocaleString('en-US')}</td>
                <td className="is-num">
                  <span className="adm-rf-cell-actions">
                  <Button onClick={() => open(s.at)}>{view?.at === s.at ? 'Hide' : 'View'}</Button>
                  {raffle.status === 'open' && (
                    <ConfirmButton kind="ghost" confirmLabel="Lock with this copy?" onConfirm={() => onLock(s.at)}>
                      Lock with this
                    </ConfirmButton>
                  )}
                </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view && (
        <div className="adm-rf-snap">
          <p className="adm-rf-dim">
            {when(view.at)}: top {Math.min(15, view.entries.length)} of {view.players}
          </p>
          <table className="adm-table">
            <tbody>
              {[...view.entries]
                .sort((a, b) => b.tickets - a.tickets)
                .slice(0, 15)
                .map((e) => (
                  <tr key={e.name}>
                    <td>{e.name}</td>
                    <td className="is-num">{amount(raffle, e.amount)}</td>
                    <td className="is-num">{e.tickets.toLocaleString('en-US')} tickets</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
