import { config } from '../config'
import { pad } from '../utils'
import { CodeButton, VisitButton } from './Buttons'

export default function Hero({ countdown }) {
  const { days, hours, mins, secs, ended } = countdown

  return (
    <section className="hero">

      <h1 className="hero-title enter" style={{ '--d': '0ms' }}>
        <span className="hero-sub">
          <span className="grad-blue">{`$${config.prizePool.toLocaleString('en-US')}`}</span>{' '}
          <span className="grad-silver">MONTHLY {config.casino.toUpperCase()}</span>
        </span>
        <span className="hero-main">LEADERBOARD</span>
      </h1>

      {ended ? (
        <p className="hero-timer enter" style={{ '--d': '80ms' }}>LEADERBOARD ENDED — WINNERS ARE BEING PAID OUT</p>
      ) : (
        <p className="hero-timer enter" style={{ '--d': '80ms' }} aria-live="off">
          {[
            [days, 'DAYS'],
            [hours, 'HOURS'],
            [mins, 'MINUTES'],
            [secs, 'SECONDS'],
          ].map(([n, l]) => (
            <span key={l}>
              <b>{pad(n)}</b> {l}
            </span>
          ))}
        </p>
      )}

      <div className="hero-actions enter" style={{ '--d': '160ms' }}>
        <CodeButton />
        <VisitButton />
      </div>
    </section>
  )
}
