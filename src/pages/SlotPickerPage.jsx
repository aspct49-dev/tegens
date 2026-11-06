import { useEffect, useMemo, useState } from 'react'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import SlotReel from '../components/SlotReel'
import { usePolled } from '../hooks/usePolled'
import { loadSlotCatalog } from '../slotCatalog'
import '../slot-picker-page.css'
import EmptyState from '../components/EmptyState'
import { CodeButton, WatchButton } from '../components/Buttons'

// /slot-picker: anyone can spin for a random slot. Spins happen in the browser (they
// never touch the stream's picker); the stream's latest pick (admin → Slot Picker)
// shows underneath.

const QUICK_PROVIDERS = 10
const REEL_MIN = 22
const REEL_MAX = 32

/** A fair random integer in [0, n) */
function rand(n) {
  const a = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / n) * n
  do crypto.getRandomValues(a)
  while (a[0] >= limit)
  return a[0] % n
}

/** The reel the spin plays: random slots from the pool, ending on the pick (same shape as the server's) */
function makeDraw(pool, pick) {
  const others = pool.filter((g) => g.key !== pick.key)
  const length = REEL_MIN + rand(REEL_MAX - REEL_MIN + 1)
  const reel = []
  for (let i = 0; i < length - 1; i++) {
    let g = others.length ? others[rand(others.length)] : pick
    if (others.length > 1) while (g.key === reel[reel.length - 1]?.key) g = others[rand(others.length)]
    reel.push(g)
  }
  reel.push(pick)
  return { id: `${Date.now()}-${rand(1e6)}`, slot: pick, reel }
}

export default function SlotPickerPage() {
  const [catalog, setCatalog] = useState(null)
  const [failed, setFailed] = useState(false)
  const [chosen, setChosen] = useState([])
  const [noRepeats, setNoRepeats] = useState(true)
  const [rolled, setRolled] = useState([]) // keys spun this visit
  const [draw, setDraw] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [picked, setPicked] = useState(null) // shown once the reel lands

  useEffect(() => {
    loadSlotCatalog().then(setCatalog, () => setFailed(true))
  }, [])

  const pool = useMemo(() => {
    if (!catalog) return []
    return chosen.length ? catalog.games.filter((g) => chosen.includes(g.providerId)) : catalog.games
  }, [catalog, chosen])

  // something to look at before the first spin
  useEffect(() => {
    if (pool.length && !draw) setDraw(makeDraw(pool, pool[rand(pool.length)]))
  }, [pool, draw])

  const spin = () => {
    if (!pool.length || spinning) return
    const fresh = noRepeats ? pool.filter((g) => !rolled.includes(g.key)) : pool
    const from = fresh.length ? fresh : pool
    const pick = from[rand(from.length)]
    setRolled((r) => [...r, pick.key])
    setPicked(null)
    setDraw(makeDraw(pool, pick))
    setSpinning(true)
  }

  const toggle = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="SLOT" bottom="PICKER">
        Can’t decide what to play? <b className="accent">Spin</b> for a random slot
        {' '}<br />
        from {catalog ? `${catalog.games.length.toLocaleString('en-US')}` : '9,500+'} games, or narrow it to your favourite providers.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <WatchButton />
        <CodeButton />
      </div>

      <section className="spk enter" style={{ '--d': '160ms' }} aria-label="Slot picker">
        {failed ? (
          <EmptyState compact>The slot list didn’t load. Refresh the page to try again.</EmptyState>
        ) : !catalog || !draw ? (
          <div className="spinner" role="status" aria-label="Loading slots" />
        ) : (
          <>
            <div className="spk-providers">
              <div className="spk-label">
                <span>Providers</span>
                <span className="spk-count">
                  {chosen.length ? `${chosen.length} chosen` : 'Any'} · {pool.length.toLocaleString('en-US')} slots
                </span>
              </div>
              <div className="spk-chips">
                <button type="button" aria-pressed={!chosen.length} className={`spk-chip${chosen.length ? '' : ' is-on'}`} onClick={() => setChosen([])}>
                  Any
                </button>
                {catalog.providers.slice(0, QUICK_PROVIDERS).map((p) => (
                  <button key={p.id} type="button" aria-pressed={chosen.includes(p.id)} className={`spk-chip${chosen.includes(p.id) ? ' is-on' : ''}`} onClick={() => toggle(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <SlotReel
              key={draw.id}
              draw={draw}
              play={spinning}
              idle={!spinning && !picked}
              onDone={() => {
                setSpinning(false)
                setPicked(draw.slot)
              }}
            />

            <div className="spk-foot">
              {picked ? (
                <div className="spk-pick" key={picked.key}>
                  <span className="spk-pick-kicker">You should play</span>
                  <span className="spk-pick-name">{picked.name}</span>
                  {picked.provider && <span className="spk-pick-prov">{picked.provider}</span>}
                </div>
              ) : (
                <p className="spk-hint">{spinning ? 'Spinning…' : 'Hit spin and let the reel decide.'}</p>
              )}
              <div className="spk-actions">
                <label className="spk-check">
                  <input type="checkbox" checked={noRepeats} onChange={(e) => setNoRepeats(e.target.checked)} />
                  No repeats
                </label>
                <button type="button" className="spk-spin" disabled={spinning || !pool.length} onClick={spin}>
                  {spinning ? 'Spinning…' : picked ? 'Spin again' : 'Spin'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <StreamPicks />
    </div>
  )
}

// ---------------------------------------------------------------- the stream's picks

function StreamPicks() {
  const { data } = usePolled('/api/events/slotpick', 10000)
  const recent = data?.recent ?? []
  if (!recent.length) return null
  const [latest, ...earlier] = recent
  return (
    <section className="spk-stream enter" style={{ '--d': '240ms' }} aria-label="Picked on stream">
      <h2 className="spk-stream-title section-title">Picked on stream</h2>
      <div className="spk-stream-row">
        <div className="spk-latest">
          {latest.image ? <img src={latest.image} width="60" height="80" alt="" /> : <span className="spk-noart" />}
          <span className="spk-latest-text">
            <span className="spk-pick-kicker">Latest pick</span>
            <span className="spk-latest-name">{latest.name}</span>
            {latest.provider && <span className="spk-pick-prov">{latest.provider}</span>}
          </span>
        </div>
        {earlier.length > 0 && (
          <ul className="spk-earlier" aria-label="Earlier picks">
            {earlier.map((s) => (
              <li key={s.id} title={s.name}>
                {s.image ? <img src={s.image} width="45" height="60" alt={s.name} loading="lazy" /> : <span className="spk-noart is-sm">{s.name}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
