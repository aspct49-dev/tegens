import { useState } from 'react'
import { championOf, currentMatch, decidedCount, fmtMult, roundLabel, roundsIn } from '../bracket'
import Bracket from '../components/Bracket'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import { usePolled } from '../hooks/usePolled'
import '../tournaments.css'
import EmptyState from '../components/EmptyState'
import { CodeButton, WatchButton } from '../components/Buttons'

// /tournaments: the slot battles played on stream. Built from the titled-page
// pieces (heading, 844px column, ms-row panels) with the shared bracket.
// The live tournament shows first; past ones are a tab away.

const STATUS = { live: 'Live', complete: 'Complete' }

export default function TournamentsPage() {
  const { data, error, loaded, reload } = usePolled('/api/events/tournaments', 10_000)
  const [picked, setPicked] = useState(null)
  const list = data?.tournaments ?? []
  const t = list.find((x) => x.id === picked) ?? data?.current ?? list[0] ?? null

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="SLOT" bottom="TOURNAMENTS">
        Head-to-head slot battles, played live on stream.
        {' '}<br />
        The <b className="accent">highest multiplier</b> goes through to the next round.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <WatchButton />
        <CodeButton />
      </div>

      <div className="tn">
        {!loaded && <div className="spinner" role="status" aria-label="Loading" />}
        {loaded && error && !data && (
          <p className="ms-hint">
            Tournaments are temporarily unavailable. <button className="link-btn" onClick={reload}>Retry</button>
          </p>
        )}
        {data && !t && (
          <EmptyState title="No tournament right now" icon delay={200}>
            Brackets are drawn live on stream. The next one shows here as soon as it starts.
          </EmptyState>
        )}
        {t && (
          <>
            {list.length > 1 && (
              <div className="tn-tabs enter" role="tablist" aria-label="Tournaments" style={{ '--d': '160ms' }}>
                {list.slice(0, 8).map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="tab"
                    aria-selected={x.id === t.id}
                    className={`tn-tab${x.id === t.id ? ' is-on' : ''}`}
                    onClick={() => setPicked(x.id)}
                  >
                    {x.status === 'live' && <span className="tn-dot" aria-hidden="true" />}
                    {x.name}
                  </button>
                ))}
              </div>
            )}
            <TournamentView t={t} />
          </>
        )}
      </div>
    </div>
  )
}

function TournamentView({ t }) {
  const rounds = roundsIn(t.matches)
  const champion = championOf(t.matches)
  const next = currentMatch(t.matches)

  return (
    <>
      <div className="tn-title enter" style={{ '--d': '200ms' }}>
        <h2 className="tn-name">{t.name}</h2>
        <span className={`tn-chip is-${t.status}`}>
          {t.status === 'live' && <span className="tn-dot" aria-hidden="true" />}
          {STATUS[t.status]}
        </span>
      </div>

      <ul className="tn-stats enter" style={{ '--d': '240ms' }}>
        <li className="tn-stat">
          <span className="tn-stat-label">Prize</span>
          <span className="tn-stat-value accent">{t.prize || '—'}</span>
          <span className="tn-stat-sub">{t.size} players · single elimination</span>
        </li>
        <li className="tn-stat">
          <span className="tn-stat-label">{champion ? 'Played' : 'Stage'}</span>
          <span className="tn-stat-value">{champion ? `${t.matches.length} matches` : next ? roundLabel(next.round, rounds) : 'Starting soon'}</span>
          <span className="tn-stat-sub">
            {decidedCount(t.matches)} of {t.matches.length} matches decided
          </span>
        </li>
        <li className={`tn-stat${champion ? ' is-champ' : ''}`}>
          <span className="tn-stat-label">Champion</span>
          <span className="tn-stat-value">{champion ? champion.name : 'To be decided'}</span>
          <span className="tn-stat-sub">{champion ? champion.slot || 'Winner of the final' : 'Winner of the final'}</span>
        </li>
      </ul>

      {next && !champion && (
        <div className="ms-row tn-next enter" style={{ '--d': '280ms' }}>
          <span className="tn-next-badge" aria-hidden="true">VS</span>
          <div className="ms-mid">
            <p className="ms-line">
              <span className="ms-reach">
                {next.player1.name} <span className="tn-v">v</span> {next.player2.name}
              </span>
              <span className="ms-wager">
                {[next.player1.slot, next.player2.slot].filter(Boolean).join(' · ') || 'Slots to be picked'}
              </span>
              <span className="ms-prize">
                {next.mult1 !== null || next.mult2 !== null ? (
                  <>
                    <b>{fmtMult(next.mult1)}</b> – <b>{fmtMult(next.mult2)}</b>
                  </>
                ) : (
                  roundLabel(next.round, rounds)
                )}
              </span>
            </p>
          </div>
          <span className="tn-next-tag">Up next</span>
        </div>
      )}

      <section className="tn-board enter" style={{ '--d': '320ms' }} aria-label="Bracket">
        <Bracket matches={t.matches} />
      </section>
    </>
  )
}
