import { useCallback, useEffect, useMemo, useState } from 'react'
import { config } from '../config'
import { useAuth } from '../hooks/useAuth'
import { Link } from '../router'
import { useUI } from '../ui'
import Modal from '../components/Modal'
import MyOrders from '../components/MyOrders'
import EmptyState from '../components/EmptyState'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import '../store-page.css'

// The Item Store: two stores, switched by the tabs under the heading (?store=watch|wager).
//   Wager Store  WAGER points, earned by wagering under the code (needs a linked Rainbet username)
//   Watch Store  WATCH points, BotRix loyalty points earned watching on Kick (needs Kick sign-in)
// Items, both balances and the viewer's orders come from GET /api/shop (server/features/shop.js).
// Purchase asks to confirm, then POST /api/shop/redeem takes the points and places an order the
// team delivers from the admin panel; "Your orders" under the grid shows each one.
// If the API can't be reached the configured items still show (buying needs the API).

const fmtPoints = (n) => Number(n).toLocaleString('en-US')
const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n))

/** What each store's points are and what a viewer needs to spend them */
const STORES = {
  wager: {
    tab: 'Wager Store',
    points: 'wager points',
    balance: (me) => me?.wagerPoints ?? null,
    error: (me) => me?.wagerError ?? null,
    ready: (me) => Boolean(me?.rainbet),
  },
  watch: {
    tab: 'Watch Store',
    points: 'watch points',
    balance: (me) => me?.points ?? null,
    error: (me) => me?.pointsError ?? null,
    ready: (me) => Boolean(me?.kick),
  },
}
const ORDER = ['wager', 'watch']
const longDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const storeFromUrl = () => {
  const s = new URLSearchParams(window.location.search).get('store')
  return s === 'wager' || s === 'watch' ? s : null
}

function ItemArt({ item }) {
  if (item.art === 'bonus') {
    // two lines of text over the picture (both editable in admin → Item Store)
    return (
      <div className="store-art is-bonus">
        <p className="store-art-words">
          {item.artTop && <span className="store-art-top">{item.artTop}</span>}
          {item.artBottom && <span className="store-art-bottom">{item.artBottom}</span>}
        </p>
        {item.image && <img src={item.image} width="242" height="67" alt="" loading="lazy" />}
      </div>
    )
  }
  if (item.art === 'cover') {
    return (
      <div className="store-art is-cover">
        <img src={item.image} width="242" height="144" alt="" loading="lazy" />
      </div>
    )
  }
  if (item.art === 'fs') {
    // The badge, flanked by two faint tilted copies (9% opacity in the design).
    return (
      <div className="store-art is-fs">
        <img className="fs-ghost fs-left" src={item.image} width="78" height="60" alt="" loading="lazy" />
        <img className="fs-ghost fs-right" src={item.image} width="78" height="60" alt="" loading="lazy" />
        <img className="fs-main" src={item.image} width="115" height="89" alt="" loading="lazy" />
      </div>
    )
  }
  return (
    <div className="store-art is-product">
      <img src={item.image} width="109" height="109" alt="" loading="lazy" />
    </div>
  )
}

function ItemCard({ item, points, pointsName, onBuy, index }) {
  const soldOut = item.stock === 0
  const short_ = points != null && points < item.cost ? item.cost - points : 0
  return (
    <li className="store-card enter" style={{ '--d': `${120 + index * 50}ms` }}>
      <ItemArt item={item} />
      <h2 className="store-name">{item.name}</h2>
      <p className="store-stock">
        <img src="/assets/td/icon-package.svg" width="14" height="14" alt="" />
        {soldOut ? 'Sold out' : item.stock == null ? 'In stock' : `${item.stock} Left`}
      </p>
      <p className="store-cost">
        <span>Cost:</span>
        <span>{fmtPoints(item.cost)}</span>
      </p>
      <button className="store-buy" onClick={() => onBuy(item)} disabled={soldOut || short_ > 0} title={short_ > 0 ? `${fmtPoints(short_)} more ${pointsName} needed` : undefined}>
        {soldOut ? 'SOLD OUT' : short_ > 0 ? `NEED ${short(short_)} MORE` : 'PURCHASE'}
      </button>
    </li>
  )
}

