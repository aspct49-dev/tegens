import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { usePolled } from '../hooks/usePolled'
import { currencySymbol, huntMoney, huntX } from '../../server/features/huntStats.js'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import '../guess-page.css'
import EmptyState from '../components/EmptyState'
import { CodeButton, WatchButton } from '../components/Buttons'

// /guess-the-balance: the current round. Guesses come from Kick chat
// (!guess <amount>); signed-in viewers can also guess here. Other people's
// guesses stay hidden until the draw, then the winner and top 10 show.

const STAGE = {
  open: { chip: 'Taking guesses', text: 'Guess where the hunt finishes. You can change your guess until they lock.' },
  closed: { chip: 'Guesses locked', text: 'The bonuses are being opened. The winner is drawn on the final balance.' },
  drawn: { chip: 'Winner drawn', text: 'This round is settled. A new one opens with the next hunt on stream.' },
}

const HOW = [
  { n: '1', title: 'Watch the hunt', text: 'A round opens with every bonus hunt live on Kick.' },
  { n: '2', title: 'Type your guess', text: <>Type <code className="gp-code">!guess 12,500</code> in chat, or sign in and guess here.</> },
  { n: '3', title: 'Closest wins', text: 'Nearest to the final balance takes the prize. Ties go to the earlier guess.' },
]

export default function GuessPage() {
  const { data, error, loaded, reload } = usePolled('/api/events/guess', 5000)
  const round = data?.round ?? null

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="GUESS THE" bottom="BALANCE">
        Guess where the bonus hunt <b className="accent">finishes</b>.
        {' '}<br />
        The closest guess to the final balance wins the prize.
      </PageHeading>

      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <WatchButton />
        <CodeButton />
      </div>

      <ol className="gp-how">
        {HOW.map((h, i) => (
          <li key={h.n} className="gp-how-card enter" style={{ '--d': `${160 + i * 60}ms` }}>
            <span className="gp-how-n">{h.n}</span>
            <span className="gp-how-title">{h.title}</span>
            <span className="gp-how-text">{h.text}</span>
          </li>
        ))}
      </ol>

      <div className="gp">
        {!loaded ? (
          <div className="spinner" role="status" aria-label="Loading" />
        ) : error && !data ? (
          <p className="ms-hint gp-hint">
            Guess the Balance is temporarily unavailable. <button className="link-btn" onClick={reload}>Retry</button>
          </p>
        ) : !round ? (
          <EmptyState title="No round open right now" icon delay={340}>
            A round opens with every bonus hunt on stream. Catch the next one live on Kick.
          </EmptyState>
        ) : (
          <RoundView round={round} onGuessed={reload} />
        )}
      </div>
    </div>
  )
}

function RoundView({ round, onGuessed }) {
  const hunt = round.hunt
  const m = (v) => huntMoney(v, hunt?.currency)
  const stage = STAGE[round.status]
  const drawn = round.status === 'drawn' && round.finalBalance != null

  return (
    <>
      <div className="ms-row gp-bar enter" style={{ '--d': '340ms' }}>
        <span className="gp-bar-icon" aria-hidden="true">
          ?
        </span>
        <div className="gp-bar-mid">
          <span className="gp-bar-title">
            {round.name}
            {round.prize && (
              <>
                {' '}· <span className="gp-gold">{round.prize}</span> prize
              </>
            )}
          </span>
          <span className="gp-bar-text">{stage.text}</span>
        </div>
        <span className={`gp-chip is-${round.status}`}>
          {round.status === 'open' && <span className="gp-dot" aria-hidden="true" />}
          {stage.chip}
        </span>
      </div>

      <ul className="gp-stats enter" style={{ '--d': '380ms' }}>
        <Stat label="Start cost" value={hunt ? m(hunt.startBalance) : '—'} />
        <Stat label="Bonuses" value={hunt ? (hunt.opened ? `${hunt.opened}/${hunt.count} opened` : String(hunt.count)) : '—'} />
        <Stat label={hunt?.opened ? 'Paid so far' : 'Break-even'} value={hunt ? (hunt.opened ? m(hunt.totalWon) : huntX(hunt.breakEven)) : '—'} />
        <Stat label="Guesses" value={round.count.toLocaleString('en-US')} />
      </ul>

      {drawn ? <Result round={round} money={m} /> : <GuessCard round={round} money={m} onGuessed={onGuessed} />}
    </>
  )
}

function Stat({ label, value }) {
  return (
    <li className="gp-stat">
      <span className="gp-stat-label">{label}</span>
      <span className="gp-stat-value">{value}</span>
    </li>
  )
}

