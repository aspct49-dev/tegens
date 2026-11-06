import { useEffect, useMemo, useRef, useState } from 'react'
import { usePolled } from '../hooks/usePolled'
import BubbleMachine, { pickBallNames } from '../components/BubbleMachine'
import { Figure, Foot, Pill, Plate, PlateHead, money } from './kit'
import './RaffleOverlay.css'

// /overlay/raffle (wager) and /overlay/raffle?kind=watch: the TGN bubble raffle machine on
// the kit's panel, with the raffle's title, pool and draw progress. The balls carry the
// entrants' names; the machine holds the latest winner. When a new draw is made (admin →
// Raffles → Draw), DRAW is pressed, the balls mix, the winner's ball drops onto the cradle
// with their name on the WINNER display, and a gold-edged card reveals it.

const pnum = (n) => `#${String(n ?? 0).padStart(4, '0')}`
const latestWin = (draws) => [...draws].reverse().find((d) => !d.rerolled) ?? null

export default function RaffleOverlay({ params }) {
  const kind = params?.get('kind') === 'watch' ? 'watch' : 'wager'
  const { data } = usePolled(`/api/raffles?kind=${kind}`, 2500)
  const raffle = data?.raffle ?? null
  const machine = useRef(null)
  const [ready, setReady] = useState(false)
  const [plate, setPlate] = useState(null) // the revealed winner
  const [rolling, setRolling] = useState(false)
  const [tick, setTick] = useState(0)
  const seen = useRef(null) // `${id}:${draws}` already on the drums
  const busy = useRef(false)
  const latest = useRef(raffle)
  latest.current = raffle

  const count = raffle?.draws.length ?? 0
  const balls = useMemo(() => (raffle ? pickBallNames(raffle.entries, raffle.id, (e) => e.name) : []), [raffle?.entries, raffle?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = machine.current
    if (!ready || !m || !raffle || busy.current) return
    const key = `${raffle.id}:${count}`
    const prev = seen.current
    if (prev === key) return
    seen.current = key
    const win = latestWin(raffle.draws)
    const fresh = prev?.startsWith(`${raffle.id}:`) && Number(prev.split(':')[1]) < count
    if (!fresh) {
      // first look (or another raffle): show where things stand, no animation
      if (win) {
        m.setNumber(win.playerNumber)
        m.setTicket(win.name)
      } else {
        m.startDrumRotation()
        m.setTicket('')
      }
      setPlate(win)
      return
    }
    if (!win) return
    busy.current = true
    setRolling(true)
    setPlate(null)
    ;(async () => {
      try {
        const run = m.triggerHandleAnimation()
        m.setNumber(win.playerNumber)
        m.setTicket(win.name)
        await run
        setPlate(win)
      } finally {
        busy.current = false
        setRolling(false)
        // a draw that landed meanwhile plays next
        const now = latest.current
        if (now && `${now.id}:${now.draws.length}` !== seen.current) setTick((t) => t + 1)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, raffle?.id, count, tick])

  if (!raffle) return null
  const kept = raffle.draws.filter((d) => !d.rerolled)
  const filled = new Set(kept.map((d) => d.slot)).size
  const next = raffle.status === 'locked' && filled < raffle.drawsTotal ? filled + 1 : null
  const status =
    raffle.status === 'open' ? <Pill tone="live">Counting</Pill> : raffle.status === 'locked' ? <Pill tone="live">{rolling ? 'Drawing…' : 'Live draw'}</Pill> : <Pill>Drawn</Pill>

  return (
    <Plate width={460} className="ov-rf">
      <PlateHead kicker={kind === 'watch' ? 'TGN · Watch-time raffle' : 'TGN · Wager raffle'} title={raffle.title} right={status} />

      <div className={`ov-rf-stage${rolling ? ' is-rolling' : ''}`}>
        <BubbleMachine ref={machine} onReady={() => setReady(true)} entries={raffle.players ?? raffle.entries.length} names={balls} inspect={false} />
        {plate && (
          <div className="ov-rf-plate" key={`${raffle.id}:${plate.n}`}>
            <span className="ov-rf-plate-kicker">
              {plate.slot ? `Draw #${plate.slot}` : 'Winner'} · Player {pnum(plate.playerNumber)}
            </span>
            <span className="ov-rf-plate-name">{plate.name}</span>
            <span className="ov-rf-plate-prize">{money(plate.prize, 'USD', 0)}</span>
          </div>
        )}
      </div>

      <div className="ov-figs">
        <Figure label="Prize pool" value={money(raffle.prizePool, 'USD', 0)} />
        <Figure label="Tickets" value={raffle.totalTickets.toLocaleString('en-US')} tone={raffle.status === 'open' ? 'blue' : undefined} />
        <Figure label="Players" value={(raffle.players ?? raffle.entries.length).toLocaleString('en-US')} />
      </div>

      <div className="ov-rf-progress" aria-label={`${filled} of ${raffle.drawsTotal} drawn`}>
        {Array.from({ length: Math.min(raffle.drawsTotal, 20) }, (_, i) => (
          <span key={i} className={`ov-rf-pip${i < filled ? ' is-won' : i + 1 === next ? ' is-next' : ''}`} />
        ))}
      </div>

      <Foot>
        <span>
          Draw <b>{Math.min(next ?? filled, raffle.drawsTotal)}</b> of <b>{raffle.drawsTotal}</b> · {money(raffle.prizePerDraw, 'USD', 0)} each
        </span>
        <span>{raffle.seedHash ? `Seed ${raffle.seedHash.slice(0, 8)}…` : 'Provably fair'}</span>
      </Foot>
    </Plate>
  )
}
