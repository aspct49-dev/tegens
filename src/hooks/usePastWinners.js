import { useEffect, useState } from 'react'

/**
 * Fetches archived leaderboard winners from /api/winners (written server-side
 * by snapshot-winners.mjs). Returns only finalized periods that have winners.
 * Fails soft to an empty list so the page still renders.
 */
export function usePastWinners() {
  const [state, setState] = useState({ loading: true, periods: [] })

  useEffect(() => {
    let cancelled = false
    fetch('/api/winners')
      .then((res) => (res.ok ? res.json() : { periods: [] }))
      .then((data) => {
        if (cancelled) return
        const periods = (data.periods || []).filter((p) => p.final && p.winners?.length)
        setState({ loading: false, periods })
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, periods: [] })
      })
    return () => { cancelled = true }
  }, [])

  return state
}
