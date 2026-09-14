import { useEffect, useState } from 'react'
import { config, raffle, rafflePool } from '../data/leaderboard'
import { fmtMoney, maskName } from '../utils'
import { useRaffle } from '../hooks/useRaffle'
import Countdown from '../components/Countdown'
import { IconExternal } from '../components/icons'

const PLACE = ['1st', '2nd', '3rd']
const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' }

// Window edges in UTC: entries open at the start of `startAt` and close at the
// last second of `endAt`.
const opensAt = new Date(`${raffle.startAt}T00:00:00Z`)
const closesAt = new Date(`${raffle.endAt}T23:59:59Z`)

const fmtInt = (n) => Number(n).toLocaleString('en-US')

function share(tickets, total) {
  if (!total) return '—'
  const pct = (tickets / total) * 100
  if (pct >= 10) return `${pct.toFixed(0)}%`
  if (pct >= 1) return `${pct.toFixed(1)}%`
  return '<1%'
}

// Which state the page is in. Results win outright once published; otherwise
// it's decided by the clock, re-checked every few seconds so an open tab flips
// to "drawing winners" at close without a refresh.
function usePhase() {
  const compute = () => {
    if (raffle.winners.length) return 'results'
    const now = Date.now()
    if (now < opensAt.getTime()) return 'upcoming'
    if (now > closesAt.getTime()) return 'drawing'
    return 'open'
  }
  const [phase, setPhase] = useState(compute)
  useEffect(() => {
    const id = setInterval(() => setPhase(compute()), 5000)
    return () => clearInterval(id)
  }, [])
  return phase
}

function dateLabel(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function Raffle() {
  const phase = usePhase()
  const { loading, error, entrants, totalTickets, updatedAt } = useRaffle()
  const closed = phase === 'drawing' || phase === 'results'

  // Published winners, joined to their final ticket counts where the feed has them.
  const results = raffle.winners.map((w, i) => ({
    place: i + 1,
    name: w.name,
    prize: raffle.prizes[i] || 0,
    tickets: entrants.find((e) => e.name === w.name)?.tickets ?? null,
  }))

  return (
    <section className="section" id="raffle">
      <div className="container">
        {/* HEADER */}
        <div className="lb-hero">
          <img className="lb-logo" src="/rainbet_logo.webp" alt="Rainbet" />
          <h1 className="lb-title">
            <span className="grad">{fmtMoney(rafflePool)}</span> <span className="white">Raffle</span>
          </h1>
          <p className="lb-sub">
            Every <strong>{fmtMoney(raffle.ticketCost)}</strong> wagered on {config.casino} under
            code {config.referralCode} earns one ticket. More tickets, more chances to win.
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
          <p className="raffle-window">
            {dateLabel(opensAt)} – {dateLabel(closesAt)} (UTC)
          </p>
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

        {/* STATE */}
        {phase === 'upcoming' && (
          <>
            <div className="lb-ends-lbl">Raffle opens in</div>
            <Countdown endDate={opensAt.toISOString()} endedText="The raffle is open — refresh to see tickets." />
          </>
        )}

        {phase === 'open' && (
          <>
            <div className="lb-ends-lbl">Entries close in</div>
            <Countdown
              endDate={closesAt.toISOString()}
              endedText="Entries are closed — drawing winners soon."
            />
          </>
        )}

        {phase === 'drawing' && (
          <div className="lb-paused">
            <span className="lb-paused-tag">Entries closed</span>
            <h2 className="lb-paused-title display">DRAWING WINNERS</h2>
            <p className="lb-paused-sub">
              The raffle has ended and the winners are being drawn. Come back soon for the results.
            </p>
            <a className="btn btn-primary" href={config.socials.discord} target="_blank" rel="noreferrer">
              Get notified in Discord
            </a>
          </div>
        )}

        {phase === 'results' && (
          <div className="raffle-results">
            <h2 className="raffle-results-title display">WINNERS</h2>
            <div className="raffle-results-grid">
              {results.map((r) => (
                <div className={`raffle-winner p${r.place}`} key={r.place}>
                  <span className={`rank-pill ${MEDAL[r.place] || ''}`}>{r.place}</span>
                  <div className="raffle-winner-name">{maskName(r.name)}</div>
                  <div className="raffle-winner-prize">{fmtMoney(r.prize)}</div>
                  {r.tickets != null && (
                    <div className="raffle-winner-tix">{fmtInt(r.tickets)} tickets</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STATS */}
        {phase !== 'upcoming' && (
          <div className="stats raffle-stats">
            <div className="stat-card">
              <div className="k">{closed ? 'Final tickets' : 'Total tickets'}</div>
              <div className="v grad">{loading || error ? '—' : fmtInt(totalTickets)}</div>
            </div>
            <div className="stat-card">
              <div className="k">Entrants</div>
              <div className="v">{loading || error ? '—' : fmtInt(entrants.length)}</div>
            </div>
            <div className="stat-card">
              <div className="k">1 ticket per</div>
              <div className="v">{fmtMoney(raffle.ticketCost)}</div>
            </div>
          </div>
        )}

        {/* STANDINGS */}
        {phase !== 'upcoming' && (
          <>
            <h3 className="raffle-table-head">{closed ? 'Final ticket counts' : 'Ticket standings'}</h3>
            {loading ? (
              <div className="lb-status">Loading tickets…</div>
            ) : error ? (
              <div className="lb-status">Ticket standings are temporarily unavailable — check back shortly.</div>
            ) : entrants.length === 0 ? (
              <div className="lb-status">
                No tickets yet — the first {fmtMoney(raffle.ticketCost)} wagered under code {config.referralCode} earns one.
              </div>
            ) : (
              <div className="lb-table-wrap">
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>Rank</th>
                      <th>User</th>
                      <th className="right">Wagered</th>
                      <th className="right">Tickets</th>
                      <th className="right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entrants.map((e, i) => (
                      <tr key={e.name}>
                        {/* Plain numbers, no medals: ticket rank isn't a prize place, and a
                            gold badge on a top holder who didn't win would read as a contradiction. */}
                        <td><span className="rank-pill">{i + 1}</span></td>
                        <td><div className="user-cell">{maskName(e.name)}</div></td>
                        <td className="right">
                          <span className="wager-val"><span className="cur">$</span>{fmtMoney(e.wagered, 2).slice(1)}</span>
                        </td>
                        <td className="right"><span className="reward-val">{fmtInt(e.tickets)}</span></td>
                        <td className="right"><span className="raffle-share">{share(e.tickets, totalTickets)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <p className="section-sub" style={{ textAlign: 'center', marginTop: 22, fontSize: 13 }}>
          Every ticket is one entry into the draw. Share is each player’s portion of all tickets.
          Usernames are masked for privacy.
          {updatedAt && !closed && <> · Last updated {updatedAt} UTC</>}
        </p>
      </div>
    </section>
  )
}
