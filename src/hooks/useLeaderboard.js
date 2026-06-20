import { useEffect, useState } from 'react'
import { config, fallbackPlayers } from '../data/leaderboard'

// Assign a prize to each player by rank, sort by wager (desc), and cap to the
// number of prize slots so we only ever show ranked, paid positions.
function rank(players) {
  return [...players]
    .sort((a, b) => b.wagered - a.wagered)
    .slice(0, config.prizes.length)
    .map((p, i) => ({ ...p, prize: config.prizes[i] || 0 }))
}

/**
 * Fetches the live Rainbet leaderboard via the same-origin /api proxy.
 * Returns { loading, error, players, updatedAt }. On failure it falls back to
 * sample data so the page still renders.
 */
export function useLeaderboard() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    players: [],
    updatedAt: null,
  })

  useEffect(() => {
    let cancelled = false
    const { startAt, endAt } = config.leaderboard
    const url = `/api/affiliates?start_at=${startAt}&end_at=${endAt}`

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const players = rank(
          (data.affiliates || []).map((a) => ({
            name: a.username,
            wagered: parseFloat(a.wagered_amount) || 0,
          })),
        )
        setState({ loading: false, error: null, players, updatedAt: data.cache_updated_at || null })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          loading: false,
          error: err.message,
          players: rank(fallbackPlayers),
          updatedAt: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
