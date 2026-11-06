import { useEffect, useRef, useState } from 'react'
import { usePolled } from '../hooks/usePolled'
import { bonusMultiplier, huntMoney, huntStats, huntX } from '../../server/features/huntStats.js'
import { Figure, Pill, Plate, PlateHead, SlotArt, Well } from './kit'
import './hunt-overlay.css'

// /overlay/hunt: the newest bonus hunt. The ledger (start cost → winnings) on
// top, the bonus being opened in its own card, best + lucky win in gold,
// and the bonus list in the inset window: while opening it glides to keep the
// current bonus in view; otherwise a long list rolls slowly on a loop.
// Options: ?rows=6 (rows in the window), ?scale=1.25

const ROW = 40 // .hov-row height + gap (hunt-overlay.css)
const STAGE = { collecting: ['steel', 'Collecting'], opening: ['live', 'Opening'], finished: ['gold', 'Finished'] }

/** A number that glides to its new value instead of jumping */
function useTween(target, ms = 900) {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (target == null || !Number.isFinite(target)) return setValue(target)
    const start = performance.now()
    const a = Number.isFinite(from.current) ? from.current : 0
    let raf = 0
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms)
      const v = a + (target - a) * (1 - (1 - k) ** 3)
      from.current = v
      setValue(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

/** Bonus ids whose payout just came in (for a short flash) */
function useFreshPayouts(bonuses) {
  const seen = useRef(null)
  const [fresh, setFresh] = useState(() => new Set())
  useEffect(() => {
    const now = new Map((bonuses ?? []).map((b) => [b.id, b.payout]))
    const before = seen.current
    seen.current = now
    if (!before) return undefined
    const landed = [...now].filter(([id, p]) => p != null && before.has(id) && before.get(id) == null).map(([id]) => id)
    if (!landed.length) return undefined
    setFresh((s) => new Set([...s, ...landed]))
    // not cleared by the next poll (which may come sooner), or the flash would stick
    setTimeout(() => setFresh((s) => new Set([...s].filter((id) => !landed.includes(id)))), 2200)
    return undefined
  }, [bonuses])
  return fresh
}

export default function HuntOverlay({ params }) {
  const { data } = usePolled('/api/events/hunt', 2500)
  const hunt = data?.hunt
  if (!hunt) return null
  return <HuntPlate hunt={hunt} rows={Math.min(12, Math.max(3, Number(params?.get('rows')) || 6))} />
}

function HuntPlate({ hunt, rows }) {
  const s = huntStats(hunt)
  const m = (v) => huntMoney(v, hunt.currency)
  const won = useTween(s.totalWon)
  const fresh = useFreshPayouts(hunt.bonuses)
  const current = s.current >= 0 ? hunt.bonuses[s.current] : null
  const [tone, label] = STAGE[hunt.status] ?? STAGE.collecting
  const up = s.opened > 0 && s.profit >= 0

  return (
    <Plate width={440} className="hov">
      <PlateHead kicker={`Bonus hunt${hunt.number ? ` #${hunt.number}` : ''}`} title={hunt.name} right={<Pill tone={tone}>{label}</Pill>} />

      <div className="hov-ledger">
        <div className="hov-ledger-cell">
          <span className="hov-ledger-label">Start cost</span>
          <span className="hov-ledger-value">{m(hunt.startBalance)}</span>
        </div>
        <span className="hov-ledger-arrow" aria-hidden="true" />
        <div className="hov-ledger-cell is-won">
          <span className="hov-ledger-label">Winnings</span>
          <span className="hov-ledger-value">{m(won)}</span>
          {s.opened > 0 && (
            <span className={`hov-pl${up ? ' is-up' : ' is-down'}`}>
              {up ? '+' : '−'}
              {m(Math.abs(s.profit))}
            </span>
          )}
        </div>
      </div>

      <div className="ov-figs">
        <Figure label="Bonuses" value={s.opened ? `${s.opened}/${s.count}` : s.count} />
        <Figure label={hunt.status === 'collecting' ? 'Break-even' : 'Req. avg'} value={huntX(s.opened ? s.liveBreakEven : s.breakEven)} tone="blue" />
        <Figure label="Run avg" value={huntX(s.average)} />
      </div>

      {current && <OpeningNow key={current.id} bonus={current} n={s.current + 1} total={s.count} money={m} needed={s.liveBreakEven} />}

      {(s.bestWin || s.luckyWin) && (
        <div className="hov-wins">
          <WinTile label="Best win" bonus={s.bestWin} big={s.bestWin && m(s.bestWin.payout)} small={s.bestWin && huntX(bonusMultiplier(s.bestWin))} />
          <WinTile label="Lucky win" bonus={s.luckyWin} big={s.luckyWin && huntX(bonusMultiplier(s.luckyWin))} small={s.luckyWin && m(s.luckyWin.payout)} />
        </div>
      )}

      {hunt.bonuses.length > 0 && <BonusWindow hunt={hunt} stats={s} rows={rows} fresh={fresh} money={m} />}
    </Plate>
  )
}

function OpeningNow({ bonus, n, total, money, needed }) {
  return (
    <div className="hov-now">
      <SlotArt src={bonus.image} size={52} />
      <div className="hov-now-text">
        <span className="hov-now-label">
          <span className="ov-dot" /> Opening now · {n} of {total}
        </span>
        <span className="hov-now-game">{bonus.game}</span>
        <span className="hov-now-meta">
          {money(bonus.bet)} bet{bonus.badge ? ` · ${bonus.badge}` : ''}
          {bonus.provider ? ` · ${bonus.provider}` : ''}
        </span>
      </div>
      {needed != null && (
        <div className="hov-now-need">
          <span>Needs</span>
          <b>{huntX(needed, needed >= 100 ? 0 : 1)}</b>
        </div>
      )}
    </div>
  )
}

function WinTile({ label, bonus, big, small }) {
  return (
    <div className="hov-win">
      <SlotArt src={bonus?.image} size={34} />
      <div className="hov-win-text">
        <span className="hov-win-label">{label}</span>
        <span className="hov-win-game">{bonus?.game ?? '—'}</span>
      </div>
      <div className="hov-win-figs">
        <b>{big ?? '—'}</b>
        <span>{small}</span>
      </div>
    </div>
  )
}

function BonusWindow({ hunt, stats, rows, fresh, money }) {
  const list = hunt.bonuses
  const n = list.length
  const follow = stats.current >= 0
  const roll = !follow && n > rows
  const shown = Math.min(rows, n)
  // while opening: keep the current bonus second from the top (or as low as the list allows)
  const offset = follow ? Math.max(0, Math.min(stats.current - 1, n - shown)) : 0
  const items = roll ? [...list, ...list] : list

  return (
    <Well className={`hov-window${roll ? ' is-rolling' : ''}${follow && n > shown ? ' is-following' : ''}`}>
      <div className="hov-row is-head" aria-hidden="true">
        <span>#</span>
        <span />
        <span>Slot</span>
        <span className="hov-r">Bet</span>
        <span className="hov-r">Result</span>
      </div>
      <div className="hov-viewport" style={{ height: shown * ROW - 4 }}>
        <ol
          key={roll ? `roll-${n}` : 'still'}
          className="hov-list"
          style={
            roll
              ? { '--roll-distance': `-${n * ROW}px`, '--roll-duration': `${n * 2.8}s` }
              : { transform: `translateY(-${offset * ROW}px)` }
          }
        >
          {items.map((b, i) => {
            const idx = i % n
            const x = bonusMultiplier(b)
            const now = idx === stats.current
            const cls = [
              'hov-row',
              now && 'is-now',
              b.payout == null && !now && 'is-waiting',
              stats.luckyWin?.id === b.id && 'is-lucky',
              fresh.has(b.id) && (x != null && x >= 100 ? 'is-flash-gold' : 'is-flash'),
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <li key={`${b.id}-${i}`} className={cls} aria-hidden={i >= n || undefined}>
                <span className="hov-n">{idx + 1}</span>
                <SlotArt src={b.image} size={30} />
                <span className="hov-game">
                  <span className="hov-game-name">{b.game}</span>
                  {b.badge && <span className="hov-badge">{b.badge}</span>}
                </span>
                <span className="hov-bet">{money(b.bet)}</span>
                <span className="hov-result">
                  {now ? (
                    <span className="hov-now-tag">Now</span>
                  ) : b.payout == null ? (
                    <span className="hov-dash">—</span>
                  ) : (
                    <>
                      <b className={x >= 100 ? 'is-gold' : ''}>{money(b.payout)}</b>
                      <span>{huntX(x, x >= 100 ? 0 : 2)}</span>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </Well>
  )
}
