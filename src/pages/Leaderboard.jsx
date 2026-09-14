import { config, raffle, rafflePool } from '../data/leaderboard'
import { fmtMoney, maskName } from '../utils'
import { useRaffle, useRafflePhase, opensAt, closesAt } from '../hooks/useRaffle'
import Countdown from '../components/Countdown'
import Podium from '../components/Podium'
import LeaderboardTable from '../components/LeaderboardTable'
import { IconExternal } from '../components/icons'

// The leaderboard section now runs the raffle: same podium cards and table,
// ranked on tickets instead of prize places. Winners are never drawn by the
// site — see `raffle` in src/data/leaderboard.js.

const PLACE = ['1st', '2nd', '3rd']
const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' }

const dateLabel = (d) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function Leaderboard() {
  const phase = useRafflePhase()
  const { loading, error, entrants, totalTickets, updatedAt } = useRaffle()
  const closed = phase === 'drawing' || phase === 'results'
  const top3 = entrants.slice(0, 3)

  // Published winners, joined to their final ticket counts where the feed has them.
  const results = raffle.winners.map((w, i) => ({
    place: i + 1,
    name: w.name,
    prize: raffle.prizes[i] || 0,
    tickets: entrants.find((e) => e.name === w.name)?.tickets ?? null,
  }))

  return (
    <section className="section" id="leaderboard">
      <div className="container">
        {/* HEADER */}
        <div className="lb-hero">
          <img className="lb-logo" src="/rainbet_logo.webp" alt="Rainbet" />
          <h1 className="lb-title">
            <span className="grad">{fmtMoney(rafflePool)}</span> <span className="white">Monthly</span><br />
            <span className="grad">Raffle</span>
          </h1>
          <p className="lb-sub">
            Every {fmtMoney(raffle.ticketCost)} wagered under code {config.referralCode} earns one
            ticket. More tickets, more chances to win!
          </p>
          <div className="lb-actions">
            <div className="code-chip">
              <span className="label">CODE:</span>
              <span className="code">{config.referralCode}</span>
            </div>
            <a className="btn btn-primary" href={config.casinoUrl} target="_blank" rel="noreferrer">
              Visit {config.casino} <IconExternal />
            </a>
          </div>
          <p className="raffle-window">{dateLabel(opensAt)} – {dateLabel(closesAt)} (UTC)</p>
        </div>

        {/* PRIZES */}
        <div className="raffle-prizes">
          {raffle.prizes.map((prize, i) => (
            <div className={`raffle-prize p${i + 1}`} key={i}>
              <span className="raffle-prize-place">{PLACE[i] || `${i + 1}th`} prize</span>
              <span className="raffle-prize-amt">{fmtMoney(prize)}</span>
            </div>
          ))}
        </div>

        {phase === 'upcoming' ? (
          <>
            <div className="lb-ends-lbl">Raffle starts in</div>
            <Countdown endDate={opensAt.toISOString()} endedText="The raffle is open — refresh to see tickets." />
          </>
        ) : loading ? (
          <div className="lb-status">Loading live tickets…</div>
        ) : (
          <>
            {/* Results replace the ticket podium once published: the biggest
                ticket holders aren't necessarily the winners. */}
            {phase === 'results' ? (
              <div className="raffle-results">
                <h2 className="raffle-results-title display">WINNERS</h2>
                <div className="raffle-results-grid">
                  {results.map((r) => (
                    <div className={`raffle-winner p${r.place}`} key={r.place}>
                      <span className={`rank-pill ${MEDAL[r.place] || ''}`}>{r.place}</span>
                      <div className="raffle-winner-name">{maskName(r.name)}</div>
                      <div className="raffle-winner-prize">{fmtMoney(r.prize)}</div>
                      {r.tickets != null && (
                        <div className="raffle-winner-tix">{r.tickets.toLocaleString('en-US')} tickets</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              top3.length > 0 && <Podium top3={top3} />
            )}

            {phase === 'open' && (
              <>
                <div className="lb-ends-lbl">Raffle ends in</div>
                <Countdown endDate={closesAt.toISOString()} endedText="The raffle has ended — drawing winners soon." />
              </>
            )}

            {phase === 'drawing' && (
              <div className="lb-paused">
                <span className="lb-paused-tag">Raffle ended</span>
                <h2 className="lb-paused-title display">DRAWING WINNERS</h2>
                <p className="lb-paused-sub">
                  Entries are closed and the winners are being drawn. Come back soon for the results!
                </p>
                <a className="btn btn-primary" href={config.socials.discord} target="_blank" rel="noreferrer">
                  Get notified in Discord
                </a>
              </div>
            )}

            <div style={{ height: 40 }} />

            {error ? (
              <div className="lb-status">Ticket standings are temporarily unavailable — check back shortly.</div>
            ) : entrants.length === 0 ? (
              <div className="lb-status">
                No tickets yet — the first {fmtMoney(raffle.ticketCost)} wagered under code {config.referralCode} earns one.
              </div>
            ) : (
              <LeaderboardTable rows={entrants} startRank={1} />
            )}
          </>
        )}

        <p className="section-sub" style={{ textAlign: 'center', marginTop: 22, fontSize: 13 }}>
          {closed ? 'Final ticket counts.' : `${totalTickets.toLocaleString('en-US')} tickets from ${entrants.length} players.`}{' '}
          Every ticket is one entry in the draw. Usernames are masked for privacy.
          {updatedAt && !closed && <> · Last updated {updatedAt} UTC</>}
        </p>
      </div>
    </section>
  )
}
