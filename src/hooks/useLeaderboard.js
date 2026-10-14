import { useEffect, useState } from 'react'
import { config, getPeriod } from '../config'

const REFRESH_MS = 60_000

// Sort by wager (desc), cap to the number of prize slots, attach prizes.
function rank(players) {
  return [...players]
    .sort((a, b) => b.wagered - a.wagered)
    .slice(0, config.prizes.length)
    .map((p, i) => ({ ...p, prize: config.prizes[i] || 0 }))
}

/**
 * Fetches the live Rainbet leaderboard via the same-origin /api proxy (the API
 * key is injected server-side). Re-polls every minute.
 * Returns { loading, error, players, updatedAt }. On failure the last good
 * standings are kept; the page renders empty prize slots otherwise.
 */
export function useLeaderboard() {
  const [state, setState] = useState({ loading: true, error: null, players: [], updatedAt: null })

  useEffect(() => {
    let cancelled = false
    const { startAt, endAt } = getPeriod()
    const url = `/api/affiliates?start_at=${startAt}&end_at=${endAt}`

    const load = () =>
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((data) => {
          if (cancelled) return
          const players = rank(
            (data.affiliates || []).map((a) => ({
              name: a.username || '',
              wagered: parseFloat(a.wagered_amount) || 0,
            })),
          )
          setState({ loading: false, error: null, players, updatedAt: data.cache_updated_at || null })
        })
        .catch((err) => {
          if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }))
        })

    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return state
}
