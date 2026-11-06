import { useEffect, useRef, useState } from 'react'

// Fetch `url` now and every `ms` while the tab is visible (refetching when it
// becomes visible again). Overlays and live admin panels use it.
//   const { data, error, reload } = usePolled('/api/events/hunt', 2500)

export function usePolled(url, ms = 2500) {
  const [state, setState] = useState({ data: null, error: null, loaded: false })
  const alive = useRef(true)
  const load = useRef(null)

  useEffect(() => {
    alive.current = true
    let timer = null
    const run = async () => {
      clearTimeout(timer)
      try {
        const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        if (alive.current) setState({ data, error: null, loaded: true })
      } catch (err) {
        if (alive.current) setState((s) => ({ ...s, error: err.message, loaded: true }))
      }
      if (alive.current && document.visibilityState === 'visible') timer = setTimeout(run, ms)
    }
    load.current = run
    const onVis = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVis)
    run()
    return () => {
      alive.current = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [url, ms])

  return { ...state, reload: () => load.current?.() }
}
