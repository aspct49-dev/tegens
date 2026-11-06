import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Select, Stat, Toggle } from '../ui'
import './site.css'
import './shop-admin.css'

// The two stores' admin sections (server/features/shop.js), one per store:
//   <ShopAdmin store="wager" />  Wager Store: prizes for wager points, earned by wagering under the
//                                code; points expire with each season. Every setting is on its tab.
//   <ShopAdmin store="watch" />  Watch Store: items for watch points (BotRix, the viewer's Kick account)
// Tabs: the orders, the items on sale, a points desk, and the store's settings.
//
// Orders: ✓ marks one delivered (the player sees "Approved"); ✗ asks for a reason, then
// rejects it and gives the points back. Pending ones are listed oldest first: the queue.

const API = '/api/admin/shop'
const tabsFor = (store) => [
  { id: 'orders', label: 'Orders' },
  { id: 'items', label: store === 'wager' ? 'Prizes' : 'Items' },
  { id: 'points', label: store === 'wager' ? 'Players’ points' : 'Points' },
  { id: 'settings', label: 'Settings' },
]
const fmtDay = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Delivered' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
]
const STATUS = { pending: ['warn', 'Pending'], approved: ['ok', 'Delivered'], rejected: ['off', 'Rejected'], cancelled: ['off', 'Cancelled'] }
const ARTS = [
  { value: 'product', label: 'Product (cut-out)' },
  { value: 'cover', label: 'Cover (fills the panel)' },
  { value: 'fs', label: 'Badge ×3' },
  { value: 'bonus', label: 'Text + picture' },
]

const STORE_OPTIONS = [
  { value: 'wager', label: 'Wager Store' },
  { value: 'watch', label: 'Watch Store' },
]
const storeName = (s) => (s === 'wager' ? 'wager' : 'watch')

