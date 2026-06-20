import { useEffect, useState } from 'react'

function diff(target) {
  const ms = Math.max(0, new Date(target).getTime() - Date.now())
  return {
    ended: ms === 0,
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms / 3600000) % 24),
    mins: Math.floor((ms / 60000) % 60),
    secs: Math.floor((ms / 1000) % 60),
  }
}

const pad = (n) => String(n).padStart(2, '0')

export default function Countdown({ endDate }) {
  const [t, setT] = useState(() => diff(endDate))

  useEffect(() => {
    const id = setInterval(() => setT(diff(endDate)), 1000)
    return () => clearInterval(id)
  }, [endDate])

  if (t.ended) {
    return <div className="cd-ended">🏁 This leaderboard has ended — winners are being paid out!</div>
  }

  const cells = [
    { n: t.days, l: 'Days' },
    { n: t.hours, l: 'Hours' },
    { n: t.mins, l: 'Minutes' },
    { n: t.secs, l: 'Seconds' },
  ]

  return (
    <div className="countdown">
      {cells.map((c, i) => (
        <div key={c.l} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="cd-cell">
            <div className="num">{pad(c.n)}</div>
            <div className="lbl">{c.l}</div>
          </div>
          {i < cells.length - 1 && <span className="cd-sep hide-sm">:</span>}
        </div>
      ))}
    </div>
  )
}
