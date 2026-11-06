import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { useNameMask } from '../hooks/useNameMask'
import { fmtMoney } from '../utils'
import Modal from './Modal'

const fmtDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// Final standings of a past leaderboard, read from the affiliate API for that
// period. `board` = a config.pastLeaderboards entry, or null when closed.
export default function WinnersModal({ board: current, onClose }) {
  const mask = useNameMask() // admins see full names
  const [loaded, setLoaded] = useState({ board: null, status: 'idle', rows: [] })
  // Keep showing the last board while the dialog fades out.
  const last = useRef(null)
  if (current) last.current = current
  const board = current || last.current
  // Rows loaded for a previously opened board are never shown under this one.
  const state = loaded.board === board ? loaded : { status: 'loading', rows: [] }

  useEffect(() => {
    if (!current) return
    const board = current
    if (!board.startAt || !board.endAt) {
      setLoaded({ board, status: 'nodates', rows: [] })
      return
    }
    let cancelled = false
    setLoaded({ board, status: 'loading', rows: [] })
    fetch(`/api/affiliates?start_at=${board.startAt}&end_at=${board.endAt}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const prizes = board.prizes || config.prizes
        const rows = (data.affiliates || [])
          .map((a) => ({ name: a.username || '', wagered: parseFloat(a.wagered_amount) || 0 }))
          .sort((a, b) => b.wagered - a.wagered)
          .slice(0, prizes.length)
          .map((p, i) => ({ ...p, prize: prizes[i] || 0 }))
        setLoaded({ board, status: 'ready', rows })
      })
      .catch(() => !cancelled && setLoaded({ board, status: 'error', rows: [] }))
    return () => {
      cancelled = true
    }
  }, [current])

  return (
    <Modal open={Boolean(current)} onClose={onClose} labelledBy="winners-title" className="winners-modal">
      {board && (
        <>
          <h2 id="winners-title">{fmtMoney(board.prizePool)} Leaderboard winners</h2>
          {board.startAt && board.endAt && (
            <p className="winners-period">
              {fmtDate(board.startAt)} – {fmtDate(board.endAt)}
            </p>
          )}
          {state.status === 'loading' && <p className="winners-msg">Loading standings…</p>}
          {state.status === 'error' && <p className="winners-msg">Standings are unavailable right now. Please try again later.</p>}
          {state.status === 'nodates' && <p className="winners-msg">Winner: <b>{board.winner}</b></p>}
          {state.status === 'ready' && !state.rows.length && <p className="winners-msg">No wagers were recorded for this period.</p>}
          {state.status === 'ready' && state.rows.length > 0 && (
            <ol className="winners-list">
              {state.rows.map((r, i) => (
                <li key={i}>
                  <span className="winners-rank">#{i + 1}</span>
                  <span className="winners-name">{mask(r.name)}</span>
                  <span className="winners-wager">{fmtMoney(r.wagered, 2)}</span>
                  <span className="winners-prize">{fmtMoney(r.prize, 2)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Modal>
  )
}
