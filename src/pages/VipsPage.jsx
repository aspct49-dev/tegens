import PageHeading, { PageBackdrop } from '../components/PageHeading'
import { config } from '../config'
import { usePolled } from '../hooks/usePolled'
import { fmtMoney } from '../utils'
import '../vips-page.css'
import EmptyState from '../components/EmptyState'
import { CodeButton, WatchButton } from '../components/Buttons'

// /vips: the VIP list and how their slot calls have paid. VIPs call slots in Kick
// chat with !call; the streamer plays them and records the result in admin → Slot
// Calls. Ranked by total won (server/features/vips.js, GET /api/events/vips).

const usd = (n) => fmtMoney(n, 2)
const multi = (w) => (w.bet ? `${(Math.round((w.win / w.bet) * 100) / 100).toLocaleString('en-US')}x` : null)
const monthYear = (s) => new Date(s * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

export default function VipsPage() {
  const { data, loaded, error, reload } = usePolled('/api/events/vips', 30000)
  const vips = data?.vips ?? []
  const totals = data?.totals

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="VIP" bottom="CALLS">
        Our VIPs call slots live on stream with <b className="accent">!call</b>.
        {' '}<br />
        Here’s how every call has paid.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <WatchButton />
        <CodeButton />
      </div>

      {totals && totals.vips > 0 && (
        <div className="vp-totals enter" style={{ '--d': '160ms' }}>
          <div className="vp-total">
            <span className="vp-total-value">{totals.vips}</span>
            <span className="vp-total-label">VIPs</span>
          </div>
          <div className="vp-total">
            <span className="vp-total-value">{totals.played.toLocaleString('en-US')}</span>
            <span className="vp-total-label">Calls played</span>
          </div>
          <div className="vp-total">
            <span className="vp-total-value is-gold">{usd(totals.won)}</span>
            <span className="vp-total-label">Won from calls</span>
          </div>
        </div>
      )}

      <section className="vp enter" style={{ '--d': '220ms' }} aria-label="VIPs">
        {!loaded ? (
          <div className="spinner" role="status" aria-label="Loading" />
        ) : error && !data ? (
          <EmptyState compact>
            The VIP list didn’t load. <button className="link-btn" onClick={reload}>Try again</button>
          </EmptyState>
        ) : vips.length === 0 ? (
          <EmptyState title="No VIPs yet" icon>
            Ask in the <a href={config.discordUrl} target="_blank" rel="noopener noreferrer">Discord</a> about VIP.
          </EmptyState>
        ) : (
          <ol className="vp-list">
            {vips.map((v, i) => (
              <li key={v.username} className={`vp-card${i === 0 && v.totalWon > 0 ? ' is-top' : ''}`}>
                <span className="vp-rank">{v.played ? i + 1 : '–'}</span>
                <div className="vp-who">
                  <a className="vp-name" href={`https://kick.com/${encodeURIComponent(v.username)}`} target="_blank" rel="noopener noreferrer">
                    {v.username}
                  </a>
                  <span className="vp-since">VIP since {monthYear(v.since)}</span>
                </div>
                <div className="vp-figs">
                  <div>
                    <span className="vp-fig-value is-gold">{usd(v.totalWon)}</span>
                    <span className="vp-fig-label">total won</span>
                  </div>
                  <div>
                    <span className="vp-fig-value">{v.played}</span>
                    <span className="vp-fig-label">{v.played === 1 ? 'call' : 'calls'}</span>
                  </div>
                </div>
                <div className="vp-best">
                  {v.best ? (
                    <>
                      {v.best.image ? <img src={v.best.image} width="42" height="56" alt="" loading="lazy" /> : <span className="vp-noart" />}
                      <span className="vp-best-text">
                        <span className="vp-best-label">Best call</span>
                        <span className="vp-best-slot">{v.best.slot}</span>
                        <span className="vp-best-win">
                          {usd(v.best.win)}
                          {multi(v.best) && <span> · {multi(v.best)}</span>}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="vp-best-none">No calls played yet</span>
                  )}
                </div>
                {v.recent.length > 1 && (
                  <ul className="vp-recent" aria-label={`${v.username}’s latest calls`}>
                    {v.recent.map((w, j) => (
                      <li key={j} title={`${w.slot.name}: ${usd(w.win)}`}>
                        {w.slot.image ? <img src={w.slot.image} width="27" height="36" alt={w.slot.name} loading="lazy" /> : <span className="vp-noart is-sm" />}
                        <span>{usd(w.win)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
