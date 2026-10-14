import { useRef, useState } from 'react'
import { config } from '../config'
import { pad } from '../utils'
import { copyText } from '../hooks/useToast'

export default function Hero({ countdown, onToast }) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef()
  const { days, hours, mins, secs, ended } = countdown
  const code = config.referralCode

  const copyCode = () => {
    copyText(code).then(
      () => {
        clearTimeout(copiedTimer.current)
        setCopied(true)
        copiedTimer.current = setTimeout(() => setCopied(false), 1200)
        onToast(
          <>
            Code <span className="accent">{code}</span> copied to clipboard
          </>,
        )
      },
      () => onToast(`Couldn't copy — the code is ${code}`),
    )
  }

  return (
    <section className="hero">
      <div className="hero-deco crown" aria-hidden="true">
        <img src="/assets/crown.png" alt="" />
      </div>
      <div className="hero-deco platinum" aria-hidden="true">
        <img src="/assets/platinum.png" alt="" />
      </div>

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
        <button className={`code-btn${copied ? ' is-copied' : ''}`} onClick={copyCode} aria-label={`Copy code ${code}`}>
          <span>
            <span className="muted">Code:</span> <span className="accent">{code}</span>
          </span>
          <img src="/assets/icon-copy.svg" width="17.9059" height="18" alt="" />
        </button>
        <a className="visit-btn" href={config.casinoUrl} target="_blank" rel="noopener noreferrer">
          <span>Visit</span>
          <span className="rainbet-logo" role="img" aria-label={config.casino} />
        </a>
      </div>
    </section>
  )
}
