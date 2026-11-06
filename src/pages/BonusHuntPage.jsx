import { usePolled } from '../hooks/usePolled'
import { bonusMultiplier, huntMoney, huntStats, huntX } from '../../server/features/huntStats.js'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import '../bonus-hunt.css'
import EmptyState from '../components/EmptyState'
import { CodeButton, WatchButton } from '../components/Buttons'

// /bonus-hunt: the newest hunt from the stream, live. Built from the site's
// pieces (titled page, ms-row cards, leaderboard rows), 844px wide.

const STAGE = { collecting: 'Collecting bonuses', opening: 'Opening now', finished: 'Finished' }

export default function BonusHuntPage() {
  const { data, error, loaded, reload } = usePolled('/api/events/hunt', 5000)
  const hunt = data?.hunt ?? null

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="BONUS" bottom="HUNT">
        Follow every bonus from the stream as it&apos;s <b className="accent">opened</b>,
        {' '}<br />
        with live totals, break-even &amp; the biggest hits.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <WatchButton />
        <CodeButton />
      </div>

      <div className="bh">
        {!loaded ? (
          <div className="spinner" role="status" aria-label="Loading" />
        ) : error && !data ? (
          <p className="ms-hint bh-hint">
            The hunt is temporarily unavailable. <button className="link-btn" onClick={reload}>Retry</button>
          </p>
        ) : !hunt ? (
          <EmptyState title="No hunt running" icon delay={200}>
            Hunts are run live on stream. Catch the next one on Kick and follow it here bonus by bonus.
          </EmptyState>
        ) : (
          <HuntView hunt={hunt} />
        )}
      </div>
    </div>
  )
}

