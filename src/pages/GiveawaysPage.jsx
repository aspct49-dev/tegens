import { useEffect, useState } from 'react'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import VipBadge from '../components/VipBadge'
import { config } from '../config'
import { usePolled } from '../hooks/usePolled'
import '../giveaways-page.css'
import EmptyState from '../components/EmptyState'

// /giveaways: the giveaway wins the admin posts by hand (admin → Giveaway Wins,
// server/features/giveawayWins.js). The newest win gets its own winner card, with a
// plain sentence and the totals beside it; earlier wins are a list in the
// leaderboard table's row style, newest first.
// (The Kick-chat draw in ./features/giveaway.js still drives the stream overlay;
// it isn't shown here.)

const PAGE = 12

const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const longDate = (s) => new Date(s * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const shortDate = (s) => new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const iso = (s) => new Date(s * 1000).toISOString()

function ago(s) {
  const d = Math.max(0, Date.now() / 1000 - s)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)} min ago`
  if (d < 86400) {
    const h = Math.floor(d / 3600)
    return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  }
  if (d < 2 * 86400) return 'yesterday'
  if (d < 30 * 86400) return `${Math.floor(d / 86400)} days ago`
  return `on ${shortDate(s)}`
}

/** "worth $500" only when the prize text doesn't already say it ("$25" → no) */
function worth(w) {
  if (w.amount == null || w.amount <= 0) return null
  const said = Number(String(w.prize).replace(/[$,\s]/g, ''))
  return said === w.amount ? null : `worth ${usd(w.amount)}`
}

const KickIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" />
  </svg>
)
const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.8 19.8 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.5-5.1-.8-9.6-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"
    />
  </svg>
)
const GiftIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M20 7h-2.2A3 3 0 0 0 12 3.8 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h7V7h2v5h7a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1ZM9 7a1 1 0 1 1 1-1v1H9Zm6 0h-1V6a1 1 0 1 1 1 1ZM4 13v7a1 1 0 0 0 1 1h6v-8H4Zm9 8h6a1 1 0 0 0 1-1v-7h-7v8Z" />
  </svg>
)

const SOURCE = {
  kick: { label: 'Kick stream', Icon: KickIcon },
  discord: { label: 'Discord', Icon: DiscordIcon },
  other: { label: 'Giveaway', Icon: GiftIcon },
}

export default function GiveawaysPage() {
  const { data, loaded, error } = usePolled('/api/events/giveaway-wins', 60000)
  const [shown, setShown] = useState(PAGE)
  const wins = data?.wins ?? []
  const totals = data?.totals
  const [latest, ...rest] = wins

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="GIVEAWAY" bottom="WINNERS">
        Recent winners from <b className="accent">stream giveaways</b> and <b className="accent">Discord drops</b>.
        {' '}<br />
        Every prize handed out, listed here for everyone to see.
      </PageHeading>

      {totals?.givenAway > 0 && <GivenAway total={totals.givenAway} />}

      {!loaded ? (
        <div className="spinner" role="status" aria-label="Loading" />
      ) : !latest ? (
        <NoWinners failed={Boolean(error && !data)} />
      ) : (
        <>
          <Latest w={latest} totals={totals} />

          {rest.length > 0 && (
            <section className="gv-earlier enter" style={{ '--d': '280ms' }} aria-labelledby="gv-earlier-title">
              <h2 className="past-title" id="gv-earlier-title">
                <span className="grad-blue">EARLIER</span> <span className="grad-silver">WINNERS</span>
              </h2>
              <div className="gv-head" aria-hidden="true">
                <span>Date</span>
                <span>Winner</span>
                <span>Giveaway</span>
                <span>Prize</span>
              </div>
              <ol className="gv-rows">
                {rest.slice(0, shown).map((w) => (
                  <WinRow key={w.id} w={w} />
                ))}
              </ol>
              {rest.length > shown && (
                <button type="button" className="gv-more-btn" onClick={() => setShown((n) => n + PAGE)}>
                  Show {Math.min(PAGE, rest.length - shown)} more
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- total given away

/** Counts up from 0 to `to` once (≈1.4 s, eased); straight to the number with reduced motion */
function useCountUp(to) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(to)
      return undefined
    }
    let raf
    const t0 = performance.now()
    const from = 0
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 1400)
      setN(from + (to - from) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return n
}

/** The running total: the admin's starting amount + every posted win's value (server/features/giveawayWins.js) */
function GivenAway({ total }) {
  const n = useCountUp(total)
  const shown = `$${Math.round(n).toLocaleString('en-US')}`
  return (
    <section className="gv-given enter" style={{ '--d': '120ms' }} aria-labelledby="gv-given-title">
      <div className="gv-given-copy">
        <h2 className="gv-given-title" id="gv-given-title">
          <span className="grad-silver">TOTAL $</span>
          <span className="grad-blue">GIVEN AWAY</span>
        </h2>
        <p className="gv-given-sub">
          To players under code <b>{config.referralCode.toUpperCase()}</b>, and it grows with every giveaway and completed challenge.
        </p>
        <a className="gv-given-cta" href={config.casinoUrl} target="_blank" rel="noopener noreferrer">
          Sign up on Rainbet
        </a>
      </div>
      <div className="gv-given-panel">
        <p className="gv-given-amount">
          <span aria-hidden="true">{shown}</span>
          <span className="gv-sr">${Math.round(total).toLocaleString('en-US')}</span>
        </p>
        <p className="gv-given-caption">From giveaways, leaderboards, raffles, milestones and more</p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- the latest win

/** A letter avatar: the winner's initial on one of a few muted tones (same name, same tone) */
function Initial({ name }) {
  let h = 0
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span className={`gv-initial tone-${h % 5}`} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/** The newest win's own card. The top-right corner is the blue flag from the TGN logo
    (holding where it was won); the winner in a gold ring; the prize in a solid gold-lined section. */
function WinnerCard({ w }) {
  const src = SOURCE[w.source] ?? SOURCE.other
  return (
    <article className="gv-wcard" aria-label={`${w.winner} won ${w.prize}`}>
      <span className="gv-wcard-flag" title={src.label}>
        <src.Icon />
      </span>
      <div className="gv-wcard-top">
        <p className="gv-wcard-when">
          Won{' '}
          <time dateTime={iso(w.at)} title={longDate(w.at)}>
            {ago(w.at)}
          </time>
        </p>
        <Initial name={w.winner} />
        <p className="gv-wcard-name" title={w.winner}>
          {w.winner}
          <VipBadge name={w.winner} size="md" />
        </p>
        <p className="gv-wcard-src">{src.label}</p>
      </div>
      <div className="gv-wcard-prize">
        <span className="gv-wcard-label">Prize</span>
        <strong className={w.prize.length > 8 ? 'is-long' : ''} title={w.prize}>
          {w.prize}
        </strong>
        {w.note && <span className="gv-wcard-note">{w.note}</span>}
      </div>
    </article>
  )
}

function Latest({ w, totals }) {
  const src = SOURCE[w.source]
  const extra = worth(w)
  const where = [w.note, src?.label].filter(Boolean)
  return (
    <section className="gv-latest enter" style={{ '--d': '160ms' }} aria-labelledby="gv-latest-title">
      <WinnerCard w={w} />

      <div className="gv-side">
        <h2 className="past-title" id="gv-latest-title">
          <span className="grad-blue">LATEST</span> <span className="grad-silver">WINNER</span>
        </h2>
        <p className="gv-lead">
          <b>{w.winner}</b> won <b className="is-prize">{w.prize}</b>
          {extra ? ` (${extra})` : ''}.
        </p>
        <dl className="gv-facts">
          {where.length > 0 && (
            <div>
              <dt>Giveaway</dt>
              <dd>
                {src && (
                  <span className={`gv-src is-${w.source}`}>
                    <src.Icon />
                  </span>
                )}
                {where.join(', ')}
              </dd>
            </div>
          )}
          <div>
            <dt>Date</dt>
            <dd>
              <time dateTime={iso(w.at)}>{longDate(w.at)}</time>
            </dd>
          </div>
        </dl>
        {totals && (
          <ul className="gv-totals" aria-label="All giveaways so far">
            <li>
              <span>{totals.count === 1 ? 'Prize won' : 'Prizes won'}</span>
              <b>{totals.count.toLocaleString('en-US')}</b>
            </li>
            <li>
              <span>{totals.winners === 1 ? 'Winner' : 'Winners'}</span>
              <b>{totals.winners.toLocaleString('en-US')}</b>
            </li>
          </ul>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- one earlier win: a leaderboard-style row

function WinRow({ w }) {
  const src = SOURCE[w.source]
  const extra = worth(w)
  return (
    <li className="gv-row">
      <time className="gv-row-date" dateTime={iso(w.at)} title={longDate(w.at)}>
        {shortDate(w.at)}
      </time>
      <span className="gv-row-user">
        <img src="/assets/avatar-row.png" width="30" height="30" alt="" loading="lazy" />
        <span title={w.winner}>{w.winner}</span>
        <VipBadge name={w.winner} />
      </span>
      <span className="gv-row-where">
        {src && (
          <span className={`gv-src is-${w.source}`} title={src.label}>
            <src.Icon />
          </span>
        )}
        <span>{w.note || src?.label || 'Giveaway'}</span>
      </span>
      <span className="gv-row-prize" title={extra ? `${w.prize}, ${extra}` : w.prize}>
        {w.prize}
      </span>
    </li>
  )
}

// ---------------------------------------------------------------- nothing yet

function NoWinners({ failed }) {
  return (
    <EmptyState
      className="gv-empty"
      titleAs="h2"
      delay={160}
      icon={<img className="empty-state-icon" src="/assets/bonuses/gift.svg" width="40" height="44" alt="" />}
      title={failed ? 'Couldn’t load the winners' : 'No winners posted yet'}
      actions={
        !failed && (
          <>
            <a className="gv-cta" href={config.kickUrl} target="_blank" rel="noopener noreferrer">
              <KickIcon /> Watch on Kick
            </a>
            <a className="gv-cta is-ghost" href={config.discordUrl} target="_blank" rel="noopener noreferrer">
              <DiscordIcon /> Join the Discord
            </a>
          </>
        )
      }
    >
      {failed
        ? 'Something went wrong on our side. Try again in a moment.'
        : 'Giveaways run live on stream and in the Discord. Winners show up here as soon as they’re posted.'}
    </EmptyState>
  )
}