const pts = (n) => Number(n ?? 0).toLocaleString('en-US')
const ago = (t) => {
  if (!t) return '—'
  const s = Math.max(0, Date.now() / 1000 - t)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
const when = (t) => (t ? new Date(t * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

export default function ShopAdmin({ store = 'watch' }) {
  const [tab, setTab] = useState('orders')
  const [pending, setPending] = useState(0)
  return (
    <>
      <SectionIntro>
        {store === 'wager' ? (
          <>
            Players earn <b>wager points</b> by wagering under the code (they need a linked Rainbet username) and spend them on prizes here.
            Points expire when each season ends. Set the points per $1 and the season on the Settings tab, and the prizes, costs and stock on
            Prizes. Tick an order once you’ve paid it; rejecting one gives the points back.
          </>
        ) : (
          <>
            Players spend <b>watch points</b> (BotRix, on their Kick account) on items here. The points are taken when they buy; tick an order
            once you’ve sent the item. Rejecting one gives the points back and puts the item back in stock.
          </>
        )}
      </SectionIntro>
      <div className="pl-seg sh-tabs" role="tablist" aria-label="Store">
        {tabsFor(store).map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`pl-seg-item${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'orders' && pending > 0 && <span className="pl-badge">{pending}</span>}
          </button>
        ))}
      </div>
      {tab === 'orders' && <Orders store={store} onCounts={(c) => setPending(c.pending ?? 0)} />}
      {tab === 'items' && <Items store={store} />}
      {tab === 'points' && (store === 'wager' ? <WagerPoints /> : <WatchPoints />)}
      {tab === 'settings' && <Settings store={store} />}
    </>
  )
}

// ---------------------------------------------------------------- orders

function Orders({ store, onCounts }) {
  const [filter, setFilter] = useState('pending')
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [rejecting, setRejecting] = useState(null) // { id, reason }
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(
      () =>
        apiGet(`${API}/orders?status=${filter}&store=${store}&q=${encodeURIComponent(q.trim())}`).then(
          (d) => {
            if (cancelled) return
            setData(d)
            onCounts(d.counts)
            setError('')
          },
          (err) => !cancelled && setError(err.message),
        ),
      q ? 250 : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, store, q, reload])

  const decide = async (o, action, reason) => {
    setBusy(`${o.id}:${action}`)
    setError('')
    try {
      await apiPost(`${API}/orders/${encodeURIComponent(o.id)}`, { action, reason })
      setRejecting(null)
      setReload((n) => n + 1)
    } catch (err) {
      setError(err.message)
      setReload((n) => n + 1)
    } finally {
      setBusy('')
    }
  }

  const list = data?.orders
  const counts = data?.counts ?? {}
  return (
    <Card title="Orders" actions={list && <span className="pl-count">{list.length} shown</span>}>
      <div className="pl-tools">
        <div className="pl-seg" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`pl-seg-item${filter === f.id ? ' is-on' : ''}`}
              aria-pressed={filter === f.id}
              onClick={() => {
                if (f.id === filter) return
                setData(null)
                setFilter(f.id)
              }}
            >
              {f.label}
              {f.id === 'pending' && counts.pending > 0 && <span className="pl-badge">{counts.pending}</span>}
            </button>
          ))}
        </div>
        <div className="pl-search">
          <Input value={q} onChange={setQ} placeholder="Search Kick, Rainbet or item…" type="search" aria-label="Search orders" />
        </div>
      </div>
      <ErrorLine>{error}</ErrorLine>

      {!list ? (
        <span className="adm-spin adm-spin-inline" aria-label="Loading" />
      ) : list.length === 0 ? (
        <Empty>{q.trim() ? `No orders match “${q.trim()}”.` : filter === 'pending' ? 'No orders waiting. Nice.' : 'No orders here yet.'}</Empty>
      ) : (
        <div className="pl-table-wrap">
          <table className="adm-table lk-table sh-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Player</th>
                <th>Note</th>
                <th>Ordered</th>
                <th>Status</th>
                <th className="is-num" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const isBusy = (a) => busy === `${o.id}:${a}`
                const r = rejecting?.id === o.id ? rejecting : null
                return (
                  <tr key={o.id}>
                    <td>
                      <span className="sh-item">
                        <span className="sh-thumb">{o.itemImage && <img src={o.itemImage} alt="" width="34" height="34" />}</span>
                        <span className="sh-item-what">
                          <span className="lk-name">{o.itemName}</span>
                          <span className="lk-sub">
                            {pts(o.cost)} {storeName(o.store)} points
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="sh-item-what">
                        <span className="pl-name">{o.kick}</span>
                        <span className="lk-sub">{o.rainbet ? `Rainbet: ${o.rainbet}` : 'No Rainbet linked'}</span>
                      </span>
                    </td>
                    <td className="sh-note">{o.note || <span className="pl-none">—</span>}</td>
                    <td className="lk-asked" title={when(o.at)}>
                      {ago(o.at)}
                    </td>
                    <td>
                      <Pill tone={STATUS[o.status][0]}>{STATUS[o.status][1]}</Pill>
                      {o.decidedBy && (
                        <span className="lk-sub lk-by" title={when(o.decidedAt)}>
                          by {o.decidedBy}
                          {o.refunded ? ' · refunded' : ''}
                        </span>
                      )}
                      {o.status === 'rejected' && o.reason && <span className="lk-sub lk-by">“{o.reason}”</span>}
                    </td>
                    <td className="is-num">
                      {o.status === 'pending' && !r && (
                        <span className="lk-actions">
                          <button
                            type="button"
                            className="lk-btn is-yes"
                            title="Mark delivered"
                            aria-label={`Mark ${o.kick}’s ${o.itemName} delivered`}
                            disabled={Boolean(busy)}
                            onClick={() => decide(o, 'approve')}
                          >
                            {isBusy('approve') ? <span className="adm-b-spin" /> : '✓'}
                          </button>
                          <button
                            type="button"
                            className="lk-btn is-no"
                            title="Reject and refund"
                            aria-label={`Reject ${o.kick}’s ${o.itemName}`}
                            disabled={Boolean(busy)}
                            onClick={() => setRejecting({ id: o.id, reason: '' })}
                          >
                            ✗
                          </button>
                        </span>
                      )}
                      {r && (
                        <span className="sh-reject">
                          <Input value={r.reason} onChange={(v) => setRejecting({ ...r, reason: v })} placeholder="Reason (the player sees it)" maxLength={200} autoFocus />
                          <span className="lk-actions">
                            <Button onClick={() => setRejecting(null)} disabled={Boolean(busy)}>
                              Back
                            </Button>
                            <Button kind="danger" busy={isBusy('reject')} disabled={Boolean(busy)} onClick={() => decide(o, 'reject', r.reason)}>
                              Reject &amp; refund
                            </Button>
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- items

const blank = { store: 'wager', name: '', cost: '', stock: '', art: 'product', image: '', artTop: '', artBottom: '', hidden: false }
const formOf = (i) => ({
  store: i.store === 'wager' ? 'wager' : 'watch',
  name: i.name,
  cost: String(i.cost),
  stock: i.stock == null ? '' : String(i.stock),
  art: i.art,
  image: i.image ?? '',
  artTop: i.artTop ?? '',
  artBottom: i.artBottom ?? '',
  hidden: Boolean(i.hidden),
})

function ItemForm({ value, onChange }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v })
  return (
    <div className="sh-form">
      <Field label="Name">
        <Input value={value.name} onChange={set('name')} maxLength={60} placeholder="iPhone 17 Pro Max" />
      </Field>
      <Field label="Store">
        <Select value={value.store} onChange={set('store')} options={STORE_OPTIONS} />
      </Field>
      <Field label={`Cost (${storeName(value.store)} points)`}>
        <Input value={value.cost} onChange={set('cost')} inputMode="numeric" placeholder="250000" />
      </Field>
      <Field label="Stock" hint="Blank: unlimited">
        <Input value={value.stock} onChange={set('stock')} inputMode="numeric" placeholder="∞" />
      </Field>
      <Field label="Picture style">
        <Select value={value.art} onChange={set('art')} options={ARTS} />
      </Field>
      <Field label="Image" hint="/assets/… or an https:// link" wide>
        <Input value={value.image} onChange={set('image')} placeholder="/assets/td/item-iphone.png" />
      </Field>
      {value.art === 'bonus' && (
        <>
          <Field label="Big line (gold)" hint="e.g. $10K">
            <Input value={value.artTop} onChange={set('artTop')} maxLength={14} placeholder="$10K" />
          </Field>
          <Field label="Second line" hint="e.g. BONUS BUY">
            <Input value={value.artBottom} onChange={set('artBottom')} maxLength={22} placeholder="BONUS BUY" />
          </Field>
        </>
      )}
    </div>
  )
}

function ItemRow({ item, onSaved }) {
  const [form, setForm] = useState(() => formOf(item))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  useEffect(() => setForm(formOf(item)), [item])
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(item))

  const save = async (patch) => {
    setBusy(patch ? 'hide' : 'save')
    setError('')
    try {
      const d = await apiPost(`${API}/items/${encodeURIComponent(item.id)}`, patch ?? form)
      onSaved(d.items)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }
  const remove = async () => {
    setBusy('remove')
    setError('')
    try {
      onSaved((await apiPost(`${API}/items/${encodeURIComponent(item.id)}/remove`)).items)
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  return (
    <li className={`sh-row${item.hidden ? ' is-hidden' : ''}`}>
      <span className="sh-row-art">{form.image && <img src={form.image} alt="" width="72" height="72" />}</span>
      <div className="sh-row-body">
        <div className="sh-row-head">
          <span className="lk-name">{item.name}</span>
          <span className="lk-sub">
            {item.store === 'wager' ? 'Wager Store' : 'Watch Store'} · {item.stock == null ? 'Unlimited stock' : item.stock === 0 ? 'Sold out' : `${item.stock} left`}
            {item.hidden ? ' · hidden from the store' : ''}
          </span>
        </div>
        <ItemForm value={form} onChange={setForm} />
        <ErrorLine>{error}</ErrorLine>
        <div className="sh-row-actions">
          <Toggle checked={!item.hidden} onChange={(on) => save({ hidden: !on })} label={item.hidden ? 'Hidden' : 'On sale'} />
          <span className="lk-actions">
            <ConfirmButton busy={busy === 'remove'} disabled={Boolean(busy)} onConfirm={remove} confirmLabel="Remove it?">
              Remove
            </ConfirmButton>
            <Button kind="primary" busy={busy === 'save'} disabled={!dirty || Boolean(busy)} onClick={() => save()}>
              Save
            </Button>
          </span>
        </div>
      </div>
    </li>
  )
}

function Items({ store }) {
  const [items, setItems] = useState(null)
  const [canChange, setCanChange] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(null)
  const [busy, setBusy] = useState('')
  const noun = store === 'wager' ? 'prize' : 'item'

  useEffect(() => {
    apiGet(`${API}/items`).then(
      (d) => {
        setItems(d.items)
        setCanChange(d.canChange)
      },
      (err) => setError(err.message),
    )
  }, [])

  const add = async () => {
    setBusy('add')
    setError('')
    try {
      const d = await apiPost(`${API}/items`, adding)
      setItems(d.items)
      setAdding(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }
  const mine = items?.filter((i) => (i.store ?? 'watch') === store) ?? null

  return (
    <>
      {store === 'watch' && !canChange && (
        <p className="sh-warn" role="alert">
          The BotRix bid token isn’t set on the server, so purchases and refunds can’t take or give points. Add <code>bid</code> to .env and restart.
        </p>
      )}
      <Card
        title={store === 'wager' ? 'Prizes' : 'Items'}
        actions={
          !adding && (
            <Button kind="primary" onClick={() => setAdding({ ...blank, store })}>
              Add {noun}
            </Button>
          )
        }
      >
        <ErrorLine>{error}</ErrorLine>
        {adding && (
          <div className="sh-add">
            <ItemForm value={adding} onChange={setAdding} />
            <div className="sh-row-actions">
              <span />
              <span className="lk-actions">
                <Button onClick={() => setAdding(null)}>Cancel</Button>
                <Button kind="primary" busy={busy === 'add'} onClick={add}>
                  Add to store
                </Button>
              </span>
            </div>
          </div>
        )}
        {!mine ? (
          <span className="adm-spin adm-spin-inline" aria-label="Loading" />
        ) : mine.length === 0 ? (
          <Empty>No {noun}s yet. Add the first one.</Empty>
        ) : (
          <ul className="sh-items">
            {mine.map((i) => (
              <ItemRow key={i.id} item={i} onSaved={setItems} />
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

// ---------------------------------------------------------------- settings

function Settings({ store }) {
  const [settings, setSettings] = useState(null)
  const [season, setSeason] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const formOfSettings = (s) =>
    store === 'wager'
      ? { wagerRate: String(s.wagerRate), seasonMonths: String(s.seasonMonths), wagerSince: s.wagerSince, wagerCooldownDays: String(s.wagerCooldownDays) }
      : { cooldownDays: String(s.cooldownDays) }
  useEffect(() => {
    apiGet(`${API}/settings`).then(
      (d) => {
        setSettings(d.settings)
        setSeason(d.season)
        setForm(formOfSettings(d.settings))
      },
      (err) => setError(err.message),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  if (!form) return error ? <ErrorLine>{error}</ErrorLine> : <span className="adm-spin adm-spin-inline" aria-label="Loading" />
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(formOfSettings(settings))
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, k === 'wagerSince' ? v : Number(String(v).replace(/[,\s]/g, ''))]))
      const d = await apiPost(`${API}/settings`, body)
      setSettings(d.settings)
      setSeason(d.season)
      setForm(formOfSettings(d.settings))
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const rate = Number(form.wagerRate)
  const months = Number(form.seasonMonths)
  return (
    <form onSubmit={save}>
      {store === 'wager' && (
        <Card title="Points">
          <p className="sh-text">
            A player’s wager points = what they wagered under the code this season × points per $1 (rounded down), plus what you add on the
            Players’ points tab, minus what they spent this season. Changing these recalculates every balance straight away.
          </p>
          <div className="sh-settings">
            <Field
              label="Points per $1 wagered"
              hint={Number.isFinite(rate) && rate > 0 ? `$1,000 wagered = ${Math.floor(1000 * rate).toLocaleString('en-US')} points` : '1 = a point per $1 · 0.1 = a point per $10'}
            >
              <Input value={form.wagerRate} onChange={set('wagerRate')} inputMode="decimal" />
            </Field>
            <Field label="Points expire every (months)" hint="0: never. Unspent points are gone when a season ends.">
              <Input value={form.seasonMonths} onChange={set('seasonMonths')} inputMode="numeric" />
            </Field>
            <Field label="First season starts" hint={months > 0 ? 'Seasons run back to back from here (UTC)' : 'Wager counts from this day (UTC)'}>
              <Input type="date" value={form.wagerSince} onChange={set('wagerSince')} />
            </Field>
          </div>
          {season && (
            <div className="sh-season">
              <Stat label="This season" value={season.end ? `${fmtDay(season.start)} – ${fmtDay(season.end)}` : `Since ${fmtDay(season.start)}`} />
              <Stat label="Points expire" value={season.next ? fmtDay(season.next) : 'Never'} tone={season.next ? 'gold' : undefined} />
            </div>
          )}
        </Card>
      )}
      <Card title="Limits">
        <div className="sh-settings">
          <Field label="One purchase every (days)" hint="0: no limit. Admins aren’t limited; rejected and cancelled orders don’t count.">
            <Input
              value={store === 'wager' ? form.wagerCooldownDays : form.cooldownDays}
              onChange={set(store === 'wager' ? 'wagerCooldownDays' : 'cooldownDays')}
              inputMode="numeric"
            />
          </Field>
        </div>
      </Card>
      <ErrorLine>{error}</ErrorLine>
      <div className="sh-settings-save">
        {saved && !dirty && <span className="lk-sub">Saved</span>}
        <Button kind="primary" type="submit" busy={busy} disabled={!dirty}>
          Save settings
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- points desks

/** Wager points: a Rainbet username's balance (earned from wager, our own ledger) */
function WagerPoints() {
  const [name, setName] = useState('')
  const [view, setView] = useState(null) // { account, player, history }
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const lookup = async (e) => {
    e?.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy('lookup')
    setError('')
    try {
      setView(await apiGet(`${API}/wager-points?name=${encodeURIComponent(n)}`))
    } catch (err) {
      setError(err.message)
      setView(null)
    } finally {
      setBusy('')
    }
  }
  const change = async (sign) => {
    const n = Math.round(Number(String(delta).replace(/[,\s]/g, '')))
    if (!Number.isFinite(n) || n <= 0) return setError('Enter how many points.')
    setBusy(sign > 0 ? 'add' : 'take')
    setError('')
    try {
      const d = await apiPost(`${API}/wager-points`, { name: view.account.name, delta: sign * n, reason })
      setView((v) => ({ ...v, account: d.account ?? v.account, history: d.history }))
      setDelta('')
      setReason('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const a = view?.account
  return (
    <Card title="Look up a player’s wager points">
      <form className="adm-row" onSubmit={lookup}>
        <Field label="Rainbet username">
          <Input value={name} onChange={setName} placeholder="Mysticsmum" />
        </Field>
        <Button kind="primary" type="submit" busy={busy === 'lookup'}>
          Look up
        </Button>
      </form>
      <ErrorLine>{error}</ErrorLine>
      {a && (
        <div className="sh-viewer">
          <div className="sh-viewer-stats">
            <Stat label={`${a.name}’s wager points`} value={pts(a.balance)} tone="gold" />
            <Stat label={`Wagered since ${fmtDay(a.season?.start ?? a.since)}`} value={`$${a.wagered.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />
            <Stat label="Points expire" value={a.season?.end ? `after ${fmtDay(a.season.end)}` : 'Never'} />
            <Stat label={`Earned (${a.rate} per $1)`} value={pts(a.earned)} />
            <Stat label="Added by admins" value={`${a.adjust >= 0 ? '+' : '−'}${pts(Math.abs(a.adjust))}`} />
            <Stat label="Spent" value={pts(a.spent)} />
          </div>
          <p className="sh-text">
            {!a.found && 'Not found under the code since the start date. '}
            {view.player ? `Linked to ${view.player.kick ?? view.player.name} on the site.` : 'No site account has this Rainbet username linked, so they can’t buy yet.'}
          </p>
          <div className="adm-row sh-adjust">
            <Field label="Points">
              <Input value={delta} onChange={setDelta} inputMode="numeric" placeholder="1000" />
            </Field>
            <Field label="Why (goes in the log)">
              <Input value={reason} onChange={setReason} maxLength={120} placeholder="Stream bonus" />
            </Field>
            <Button kind="primary" busy={busy === 'add'} disabled={Boolean(busy) || !reason.trim()} onClick={() => change(1)}>
              Add
            </Button>
            <ConfirmButton busy={busy === 'take'} disabled={Boolean(busy) || !reason.trim()} onConfirm={() => change(-1)} confirmLabel="Take them?">
              Take
            </ConfirmButton>
          </div>
          <PointsLog rows={view.history} nameKey="rainbet" empty="No wager points changes for this player yet." />
        </div>
      )}
    </Card>
  )
}

const QUICK = [100, 500, 1000, 5000, 10000]

/** Watch points: BotRix, by Kick username. Also its own admin section (./Points.jsx);
 *  `initialName` looks that viewer up straight away. */
export function WatchPoints({ initialName = '' }) {
  const [name, setName] = useState(initialName)
  const [view, setView] = useState(null) // { name, viewer, player, history }
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [log, setLog] = useState(null)

  const loadLog = () => apiGet(`${API}/points/log`).then((d) => setLog(d.log), () => {})
  useEffect(() => {
    loadLog()
    if (initialName) lookup(null, initialName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lookup = async (e, who = name) => {
    e?.preventDefault()
    const n = who.trim().replace(/^@/, '')
    if (!n) return
    setBusy('lookup')
    setError('')
    try {
      setView({ name: n, ...(await apiGet(`${API}/points?name=${encodeURIComponent(n)}`)) })
    } catch (err) {
      setError(err.message)
      setView(null)
    } finally {
      setBusy('')
    }
  }

  const change = async (sign) => {
    const n = Math.round(Number(String(delta).replace(/[,\s]/g, '')))
    if (!Number.isFinite(n) || n <= 0) return setError('Enter how many points.')
    setBusy(sign > 0 ? 'add' : 'take')
    setError('')
    try {
      const d = await apiPost(`${API}/points`, { name: view.name, delta: sign * n, reason })
      setView((v) => ({ ...v, viewer: d.viewer ?? v.viewer, history: d.history }))
      setDelta('')
      setReason('')
      loadLog()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <Card title="Look up a viewer">
        <form className="adm-row" onSubmit={lookup}>
          <Field label="Kick username">
            <Input value={name} onChange={setName} placeholder="travellingdegens" />
          </Field>
          <Button kind="primary" type="submit" busy={busy === 'lookup'}>
            Look up
          </Button>
        </form>
        <ErrorLine>{error}</ErrorLine>
        {view && (
          <div className="sh-viewer">
            <div className="sh-viewer-stats">
              <Stat label={`${view.viewer?.name ?? view.name}’s points`} value={view.viewer ? pts(view.viewer.points) : 'Not on BotRix'} tone={view.viewer ? 'gold' : undefined} />
              {view.viewer && <Stat label="Watched" value={`${Math.round((view.viewer.watchtime ?? 0) / 60).toLocaleString('en-US')}h`} />}
              <Stat label="Site account" value={view.player ? (view.player.rainbet ? `Rainbet: ${view.player.rainbet}` : 'Signed in, no Rainbet') : 'Never signed in'} />
            </div>
            {view.viewer && (
              <div className="pl-seg sh-quick" role="group" aria-label="Quick amounts">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`pl-seg-item${Number(String(delta).replace(/[,\s]/g, '')) === q ? ' is-on' : ''}`}
                    onClick={() => setDelta(String(q))}
                  >
                    {pts(q)}
                  </button>
                ))}
              </div>
            )}
            {view.viewer && (
              <div className="adm-row sh-adjust">
                <Field label="Points">
                  <Input value={delta} onChange={setDelta} inputMode="numeric" placeholder="1000" />
                </Field>
                <Field label="Why (goes in the log)">
                  <Input value={reason} onChange={setReason} maxLength={120} placeholder="Stream bonus" />
                </Field>
                <Button kind="primary" busy={busy === 'add'} disabled={Boolean(busy) || !reason.trim()} onClick={() => change(1)}>
                  Add
                </Button>
                <ConfirmButton busy={busy === 'take'} disabled={Boolean(busy) || !reason.trim()} onConfirm={() => change(-1)} confirmLabel="Take them?">
                  Take
                </ConfirmButton>
              </div>
            )}
            <PointsLog rows={view.history} empty="No changes for this viewer from the site yet." />
          </div>
        )}
      </Card>
      <Card title="Recent points changes">
        {!log ? <span className="adm-spin adm-spin-inline" aria-label="Loading" /> : <PointsLog rows={log} showName empty="Nothing yet." />}
      </Card>
    </>
  )
}

const KIND = { redeem: 'Purchase', refund: 'Refund', admin: 'Admin' }

function PointsLog({ rows, showName, nameKey = 'kick', empty }) {
  if (!rows?.length) return <Empty>{empty}</Empty>
  return (
    <div className="pl-table-wrap">
      <table className="adm-table sh-log">
        <thead>
          <tr>
            <th>When</th>
            {showName && <th>Viewer</th>}
            <th>Change</th>
            <th>What</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="lk-asked" title={when(e.at)}>
                {ago(e.at)}
              </td>
              {showName && <td className="pl-name">{e[nameKey] ?? e.rainbet ?? e.kick}</td>}
              <td className={`sh-delta ${e.delta > 0 ? 'is-up' : 'is-down'}`}>
                {e.delta > 0 ? '+' : '−'}
                {pts(Math.abs(e.delta))}
              </td>
              <td>
                <span className="sh-kind">{KIND[e.kind] ?? e.kind}</span> {e.store === 'wager' && <span className="sh-kind is-wager">Wager</span>} {e.reason}
                {!e.ok && <span className="sh-failed"> · failed: {e.error}</span>}
              </td>
              <td className="lk-sub">{e.by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