/** The viewer's balance in this store, or the way to get one */
function Balance({ store, me, loading, onSignIn }) {
  const s = STORES[store]
  if (loading) return <span className="store-balance is-loading" aria-label="Loading your points" />
  if (store === 'watch' && !me?.kick)
    return (
      <button type="button" className="store-kick" onClick={onSignIn}>
        <img src="/assets/icon-kick.svg" width="14" height="14" alt="" />
        {me?.signedIn ? 'Connect Kick to buy' : 'Sign in with Kick to buy'}
      </button>
    )
  if (store === 'wager' && !me?.signedIn)
    return (
      <button type="button" className="store-kick" onClick={onSignIn}>
        <img src="/assets/icon-kick.svg" width="14" height="14" alt="" />
        Sign in to buy
      </button>
    )
  if (store === 'wager' && !me?.rainbet)
    return (
      <Link className="store-link-rb" to="/profile">
        Link Rainbet to earn wager points
      </Link>
    )
  const value = s.balance(me)
  return (
    <span className="store-balance" title={s.error(me) ?? (store === 'wager' ? `${me.rainbet}’s wager points` : `${me.kick}’s watch points`)}>
      <span className="store-balance-label">{store === 'wager' ? 'Wager points' : 'Watch points'}</span>
      <span className="store-balance-value">{value == null ? '—' : fmtPoints(value)}</span>
    </span>
  )
}

