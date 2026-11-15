import { useEffect, useMemo, useState } from 'react'
import { config } from '../config'
import { fmtMoney } from '../utils'
import './promo-overlay.css'

// /overlay/promo: an OBS browser source that rotates small promo cards (the leaderboard,
// milestones, referrals, the wager store, and the raffle while one is running), each ending
// on "USE CODE: TEGENS". The card's panel stays put and only its content changes, so the
// switch is seamless: the old slide lifts out while the new one rises in, staggered.
// Figures come from src/config.js (and the live raffle), so the cards follow the site.
//
//   ?seconds=7                 how long each card shows (3–60, default 7)
//   ?only=leaderboard,raffle   just these cards, in this order
//   ?scale=1.25                (every overlay) bigger or smaller
//
// Card ids: leaderboard, raffle, milestones, referral, store, site

const code = config.referralCode.toUpperCase()
const topMilestone = Math.max(...config.milestones.tiers.map((t) => t.prize))
const usdcTop = (config.storeItems ?? []).filter((i) => i.store === 'wager').reduce((m, i) => Math.max(m, Number(String(i.artTop ?? '').replace(/[$,]/g, '')) || 0), 0)

/** Every card the overlay can show. stack: logo / big / small / code. split: logo + two lines | code */
function cards(raffle) {
  const list = [
    { id: 'leaderboard', layout: 'stack', big: fmtMoney(config.prizePool), tone: 'gold', small: 'Monthly leaderboard' },
    raffle && { id: 'raffle', layout: 'stack', big: fmtMoney(raffle.prizePool), tone: 'gold', small: 'Monthly raffle' },
    { id: 'milestones', layout: 'split', lines: ['Milestone', 'rewards'], tone: 'blue', note: `Up to ${fmtMoney(topMilestone)}` },
    { id: 'referral', layout: 'stack', big: fmtMoney(config.referral.reward), tone: 'gold', small: 'Refer a high roller' },
    { id: 'store', layout: 'split', lines: ['Wager', 'store'], tone: 'blue', note: usdcTop ? `USDC up to ${fmtMoney(usdcTop)}` : 'USDC prizes' },
    { id: 'site', layout: 'split', lines: ['Tegens', '.bet'], tone: 'blue', note: 'Rewards, raffles & more' },
  ]
  return list.filter(Boolean)
}

/** The wager raffle while it's running (open or being drawn), else null; checked every 2 minutes */
function useLiveRaffle() {
  const [raffle, setRaffle] = useState(null)
  useEffect(() => {
    let live = true
    const load = () =>
      fetch('/api/raffles?kind=wager', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const r = d?.raffle
          if (live) setRaffle(r && r.status !== 'complete' && r.prizePool > 0 ? { prizePool: r.prizePool } : null)
        })
        .catch(() => {})
    load()
    const t = setInterval(load, 120_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  return raffle
}

function Code() {
  return (
    <span className="pr-code">
      <span className="pr-code-label">Use code:</span>
      <span className="pr-code-pill">{code}</span>
    </span>
  )
}

function Logo() {
  return <img className="pr-logo" src="/assets/td/rainbet-wordmark.png" width="206" height="70" alt={config.casino} />
}

function Slide({ card, state }) {
  if (card.layout === 'split') {
    return (
      <div className={`pr-slide is-split is-${state}`}>
        <div className="pr-split-main">
          <Logo />
          <span className={`pr-lines is-${card.tone}`}>
            {card.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </span>
        </div>
        <div className="pr-split-side">
          {card.note && <span className="pr-note">{card.note}</span>}
          <Code />
        </div>
      </div>
    )
  }
  return (
    <div className={`pr-slide is-stack is-${state}`}>
      <Logo />
      <span className={`pr-big is-${card.tone}`}>{card.big}</span>
      <span className="pr-small">{card.small}</span>
      <Code />
    </div>
  )
}

export default function PromoOverlay({ params }) {
  const raffle = useLiveRaffle()
  const seconds = Math.min(60, Math.max(3, Number(params.get('seconds')) || 7))
  const only = (params.get('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const deck = useMemo(() => {
    const all = cards(raffle)
    if (!only.length) return all
    return only.map((id) => all.find((c) => c.id === id)).filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raffle, only.join(',')])

  const [at, setAt] = useState({ i: 0, prev: null })
  useEffect(() => {
    if (deck.length < 2) return undefined
    const t = setInterval(() => setAt((s) => ({ i: (s.i + 1) % deck.length, prev: s.i % deck.length })), seconds * 1000)
    return () => clearInterval(t)
  }, [deck.length, seconds])

  if (!deck.length) return null
  const cur = deck[at.i % deck.length]
  const prev = at.prev != null ? deck[at.prev % deck.length] : null
  return (
    <div className="pr-card">
      {prev && prev !== cur && <Slide key={`out-${prev.id}-${at.i}`} card={prev} state="out" />}
      <Slide key={`in-${cur.id}-${at.i}`} card={cur} state="in" />
    </div>
  )
}
