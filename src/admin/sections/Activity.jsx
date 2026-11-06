import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../api'
import { Button, Card, Empty, ErrorLine, Input, SectionIntro } from '../ui'
import './activity-admin.css'

// The activity log (server/audit.js): every admin change, who made it and when, plus
// VIP slot calls from chat. Filter by area or search by name; newest first.

const API = '/api/admin/activity'

const time = (s) => new Date(s * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
function dayLabel(s) {
  const d = new Date(s * 1000)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ActivityAdmin() {
  const [kind, setKind] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState({ items: [], kinds: {}, more: false, loaded: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (before) => {
      setBusy(true)
      setError('')
      try {
        const p = new URLSearchParams()
        if (kind) p.set('kind', kind)
        if (search) p.set('q', search)
        if (before) p.set('before', String(before))
        const d = await apiGet(`${API}?${p}`)
        setData((cur) => ({ items: before ? [...cur.items, ...d.items] : d.items, kinds: d.kinds, more: d.more, loaded: true }))
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    },
    [kind, search],
  )

  useEffect(() => {
    load()
  }, [load])

  // search as you type, a moment after the last key
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const groups = []
  for (const e of data.items) {
    const label = dayLabel(e.at)
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] })
    groups.at(-1).items.push(e)
  }

  return (
    <>
      <SectionIntro actions={<Button onClick={() => load()}>Refresh</Button>}>
        Every change made in this admin panel, who made it and when, plus VIP slot calls from chat. Repeated edits a few minutes apart (like a bonus hunt
        saving as you type) are folded into one line.
      </SectionIntro>

      <Card title="Activity">
        <div className="act-filters">
          <div className="act-chips" role="radiogroup" aria-label="Show">
            {[['', 'Everything'], ...Object.entries(data.kinds)].map(([id, label]) => (
              <button key={id || 'all'} type="button" role="radio" aria-checked={kind === id} className={`act-chip${kind === id ? ' is-on' : ''}`} onClick={() => setKind(id)}>
                {label}
              </button>
            ))}
          </div>
          <span className="act-search">
            <Input value={q} onChange={setQ} placeholder="Search names or actions" aria-label="Search the activity log" />
          </span>
        </div>
        <ErrorLine>{error}</ErrorLine>

        {!data.loaded ? (
          <span className="adm-spin adm-spin-inline" aria-label="Loading" />
        ) : data.items.length === 0 ? (
          <Empty>{kind || search ? 'Nothing matches. Try another filter.' : 'Nothing logged yet. Changes made here show up as they happen.'}</Empty>
        ) : (
          <div className="act-days">
            {groups.map((g) => (
              <section key={g.label} className="act-day">
                <h3 className="act-day-label">{g.label}</h3>
                <ol className="act-list">
                  {g.items.map((e) => (
                    <li key={e.id} className="act-row">
                      <span className="act-time">{time(e.at)}</span>
                      <span className={`act-kind is-${e.kind}`}>{data.kinds[e.kind] ?? e.kind}</span>
                      <span className="act-text">
                        <b className="act-actor">{e.actor}</b> {e.text}
                        {e.count > 1 && <span className="act-count">×{e.count}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        {data.more && (
          <div className="act-more">
            <Button busy={busy} onClick={() => load(data.items.at(-1)?.at)}>
              Show older
            </Button>
          </div>
        )}
      </Card>
    </>
  )
}
