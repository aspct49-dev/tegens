import { useEffect, useState } from 'react'

function diff(target) {
  const ms = Math.max(0, target - Date.now())
  return {
    ended: ms === 0,
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms / 3600000) % 24),
    mins: Math.floor((ms / 60000) % 60),
    secs: Math.floor((ms / 1000) % 60),
  }
}

// Ticks every second toward the end of `endAt` ('YYYY-MM-DD', 23:59:59 UTC).
export function useCountdown(endAt) {
  const target = new Date(`${endAt}T23:59:59Z`).getTime()
  const [t, setT] = useState(() => diff(target))

  useEffect(() => {
    const id = setInterval(() => setT(diff(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  return t
}