function HuntView({ hunt }) {
  const s = huntStats(hunt)
  const m = (v) => huntMoney(v, hunt.currency)
  const current = s.current >= 0 ? hunt.bonuses[s.current] : null

  return (
    <>
      <div className="bh-title-row enter" style={{ '--d': '180ms' }}>
        <h2 className="bh-title">
          {hunt.number ? <span className="accent">#{hunt.number} </span> : null}
          {hunt.name}
        </h2>
        <span className={`bh-chip is-${hunt.status}`}>
          {hunt.status === 'opening' && <span className="bh-chip-dot" aria-hidden="true" />}
          {STAGE[hunt.status]}
        </span>
      </div>

      <ul className="bh-stats enter" style={{ '--d': '240ms' }}>
        <Stat label="Start cost" value={m(hunt.startBalance)} sub={`${s.count} ${s.count === 1 ? 'bonus' : 'bonuses'} · ${m(s.totalBet)} in bets`} />
        <Stat label="Winnings" value={m(s.totalWon)} tone="blue" sub={`${s.opened} of ${s.count} opened`} />
        <Stat
          label="Profit / loss"
          value={s.opened ? `${s.profit >= 0 ? '+' : '−'}${m(Math.abs(s.profit))}` : '—'}
          tone={s.opened ? (s.profit >= 0 ? 'up' : 'down') : undefined}
          sub={s.totalX != null ? `${huntX(s.totalX)} overall` : 'Once bonuses open'}
        />
        <Stat
          label={s.opened ? 'Needed to break even' : 'Break-even'}
          value={huntX(s.opened ? s.liveBreakEven : s.breakEven)}
          sub={s.avgRequired != null ? `${m(s.avgRequired)} per bonus left` : hunt.status === 'finished' ? 'Hunt complete' : '—'}
        />
        <Stat label="Run average" value={huntX(s.average)} sub={s.currentAverage != null ? `${m(s.currentAverage)} per bonus` : 'Once bonuses open'} />
        <Stat label="Best win" value={s.bestWin ? m(s.bestWin.payout) : '—'} tone={s.bestWin ? 'gold' : undefined} sub={s.bestWin?.game ?? 'Biggest payout'} />
        <Stat
          label="Lucky win"
          value={s.luckyWin ? huntX(bonusMultiplier(s.luckyWin)) : '—'}
          tone={s.luckyWin ? 'gold' : undefined}
          sub={s.luckyWin?.game ?? 'Biggest multiplier'}
        />
        <Stat label="Bonuses left" value={String(s.remaining)} sub={hunt.status === 'collecting' ? 'Still collecting' : s.remaining ? 'To open' : 'All opened'} />
      </ul>

      {current && (
        <div className="ms-row bh-now enter" style={{ '--d': '300ms' }}>
          {current.image ? <img className="bh-now-art" src={current.image} width="45" height="60" alt="" /> : <span className="bh-art is-empty bh-now-art" />}
          <div className="bh-now-mid">
            <span className="bh-now-label">
              <span className="bh-chip-dot" aria-hidden="true" /> Opening now · bonus {s.current + 1} of {s.count}
            </span>
            <span className="bh-now-game">{current.game}</span>
            <span className="bh-now-meta">{[current.provider, `${m(current.bet)} bet`, current.badge].filter(Boolean).join(' · ')}</span>
          </div>
          {s.liveBreakEven != null && (
            <div className="bh-now-need">
              <span>Needs</span>
              <b>{huntX(s.liveBreakEven)}</b>
            </div>
          )}
        </div>
      )}

      {hunt.status === 'finished' && s.opened > 0 && (
        <p className={`bh-result enter${s.profit >= 0 ? ' is-up' : ''}`} style={{ '--d': '300ms' }}>
          Finished on <b>{m(s.totalWon)}</b>: {s.profit >= 0 ? 'a profit of' : 'down'} <b>{m(Math.abs(s.profit))}</b> ({huntX(s.totalX)})
        </p>
      )}

      <div className="bh-list-row">
        <h2 className="bh-list-title section-title">Bonuses</h2>
        <span className="bh-count">
          {s.opened}/{s.count} opened
        </span>
      </div>
      {hunt.bonuses.length === 0 ? (
        <EmptyState compact>Bonuses show here as they’re collected.</EmptyState>
      ) : (
        <>
          <div className="lb-head bh-head">
            <span>
              <span className="hash">#</span>
            </span>
            <span>Slot</span>
            <span className="bh-r">Bet</span>
            <span className="bh-r">Payout</span>
            <span className="bh-r">Multi</span>
          </div>
          <img className="lb-line bh-line" src="/assets/line-table.svg" width="803" height="0.5" alt="" />
          <ol className="lb-rows bh-rows">
            {hunt.bonuses.map((b, i) => {
              const x = bonusMultiplier(b)
              const now = i === s.current
              const lucky = s.luckyWin?.id === b.id
              const best = s.bestWin?.id === b.id
              return (
                <li key={b.id} className={`lb-row bh-row${now ? ' is-now' : ''}${lucky || best ? ' is-best' : ''}${b.payout == null && !now ? ' is-waiting' : ''}`}>
                  <span className="lb-place">{i + 1}</span>
                  <span className="bh-slot">
                    {b.image ? <img className="bh-art" src={b.image} width="30" height="40" alt="" loading="lazy" /> : <span className="bh-art is-empty" />}
                    <span className="bh-slot-text">
                      <span className="bh-game">
                        <span className="bh-game-name">{b.game}</span>
                        {b.badge && <span className="bh-tag">{b.badge}</span>}
                        {(best || lucky) && <span className="bh-tag is-gold">{best && lucky ? 'Best & lucky' : best ? 'Best win' : 'Lucky win'}</span>}
                      </span>
                      {(b.provider || b.note) && <span className="bh-provider">{[b.provider, b.note].filter(Boolean).join(' · ')}</span>}
                    </span>
                  </span>
                  <span className="bh-r bh-bet">{m(b.bet)}</span>
                  <span className={`bh-r bh-pay${b.payout == null ? ' is-none' : ''}`}>{now ? <span className="bh-now-tag">Now</span> : b.payout == null ? 'Waiting' : m(b.payout)}</span>
                  <span className={`bh-r bh-x${x == null ? ' is-none' : x >= 100 ? ' is-big' : ''}`}>{huntX(x)}</span>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </>
  )
}

function Stat({ label, value, sub, tone }) {
  return (
    <li className={`bh-stat${tone ? ` is-${tone}` : ''}`}>
      <span className="bh-stat-label">{label}</span>
      <span className="bh-stat-value">{value}</span>
      {sub && <span className="bh-stat-sub">{sub}</span>}
    </li>
  )
}
