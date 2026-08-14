import { useEffect, useMemo, useState } from 'react'
import { config } from '../data/leaderboard'
import { providers, providerColor, fallbackSlots } from '../data/slots'
import SlotReel from '../components/SlotReel'
import { IconExternal } from '../components/icons'

// The catalogue is a static file rather than a bundled module: ~610 KB raw but
// only fetched when someone actually opens the picker.
function useCatalogue() {
  const [state, setState] = useState({ slots: [], loading: true, degraded: false })

  useEffect(() => {
    let cancelled = false
    fetch('/slots.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) return
        const clean = (Array.isArray(data) ? data : []).filter((s) => s?.name && s?.provider)
        if (!clean.length) throw new Error('empty catalogue')
        setState({ slots: clean, loading: false, degraded: false })
      })
      .catch(() => {
        if (!cancelled) setState({ slots: fallbackSlots, loading: false, degraded: true })
      })
    return () => { cancelled = true }
  }, [])

  return state
}

export default function Slots() {
  const { slots, loading, degraded } = useCatalogue()
  const [selected, setSelected] = useState([])   // empty = every provider
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)

  // Counts come from the catalogue itself, so a chip can never advertise games
  // the picker doesn't actually hold.
  const chips = useMemo(() => {
    const counts = new Map()
    for (const s of slots) counts.set(s.provider, (counts.get(s.provider) || 0) + 1)
    const listed = providers
      .filter((p) => counts.has(p.name))
      .map((p) => ({ ...p, count: counts.get(p.name) }))
    // Any provider in the file that isn't in the metadata list still gets a chip.
    const extra = [...counts.keys()]
      .filter((n) => !providers.some((p) => p.name === n))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ name: n, color: providerColor(n), count: counts.get(n) }))
    return [...listed, ...extra]
  }, [slots])

  const pool = useMemo(() => (
    selected.length ? slots.filter((s) => selected.includes(s.provider)) : slots
  ), [slots, selected])

  function toggle(name) {
    if (spinning) return
    setSelected((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]))
  }

  function spin() {
    if (spinning || !pool.length) return
    setResult(null)
    setSpinning(true)
  }

  return (
    <section className="section" id="slots">
      <div className="container">
        <div className="section-head">
          <h2 className="bonus-heading">SLOT PICKER</h2>
          <p className="bonus-heading-sub">
            Can’t decide what to play? Spin for a random slot — code <span>{config.referralCode}</span>
          </p>
        </div>

        <div className="slots-panel">
          <div className="slots-filters">
            <div className="slots-filters-head">
              <span className="slots-filters-lbl">Providers</span>
              <div className="slots-filter-btns">
                <button
                  className="slots-fbtn"
                  onClick={() => !spinning && setSelected(chips.map((c) => c.name))}
                  disabled={spinning}
                >Select all</button>
                <button
                  className="slots-fbtn"
                  onClick={() => !spinning && setSelected([])}
                  disabled={spinning}
                >Select none</button>
              </div>
            </div>

            <div className="slots-chips">
              {chips.map((p) => (
                <button
                  key={p.name}
                  className={`slots-chip ${selected.includes(p.name) ? 'on' : ''}`}
                  style={{ '--chip': p.color }}
                  onClick={() => toggle(p.name)}
                  disabled={spinning}
                >
                  <span className="dot" />
                  {p.name}
                  <span className="n">{p.count}</span>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="lb-status">Loading slots…</div>
          ) : (
            <SlotReel
              pool={pool}
              spinning={spinning}
              onLand={(slot) => { setResult(slot); setSpinning(false) }}
            />
          )}

          <div className="slots-actions">
            <button
              className="btn btn-primary slots-spin"
              onClick={spin}
              disabled={spinning || loading || !pool.length}
            >
              {spinning ? 'Spinning…' : result ? 'Spin again' : 'Pick my slot'}
            </button>
            <span className="slots-count">
              {pool.length.toLocaleString()} slot{pool.length === 1 ? '' : 's'} in the pool
              {selected.length > 0 && ` · ${selected.length} provider${selected.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {result && !spinning && (
            <div className="slots-result">
              {result.img && <img className="slots-result-art" src={result.img} alt="" />}
              <div className="slots-result-text">
                <div className="slots-result-lbl">Your slot</div>
                <div className="slots-result-name">{result.name}</div>
                <div className="slots-result-prov">
                  <span className="dot" style={{ '--chip': providerColor(result.provider) }} />
                  {result.provider}
                </div>
                <a
                  className="btn btn-primary"
                  href={result.url || config.casinoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Play on {config.casino} <IconExternal />
                </a>
              </div>
            </div>
          )}
        </div>

        {degraded && (
          <p className="section-sub" style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>
            Couldn’t load the full catalogue — showing a short offline list.
          </p>
        )}
      </div>
    </section>
  )
}