/** Confirm a purchase (or say what's needed first) */
function BuyDialog({ item, me, wagerRate, onClose, onSignIn, onBought }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = Boolean(item)
  useEffect(() => {
    if (!open) return
    setNote('')
    setError('')
  }, [open])

  const store = item?.store === 'wager' ? 'wager' : 'watch'
  const s = STORES[store]
  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/shop/redeem', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, note }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'The purchase didn’t go through. Try again.')
      onBought(item, d)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const ready = s.ready(me)
  const balance = s.balance(me)
  const after = balance != null && item ? balance - item.cost : null
  return (
    <Modal open={open} onClose={() => !busy && onClose()} labelledBy="store-buy-title" className="store-dialog">
      {item && (
        <>
          <h2 id="store-buy-title">{ready ? `Buy ${item.name}?` : store === 'watch' ? 'Sign in to buy' : 'Link Rainbet to buy'}</h2>
          <div className="store-dialog-item">
            <span className="store-dialog-art" aria-hidden="true">
              <img src={item.image} alt="" width="64" height="64" />
            </span>
            <span className="store-dialog-what">
              <span className="store-dialog-name">{item.name}</span>
              <span className="store-dialog-cost">
                {fmtPoints(item.cost)} {s.points}
              </span>
            </span>
          </div>
          {!ready ? (
            store === 'watch' ? (
              <>
                <p className="store-dialog-text">
                  Watch points are earned watching and chatting on the Kick stream, so they live on your Kick account. Sign in with Kick and
                  you can buy straight from here.
                </p>
                <div className="store-dialog-actions">
                  <button type="button" className="store-kick" onClick={onSignIn}>
                    <img src="/assets/icon-kick.svg" width="14" height="14" alt="" />
                    Sign in with Kick
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="store-dialog-text">
                  Wager points come from your wager under code <b>{config.referralCode.toUpperCase()}</b> on Rainbet
                  {wagerRate ? ` (${wagerRate === 1 ? '1 point' : `${wagerRate} points`} per $1)` : ''}.{' '}
                  {me?.signedIn ? 'Link your Rainbet username on your profile to use them.' : 'Sign in, then link your Rainbet username on your profile.'}
                </p>
                <div className="store-dialog-actions">
                  {me?.signedIn ? (
                    <Link className="btn-blue store-dialog-go" to="/profile" onClick={onClose}>
                      Go to profile
                    </Link>
                  ) : (
                    <button type="button" className="store-kick" onClick={onSignIn}>
                      <img src="/assets/icon-kick.svg" width="14" height="14" alt="" />
                      Sign in
                    </button>
                  )}
                </div>
              </>
            )
          ) : (
            <>
              <dl className="store-dialog-sum">
                <div>
                  <dt>Your {s.points}</dt>
                  <dd>{balance == null ? '—' : fmtPoints(balance)}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>−{fmtPoints(item.cost)}</dd>
                </div>
                <div className="is-total">
                  <dt>Left after</dt>
                  <dd className={after != null && after < 0 ? 'is-short' : ''}>{after == null ? '—' : fmtPoints(after)}</dd>
                </div>
              </dl>
              <label className="store-dialog-note">
                <span>Note for the team (optional)</span>
                <input value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder="e.g. colour, size, or where to send it" />
              </label>
              <p className="store-dialog-text">
                The points are taken now. The team sends the item and marks your order approved; if it can’t be sent, your points come
                back. You can cancel while it’s pending.
              </p>
              {error && (
                <p className="store-dialog-error" role="alert">
                  {error}
                </p>
              )}
              <div className="store-dialog-actions">
                <button type="button" className="store-dialog-cancel" onClick={onClose} disabled={busy}>
                  Not now
                </button>
                <button type="button" className="btn-blue store-dialog-go" onClick={confirm} disabled={busy || (after != null && after < 0)}>
                  {busy ? 'Buying…' : `Buy for ${fmtPoints(item.cost)}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

export default function StorePage() {
  const { toast } = useUI()
  const auth = useAuth()
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState('asc')
  const [data, setData] = useState(null) // GET /api/shop
  const [buying, setBuying] = useState(null)
  const [picked, setPicked] = useState(storeFromUrl) // null: the first store with items

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shop', { credentials: 'same-origin' })
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      // keep what's already on screen; with nothing yet, say so (never show stand-in items)
      setData((d) => d ?? { items: [], me: null, orders: [], failed: true })
    }
  }, [])
  useEffect(() => {
    if (auth.status !== 'loading') load()
  }, [auth.status, auth.user?.id, load])

  const loading = !data
  const all = data?.items ?? []
  // which store opens is only known once the items are in (the first store that has any)
  const store = picked ?? (loading ? null : ORDER.find((k) => all.some((i) => (i.store ?? 'watch') === k)) ?? 'wager')
  const pick = (k) => {
    setPicked(k)
    setQuery('')
    const url = new URL(window.location.href)
    url.searchParams.set('store', k)
    window.history.replaceState(window.history.state, '', url.pathname + url.search)
  }

  const me = data?.me ?? null
  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = all.filter((it) => (it.store ?? 'watch') === store && (!q || it.name.toLowerCase().includes(q)))
    // Stable: equal costs keep the shop's order.
    return list
      .map((it, i) => ({ it, i }))
      .sort((a, b) => (order === 'asc' ? a.it.cost - b.it.cost : b.it.cost - a.it.cost) || a.i - b.i)
      .map(({ it }) => it)
  }, [query, order, all, store])
  const count = (k) => all.filter((i) => (i.store ?? 'watch') === k).length

  const signIn = () => auth.signInWithKick(`/store?store=${store ?? 'wager'}`)
  const bought = (item, d) => {
    setBuying(null)
    setData((cur) => ({
      ...cur,
      me: { ...cur.me, ...(d.points != null ? { points: d.points } : {}), ...(d.wagerPoints != null ? { wagerPoints: d.wagerPoints } : {}) },
      orders: d.orders,
      items: cur.items.map((i) => (i.id === item.id && i.stock != null ? { ...i, stock: Math.max(0, i.stock - 1) } : i)),
    }))
    toast(`Order placed: ${item.name}. It shows under Your orders until it’s sent.`)
  }
  const ordersChanged = (orders, points, d) => {
    setData((cur) => ({
      ...cur,
      orders,
      me: { ...cur.me, ...(points != null ? { points } : {}), ...(d?.wagerPoints != null ? { wagerPoints: d.wagerPoints } : {}) },
    }))
    load() // stock went back
    toast('Order cancelled and your points refunded')
  }

  const s = STORES[store ?? 'wager']
  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="ITEM" bottom="STORE">
        {!store ? (
          // the line's space is kept while loading so nothing below it moves
          <span className="store-sub-wait" aria-hidden="true">
            Watch the stream on Kick to earn
            {' '}<br />
            watch points and spend them here.
          </span>
        ) : store === 'wager' ? (
          <>
            Wager under code <b className="accent">{config.referralCode.toUpperCase()}</b> to earn
            {' '}<br />
            <b className="accent">wager points</b> and spend them here.
          </>
        ) : (
          <>
            Watch the stream on Kick to earn
            {' '}<br />
            <b className="accent">watch points</b> and spend them here.
          </>
        )}
      </PageHeading>

      <div className="store-switch enter" style={{ '--d': '140ms' }} role="tablist" aria-label="Stores">
        {ORDER.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={store === k} className={`store-switch-tab${store === k ? ' is-active' : ''}`} onClick={() => pick(k)}>
            {STORES[k].tab}
            <span className="store-switch-n">{loading ? '·' : count(k)}</span>
          </button>
        ))}
      </div>

      <div className="store">
        <div className="store-tools enter" style={{ '--d': '160ms' }}>
          <label className="store-search">
            <img src="/assets/td/icon-search.svg" width="14" height="14" alt="" />
            <span className="sr-only">Search for items</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for items" />
          </label>
          <label className="store-sort">
            <span className="sr-only">Sort by reward</span>
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="asc">Reward: Ascending</option>
              <option value="desc">Reward: Descending</option>
            </select>
          </label>
          <span className="store-tools-end">
            <Balance store={store} me={me} loading={!data || auth.status === 'loading'} onSignIn={signIn} />
          </span>
        </div>

        {store === 'wager' && data?.settings?.season && (
          <p className="store-season enter" style={{ '--d': '180ms' }}>
            {data.settings.season.end ? (
              <>
                This season runs <b>{longDay(data.settings.season.start)} – {longDay(data.settings.season.end)}</b>. Wager points you haven’t spent
                expire when it ends, then everyone starts the next season from zero.
              </>
            ) : (
              <>Wager points count from {longDay(data.settings.season.start)} and don’t expire.</>
            )}
          </p>
        )}

        {loading ? (
          <div className="spinner" role="status" aria-label="Loading the store" />
        ) : data.failed ? (
          <EmptyState
            compact
            title="The store didn’t load"
            actions={
              <button type="button" className="chip-btn" onClick={() => (setData(null), load())}>
                Try again
              </button>
            }
          >
            Check your connection and try again.
          </EmptyState>
        ) : items.length ? (
          <ul className="store-grid" key={store}>
            {items.map((it, i) => (
              <ItemCard item={it} points={s.balance(me)} pointsName={s.points} onBuy={setBuying} index={i} key={it.id} />
            ))}
          </ul>
        ) : (
          <EmptyState compact title={query.trim() ? 'No matching items' : null}>
            {query.trim() ? `Nothing matches “${query.trim()}”. Try another search.` : `Nothing in the ${s.tab} yet. New items land here, so check back soon.`}
          </EmptyState>
        )}

        {data && auth.user && <MyOrders orders={data.orders ?? []} onChange={ordersChanged} />}
      </div>

      <BuyDialog item={buying} me={me} wagerRate={data?.settings?.wagerRate} onClose={() => setBuying(null)} onSignIn={signIn} onBought={bought} />
    </div>
  )
}
