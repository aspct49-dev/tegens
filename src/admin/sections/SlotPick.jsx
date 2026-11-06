import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost } from '../api'
import SlotReel from '../../components/SlotReel'
import SlotPicker from '../SlotPicker'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Input, SectionIntro, Toggle } from '../ui'
import './slotpick-admin.css'

// Random slot picker: roll from the whole catalog (optionally a few providers) or
// from your own list. The server picks, so /overlay/slots spins to the same slot.

const API = '/api/admin/slotpick'
const TOP_PROVIDERS = 12

const ago = (s) => {
  const m = Math.round((Date.now() / 1000 - s) / 60)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function SlotPickAdmin() {
  const [data, setData] = useState(null)
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [spinId, setSpinId] = useState(null) // the roll whose reel is spinning here

  useEffect(() => {
    apiGet(API)
      .then((d) => (setData(d), setSettings(d.settings)))
      .catch((err) => setError(err.message))
  }, [])

  const act = async (route, body = {}) => {
    setBusy(route)
    setError('')
    try {
      const d = await apiPost(`${API}/${route}`, body)
      setData(d)
      return d
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy('')
    }
  }

  if (!data || !settings) return error ? <ErrorLine>{error}</ErrorLine> : <span className="adm-spin adm-spin-inline" aria-label="Loading" />

  const set = (k) => (v) => setSettings((s) => ({ ...s, [k]: v }))
  const fromList = settings.source === 'list'
  const canRoll = !fromList || data.list.length > 0
  const draw = data.draw
  const spinning = Boolean(draw && spinId === draw.id)
  const roll = async () => {
    const d = await act('roll', settings)
    if (d?.draw) setSpinId(d.draw.id)
  }

  return (
    <>
      <SectionIntro>
        Roll a random slot for stream: from every slot, a few providers, or your own list. The <b>/overlay/slots</b> browser source spins
        to the same slot.
      </SectionIntro>

      <Card title="Roll a slot">
        <div className="sp-seg" role="radiogroup" aria-label="Pick from">
          {[
            { id: 'all', label: 'All slots' },
            { id: 'list', label: `My list · ${data.list.length}` },
          ].map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={settings.source === o.id}
              className={`sp-seg-item${settings.source === o.id ? ' is-on' : ''}`}
              onClick={() => set('source')(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>

        {!fromList && <Providers all={data.providers} chosen={settings.providers} onChange={set('providers')} />}

        <div className="sp-foot">
          <div className="sp-toggles">
            <Toggle checked={settings.noRepeats} onChange={set('noRepeats')} label="Skip slots already picked" />
            <Toggle checked={settings.announce} onChange={set('announce')} label="Bot posts the pick in chat" />
          </div>
          <Button kind="gold" busy={busy === 'roll'} disabled={busy !== '' || spinning || !canRoll} onClick={roll}>
            {spinning ? 'Spinning…' : 'Roll a slot'}
          </Button>
        </div>
        {fromList && !data.list.length && <p className="sp-note">Your list is empty. Add slots below first.</p>}
        <ErrorLine>{error}</ErrorLine>

        {draw && (
          <div className="sp-stage">
            <SlotReel key={`reel-${draw.id}`} draw={draw} play={spinning} onDone={() => setSpinId(null)} />
            {!spinning && <Result key={`pick-${draw.id}`} slot={draw.slot} at={draw.at} />}
          </div>
        )}
      </Card>

      <MyList list={data.list} act={act} busy={busy} />
      {/* the newest pick stays hidden until the reel lands on it */}
      <Recent history={spinning ? data.history.slice(1) : data.history} act={act} busy={busy} />
    </>
  )
}

// ---------------------------------------------------------------- providers

function Providers({ all, chosen, onChange }) {
  const [q, setQ] = useState('')
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all])
  const matches = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return []
    return all.filter((p) => !chosen.includes(p.id) && (p.name.toLowerCase().includes(k) || p.id.includes(k))).slice(0, 8)
  }, [q, all, chosen])
  const toggle = (id) => onChange(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id])
  const quick = all.slice(0, TOP_PROVIDERS).map((p) => p.id)
  const shown = [...quick, ...chosen.filter((id) => !quick.includes(id))]
  const total = (chosen.length ? chosen.map((id) => byId.get(id)) : all).reduce((n, p) => n + (p?.count ?? 0), 0)

  return (
    <div className="sp-prov">
      <div className="sp-prov-head">
        <span className="adm-field-label">Providers</span>
        <span className="sp-prov-count">
          {chosen.length ? `${chosen.length} chosen` : 'Any provider'} · {total.toLocaleString('en-US')} slots
        </span>
        {chosen.length > 0 && (
          <button type="button" className="sp-link" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
      <div className="sp-chips">
        {shown.map((id) => {
          const p = byId.get(id)
          if (!p) return null
          const on = chosen.includes(id)
          return (
            <button key={id} type="button" aria-pressed={on} className={`sp-chip${on ? ' is-on' : ''}`} onClick={() => toggle(id)}>
              {p.name}
              <span className="sp-chip-n">{p.count}</span>
            </button>
          )
        })}
      </div>
      <div className="sp-prov-search">
        <Input value={q} onChange={setQ} placeholder="Find another provider…" aria-label="Find a provider" />
        {matches.length > 0 && (
          <ul className="sp-prov-list">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => (toggle(p.id), setQ(''))}>
                  {p.name}
                  <span className="sp-chip-n">{p.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the pick

function Art({ slot, w, h }) {
  return slot.image ? (
    <img className="sp-art" src={slot.image} width={w} height={h} alt="" loading="lazy" />
  ) : (
    <span className="sp-art is-empty" style={{ width: w, height: h }} />
  )
}

function Result({ slot, at }) {
  return (
    <div className="sp-result">
      <Art slot={slot} w={72} h={96} />
      <div className="sp-result-text">
        <span className="sp-result-kicker">Picked {ago(at)}</span>
        <span className="sp-result-name">{slot.name}</span>
        {slot.provider && <span className="sp-result-prov">{slot.provider}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- my list

function MyList({ list, act, busy }) {
  return (
    <Card
      title={`My list · ${list.length}`}
      actions={
        list.length > 0 && (
          <ConfirmButton disabled={busy !== ''} confirmLabel="Empty the list?" onConfirm={() => act('list/clear')}>
            Clear list
          </ConfirmButton>
        )
      }
    >
      <div className="sp-add">
        <SlotPicker placeholder="Add a slot to your list…" onPick={(g) => act('list/add', { name: g.name, slug: g.slug, provider: g.provider, image: g.image })} />
      </div>
      {list.length === 0 ? (
        <Empty>Add the slots you want to roll between, e.g. viewer requests.</Empty>
      ) : (
        <ul className="sp-grid">
          {list.map((s) => (
            <li key={s.key} className="sp-tile">
              <Art slot={s} w={36} h={48} />
              <span className="sp-tile-text">
                <span className="sp-tile-name">{s.name}</span>
                {s.provider && <span className="sp-tile-prov">{s.provider}</span>}
              </span>
              <button type="button" className="sp-x" aria-label={`Remove ${s.name}`} disabled={busy !== ''} onClick={() => act('list/remove', { key: s.key })}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- recent

function Recent({ history, act, busy }) {
  if (!history.length) return null
  return (
    <Card
      title="Recent picks"
      actions={
        <ConfirmButton disabled={busy !== ''} confirmLabel="Clear the picks?" onConfirm={() => act('history/clear')}>
          Clear
        </ConfirmButton>
      }
    >
      <ul className="sp-recent">
        {history.map((h) => (
          <li key={h.id}>
            <Art slot={h} w={30} h={40} />
            <span className="sp-tile-name">{h.name}</span>
            <span className="sp-tile-prov">{h.provider}</span>
            <span className="sp-when">{ago(h.at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