function GuessCard({ round, money, onGuessed }) {
  const { status, user, signInWithKick } = useAuth()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const open = round.status === 'open'
  const mine = round.mine

  const submit = async (e) => {
    e.preventDefault()
    if (!value.trim()) return setError('Enter your guess, e.g. 12,500 or 12.5k.')
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/events/guess', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save your guess.')
      setValue('')
      setSaved(true)
      onGuessed()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="gp-play enter" style={{ '--d': '420ms' }} aria-labelledby="gp-play-title">
      <div className="gp-play-main">
        <h2 id="gp-play-title" className="gp-play-title">
          {open ? 'Your guess' : 'Guesses are locked'}
        </h2>
        {mine ? (
          <p className="gp-mine">
            You guessed <b>{money(mine.value)}</b>
            {mine.via === 'chat' ? ' in chat' : ''}
            {open ? '. A new guess replaces it.' : '. Good luck!'}
            {saved && <span className="gp-saved"> Saved</span>}
          </p>
        ) : (
          <p className="gp-mine">
            {open ? 'One guess per Kick account. Your latest one counts.' : 'Wait for the draw: the winner shows here when the hunt finishes.'}
          </p>
        )}

        {open &&
          (status === 'loading' ? null : user ? (
            <form className="gp-form" onSubmit={submit} noValidate>
              <span className="gp-input">
                <span className="gp-input-unit">{currencySymbol(round.hunt?.currency)}</span>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="12,500"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label="Your guess for the final balance"
                />
              </span>
              <button className="ms-btn is-claim gp-submit" type="submit" disabled={busy}>
                {busy ? 'Saving…' : mine ? 'Change guess' : 'Guess'}
              </button>
            </form>
          ) : (
            <div className="gp-signin">
              <button className="gp-kick" onClick={() => signInWithKick()}>
                <img src="/assets/icon-kick.svg" width="16" height="16" alt="" /> Sign in with Kick to guess here
              </button>
              <span className="gp-or">or type it in chat on stream</span>
            </div>
          ))}
        {error && (
          <p className="gp-error" role="alert">
            {error}
          </p>
        )}
        {user && !user.kick && open && <p className="gp-note">Link Kick to share one guess between chat and the site.</p>}
      </div>
      <div className="gp-chat" aria-hidden="true">
        <span className="gp-chat-label">In Kick chat</span>
        <span className="gp-chat-line">
          <span className="gp-chat-user">you:</span> !guess 12,500
        </span>
        <span className="gp-chat-hint">12500 · 12,500 · $12.5k all work</span>
      </div>
    </section>
  )
}

function Result({ round, money }) {
  const w = round.winner
  const mine = round.mine
  return (
    <>
      <section className="gp-result enter" style={{ '--d': '420ms' }}>
        <div className="gp-final">
          <span className="gp-final-label">Final balance</span>
          <span className="gp-final-value">{money(round.finalBalance)}</span>
        </div>
        {w ? (
          <div className="gp-winner">
            <span className="gp-winner-label">Winner</span>
            <span className="gp-winner-name">{w.username}</span>
            <span className="gp-winner-figs">
              guessed {money(w.value)} · {w.offBy === 0 ? 'spot on' : `off by ${money(w.offBy)}`}
              {round.prize && <> · wins {round.prize}</>}
            </span>
          </div>
        ) : (
          <div className="gp-winner is-none">
            <span className="gp-winner-name">No guesses</span>
          </div>
        )}
      </section>
      {mine?.place != null && (
        <p className="gp-yours">
          You guessed <b>{money(mine.value)}</b> and finished <b>#{mine.place}</b> of {round.count}.
        </p>
      )}

      {round.top.length > 0 && (
        <>
          <h2 className="gp-list-title section-title">Top {round.top.length}</h2>
          <div className="lb-head gp-head">
            <span className="lb-h-place">
              <span className="hash">#</span>Place
            </span>
            <span className="lb-h-user">
              <img src="/assets/icon-user.svg" width="12.8335" height="14" alt="" />
              User
            </span>
            <span className="gp-r">Guess</span>
            <span className="gp-r">Off by</span>
          </div>
          <img className="lb-line gp-line" src="/assets/line-table.svg" width="803" height="0.5" alt="" />
          <ol className="lb-rows">
            {round.top.map((g) => (
              <li key={g.place} className={`lb-row gp-row${g.place === 1 ? ' is-first' : ''}`}>
                <span className="lb-place">#{g.place}</span>
                <span className="lb-user">
                  <span>{g.username}</span>
                </span>
                <span className="gp-r lb-wager">{money(g.value)}</span>
                <span className="gp-r gp-off">{g.offBy === 0 ? 'Exact' : money(g.offBy)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  )
}
