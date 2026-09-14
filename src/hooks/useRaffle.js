import { useEffect, useState } from 'react'
import { raffle } from '../data/leaderboard'

// Whole tickets only: $199 of wagering is one ticket, $200 is two.
export const ticketsFor = (wagered) => Math.max(0, Math.floor(wagered / raffle.ticketCost))

// Ranks on tickets, then wager, then name — so equal ticket counts never
// swap places between refreshes.
const byTickets = (a, b) =>
  b.tickets - a.tickets || b.wagered - a.wagered || a.name.localeCompare(b.name)

/**
 * Live ticket standings for the configured raffle window, via the same
 * same-origin /api/affiliates proxy as the leaderboard.
 * Returns { loading, error, entrants, totalTickets, updatedAt }.
 *
 * Unlike the leaderboard there is no sample-data fallback: made-up entrants in
 * a raffle would read as real ticket holders, so a failed fetch shows as
 * "unavailable" instead.
 */
export function useRaffle() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    entrants: [],
    totalTickets: 0,
    updatedAt: null,
  })

  useEffect(() => {
    let cancelled = false
    const url = `/api/affiliates?start_at=${raffle.startAt}&end_at=${raffle.endAt}`

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const entrants = (data.affiliates || [])
          .map((a) => {
            const wagered = parseFloat(a.wagered_amount) || 0
            return { name: a.username, wagered, tickets: ticketsFor(wagered) }
          })
          // No ticket, no entry — listing someone who can't win is misleading.
          .filter((e) => e.name && e.tickets > 0)
          .sort(byTickets)
        const totalTickets = entrants.reduce((sum, e) => sum + e.tickets, 0)
        setState({ loading: false, error: null, entrants, totalTickets, updatedAt: data.cache_updated_at || null })
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }))
      })

    return () => { cancelled = true }
  }, [])

  return state
}

// Window edges in UTC: entries open at the start of `startAt` and close at the
// last second of `endAt`.
export const opensAt = new Date(`${raffle.startAt}T00:00:00Z`)
export const closesAt = new Date(`${raffle.endAt}T23:59:59Z`)

function currentPhase() {
  if (raffle.winners.length) return 'results'
  const now = Date.now()
  if (now < opensAt.getTime()) return 'upcoming'
  if (now > closesAt.getTime()) return 'drawing'
  return 'open'
}

/**
 * 'upcoming' | 'open' | 'drawing' | 'results'. Published winners decide it
 * outright; otherwise the clock does, re-checked every few seconds so an open
 * tab flips to "drawing winners" at close without a refresh.
 */
export function useRafflePhase() {
  const [phase, setPhase] = useState(currentPhase)
  useEffect(() => {
    const id = setInterval(() => setPhase(currentPhase()), 5000)
    return () => clearInterval(id)
  }, [])
  return phase
}
