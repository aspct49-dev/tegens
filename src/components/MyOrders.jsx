import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import '../store-page.css'
import EmptyState from './EmptyState'

// The signed-in player's Item Store orders: what they bought, whether it has been delivered,
// and a Cancel (points back) while it is still waiting. Used on /store and /profile.
//
//   <MyOrders orders={orders} onChange={(orders, points) => …} />   the store page passes its list
//   <MyOrders />                                                     loads /api/shop itself
// Cancelling: POST /api/shop/orders/<id>/cancel → { orders, points } (server/features/shop.js).

const STATUS = {
  pending: { label: 'Pending', note: 'Waiting for the team to send it' },
  approved: { label: 'Approved', note: 'Sent to you' },
  rejected: { label: 'Rejected', note: 'Points refunded' },
  cancelled: { label: 'Cancelled', note: 'Points refunded' },
}

const fmtPoints = (n) => Number(n).toLocaleString('en-US')
const day = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function MyOrders({ orders: given, onChange, title = 'Your orders', emptyText, className = '' }) {
  const { user } = useAuth()
  const [own, setOwn] = useState(null) // when no list is passed in
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const orders = given ?? own

  useEffect(() => {
    if (given !== undefined || !user) return undefined
    let cancelled = false
    fetch('/api/shop', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => !cancelled && setOwn(d.orders ?? []))
      .catch(() => !cancelled && setOwn([]))
    return () => {
      cancelled = true
    }
  }, [given, user])

  if (!user || !orders) return null

  const cancel = async (o) => {
    setBusy(o.id)
    setError('')
    try {
      const res = await fetch(`/api/shop/orders/${encodeURIComponent(o.id)}/cancel`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Couldn’t cancel that order.')
      if (given === undefined) setOwn(d.orders)
      onChange?.(d.orders, d.points, d)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className={`so ${className}`.trim()} aria-labelledby="so-title">
      <h2 id="so-title" className={className ? 'so-title' : 'so-title section-title'}>
        {title}
        {orders.length > 0 && <span className="so-count">{orders.length}</span>}
      </h2>
      {error && (
        <p className="so-error" role="alert">
          {error}
        </p>
      )}
      {orders.length === 0 ? (
        // a panel on the profile keeps its own quiet line; on the store page it's the shared empty box
        className ? (
          <p className="so-empty">{emptyText ?? 'Items you buy show here until they’re delivered.'}</p>
        ) : (
          <EmptyState compact>{emptyText ?? 'Items you buy show here until they’re delivered.'}</EmptyState>
        )
      ) : (
        <ul className="so-list">
          {orders.map((o) => {
            const s = STATUS[o.status] ?? STATUS.pending
            return (
              <li key={o.id} className={`so-row is-${o.status}`}>
                <span className="so-art" aria-hidden="true">
                  {o.itemImage && <img src={o.itemImage} alt="" width="44" height="44" loading="lazy" />}
                </span>
                <span className="so-what">
                  <span className="so-name">{o.itemName}</span>
                  <span className="so-sub">
                    {fmtPoints(o.cost)} {o.store === 'wager' ? 'wager' : 'watch'} points · {day(o.at)}
                    {o.note ? ` · “${o.note}”` : ''}
                  </span>
                  {o.status === 'rejected' && o.reason && <span className="so-reason">{o.reason}</span>}
                </span>
                <span className="so-state">
                  <span className={`so-pill is-${o.status}`}>{s.label}</span>
                  <span className="so-note">{o.decidedAt && o.status !== 'pending' ? `${s.note}, ${day(o.decidedAt)}` : s.note}</span>
                </span>
                {o.status === 'pending' && (
                  <button type="button" className="so-cancel" disabled={Boolean(busy)} onClick={() => cancel(o)}>
                    {busy === o.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
